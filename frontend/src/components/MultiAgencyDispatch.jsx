/**
 * MULTI-AGENCY DISPATCH MODAL
 * Operator can dispatch Fire + Ambulance + Police for a single incident
 */
import { useState, useEffect } from "react";
import api from "../services/api";

const AGENCY_ICONS = { Ambulance:"🚑", FireTruck:"🚒", Police:"🚔", HazMat:"☣️", FloodRescue:"🚤", TowTruck:"🔧" };
const VC  = { Ambulance:"🚑", FireTruck:"🚒", Police:"🚔", TowTruck:"🔧", HazMat:"☣️", FloodRescue:"🚤" };
const fmtETA = s => s < 60 ? `${s}s` : `~${Math.round(s/60)} min`;

export default function MultiAgencyDispatch({ emergency, onClose, onDispatched }) {
  const [suggestions, setSuggestions] = useState([]);
  const [vehicles,    setVehicles]    = useState([]);       // all available from /vehicles endpoint
  const [selected,    setSelected]    = useState([]);       // array of vehicleIds
  const [loading,     setLoading]     = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [error,       setError]       = useState("");
  const [result,      setResult]      = useState(null);
  const [activeTab,   setActiveTab]   = useState("suggested");

  useEffect(() => {
    (async () => {
      try {
        const [sg, vr] = await Promise.all([
          api.get(`/multi-agency/${emergency._id}/suggest`),
          api.get(`/emergencies/${emergency._id}/vehicles`),
        ]);
        setSuggestions(sg.data.suggestions || []);
        setVehicles(vr.data.vehicles || []);
        // Pre-select the best vehicle for the primary agency
        const best = sg.data.suggestions?.[0]?.bestVehicle?.vehicleId;
        if (best) setSelected([best]);
      } catch(e) { setError("Failed to load agency suggestions"); }
      finally { setLoading(false); }
    })();
  }, [emergency._id]);

  const toggleVehicle = (vid) => {
    setSelected(p => p.includes(vid) ? p.filter(v => v !== vid) : [...p, vid]);
  };

  const dispatch = async () => {
    if (!selected.length) { setError("Select at least one unit"); return; }
    setDispatching(true); setError("");
    try {
      const r = await api.post(`/multi-agency/${emergency._id}/dispatch`, { vehicleIds: selected });
      setResult(r.data);
      setTimeout(() => { onDispatched?.(r.data); }, 3000);
    } catch(e) { setError(e.response?.data?.error || "Dispatch failed"); }
    finally { setDispatching(false); }
  };

  if (result) return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth:500, textAlign:"center", padding:"32px 24px" }}>
        <div style={{ fontSize:52, marginBottom:12 }}>✅</div>
        <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:22, marginBottom:8 }}>Multi-Agency Dispatched!</div>
        <div style={{ color:"var(--text-muted)", fontSize:14, marginBottom:20 }}>{result.message}</div>
        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
          {result.dispatched?.map((d,i) => (
            <div key={i} style={{ background:d.status==="dispatched"?"var(--green-dim)":"var(--red-dim)", border:`1px solid ${d.status==="dispatched"?"var(--green)":"var(--red)"}`, borderRadius:"var(--radius-md)", padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <span style={{ fontSize:20 }}>{d.icon||AGENCY_ICONS[d.type]||"🚗"}</span>
                <div>
                  <div style={{ fontWeight:700, fontSize:13 }}>{d.name||d.vehicleId}</div>
                  <div style={{ fontSize:11, color:"var(--text-muted)" }}>{d.type}</div>
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <span className={`badge ${d.status==="dispatched"?"badge-green":"badge-red"}`}>{d.status==="dispatched"?"✓ En Route":d.reason||d.status}</span>
                {d.etaSecs && <div style={{ fontSize:10, color:"var(--text-muted)", marginTop:2 }}>ETA: {fmtETA(d.etaSecs)}</div>}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize:12, color:"var(--text-muted)" }}>Closing automatically…</div>
      </div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth:700, maxHeight:"92vh", overflowY:"auto" }}>

        {/* Header */}
        <div className="modal-title">
          <div>
            <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:20 }}>🚨 Multi-Agency Dispatch</div>
            <div style={{ fontSize:13, color:"var(--text-muted)", marginTop:3 }}>
              {emergency.type} Emergency · {emergency.location?.address || "—"}
            </div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <span className={`badge ${emergency.priority==="Critical"?"badge-red":"badge-orange"}`}>{emergency.priority}</span>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>

        {error && <div style={{ background:"var(--red-dim)", border:"1px solid var(--red)", borderRadius:"var(--radius-md)", padding:"9px 13px", marginBottom:12, color:"var(--red)", fontSize:13 }}>{error}</div>}

        {loading ? (
          <div style={{ padding:48, textAlign:"center", color:"var(--text-muted)" }}>
            <div style={{ fontSize:32, marginBottom:10 }}>⏳</div>Loading agency recommendations…
          </div>
        ) : (
          <>
            {/* Selection counter */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={{ fontSize:13, color:"var(--text-muted)" }}>
                {selected.length === 0 ? "Select units to dispatch" : `${selected.length} unit${selected.length>1?"s":""} selected`}
              </div>
              <div className="tab-bar" style={{ marginBottom:0, gap:4 }}>
                {[["suggested","AI Suggested"],["all","All Available"]].map(([id,l]) => (
                  <button key={id} className={`tab-btn ${activeTab===id?"active":""}`} style={{ padding:"4px 12px", fontSize:11 }} onClick={() => setActiveTab(id)}>{l}</button>
                ))}
              </div>
            </div>

            {/* Suggested agencies */}
            {activeTab==="suggested" && (
              <div>
                {suggestions.length === 0 ? (
                  <div style={{ textAlign:"center", padding:30, color:"var(--text-muted)" }}>No agency suggestions available</div>
                ) : suggestions.map((s,i) => (
                  <div key={i} style={{ marginBottom:14 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                      <span style={{ fontSize:20 }}>{s.icon||AGENCY_ICONS[s.type]||"🚗"}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:14 }}>{s.type}</div>
                        <div style={{ fontSize:12, color:"var(--text-muted)" }}>{s.reason} · {s.availableCount} available</div>
                      </div>
                    </div>
                    {s.bestVehicle ? (
                      <div onClick={() => toggleVehicle(s.bestVehicle.vehicleId)}
                        style={{ background:selected.includes(s.bestVehicle.vehicleId)?"var(--accent-dim)":"var(--bg-elevated)", border:`2px solid ${selected.includes(s.bestVehicle.vehicleId)?"var(--accent)":"var(--border)"}`, borderRadius:"var(--radius-md)", padding:"12px 14px", cursor:"pointer", transition:"var(--transition)", display:"flex", gap:12, alignItems:"center" }}>
                        <span style={{ fontSize:26 }}>{AGENCY_ICONS[s.bestVehicle.type]||"🚗"}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700, fontSize:14 }}>{s.bestVehicle.name||s.bestVehicle.vehicleId}</div>
                          <div style={{ fontSize:12, color:"var(--text-muted)", display:"flex", gap:8, marginTop:3 }}>
                            <span>📍 {s.bestVehicle.distanceKm}km</span>
                            <span>⏱ {fmtETA(s.bestVehicle.estimatedETA)}</span>
                            <span>{s.bestVehicle.fuelType==="EV"?"⚡":"⛽"} {s.bestVehicle.fuelPercent}%</span>
                          </div>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          {selected.includes(s.bestVehicle.vehicleId) ? (
                            <span className="badge badge-accent">✓ Selected</span>
                          ) : (
                            <span className="badge badge-muted">+ Add</span>
                          )}
                          <div style={{ fontSize:10, color:"var(--green)", marginTop:4 }}>AI Pick</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding:"10px 14px", borderRadius:"var(--radius-md)", background:"var(--red-dim)", border:"1px solid rgba(255,64,96,0.2)", fontSize:13, color:"var(--red)" }}>
                        ⚠️ No {s.type} available
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* All available vehicles */}
            {activeTab==="all" && (
              <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:380, overflowY:"auto" }}>
                {vehicles.length === 0 && <div style={{ textAlign:"center", padding:28, color:"var(--text-muted)" }}>No vehicles available</div>}
                {vehicles.map(v => (
                  <div key={v.vehicleId} onClick={() => toggleVehicle(v.vehicleId)}
                    style={{ background:selected.includes(v.vehicleId)?"var(--accent-dim)":"var(--bg-card)", border:`1.5px solid ${selected.includes(v.vehicleId)?"var(--accent)":"var(--border)"}`, borderRadius:"var(--radius-md)", padding:"11px 14px", cursor:"pointer", transition:"var(--transition)", display:"flex", gap:10, alignItems:"center" }}>
                    <span style={{ fontSize:22 }}>{VC[v.type]||"🚗"}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:13 }}>{v.name||v.vehicleId} <span style={{ fontSize:11, color:"var(--text-muted)", fontWeight:400 }}>· {v.type}</span></div>
                      <div style={{ fontSize:11, color:"var(--text-muted)", display:"flex", gap:8, marginTop:2 }}>
                        <span>📍 {v.distanceKm}km</span><span>⏱ {fmtETA(v.estimatedETA)}</span><span>{v.fuelType==="EV"?"⚡":"⛽"} {v.fuelPercent}%</span>
                      </div>
                    </div>
                    {selected.includes(v.vehicleId) ? <span className="badge badge-accent">✓</span> : <span style={{ fontSize:11, color:"var(--text-dim)" }}>+</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Dispatch button */}
            <div style={{ marginTop:16, display:"flex", gap:10, alignItems:"center" }}>
              <button className="btn btn-danger" style={{ flex:1, justifyContent:"center", fontFamily:"var(--font-display)", fontSize:15, letterSpacing:"0.5px" }}
                onClick={dispatch} disabled={dispatching || !selected.length}>
                {dispatching ? "⏳ Dispatching All Units…" : `🚨 DISPATCH ${selected.length} UNIT${selected.length!==1?"S":""}`}
              </button>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
