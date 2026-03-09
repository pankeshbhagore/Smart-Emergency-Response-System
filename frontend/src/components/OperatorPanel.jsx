/**
 * OPERATOR PANEL v17 — Full Working Command Centre
 * ═════════════════════════════════════════════════════
 * FIXED: locLine/locLine2 defined, intelligence state, vehicle cards CSS
 * ADDED: AI Intelligence panel, Golden Hour, Chain Events, City Risk, Auto-Alerts
 * Tabs: Incidents | Live Map | Chat | AI Dashboard | Alerts | First Aid | Fleet
 */
import { useState, useEffect, useCallback, useRef } from "react";
import api    from "../services/api";
import socket from "../services/socket";
import MapService          from "./MapService";
import MultiAgencyDispatch from "./MultiAgencyDispatch";
import { OperatorAlerts }  from "./CommunityAlerts";
import ChatPanel           from "./ChatPanel";
import FirstAidGuide       from "./FirstAidGuide";

// ── Helpers ──────────────────────────────────────────────────
const PC      = { Critical:"var(--red)", High:"var(--orange)", Medium:"var(--yellow)", Normal:"var(--accent)", Low:"var(--green)" };
const TI      = { Medical:"🏥", Fire:"🔥", Accident:"💥", Crime:"🚔", Breakdown:"🔧", Flood:"🌊", "Gas Leak":"💨", Other:"⚠️" };
const VC      = { Ambulance:"🚑", FireTruck:"🚒", Police:"🚔", TowTruck:"🔧", HazMat:"☣️", FloodRescue:"🚤" };
const VColor  = { Ambulance:"#00c8ff", FireTruck:"#ff4422", Police:"#aa44ff", TowTruck:"#ffaa00", HazMat:"#ff6600", FloodRescue:"#0088ff" };
const fmtSecs = s => s>3600?`${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`:s>60?`${Math.floor(s/60)}m ${s%60}s`:`${Math.round(s)}s`;
const fmtETA  = s => s < 60 ? `${s}s` : `~${Math.round(s/60)} min`;
const locLine  = loc => { if(!loc) return "—"; const p=[loc.road||loc.address, loc.neighbourhood||loc.suburb||loc.area, loc.city].filter(Boolean); return p.length?p.join(", "):(loc.fullAddress||loc.address||"—"); };
const locLine2 = loc => { if(!loc) return ""; return [loc.city,loc.state].filter(Boolean).join(", "); };
const coordStr = loc => loc?.lat!=null ? `${parseFloat(loc.lat).toFixed(5)}, ${parseFloat(loc.lng).toFixed(5)}` : "—";

function playAlert() {
  try {
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    [[880,0],[660,0.15],[880,0.3],[440,0.45]].forEach(([f,t])=>{
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.connect(g);g.connect(ctx.destination);o.frequency.value=f;
      g.gain.setValueAtTime(0.25,ctx.currentTime+t);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t+0.12);
      o.start(ctx.currentTime+t);o.stop(ctx.currentTime+t+0.15);
    });
  } catch(e){}
}

// ── Vehicle Dispatch Modal ────────────────────────────────────
function VehicleDispatchModal({ emergency, onClose, onDispatched }) {
  const [vehicles,    setVehicles]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [selected,    setSelected]    = useState(null);
  const [dispatching, setDispatching] = useState(false);
  const [error,       setError]       = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get(`/emergencies/${emergency._id}/vehicles`);
        const vList = r.data.vehicles || [];
        setVehicles(vList);
        const best = vList.find(v=>v.isRecommended) || vList[0];
        if (best) setSelected(best.vehicleId);
      } catch(e) { setError("Failed to load vehicles"); }
      finally { setLoading(false); }
    })();
  }, [emergency._id]);

  const dispatch = async () => {
    if (!selected) return;
    setDispatching(true); setError("");
    try {
      const r = await api.post(`/emergencies/${emergency._id}/dispatch`, { vehicleId: selected });
      onDispatched(r.data);
    } catch(e) { setError(e.response?.data?.error || "Dispatch failed"); setDispatching(false); }
  };

  return (
    <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="modal" style={{ maxWidth:680, maxHeight:"92vh", overflowY:"auto" }}>
        <div className="modal-title">
          <div>
            <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:20 }}>
              🚑 Dispatch Unit — {TI[emergency.type]} {emergency.type}
            </div>
            <div style={{ fontSize:13, color:"var(--text-muted)", marginTop:4 }}>
              📍 {locLine(emergency.location)}{locLine2(emergency.location)?` · ${locLine2(emergency.location)}`:""}
            </div>
            <div style={{ fontSize:11, color:"var(--text-dim)", marginTop:2, fontFamily:"var(--font-mono)" }}>
              🌐 {coordStr(emergency.location)}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Emergency bar */}
        <div style={{ background:"var(--bg-elevated)", borderRadius:"var(--radius-md)", padding:"12px 16px",
          marginBottom:16, display:"flex", gap:10, flexWrap:"wrap", alignItems:"center", border:"1px solid var(--border)" }}>
          <span className={`badge ${emergency.priority==="Critical"?"badge-red":emergency.priority==="High"?"badge-orange":"badge-yellow"}`}>{emergency.priority}</span>
          <span style={{ fontSize:13 }}>Sev <b style={{ color:emergency.severityScore>=70?"var(--red)":emergency.severityScore>=40?"var(--yellow)":"var(--green)" }}>{emergency.severityScore||0}/100</b></span>
          {emergency.reporterName&&<span style={{ fontSize:13 }}>👤 <b>{emergency.reporterName}</b></span>}
          {emergency.reporterPhone
            ? <a href={`tel:${emergency.reporterPhone}`} style={{ fontSize:13, color:"var(--green)", fontWeight:700, textDecoration:"none" }}>📞 {emergency.reporterPhone}</a>
            : <span style={{ fontSize:12, color:"var(--text-dim)", fontStyle:"italic" }}>No phone</span>}
          {emergency.weatherContext?.condition&&<span style={{ marginLeft:"auto", fontSize:12, color:"var(--text-muted)" }}>🌤 {emergency.weatherContext.condition} {emergency.weatherContext.temperature}°C</span>}
        </div>

        {/* AI recommendation banner */}
        {vehicles[0]&&(
          <div style={{ background:"rgba(0,230,118,0.07)", border:"1px solid rgba(0,230,118,0.3)", borderRadius:"var(--radius-md)", padding:"12px 16px", marginBottom:16, display:"flex", gap:12, alignItems:"flex-start" }}>
            <span style={{ fontSize:22 }}>🧠</span>
            <div>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:700, color:"var(--green)", fontSize:14, marginBottom:4 }}>
                AI RECOMMENDS: {VC[vehicles[0].type]||"🚗"} {vehicles[0].name||vehicles[0].vehicleId}
              </div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {(vehicles[0].reasons||[]).filter(r=>r.startsWith("✓")).slice(0,4).map((r,i)=>(
                  <span key={i} style={{ fontSize:10, background:"rgba(0,230,118,0.1)", border:"1px solid rgba(0,230,118,0.2)", padding:"1px 8px", borderRadius:20, color:"var(--green)" }}>{r}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div style={{ background:"var(--accent-dim)", border:"1px solid rgba(0,200,255,0.3)", borderRadius:"var(--radius-md)", padding:"8px 14px", marginBottom:14, fontSize:12, color:"var(--text-secondary)" }}>
          Ranked by <b style={{ color:"var(--accent)" }}>AI score: distance + type match + fuel + crew</b>. ⭐ Best pre-selected.
        </div>

        {/* Vehicle list */}
        {loading ? (
          <div style={{ padding:48, textAlign:"center", color:"var(--text-muted)" }}>⏳ Loading vehicles…</div>
        ) : vehicles.length===0 ? (
          <div style={{ padding:48, textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:10 }}>🚫</div>
            <div style={{ color:"var(--red)", fontFamily:"var(--font-display)", fontWeight:700 }}>No Available Vehicles</div>
            <div style={{ color:"var(--text-muted)", fontSize:13, marginTop:6 }}>All units assigned or in maintenance</div>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:10, maxHeight:400, overflowY:"auto", marginBottom:16 }}>
            {vehicles.map((v,idx)=>{
              const isSel=selected===v.vehicleId;
              const fuel=v.fuelPercent;
              const vColor = VColor[v.type] || "#00c8ff";
              return (
                <div key={v.vehicleId} onClick={()=>setSelected(v.vehicleId)}
                  style={{
                    border:`2px solid ${isSel?vColor:v.isRecommended?"rgba(0,230,118,0.5)":"var(--border)"}`,
                    borderLeft:`4px solid ${vColor}`,
                    borderRadius:"var(--radius-lg)", padding:"14px 16px",
                    background: isSel ? `${vColor}11` : "var(--bg-card)",
                    cursor:"pointer", transition:"var(--transition)", position:"relative"
                  }}>
                  <div style={{ position:"absolute", top:10, right:12, display:"flex", gap:6 }}>
                    {idx===0&&!isSel&&<span className="badge badge-green" style={{ fontSize:10 }}>⭐ AI PICK</span>}
                    {isSel&&<span className="badge" style={{ fontSize:10, background:`${vColor}22`, color:vColor, borderColor:vColor }}>✓ SELECTED</span>}
                    {v.fuelType==="EV"&&<span className="badge badge-green" style={{ fontSize:10 }}>⚡ EV</span>}
                    {!v.isTypeMatch&&<span className="badge badge-yellow" style={{ fontSize:10 }}>⚠ Non-ideal</span>}
                  </div>
                  <div style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                    {/* Vehicle icon with color */}
                    <div style={{ textAlign:"center", minWidth:60, padding:"8px 0" }}>
                      <div style={{ fontSize:32, filter:`drop-shadow(0 0 8px ${vColor}88)` }}>{VC[v.type]||"🚗"}</div>
                      <div style={{ fontSize:10, color:"var(--text-dim)", fontFamily:"var(--font-mono)", marginTop:3 }}>{v.vehicleId}</div>
                      <div style={{ fontSize:10, color:vColor, fontWeight:600, marginTop:1 }}>{v.type}</div>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:15, marginBottom:8, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                        {v.name||v.vehicleId}
                        {v.isTypeMatch&&<span style={{ fontSize:11, color:"var(--green)" }}>✓ Type match</span>}
                      </div>
                      {/* Metric pills */}
                      <div style={{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap" }}>
                        <div style={{ background:"var(--bg-elevated)", borderRadius:"var(--radius-sm)", padding:"5px 12px", border:`1px solid ${v.distanceKm<=2?"rgba(0,230,118,0.3)":v.distanceKm<=5?"rgba(255,214,0,0.3)":"rgba(255,143,0,0.3)"}` }}>
                          <span style={{ fontSize:12, color:"var(--text-muted)" }}>📍 </span>
                          <span style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:17, color:v.distanceKm<=2?"var(--green)":v.distanceKm<=5?"var(--yellow)":"var(--orange)" }}>{v.distanceKm}</span>
                          <span style={{ fontSize:11, color:"var(--text-muted)" }}> km</span>
                        </div>
                        <div style={{ background:"var(--bg-elevated)", borderRadius:"var(--radius-sm)", padding:"5px 12px", border:"1px solid rgba(0,200,255,0.3)" }}>
                          <span style={{ fontSize:12, color:"var(--text-muted)" }}>⏱ </span>
                          <span style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:17, color:"var(--accent)" }}>{fmtETA(v.estimatedETA)}</span>
                        </div>
                        <div style={{ background:v.fuelType==="EV"?"var(--green-dim)":"var(--bg-elevated)", borderRadius:"var(--radius-sm)", padding:"5px 12px", border:v.fuelType==="EV"?"1px solid rgba(0,230,118,0.3)":"1px solid var(--border)" }}>
                          <span style={{ fontSize:12 }}>{v.fuelType==="EV"?"⚡":"⛽"} </span>
                          <span style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:17, color:fuel<20?"var(--red)":fuel<50?"var(--yellow)":"var(--text-primary)" }}>{fuel}%</span>
                        </div>
                        <div style={{ background:"var(--bg-elevated)", borderRadius:"var(--radius-sm)", padding:"5px 12px", border:"1px solid var(--border)" }}>
                          <span style={{ fontSize:12, color:"var(--text-muted)" }}>👤 </span>
                          <span style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:15 }}>{v.crew}</span>
                          <span style={{ fontSize:11, color:"var(--text-muted)" }}>  crew</span>
                        </div>
                      </div>
                      {/* Fuel bar */}
                      <div style={{ height:4, background:"var(--bg-elevated)", borderRadius:2, marginBottom:8, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${fuel}%`, borderRadius:2, background:fuel<20?"var(--red)":fuel<50?"var(--yellow)":"var(--green)", transition:"width 0.5s" }}/>
                      </div>
                      {/* Equipment */}
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:4 }}>
                        {(v.equipment||[]).slice(0,4).map(eq=>(
                          <span key={eq} style={{ fontSize:10, background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:12, padding:"1px 8px", color:"var(--text-secondary)" }}>{eq}</span>
                        ))}
                        {(v.equipment||[]).length>4&&<span style={{ fontSize:10, color:"var(--text-dim)" }}>+{v.equipment.length-4}</span>}
                      </div>
                      {/* Reason tags */}
                      {v.reasons?.length>0&&(
                        <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                          {v.reasons.filter(r=>r.startsWith("✓")).slice(0,3).map((r,i)=>(
                            <span key={i} style={{ fontSize:10, color:isSel?vColor:"var(--green)", background:isSel?`${vColor}11`:"rgba(0,230,118,0.07)", border:`1px solid ${isSel?`${vColor}33`:"rgba(0,230,118,0.2)"}`, padding:"1px 7px", borderRadius:12 }}>{r}</span>
                          ))}
                        </div>
                      )}
                      <div style={{ marginTop:5, fontSize:11, color:v.fuelType==="EV"?"var(--green)":"var(--text-dim)" }}>🌱 {v.carbonNote}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {error&&<div style={{ background:"var(--red-dim)", border:"1px solid var(--red)", borderRadius:"var(--radius-md)", padding:"10px 14px", color:"var(--red)", fontSize:13, marginBottom:12 }}>{error}</div>}

        <div className="flex gap-10">
          <button className="btn btn-danger" style={{ flex:1, justifyContent:"center", fontSize:15, padding:"13px" }}
            onClick={dispatch} disabled={!selected||dispatching||vehicles.length===0}>
            {dispatching?<>⏳ Dispatching…</>:selected?`🚑 Dispatch ${selected}`:selected===null&&!loading?"Select a vehicle":"Loading…"}
          </button>
          <button className="btn btn-ghost" onClick={onClose} disabled={dispatching}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export default function OperatorPanel() {
  const [incidents,        setIncidents]       = useState([]);
  const [vehicles,         setVehicles]        = useState([]);
  const [vehiclePositions, setVehiclePositions]= useState({});
  const [vehicleRoutes,    setVehicleRoutes]   = useState({});
  const [loading,          setLoading]         = useState(true);
  const [selectedIncident, setSelectedIncident]= useState(null);
  const [dispatchModal,    setDispatchModal]   = useState(null);
  const [multiAgencyModal, setMultiAgencyModal]= useState(null);
  const [activeChatId,     setActiveChatId]    = useState(null);
  const [filter,           setFilter]          = useState("Pending");
  const [tab,              setTab]             = useState("incidents");
  const [alertQueue,       setAlertQueue]      = useState([]);
  const [alertCount,       setAlertCount]      = useState(0);
  const [routeSteps,       setRouteSteps]      = useState([]);
  const [signals,          setSignals]         = useState([]);
  const [successMsg,       setSuccessMsg]      = useState("");
  const [intelligence,     setIntelligence]    = useState({});
  // AI Dashboard state
  const [cityRisk,         setCityRisk]        = useState(null);
  const [autoAlerts,       setAutoAlerts]      = useState([]);
  const [vehicleHealth,    setVehicleHealth]   = useState(null);
  const [shiftScore,       setShiftScore]      = useState(null);
  const [aiLoading,        setAiLoading]       = useState(false);

  const fetchIntelligence = useCallback(async (emergencyId) => {
    try {
      const r = await api.get(`/emergencies/${emergencyId}/intelligence`);
      setIntelligence(prev=>({ ...prev, [emergencyId]: r.data }));
    } catch(e) {}
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [em,v,sigs] = await Promise.all([
        api.get("/emergencies"),
        api.get("/vehicles"),
        api.get("/signals").catch(()=>({data:[]})),
      ]);
      setIncidents(em.data||[]);
      setVehicles(v.data||[]);
      if (sigs.data?.length) {
        setSignals(prev => {
          const map = {};
          (sigs.data||[]).forEach(s => { map[s.signalId] = s; });
          prev.forEach(s => { map[s.signalId] = s; }); // live updates take priority
          return Object.values(map);
        });
      }
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  const fetchAIDashboard = useCallback(async () => {
    setAiLoading(true);
    try {
      const [risk,alerts,health,shift] = await Promise.all([
        api.get("/ai/city-risk").catch(()=>({data:null})),
        api.get("/ai/auto-alerts").catch(()=>({data:{alerts:[]}})),
        api.get("/ai/vehicle-health").catch(()=>({data:null})),
        api.get("/ai/shift-score").catch(()=>({data:null})),
      ]);
      setCityRisk(risk.data); setAutoAlerts(alerts.data?.alerts||[]);
      setVehicleHealth(health.data); setShiftScore(shift.data);
    } finally { setAiLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    socket.emit("join-operators");
    socket.on("newEmergencyAlert", data=>{
      playAlert(); setAlertCount(c=>c+1);
      setAlertQueue(q=>[{...data,receivedAt:new Date().toLocaleTimeString()},...q.slice(0,19)]);
      fetchData();
    });
    socket.on("citizenChatMessage",({emergencyId,text,from})=>{
      playAlert();
      setSuccessMsg(`💬 Citizen msg on ${from}'s emergency: "${text.slice(0,40)}"`);
      setTimeout(()=>setSuccessMsg(""),6000);
    });
    socket.on("vehicleLocationUpdate", d => {
      const { vehicleId, lat, lng, heading, speedKmh, remainingSec, progressPct } = d;
      if (!vehicleId || lat==null || lng==null) return;
      setVehiclePositions(p => ({
        ...p,
        [vehicleId]: {
          lat, lng,
          heading:            heading       || 0,
          speedKmh:           speedKmh      || 0,
          remainingSec:       remainingSec  || 0,
          progressPct:        progressPct   || 0,
          distanceRemaining:  d.distanceRemaining  ?? null,
          nextSignal:         d.nextSignal         || null,
          phase:              d.phase              || "cruise",
          paused:             d.paused             || false,
          currentInstruction: d.currentInstruction || "",
          emergencyId:        d.emergencyId?.toString() || null,
        }
      }));
      // Store route if first position update and we have a route
      if (d.emergencyId) {
        setVehicleRoutes(prev => prev);  // keep existing routes
      }
    });
    socket.on("emergencyDispatched", data=>{
      fetchData();
      if (data.route?.geometry) {
        const vid=data.assignedVehicle?.vehicleId;
        if (vid) setVehicleRoutes(r=>({...r,[vid]:data.route.geometry}));
        setRouteSteps(data.route.steps||[]);
      }
    });
    socket.on("emergencyResolved",    fetchData);
    socket.on("vehicleArrived",       fetchData);
    socket.on("emergencyStatusUpdate",fetchData);
    socket.on("vehicleOnScene",       ()=>{ fetchData(); });
    socket.on("signalUpdate", d => {
      // Bridge to MapService internal listener
      window.dispatchEvent(new CustomEvent("__sigUpdate__", { detail: d }));
      setSignals(prev => {
        const filtered = prev.filter(s => s.signalId !== d.signalId);
        return [...filtered, { signalId:d.signalId, state:d.state, location:d.location, overrideBy:d.overrideBy, distanceKm:d.distanceKm }];
      });
    });
    return ()=>{
      ["newEmergencyAlert","citizenChatMessage","vehicleLocationUpdate","emergencyDispatched",
       "emergencyResolved","vehicleArrived","emergencyStatusUpdate","vehicleOnScene","signalUpdate"].forEach(ev=>socket.off(ev));
    };
  }, [fetchData]);

  // Load AI dashboard when that tab opens
  useEffect(() => { if (tab==="ai") fetchAIDashboard(); }, [tab, fetchAIDashboard]);

  const handleStatusUpdate = async (id, status, emergencyInfo=null) => {
    if (status==="Resolved") {
      const addr = locLine(emergencyInfo?.location)||"this location";
      if (!window.confirm(`✅ Confirm resolution:\n${emergencyInfo?.type} at ${addr}\n\nStatus: ${emergencyInfo?.status}\n\nOnly mark RESOLVED when unit has completed on-scene response.`)) return;
    }
    try { await api.patch(`/emergencies/${id}/status`,{ status }); fetchData(); } catch(e){}
  };

  const handleDispatched = data => {
    const vid=data.assignedVehicle?.vehicleId;
    if (data.route?.geometry) { setVehicleRoutes(r=>({...r,[vid]:data.route.geometry})); setRouteSteps(data.route.steps||[]); }
    setDispatchModal(null); setSelectedIncident(null);
    setSuccessMsg(`✅ ${vid} dispatched · ${(data.route?.distanceInMeters/1000)?.toFixed(1)||"?"}km · ${data.sustainability?.vehicleFuel||""}`);
    setTimeout(()=>setSuccessMsg(""),7000);
    fetchData();
  };

  const pendingCount  = incidents.filter(e=>e.status==="Reported").length;
  const activeCount   = incidents.filter(e=>!["Resolved","Cancelled"].includes(e.status)).length;
  const criticalCount = incidents.filter(e=>e.priority==="Critical"&&!["Resolved","Cancelled"].includes(e.status)).length;
  const availVehicles = vehicles.filter(v=>v.status==="Available").length;

  const filtered = filter==="Pending" ? incidents.filter(e=>e.status==="Reported")
    : filter==="Active"   ? incidents.filter(e=>!["Resolved","Cancelled"].includes(e.status))
    : filter==="All"      ? incidents
    : incidents.filter(e=>e.status===filter);

  if (loading) return <div style={{ padding:80, textAlign:"center" }}><div style={{ fontSize:32 }}>⏳</div><div style={{ color:"var(--text-muted)", marginTop:12 }}>Loading command centre…</div></div>;

  return (
    <div>
      {dispatchModal&&<VehicleDispatchModal emergency={dispatchModal} onClose={()=>setDispatchModal(null)} onDispatched={handleDispatched}/>}
      {multiAgencyModal&&<MultiAgencyDispatch emergency={multiAgencyModal} onClose={()=>setMultiAgencyModal(null)} onDispatched={data=>{ setMultiAgencyModal(null); setSuccessMsg(`✅ Multi-agency: ${data.message}`); setTimeout(()=>setSuccessMsg(""),8000); fetchData(); }}/>}

      {/* Incoming alert banner */}
      {alertCount>0&&alertQueue.length>0&&(
        <div className="alert-incoming mb-20">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <span style={{ fontSize:26 }}>🔔</span>
              <div>
                <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:16, color:"var(--red)", letterSpacing:"1px" }}>
                  {alertCount} NEW EMERGENCY{alertCount>1?"S":""} — ACTION REQUIRED
                </div>
                <div style={{ fontSize:12, color:"var(--text-muted)" }}>Citizens waiting for dispatch</div>
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={()=>{ setAlertCount(0); setFilter("Pending"); }}>✓ Mark Seen</button>
          </div>
          {alertQueue.slice(0,3).map((a,i)=>(
            <div key={i} onClick={()=>{ setFilter("Pending"); setTab("incidents"); setAlertCount(0); }}
              style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:"10px 14px", display:"flex", gap:14, alignItems:"center", cursor:"pointer", marginBottom:i<2?8:0 }}>
              <span style={{ fontSize:22 }}>{TI[a.type]||"⚠️"}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:14 }}>{a.type} Emergency</div>
                <div style={{ fontSize:12, color:"var(--accent)", fontWeight:600, marginTop:2 }}>📍 {locLine(a.location)}</div>
                {locLine2(a.location)&&<div style={{ fontSize:11, color:"var(--text-muted)", marginTop:1 }}>🌆 {locLine2(a.location)}</div>}
                {(a.reporterName||a.reporterPhone)&&(
                  <div style={{ fontSize:11, marginTop:2, display:"flex", gap:10 }}>
                    {a.reporterName&&<span>👤 {a.reporterName}</span>}
                    {a.reporterPhone&&<a href={`tel:${a.reporterPhone}`} style={{ color:"var(--green)", fontWeight:700, textDecoration:"none" }} onClick={e=>e.stopPropagation()}>📞 {a.reporterPhone}</a>}
                  </div>
                )}
                <div style={{ fontSize:10, color:"var(--text-dim)", marginTop:2 }}>Received {a.receivedAt}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <span className={`badge ${a.priority==="Critical"?"badge-red":a.priority==="High"?"badge-orange":"badge-yellow"}`}>{a.priority}</span>
                {a.weather?.isHazardous&&<div style={{ fontSize:10, color:"var(--orange)", marginTop:4 }}>⚠️ Hazardous wx</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {successMsg&&(
        <div style={{ background:"var(--green-dim)", border:"1px solid var(--green)", borderRadius:"var(--radius-md)", padding:"11px 16px", marginBottom:16, color:"var(--green)", fontWeight:600, fontSize:14 }}>{successMsg}</div>
      )}

      {/* KPI bar */}
      <div className="stat-grid mb-20">
        {[
          { label:"⏳ Awaiting Dispatch", val:pendingCount,  color:"var(--red)",    sub:"need action", top:"var(--red)" },
          { label:"🚨 Active Total",      val:activeCount,   color:"var(--orange)", sub:"incidents",   top:"var(--orange)" },
          { label:"🔴 Critical",          val:criticalCount, color:"var(--red)",    sub:"priority",    top:"var(--red)" },
          { label:"🚗 Vehicles Ready",    val:availVehicles, color:"var(--green)",  sub:`of ${vehicles.length}`, top:"var(--green)" },
          { label:"📋 Today Total",       val:incidents.filter(e=>Date.now()-new Date(e.createdAt)<86400000).length, color:"var(--accent)", sub:"24h", top:"transparent" },
        ].map(m=>(
          <div key={m.label} className="stat-card" style={{ borderTop:`3px solid ${m.top}` }}>
            <div className="stat-label">{m.label}</div>
            <div className="stat-value" style={{ color:m.color }}>{m.val}</div>
            <div className="stat-sub">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tab-bar mb-20">
        {[["incidents","🚨 Incidents"],["map","🗺 Live Map"],["chat","💬 Chat"],["ai","🧠 AI Dashboard"],["alerts","📢 Alerts"],["firstaid","🩺 First Aid"],["fleet","🚗 Fleet"]].map(([id,label])=>(
          <button key={id} className={`tab-btn ${tab===id?"active":""}`} onClick={()=>setTab(id)}>
            {label}
            {id==="incidents"&&pendingCount>0&&(
              <span style={{ display:"inline-flex", width:18, height:18, borderRadius:"50%", background:"var(--red)", color:"#fff", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, marginLeft:6 }}>{pendingCount}</span>
            )}
          </button>
        ))}
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ position:"relative", cursor:"pointer" }} onClick={()=>{ setAlertCount(0); setFilter("Pending"); setTab("incidents"); }}>
            <span style={{ fontSize:22 }}>🔔</span>
            {alertCount>0&&<span style={{ position:"absolute", top:-6, right:-6, background:"var(--red)", color:"#fff", borderRadius:"50%", width:18, height:18, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700 }}>{alertCount}</span>}
          </div>
        </div>
      </div>

      {/* ══ INCIDENTS TAB ══ */}
      {tab==="incidents"&&(
        <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:20 }}>
          <div>
            <div className="flex gap-8 flex-wrap mb-16">
              {[["Pending",pendingCount],["Active",activeCount],["All",incidents.length],["Resolved",incidents.filter(e=>e.status==="Resolved").length]].map(([f,count])=>(
                <button key={f} className={`btn btn-sm ${filter===f?"btn-primary":"btn-ghost"}`}
                  style={f==="Pending"&&count>0&&filter!==f?{borderColor:"var(--red)",color:"var(--red)"}:{}}
                  onClick={()=>setFilter(f)}>
                  {f} <span style={{ opacity:0.6 }}>({count})</span>
                </button>
              ))}
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {filtered.map(e=>{
                const isOpen=selectedIncident?._id===e._id;
                const intel=intelligence[e._id];
                return (
                  <div key={e._id} onClick={()=>{ const open=!isOpen; setSelectedIncident(open?e:null); if(open) fetchIntelligence(e._id); }}
                    style={{
                      background:"var(--bg-card)", cursor:"pointer", transition:"var(--transition)",
                      border:`1px solid ${isOpen?"var(--accent)":"var(--border)"}`,
                      borderLeft:`4px solid ${PC[e.priority]||"var(--border)"}`,
                      borderRadius:"var(--radius-lg)", padding:"14px 16px",
                      animation:e.status==="Reported"&&e.priority==="Critical"?"incident-flash 3s infinite":"none"
                    }}>

                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                      <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                        <span style={{ fontSize:26 }}>{TI[e.type]||"⚠️"}</span>
                        <div>
                          <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:16 }}>{e.type} Emergency</div>
                          <div style={{ fontSize:13, color:"var(--accent)", fontWeight:600, marginTop:2 }}>
                            📍 {locLine(e.location)}
                          </div>
                          {locLine2(e.location)&&<div style={{ fontSize:11, color:"var(--text-muted)", marginTop:1 }}>🌆 {locLine2(e.location)}</div>}
                          {(e.reporterName||e.reporterPhone)&&(
                            <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:3, display:"flex", gap:10 }} onClick={ev=>ev.stopPropagation()}>
                              {e.reporterName&&<span>👤 {e.reporterName}</span>}
                              {e.reporterPhone&&<a href={`tel:${e.reporterPhone}`} style={{ color:"var(--green)", fontWeight:700, textDecoration:"none" }}>📞 {e.reporterPhone}</a>}
                            </div>
                          )}
                          <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>
                            {new Date(e.createdAt).toLocaleTimeString()}
                            {e.weatherContext?.condition&&` · ${e.weatherContext.condition} ${e.weatherContext.temperature}°C`}
                          </div>
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:6, alignItems:"center", flexShrink:0 }}>
                        <span className={`badge ${e.status==="Reported"?"badge-red":e.status==="Assigned"||e.status==="En Route"?"badge-orange":e.status==="On Scene"?"badge-accent":e.status==="Resolved"?"badge-green":"badge-muted"}`}>{e.status}</span>
                        <span className="badge" style={{ color:PC[e.priority], borderColor:PC[e.priority], background:"transparent" }}>{e.priority}</span>
                        {e.severityScore>0&&<span className="badge badge-muted" style={{ fontFamily:"var(--font-mono)", fontSize:10 }}>S{e.severityScore}</span>}
                      </div>
                    </div>

                    {e.mlTags?.length>0&&(
                      <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:7 }}>
                        {e.mlTags.map(t=><span key={t} className="badge badge-yellow" style={{ fontSize:9, padding:"1px 6px" }}>{t}</span>)}
                      </div>
                    )}

                    {/* AI Recommendation quick peek */}
                    {e.aiRecommendation&&!isOpen&&(
                      <div style={{ marginTop:6, fontSize:11, color:"var(--accent)", background:"var(--accent-dim)", borderRadius:4, padding:"3px 8px",
                        whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                        💡 {e.aiRecommendation}
                      </div>
                    )}

                    {/* Multi-unit display */}
                    {e.assignedVehicles?.length>0&&(
                      <div style={{ marginTop:6, display:"flex", gap:6, flexWrap:"wrap" }}>
                        {e.assignedVehicles.map(vid=>(
                          <span key={vid} style={{ fontSize:10, padding:"2px 8px", borderRadius:12,
                            background:"var(--accent-dim)", border:"1px solid rgba(0,200,255,0.3)", color:"var(--accent)" }}>
                            🚑 {vid}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Expanded detail */}
                    {isOpen&&(
                      <div style={{ marginTop:14, paddingTop:14, borderTop:"1px solid var(--border)" }}>
                        {/* Full location */}
                        <div style={{ background:"var(--bg-elevated)", borderRadius:"var(--radius-md)", padding:"10px 14px", marginBottom:12 }}>
                          <div style={{ fontSize:10, letterSpacing:1, color:"var(--text-muted)", marginBottom:6 }}>📍 FULL LOCATION</div>
                          <div style={{ fontWeight:700, fontSize:14 }}>{e.location?.road||e.location?.address||"Unknown"}</div>
                          {e.location?.area&&<div style={{ color:"var(--text-muted)", fontSize:12, marginTop:2 }}>{e.location.area}</div>}
                          {e.location?.city&&<div style={{ color:"var(--accent)", fontSize:12, marginTop:1 }}>{e.location.city}{e.location.state?`, ${e.location.state}`:""}{e.location.postcode?` ${e.location.postcode}`:""}</div>}
                          <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-dim)", marginTop:4 }}>🌐 {coordStr(e.location)}</div>
                        </div>

                        {/* Reporter */}
                        {(e.reporterName||e.reporterPhone)&&(
                          <div style={{ background:"var(--green-dim)", borderRadius:"var(--radius-md)", padding:"10px 14px", marginBottom:12, border:"1px solid rgba(0,230,118,0.25)" }}>
                            <div style={{ fontSize:10, letterSpacing:1, color:"var(--green)", marginBottom:4 }}>👤 REPORTER</div>
                            {e.reporterName&&<div style={{ fontWeight:700, fontSize:14 }}>{e.reporterName}</div>}
                            {e.reporterPhone&&<a href={`tel:${e.reporterPhone}`} style={{ display:"flex", alignItems:"center", gap:6, marginTop:4, color:"var(--green)", fontWeight:700, fontSize:14, textDecoration:"none" }}>📞 {e.reporterPhone}</a>}
                          </div>
                        )}

                        {/* AI Intelligence Panel */}
                        {intel&&(
                          <div style={{ background:"rgba(0,200,255,0.05)", border:"1px solid rgba(0,200,255,0.25)", borderRadius:"var(--radius-md)", padding:"12px 14px", marginBottom:12 }}>
                            <div style={{ fontFamily:"var(--font-display)", fontWeight:700, color:"var(--accent)", fontSize:13, marginBottom:8 }}>🧠 AI Intelligence Report</div>
                            <div style={{ fontSize:12, marginBottom:6, lineHeight:1.6 }}>{intel.recommendation}</div>
                            <div style={{ display:"flex", gap:12, fontSize:11, flexWrap:"wrap" }}>
                              <div style={{ background:"var(--bg-elevated)", borderRadius:8, padding:"6px 12px", textAlign:"center" }}>
                                <div style={{ color:"var(--text-muted)", fontSize:10 }}>Severity</div>
                                <div style={{ fontWeight:800, fontSize:18, color:intel.severity>=70?"var(--red)":intel.severity>=40?"var(--yellow)":"var(--green)" }}>{intel.severity}/100</div>
                              </div>
                              <div style={{ background:"var(--bg-elevated)", borderRadius:8, padding:"6px 12px", textAlign:"center" }}>
                                <div style={{ color:"var(--text-muted)", fontSize:10 }}>Est. ETA</div>
                                <div style={{ fontWeight:800, fontSize:18, color:"var(--accent)" }}>{Math.round((intel.predictedRT||0)/60)}min</div>
                              </div>
                              <div style={{ background:"var(--bg-elevated)", borderRadius:8, padding:"6px 12px", textAlign:"center" }}>
                                <div style={{ color:"var(--text-muted)", fontSize:10 }}>Nearby Vehicles</div>
                                <div style={{ fontWeight:800, fontSize:18, color:intel.availableVehicles>0?"var(--green)":"var(--red)" }}>{intel.availableVehicles}</div>
                              </div>
                              <div style={{ background:"var(--bg-elevated)", borderRadius:8, padding:"6px 12px", textAlign:"center" }}>
                                <div style={{ color:"var(--text-muted)", fontSize:10 }}>Nearby Incidents</div>
                                <div style={{ fontWeight:800, fontSize:18, color:intel.nearbyCount>=3?"var(--red)":"var(--text-primary)" }}>{intel.nearbyCount}</div>
                              </div>
                            </div>
                            {intel.escalation?.escalate&&(
                              <div style={{ marginTop:8, padding:"6px 10px", background:"var(--red-dim)", border:"1px solid var(--red)", borderRadius:6, fontSize:12, color:"var(--red)", fontWeight:700 }}>
                                ⚡ ESCALATE: {intel.escalation.reason}
                              </div>
                            )}
                          </div>
                        )}
                        {!intel&&<div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:12 }}>⏳ Loading AI intelligence…</div>}

                        {/* Full AI Recommendation */}
                        {e.aiRecommendation&&(
                          <div style={{ padding:"8px 12px", background:"var(--accent-dim)", border:"1px solid rgba(0,200,255,0.2)", borderRadius:"var(--radius-sm)", fontSize:12, color:"var(--accent)", marginBottom:12 }}>
                            💡 <b>AI:</b> {e.aiRecommendation}
                          </div>
                        )}

                        {/* Stats grid */}
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:12, fontSize:12 }}>
                          {[
                            ["Reported",   new Date(e.createdAt).toLocaleTimeString()],
                            ["Vehicle",    e.assignedVehicle||"—"],
                            ["SLA Target", `${e.sla?.targetResponseTime||"—"}s`],
                            ["Weather",    `${e.weatherContext?.condition||"—"} ${e.weatherContext?.temperature!==undefined?e.weatherContext.temperature+"°C":""}`],
                            ["CO₂ Saved",  `${e.carbonSaved||0}kg`],
                            ["Response",   e.responseTime?fmtSecs(e.responseTime):"—"],
                          ].map(([label,val])=>(
                            <div key={label} style={{ background:"var(--bg-elevated)", borderRadius:"var(--radius-sm)", padding:"8px 10px" }}>
                              <div style={{ fontSize:9, letterSpacing:1, color:"var(--text-muted)", marginBottom:2 }}>{label}</div>
                              <div style={{ fontWeight:600, color:"var(--text-primary)", fontSize:12 }}>{val}</div>
                            </div>
                          ))}
                        </div>

                        {/* Actions */}
                        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                          {e.status==="Reported"&&<button className="btn btn-danger" style={{ fontFamily:"var(--font-display)", letterSpacing:"0.5px" }} onClick={ev=>{ev.stopPropagation();setDispatchModal(e);}}>🚑 SINGLE UNIT DISPATCH</button>}
                          {e.status==="Reported"&&<button className="btn btn-primary btn-sm" onClick={ev=>{ev.stopPropagation();setMultiAgencyModal(e);}}>🚨 MULTI-AGENCY</button>}
                          {["Reported","Assigned","En Route"].includes(e.status)&&<button className="btn btn-ghost btn-sm" onClick={ev=>{ev.stopPropagation();handleStatusUpdate(e._id,"Acknowledged",e);}}>✓ Ack</button>}
                          {e.status==="Assigned"&&<button className="btn btn-ghost btn-sm" onClick={ev=>{ev.stopPropagation();handleStatusUpdate(e._id,"En Route",e);}}>🚑 Mark En Route</button>}
                          {!["Resolved","Cancelled"].includes(e.status)&&<button className="btn btn-success btn-sm" style={{ background:"var(--green-dim)", borderColor:"var(--green)", color:"var(--green)", fontWeight:700 }} onClick={ev=>{ev.stopPropagation();handleStatusUpdate(e._id,"Resolved",e);}}>✅ Resolve</button>}
                          <button className="btn btn-ghost btn-sm" onClick={ev=>{ev.stopPropagation();setActiveChatId(e._id);setTab("chat");}}>💬 Chat</button>
                          <button className="btn btn-ghost btn-sm" onClick={ev=>{ev.stopPropagation();setTab("map");}}>🗺 Map</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {filtered.length===0&&(
                <div style={{ padding:60, textAlign:"center", background:"var(--bg-card)", borderRadius:"var(--radius-lg)", border:"1px solid var(--border)" }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>{filter==="Pending"?"✅":"📋"}</div>
                  <div style={{ color:"var(--text-muted)", fontFamily:"var(--font-display)", fontWeight:700 }}>
                    {filter==="Pending"?"No pending — all clear!":"No "+filter.toLowerCase()+" incidents"}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Fleet sidebar */}
          <div>
            <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:14, marginBottom:12 }}>🚗 Fleet Status</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:700, overflowY:"auto" }}>
              {vehicles.map(v=>{
                const live=vehiclePositions[v.vehicleId];
                const fuel=v.batteryLevel??v.fuelLevel??100;
                const vColor = VColor[v.type]||"#00c8ff";
                const isAvail= v.status==="Available";
                const isAssigned= v.status==="Assigned";
                return (
                  <div key={v.vehicleId} style={{
                    background:"var(--bg-card)", borderRadius:"var(--radius-md)", padding:"12px 14px",
                    border:`1px solid ${isAvail?"rgba(0,230,118,0.3)":isAssigned?"rgba(255,143,0,0.3)":"var(--border)"}`,
                    borderLeft:`3px solid ${isAvail?"var(--green)":isAssigned?"var(--orange)":"var(--text-dim)"}`,
                    opacity: v.status==="Maintenance"?0.6:1
                  }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                      <div>
                        <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:13, display:"flex", gap:6, alignItems:"center" }}>
                          <span style={{ fontSize:18 }}>{VC[v.type]||"🚗"}</span>
                          <span>{v.name||v.vehicleId}</span>
                        </div>
                        <div style={{ fontSize:10, color:"var(--text-dim)", fontFamily:"var(--font-mono)" }}>{v.vehicleId}</div>
                      </div>
                      <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                        {live&&<span style={{ fontSize:9, color:"var(--orange)", fontWeight:700, animation:"pulse-dot 1s infinite" }}>● LIVE</span>}
                        <span style={{ fontSize:11, fontWeight:600, color:isAvail?"var(--green)":isAssigned?"var(--orange)":"var(--text-muted)" }}>{v.status}</span>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:5, marginBottom:8, flexWrap:"wrap" }}>
                      <span style={{ fontSize:10, padding:"1px 7px", borderRadius:10, background:`${vColor}22`, color:vColor, border:`1px solid ${vColor}44` }}>{v.type}</span>
                      <span style={{ fontSize:10, padding:"1px 7px", borderRadius:10, background:v.fuelType==="EV"?"var(--green-dim)":"var(--bg-elevated)", color:v.fuelType==="EV"?"var(--green)":"var(--text-muted)", border:"1px solid var(--border)" }}>{v.fuelType==="EV"?"⚡ EV":v.fuelType}</span>
                      <span style={{ fontSize:10, padding:"1px 7px", borderRadius:10, background:"var(--bg-elevated)", color:"var(--text-muted)", border:"1px solid var(--border)" }}>👤{v.crew||2}</span>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginBottom:4 }}>
                      <span style={{ color:"var(--text-muted)" }}>{v.fuelType==="EV"?"🔋 Battery":"⛽ Fuel"}</span>
                      <span style={{ fontWeight:700, color:fuel<20?"var(--red)":fuel<50?"var(--yellow)":"var(--text-secondary)" }}>{fuel}%</span>
                    </div>
                    <div style={{ height:4, background:"var(--bg-elevated)", borderRadius:2, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${fuel}%`, borderRadius:2, background:fuel<20?"var(--red)":fuel<50?"var(--yellow)":"var(--green)", transition:"width 0.5s" }}/>
                    </div>
                    {live&&(
                      <div style={{ marginTop:6, fontSize:10, display:"flex", flexDirection:"column", gap:4 }}>
                        <div style={{ display:"flex", gap:8, color:"var(--orange)" }}>
                          <span>🚀 {live.paused?"STOP ⏸":live.speedKmh+" km/h"}</span>
                          {live.remainingSec&&<span>⏱ {fmtSecs(live.remainingSec)}</span>}
                          {live.progressPct!=null&&<span>📊 {live.progressPct}%</span>}
                          {live.distanceRemaining!=null&&<span>📏 {live.distanceRemaining}km</span>}
                        </div>
                        {live.nextSignal&&(
                          <div style={{ display:"flex", gap:6, alignItems:"center",
                            padding:"3px 8px", borderRadius:6,
                            background:live.nextSignal.state==="GREEN"?"rgba(0,230,118,0.1)":live.nextSignal.state==="YELLOW"?"rgba(255,214,0,0.1)":"rgba(255,64,96,0.1)",
                            border:`1px solid ${live.nextSignal.state==="GREEN"?"rgba(0,230,118,0.3)":live.nextSignal.state==="YELLOW"?"rgba(255,214,0,0.3)":"rgba(255,64,96,0.3)"}` }}>
                            <div style={{ display:"flex",flexDirection:"column",gap:2 }}>
                              <div style={{width:6,height:6,borderRadius:"50%",background:live.nextSignal.state==="RED"?"#ff4060":"#1a2030"}}/>
                              <div style={{width:6,height:6,borderRadius:"50%",background:live.nextSignal.state==="YELLOW"?"#ffd600":"#1a2030"}}/>
                              <div style={{width:6,height:6,borderRadius:"50%",background:live.nextSignal.state==="GREEN"?"#00e676":"#1a2030"}}/>
                            </div>
                            <span style={{ fontSize:9, fontWeight:700,
                              color:live.nextSignal.state==="GREEN"?"var(--green)":live.nextSignal.state==="YELLOW"?"var(--yellow)":"var(--red)" }}>
                              NEXT: {live.nextSignal.state}
                            </span>
                            <span style={{ fontSize:9, color:"var(--text-dim)" }}>{live.nextSignal.signalId} · {Math.round((live.nextSignal.distanceKm||0)*1000)}m</span>
                          </div>
                        )}
                        {live.currentInstruction&&(
                          <div style={{ fontSize:9, color:"var(--accent)", fontStyle:"italic" }}>↪ {live.currentInstruction.slice(0,50)}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══ MAP TAB ══ */}
      {tab==="map"&&(
        <div>
          <div style={{ display:"flex", gap:8, marginBottom:12, fontSize:12, color:"var(--text-muted)", alignItems:"center", flexWrap:"wrap" }}>
            <span>🔴 Pending</span><span>🟠 Active</span><span>🔵 Live vehicles</span><span>🟢 Signal corridor</span>
            <button className="btn btn-ghost btn-sm" style={{ marginLeft:"auto" }} onClick={fetchData}>🔄 Refresh</button>
          </div>
          <MapService
            mode="operator"
            allIncidents={incidents}
            allVehicles={vehicles}
            vehiclePositions={vehiclePositions}
            vehicleRoutes={vehicleRoutes}
            signals={signals}
            onDispatch={e=>setDispatchModal(e)}
            height={580}
            tileLayer="street"
          />
          {routeSteps.length>0&&(
            <div className="card mt-16">
              <div className="chart-title mb-10">🗺 Turn-by-Turn Navigation</div>
              <div style={{ maxHeight:180, overflowY:"auto", display:"flex", flexDirection:"column", gap:4 }}>
                {routeSteps.slice(0,15).map((s,i)=>(
                  <div key={i} style={{ display:"flex", gap:12, padding:"5px 0", borderBottom:"1px solid var(--border)", fontSize:12 }}>
                    <span style={{ color:"var(--accent)", fontFamily:"var(--font-mono)", minWidth:22, fontWeight:700 }}>{i+1}</span>
                    <span style={{ flex:1, color:"var(--text-secondary)" }}>{s.instruction||s.name||"Continue"}</span>
                    <span style={{ color:"var(--text-dim)" }}>{s.distance>1000?`${(s.distance/1000).toFixed(1)}km`:`${s.distance}m`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ CHAT TAB ══ */}
      {tab==="chat"&&(
        <div>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:13, color:"var(--text-muted)", marginBottom:8 }}>Select active emergency to chat with citizen:</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {incidents.filter(e=>!["Resolved","Cancelled"].includes(e.status)).map(e=>(
                <button key={e._id} className={`btn btn-sm ${activeChatId===e._id?"btn-primary":"btn-ghost"}`} onClick={()=>setActiveChatId(e._id)}>
                  {TI[e.type]} {locLine(e.location).slice(0,20)||"—"}
                  <span className={`badge ${e.status==="Reported"?"badge-red":"badge-orange"}`} style={{ fontSize:9, marginLeft:4 }}>{e.status}</span>
                </button>
              ))}
              {incidents.filter(e=>!["Resolved","Cancelled"].includes(e.status)).length===0&&<div style={{ color:"var(--text-muted)", fontSize:13 }}>No active emergencies</div>}
            </div>
          </div>
          {activeChatId?(
            <div className="card" style={{ padding:0, overflow:"hidden" }}>
              <div style={{ background:"var(--bg-elevated)", padding:"10px 16px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:14 }}>💬 Live Chat — {incidents.find(e=>e._id===activeChatId)?.type}</div>
                <div style={{ fontSize:12, color:"var(--green)" }}>● Connected to citizen</div>
              </div>
              <ChatPanel emergencyId={activeChatId} isOperator={true} emergencyType={incidents.find(e=>e._id===activeChatId)?.type}/>
            </div>
          ):(
            <div style={{ textAlign:"center", padding:48, color:"var(--text-muted)", background:"var(--bg-card)", borderRadius:"var(--radius-lg)", border:"1px solid var(--border)" }}>
              <div style={{ fontSize:40, marginBottom:12 }}>💬</div>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:700 }}>Select an emergency above to start chat</div>
            </div>
          )}
        </div>
      )}

      {/* ══ AI DASHBOARD TAB ══ */}
      {tab==="ai"&&(
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div style={{ display:"flex", gap:8, marginBottom:4 }}>
            <button className="btn btn-primary btn-sm" onClick={fetchAIDashboard} disabled={aiLoading}>{aiLoading?"⏳ Refreshing…":"🔄 Refresh AI Data"}</button>
          </div>

          {/* City Risk Index */}
          {cityRisk&&(
            <div className="chart-card" style={{ borderLeft:`4px solid ${cityRisk.color}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div className="chart-title">🌐 City-Wide Risk Index</div>
                <div style={{ fontFamily:"var(--font-display)", fontWeight:900, fontSize:36, color:cityRisk.color }}>{cityRisk.score}</div>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:10 }}>
                <span style={{ padding:"4px 16px", borderRadius:20, background:`${cityRisk.color}22`, color:cityRisk.color, fontWeight:700, fontSize:14, border:`1px solid ${cityRisk.color}44` }}>{cityRisk.level}</span>
              </div>
              <div style={{ fontSize:13, color:"var(--text-secondary)", marginBottom:10, lineHeight:1.6 }}>{cityRisk.recommendation}</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                {[
                  ["🚨 Active", cityRisk.activeIncidents, "var(--orange)"],
                  ["🔴 Critical", cityRisk.criticalIncidents, "var(--red)"],
                  ["🚗 Available", cityRisk.availableVehicles, "var(--green)"],
                  ["⚡ Surge/hr", cityRisk.surgeCount, "var(--yellow)"],
                ].map(([l,v,c])=>(
                  <div key={l} style={{ background:"var(--bg-elevated)", borderRadius:8, padding:"8px", textAlign:"center" }}>
                    <div style={{ fontSize:10, color:"var(--text-muted)" }}>{l}</div>
                    <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:20, color:c }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Auto-Generated Alerts */}
          {autoAlerts.length>0&&(
            <div className="chart-card">
              <div className="chart-title mb-12">🤖 AI Auto-Generated Alerts ({autoAlerts.length})</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {autoAlerts.map((a,i)=>(
                  <div key={i} style={{ padding:"12px 14px", background:"var(--bg-elevated)", borderRadius:"var(--radius-md)",
                    border:`1px solid ${a.severity==="Critical"?"rgba(255,64,96,0.4)":a.severity==="High"?"rgba(255,143,0,0.3)":"rgba(255,214,0,0.3)"}`,
                    borderLeft:`3px solid ${a.severity==="Critical"?"var(--red)":a.severity==="High"?"var(--orange)":"var(--yellow)"}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                      <div style={{ fontWeight:700, fontSize:14 }}>{a.title}</div>
                      <span className={`badge ${a.severity==="Critical"?"badge-red":a.severity==="High"?"badge-orange":"badge-yellow"}`}>{a.severity}</span>
                    </div>
                    <div style={{ fontSize:12, color:"var(--text-secondary)", lineHeight:1.6 }}>{a.message}</div>
                    {a.instructions?.length>0&&(
                      <div style={{ marginTop:8, display:"flex", gap:6, flexWrap:"wrap" }}>
                        {a.instructions.map((ins,j)=>(
                          <span key={j} style={{ fontSize:10, padding:"2px 8px", borderRadius:12, background:"rgba(0,200,255,0.1)", border:"1px solid rgba(0,200,255,0.2)", color:"var(--accent)" }}>
                            {ins}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Shift Performance */}
          {shiftScore&&(
            <div className="chart-card">
              <div className="chart-title mb-12">📊 Shift Performance Score</div>
              <div style={{ display:"flex", gap:20, alignItems:"center" }}>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontFamily:"var(--font-display)", fontWeight:900, fontSize:56,
                    color:shiftScore.score>=75?"var(--green)":shiftScore.score>=60?"var(--yellow)":"var(--red)" }}>{shiftScore.score}</div>
                  <div style={{ fontSize:24, fontWeight:800, color:shiftScore.score>=75?"var(--green)":"var(--orange)" }}>Grade {shiftScore.grade}</div>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, marginBottom:12, color:"var(--text-secondary)" }}>{shiftScore.message}</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                    {[
                      ["Incidents",shiftScore.totalIncidents,"var(--accent)"],
                      ["Resolved",shiftScore.resolved,"var(--green)"],
                      ["SLA Breaches",shiftScore.slaBreaches,"var(--red)"],
                    ].map(([l,v,c])=>(
                      <div key={l} style={{ background:"var(--bg-elevated)", borderRadius:8, padding:"8px", textAlign:"center" }}>
                        <div style={{ fontSize:10, color:"var(--text-muted)" }}>{l}</div>
                        <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:20, color:c }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Vehicle Health */}
          {vehicleHealth&&(vehicleHealth.critical>0||vehicleHealth.warnings>0)&&(
            <div className="chart-card">
              <div className="chart-title mb-12">🚗 Vehicle Health Alerts</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {vehicleHealth.reports?.filter(r=>r.overallHealth!=="OK").map((r,i)=>(
                  <div key={i} style={{ padding:"10px 14px", background:r.overallHealth==="CRITICAL"?"var(--red-dim)":"var(--bg-elevated)",
                    border:`1px solid ${r.overallHealth==="CRITICAL"?"rgba(255,64,96,0.3)":"rgba(255,214,0,0.3)"}`, borderRadius:"var(--radius-md)" }}>
                    <div style={{ fontWeight:700, fontSize:13, marginBottom:6 }}>
                      {VC[vehicles.find(v=>v.vehicleId===r.vehicleId)?.type]||"🚗"} {r.vehicleId}
                      <span className={`badge ${r.overallHealth==="CRITICAL"?"badge-red":"badge-yellow"}`} style={{ marginLeft:8, fontSize:10 }}>{r.overallHealth}</span>
                    </div>
                    {r.checks.map((c,j)=>(
                      <div key={j} style={{ fontSize:11, color:c.status==="CRITICAL"?"var(--red)":"var(--yellow)", marginBottom:2 }}>
                        ⚠️ {c.system}: {c.detail}
                      </div>
                    ))}
                    <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:4 }}>Health Score: {r.healthScore}/100 · Next maintenance: {r.nextMaintenanceDue}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!cityRisk&&!aiLoading&&(
            <div style={{ textAlign:"center", padding:60, color:"var(--text-muted)" }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🧠</div>
              <div>Click "Refresh AI Data" to load intelligence reports</div>
            </div>
          )}
        </div>
      )}

      {/* ══ ALERTS TAB ══ */}
      {tab==="alerts"&&<OperatorAlerts incidents={incidents}/>}

      {/* ══ FIRST AID TAB ══ */}
      {tab==="firstaid"&&(
        <div className="card">
          <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:18, marginBottom:4 }}>🩺 First Aid Reference Guide</div>
          <div style={{ fontSize:13, color:"var(--text-muted)", marginBottom:16 }}>Guide citizens over chat while help is en route</div>
          <FirstAidGuide onSend={(type)=>{
            if (activeChatId) api.post(`/chat-sessions/${activeChatId}/firstaid`,{ emergencyType:type }).then(()=>alert(`✅ First aid guide sent!`)).catch(()=>alert("Failed"));
            else alert("Select an emergency in Chat tab first");
          }}/>
        </div>
      )}

      {/* ══ FLEET TAB ══ */}
      {tab==="fleet"&&(
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
            <div style={{ fontSize:13, color:"var(--text-muted)" }}>{availVehicles} available · {vehicles.length-availVehicles} busy</div>
            <button className="btn btn-ghost btn-sm" style={{ color:"var(--yellow)", borderColor:"var(--yellow)" }}
              onClick={async()=>{
                if (!window.confirm("Reset all Assigned → Available? Use after test.")) return;
                try { const r=await api.post("/vehicles/reset"); setSuccessMsg(`🔄 ${r.data.message}`); setTimeout(()=>setSuccessMsg(""),5000); fetchData(); } catch(e){}
              }}>🔄 Reset Stuck Vehicles</button>
          </div>
          <div className="card" style={{ padding:0, overflow:"hidden" }}>
            <table className="data-table">
              <thead><tr><th>Vehicle</th><th>Type</th><th>Status</th><th>Fuel</th><th>Level</th><th>Crew</th><th>Equipment</th></tr></thead>
              <tbody>
                {vehicles.map(v=>{
                  const live=vehiclePositions[v.vehicleId];
                  const fuel=v.batteryLevel??v.fuelLevel??100;
                  const vColor=VColor[v.type]||"#00c8ff";
                  return (
                    <tr key={v._id}>
                      <td>
                        <div style={{ fontWeight:700, display:"flex", gap:6, alignItems:"center" }}>
                          <span style={{ fontSize:18, filter:`drop-shadow(0 0 4px ${vColor}88)` }}>{VC[v.type]||"🚗"}</span>
                          {v.name||v.vehicleId}
                        </div>
                        <div style={{ fontSize:11, color:"var(--text-muted)", fontFamily:"var(--font-mono)" }}>{v.vehicleId}</div>
                        {live&&<span style={{ fontSize:9, color:"var(--orange)", fontWeight:700, animation:"pulse-dot 1s infinite" }}>● LIVE {live.speedKmh}km/h</span>}
                      </td>
                      <td><span style={{ fontSize:11, padding:"2px 8px", borderRadius:10, background:`${vColor}22`, color:vColor, border:`1px solid ${vColor}44` }}>{v.type}</span></td>
                      <td>
                        <span style={{ fontSize:11, fontWeight:600, color:v.status==="Available"?"var(--green)":v.status==="Assigned"?"var(--orange)":"var(--text-muted)" }}>{v.status}</span>
                      </td>
                      <td><span style={{ fontSize:11, padding:"2px 8px", borderRadius:10, background:v.fuelType==="EV"?"var(--green-dim)":"var(--bg-elevated)", color:v.fuelType==="EV"?"var(--green)":"var(--text-secondary)", border:"1px solid var(--border)" }}>{v.fuelType}</span></td>
                      <td style={{ minWidth:120 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:3 }}>
                          <span style={{ color:"var(--text-muted)" }}>{v.fuelType==="EV"?"Battery":"Fuel"}</span>
                          <span style={{ fontWeight:700, color:fuel<20?"var(--red)":fuel<50?"var(--yellow)":"var(--text-secondary)" }}>{fuel}%</span>
                        </div>
                        <div style={{ height:4, background:"var(--bg-elevated)", borderRadius:2, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${fuel}%`, borderRadius:2, background:fuel<20?"var(--red)":fuel<50?"var(--yellow)":"var(--green)" }}/>
                        </div>
                      </td>
                      <td style={{ color:"var(--text-secondary)" }}>{v.crew||2}</td>
                      <td style={{ fontSize:11, color:"var(--text-muted)", maxWidth:180 }}>{(v.equipment||[]).slice(0,3).join(", ")}{(v.equipment||[]).length>3?` +${v.equipment.length-3}`:"" }</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
