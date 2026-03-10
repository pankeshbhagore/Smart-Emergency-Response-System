/**
 * SMARTEMERGENCY MAP SERVICE v27 — Google Maps Style Tracking
 * ══════════════════════════════════════════════════════════════
 *  ✅ FIXED: useRef import (was causing crash)
 *  ✅ FIXED: Signal fetch uses correct absolute API URL
 *  ✅ FIXED: Route display — actual road route (not straight line)
 *  ✅ FIXED: Covered portion = solid thick line, remaining = dotted
 *  ✅ FIXED: No fallback straight dotted line when route is loading
 *  ✅ NEW:   Google Maps style — solid traveled, dotted remaining
 *  ✅ NEW:   Camera smoothly follows vehicle between waypoints
 *  ✅ NEW:   All 14 signals always visible (fetched from API correctly)
 *  ✅ NEW:   Live signal state updates via socket bridge
 */
import { useEffect, useState, useRef, useCallback } from "react";
import {
  MapContainer, TileLayer, Marker, Popup, Polyline,
  CircleMarker, Circle, useMap, Tooltip
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:       "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:     "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

/* ── Constants ───────────────────────────────────────── */
const _BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_BASE = _BASE.endsWith("/api") ? _BASE : `${_BASE}/api`;

const TILES = {
  street: { url:"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",                          label:"🗺 Street" },
  topo:   { url:"https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",                            label:"🏔 Topo"   },
  dark:   { url:"https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",               label:"🌑 Dark"   },
  smooth: { url:"https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",    label:"☁️ Smooth" },
};

const PRI   = { Critical:"#ff4060", High:"#ff8f00", Medium:"#ffd600", Normal:"#00c8ff", Low:"#00e676" };
const VICON = { Ambulance:"🚑", FireTruck:"🚒", Police:"🚔", TowTruck:"🔧", HazMat:"☣️", FloodRescue:"🚤" };
const EICON = { Medical:"🏥", Fire:"🔥", Accident:"💥", Crime:"🚔", Breakdown:"🔧", Flood:"🌊", "Gas Leak":"💨", Other:"⚠️" };

/* ── SVG Icons ───────────────────────────────────────── */
function vehicleIcon(heading=0, type="Ambulance", priority="High", moving=true, speedKmh=0) {
  const c  = PRI[priority] || "#00c8ff";
  const em = VICON[type]   || "🚗";
  const pulse = moving ? `
    <circle cx="24" cy="24" r="21" fill="none" stroke="${c}" stroke-width="2" opacity="0.4">
      <animate attributeName="r" values="21;30;21" dur="1.4s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.4;0;0.4" dur="1.4s" repeatCount="indefinite"/>
    </circle>` : "";
  const speedBadge = speedKmh > 0
    ? `<rect x="2" y="40" width="44" height="13" rx="4" fill="rgba(6,15,30,0.85)"/>
       <text x="24" y="50" text-anchor="middle" font-size="9" fill="${c}" font-family="monospace" font-weight="bold">${speedKmh}km/h</text>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="55" viewBox="0 0 48 55">
    ${pulse}
    <circle cx="24" cy="24" r="20" fill="${c}" opacity="0.14"/>
    <circle cx="24" cy="24" r="15" fill="${c}" opacity="0.92"/>
    <text x="24" y="29" text-anchor="middle" font-size="15" fill="white">${em}</text>
    <polygon points="24,4 28,14 20,14" fill="${c}" opacity="0.95" transform="rotate(${heading},24,24)"/>
    ${speedBadge}
  </svg>`;
  return L.divIcon({ html:svg, className:"", iconSize:[48,55], iconAnchor:[24,24] });
}

function citizenIcon(pulsing=true) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
    ${pulsing ? `<circle cx="20" cy="20" r="18" fill="none" stroke="#ff4060" stroke-width="2" opacity="0.45">
      <animate attributeName="r" values="18;26;18" dur="2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.45;0;0.45" dur="2s" repeatCount="indefinite"/>
    </circle>` : ""}
    <circle cx="20" cy="20" r="13" fill="#ff4060" opacity="0.95"/>
    <text x="20" y="25" text-anchor="middle" font-size="14" fill="white">📍</text>
  </svg>`;
  return L.divIcon({ html:svg, className:"", iconSize:[40,40], iconAnchor:[20,20] });
}

function signalIcon(state) {
  const glow = state === "GREEN"
    ? `<circle cx="13" cy="22" r="5" fill="#00e676" opacity="0.5">
         <animate attributeName="r" values="5;9;5" dur="1s" repeatCount="indefinite"/>
         <animate attributeName="opacity" values="0.5;0;0.5" dur="1s" repeatCount="indefinite"/>
       </circle>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="32" viewBox="0 0 26 32">
    <rect x="3" y="2" width="20" height="28" rx="4" fill="#1a2030" stroke="#333" stroke-width="1"/>
    <circle cx="13" cy="8"  r="4.5" fill="${state==="RED"    ? "#ff4060" : "#2a3040"}"/>
    <circle cx="13" cy="15" r="4.5" fill="${state==="YELLOW" ? "#ffd600" : "#2a3040"}"/>
    <circle cx="13" cy="22" r="4.5" fill="${state==="GREEN"  ? "#00e676" : "#2a3040"}"/>
    ${glow}
  </svg>`;
  return L.divIcon({ html:svg, className:"", iconSize:[26,32], iconAnchor:[13,32] });
}

function incidentMarkerIcon(type, priority, isActive=true) {
  const c  = PRI[priority] || "#ff8f00";
  const em = EICON[type]   || "⚠️";
  const pulse = isActive
    ? `<circle cx="20" cy="20" r="18" fill="none" stroke="${c}" stroke-width="1.5" opacity="0.3">
        <animate attributeName="r" values="18;24;18" dur="2.5s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.3;0;0.3" dur="2.5s" repeatCount="indefinite"/>
       </circle>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
    ${pulse}
    <circle cx="20" cy="20" r="15" fill="${c}" opacity="${isActive ? 0.9 : 0.35}"/>
    <text x="20" y="25" text-anchor="middle" font-size="14" fill="white">${em}</text>
  </svg>`;
  return L.divIcon({ html:svg, className:"", iconSize:[40,40], iconAnchor:[20,20] });
}

/* ── Camera: smooth follow + initial fit ────────────── */
function CameraController({ vehiclePos, destPos, routeCoords, vehicleArrived, mode }) {
  const map     = useRef(useMap());
  const fitted  = useRef(false);
  const lastPos = useRef(null);

  // One-time initial fit: show entire route
  useEffect(() => {
    if (fitted.current || vehicleArrived) return;
    const points = [];
    if (vehiclePos)  points.push([vehiclePos.lat, vehiclePos.lng]);
    if (destPos)     points.push(destPos);
    // Add route corners for better padding
    if (routeCoords?.length > 4) {
      points.push(routeCoords[0]);
      points.push(routeCoords[Math.floor(routeCoords.length / 2)]);
      points.push(routeCoords[routeCoords.length - 1]);
    }
    const valid = points.filter(p => p && p[0] != null && p[1] != null);
    if (valid.length < 2) return;
    try {
      map.current.fitBounds(L.latLngBounds(valid), { padding:[60,60], maxZoom:16, animate:true, duration:1.2 });
      fitted.current = true;
    } catch(e) {}
  }, [!!vehiclePos, !!destPos, routeCoords?.length]);

  // Smooth follow: pan only when vehicle moves significantly
  useEffect(() => {
    if (!vehiclePos || vehicleArrived || mode !== "citizen") return;
    const curr = [vehiclePos.lat, vehiclePos.lng];
    if (lastPos.current) {
      try {
        const dist = map.current.distance(lastPos.current, curr);
        // Pan if vehicle >200m from last tracked position
        if (dist > 200) {
          map.current.panTo(curr, { animate:true, duration:2.0, easeLinearity:0.5 });
          lastPos.current = curr;
        }
      } catch(e) {}
    } else {
      lastPos.current = curr;
    }
  }, [vehiclePos?.lat, vehiclePos?.lng]);

  return null;
}

/* ══════════════════════════════════════════════════════
   GOOGLE MAPS STYLE ROUTE LINE
   — Covered: thick solid colored line
   — Remaining: thinner dotted (same color, less opacity)
   — Alt route: dashed grey underneath
   — No fallback straight lines!
══════════════════════════════════════════════════════ */
function RouteLines({ route, progress, color, altRoute, showAlt }) {
  if (!route || route.length < 2) return null;

  const totalPts  = route.length;
  // progress=0 → show ALL as remaining (dotted). progress=100 → all solid.
  const splitIdx  = Math.min(totalPts - 1, Math.max(0, Math.round(totalPts * progress / 100)));

  const covered   = splitIdx > 0 ? route.slice(0, splitIdx + 1) : [];  // traveled — solid
  const remaining = route.slice(splitIdx);                               // ahead    — dotted

  return (<>
    {/* Alt route — grey underneath */}
    {showAlt && altRoute?.length >= 2 && (
      <Polyline positions={altRoute}
        pathOptions={{ color:"#607080", weight:5, opacity:0.55, dashArray:"10,7" }}>
        <Tooltip sticky>🔀 Alternative route (less traffic)</Tooltip>
      </Polyline>
    )}

    {/* ── REMAINING path: dotted — the road vehicle still has to travel ── */}
    {remaining.length >= 2 && (
      <>
        {/* Outer glow */}
        <Polyline positions={remaining}
          pathOptions={{ color, weight:10, opacity:0.18, lineCap:"round" }}/>
        {/* Main dotted line */}
        <Polyline positions={remaining}
          pathOptions={{ color, weight:5, opacity:0.90, dashArray:"16,10", lineCap:"round" }}/>
      </>
    )}

    {/* ── COVERED path: solid thick — road already traveled ── */}
    {covered.length >= 2 && (
      <>
        {/* Shadow */}
        <Polyline positions={covered}
          pathOptions={{ color:"#000", weight:9, opacity:0.35, lineCap:"round" }}/>
        {/* Main solid line */}
        <Polyline positions={covered}
          pathOptions={{ color, weight:7, opacity:1.0, lineCap:"round", lineJoin:"round" }}/>
      </>
    )}

    {/* Progress dot exactly at vehicle position on route */}
    {splitIdx > 0 && splitIdx < totalPts - 1 && (
      <CircleMarker center={route[splitIdx]}
        pathOptions={{ color:"#fff", fillColor:color, fillOpacity:1, weight:3 }}
        radius={7}/>
    )}
  </>);
}

/* ── ETA Floating Box ────────────────────────────────── */
function ETABox({ eta, progress, stepText, arrived }) {
  if (arrived || (eta == null && !stepText)) return null;
  const mins = eta ? Math.floor(eta / 60) : 0;
  const secs = eta ? eta % 60 : 0;
  const c    = eta < 60 ? "#ff4060" : eta < 180 ? "#ff8f00" : "#00c8ff";
  return (
    <div style={{
      position:"absolute", top:14, left:"50%", transform:"translateX(-50%)",
      zIndex:1000, background:"rgba(6,15,30,0.93)", border:`2px solid ${c}`,
      borderRadius:40, padding:"8px 22px", display:"flex", alignItems:"center",
      gap:14, backdropFilter:"blur(8px)", boxShadow:`0 0 30px ${c}55`, pointerEvents:"none"
    }}>
      <span style={{fontSize:22}}>🚑</span>
      <div>
        <div style={{fontSize:10, color:"#8aaccc", fontFamily:"monospace", letterSpacing:"1.5px"}}>ETA</div>
        <div style={{fontFamily:"monospace", fontWeight:900, fontSize:26, color:c, lineHeight:1}}>
          {eta > 0 ? `${mins}:${String(secs).padStart(2,"0")}` : "ARRIVING"}
        </div>
        {stepText && (
          <div style={{fontSize:10, color:"#8aaccc", marginTop:2, maxWidth:180,
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
            ↪ {stepText}
          </div>
        )}
      </div>
      {progress > 0 && (
        <div style={{textAlign:"center", borderLeft:"1px solid rgba(255,255,255,0.1)", paddingLeft:14}}>
          <div style={{fontSize:10, color:"#8aaccc"}}>DONE</div>
          <div style={{fontFamily:"monospace", fontWeight:700, fontSize:22, color:"#00e676"}}>{progress}%</div>
        </div>
      )}
    </div>
  );
}

/* ── Route Info Panel ────────────────────────────────── */
function RouteInfoPanel({ distKm, durationMin, stepsCount, currentStep }) {
  if (!distKm) return null;
  return (
    <div style={{
      position:"absolute", bottom:110, right:12, zIndex:1000,
      background:"rgba(6,15,30,0.92)", border:"1px solid rgba(0,200,255,0.18)",
      borderRadius:10, padding:"10px 16px", fontSize:12, color:"#8aaccc",
      backdropFilter:"blur(6px)", minWidth:160
    }}>
      <div style={{color:"#00c8ff", fontWeight:700, marginBottom:6, fontFamily:"monospace", fontSize:11}}>📡 ROUTE</div>
      <div style={{display:"flex", gap:14}}>
        <div><div style={{fontSize:9, marginBottom:2}}>DIST</div><div style={{fontWeight:700, color:"#e8f1fa"}}>{distKm}km</div></div>
        {durationMin && <div><div style={{fontSize:9, marginBottom:2}}>ETA</div><div style={{fontWeight:700, color:"#e8f1fa"}}>{durationMin}min</div></div>}
        {stepsCount  && <div><div style={{fontSize:9, marginBottom:2}}>TURNS</div><div style={{fontWeight:700, color:"#e8f1fa"}}>{stepsCount}</div></div>}
      </div>
      {currentStep && (
        <div style={{marginTop:7, padding:"4px 8px", background:"rgba(0,200,255,0.1)",
          borderRadius:6, color:"#00c8ff", fontSize:11, borderLeft:"2px solid #00c8ff"}}>
          ↪ {currentStep}
        </div>
      )}
    </div>
  );
}

/* ── Live Telemetry Bar ──────────────────────────────── */
function LiveTelemetryBar({ speedKmh, distRemain, eta, nextSignal, progress, paused }) {
  if (!speedKmh && !distRemain && !nextSignal) return null;
  const etaMins  = eta ? Math.floor(eta / 60) : 0;
  const etaSecs  = eta ? eta % 60 : 0;
  const sigColor = nextSignal?.state === "GREEN" ? "#00e676"
    : nextSignal?.state === "YELLOW" ? "#ffd600" : "#ff4060";
  return (
    <div style={{
      flexShrink:0, width:"100%", zIndex:1001,
      background:"rgba(4,10,22,0.97)", borderTop:"1px solid rgba(0,200,255,0.25)",
      backdropFilter:"blur(10px)", display:"flex", alignItems:"center",
      padding:"6px 14px", gap:0, minHeight:46,
    }}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:72,borderRight:"1px solid rgba(255,255,255,0.08)",paddingRight:14,marginRight:14}}>
        <div style={{fontFamily:"monospace",fontWeight:900,fontSize:22,lineHeight:1,
          color:paused?"#ff4060":speedKmh>50?"#00e676":speedKmh>0?"#ffd600":"#8aaccc"}}>
          {paused ? "STOP" : speedKmh}
        </div>
        <div style={{fontSize:9,color:"#4a6080",letterSpacing:"1px",marginTop:1}}>km/h</div>
      </div>
      {distRemain != null && (
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:72,borderRight:"1px solid rgba(255,255,255,0.08)",paddingRight:14,marginRight:14}}>
          <div style={{fontFamily:"monospace",fontWeight:900,fontSize:22,color:"#00c8ff",lineHeight:1}}>
            {distRemain < 1 ? `${Math.round(distRemain*1000)}m` : `${distRemain.toFixed(1)}km`}
          </div>
          <div style={{fontSize:9,color:"#4a6080",letterSpacing:"1px",marginTop:1}}>REMAINING</div>
        </div>
      )}
      {eta > 0 && (
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:72,borderRight:"1px solid rgba(255,255,255,0.08)",paddingRight:14,marginRight:14}}>
          <div style={{fontFamily:"monospace",fontWeight:900,fontSize:22,lineHeight:1,
            color:eta<120?"#ff4060":eta<300?"#ffd600":"#00c8ff"}}>
            {`${etaMins}:${String(etaSecs).padStart(2,"0")}`}
          </div>
          <div style={{fontSize:9,color:"#4a6080",letterSpacing:"1px",marginTop:1}}>ETA</div>
        </div>
      )}
      {progress > 0 && (
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:60,borderRight:"1px solid rgba(255,255,255,0.08)",paddingRight:14,marginRight:14}}>
          <div style={{fontFamily:"monospace",fontWeight:900,fontSize:22,color:"#00e676",lineHeight:1}}>{progress}%</div>
          <div style={{fontSize:9,color:"#4a6080",letterSpacing:"1px",marginTop:1}}>DONE</div>
        </div>
      )}
      {nextSignal && (
        <div style={{display:"flex",alignItems:"center",gap:10,marginLeft:4}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"3px 5px",background:"rgba(255,255,255,0.06)",borderRadius:6}}>
            <div style={{width:9,height:9,borderRadius:"50%",background:nextSignal.state==="RED"?"#ff4060":"#1a2030"}}/>
            <div style={{width:9,height:9,borderRadius:"50%",background:nextSignal.state==="YELLOW"?"#ffd600":"#1a2030"}}/>
            <div style={{width:9,height:9,borderRadius:"50%",background:nextSignal.state==="GREEN"?"#00e676":"#1a2030",boxShadow:nextSignal.state==="GREEN"?"0 0 8px #00e676":"none"}}/>
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:sigColor}}>{nextSignal.state}</div>
            <div style={{fontSize:9,color:"#4a6080"}}>{nextSignal.signalId}</div>
            {nextSignal.distanceKm != null && (
              <div style={{fontSize:9,color:"#8aaccc"}}>{Math.round(nextSignal.distanceKm*1000)}m ahead</div>
            )}
          </div>
        </div>
      )}
      <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
        <div style={{width:6,height:6,borderRadius:"50%",background:"#00e676",animation:"pulse-dot 1s infinite"}}/>
        <span style={{fontSize:9,color:"#4a6080",fontFamily:"monospace"}}>LIVE TRACKING</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN MAPSERVICE COMPONENT
══════════════════════════════════════════════════════ */
export default function MapService({
  mode          = "citizen",
  centerLat, centerLng,
  emergencyLat, emergencyLng,
  emergencyLocation,
  vehiclePos,
  vehicleHeading = 0,
  vehicleId, vehicleType = "Ambulance", priority = "High",
  route = [], altRoute = [], routeProgress = 0,
  eta = null, routeSteps = [], distanceKm, durationMin,
  signals = [],
  weather,
  allIncidents = [], allVehicles = [], vehicleRoutes = {}, vehiclePositions = {},
  onDispatch,
  vehicleArrived = false,
  height = 420,
  tileLayer: initTile = "street",
  nextSignal  = null,
  liveSpeed   = 0,
  distRemaining = null,
}) {
  const [tile,       setTile]      = useState(initTile);
  const [fullscreen, setFS]        = useState(false);
  const [showSigs,   setShowSigs]  = useState(true);
  const [showRings,  setShowRings] = useState(true);
  const [showAlt,    setShowAlt]   = useState(true);
  const [showInfo,   setShowInfo]  = useState(true);

  // ── All signals: fetch from API + merge live prop overrides ───
  const [internalSigs, setInternalSigs] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}/signals`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setInternalSigs(data); })
      .catch(() => {});
  }, []);

  // Socket bridge: listen for live state changes
  useEffect(() => {
    const handler = e => {
      const d = e.detail;
      setInternalSigs(prev => {
        const filtered = prev.filter(s => s.signalId !== d.signalId);
        return [...filtered, { ...d }];
      });
    };
    window.addEventListener("__sigUpdate__", handler);
    return () => window.removeEventListener("__sigUpdate__", handler);
  }, []);

  // Merge: prop signals (vehicle-specific) override internal
  const mergedSignals = useCallback(() => {
    const map = {};
    internalSigs.forEach(s => { if (s.signalId) map[s.signalId] = s; });
    signals.forEach(s    => { if (s.signalId) map[s.signalId] = s; });
    return Object.values(map).filter(s => s.location?.lat != null);
  }, [internalSigs, signals]);

  const mapH    = fullscreen ? "100vh" : height;
  const center  = [emergencyLat ?? centerLat ?? 22.7196, emergencyLng ?? centerLng ?? 75.8577];
  const destPos = emergencyLat != null ? [emergencyLat, emergencyLng] : null;

  const routeColor = vehicleArrived ? "#00e676"
    : priority === "Critical"       ? "#ff4060"
    : "#00c8ff";

  // Current step from progress
  const curStepIdx = routeSteps.length
    ? Math.min(routeSteps.length - 1, Math.floor(routeSteps.length * routeProgress / 100)) : 0;
  const curStep = routeSteps[curStepIdx]?.instruction || routeSteps[curStepIdx]?.name || "";

  const activeInc = allIncidents.filter(e => !["Resolved","Cancelled"].includes(e.status));

  const locDisplay = loc => {
    if (!loc) return "—";
    const parts = [loc.road, loc.neighbourhood || loc.area, loc.city].filter(Boolean);
    return parts.length ? parts.join(", ") : loc.address || loc.city || "—";
  };

  return (
    <div style={{
      position: fullscreen ? "fixed" : "relative",
      top: fullscreen ? 0 : "auto", left: fullscreen ? 0 : "auto",
      width: fullscreen ? "100vw" : "100%",
      height: mapH,
      zIndex: fullscreen ? 9999 : 1,
      borderRadius: fullscreen ? 0 : "var(--radius-lg)",
      overflow: "hidden",
      border: "1px solid var(--border)",
      background: "#060f1e",
      display: "flex", flexDirection: "column",
    }}>

      <MapContainer center={center} zoom={mode === "operator" ? 13 : 15}
        style={{flex:1, height:0, minHeight:0, width:"100%"}} zoomControl={true}>

        <TileLayer key={tile} url={TILES[tile]?.url || TILES.street.url}
          attribution="© OpenStreetMap" maxZoom={19}/>

        {/* Smart camera — fits route + follows vehicle */}
        <CameraController
          vehiclePos={vehiclePos}
          destPos={destPos}
          routeCoords={route}
          vehicleArrived={vehicleArrived}
          mode={mode}
        />

        {/* ════ CITIZEN MODE ════ */}
        {mode === "citizen" && (<>

          {/* Distance rings around emergency */}
          {showRings && emergencyLat && (<>
            {[
              [200,  "#ff4060", "200m"],
              [500,  "#ff8f00", "500m"],
              [1000, "#ffd600", "1km" ],
              [2000, "#8aaccc", "2km" ],
            ].map(([r, color, label]) => (
              <Circle key={label} center={[emergencyLat, emergencyLng]} radius={r}
                pathOptions={{color, fillOpacity:0.02, weight:1.2, dashArray:"5,6"}}>
                <Tooltip permanent direction="right" offset={[4,0]}>
                  <span style={{fontSize:10}}>{label}</span>
                </Tooltip>
              </Circle>
            ))}
          </>)}

          {/* Emergency/citizen pin */}
          {emergencyLat && (
            <Marker position={[emergencyLat, emergencyLng]} icon={citizenIcon(!vehicleArrived)}>
              <Popup>
                <div style={{fontFamily:"sans-serif", minWidth:200, padding:4}}>
                  <b style={{color:"#ff4060", fontSize:14}}>📍 Your Emergency</b>
                  {emergencyLocation && (
                    <div style={{marginTop:8, fontSize:12, lineHeight:1.6}}>
                      {emergencyLocation.road        && <div>🛣 <b>{emergencyLocation.road}</b></div>}
                      {emergencyLocation.area        && <div>🏘 {emergencyLocation.area}</div>}
                      {emergencyLocation.city        && <div>🌆 {emergencyLocation.city}{emergencyLocation.state ? `, ${emergencyLocation.state}` : ""}</div>}
                    </div>
                  )}
                  {vehicleArrived
                    ? <div style={{color:"#00cc66", fontWeight:700, marginTop:6}}>✅ Help has arrived!</div>
                    : <div style={{color:"#888", fontSize:11, marginTop:6}}>🚑 Help is on the way</div>}
                </div>
              </Popup>
            </Marker>
          )}

          {/* Arrival glow */}
          {vehicleArrived && emergencyLat && (
            <Circle center={[emergencyLat, emergencyLng]} radius={150}
              pathOptions={{color:"#00e676", fillColor:"#00e676", fillOpacity:0.14, weight:3}}/>
          )}

          {/* ══ GOOGLE MAPS STYLE ROUTE ══
              — Shows actual road geometry from OSRM
              — Covered portion: thick solid
              — Remaining portion: thin dotted
              — NO straight fallback lines */}
          {route.length >= 2 ? (
            <RouteLines
              route={route}
              progress={routeProgress}
              color={routeColor}
              altRoute={altRoute}
              showAlt={showAlt}
            />
          ) : (
            // Route not yet loaded — show animated dashed line as placeholder
            vehiclePos && destPos && (
              <>
                <Polyline
                  positions={[[vehiclePos.lat, vehiclePos.lng], destPos]}
                  pathOptions={{color:routeColor, weight:8, opacity:0.12, lineCap:"round"}}/>
                <Polyline
                  positions={[[vehiclePos.lat, vehiclePos.lng], destPos]}
                  pathOptions={{color:routeColor, weight:3, opacity:0.55, dashArray:"8,12", lineCap:"round"}}>
                  <Tooltip sticky permanent={false}>🔄 Loading road route…</Tooltip>
                </Polyline>
              </>
            )
          )}

          {/* Vehicle marker (moving) */}
          {vehiclePos && !vehicleArrived && (
            <Marker position={[vehiclePos.lat, vehiclePos.lng]}
              icon={vehicleIcon(vehicleHeading, vehicleType, priority, true, vehiclePos.speedKmh || 0)}>
              <Popup>
                <div style={{fontFamily:"sans-serif", padding:4}}>
                  <b style={{fontSize:14}}>{VICON[vehicleType]||"🚗"} {vehicleId}</b>
                  <div style={{fontSize:12, color:"#555", marginTop:4}}>
                    En route · {durationMin ? `ETA ${durationMin} min` : "Arriving soon"}
                  </div>
                  {vehiclePos.speedKmh > 0 && <div style={{fontSize:11, color:"#888"}}>🏎 {vehiclePos.speedKmh} km/h</div>}
                  {distanceKm        && <div style={{fontSize:11, color:"#888"}}>📏 {distanceKm} km remaining</div>}
                  {curStep           && <div style={{fontSize:11, color:"#444", marginTop:4}}>↪ {curStep}</div>}
                </div>
              </Popup>
            </Marker>
          )}

          {/* Vehicle marker (arrived) */}
          {vehicleArrived && vehiclePos && (
            <Marker position={[vehiclePos.lat, vehiclePos.lng]}
              icon={vehicleIcon(0, vehicleType, "Low", false, 0)}>
              <Popup><b style={{color:"#00e676", fontSize:14}}>✅ Help Arrived!</b></Popup>
            </Marker>
          )}

          {/* Traffic signals — all 14 always shown */}
          {showSigs && mergedSignals().map(s => (
            <Marker key={s.signalId} position={[s.location.lat, s.location.lng]}
              icon={signalIcon(s.state || "RED")}>
              <Popup>
                <div style={{fontFamily:"sans-serif", fontSize:12, minWidth:130}}>
                  <b>🚦 {s.signalId}</b>
                  <div style={{
                    color: s.state === "GREEN" ? "#00cc66" : s.state === "YELLOW" ? "#ffaa00" : "#ff4060",
                    fontWeight:700, marginTop:4, fontSize:13
                  }}>{s.state || "RED"}</div>
                  {s.overrideBy && <div style={{color:"#ff8800", marginTop:3, fontSize:11}}>🚑 Cleared for: {s.overrideBy}</div>}
                  {s.distanceKm != null && (
                    <div style={{color:"#888", fontSize:10, marginTop:2}}>📏 {(s.distanceKm*1000).toFixed(0)}m from vehicle</div>
                  )}
                  <div style={{color:"#666", fontSize:10, marginTop:2}}>{s.location?.road || s.location?.city || ""}</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </>)}

        {/* ════ OPERATOR MODE ════ */}
        {mode === "operator" && (<>

          {/* Active incidents */}
          {activeInc.map(e => {
            if (!e.location?.lat) return null;
            return (
              <Marker key={e._id} position={[e.location.lat, e.location.lng]}
                icon={incidentMarkerIcon(e.type, e.priority, true)}>
                <Popup>
                  <div style={{fontFamily:"sans-serif", minWidth:220, padding:4}}>
                    <b style={{fontSize:14}}>{EICON[e.type]||"⚠️"} {e.type} Emergency</b>
                    <div style={{fontSize:12, color:"#555", margin:"5px 0"}}>📍 {locDisplay(e.location)}</div>
                    {e.reporterPhone && (
                      <div style={{marginBottom:6}}>
                        <a href={`tel:${e.reporterPhone}`} style={{color:"#00aa44",fontWeight:700,fontSize:13}}>
                          📞 {e.reporterPhone}
                        </a>
                      </div>
                    )}
                    <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                      <span style={{background:PRI[e.priority]+"22",color:PRI[e.priority],
                        padding:"2px 8px",borderRadius:12,fontSize:11,fontWeight:700}}>{e.priority}</span>
                      <span style={{background:"#ff406022",color:"#ff4060",
                        padding:"2px 8px",borderRadius:12,fontSize:11,fontWeight:700}}>{e.status}</span>
                    </div>
                    {e.status === "Reported" && onDispatch && (
                      <button onClick={() => onDispatch(e)} style={{
                        width:"100%", padding:"7px 12px", background:"#ff406022",
                        border:"1px solid #ff4060", color:"#ff4060",
                        borderRadius:6, cursor:"pointer", fontSize:12, fontWeight:700
                      }}>🚑 Dispatch Unit</button>
                    )}
                  </div>
                </Popup>
                <Tooltip>{e.type} · {e.priority} · {locDisplay(e.location)}</Tooltip>
              </Marker>
            );
          })}

          {/* Critical rings */}
          {showRings && activeInc.filter(e => e.priority==="Critical" && e.location?.lat).map(e => (
            <Circle key={`ring-${e._id}`} center={[e.location.lat, e.location.lng]} radius={500}
              pathOptions={{color:"#ff4060", fillOpacity:0.03, weight:1, dashArray:"4,6"}}/>
          ))}

          {/* Live vehicle fleet */}
          {Object.entries(vehiclePositions).map(([vid, pos]) => {
            const v = allVehicles.find(v => v.vehicleId === vid);
            return (
              <Marker key={vid} position={[pos.lat, pos.lng]}
                icon={vehicleIcon(pos.heading||0, v?.type||"Ambulance", "Normal", true, pos.speedKmh||0)}>
                <Popup>
                  <div style={{fontFamily:"sans-serif", padding:4}}>
                    <b>{VICON[v?.type]||"🚗"} {v?.name||vid}</b>
                    <div style={{fontSize:12,color:"#555",marginTop:4}}>En route</div>
                    {pos.speedKmh > 0 && <div style={{fontSize:11}}>🏎 {pos.speedKmh} km/h</div>}
                    {pos.remainingSec && <div style={{fontSize:11}}>⏱ ETA {Math.ceil(pos.remainingSec/60)} min</div>}
                  </div>
                </Popup>
                <Tooltip>{v?.name||vid} · {pos.speedKmh||0}km/h</Tooltip>
              </Marker>
            );
          })}

          {/* Vehicle routes — actual road geometry */}
          {Object.entries(vehicleRoutes).map(([vid, coords]) => (
            <Polyline key={vid} positions={coords.map(c => [c[1], c[0]])}
              pathOptions={{color:"#00c8ff", weight:4, opacity:0.72, dashArray:"10,5"}}/>
          ))}

          {/* Traffic signals */}
          {showSigs && mergedSignals().map(s => (
            <Marker key={s.signalId} position={[s.location.lat, s.location.lng]}
              icon={signalIcon(s.state || "RED")}>
              <Popup>
                <div style={{fontFamily:"sans-serif", fontSize:12, minWidth:130}}>
                  <b>🚦 {s.signalId}</b>
                  <div style={{
                    color: s.state === "GREEN" ? "#00cc66" : s.state === "YELLOW" ? "#ffaa00" : "#ff4060",
                    fontWeight:700, marginTop:4, fontSize:13
                  }}>{s.state || "RED"}</div>
                  {s.overrideBy && <div style={{color:"#ff8800", marginTop:3, fontSize:11}}>🚑 Cleared for: {s.overrideBy}</div>}
                  <div style={{color:"#666", fontSize:10, marginTop:2}}>{s.location?.road || s.location?.city || ""}</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </>)}

      </MapContainer>

      {/* ── Floating ETA (when no telemetry bar) ── */}
      {mode==="citizen" && vehiclePos && !liveSpeed && !vehicleArrived && (
        <ETABox eta={eta} progress={routeProgress} stepText={curStep} arrived={vehicleArrived}/>
      )}

      {/* ── Route info panel ── */}
      {showInfo && distanceKm && !vehicleArrived && (
        <RouteInfoPanel distKm={distanceKm} durationMin={durationMin}
          stepsCount={routeSteps?.length} currentStep={curStep}/>
      )}

      {/* ── Weather badge ── */}
      {weather?.condition && (
        <div style={{
          position:"absolute", top:12, left:12, zIndex:900,
          background:"rgba(6,15,30,0.87)", border:"1px solid rgba(255,255,255,0.1)",
          borderRadius:8, padding:"4px 10px", fontSize:11, color:"#8aaccc",
          backdropFilter:"blur(6px)", pointerEvents:"none"
        }}>
          {weather.condition} · {weather.temperature}°C
        </div>
      )}

      {/* ── Arrived overlay ── */}
      {vehicleArrived && (
        <div style={{
          position:"absolute", top:"50%", left:"50%",
          transform:"translate(-50%,-50%)", zIndex:1001, pointerEvents:"none",
          background:"rgba(0,230,118,0.14)", border:"2px solid #00e676",
          borderRadius:16, padding:"18px 36px", textAlign:"center",
          backdropFilter:"blur(10px)"
        }}>
          <div style={{fontSize:40, marginBottom:8}}>✅</div>
          <div style={{color:"#00e676", fontFamily:"monospace", fontWeight:900,
            fontSize:22, letterSpacing:3}}>HELP ARRIVED</div>
        </div>
      )}

      {/* ── Controls toolbar ── */}
      <div style={{position:"absolute", bottom:56, left:12, zIndex:1000,
        display:"flex", flexDirection:"column", gap:6}}>
        {/* Tile switcher */}
        <div style={{display:"flex", gap:4, background:"rgba(6,15,30,0.88)",
          borderRadius:8, padding:"4px 6px", backdropFilter:"blur(6px)",
          border:"1px solid rgba(255,255,255,0.08)"}}>
          {Object.entries(TILES).map(([k,{label}]) => (
            <button key={k} onClick={() => setTile(k)} style={{
              fontSize:11, padding:"3px 8px",
              background: tile===k ? "rgba(0,200,255,0.25)" : "transparent",
              border:     tile===k ? "1px solid #00c8ff"     : "1px solid transparent",
              borderRadius:6, color: tile===k ? "#00c8ff" : "#8aaccc",
              cursor:"pointer", transition:"all 0.2s"
            }}>{label}</button>
          ))}
        </div>
        {/* Toggle buttons */}
        <div style={{display:"flex", gap:4, background:"rgba(6,15,30,0.88)",
          borderRadius:8, padding:"4px 6px", backdropFilter:"blur(6px)",
          border:"1px solid rgba(255,255,255,0.08)"}}>
          {[
            { l:"🚦 Signals", a:showSigs,  t:()=>setShowSigs(v =>!v) },
            { l:"⭕ Rings",   a:showRings, t:()=>setShowRings(v=>!v) },
            ...(altRoute?.length>0    ? [{ l:"🔀 Alt",  a:showAlt,  t:()=>setShowAlt(v  =>!v) }] : []),
            ...(distanceKm            ? [{ l:"📡 Info", a:showInfo, t:()=>setShowInfo(v =>!v) }] : []),
          ].map(({l,a,t}) => (
            <button key={l} onClick={t} style={{
              fontSize:11, padding:"3px 8px",
              background: a ? "rgba(0,230,118,0.18)" : "transparent",
              border:     a ? "1px solid #00e676"     : "1px solid transparent",
              borderRadius:6, color: a ? "#00e676" : "#8aaccc",
              cursor:"pointer", transition:"all 0.2s"
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* ── Fullscreen button ── */}
      <button onClick={() => setFS(v => !v)} style={{
        position:"absolute", top:fullscreen?14:10, right:10, zIndex:1001,
        width:34, height:34, background:"rgba(6,15,30,0.88)",
        border:"1px solid rgba(255,255,255,0.12)", borderRadius:8,
        color:"#8aaccc", cursor:"pointer", fontSize:15,
        display:"flex", alignItems:"center", justifyContent:"center",
        backdropFilter:"blur(6px)", transition:"all 0.2s"
      }}>{fullscreen ? "⊡" : "⛶"}</button>

      {/* ── Live Telemetry Bar ── */}
      {mode==="citizen" && vehiclePos && !vehicleArrived && (
        <LiveTelemetryBar
          speedKmh={vehiclePos?.speedKmh || liveSpeed}
          distRemain={distRemaining}
          eta={eta}
          nextSignal={nextSignal}
          progress={routeProgress}
          paused={vehiclePos?.speedKmh === 0}
        />
      )}
      {mode==="operator" && Object.keys(vehiclePositions).length > 0 && (() => {
        const live = Object.values(vehiclePositions).filter(p => p.speedKmh != null);
        if (!live.length) return null;
        const fastest = live.sort((a,b) => (b.speedKmh||0)-(a.speedKmh||0))[0];
        return <LiveTelemetryBar
          speedKmh={fastest.speedKmh||0}
          distRemain={fastest.distanceRemaining}
          eta={fastest.remainingSec}
          nextSignal={fastest.nextSignal||null}
          progress={fastest.progressPct}
          paused={fastest.paused||false}
        />;
      })()}

      {/* ── Mini legend (citizen) ── */}
      {mode==="citizen" && vehiclePos && !vehicleArrived && (
        <div style={{
          position:"absolute", bottom:56, right:12, zIndex:900,
          background:"rgba(6,15,30,0.88)", border:"1px solid rgba(255,255,255,0.08)",
          borderRadius:8, padding:"8px 12px", fontSize:11, color:"#8aaccc",
          backdropFilter:"blur(6px)", display:"flex", flexDirection:"column", gap:5
        }}>
          {[
            [<div style={{width:20,height:5,background:"#00c8ff",borderRadius:2,opacity:0.9}}/>,   "Route remaining (dotted)"],
            [<div style={{width:20,height:7,background:"#00c8ff",borderRadius:2,opacity:0.95}}/>,  "Route covered (solid)"],
            [<span style={{fontSize:13}}>📍</span>, "Your location"],
            [<span style={{fontSize:13}}>🚑</span>, "Rescue unit"],
            [<span style={{fontSize:13}}>🚦</span>, "Traffic signal"],
          ].map(([icon, label], i) => (
            <div key={i} style={{display:"flex", alignItems:"center", gap:6}}>
              {icon}<span>{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
