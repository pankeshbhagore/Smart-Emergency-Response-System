/**
 * EmergencyTracker v21 — Multi-Emergency Real-Time Tracking
 * ══════════════════════════════════════════════════════════
 * FIXED over v20:
 *  ✅ ETA countdown synced with server remainingSec every tick
 *  ✅ No race condition between notifyTracker + emergencyDispatched
 *  ✅ vehicleId set immediately on dispatch so onMove can match
 *  ✅ Signals only show AFTER vehicle dispatched (not before)
 *  ✅ Route properly stored and displayed [lat,lng] format
 *  ✅ Socket dep array uses refs — no stale closures
 *  ✅ Multi-emergency selector works correctly
 *  ✅ AI recommendation panel
 *  ✅ Google Maps-style progress bar + turn-by-turn
 */
import { useState, useEffect, useCallback, useRef } from "react";
import api    from "../services/api";
import socket from "../services/socket";
import MapService from "./MapService";

// ── Module-level event bus ──────────────────────────────────
const _addEmergencyCallbacks = [];
export function notifyTrackerNewEmergency(emData) {
  _addEmergencyCallbacks.forEach(fn => { try { fn(emData); } catch(e) {} });
}

// ── Constants ───────────────────────────────────────────────
const fmtSecs = s =>
  s > 3600 ? `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
  : s > 60  ? `${Math.floor(s/60)}m ${Math.round(s%60)}s`
  :            `${Math.round(s)}s`;

const TI  = { Medical:"🏥",Fire:"🔥",Accident:"💥",Crime:"🚔",Breakdown:"🔧",Flood:"🌊","Gas Leak":"💨",Other:"⚠️" };
const PC  = { Critical:"#ff2050",High:"#ff8800",Medium:"#ffd600",Normal:"#00c8ff",Low:"#00e676" };
const VC  = { Ambulance:"🚑",FireTruck:"🚒",Police:"🚔",TowTruck:"🔧",HazMat:"☣️",FloodRescue:"🚤" };
const PRI = { Critical:"var(--red)",High:"var(--orange)",Medium:"var(--yellow)",Normal:"var(--accent)",Low:"var(--green)" };

const STEPS = [
  { icon:"📱", label:"Reported" },
  { icon:"👮", label:"Operator" },
  { icon:"🚑", label:"En Route" },
  { icon:"📍", label:"On Scene" },
  { icon:"✅", label:"Resolved" },
];

function statusToStep(s) {
  return { Reported:0,Acknowledged:1,Assigned:2,"En Route":2,"On Scene":3,Resolved:4,Cancelled:4 }[s] ?? 0;
}

// ── Build per-emergency state object ───────────────────────
function makeEmState(em) {
  const s = em.status;
  const isOnScene  = s === "On Scene"  || s === "Resolved";
  const isResolved = s === "Resolved";
  return {
    id:              String(em.id || em._id),
    type:            em.type        || "Other",
    priority:        em.priority    || "High",
    status:          s,
    location:        em.location    || {},
    severityScore:   em.severityScore || 0,
    mlTags:          em.mlTags      || [],
    aiRecommendation:em.aiRecommendation || "",
    createdAt:       em.createdAt   || new Date().toISOString(),
    responseTime:    em.responseTime || 0,

    // Vehicle
    vehicleId:    em.assignedVehicle || null,
    vehicleType:  em.vehicle?.type  || "Ambulance",
    allUnits:     em.assignedVehicles || [],

    // Route (stored as [lat,lng] for Leaflet — parsed from DB geometry)
    route:         em.route?.geometry
                     ? em.route.geometry.map(pt => [pt[1], pt[0]])
                     : [],
    altRoute:      em.route?.alternativeGeometry?.length
                     ? em.route.alternativeGeometry.map(pt => [pt[1], pt[0]])
                     : [],
    routeSteps:    em.route?.steps || [],
    routeProgress: isOnScene ? 100 : 0,
    currentStepIdx: 0,
    // Store raw dist/duration from route
    distanceKm:  em.distanceKm || (em.route?.distanceInMeters ? +(em.route.distanceInMeters/1000).toFixed(2) : null),
    eta:         isOnScene ? 0 : (em.route?.durationInSeconds || null),

    // Live telemetry
    vehiclePos:    em.vehicle?.currentLat
      ? { lat: em.vehicle.currentLat, lng: em.vehicle.currentLng, speedKmh: 0 }
      : null,
    vehicleHeading:0,
    distRemaining: null,
    liveSpeed:     0,
    nextSignal:    null,
    paused:        false,
    phase:         "accel",

    // Signals (only populated after vehicle dispatched)
    signals:       [],

    // Status flags
    onScene:    isOnScene,
    resolved:   isResolved,

    // Dispatch info
    dispatchInfo:em.distanceKm
      ? { distanceKm: em.distanceKm, carbonSavedKg: em.carbonSaved || 0 }
      : null,
  };
}

// ── Main component ──────────────────────────────────────────
export default function EmergencyTracker() {
  const [trackMap,   setTrackMap]   = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [loading,    setLoading]    = useState(true);

  // Refs to avoid stale closures in socket handlers
  const tmRef  = useRef({});
  const selRef = useRef(null);
  tmRef.current  = trackMap;
  selRef.current = selectedId;

  // ── Helpers ───────────────────────────────────────────────
  const updateEm = useCallback((id, patch) => {
    setTrackMap(prev => {
      if (!prev[id]) return prev;
      return { ...prev, [id]: { ...prev[id], ...patch } };
    });
  }, []);

  const addOrMerge = useCallback((emState) => {
    const id = emState.id;
    setTrackMap(prev => {
      if (!prev[id]) return { ...prev, [id]: emState };
      // Merge: keep live tracking data, update static fields
      return { ...prev, [id]: {
        ...prev[id],
        status:    emState.status,
        vehicleId: emState.vehicleId || prev[id].vehicleId,
        allUnits:  emState.allUnits.length ? emState.allUnits : prev[id].allUnits,
      }};
    });
    if (!selRef.current) setSelectedId(id);
  }, []);

  // ── Load all active emergencies from API ──────────────────
  const loadActive = useCallback(async () => {
    try {
      const r   = await api.get("/auth/active-emergency");
      const all = r.data?.all || (r.data?.active ? [r.data.active] : []);
      for (const em of all) addOrMerge(makeEmState(em));
      if (all.length && !selRef.current) {
        setSelectedId(String(all[0].id || all[0]._id));
      }
    } catch (e) { console.warn("loadActive:", e.message); }
    finally    { setLoading(false); }
  }, [addOrMerge]);

  useEffect(() => { loadActive(); }, [loadActive]);

  // ── ETA countdown — 1 second interval per emergency ───────
  const etaTimers = useRef({});
  useEffect(() => {
    const ids = Object.keys(trackMap);

    // Clear timers for emergencies no longer tracked
    for (const id of Object.keys(etaTimers.current)) {
      if (!ids.includes(id)) {
        clearInterval(etaTimers.current[id]);
        delete etaTimers.current[id];
      }
    }

    for (const id of ids) {
      const em = trackMap[id];
      const needsTimer = em.eta > 0 && !em.onScene;
      const hasTimer   = !!etaTimers.current[id];

      if (needsTimer && !hasTimer) {
        // Start countdown
        etaTimers.current[id] = setInterval(() => {
          setTrackMap(prev => {
            if (!prev[id]) return prev;
            const cur = prev[id].eta || 0;
            if (cur <= 0 || prev[id].onScene) {
              clearInterval(etaTimers.current[id]);
              delete etaTimers.current[id];
              return prev;
            }
            return { ...prev, [id]: { ...prev[id], eta: cur - 1 } };
          });
        }, 1000);
      }

      if (!needsTimer && hasTimer) {
        clearInterval(etaTimers.current[id]);
        delete etaTimers.current[id];
      }
    }
  }, [trackMap]);

  useEffect(() => () => Object.values(etaTimers.current).forEach(clearInterval), []);

  // ── Socket listeners ───────────────────────────────────────
  useEffect(() => {
    const findEmByVehicle = (vehicleId, emergencyId) => {
      const all = Object.values(tmRef.current);
      return all.find(e =>
        (vehicleId && e.vehicleId === vehicleId) ||
        (emergencyId && e.id === emergencyId)
      );
    };

    const onMove = d => {
      const eid = d.emergencyId?.toString();
      const em  = findEmByVehicle(d.vehicleId, eid);
      if (!em) return;

      updateEm(em.id, {
        vehiclePos:    { lat: d.lat, lng: d.lng, speedKmh: d.speedKmh || 0 },
        vehicleHeading:d.heading    || 0,
        // Server remainingSec overrides local countdown (keeps in sync)
        eta:           d.remainingSec != null ? d.remainingSec : tmRef.current[em.id]?.eta,
        routeProgress: d.progressPct != null  ? d.progressPct  : tmRef.current[em.id]?.routeProgress,
        currentStepIdx:d.currentStepIdx != null ? d.currentStepIdx : tmRef.current[em.id]?.currentStepIdx,
        distRemaining: d.distanceRemaining != null ? d.distanceRemaining : tmRef.current[em.id]?.distRemaining,
        liveSpeed:     d.speedKmh || 0,
        nextSignal:    d.nextSignal || null,
        paused:        d.paused    || false,
        phase:         d.phase     || "cruise",
      });
    };

    const onArrive = d => {
      const eid = d.emergencyId?.toString();
      const em  = findEmByVehicle(d.vehicleId, eid);
      if (!em) return;
      updateEm(em.id, { onScene: true, eta: 0, routeProgress: 100, status: "On Scene",
        vehiclePos: d.location ? { lat: d.location.lat, lng: d.location.lng, speedKmh: 0 } : tmRef.current[em.id]?.vehiclePos,
      });
    };

    const onResolved = d => {
      const eid = d.emergencyId?.toString();
      const em  = Object.values(tmRef.current).find(e => e.id === eid);
      if (!em) return;
      updateEm(em.id, { resolved: true, onScene: true, status: "Resolved",
        responseTime: d.responseTime || tmRef.current[em.id]?.responseTime });
    };

    const onStatus = d => {
      const eid = d.emergencyId?.toString();
      const em  = Object.values(tmRef.current).find(e => e.id === eid);
      if (!em) return;
      const patch = { status: d.status };
      if (d.status === "On Scene")  { patch.onScene = true; patch.eta = 0; patch.routeProgress = 100; }
      if (d.status === "Resolved")  { patch.resolved = true; patch.onScene = true; }
      updateEm(em.id, patch);
    };

    const onDisp = d => {
      const eid = d.emergencyId?.toString();
      if (!eid) return;
      const av  = d.assignedVehicle;

      // Convert OSRM [lng,lat] → Leaflet [lat,lng]
      const route    = (d.route?.geometry           || []).map(pt => [pt[1], pt[0]]);
      const altRoute = (d.route?.alternativeGeometry || []).map(pt => [pt[1], pt[0]]);

      const dispatchPatch = {
        vehicleId:   av?.vehicleId  || null,
        vehicleType: av?.type       || "Ambulance",
        allUnits:    d.allAssignedVehicles || [av?.vehicleId].filter(Boolean),
        status:      "Assigned",
        eta:         d.route?.durationInSeconds  || null,
        distanceKm:  (d.route?.distanceInMeters / 1000) || null,
        route,
        altRoute,
        routeSteps: d.route?.steps || [],
        dispatchInfo: {
          distanceKm:   (d.route?.distanceInMeters / 1000) || 0,
          carbonSavedKg: d.sustainability?.carbonSavedKg   || 0,
          vehicleFuel:   d.sustainability?.vehicleFuel      || "",
          hasAlt:        d.route?.hasAlternative            || false,
          altDistKm:    (d.route?.alternativeDistance / 1000) || 0,
        },
      };

      if (tmRef.current[eid]) {
        // Known emergency: update dispatch info
        updateEm(eid, dispatchPatch);
      } else {
        // New emergency (e.g. from operator panel without prior report)
        const newEm = {
          id: eid, type: d.type || "Other", priority: d.priority || "High",
          status: "Assigned", location: d.location || {}, severityScore: 0,
          mlTags: [], aiRecommendation: "", createdAt: new Date().toISOString(),
          routeProgress: 0, currentStepIdx: 0,
          vehiclePos: null, vehicleHeading: 0,
          distRemaining: null, liveSpeed: 0, nextSignal: null, paused: false, phase: "accel",
          onScene: false, resolved: false, signals: [],
          responseTime: 0,
          ...dispatchPatch,
        };
        setTrackMap(prev => ({ ...prev, [eid]: newEm }));
        if (!selRef.current) setSelectedId(eid);
      }
    };

    const onSig = d => {
      window.dispatchEvent(new CustomEvent("__sigUpdate__", { detail: d }));
      // Only update signals for emergencies that have a vehicle dispatched
      setTrackMap(prev => {
        const next = { ...prev };
        for (const id of Object.keys(next)) {
          if (!next[id].vehicleId) continue; // ignore signals before dispatch
          const sigs = next[id].signals.filter(s => s.signalId !== d.signalId);
          next[id] = { ...next[id], signals: [...sigs, {
            signalId:   d.signalId,
            state:      d.state,
            location:   d.location,
            overrideBy: d.overrideBy,
            distanceKm: d.distanceKm,
          }]};
        }
        return next;
      });
    };

    const onNewAlert = d => {
      const eid = d.emergencyId?.toString();
      if (eid && !tmRef.current[eid]) loadActive();
    };

    socket.on("vehicleLocationUpdate",  onMove);
    socket.on("vehicleArrived",         onArrive);
    socket.on("vehicleOnScene",         onArrive);
    socket.on("emergencyResolved",      onResolved);
    socket.on("emergencyStatusUpdate",  onStatus);
    socket.on("emergencyDispatched",    onDisp);
    socket.on("signalUpdate",           onSig);
    socket.on("newEmergencyAlert",      onNewAlert);

    return () => {
      ["vehicleLocationUpdate","vehicleArrived","vehicleOnScene","emergencyResolved",
       "emergencyStatusUpdate","emergencyDispatched","signalUpdate","newEmergencyAlert"
      ].forEach(ev => socket.off(ev));
    };
  }, [updateEm, loadActive]);

  // ── Register addEmergency handler ─────────────────────────
  useEffect(() => {
    const handler = emData => {
      const id  = String(emData.id);
      const em  = makeEmState({ ...emData, id, _id: id });
      setTrackMap(prev => ({ ...prev, [id]: em }));
      setSelectedId(id);
    };
    _addEmergencyCallbacks.push(handler);
    return () => {
      const i = _addEmergencyCallbacks.indexOf(handler);
      if (i > -1) _addEmergencyCallbacks.splice(i, 1);
    };
  }, []);

  // ── Render ─────────────────────────────────────────────────
  const allIds      = Object.keys(trackMap);
  const selected    = selectedId && trackMap[selectedId] ? trackMap[selectedId] : null;
  const activeCount = allIds.filter(id => !trackMap[id].resolved).length;

  if (loading) return (
    <div style={{ textAlign:"center", padding:40, color:"var(--text-muted)" }}>
      <div style={{ fontSize:36 }}>🔄</div>
      <div style={{ marginTop:8, fontSize:13 }}>Restoring emergency tracking…</div>
    </div>
  );

  if (allIds.length === 0) return (
    <div style={{ textAlign:"center", padding:60, background:"var(--bg-card)",
      border:"1px solid var(--border)", borderRadius:"var(--radius-lg)" }}>
      <div style={{ fontSize:52, marginBottom:12 }}>📍</div>
      <h3 style={{ fontFamily:"var(--font-display)", fontSize:22, marginBottom:8 }}>No Active Emergency</h3>
      <p style={{ color:"var(--text-muted)", fontSize:13 }}>Report an emergency to track help in real time.</p>
    </div>
  );

  return (
    <div>
      {/* ── Multi-emergency selector (only when 2+) ── */}
      {allIds.length > 1 && (
        <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
          <span style={{ fontSize:12, color:"var(--text-muted)", fontWeight:600 }}>
            {activeCount} active emergenc{activeCount !== 1 ? "ies" : "y"}:
          </span>
          {allIds.map(id => {
            const em = trackMap[id];
            const sel = id === selectedId;
            const ac  = PC[em.priority] || "#ff8800";
            return (
              <button key={id} onClick={() => setSelectedId(id)} style={{
                padding:"6px 14px", borderRadius:20, cursor:"pointer",
                border:`2px solid ${sel ? ac : "var(--border)"}`,
                background: sel ? `${ac}22` : "var(--bg-elevated)",
                display:"flex", gap:8, alignItems:"center", transition:"all 0.2s",
              }}>
                <span style={{ fontSize:15 }}>{TI[em.type] || "⚠️"}</span>
                <div style={{ textAlign:"left", lineHeight:1.3 }}>
                  <div style={{ fontSize:12, fontWeight:700, color: sel ? ac : "var(--text-primary)" }}>{em.type}</div>
                  <div style={{ fontSize:10, color:"var(--text-muted)" }}>{em.status}</div>
                </div>
                {!em.resolved && em.eta > 0 && (
                  <span style={{ fontSize:10, color:ac, fontFamily:"monospace", fontWeight:700 }}>
                    {fmtSecs(em.eta)}
                  </span>
                )}
                {em.resolved && <span style={{ fontSize:12 }}>✅</span>}
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <TrackingPanel em={selected} onDismiss={() => {
          if (!selected.resolved) return;
          setTrackMap(prev => { const n = {...prev}; delete n[selected.id]; return n; });
          setSelectedId(allIds.filter(i => i !== selected.id)[0] || null);
        }}/>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// TRACKING PANEL — single emergency Google Maps-style view
// ══════════════════════════════════════════════════════════
function TrackingPanel({ em, onDismiss }) {
  const locLine = loc => {
    if (!loc) return "—";
    return [loc.road || loc.address, loc.neighbourhood || loc.suburb || loc.area, loc.city]
      .filter(Boolean).join(", ") || loc.fullAddress || "—";
  };
  const coordStr = loc =>
    loc?.lat != null ? `${parseFloat(loc.lat).toFixed(5)}, ${parseFloat(loc.lng).toFixed(5)}` : "—";

  const step     = statusToStep(em.status);
  const etaMins  = em.eta ? Math.floor(em.eta / 60) : 0;
  const etaSecs  = em.eta ? em.eta % 60 : 0;
  const etaStr   = em.eta > 0 ? `${etaMins}:${String(etaSecs).padStart(2,"0")}` : em.onScene ? "ON SCENE" : "--:--";
  const etaUrgent = em.eta > 0 && em.eta < 90;

  const emLat    = em.location?.lat || 22.7196;
  const emLng    = em.location?.lng || 75.8577;

  // Best next signal: prefer vehicle's live nextSignal, fallback to nearest in signals[]
  const nextSig  = em.nextSignal || (em.signals.length > 0
    ? [...em.signals].sort((a, b) => (a.distanceKm || 9) - (b.distanceKm || 9))[0]
    : null);

  const priorityColor = PRI[em.priority] || "var(--accent)";
  const distKmDisplay = em.distRemaining != null
    ? (em.distRemaining < 1 ? `${Math.round(em.distRemaining * 1000)}m` : `${em.distRemaining.toFixed(1)}km`)
    : em.distanceKm ? `${parseFloat(em.distanceKm).toFixed(1)}km` : null;

  return (
    <div>

      {/* ══ STATUS HERO CARD ════════════════════════════════ */}
      <div className="card mb-16" style={{
        border: `2px solid ${em.resolved ? "var(--green)" : em.onScene ? "var(--green)" : em.vehicleId ? "var(--accent)" : "var(--orange)"}`,
        background: em.resolved ? "rgba(0,230,118,0.06)" : em.onScene ? "rgba(0,230,118,0.04)" : em.vehicleId ? "var(--accent-dim)" : "var(--orange-dim)",
      }}>

        {/* Main status display */}
        {em.resolved ? (
          <div style={{ textAlign:"center", padding:"8px 0" }}>
            <div style={{ fontSize:52, marginBottom:8 }}>✅</div>
            <h2 style={{ fontFamily:"var(--font-display)", fontSize:26, color:"var(--green)", letterSpacing:2 }}>EMERGENCY RESOLVED</h2>
            {em.responseTime > 0 && (
              <div style={{ color:"var(--green)", fontSize:14, marginTop:4 }}>Response time: {fmtSecs(em.responseTime)}</div>
            )}
            <button className="btn btn-ghost btn-sm" style={{ marginTop:12 }} onClick={onDismiss}>
              Dismiss →
            </button>
          </div>

        ) : em.onScene ? (
          <div style={{ textAlign:"center", padding:"8px 0" }}>
            <div style={{ fontSize:48 }}>📍</div>
            <h2 style={{ fontFamily:"var(--font-display)", fontSize:22, color:"var(--green)", marginTop:8 }}>HELP IS ON SCENE</h2>
            <p style={{ color:"var(--text-muted)", fontSize:13, marginTop:6 }}>
              {em.vehicleId ? `${VC[em.vehicleType]||"🚑"} Unit ${em.vehicleId}` : "Unit"} has arrived at your location.
            </p>
            <p style={{ color:"var(--text-dim)", fontSize:12, marginTop:4 }}>Awaiting operator confirmation.</p>
          </div>

        ) : em.vehicleId ? (
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:10, color:"var(--text-muted)", fontFamily:"var(--font-mono)", letterSpacing:"2px", marginBottom:4 }}>
              ESTIMATED ARRIVAL TIME
            </div>
            <div style={{
              fontFamily:"var(--font-display)", fontWeight:900, letterSpacing:4,
              fontSize: etaUrgent ? 54 : 48,
              color: etaUrgent ? "var(--red)" : em.eta > 180 ? "var(--accent)" : "var(--orange)",
              textShadow: etaUrgent ? "0 0 20px rgba(255,64,96,0.5)" : "none",
              lineHeight:1, marginBottom:8,
            }}>{etaStr}</div>
            <div style={{ color:"var(--text-muted)", fontSize:13, display:"flex", justifyContent:"center", gap:14, flexWrap:"wrap" }}>
              <span>{VC[em.vehicleType]||"🚑"} <b style={{ color:"var(--accent)" }}>{em.vehicleId}</b></span>
              {em.routeProgress > 0 && (
                <span style={{ color:"var(--green)", fontWeight:700 }}>· {em.routeProgress}% done</span>
              )}
              {em.liveSpeed > 0 && !em.paused && (
                <span style={{ color:"var(--orange)" }}>· {em.liveSpeed} km/h</span>
              )}
              {em.paused && <span style={{ color:"var(--red)" }}>· STOPPED at signal</span>}
            </div>
            {em.allUnits.length > 1 && (
              <div style={{ marginTop:6, fontSize:12, color:"var(--text-muted)" }}>
                All units: {em.allUnits.join(" · ")}
              </div>
            )}
          </div>

        ) : (
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:36, display:"inline-block" }}>⏳</div>
            <div style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:700, marginTop:8 }}>
              Waiting for Operator
            </div>
            <div style={{ color:"var(--text-muted)", fontSize:13, marginTop:6 }}>
              Emergency team is reviewing your report…
            </div>
          </div>
        )}

        {/* ── 5-step progress indicator ── */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
          marginTop:20, position:"relative" }}>
          {/* Track line */}
          <div style={{ position:"absolute", top:14, left:"8%", right:"8%", height:2,
            background:"var(--border)", zIndex:0 }}/>
          {/* Progress fill */}
          <div style={{ position:"absolute", top:14, left:"8%", height:2, zIndex:1,
            background:"linear-gradient(90deg,var(--accent),var(--green))",
            width:`${Math.min(100, step * 25)}%`, transition:"width 1.5s ease" }}/>
          {STEPS.map((s, idx) => (
            <div key={idx} style={{ display:"flex", flexDirection:"column", alignItems:"center",
              gap:4, flex:1, position:"relative", zIndex:2 }}>
              <div style={{
                width:28, height:28, borderRadius:"50%",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:14, border:"2px solid",
                background: idx < step ? "var(--green)" : idx === step ? "var(--accent)" : "var(--bg-elevated)",
                borderColor: idx < step ? "var(--green)" : idx === step ? "var(--accent)" : "var(--border)",
                boxShadow: idx === step ? "0 0 12px rgba(0,200,255,0.5)" : "none",
                transition:"all 0.5s",
              }}>{s.icon}</div>
              <div style={{ fontSize:9, fontFamily:"var(--font-display)", fontWeight:700, textAlign:"center", maxWidth:56,
                color: idx === step ? "var(--accent)" : idx < step ? "var(--green)" : "var(--text-dim)" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── Route progress bar ── */}
        {em.vehicleId && !em.resolved && em.routeProgress > 0 && (
          <div style={{ marginTop:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:11,
              color:"var(--text-muted)", marginBottom:4 }}>
              <span>{VC[em.vehicleType]||"🚑"} Dispatch</span>
              <span style={{ color:"var(--green)", fontWeight:700 }}>{em.routeProgress}%</span>
              <span>📍 You</span>
            </div>
            <div style={{ height:8, background:"var(--bg-elevated)", borderRadius:4, overflow:"hidden" }}>
              <div style={{ height:"100%", borderRadius:4,
                background:"linear-gradient(90deg,var(--accent),var(--green))",
                width:`${em.routeProgress}%`, transition:"width 1.5s ease" }}/>
            </div>
            {distKmDisplay && (
              <div style={{ fontSize:11, color:"var(--text-dim)", marginTop:4, textAlign:"right" }}>
                {distKmDisplay} remaining
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ STATS GRID ════════════════════════════════════════ */}
      <div className="stat-grid mb-16" style={{ gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))" }}>

        {/* Location */}
        <div className="stat-card">
          <div className="stat-label">📍 Location</div>
          <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:11,
            color:"var(--accent)", marginTop:4, lineHeight:1.4 }}>
            {locLine(em.location)}
          </div>
          {em.location?.city && (
            <div className="stat-sub">{[em.location.city, em.location.state].filter(Boolean).join(", ")}</div>
          )}
          <div style={{ fontFamily:"monospace", fontSize:9, color:"var(--text-dim)", marginTop:1 }}>
            {coordStr(em.location)}
          </div>
        </div>

        {/* Priority */}
        <div className="stat-card">
          <div className="stat-label">🚨 Priority</div>
          <div className="stat-value" style={{ fontSize:18, color: priorityColor }}>{em.priority}</div>
          <div className="stat-sub">{TI[em.type]} {em.type}</div>
        </div>

        {/* Live speed */}
        {em.vehicleId && !em.onScene && (
          <div className="stat-card">
            <div className="stat-label">🚀 Speed</div>
            <div className="stat-value" style={{ fontSize:22,
              color: em.paused ? "var(--red)" : em.liveSpeed > 50 ? "var(--green)" : "var(--orange)" }}>
              {em.paused ? "⏸" : em.liveSpeed}
              {!em.paused && <span style={{ fontSize:10, marginLeft:2 }}>km/h</span>}
            </div>
            <div className="stat-sub">{em.phase}</div>
          </div>
        )}

        {/* Distance */}
        {distKmDisplay && !em.onScene && (
          <div className="stat-card">
            <div className="stat-label">📏 Remaining</div>
            <div className="stat-value" style={{ fontSize:22, color:"var(--accent)" }}>{distKmDisplay}</div>
          </div>
        )}

        {/* Severity */}
        {em.severityScore > 0 && (
          <div className="stat-card">
            <div className="stat-label">⚠️ Severity</div>
            <div className="stat-value" style={{ fontSize:22,
              color: em.severityScore >= 70 ? "var(--red)" : em.severityScore >= 40 ? "var(--yellow)" : "var(--green)" }}>
              {em.severityScore}<span style={{ fontSize:10 }}>/100</span>
            </div>
          </div>
        )}

        {/* Vehicle */}
        {em.vehicleId && (
          <div className="stat-card">
            <div className="stat-label">🚑 Unit</div>
            <div className="stat-value" style={{ fontSize:16, color:"var(--accent)" }}>{em.vehicleId}</div>
            <div className="stat-sub">{em.vehicleType}</div>
          </div>
        )}

        {/* Dispatch carbon/dist */}
        {em.dispatchInfo?.distanceKm > 0 && (
          <div className="stat-card">
            <div className="stat-label">📐 Total Dist</div>
            <div className="stat-value" style={{ fontSize:18, color:"var(--accent)" }}>
              {parseFloat(em.dispatchInfo.distanceKm).toFixed(1)}km
            </div>
            {em.dispatchInfo.vehicleFuel && (
              <div className="stat-sub">{em.dispatchInfo.vehicleFuel}</div>
            )}
          </div>
        )}

        {/* AI Recommendation — full width */}
        {em.aiRecommendation && (
          <div style={{ gridColumn:"1/-1", padding:"10px 14px",
            background:"rgba(0,200,255,0.06)", border:"1px solid rgba(0,200,255,0.2)",
            borderRadius:"var(--radius-md)" }}>
            <div style={{ fontSize:11, color:"var(--accent)", fontWeight:700, marginBottom:4 }}>
              💡 AI Advisory:
            </div>
            <div style={{ fontSize:12, color:"var(--text-secondary)", lineHeight:1.7 }}>
              {em.aiRecommendation}
            </div>
          </div>
        )}
      </div>

      {/* ══ SIGNAL CORRIDOR — only after vehicle dispatched ══ */}
      {em.vehicleId && !em.resolved && (
        <div className="card mb-16" style={{ padding:"12px 14px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:13 }}>
              🚦 Signal Corridor
            </div>
            {em.signals.some(s => s.state === "GREEN") && (
              <span style={{ fontSize:10, padding:"2px 10px", borderRadius:12, fontWeight:700,
                background:"rgba(0,230,118,0.15)", color:"var(--green)",
                border:"1px solid rgba(0,230,118,0.35)" }}>
                ✓ GREEN CORRIDOR ACTIVE
              </span>
            )}
          </div>

          {/* Next signal hero */}
          {nextSig ? (
            <div style={{ display:"flex", gap:14, alignItems:"center", padding:"12px 14px",
              marginBottom:12, borderRadius:"var(--radius-md)",
              background: nextSig.state==="GREEN" ? "rgba(0,230,118,0.07)"
                         : nextSig.state==="YELLOW" ? "rgba(255,214,0,0.07)"
                         : "rgba(255,64,96,0.07)",
              border:`1px solid ${nextSig.state==="GREEN"?"rgba(0,230,118,0.3)"
                    :nextSig.state==="YELLOW"?"rgba(255,214,0,0.3)":"rgba(255,64,96,0.3)"}` }}>
              {/* Traffic light graphic */}
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4,
                padding:"8px 10px", background:"rgba(0,0,0,0.35)", borderRadius:10, minWidth:32 }}>
                {["RED","YELLOW","GREEN"].map(st => (
                  <div key={st} style={{ width:16, height:16, borderRadius:"50%",
                    background: nextSig.state === st
                      ? (st==="RED"?"#ff4060":st==="YELLOW"?"#ffd600":"#00e676") : "#1a2535",
                    boxShadow: nextSig.state === st
                      ? `0 0 14px ${st==="RED"?"#ff4060":st==="YELLOW"?"#ffd600":"#00e676"}` : "none",
                    transition:"all 0.3s",
                  }}/>
                ))}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, color:"var(--text-muted)", marginBottom:2 }}>NEXT SIGNAL AHEAD</div>
                <div style={{ fontFamily:"var(--font-display)", fontWeight:900, fontSize:20,
                  color: nextSig.state==="GREEN"?"var(--green)":nextSig.state==="YELLOW"?"var(--yellow)":"var(--red)" }}>
                  {nextSig.state}
                </div>
                <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>
                  {nextSig.signalId}
                  {nextSig.distanceKm != null && ` · ${Math.round(nextSig.distanceKm * 1000)}m ahead`}
                </div>
              </div>
              <div style={{ fontSize:32 }}>
                {nextSig.state==="GREEN"?"✅":nextSig.state==="YELLOW"?"⚠️":"🛑"}
              </div>
            </div>
          ) : (
            <div style={{ fontSize:12, color:"var(--text-muted)", padding:"6px 0", marginBottom:8 }}>
              No signals detected yet — signals appear as vehicle approaches intersections
            </div>
          )}

          {/* All signals strip */}
          {em.signals.length > 0 && (
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {em.signals.slice(0, 12).map(s => {
                const c = s.state==="GREEN"?"#00e676":s.state==="YELLOW"?"#ffd600":"#ff4060";
                const isNext = nextSig?.signalId === s.signalId;
                return (
                  <div key={s.signalId} style={{ display:"flex", flexDirection:"column", alignItems:"center",
                    gap:3, padding:"7px 9px", background:"var(--bg-elevated)", borderRadius:10,
                    border:`1px solid ${isNext ? c+"77" : "var(--border)"}`,
                    transform: isNext ? "scale(1.1)" : "none", transition:"all 0.3s", minWidth:52 }}>
                    <div style={{ display:"flex", flexDirection:"column", gap:2, alignItems:"center" }}>
                      {["RED","YELLOW","GREEN"].map(st => (
                        <div key={st} style={{ width:8, height:8, borderRadius:"50%",
                          background: s.state===st ? c : "#1a2535",
                          boxShadow: s.state===st ? `0 0 6px ${c}` : "none" }}/>
                      ))}
                    </div>
                    <div style={{ fontSize:8, color:"var(--text-dim)", fontFamily:"var(--font-mono)",
                      textAlign:"center" }}>{s.signalId}</div>
                    {s.distanceKm != null && (
                      <div style={{ fontSize:8, color:"var(--text-dim)" }}>{Math.round(s.distanceKm*1000)}m</div>
                    )}
                    {isNext && <div style={{ fontSize:8, color:c, fontWeight:700 }}>NEXT</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ LIVE MAP ══════════════════════════════════════════ */}
      {/* Route info strip — shows what route data we have */}
      {em.vehicleId && !em.resolved && (
        <div style={{
          display:"flex", gap:10, alignItems:"center", flexWrap:"wrap",
          padding:"8px 14px", marginBottom:8,
          background: em.route?.length >= 2 ? "rgba(0,200,255,0.08)" : "rgba(255,144,0,0.08)",
          border: `1px solid ${em.route?.length >= 2 ? "rgba(0,200,255,0.25)" : "rgba(255,144,0,0.35)"}`,
          borderRadius:"var(--radius-md)", fontSize:12
        }}>
          <span style={{ fontSize:16 }}>{em.route?.length >= 2 ? "🛣" : "⏳"}</span>
          <span style={{ color:"var(--text-secondary)" }}>
            {em.route?.length >= 2
              ? `Route loaded · ${em.route.length} waypoints · ${em.distanceKm ? em.distanceKm + " km" : ""}`
              : "Loading road route from server…"}
          </span>
          {em.route?.length >= 2 && em.routeProgress > 0 && (
            <span style={{ marginLeft:"auto", color:"var(--accent)", fontWeight:700 }}>
              {em.routeProgress}% covered
            </span>
          )}
        </div>
      )}
      <div style={{ borderRadius:"var(--radius-lg)", overflow:"hidden", marginBottom:16 }}>
        <MapService
          mode="citizen"
          emergencyLat={emLat}
          emergencyLng={emLng}
          emergencyLocation={em.location}
          vehiclePos={em.vehiclePos}
          vehicleHeading={em.vehicleHeading}
          vehicleId={em.vehicleId}
          vehicleType={em.vehicleType}
          priority={em.priority}
          route={em.route}
          altRoute={em.altRoute}
          routeProgress={em.routeProgress}
          routeSteps={em.routeSteps}
          eta={em.eta}
          distanceKm={em.distRemaining ?? em.distanceKm}
          signals={em.vehicleId ? em.signals : []}
          vehicleArrived={em.onScene || em.resolved}
          height={480}
          nextSignal={em.vehicleId ? nextSig : null}
          distRemaining={em.distRemaining}
          liveSpeed={em.liveSpeed}
          showRoute={true}
          tileLayer="street"
        />
      </div>

      {/* ══ GOOGLE MAPS STYLE NAVIGATION ══════════════════════ */}
      {em.routeSteps.length > 0 && !em.resolved && !em.onScene && (() => {
        const curIdx  = em.currentStepIdx || 0;
        const curStep = em.routeSteps[curIdx];
        const nxtStep = em.routeSteps[curIdx + 1];
        const fmtDist = d => d > 1000 ? `${(d/1000).toFixed(1)} km` : `${Math.round(d)} m`;
        const ARROW = instr => {
          if (!instr) return "⬆️";
          const l = instr.toLowerCase();
          if (l.includes("left"))         return "⬅️";
          if (l.includes("right"))        return "➡️";
          if (l.includes("u-turn"))       return "↩️";
          if (l.includes("slight left"))  return "↖️";
          if (l.includes("slight right")) return "↗️";
          if (l.includes("roundabout"))   return "🔄";
          if (l.includes("destination"))  return "📍";
          if (l.includes("depart"))       return "🚦";
          return "⬆️";
        };
        return (
          <div className="card mb-16" style={{ padding:0, overflow:"hidden" }}>
            {/* Current instruction — big Google Maps style */}
            <div style={{
              background:"var(--accent)", color:"#000",
              padding:"14px 18px", display:"flex", alignItems:"center", gap:14
            }}>
              <span style={{ fontSize:34, lineHeight:1 }}>{ARROW(curStep?.instruction)}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:"var(--font-display)", fontWeight:900,
                  fontSize:17, letterSpacing:0.5, lineHeight:1.2 }}>
                  {curStep?.instruction || curStep?.name || "Continue straight"}
                </div>
                {curStep?.distance > 0 && (
                  <div style={{ fontSize:12, marginTop:4, opacity:0.75 }}>
                    for {fmtDist(curStep.distance)}
                  </div>
                )}
              </div>
              <div style={{ textAlign:"center", borderLeft:"2px solid rgba(0,0,0,0.15)",
                paddingLeft:14, minWidth:56 }}>
                <div style={{ fontFamily:"var(--font-display)", fontWeight:900, fontSize:22 }}>
                  {em.routeProgress || 0}%
                </div>
                <div style={{ fontSize:10, opacity:0.7 }}>done</div>
              </div>
            </div>

            {/* Next step preview */}
            {nxtStep && (
              <div style={{ padding:"10px 18px", background:"var(--bg-elevated)",
                borderBottom:"1px solid var(--border)",
                display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontSize:18, opacity:0.6 }}>{ARROW(nxtStep?.instruction)}</span>
                <div style={{ flex:1, fontSize:12, color:"var(--text-secondary)" }}>
                  <span style={{ color:"var(--text-muted)", marginRight:6 }}>Then:</span>
                  {nxtStep.instruction || nxtStep.name || "Continue"}
                </div>
                {nxtStep.distance > 0 && (
                  <span style={{ fontSize:11, color:"var(--text-dim)", whiteSpace:"nowrap" }}>
                    {fmtDist(nxtStep.distance)}
                  </span>
                )}
              </div>
            )}

            {/* All steps scrollable list */}
            <div style={{ maxHeight:160, overflowY:"auto" }}>
              {em.routeSteps.map((s, i) => {
                const isC = i === curIdx;
                const isDone = i < curIdx;
                return (
                  <div key={i} style={{
                    display:"flex", gap:12, padding:"8px 18px", fontSize:12,
                    background: isC ? "rgba(0,200,255,0.08)" : "transparent",
                    borderLeft: isC ? "3px solid var(--accent)" : "3px solid transparent",
                    opacity: isDone ? 0.4 : 1,
                    transition:"all 0.3s"
                  }}>
                    <span style={{ fontSize:14, minWidth:22 }}>{ARROW(s.instruction)}</span>
                    <span style={{ flex:1,
                      color: isC ? "var(--text-primary)" : "var(--text-secondary)",
                      fontWeight: isC ? 700 : 400,
                      textDecoration: isDone ? "line-through" : "none" }}>
                      {s.instruction || s.name || "Continue"}
                    </span>
                    {s.distance > 0 && (
                      <span style={{ color:"var(--text-dim)", fontSize:11, whiteSpace:"nowrap" }}>
                        {fmtDist(s.distance)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Route summary footer */}
            <div style={{ padding:"8px 18px", background:"var(--bg-card)",
              borderTop:"1px solid var(--border)",
              display:"flex", gap:20, fontSize:11, color:"var(--text-muted)" }}>
              <span>🛣 {em.distanceKm ? `${em.distanceKm} km` : "—"}</span>
              <span>↩ {em.routeSteps.length} turns</span>
              {em.dispatchInfo?.hasAlt && <span style={{ color:"var(--accent)" }}>🔀 Alt route on map</span>}
            </div>
          </div>
        );
      })()}

      {/* ══ ML TAGS ══════════════════════════════════════════ */}
      {em.mlTags?.length > 0 && (
        <div className="card mb-14" style={{ padding:"10px 14px" }}>
          <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:6 }}>🤖 ML ANALYSIS</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {em.mlTags.map(t => (
              <span key={t} style={{ fontSize:10, padding:"2px 10px", borderRadius:12,
                background:"var(--accent-dim)", border:"1px solid rgba(0,200,255,0.3)", color:"var(--accent)" }}>
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ══ ALT ROUTE INFO ═══════════════════════════════════ */}
      {em.dispatchInfo?.hasAlt && em.altRoute.length > 0 && !em.resolved && (
        <div className="card mb-14" style={{ padding:"10px 14px" }}>
          <div style={{ display:"flex", gap:10, alignItems:"center", fontSize:12 }}>
            <span style={{ fontSize:18 }}>🔀</span>
            <div>
              <div style={{ fontWeight:700 }}>Alternative route available on map</div>
              <div style={{ color:"var(--text-muted)", marginTop:2 }}>
                Fastest primary route selected · Alt: {em.dispatchInfo.altDistKm?.toFixed(1) || "?"}km
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
