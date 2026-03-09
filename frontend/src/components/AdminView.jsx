/**
 * ADMIN VIEW v17 — Full Command Dashboard
 * ═══════════════════════════════════════════════════════════
 * FIXED: signals fetched from API, heatmap works, risk layer works
 * ADDED: City Risk Index, AI Dashboard tab, auto-alerts, location display
 * Charts: all with distinct colors, better visualization
 */
import { useState, useEffect, useCallback } from "react";
import {
  MapContainer, TileLayer, Marker, Popup, CircleMarker, Polyline, Tooltip as LTooltip
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend
} from "recharts";
import api        from "../services/api";
import socket     from "../services/socket";
import Dashboard  from "./Dashboard";
import VehicleManager from "./VehicleManager";
import WeatherPanel   from "./WeatherPanel";
import HeatmapLayer   from "./HeatmapLayer";
import LiveDashboard  from "./LiveDashboard";
import RiskLayer      from "./RiskLayer";
import { OperatorAlerts } from "./CommunityAlerts";
import UserManagement, { CreateUserModal } from "./UserManagement";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:"https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:"https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:"https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ── Constants ─────────────────────────────────────────────────
const TI  = { Medical:"🏥", Fire:"🔥", Accident:"💥", Crime:"🚔", Breakdown:"🔧", Flood:"🌊", "Gas Leak":"💨", Other:"⚠️" };
const PC  = { Critical:"#FF2050", High:"#FF8800", Medium:"#FFD600", Normal:"#00C8FF", Low:"#00E676" };
const TC  = { Medical:"#00AAFF", Fire:"#FF3322", Accident:"#FF8800", Crime:"#CC44FF", Breakdown:"#00CC88", Flood:"#0088FF", "Gas Leak":"#FFCC00", Other:"#667799" };
const VC  = { Ambulance:"🚑", FireTruck:"🚒", Police:"🚔", TowTruck:"🔧", HazMat:"☣️", FloodRescue:"🚤" };
const fmtSecs = s => s>3600?`${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`:s>60?`${Math.floor(s/60)}m ${s%60}s`:`${Math.round(s)}s`;
const locLine  = loc => { if(!loc) return "—"; const p=[loc.road||loc.address,loc.neighbourhood||loc.suburb||loc.area,loc.city].filter(Boolean); return p.length?p.join(", "):(loc.fullAddress||"—"); };
const locLine2 = loc => { if(!loc) return ""; return [loc.city,loc.state].filter(Boolean).join(", "); };
const coordStr = loc => loc?.lat!=null?`${parseFloat(loc.lat).toFixed(5)}, ${parseFloat(loc.lng).toFixed(5)}`:"—";

// Map incident type icon
function incidentIcon(type, priority) {
  const emoji = TI[type] || "⚠️";
  const color = PC[priority] || "#FF8800";
  return L.divIcon({
    className:"",
    html:`<div style="background:${color};width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);animation:${priority==='Critical'?'incident-flash 2s infinite':'none'}">${emoji}</div>`,
    iconSize:[32,32], iconAnchor:[16,16]
  });
}

function vehicleIcon(type, isLive) {
  const emoji = VC[type] || "🚗";
  return L.divIcon({
    className:"",
    html:`<div style="background:${isLive?"#FF8800":"#00C8FF"};width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${emoji}</div>`,
    iconSize:[28,28], iconAnchor:[14,14]
  });
}

// ── Main Component ─────────────────────────────────────────────
export default function AdminView({ weather, onReloadWeather, weatherLoading }) {
  const [tab,         setTab]         = useState("map");
  const [quickCreate,  setQuickCreate]  = useState(false);  // quick Operator create modal
  const [quickToast,   setQuickToast]   = useState("");      // success toast
  const [incidents,   setIncidents]   = useState([]);
  const [vehicles,    setVehicles]    = useState([]);
  const [signals,     setSignals]     = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [analytics,   setAnalytics]   = useState(null);
  const [vehiclePos,  setVehiclePos]  = useState({});
  const [vehicleRts,  setVehicleRts]  = useState({});
  const [loading,     setLoading]     = useState(true);
  const [liveCount,   setLiveCount]   = useState(0);
  const [mapFilter,   setMapFilter]   = useState("all");
  const [showLayers,  setShowLayers]  = useState({ heatmap:true, risk:true, signals:true, vehicles:true, routes:true });
  const [selectedInc, setSelectedInc] = useState(null);
  const [mapTile,     setMapTile]     = useState("street");
  // AI dashboard
  const [cityRisk,    setCityRisk]    = useState(null);
  const [autoAlerts,  setAutoAlerts]  = useState([]);
  const [vehHealth,   setVehHealth]   = useState(null);
  const [shiftScore,  setShiftScore]  = useState(null);
  const [aiLoading,   setAiLoading]   = useState(false);

  const TILE_URLS = {
    street: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    dark:   "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    topo:   "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    smooth: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  };

  const fetchAll = useCallback(async () => {
    try {
      const [em, v, sig, pred, an] = await Promise.all([
        api.get("/emergencies"),
        api.get("/vehicles"),
        api.get("/signals").catch(()=>({data:[]})),
        api.get("/predict-future").catch(()=>({data:[]})),
        api.get("/analytics").catch(()=>({data:{}})),
      ]);
      setIncidents(em.data||[]);
      setVehicles(v.data||[]);
      setSignals(sig.data||[]);
      setPredictions(pred.data||[]);
      setAnalytics(an.data||{});
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  const fetchAI = useCallback(async () => {
    setAiLoading(true);
    try {
      const [risk,alerts,health,shift] = await Promise.all([
        api.get("/ai/city-risk").catch(()=>({data:null})),
        api.get("/ai/auto-alerts").catch(()=>({data:{alerts:[]}})),
        api.get("/ai/vehicle-health").catch(()=>({data:null})),
        api.get("/ai/shift-score").catch(()=>({data:null})),
      ]);
      setCityRisk(risk.data); setAutoAlerts(alerts.data?.alerts||[]);
      setVehHealth(health.data); setShiftScore(shift.data);
    } finally { setAiLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); const t=setInterval(fetchAll,30000); return()=>clearInterval(t); }, [fetchAll]);
  useEffect(() => { if(tab==="ai") fetchAI(); }, [tab, fetchAI]);

  const showQuickToast = msg => {
    setQuickToast(msg);
    setTimeout(() => setQuickToast(""), 4000);
  };

  useEffect(() => {
    socket.on("signalUpdate", d => setSignals(p=>[...p.filter(s=>s.signalId!==d.signalId),d]));
    socket.on("vehicleLocationUpdate", ({vehicleId,lat,lng,heading,speedKmh,progressPct,remainingSec})=>{
      setVehiclePos(p=>({...p,[vehicleId]:{lat,lng,heading:heading||0,speedKmh:speedKmh||0,progressPct,remainingSec}}));
    });
    socket.on("emergencyDispatched", d=>{
      if(d.route?.geometry){ const vid=d.assignedVehicle?.vehicleId; if(vid) setVehicleRts(r=>({...r,[vid]:d.route.geometry})); }
      fetchAll();
    });
    socket.on("newEmergencyAlert",    ()=>{ setLiveCount(c=>c+1); fetchAll(); });
    socket.on("emergencyResolved",    fetchAll);
    socket.on("vehicleArrived",       fetchAll);
    socket.on("emergencyStatusUpdate",fetchAll);
    socket.on("vehicleOnScene",       fetchAll);
    return()=>["signalUpdate","vehicleLocationUpdate","emergencyDispatched","newEmergencyAlert","emergencyResolved","vehicleArrived","emergencyStatusUpdate","vehicleOnScene"].forEach(e=>socket.off(e));
  }, [fetchAll]);

  // Derived stats
  const active   = incidents.filter(e=>!["Resolved","Cancelled"].includes(e.status));
  const pending  = incidents.filter(e=>e.status==="Reported");
  const critical = incidents.filter(e=>e.priority==="Critical"&&!["Resolved","Cancelled"].includes(e.status));
  const availVeh = vehicles.filter(v=>v.status==="Available").length;
  const resolved24 = incidents.filter(e=>e.status==="Resolved"&&Date.now()-new Date(e.createdAt)<86400000).length;

  const displayInc = mapFilter==="active"?active:mapFilter==="critical"?critical:mapFilter==="pending"?pending:incidents;
  const defaultCenter = [22.7196, 75.8577];

  // Chart data with distinct colors
  const typeChartData = Object.entries(
    incidents.reduce((acc,e)=>{acc[e.type]=(acc[e.type]||0)+1;return acc;},{})
  ).map(([name,value])=>({name,value,fill:TC[name]||"#667799"}));

  const priorityChartData = Object.entries(
    incidents.reduce((acc,e)=>{acc[e.priority]=(acc[e.priority]||0)+1;return acc;},{})
  ).map(([name,value])=>({name,value,fill:PC[name]||"#667799"}));

  const statusChartData = [
    {name:"Reported",  value:pending.length,                                                        fill:"#FF2050"},
    {name:"En Route",  value:incidents.filter(e=>e.status==="En Route").length,                     fill:"#FF8800"},
    {name:"On Scene",  value:incidents.filter(e=>e.status==="On Scene").length,                     fill:"#00C8FF"},
    {name:"Resolved",  value:incidents.filter(e=>e.status==="Resolved").length,                     fill:"#00E676"},
    {name:"Cancelled", value:incidents.filter(e=>e.status==="Cancelled").length,                    fill:"#667799"},
  ].filter(d=>d.value>0);

  const vehicleChartData = [
    {name:"Available",   value:vehicles.filter(v=>v.status==="Available").length,   fill:"#00E676"},
    {name:"Assigned",    value:vehicles.filter(v=>v.status==="Assigned").length,    fill:"#FF8800"},
    {name:"Maintenance", value:vehicles.filter(v=>v.status==="Maintenance").length, fill:"#FFD600"},
  ].filter(d=>d.value>0);

  const hourlyData = analytics?.hourlyTrend || [];
  const dailyData  = analytics?.dailyTrends || [];

  const signalStateData = signals.length ? [
    {name:"GREEN",  value:signals.filter(s=>s.state==="GREEN").length,  fill:"#00E676"},
    {name:"YELLOW", value:signals.filter(s=>s.state==="YELLOW").length, fill:"#FFD600"},
    {name:"RED",    value:signals.filter(s=>s.state==="RED").length,    fill:"#FF2050"},
  ].filter(d=>d.value>0) : [];

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:300, gap:16 }}>
      <div style={{ fontSize:36 }}>⏳</div>
      <div style={{ fontFamily:"var(--font-display)", fontSize:18 }}>Loading command centre…</div>
    </div>
  );

  return (
    <div>
      {/* ── COMMAND CENTER HEADER ── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
        marginBottom:20, paddingBottom:16, borderBottom:"1px solid var(--border)" }}>
        <div>
          <div style={{ fontFamily:"var(--font-display)", fontWeight:900, fontSize:28,
            background:"linear-gradient(135deg,#00c8ff,#00e676)", WebkitBackgroundClip:"text",
            WebkitTextFillColor:"transparent", letterSpacing:"-0.5px" }}>
            🏙 SMART EMERGENCY COMMAND CENTER
          </div>
          <div style={{ fontSize:12, color:"var(--text-muted)", marginTop:3, display:"flex", gap:16 }}>
            <span>📍 Indore, Madhya Pradesh</span>
            <span>🕐 {new Date().toLocaleString("en-IN",{weekday:"short",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</span>
            <span style={{ color:"var(--green)", fontWeight:600 }}>● System Online</span>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchAll}>🔄 Refresh</button>
      </div>

      {/* ── KPI Bar ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:10, marginBottom:16 }}>
        {[
          { label:"🚨 Active",       val:active.length,     color:active.length>3?"#FF2050":"#00E676",  bg:"rgba(255,32,80,0.08)" },
          { label:"⏳ Pending",      val:pending.length,    color:pending.length>0?"#FF2050":"#00E676",  bg:"rgba(255,32,80,0.06)" },
          { label:"🔴 Critical",     val:critical.length,   color:critical.length>0?"#FF2050":"#00E676", bg:"rgba(255,32,80,0.06)" },
          { label:"🚗 Available",    val:availVeh,          color:availVeh>2?"#00E676":availVeh>0?"#FFD600":"#FF2050", bg:"rgba(0,230,118,0.06)" },
          { label:"✅ Resolved/24h", val:resolved24,        color:"#00E676",  bg:"rgba(0,230,118,0.06)" },
          { label:"🔮 Risk Zones",   val:predictions.filter(p=>p.riskLevel==="High").length, color:"#FF8800", bg:"rgba(255,136,0,0.06)" },
        ].map(m=>(
          <div key={m.label} style={{ background:m.bg, border:`1px solid ${m.color}33`, borderRadius:12, padding:"12px 14px", textAlign:"center" }}>
            <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:4 }}>{m.label}</div>
            <div style={{ fontFamily:"var(--font-display)", fontWeight:900, fontSize:28, color:m.color }}>{m.val}</div>
          </div>
        ))}
      </div>

      {liveCount>0&&(
        <div style={{ background:"rgba(255,32,80,0.1)", border:"1px solid #FF2050", borderRadius:10, padding:"10px 16px", marginBottom:14, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ color:"#FF2050", fontFamily:"var(--font-display)", fontWeight:700 }}>⚡ {liveCount} new incident{liveCount>1?"s":""} since refresh</span>
          <button className="btn btn-ghost btn-sm" onClick={()=>setLiveCount(0)}>Dismiss</button>
        </div>
      )}

      {/* ── Quick Create Operator Modal ── */}
      {quickCreate && (
        <CreateUserModal
          onClose={() => setQuickCreate(false)}
          onCreated={msg => { showQuickToast("✅ " + msg); setQuickCreate(false); }}
        />
      )}

      {/* ── Quick Toast ── */}
      {quickToast && (
        <div style={{
          position:"fixed", top:20, right:20, zIndex:2000,
          padding:"12px 20px", borderRadius:"var(--radius-md)",
          background:"var(--green-dim)", border:"1px solid var(--green)",
          color:"var(--green)", fontSize:13, fontWeight:600,
          boxShadow:"0 4px 24px rgba(0,230,118,0.2)",
          display:"flex", alignItems:"center", gap:10,
        }}>
          {quickToast}
          <button onClick={() => setQuickToast("")}
            style={{ background:"none", border:"none", cursor:"pointer",
              color:"var(--green)", fontSize:16, lineHeight:1 }}>✕</button>
        </div>
      )}

      {/* ── Tab Bar ── */}
      <div className="tab-bar mb-20" style={{ display:"flex", alignItems:"center", flexWrap:"wrap", gap:6 }}>
        {[
          ["map",       "🗺 Live Map"],
          ["incidents", "📋 Incidents"],
          ["analytics", "📊 Analytics"],
          ["reports",   "📋 Reports"],
          ["aiml",      "🔮 AI / ML"],
          ["ai",        "🧠 AI Dashboard"],
          ["fleet",     "🚗 Fleet"],
          ["alerts",    "🔔 Alerts"],
          ["weather",   "🌤 Weather"],
          ["live",      "⚡ Live Ops"],
          ["users",     "👥 Users"],
        ].map(([id,label])=>(
          <button key={id} className={`tab-btn ${tab===id?"active":""}`} onClick={()=>setTab(id)}>
            {label}
            {id==="incidents"&&pending.length>0&&(
              <span style={{ display:"inline-flex",width:16,height:16,borderRadius:"50%",background:"#FF2050",color:"#fff",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,marginLeft:5 }}>{pending.length}</span>
            )}
          </button>
        ))}

        {/* ── Quick Create Operator Button (always visible in tab bar) ── */}
        <button
          onClick={() => setQuickCreate(true)}
          style={{
            marginLeft:"auto",
            padding:"7px 16px",
            borderRadius:"var(--radius-md)",
            border:"2px solid var(--orange)",
            background:"rgba(255,136,0,0.12)",
            color:"var(--orange)",
            cursor:"pointer",
            fontFamily:"var(--font-display)",
            fontWeight:700,
            fontSize:12,
            display:"flex",
            alignItems:"center",
            gap:6,
            whiteSpace:"nowrap",
            transition:"all 0.2s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "rgba(255,136,0,0.25)";
            e.currentTarget.style.transform  = "scale(1.03)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "rgba(255,136,0,0.12)";
            e.currentTarget.style.transform  = "scale(1)";
          }}
          title="Create a new Operator account"
        >
          <span style={{ fontSize:16 }}>➕</span>
          Create Operator
        </button>
      </div>

      {/* ══ MAP TAB — fully working ══ */}
      {tab==="users"&&<UserManagement/>}

      {tab==="map"&&(
        <div>
          {/* Controls row */}
          <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap", alignItems:"center" }}>
            {/* Layer toggles */}
            {[
              ["heatmap","🌡 Heatmap"],
              ["risk","🔮 Risk Zones"],
              ["signals","🚦 Signals"],
              ["vehicles","🚗 Vehicles"],
              ["routes","🛣 Routes"],
            ].map(([key,label])=>(
              <button key={key} className={`btn btn-sm ${showLayers[key]?"btn-primary":"btn-ghost"}`}
                onClick={()=>setShowLayers(l=>({...l,[key]:!l[key]}))}>
                {label}
              </button>
            ))}
            {/* Tile layer */}
            <select value={mapTile} onChange={e=>setMapTile(e.target.value)}
              style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:8, padding:"4px 10px", color:"var(--text-primary)", fontSize:12 }}>
              <option value="street">🗺 Street</option>
              <option value="dark">🌑 Dark</option>
              <option value="smooth">🎨 Smooth</option>
              <option value="topo">🏔 Topo</option>
            </select>
            {/* Filter */}
            <select value={mapFilter} onChange={e=>setMapFilter(e.target.value)}
              style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:8, padding:"4px 10px", color:"var(--text-primary)", fontSize:12 }}>
              <option value="all">All incidents</option>
              <option value="active">Active only</option>
              <option value="critical">Critical only</option>
              <option value="pending">Pending only</option>
            </select>
            <span style={{ marginLeft:"auto", fontSize:12, color:"var(--text-muted)" }}>
              Showing {displayInc.length} incidents · {signals.length} signals · {predictions.length} risk zones
            </span>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 310px", gap:16 }}>
            {/* MAP */}
            <div style={{ height:570, borderRadius:14, overflow:"hidden", border:"1px solid var(--border)" }}>
              <MapContainer center={defaultCenter} zoom={12} style={{ height:"100%", width:"100%" }}>
                <TileLayer url={TILE_URLS[mapTile]} attribution="© OpenStreetMap"/>

                {/* Heatmap layer */}
                {showLayers.heatmap && <HeatmapLayer incidents={displayInc}/>}

                {/* Risk prediction zones */}
                {showLayers.risk && <RiskLayer predictions={predictions}/>}

                {/* Incident markers */}
                {displayInc.filter(e=>e.location?.lat).map(e=>(
                  <Marker key={e._id} position={[e.location.lat,e.location.lng]} icon={incidentIcon(e.type,e.priority)}>
                    <Popup>
                      <div style={{ minWidth:200, fontFamily:"system-ui", fontSize:13 }}>
                        <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>{TI[e.type]} {e.type}</div>
                        <div style={{ color:"#0088cc", marginBottom:2 }}>📍 {locLine(e.location)}</div>
                        {locLine2(e.location)&&<div style={{ color:"#666", fontSize:12 }}>🌆 {locLine2(e.location)}</div>}
                        <div style={{ fontFamily:"monospace", fontSize:10, color:"#999", marginTop:2 }}>🌐 {coordStr(e.location)}</div>
                        <div style={{ marginTop:6, display:"flex", gap:6 }}>
                          <span style={{ background:PC[e.priority]+"33", color:PC[e.priority], border:`1px solid ${PC[e.priority]}`, borderRadius:12, padding:"1px 8px", fontSize:11 }}>{e.priority}</span>
                          <span style={{ background:"#eee", borderRadius:12, padding:"1px 8px", fontSize:11 }}>{e.status}</span>
                        </div>
                        {e.reporterPhone&&<div style={{ marginTop:4, fontSize:12 }}>📞 {e.reporterPhone}</div>}
                        {e.aiRecommendation&&<div style={{ marginTop:5, fontSize:11, color:"#0066cc", fontStyle:"italic" }}>💡 {e.aiRecommendation.slice(0,80)}…</div>}
                        {e.assignedVehicles?.length>0&&<div style={{ marginTop:4, fontSize:11 }}>🚑 {e.assignedVehicles.join(", ")}</div>}
                      </div>
                    </Popup>
                  </Marker>
                ))}

                {/* Vehicle markers */}
                {showLayers.vehicles && vehicles.filter(v=>vehiclePos[v.vehicleId]||v.location?.lat).map(v=>{
                  const pos = vehiclePos[v.vehicleId] || v.location;
                  if (!pos?.lat) return null;
                  const isLive = !!vehiclePos[v.vehicleId];
                  return (
                    <Marker key={v.vehicleId} position={[pos.lat,pos.lng]} icon={vehicleIcon(v.type,isLive)}>
                      <Popup>
                        <div style={{ fontFamily:"system-ui", fontSize:13 }}>
                          <div style={{ fontWeight:700 }}>{VC[v.type]||"🚗"} {v.name||v.vehicleId}</div>
                          <div>Status: <b>{v.status}</b></div>
                          <div>Type: {v.type} · Fuel: {v.batteryLevel??v.fuelLevel??100}%</div>
                          {isLive&&<div style={{ color:"#FF8800", fontWeight:700 }}>● LIVE {vehiclePos[v.vehicleId].speedKmh} km/h</div>}
                          {vehiclePos[v.vehicleId]?.progressPct!=null&&<div>Progress: {vehiclePos[v.vehicleId].progressPct}%</div>}
                          {vehiclePos[v.vehicleId]?.remainingSec&&<div>ETA: {fmtSecs(vehiclePos[v.vehicleId].remainingSec)}</div>}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}

                {/* Vehicle routes */}
                {showLayers.routes && Object.entries(vehicleRts).map(([vid,route])=>(
                  route?.length>1 && (
                    <Polyline key={`rt-${vid}`}
                      positions={route.map(c=>Array.isArray(c)?[c[1],c[0]]:[c.lat||c[1],c.lng||c[0]])}
                      pathOptions={{ color:"#00C8FF", weight:3, opacity:0.7, dashArray:"6,4" }}/>
                  )
                ))}

                {/* Traffic signals */}
                {showLayers.signals && signals.filter(s=>s.location?.lat).map(s=>{
                  const col = s.state==="GREEN"?"#00E676":s.state==="YELLOW"?"#FFD600":"#FF2050";
                  return (
                    <CircleMarker key={s.signalId} center={[s.location.lat,s.location.lng]}
                      radius={8} pathOptions={{ color:col, fillColor:col, fillOpacity:0.85, weight:2 }}>
                      <LTooltip>🚦 {s.signalId} — {s.state}{s.emergencyOverrideBy?` (Override: ${s.emergencyOverrideBy})`:""}</LTooltip>
                    </CircleMarker>
                  );
                })}
              </MapContainer>
            </div>

            {/* Sidebar */}
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {/* Active incidents list */}
              <div style={{ background:"var(--bg-card)", borderRadius:12, padding:"12px 14px", border:"1px solid var(--border)" }}>
                <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:13, marginBottom:10 }}>
                  📋 Active Incidents <span style={{ color:"var(--text-muted)", fontWeight:400 }}>({active.length})</span>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:280, overflowY:"auto" }}>
                  {active.length===0&&(
                    <div style={{ textAlign:"center", padding:20, color:"var(--text-muted)" }}>
                      <div style={{ fontSize:24 }}>✅</div><div>All clear</div>
                    </div>
                  )}
                  {active.map(e=>(
                    <div key={e._id} onClick={()=>setSelectedInc(selectedInc?._id===e._id?null:e)}
                      style={{ padding:"8px 10px", background:"var(--bg-elevated)", borderRadius:8,
                        borderLeft:`3px solid ${PC[e.priority]||"var(--border)"}`,
                        cursor:"pointer", border:`1px solid ${selectedInc?._id===e._id?"var(--accent)":"var(--border)"}` }}>
                      <div style={{ fontWeight:700, fontSize:12 }}>{TI[e.type]} {e.type}</div>
                      <div style={{ fontSize:11, color:"var(--accent)", marginTop:1 }}>📍 {locLine(e.location)}</div>
                      {locLine2(e.location)&&<div style={{ fontSize:10, color:"var(--text-muted)" }}>🌆 {locLine2(e.location)}</div>}
                      <div style={{ fontSize:10, fontFamily:"monospace", color:"var(--text-dim)", marginTop:1 }}>🌐 {coordStr(e.location)}</div>
                      <div style={{ display:"flex", gap:5, marginTop:4 }}>
                        <span style={{ fontSize:10, padding:"1px 6px", borderRadius:10, background:PC[e.priority]+"22", color:PC[e.priority], border:`1px solid ${PC[e.priority]}44` }}>{e.priority}</span>
                        <span style={{ fontSize:10, padding:"1px 6px", borderRadius:10, background:"var(--bg-card)", color:"var(--text-muted)", border:"1px solid var(--border)" }}>{e.status}</span>
                      </div>
                      {e.aiRecommendation&&(
                        <div style={{ marginTop:4, fontSize:10, color:"var(--accent)", fontStyle:"italic", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>💡 {e.aiRecommendation}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Signal status */}
              {signals.length>0&&(
                <div style={{ background:"var(--bg-card)", borderRadius:12, padding:"12px 14px", border:"1px solid var(--border)" }}>
                  <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:13, marginBottom:8 }}>🚦 Signal Status</div>
                  <div style={{ display:"flex", gap:8 }}>
                    {[["GREEN","#00E676"],["YELLOW","#FFD600"],["RED","#FF2050"]].map(([state,col])=>(
                      <div key={state} style={{ flex:1, textAlign:"center", padding:"8px", background:`${col}22`, borderRadius:8, border:`1px solid ${col}44` }}>
                        <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:20, color:col }}>{signals.filter(s=>s.state===state).length}</div>
                        <div style={{ fontSize:10, color:"var(--text-muted)" }}>{state}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:4, maxHeight:100, overflowY:"auto" }}>
                    {signals.filter(s=>s.emergencyOverrideBy).map(s=>(
                      <div key={s.signalId} style={{ fontSize:10, color:"var(--orange)", padding:"2px 6px", background:"rgba(255,136,0,0.1)", borderRadius:4 }}>
                        🚦 {s.signalId} → OVERRIDE by {s.emergencyOverrideBy}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Predictions */}
              {predictions.length>0&&(
                <div style={{ background:"var(--bg-card)", borderRadius:12, padding:"12px 14px", border:"1px solid var(--border)" }}>
                  <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:13, marginBottom:8 }}>🔮 Risk Predictions</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:5, maxHeight:180, overflowY:"auto" }}>
                    {predictions.slice(0,6).map((p,i)=>(
                      <div key={i} style={{ padding:"7px 10px", background:"var(--bg-elevated)", borderRadius:8,
                        borderLeft:`3px solid ${p.riskLevel==="High"?"#FF2050":p.riskLevel==="Medium"?"#FF8800":"#FFD600"}` }}>
                        <div style={{ fontWeight:700, fontSize:12, color:p.riskLevel==="High"?"#FF2050":p.riskLevel==="Medium"?"#FF8800":"#FFD600" }}>
                          {p.riskLevel} — {p.predictedEmergency}
                        </div>
                        <div style={{ fontSize:10, color:"var(--text-muted)", marginTop:2 }}>
                          {p.probability}% · Peak {p.peakHour}:00 · {p.historicalCases} cases
                        </div>
                        {p.alertNow&&<div style={{ fontSize:10, color:"#FF2050", fontWeight:700, marginTop:1 }}>⚡ ALERT NOW</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ INCIDENTS TAB ══ */}
      {tab==="incidents"&&(
        <div>
          <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
            {[["all","All",incidents.length],["active","Active",active.length],["pending","Pending",pending.length],["critical","Critical",critical.length],["resolved","Resolved",incidents.filter(e=>e.status==="Resolved").length]].map(([f,label,count])=>(
              <button key={f} className={`btn btn-sm ${mapFilter===f?"btn-primary":"btn-ghost"}`} onClick={()=>setMapFilter(f)}>
                {label} <span style={{ opacity:0.6 }}>({count})</span>
              </button>
            ))}
            <button className="btn btn-ghost btn-sm" style={{ marginLeft:"auto" }} onClick={fetchAll}>🔄 Refresh</button>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {displayInc.map(e=>(
              <div key={e._id} style={{ background:"var(--bg-card)", borderRadius:14, padding:"14px 16px",
                border:"1px solid var(--border)", borderLeft:`4px solid ${PC[e.priority]||"var(--border)"}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:15 }}>{TI[e.type]||"⚠️"} {e.type} Emergency</div>
                    {/* Full address display */}
                    <div style={{ fontSize:13, color:"var(--accent)", marginTop:3, fontWeight:600 }}>📍 {locLine(e.location)}</div>
                    {locLine2(e.location)&&<div style={{ fontSize:12, color:"var(--text-muted)", marginTop:1 }}>🌆 {locLine2(e.location)}</div>}
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-dim)", marginTop:1 }}>🌐 {coordStr(e.location)}</div>
                    {(e.reporterName||e.reporterPhone)&&(
                      <div style={{ fontSize:12, color:"var(--text-muted)", marginTop:4, display:"flex", gap:12 }}>
                        {e.reporterName&&<span>👤 {e.reporterName}</span>}
                        {e.reporterPhone&&<a href={`tel:${e.reporterPhone}`} style={{ color:"var(--green)", fontWeight:700, textDecoration:"none" }}>📞 {e.reporterPhone}</a>}
                      </div>
                    )}
                    <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:3, display:"flex", gap:12, flexWrap:"wrap" }}>
                      <span>🕐 {new Date(e.createdAt).toLocaleString()}</span>
                      {e.assignedVehicle&&<span>🚑 {e.assignedVehicle}</span>}
                      {e.responseTime>0&&<span>⏱ {fmtSecs(e.responseTime)}</span>}
                      {e.carbonSaved>0&&<span style={{ color:"var(--green)" }}>🌱 {e.carbonSaved}kg CO₂</span>}
                    </div>
                    {e.assignedVehicles?.length>0&&(
                      <div style={{ marginTop:5, display:"flex", gap:5, flexWrap:"wrap" }}>
                        {e.assignedVehicles.map(vid=>(
                          <span key={vid} style={{ fontSize:10, padding:"2px 8px", borderRadius:12, background:"var(--accent-dim)", border:"1px solid rgba(0,200,255,0.3)", color:"var(--accent)" }}>
                            🚑 {vid}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:4, alignItems:"flex-end" }}>
                    <span style={{ padding:"2px 10px", borderRadius:12, background:PC[e.priority]+"22", color:PC[e.priority], border:`1px solid ${PC[e.priority]}44`, fontSize:12, fontWeight:700 }}>{e.priority}</span>
                    <span style={{ padding:"2px 10px", borderRadius:12, background:"var(--bg-elevated)", color:"var(--text-secondary)", border:"1px solid var(--border)", fontSize:11 }}>{e.status}</span>
                  </div>
                </div>
                {e.aiRecommendation&&(
                  <div style={{ marginTop:8, padding:"7px 10px", background:"rgba(0,200,255,0.06)", border:"1px solid rgba(0,200,255,0.2)", borderRadius:8, fontSize:12, color:"var(--accent)" }}>
                    💡 <b>AI:</b> {e.aiRecommendation}
                  </div>
                )}
                {e.mlTags?.length>0&&(
                  <div style={{ marginTop:5, display:"flex", gap:5, flexWrap:"wrap" }}>
                    {e.mlTags.map(t=><span key={t} style={{ fontSize:10, padding:"1px 7px", borderRadius:10, background:"rgba(255,214,0,0.1)", border:"1px solid rgba(255,214,0,0.3)", color:"#FFD600" }}>{t}</span>)}
                  </div>
                )}
              </div>
            ))}
            {displayInc.length===0&&<div style={{ textAlign:"center", padding:60, color:"var(--text-muted)" }}>No incidents found</div>}
          </div>
        </div>
      )}

      {/* ══ ANALYTICS TAB ══ */}
      {tab==="analytics"&&(
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {/* Charts row 1 */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
            {/* Emergency Types - colored bars */}
            <div style={{ background:"var(--bg-card)", borderRadius:14, padding:"14px 16px", border:"1px solid var(--border)" }}>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:13, marginBottom:12, color:"#00C8FF" }}>🏷 Emergency Types</div>
              <div style={{ height:180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={typeChartData} margin={{top:5,right:5,bottom:20,left:-15}}>
                    <XAxis dataKey="name" tick={{fontSize:9,fill:"var(--text-muted)"}} angle={-30} textAnchor="end"/>
                    <YAxis tick={{fontSize:9,fill:"var(--text-muted)"}}/>
                    <RTooltip contentStyle={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:8,fontSize:12}}/>
                    <Bar dataKey="value" radius={[4,4,0,0]}>
                      {typeChartData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Priority breakdown - donut */}
            <div style={{ background:"var(--bg-card)", borderRadius:14, padding:"14px 16px", border:"1px solid var(--border)" }}>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:13, marginBottom:12, color:"#FF8800" }}>🎯 Priority Breakdown</div>
              <div style={{ height:180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={priorityChartData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                      {priorityChartData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                    </Pie>
                    <RTooltip contentStyle={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:8,fontSize:12}}/>
                    <Legend iconType="circle" wrapperStyle={{fontSize:10}}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Status distribution */}
            <div style={{ background:"var(--bg-card)", borderRadius:14, padding:"14px 16px", border:"1px solid var(--border)" }}>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:13, marginBottom:12, color:"#00E676" }}>📊 Status Distribution</div>
              <div style={{ height:180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusChartData} cx="50%" cy="50%" outerRadius={75} paddingAngle={2} dataKey="value">
                      {statusChartData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                    </Pie>
                    <RTooltip contentStyle={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:8,fontSize:12}}/>
                    <Legend iconType="circle" wrapperStyle={{fontSize:10}}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Charts row 2 */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            {/* Vehicle fleet status */}
            <div style={{ background:"var(--bg-card)", borderRadius:14, padding:"14px 16px", border:"1px solid var(--border)" }}>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:13, marginBottom:12, color:"#FFD600" }}>🚗 Fleet Status</div>
              <div style={{ height:180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={vehicleChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                      {vehicleChartData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                    </Pie>
                    <RTooltip contentStyle={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:8,fontSize:12}}/>
                    <Legend iconType="circle" wrapperStyle={{fontSize:10}}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Signal states */}
            <div style={{ background:"var(--bg-card)", borderRadius:14, padding:"14px 16px", border:"1px solid var(--border)" }}>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:13, marginBottom:12, color:"var(--text-secondary)" }}>🚦 Signal States</div>
              {signalStateData.length>0?(
                <div style={{ height:180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={signalStateData} margin={{top:5,right:5,bottom:5,left:-15}}>
                      <XAxis dataKey="name" tick={{fontSize:11,fill:"var(--text-muted)"}}/>
                      <YAxis tick={{fontSize:9,fill:"var(--text-muted)"}}/>
                      <RTooltip contentStyle={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:8,fontSize:12}}/>
                      <Bar dataKey="value" radius={[6,6,0,0]}>
                        {signalStateData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ):(
                <div style={{ height:180, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-muted)", fontSize:13 }}>
                  No signal data — signals appear after dispatch
                </div>
              )}
            </div>
          </div>

          {/* Daily trend chart */}
          {dailyData?.length>0&&(
            <div style={{ background:"var(--bg-card)", borderRadius:14, padding:"14px 16px", border:"1px solid var(--border)" }}>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:13, marginBottom:12, color:"#CC44FF" }}>📈 14-Day Trend</div>
              <div style={{ height:200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyData} margin={{top:5,right:10,bottom:5,left:-15}}>
                    <defs>
                      <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#CC44FF" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#CC44FF" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5}/>
                    <XAxis dataKey="date" tick={{fontSize:9,fill:"var(--text-muted)"}}/>
                    <YAxis tick={{fontSize:9,fill:"var(--text-muted)"}}/>
                    <RTooltip contentStyle={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:8,fontSize:12}}/>
                    <Area type="monotone" dataKey="count" stroke="#CC44FF" fill="url(#trendGrad)" strokeWidth={2}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}


        </div>
      )}

      {/* ══ AI/ML TAB ══ */}
      {tab==="aiml"&&(
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {/* AI Recommendations active */}
          {incidents.filter(e=>e.aiRecommendation&&!["Resolved","Cancelled"].includes(e.status)).length>0&&(
            <div style={{ background:"var(--bg-card)", borderRadius:14, padding:"14px 16px", border:"1px solid rgba(0,200,255,0.2)" }}>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:14, marginBottom:12, color:"var(--accent)" }}>💡 Active AI Recommendations</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {incidents.filter(e=>e.aiRecommendation&&!["Resolved","Cancelled"].includes(e.status)).slice(0,6).map(e=>(
                  <div key={e._id} style={{ display:"flex", gap:12, padding:"10px 14px", background:"rgba(0,200,255,0.05)", border:"1px solid rgba(0,200,255,0.15)", borderRadius:10 }}>
                    <span style={{ fontSize:22 }}>{TI[e.type]||"⚠️"}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:13 }}>{e.type} — {locLine(e.location)}</div>
                      {locLine2(e.location)&&<div style={{ fontSize:11, color:"var(--text-muted)" }}>{locLine2(e.location)}</div>}
                      <div style={{ fontFamily:"monospace", fontSize:10, color:"var(--text-dim)" }}>{coordStr(e.location)}</div>
                      <div style={{ fontSize:12, color:"var(--accent)", marginTop:4 }}>{e.aiRecommendation}</div>
                      <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>Priority: {e.priority} · Severity: {e.severityScore}/100</div>
                    </div>
                    <span style={{ padding:"2px 10px", borderRadius:12, background:PC[e.priority]+"22", color:PC[e.priority], border:`1px solid ${PC[e.priority]}44`, fontSize:11, height:"fit-content" }}>{e.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prediction zones */}
          <div style={{ background:"var(--bg-card)", borderRadius:14, padding:"14px 16px", border:"1px solid var(--border)" }}>
            <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:14, marginBottom:14 }}>🔮 ML Risk Predictions</div>
            {predictions.length===0?(
              <div style={{ textAlign:"center", padding:40, color:"var(--text-muted)" }}>
                <div style={{ fontSize:36 }}>🔮</div>
                <div style={{ marginTop:8 }}>No predictions yet — need ≥2 incidents in DB</div>
              </div>
            ):(
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {predictions.map((p,i)=>(
                  <div key={i} style={{ background:"var(--bg-elevated)", borderRadius:10, padding:"12px 16px",
                    borderLeft:`3px solid ${p.riskLevel==="High"?"#FF2050":p.riskLevel==="Medium"?"#FF8800":"#FFD600"}`,
                    display:"flex", gap:16, alignItems:"flex-start" }}>
                    <div style={{ textAlign:"center", minWidth:64 }}>
                      <div style={{ fontFamily:"var(--font-display)", fontWeight:900, fontSize:26,
                        color:p.riskLevel==="High"?"#FF2050":p.riskLevel==="Medium"?"#FF8800":"#FFD600" }}>{p.probability}%</div>
                      <div style={{ fontSize:10, color:"var(--text-muted)" }}>probability</div>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:14, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                        {TI[p.predictedEmergency]||"⚠️"} {p.predictedEmergency}
                        <span style={{ padding:"1px 8px", borderRadius:12, background:`${p.riskLevel==="High"?"#FF2050":p.riskLevel==="Medium"?"#FF8800":"#FFD600"}22`,
                          color:p.riskLevel==="High"?"#FF2050":p.riskLevel==="Medium"?"#FF8800":"#FFD600",
                          border:`1px solid ${p.riskLevel==="High"?"#FF2050":p.riskLevel==="Medium"?"#FF8800":"#FFD600"}44`,
                          fontSize:10, fontWeight:700 }}>{p.riskLevel}</span>
                        {p.alertNow&&<span style={{ padding:"1px 8px", borderRadius:12, background:"rgba(255,32,80,0.15)", color:"#FF2050", border:"1px solid rgba(255,32,80,0.4)", fontSize:10, fontWeight:700 }}>⚡ NOW</span>}
                      </div>
                      <div style={{ fontSize:12, color:"var(--text-muted)", marginTop:4, display:"flex", gap:10, flexWrap:"wrap" }}>
                        <span>📍 {p.lat?.toFixed(4)}, {p.lng?.toFixed(4)}</span>
                        <span>🕐 Peak: {p.peakHour}:00 on {p.peakDay}s</span>
                        <span>📊 {p.historicalCases} cases · {p.recentCases} recent</span>
                      </div>
                      <div style={{ fontSize:11, color:"var(--accent)", marginTop:4, fontStyle:"italic" }}>💡 {p.recommendation}</div>
                      {p.hourlyPattern?.length>0&&(
                        <div style={{ display:"flex", gap:1, marginTop:8, alignItems:"flex-end", height:20 }}>
                          {p.hourlyPattern.map((v,h)=>(
                            <div key={h} style={{ width:8, background:h===p.peakHour?"#FF2050":v>50?"#FF8800":"var(--bg-card)",
                              height:`${Math.max(3,v*0.2)}px`, borderRadius:1 }}/>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign:"center", minWidth:52 }}>
                      <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:16, color:"var(--accent)" }}>{p.recentCases}</div>
                      <div style={{ fontSize:10, color:"var(--text-muted)" }}>last 7d</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Anomaly detection */}
          {analytics?.anomalies?.count>0&&(
            <div style={{ background:"var(--bg-card)", borderRadius:14, padding:"14px 16px", border:"1px solid var(--border)" }}>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:14, marginBottom:12 }}>⚡ Response Time Anomalies</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {(analytics.anomalies?.items||[]).map((a,i)=>(
                  <div key={i} style={{ background:a.direction==="slow"?"rgba(255,32,80,0.06)":"rgba(0,230,118,0.06)",
                    borderRadius:10, padding:"10px 14px",
                    border:`1px solid ${a.direction==="slow"?"rgba(255,32,80,0.25)":"rgba(0,230,118,0.25)"}`,
                    display:"flex", gap:12, alignItems:"center" }}>
                    <span style={{ fontSize:22 }}>{a.direction==="slow"?"🐢":"⚡"}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:13 }}>{a.type} — {a.direction==="slow"?"SLOW":"FAST"} Response</div>
                      <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>Time: {fmtSecs(a.responseTime)} · Z: {a.zScore?.toFixed(2)}</div>
                    </div>
                    <span style={{ padding:"2px 10px", borderRadius:12, background:a.direction==="slow"?"rgba(255,32,80,0.15)":"rgba(0,230,118,0.15)",
                      color:a.direction==="slow"?"#FF2050":"#00E676", border:`1px solid ${a.direction==="slow"?"rgba(255,32,80,0.4)":"rgba(0,230,118,0.4)"}`, fontSize:11, fontWeight:700 }}>
                      {a.direction.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hot zones */}
          {analytics?.hotZones?.length>0&&(
            <div style={{ background:"var(--bg-card)", borderRadius:14, padding:"14px 16px", border:"1px solid var(--border)" }}>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:14, marginBottom:12 }}>🔥 Hot Zones</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                {analytics.hotZones.slice(0,9).map((z,i)=>(
                  <div key={i} style={{ background:"var(--bg-elevated)", borderRadius:10, padding:12,
                    border:`1px solid ${z.riskMultiplier>=3?"rgba(255,32,80,0.3)":z.riskMultiplier>=2?"rgba(255,136,0,0.2)":"var(--border)"}` }}>
                    <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:22,
                      color:z.riskMultiplier>=3?"#FF2050":z.riskMultiplier>=2?"#FF8800":"#FFD600" }}>
                      {z.count}
                    </div>
                    <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>📍 {z.lat?.toFixed(3)}, {z.lng?.toFixed(3)}</div>
                    <div style={{ fontSize:12, marginTop:4 }}>{TI[z.dominantType]||"⚠️"} {z.dominantType}</div>
                    <div style={{ fontSize:10, color:z.riskMultiplier>=3?"#FF2050":"var(--text-muted)", marginTop:2 }}>Risk ×{z.riskMultiplier}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ AI DASHBOARD TAB ══ */}
      {tab==="ai"&&(
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div style={{ display:"flex", gap:8 }}>
            <button className="btn btn-primary btn-sm" onClick={fetchAI} disabled={aiLoading}>{aiLoading?"⏳ Loading…":"🔄 Refresh AI Data"}</button>
          </div>

          {/* City Risk Index */}
          {cityRisk&&(
            <div style={{ background:"var(--bg-card)", borderRadius:14, padding:"18px 20px", border:`1px solid ${cityRisk.color}44`, borderLeft:`4px solid ${cityRisk.color}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <div>
                  <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:16 }}>🌐 City-Wide Risk Index</div>
                  <div style={{ fontSize:13, color:"var(--text-muted)", marginTop:2 }}>{cityRisk.recommendation}</div>
                </div>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontFamily:"var(--font-display)", fontWeight:900, fontSize:48, color:cityRisk.color, lineHeight:1 }}>{cityRisk.score}</div>
                  <div style={{ padding:"3px 14px", borderRadius:16, background:`${cityRisk.color}22`, color:cityRisk.color, fontWeight:700, fontSize:13, border:`1px solid ${cityRisk.color}44`, marginTop:4 }}>{cityRisk.level}</div>
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8 }}>
                {[
                  ["🚨 Active",cityRisk.activeIncidents,"#FF8800"],
                  ["🔴 Critical",cityRisk.criticalIncidents,"#FF2050"],
                  ["🚗 Available",cityRisk.availableVehicles,"#00E676"],
                  ["⚡ Surge/hr",cityRisk.surgeCount,"#FFD600"],
                  ["🔮 High Risk Zones",cityRisk.highRiskZones,"#CC44FF"],
                ].map(([l,v,c])=>(
                  <div key={l} style={{ background:"var(--bg-elevated)", borderRadius:8, padding:"10px", textAlign:"center", border:`1px solid ${c}22` }}>
                    <div style={{ fontSize:10, color:"var(--text-muted)" }}>{l}</div>
                    <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:22, color:c, marginTop:2 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Auto-generated alerts */}
          {autoAlerts.length>0&&(
            <div style={{ background:"var(--bg-card)", borderRadius:14, padding:"14px 16px", border:"1px solid var(--border)" }}>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:14, marginBottom:12, color:"#FF8800" }}>🤖 AI Auto-Generated Alerts</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {autoAlerts.map((a,i)=>(
                  <div key={i} style={{ padding:"12px 14px", background:"var(--bg-elevated)", borderRadius:10,
                    borderLeft:`3px solid ${a.severity==="Critical"?"#FF2050":a.severity==="High"?"#FF8800":"#FFD600"}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                      <div style={{ fontWeight:700, fontSize:14 }}>{a.title}</div>
                      <span style={{ padding:"2px 10px", borderRadius:12,
                        background:a.severity==="Critical"?"rgba(255,32,80,0.15)":a.severity==="High"?"rgba(255,136,0,0.15)":"rgba(255,214,0,0.15)",
                        color:a.severity==="Critical"?"#FF2050":a.severity==="High"?"#FF8800":"#FFD600",
                        border:`1px solid ${a.severity==="Critical"?"rgba(255,32,80,0.4)":a.severity==="High"?"rgba(255,136,0,0.4)":"rgba(255,214,0,0.4)"}`,
                        fontSize:11, fontWeight:700 }}>{a.severity}</span>
                    </div>
                    <div style={{ fontSize:12, color:"var(--text-secondary)", lineHeight:1.6 }}>{a.message}</div>
                    {a.instructions?.length>0&&(
                      <div style={{ marginTop:8, display:"flex", gap:6, flexWrap:"wrap" }}>
                        {a.instructions.map((ins,j)=><span key={j} style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:"rgba(0,200,255,0.1)", border:"1px solid rgba(0,200,255,0.2)", color:"var(--accent)" }}>{ins}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Shift score + vehicle health */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            {shiftScore&&(
              <div style={{ background:"var(--bg-card)", borderRadius:14, padding:"14px 16px", border:"1px solid var(--border)" }}>
                <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:13, marginBottom:10, color:"#00C8FF" }}>📊 Shift Performance</div>
                <div style={{ display:"flex", gap:14, alignItems:"center" }}>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontFamily:"var(--font-display)", fontWeight:900, fontSize:48, color:shiftScore.score>=75?"#00E676":shiftScore.score>=60?"#FFD600":"#FF2050", lineHeight:1 }}>{shiftScore.score}</div>
                    <div style={{ fontSize:18, fontWeight:700, color:"var(--text-secondary)" }}>Grade {shiftScore.grade}</div>
                  </div>
                  <div style={{ flex:1, display:"flex", flexDirection:"column", gap:6 }}>
                    <div style={{ fontSize:12, color:"var(--text-secondary)" }}>{shiftScore.message}</div>
                    {[["Incidents",shiftScore.totalIncidents,"#00C8FF"],["Resolved",shiftScore.resolved,"#00E676"],["SLA Breaches",shiftScore.slaBreaches,"#FF2050"]].map(([l,v,c])=>(
                      <div key={l} style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                        <span style={{ color:"var(--text-muted)" }}>{l}</span>
                        <span style={{ fontWeight:700, color:c }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {vehHealth&&(vehHealth.critical>0||vehHealth.warnings>0)&&(
              <div style={{ background:"var(--bg-card)", borderRadius:14, padding:"14px 16px", border:"1px solid var(--border)" }}>
                <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:13, marginBottom:10, color:"#FF8800" }}>🚗 Vehicle Health Alerts</div>
                <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                  {vehHealth.reports?.filter(r=>r.overallHealth!=="OK").slice(0,5).map((r,i)=>(
                    <div key={i} style={{ padding:"8px 10px", background:r.overallHealth==="CRITICAL"?"rgba(255,32,80,0.08)":"rgba(255,214,0,0.08)",
                      border:`1px solid ${r.overallHealth==="CRITICAL"?"rgba(255,32,80,0.3)":"rgba(255,214,0,0.3)"}`, borderRadius:8 }}>
                      <div style={{ fontWeight:700, fontSize:12 }}>{r.vehicleId} <span style={{ fontSize:10, color:r.overallHealth==="CRITICAL"?"#FF2050":"#FFD600" }}>● {r.overallHealth}</span></div>
                      {r.checks.slice(0,2).map((c,j)=><div key={j} style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>⚠ {c.system}: {c.detail}</div>)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!cityRisk&&!aiLoading&&(
            <div style={{ textAlign:"center", padding:60, color:"var(--text-muted)" }}>
              <div style={{ fontSize:36, marginBottom:10 }}>🧠</div>
              <div>Click "Refresh AI Data" to load intelligence reports</div>
            </div>
          )}
        </div>
      )}

      {/* ══ FLEET TAB ══ */}
      {tab==="fleet"&&<VehicleManager/>}

      {/* ══ LOCATION INTEL TAB ══ */}
      {tab==="location"&&<Dashboard defaultTab="location"/>}

      {/* ══ ALERTS TAB ══ */}
      {tab==="alerts"&&<OperatorAlerts/>}

      {/* ══ WEATHER TAB ══ */}
      {tab==="weather"&&<WeatherPanel weather={weather} onReload={onReloadWeather} loading={weatherLoading}/>}

      {/* ══ LIVE OPS TAB ══ */}
      {tab==="live"&&<LiveDashboard/>}

      {/* ══ REPORTS TAB ══ */}
      {tab==="reports"&&(
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div style={{ background:"var(--bg-card)", borderRadius:14, padding:"20px", border:"1px solid var(--border)", textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
            <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:18, marginBottom:8 }}>Full Analytics Report</div>
            <div style={{ color:"var(--text-muted)", fontSize:13, marginBottom:16 }}>Detailed metrics, trends, and performance analysis</div>
            <Dashboard/>
          </div>
        </div>
      )}
    </div>
  );
}
