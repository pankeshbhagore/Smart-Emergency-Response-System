/**
 * CitizenTracker v3 — Full-Featured Live Tracking
 * Features: animated vehicle marker, heading rotation, speed display,
 * ETA live countdown, progress bar, alt route toggle, turn-by-turn,
 * signal corridor, fullscreen map, satellite/map toggle,
 * vehicle info card, arrival celebration.
 */
import { useEffect, useState, useRef } from "react";
import {
  MapContainer, TileLayer, Marker, Polyline, CircleMarker,
  Popup, useMap, ZoomControl, Tooltip
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// ── Custom icons ──────────────────────────────────────────────
const emergencyIcon = L.divIcon({
  className: "",
  html: `<div style="width:44px;height:44px;border-radius:50%;background:rgba(255,64,96,0.15);border:3px solid #ff4060;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 0 0 10px rgba(255,64,96,0.08),0 0 28px rgba(255,64,96,0.5);animation:pulse-ring 2s infinite;">🚨</div>`,
  iconSize:[44,44], iconAnchor:[22,22], popupAnchor:[0,-26],
});

function makeVehicleIcon(type, heading) {
  const emoji = { Ambulance:"🚑",FireTruck:"🚒",Police:"🚔",TowTruck:"🔧",HazMat:"☣️",FloodRescue:"🚤" }[type] || "🚑";
  return L.divIcon({
    className:"",
    html:`<div style="width:50px;height:50px;border-radius:50%;background:rgba(0,200,255,0.15);border:3px solid #00c8ff;display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 0 22px rgba(0,200,255,0.6);transform:rotate(${heading || 0}deg);transition:transform 0.8s ease;">${emoji}</div>`,
    iconSize:[50,50], iconAnchor:[25,25], popupAnchor:[0,-30],
  });
}

const makeSignalIcon = (state) => L.divIcon({
  className:"",
  html:`<div style="width:20px;height:20px;border-radius:50%;background:${state==="GREEN"?"#00e676":state==="YELLOW"?"#ffd600":"#ff4060"};border:2px solid rgba(255,255,255,0.35);box-shadow:0 0 12px ${state==="GREEN"?"rgba(0,230,118,0.9)":"rgba(255,64,96,0.6)"};${state==="GREEN"?"animation:pulse-dot 1.5s infinite;":""}"></div>`,
  iconSize:[20,20], iconAnchor:[10,10],
});

function MapFit({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length >= 2) {
      try { map.fitBounds(L.latLngBounds(positions), { padding:[60,60], animate:true, maxZoom:16 }); } catch(e){}
    }
  }, [positions.length]);
  return null;
}

const STEPS = [
  { key:"reported",   icon:"📱", label:"Reported",   sub:"Emergency filed" },
  { key:"dispatched", icon:"📡", label:"Dispatched",  sub:"Unit confirmed" },
  { key:"enroute",    icon:"🚑", label:"En Route",    sub:"Moving to you" },
  { key:"arrived",    icon:"✅", label:"Arrived",     sub:"On scene" },
];

function fmtTime(sec) {
  if (!sec || sec <= 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

export default function CitizenTracker({
  vehicleId, vehicleLocation, vehicleInfo,
  emergencyLocation, route, altRoute, hasAltRoute,
  etaSeconds, status, vehicleArrived,
  sustainability, defaultCenter, signals,
  routeSteps, distanceKm, speedKmh, progressPct,
  vehicleHeading, vehicleType,
}) {
  const [showAlt,    setShowAlt]    = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [mapLayer,   setMapLayer]   = useState("standard");
  const [showRoute,  setShowRoute]  = useState(true);
  const [localEta,   setLocalEta]   = useState(etaSeconds || 0);
  const [stepIndex,  setStepIndex]  = useState(0);
  const [navStep,    setNavStep]    = useState(0);
  const timerRef = useRef(null);

  // Sync ETA from parent
  useEffect(() => { if (etaSeconds > 0) setLocalEta(etaSeconds); }, [etaSeconds]);

  // Countdown
  useEffect(() => {
    if (vehicleArrived) { setLocalEta(0); return; }
    if (localEta <= 0 || !vehicleId) return;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setLocalEta(p => p > 1 ? p - 1 : 0), 1000);
    return () => clearInterval(timerRef.current);
  }, [localEta > 0 && !timerRef.current, vehicleArrived]);

  // Step progress
  useEffect(() => {
    if (vehicleArrived)     setStepIndex(3);
    else if (vehicleLocation) setStepIndex(2);
    else if (vehicleId)     setStepIndex(1);
    else                    setStepIndex(0);
  }, [vehicleId, vehicleLocation, vehicleArrived]);

  if (!vehicleId) {
    return (
      <div style={{ maxWidth:600 }}>
        <div className="tracking-card" style={{ padding:"48px 32px", textAlign:"center" }}>
          <div style={{ fontSize:56, marginBottom:14 }}>📍</div>
          <h3 style={{ fontFamily:"var(--font-display)", fontSize:22, letterSpacing:1, marginBottom:10 }}>No Active Emergency</h3>
          <p style={{ color:"var(--text-muted)", fontSize:14, lineHeight:1.7 }}>
            Report an emergency. Once an operator dispatches a unit, you'll get live GPS tracking, ETA countdown, signal corridor status, and turn-by-turn navigation right here.
          </p>
          <div style={{ marginTop:20, display:"flex", gap:8, flexWrap:"wrap", justifyContent:"center" }}>
            {["🚑 Live GPS","⏱ ETA Countdown","🚦 Signal Corridor","🗺 Turn-by-Turn","📊 Speed & Progress","🛰 Satellite View"].map(f=>(
              <span key={f} style={{ fontSize:11, background:"var(--bg-elevated)", border:"1px solid var(--border)", padding:"4px 12px", borderRadius:20, color:"var(--text-dim)" }}>{f}</span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const mainRoute  = (route || []).map(c => Array.isArray(c) ? c : [c.lat, c.lng]);
  const altRouteP  = (altRoute || []).map(c => Array.isArray(c) ? c : [c.lat, c.lng]);
  const mapPos     = [...(emergencyLocation?[emergencyLocation]:[]), ...(vehicleLocation?[vehicleLocation]:[])];
  const isUrgent   = localEta > 0 && localEta < 120;
  const vIcon      = makeVehicleIcon(vehicleType || vehicleInfo?.type || "Ambulance", vehicleHeading || 0);

  const tiles = {
    standard:  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  };

  return (
    <div style={{ maxWidth:740 }}>

      {/* ── ETA HERO ── */}
      <div className="tracking-card mb-14" style={{ position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute",top:-50,right:-50,width:220,height:220,borderRadius:"50%",opacity:0.05,background:vehicleArrived?"var(--green)":isUrgent?"var(--red)":"var(--accent)",filter:"blur(60px)",pointerEvents:"none" }}/>

        {vehicleArrived ? (
          <div style={{ textAlign:"center", position:"relative" }}>
            <div style={{ fontSize:62, marginBottom:10 }}>✅</div>
            <h2 style={{ fontFamily:"var(--font-display)", fontSize:30, color:"var(--green)", letterSpacing:2, marginBottom:8 }}>HELP HAS ARRIVED</h2>
            <p style={{ color:"var(--text-muted)", fontSize:14 }}>Emergency services are on scene. Please cooperate with responders.</p>
            {sustainability?.carbonSavedKg > 0 && (
              <div style={{ marginTop:12,display:"inline-flex",gap:8,alignItems:"center",background:"var(--green-dim)",border:"1px solid rgba(0,230,118,0.3)",borderRadius:20,padding:"6px 18px",fontSize:13 }}>
                <span>🌱</span><span style={{ color:"var(--green)",fontWeight:700 }}>Saved {sustainability.carbonSavedKg}kg CO₂ · {sustainability.vehicleFuel} · {distanceKm}km</span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign:"center", position:"relative" }}>
            <div className="label-xs mb-8" style={{ letterSpacing:3 }}>ESTIMATED TIME OF ARRIVAL</div>
            <div className={`eta-timer ${isUrgent?"urgent":""}`} style={{ lineHeight:1 }}>
              {localEta > 0 ? fmtTime(localEta) : vehicleLocation ? "Arriving soon…" : "Calculating…"}
            </div>
            <div style={{ color:"var(--text-muted)",fontSize:13,marginTop:10,display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap" }}>
              {vehicleId && <span>Unit <b style={{ color:"var(--accent)" }}>{vehicleId}</b> en route</span>}
              {speedKmh > 0 && <span>· <b style={{ color:"var(--yellow)" }}>{speedKmh} km/h</b></span>}
              {distanceKm > 0 && <span>· <b>{distanceKm} km</b> remaining</span>}
            </div>

            {progressPct > 0 && (
              <div style={{ marginTop:14 }}>
                <div style={{ display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--text-dim)",marginBottom:4 }}>
                  <span>Vehicle start</span>
                  <span style={{ color:"var(--accent)",fontWeight:700 }}>{progressPct}% of route complete</span>
                  <span>Your location</span>
                </div>
                <div style={{ height:7,background:"var(--bg-elevated)",borderRadius:4,overflow:"hidden" }}>
                  <div style={{ height:"100%",borderRadius:4,background:"linear-gradient(90deg,var(--accent),var(--green))",width:`${progressPct}%`,transition:"width 1.5s ease",boxShadow:"0 0 10px rgba(0,200,255,0.5)" }}/>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Steps */}
        <div className="tracking-progress" style={{ marginTop:22 }}>
          {STEPS.map((s,i) => (
            <div key={s.key} className={`tracking-step ${i<stepIndex?"done":i===stepIndex?"active":""}`}>
              <div className="step-icon">{s.icon}</div>
              <div className="step-label">{s.label}</div>
              <div style={{ fontSize:9,color:"var(--text-dim)",marginTop:2 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── INFO ROW ── */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14 }}>
        <div className="stat-card card-accent" style={{ padding:"12px 14px" }}>
          <div className="stat-label">🚑 Unit</div>
          <div style={{ fontFamily:"var(--font-display)",fontWeight:700,fontSize:20,color:"var(--accent)",marginTop:4 }}>{vehicleId}</div>
          {vehicleInfo?.name&&<div style={{ fontSize:11,color:"var(--text-muted)",marginTop:2 }}>{vehicleInfo.name}</div>}
        </div>
        <div className="stat-card" style={{ padding:"12px 14px" }}>
          {speedKmh > 0 ? (
            <><div className="stat-label">⚡ Speed</div><div style={{ fontFamily:"var(--font-display)",fontWeight:700,fontSize:26,color:"var(--yellow)",marginTop:4 }}>{speedKmh}</div><div style={{ fontSize:11,color:"var(--text-muted)" }}>km/h</div></>
          ) : (
            <><div className="stat-label">📊 Status</div><div style={{ fontFamily:"var(--font-display)",fontWeight:700,fontSize:14,color:vehicleArrived?"var(--green)":"var(--yellow)",marginTop:4 }}>{status||"En Route"}</div></>
          )}
        </div>
        <div className="stat-card" style={{ padding:"12px 14px" }}>
          <div className="stat-label">🚦 Signals</div>
          <div style={{ fontFamily:"var(--font-display)",fontWeight:700,fontSize:22,color:"var(--green)",marginTop:4 }}>
            {signals.filter(s=>s.state==="GREEN").length}<span style={{ fontSize:12,color:"var(--text-muted)",fontWeight:400 }}>/{signals.length}</span>
          </div>
          <div style={{ fontSize:11,color:"var(--text-muted)" }}>green corridor</div>
        </div>
      </div>

      {/* ── LIVE MAP ── */}
      <div className="card mb-14" style={{ padding:0,overflow:"hidden",border:"1px solid var(--border)",borderRadius:"var(--radius-lg)" }}>

        {/* Toolbar */}
        <div style={{ display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:"var(--bg-elevated)",borderBottom:"1px solid var(--border)",flexWrap:"wrap" }}>
          <span style={{ fontFamily:"var(--font-display)",fontWeight:700,fontSize:13,color:"var(--text-primary)" }}>🗺 Live Tracking Map</span>

          {/* Map layer */}
          <div style={{ display:"flex",borderRadius:"var(--radius-sm)",overflow:"hidden",border:"1px solid var(--border)",marginLeft:4 }}>
            {[["standard","🗺 Map"],["satellite","🛰 Satellite"]].map(([id,label])=>(
              <button key={id} onClick={()=>setMapLayer(id)} style={{ padding:"4px 10px",fontSize:11,background:mapLayer===id?"var(--accent)":"var(--bg-card)",color:mapLayer===id?"#000":"var(--text-muted)",border:"none",cursor:"pointer",fontWeight:mapLayer===id?700:400,transition:"all 0.2s" }}>{label}</button>
            ))}
          </div>

          {hasAltRoute && (
            <button onClick={()=>setShowAlt(p=>!p)} style={{ padding:"4px 10px",fontSize:11,borderRadius:"var(--radius-sm)",border:`1px solid ${showAlt?"var(--yellow)":"var(--border)"}`,background:showAlt?"rgba(255,214,0,0.1)":"var(--bg-card)",color:showAlt?"var(--yellow)":"var(--text-muted)",cursor:"pointer",fontWeight:showAlt?700:400 }}>
              {showAlt?"⚡ Alt Route ON":"↪ Alt Route"}
            </button>
          )}

          <button onClick={()=>setShowRoute(p=>!p)} style={{ padding:"4px 10px",fontSize:11,borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--bg-card)",color:"var(--text-muted)",cursor:"pointer" }}>
            {showRoute?"🙈 Hide Route":"👁 Route"}
          </button>

          <div style={{ marginLeft:"auto",display:"flex",gap:8,alignItems:"center" }}>
            {vehicleArrived && <span className="badge badge-green" style={{ fontSize:10 }}>✅ ARRIVED</span>}
            {isUrgent && !vehicleArrived && <span className="badge badge-red" style={{ fontSize:10,animation:"pulse-dot 1s infinite" }}>ALMOST HERE</span>}
            <button onClick={()=>setFullscreen(p=>!p)} style={{ padding:"4px 10px",fontSize:11,borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--bg-card)",color:"var(--text-muted)",cursor:"pointer" }}>
              {fullscreen?"⊡ Shrink":"⊞ Expand"}
            </button>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display:"flex",gap:14,padding:"6px 14px",background:"var(--bg-card)",borderBottom:"1px solid var(--border)",fontSize:11,color:"var(--text-dim)",flexWrap:"wrap",alignItems:"center" }}>
          <span style={{ color:"var(--red)" }}>🚨 Emergency</span>
          <span style={{ color:"var(--accent)" }}>🚑 Unit live</span>
          <span>━ <span style={{ color:"var(--accent)" }}>Active route</span></span>
          {hasAltRoute&&<span>┅ <span style={{ color:"var(--yellow)" }}>Alt route</span></span>}
          <span>● <span style={{ color:"var(--green)" }}>Green signal</span></span>
          <span>● <span style={{ color:"var(--red)" }}>Red signal</span></span>
        </div>

        {/* Map */}
        <div style={{ height:fullscreen?"calc(100vh - 240px)":430, position:"relative" }}>
          <MapContainer center={emergencyLocation || defaultCenter} zoom={14} style={{ height:"100%",width:"100%",background:"#060d17" }} zoomControl={false}>
            <ZoomControl position="bottomright"/>
            <TileLayer url={tiles[mapLayer]}/>
            {mapPos.length >= 2 && <MapFit positions={mapPos}/>}

            {/* Route glow */}
            {showRoute && mainRoute.length > 0 && (
              <Polyline positions={mainRoute} color="rgba(0,200,255,0.15)" weight={18} opacity={1}/>
            )}
            {/* Active route */}
            {showRoute && mainRoute.length > 0 && (
              <Polyline positions={mainRoute} color="#00c8ff" weight={5} opacity={0.9} dashArray={vehicleArrived?"":"10,4"}/>
            )}
            {/* Alt route */}
            {showAlt && altRouteP.length > 0 && (
              <Polyline positions={altRouteP} color="#ffd600" weight={3} opacity={0.7} dashArray="7,5"/>
            )}

            {/* Emergency pin */}
            {emergencyLocation && (
              <Marker position={emergencyLocation} icon={emergencyIcon}>
                <Popup><div style={{ fontFamily:"sans-serif",minWidth:140 }}><b style={{ color:"#ff4060" }}>🚨 Your Emergency</b><div style={{ fontSize:12,color:"#666",marginTop:4 }}>Stay here — help is coming</div></div></Popup>
              </Marker>
            )}

            {/* Vehicle */}
            {vehicleLocation && !vehicleArrived && (
              <Marker position={vehicleLocation} icon={vIcon}>
                <Popup>
                  <div style={{ fontFamily:"sans-serif",minWidth:160 }}>
                    <b>🚑 Unit {vehicleId}</b>
                    {vehicleInfo?.name&&<div style={{ fontSize:12,color:"#555" }}>{vehicleInfo.name}</div>}
                    {speedKmh>0&&<div style={{ fontSize:12,color:"#0080cc",marginTop:4 }}>⚡ {speedKmh} km/h</div>}
                    {localEta>0&&<div style={{ fontSize:12,color:"#cc6600",marginTop:2 }}>⏱ {fmtTime(localEta)} ETA</div>}
                    {vehicleHeading>0&&<div style={{ fontSize:11,color:"#888",marginTop:2 }}>Heading: {Math.round(vehicleHeading)}°</div>}
                  </div>
                </Popup>
                <Tooltip permanent direction="top" offset={[0,-32]}>
                  <span style={{ fontWeight:700,color:"#00c8ff",fontSize:11,whiteSpace:"nowrap" }}>
                    {localEta>0?fmtTime(localEta):"On the way"}{speedKmh>0?` · ${speedKmh}km/h`:""}
                  </span>
                </Tooltip>
              </Marker>
            )}

            {/* Arrived circle */}
            {vehicleArrived && vehicleLocation && (
              <CircleMarker center={vehicleLocation} radius={24} pathOptions={{ color:"#00e676",fillColor:"rgba(0,230,118,0.18)",fillOpacity:1,weight:3 }}>
                <Popup><b style={{ color:"#00e676" }}>✅ Unit Arrived!</b></Popup>
              </CircleMarker>
            )}

            {/* Traffic signals */}
            {signals.map(s => (
              <Marker key={s.signalId} position={[s.location.lat, s.location.lng]} icon={makeSignalIcon(s.state)}>
                <Popup>
                  <div style={{ fontFamily:"sans-serif",fontSize:12 }}>
                    <b>🚦 {s.signalId}</b>
                    <div style={{ color:s.state==="GREEN"?"#00aa44":"#cc2200",fontWeight:700 }}>{s.state}</div>
                    {s.overrideBy&&<div style={{ color:"#0066bb",fontSize:11 }}>Override by {s.overrideBy}</div>}
                    {s.distanceKm!=null&&<div style={{ fontSize:10,color:"#888" }}>{s.distanceKm}km from unit</div>}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>

      {/* ── SIGNAL CORRIDOR ── */}
      {signals.length > 0 && (
        <div className="card mb-14" style={{ padding:"14px 16px" }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
            <div style={{ fontFamily:"var(--font-display)",fontWeight:700,fontSize:14 }}>🚦 Traffic Signal Corridor</div>
            <span style={{ fontSize:11,color:"var(--text-muted)" }}>
              {signals.filter(s=>s.state==="GREEN").length}/{signals.length} green
            </span>
          </div>
          <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
            {signals.slice(0,10).map(s=>(
              <div key={s.signalId} style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"8px 12px",background:s.state==="GREEN"?"rgba(0,230,118,0.07)":"rgba(255,64,96,0.07)",border:`1px solid ${s.state==="GREEN"?"rgba(0,230,118,0.3)":"rgba(255,64,96,0.2)"}`,borderRadius:"var(--radius-md)",minWidth:60 }}>
                <div style={{ width:20,height:20,borderRadius:"50%",background:s.state==="GREEN"?"#00e676":"#ff4060",boxShadow:`0 0 10px ${s.state==="GREEN"?"rgba(0,230,118,0.8)":"rgba(255,64,96,0.5)"}`,animation:s.state==="GREEN"?"pulse-dot 1.5s infinite":"none" }}/>
                <div style={{ fontSize:10,color:"var(--text-muted)",fontFamily:"var(--font-mono)" }}>{s.signalId}</div>
                <div style={{ fontSize:10,fontWeight:700,color:s.state==="GREEN"?"var(--green)":"var(--red)" }}>{s.state}</div>
                {s.overrideBy&&<div style={{ fontSize:9,color:"var(--accent)" }}>🔓 Lock</div>}
              </div>
            ))}
          </div>
          {signals.filter(s=>s.state==="GREEN").length > 0 && (
            <div style={{ marginTop:10,padding:"8px 12px",background:"rgba(0,230,118,0.06)",borderRadius:"var(--radius-sm)",border:"1px solid rgba(0,230,118,0.2)",fontSize:12,color:"var(--green)",display:"flex",alignItems:"center",gap:8 }}>
              ✅ {signals.filter(s=>s.state==="GREEN").length} signal{signals.filter(s=>s.state==="GREEN").length>1?"s":""} cleared — your unit has priority passage all the way to you
            </div>
          )}
        </div>
      )}

      {/* ── TURN-BY-TURN ── */}
      {routeSteps?.length > 0 && !vehicleArrived && (
        <div className="card mb-14" style={{ padding:"14px 16px" }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
            <div style={{ fontFamily:"var(--font-display)",fontWeight:700,fontSize:14 }}>🧭 Unit's Route — Turn-by-Turn</div>
            <div style={{ display:"flex",gap:6,alignItems:"center" }}>
              <button onClick={()=>setNavStep(p=>Math.max(0,p-1))} style={{ background:"var(--bg-elevated)",border:"1px solid var(--border)",borderRadius:"var(--radius-sm)",padding:"3px 10px",cursor:"pointer",color:"var(--text-muted)",fontSize:12 }}>‹</button>
              <span style={{ fontSize:11,color:"var(--text-dim)" }}>{navStep+1}/{routeSteps.length}</span>
              <button onClick={()=>setNavStep(p=>Math.min(routeSteps.length-1,p+1))} style={{ background:"var(--bg-elevated)",border:"1px solid var(--border)",borderRadius:"var(--radius-sm)",padding:"3px 10px",cursor:"pointer",color:"var(--text-muted)",fontSize:12 }}>›</button>
            </div>
          </div>
          <div style={{ maxHeight:200,overflowY:"auto",display:"flex",flexDirection:"column",gap:4 }}>
            {routeSteps.slice(0,12).map((s,i)=>(
              <div key={i} style={{ display:"flex",gap:10,padding:"7px 10px",borderRadius:"var(--radius-sm)",background:i===0?"var(--accent-dim)":"var(--bg-elevated)",border:`1px solid ${i===0?"var(--accent)":"var(--border)"}`,fontSize:12,alignItems:"center",transition:"background 0.2s" }}>
                <span style={{ color:"var(--accent)",fontFamily:"var(--font-mono)",fontWeight:700,minWidth:22,fontSize:11 }}>{i+1}</span>
                <span style={{ flex:1,color:"var(--text-secondary)" }}>{s.instruction||s.name||"Continue"}</span>
                <span style={{ color:"var(--text-dim)",fontSize:11,flexShrink:0 }}>{s.distance>1000?`${(s.distance/1000).toFixed(1)}km`:`${s.distance}m`}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── VEHICLE INFO ── */}
      {vehicleInfo && !vehicleArrived && (
        <div className="card mb-14" style={{ padding:"12px 16px" }}>
          <div style={{ fontFamily:"var(--font-display)",fontWeight:700,fontSize:13,marginBottom:10 }}>🚑 Responding Unit</div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8 }}>
            {[
              ["Type",    vehicleInfo.type||"Ambulance"],
              ["Fuel",    vehicleInfo.fuelType||"—"],
              ["Crew",    `${vehicleInfo.crew||2} staff`],
              ["Status",  "En Route 🟠"],
            ].map(([l,v])=>(
              <div key={l} style={{ background:"var(--bg-elevated)",borderRadius:"var(--radius-sm)",padding:"8px 10px" }}>
                <div style={{ fontSize:10,color:"var(--text-dim)",textTransform:"uppercase",letterSpacing:1,marginBottom:2 }}>{l}</div>
                <div style={{ fontWeight:700,fontSize:12 }}>{v}</div>
              </div>
            ))}
          </div>
          {vehicleInfo.fuelType==="EV"&&<div style={{ marginTop:8,fontSize:11,color:"var(--green)" }}>⚡ Electric — silent approach, zero local emissions</div>}
        </div>
      )}

      {/* ── ALT ROUTE INFO ── */}
      {hasAltRoute && !vehicleArrived && (
        <div className="card mb-14" style={{ background:"rgba(255,214,0,0.04)",border:"1px solid rgba(255,214,0,0.25)",padding:"12px 16px" }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <div>
              <div style={{ fontFamily:"var(--font-display)",fontWeight:700,fontSize:13,color:"var(--yellow)" }}>↪ Alternative Route Available</div>
              <div style={{ fontSize:12,color:"var(--text-muted)",marginTop:3 }}>A second path calculated. Toggle on map to compare.</div>
            </div>
            <button onClick={()=>setShowAlt(p=>!p)} style={{ padding:"6px 14px",background:showAlt?"rgba(255,214,0,0.12)":"var(--bg-elevated)",border:"1px solid rgba(255,214,0,0.4)",borderRadius:"var(--radius-md)",cursor:"pointer",fontSize:12,color:"var(--yellow)",fontWeight:700 }}>
              {showAlt?"Hide":"Compare"}
            </button>
          </div>
        </div>
      )}

      {/* ── SAFETY TIPS ── */}
      {!vehicleArrived && (
        <div className="card mb-14" style={{ background:"var(--accent-dim)",borderColor:"var(--accent)" }}>
          <div style={{ fontFamily:"var(--font-display)",fontWeight:700,color:"var(--accent)",marginBottom:10,fontSize:14 }}>💡 While You Wait</div>
          <div style={{ display:"flex",flexDirection:"column",gap:5,fontSize:13,color:"var(--text-secondary)",lineHeight:1.6 }}>
            <div>📍 Stay at your reported location unless in immediate danger</div>
            <div>📱 Keep your phone free — operator may call you</div>
            <div>👋 If outdoors, wave your hand to help the unit spot you</div>
            {signals.filter(s=>s.state==="GREEN").length>0&&<div style={{ color:"var(--green)" }}>✅ Green corridor active — vehicle has priority passage</div>}
            {vehicleInfo?.fuelType==="EV"&&<div style={{ color:"var(--green)" }}>⚡ Your unit is electric — watch for silent approach</div>}
            {isUrgent&&<div style={{ color:"var(--orange)",fontWeight:700 }}>⚠️ Unit almost here — prepare to receive help</div>}
          </div>
        </div>
      )}

      {/* ── ARRIVAL CELEBRATION ── */}
      {vehicleArrived && (
        <div className="card" style={{ background:"var(--green-dim)",border:"1px solid rgba(0,230,118,0.4)",textAlign:"center",padding:"24px 20px" }}>
          <div style={{ fontSize:40,marginBottom:10 }}>🏥</div>
          <div style={{ fontFamily:"var(--font-display)",fontWeight:700,fontSize:18,color:"var(--green)",marginBottom:8 }}>Response Complete</div>
          <div style={{ fontSize:13,color:"var(--text-secondary)",lineHeight:1.8 }}>
            {sustainability?.carbonSavedKg>0&&<div>🌱 Saved <b>{sustainability.carbonSavedKg}kg CO₂</b> · {sustainability.vehicleFuel}</div>}
            {distanceKm>0&&<div>📍 Distance covered: <b>{distanceKm}km</b></div>}
          </div>
        </div>
      )}
    </div>
  );
}
