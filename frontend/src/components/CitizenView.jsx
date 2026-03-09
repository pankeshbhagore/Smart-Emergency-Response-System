/**
 * CITIZENVIEW v15 — Complete rewrite
 * ════════════════════════════════════════════════════════════
 * FIXES & ENHANCEMENTS:
 *  1. Full tracking state restored after logout/re-login:
 *     - vehicle position from DB, dispatch info, location details
 *  2. "On Scene" status shown (vehicle arrived, waiting for operator resolve)
 *  3. "Resolved" from operator → history saves, UI shows mission complete
 *  4. ETA countdown resumes properly on restore
 *  5. Location shown as: road → area/neighbourhood → city, state
 *  6. History panel shows full location + response time + SLA
 *  7. emergencyLocation prop passed to MapService for rich popups
 *  8. Operator Chatbot (ChatPanel) and AI Chatbot are separate tabs
 *  9. vehicleOnScene event handled
 * 10. All v10 features preserved: voice, GPS, AI detect, first aid, nearby, alerts, weather
 */
import { useState, useEffect, useCallback, useRef } from "react";
import api    from "../services/api";
import socket from "../services/socket";
import MapService     from "./MapService";
import FirstAidGuide  from "./FirstAidGuide";
import NearbyServices from "./NearbyServices";
import { CitizenAlerts } from "./CommunityAlerts";
import ChatPanel from "./ChatPanel";
import EmergencyTracker, { notifyTrackerNewEmergency } from "./EmergencyTracker";

// ── Helpers ──────────────────────────────────────────────────
const WX = c => {
  if(!c) return "🌤";
  const l=c.toLowerCase();
  if(l.includes("thunder"))return "⛈"; if(l.includes("rain"))return "🌧";
  if(l.includes("snow"))return "❄️"; if(l.includes("fog"))return "🌫";
  if(l.includes("cloud"))return "☁️"; if(l.includes("clear")||l.includes("mainly"))return "☀️";
  return "🌤";
};
const fmtSecs = s =>
  s>3600 ? `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
         : s>60   ? `${Math.floor(s/60)}m ${Math.round(s%60)}s`
                  : `${Math.round(s)}s`;

const STEPS = [
  { icon:"📱", label:"Reported",          desc:"Your emergency was received" },
  { icon:"👮", label:"Operator Notified", desc:"Emergency team is reviewing" },
  { icon:"🚑", label:"Unit En Route",     desc:"Help is on the way" },
  { icon:"📍", label:"On Scene",          desc:"Unit has arrived" },
  { icon:"✅", label:"Resolved",          desc:"Emergency resolved — you're safe" },
];

const TI = { Medical:"🏥", Fire:"🔥", Accident:"💥", Crime:"🚔", Breakdown:"🔧", Flood:"🌊", "Gas Leak":"💨", Other:"⚠️" };
const PC = { Critical:"var(--red)", High:"var(--orange)", Medium:"var(--yellow)", Normal:"var(--accent)", Low:"var(--green)" };

const DETECT = t => {
  const s=t.toLowerCase();
  if(s.match(/fire|burn|flame|smoke/))     return "Fire";
  if(s.match(/gas|leak|fumes|smell/))      return "Gas Leak";
  if(s.match(/flood|drown|water/))         return "Flood";
  if(s.match(/accident|crash|collision/))  return "Accident";
  if(s.match(/heart|medical|unconscious|bleeding|pain|faint/)) return "Medical";
  if(s.match(/crime|rob|assault|attack/))  return "Crime";
  if(s.match(/breakdown|car broke|tyre/))  return "Breakdown";
  return null;
};

const TYPE_OPTIONS = [
  { type:"Medical",   icon:"🏥", desc:"Heart attack, injury, illness" },
  { type:"Fire",      icon:"🔥", desc:"Building fire, wildfire" },
  { type:"Accident",  icon:"💥", desc:"Road accident, collision" },
  { type:"Crime",     icon:"🚔", desc:"Robbery, assault, threat" },
  { type:"Flood",     icon:"🌊", desc:"Flash flood, drowning risk" },
  { type:"Breakdown", icon:"🔧", desc:"Vehicle breakdown, stuck" },
  { type:"Gas Leak",  icon:"💨", desc:"Gas leak, toxic fumes" },
  { type:"Other",     icon:"⚠️", desc:"Other emergency" },
];

// Format location to human-readable line
const locLine = loc => {
  if (!loc) return "—";
  const parts = [
    loc.road || loc.address,
    loc.neighbourhood || loc.suburb || loc.area,
    loc.city,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : loc.fullAddress || loc.address || "—";
};
const locLine2 = loc => {
  if (!loc) return "";
  const parts = [loc.city, loc.state, loc.postcode].filter(Boolean);
  return parts.join(", ");
};
const coordStr = loc => loc?.lat!=null ? `${parseFloat(loc.lat).toFixed(5)}, ${parseFloat(loc.lng).toFixed(5)}` : "—";

// ── Voice hook ───────────────────────────────────────────────
function useVoice({ onResult, onError }) {
  const [listening, setListening] = useState(false);
  const ref = useRef(null);
  const supported = typeof window!=="undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  const start = useCallback(() => {
    if (!supported) { onError?.("Voice not supported. Use Chrome."); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR(); r.lang="en-IN"; r.continuous=false; r.interimResults=false;
    r.onstart = ()=>setListening(true); r.onend = ()=>setListening(false);
    r.onerror = e=>{ setListening(false); onError?.(`Voice error: ${e.error}`); };
    r.onresult = e=>onResult?.(Array.from(e.results).map(r=>r[0].transcript).join(" "));
    r.start(); ref.current=r;
  }, [supported, onResult, onError]);
  const stop = useCallback(()=>{ ref.current?.stop(); setListening(false); }, []);
  return { listening, start, stop, supported };
}

// ── Citizen Profile + History modal ─────────────────────────
function CitizenDashboard({ onClose }) {
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form,    setForm]    = useState({});
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState("");
  const [tab,     setTab]     = useState("profile");
  const [selected,setSelected]= useState(null);

  useEffect(() => {
    (async ()=>{
      try {
        const [p,h] = await Promise.all([api.get("/auth/profile"), api.get("/auth/my-emergencies")]);
        setProfile(p.data);
        setForm({ name:p.data.name||"", phone:p.data.phone||"", address:p.data.address||"",
                  bloodGroup:p.data.bloodGroup||"", emergencyContact:p.data.emergencyContact||"" });
        setHistory(h.data);
      } catch(e){}
    })();
  }, []);

  const save = async () => {
    setSaving(true); setMsg("");
    try {
      const r = await api.put("/auth/profile", form);
      setProfile(r.data.user); setEditing(false);
      setMsg("✅ Profile saved!"); setTimeout(()=>setMsg(""), 4000);
    } catch(e) { setMsg("❌ Save failed"); }
    finally { setSaving(false); }
  };

  const s = profile?.stats;

  return (
    <div className="modal-overlay" onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth:680, maxHeight:"92vh", overflowY:"auto" }}>
        <div className="modal-title">
          <div>
            <div style={{ fontFamily:"var(--font-display)", fontSize:20, fontWeight:700 }}>👤 My Profile & History</div>
            <div style={{ fontSize:12, color:"var(--text-muted)", marginTop:2 }}>Emergency records and account details</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Stats row */}
        {s && (
          <div className="stat-grid mb-16" style={{ gridTemplateColumns:"repeat(4,1fr)" }}>
            {[
              { l:"Total Reports", v:s.total||0,    c:"var(--accent)" },
              { l:"Resolved",      v:s.resolved||0,  c:"var(--green)" },
              { l:"Avg Response",  v:s.avgResponseTime?fmtSecs(s.avgResponseTime):"—", c:"var(--yellow)" },
              { l:"Active",        v:s.active||0,    c:s.active>0?"var(--red)":"var(--green)" },
            ].map(c=>(
              <div key={c.l} className="stat-card" style={{ padding:"10px 12px" }}>
                <div className="stat-label" style={{ fontSize:10 }}>{c.l}</div>
                <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:20, color:c.c, marginTop:4 }}>{c.v}</div>
              </div>
            ))}
          </div>
        )}

        <div className="tab-bar mb-14">
          {[["profile","👤 Profile"],["history","📋 History"]].map(([id,l])=>(
            <button key={id} className={`tab-btn ${tab===id?"active":""}`} onClick={()=>setTab(id)}>{l}</button>
          ))}
        </div>

        {/* ── Profile tab ── */}
        {tab==="profile" && (
          <div>
            {msg && <div style={{ marginBottom:12, padding:"8px 12px", borderRadius:8,
              background:msg.includes("✅")?"var(--green-dim)":"var(--red-dim)",
              color:msg.includes("✅")?"var(--green)":"var(--red)", fontSize:13 }}>{msg}</div>}
            {editing ? (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {[
                  { field:"name",             label:"Full Name",           placeholder:"Your full name",     type:"text" },
                  { field:"phone",            label:"📞 Mobile",           placeholder:"+91 98765 43210",   type:"tel" },
                  { field:"address",          label:"🏠 Home Address",     placeholder:"Your address",      type:"text" },
                  { field:"bloodGroup",       label:"🩸 Blood Group",      placeholder:"A+, B-, O+, AB+…", type:"text" },
                  { field:"emergencyContact", label:"🆘 Emergency Contact",placeholder:"Name + phone",     type:"text" },
                ].map(({ field,label,placeholder,type })=>(
                  <div key={field}>
                    <label className="form-label">{label}</label>
                    <input className="form-input" type={type} placeholder={placeholder}
                      value={form[field]||""} onChange={e=>setForm(f=>({...f,[field]:e.target.value}))}/>
                  </div>
                ))}
                <div style={{ display:"flex", gap:10, marginTop:4 }}>
                  <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?"Saving…":"💾 Save"}</button>
                  <button className="btn btn-ghost" onClick={()=>setEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div>
                {[
                  { label:"Name",             val:profile?.name },
                  { label:"Email",            val:profile?.email },
                  { label:"Phone",            val:profile?.phone||"Not set" },
                  { label:"Address",          val:profile?.address||"Not set" },
                  { label:"Blood Group",      val:profile?.bloodGroup||"Not set" },
                  { label:"Emergency Contact",val:profile?.emergencyContact||"Not set" },
                ].map(({ label,val })=>(
                  <div key={label} style={{ display:"flex", justifyContent:"space-between",
                    padding:"10px 0", borderBottom:"1px solid var(--border)", fontSize:13 }}>
                    <span style={{ color:"var(--text-muted)" }}>{label}</span>
                    <span style={{ fontWeight:600, color:val==="Not set"?"var(--text-dim)":"var(--text-primary)" }}>{val||"—"}</span>
                  </div>
                ))}
                <button className="btn btn-primary btn-sm" style={{ marginTop:14 }} onClick={()=>setEditing(true)}>✏️ Edit Profile</button>
              </div>
            )}
          </div>
        )}

        {/* ── History tab ── */}
        {tab==="history" && (
          <div>
            {history.length===0 ? (
              <div style={{ textAlign:"center", padding:40, color:"var(--text-muted)" }}>
                <div style={{ fontSize:36, marginBottom:8 }}>📋</div>
                <div>No emergency history yet</div>
              </div>
            ) : history.map(e=>(
              <div key={e._id}>
                <div onClick={()=>setSelected(selected===e._id?null:e._id)}
                  style={{ marginBottom:4, padding:"12px 14px", borderRadius:"var(--radius-md)",
                    background:"var(--bg-elevated)", border:"1px solid var(--border)",
                    borderLeft:`3px solid ${e.status==="Resolved"?"var(--green)":e.status==="On Scene"?"var(--accent)":e.status==="Assigned"?"var(--orange)":"var(--red)"}`,
                    cursor:"pointer" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:14 }}>{TI[e.type]||"⚠️"} {e.type}</div>
                      <div style={{ fontSize:12, color:"var(--accent)", marginTop:2 }}>
                        📍 {locLine(e.location)}
                      </div>
                      {e.location?.city && e.location.city !== e.location.address && (
                        <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:1 }}>
                          🌆 {locLine2(e.location)}
                        </div>
                      )}
                      <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:3, display:"flex", gap:10, flexWrap:"wrap" }}>
                        <span>🕐 {new Date(e.createdAt).toLocaleString()}</span>
                        {e.assignedVehicle && <span>🚑 {e.assignedVehicle}</span>}
                        {e.responseTime>0 && <span style={{ color:"var(--green)" }}>⏱ {fmtSecs(e.responseTime)}</span>}
                      </div>
                    </div>
                    <span className={`badge ${e.status==="Resolved"?"badge-green":e.status==="On Scene"?"badge-accent":e.status==="Assigned"?"badge-orange":"badge-red"}`}>
                      {e.status}
                    </span>
                  </div>
                  {e.severityScore>0 && (
                    <div style={{ marginTop:8, height:4, background:"var(--bg-card)", borderRadius:2, overflow:"hidden" }}>
                      <div style={{ height:"100%", borderRadius:2,
                        background:e.severityScore>=70?"var(--red)":e.severityScore>=40?"var(--yellow)":"var(--green)",
                        width:`${e.severityScore}%`, transition:"width 0.5s" }}/>
                    </div>
                  )}
                </div>
                {/* Expanded detail */}
                {selected===e._id && (
                  <div style={{ marginBottom:10, padding:"12px 14px", background:"var(--bg-card)",
                    border:"1px solid var(--border)", borderRadius:"var(--radius-md)", fontSize:12 }}>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                      {[
                        ["Priority",       e.priority||"—"],
                        ["Severity Score", e.severityScore?`${e.severityScore}/100`:"—"],
                        ["Vehicle",        e.assignedVehicle||"Not dispatched"],
                        ["Response Time",  e.responseTime?fmtSecs(e.responseTime):"—"],
                        ["Resolution",     e.resolutionTime?fmtSecs(e.resolutionTime):"—"],
                        ["SLA",            e.sla?.breached!=null?(e.sla.breached?"⚠️ Breached":"✓ Met"):"—"],
                        ["Carbon Saved",   e.carbonSaved?`${e.carbonSaved}kg CO₂`:"—"],
                        ["Distance",       e.distanceKm?`${e.distanceKm}km`:"—"],
                      ].map(([l,v])=>(
                        <div key={l} style={{ padding:"6px 0", borderBottom:"1px solid var(--border)" }}>
                          <span style={{ color:"var(--text-muted)", display:"block", fontSize:10, marginBottom:2 }}>{l}</span>
                          <span style={{ fontWeight:600 }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    {e.mlTags?.length>0 && (
                      <div style={{ marginTop:8, display:"flex", gap:4, flexWrap:"wrap" }}>
                        {e.mlTags.map(t=>(
                          <span key={t} style={{ fontSize:10, padding:"2px 8px", borderRadius:12,
                            background:"var(--accent-dim)", border:"1px solid rgba(0,200,255,0.3)",
                            color:"var(--accent)" }}>{t}</span>
                        ))}
                      </div>
                    )}
                    {e.description && (
                      <div style={{ marginTop:8, color:"var(--text-muted)", fontStyle:"italic", fontSize:12 }}>
                        "{e.description}"
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {/* ══ FIRST AID TAB ══ */}
      {tab==="firstaid" && (
        <div>
          <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:18, marginBottom:4 }}>
            🩺 First Aid Guide
          </div>
          <div style={{ fontSize:13, color:"var(--text-muted)", marginBottom:16 }}>
            Step-by-step guidance while waiting for emergency services
          </div>
          <FirstAidGuide defaultType={reportResult?.type||emergencyType||null}/>
        </div>
      )}

      {/* ══ OPERATOR CHAT TAB ══ */}
      {tab==="opchat" && (
        <div>
          {reportResult?.id && !resolved ? (
            <ChatPanel emergencyId={reportResult.id} role="citizen"/>
          ) : (
            <div style={{ textAlign:"center", padding:60, background:"var(--bg-card)",
              border:"1px solid var(--border)", borderRadius:"var(--radius-lg)" }}>
              <div style={{ fontSize:36, marginBottom:8 }}>💬</div>
              <h3 style={{ fontFamily:"var(--font-display)", fontSize:18, marginBottom:8 }}>No Active Emergency</h3>
              <p style={{ color:"var(--text-muted)", fontSize:13 }}>
                Report an emergency first to chat with the operator.
              </p>
              <button className="btn btn-primary" style={{ marginTop:14 }} onClick={()=>setTab("report")}>
                🆘 Report Emergency →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══ AI CHAT TAB ══ */}
      {tab==="chat" && (
        <div className="card" style={{ padding:0, overflow:"hidden" }}>
          <div style={{ padding:"14px 16px", borderBottom:"1px solid var(--border)",
            fontFamily:"var(--font-display)", fontWeight:700, fontSize:16 }}>
            🤖 AI Emergency Assistant
          </div>
          <div style={{ maxHeight:460, overflowY:"auto", padding:14, display:"flex",
            flexDirection:"column", gap:12 }}>
            {chatMessages.map((msg,i)=>(
              <div key={i} style={{
                display:"flex", flexDirection:msg.user?"row-reverse":"row", gap:10, alignItems:"flex-start"
              }}>
                {!msg.user && (
                  <div style={{ width:32, height:32, borderRadius:"50%", background:"var(--accent-dim)",
                    border:"1px solid var(--accent)", display:"flex", alignItems:"center",
                    justifyContent:"center", fontSize:14, flexShrink:0 }}>🤖</div>
                )}
                <div style={{
                  maxWidth:"78%", padding:"10px 14px", borderRadius:12, fontSize:13, lineHeight:1.6,
                  background: msg.user ? "var(--accent)" : "var(--bg-elevated)",
                  color: msg.user ? "#fff" : "var(--text-primary)",
                  borderBottomRightRadius: msg.user ? 4 : 12,
                  borderBottomLeftRadius: msg.user ? 12 : 4,
                  border: msg.user ? "none" : "1px solid var(--border)",
                  whiteSpace:"pre-wrap",
                }}>
                  {msg.user || msg.bot}
                  {msg.detectedType && !msg.user && (
                    <div style={{ marginTop:6, padding:"4px 10px", borderRadius:8, background:"rgba(0,200,255,0.1)",
                      color:"var(--accent)", fontSize:11, fontWeight:700, display:"inline-block" }}>
                      Detected: {msg.detectedType}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div style={{ display:"flex", gap:4, padding:"10px 14px", width:60 }}>
                {[0,150,300].map(d=>(
                  <div key={d} style={{ width:8, height:8, borderRadius:"50%", background:"var(--accent)",
                    animation:"pulse-dot 1.2s infinite", animationDelay:`${d}ms` }}/>
                ))}
              </div>
            )}
            <div ref={chatEndRef}/>
          </div>
          {/* Input */}
          <div style={{ padding:"12px 14px", borderTop:"1px solid var(--border)",
            display:"flex", gap:8 }}>
            <input className="form-input" style={{ flex:1 }}
              placeholder="Describe your emergency… (English or Hindi)"
              value={chatInput} onChange={e=>setChatInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&handleChatSend()}/>
            {voiceSupported && (
              <button className={`btn ${listening?"btn-red":"btn-ghost"} btn-sm`}
                onClick={listening?stopVoice:startVoice} title="Voice input">
                {listening?"🔴":"🎤"}
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={()=>handleChatSend()}
              disabled={chatLoading||!chatInput.trim()}>Send</button>
          </div>
        </div>
      )}

    </div>
  );
}

// ══════════════════════════════════════════════════════
// MAIN CITIZENVIEW
// ══════════════════════════════════════════════════════
export default function CitizenView({ weather, onReload, weatherLoading }) {
  // ── Core state ─────────────────────────────────────────────
  const [tab,             setTab]            = useState("report");
  const [emergencyType,   setEmergencyType]  = useState("Medical");
  const [reportPhone,     setReportPhone]    = useState("");
  const [isReporting,     setIsReporting]    = useState(false);
  const [reportError,     setReportError]    = useState("");

  // Active emergency state — fully restored from backend on mount
  const [reportResult,    setReportResult]   = useState(null);
  const [vehicleLocation, setVehicleLocation]= useState(null);  // { lat, lng }
  const [vehicleHeading,  setVehicleHeading] = useState(0);
  const [vehicleType,     setVehicleType]    = useState("Ambulance");
  const [vehicleId,       setVehicleId]      = useState(null);
  const [route,           setRoute]          = useState([]);
  const [altRoute,        setAltRoute]       = useState([]);
  const [routeSteps,      setRouteSteps]     = useState([]);
  const [routeProgress,   setRouteProgress]  = useState(0);
  const [eta,             setEta]            = useState(null);
  const [dispatchInfo,    setDispatchInfo]   = useState(null);
  const [vehicleArrived,  setVehicleArrived] = useState(false);
  const [allUnits,        setAllUnits]       = useState([]);   // multi-unit tracking
  const [onScene,         setOnScene]        = useState(false);   // ← NEW: On Scene state
  const [resolved,        setResolved]       = useState(false);  // ← NEW: fully resolved
  const [currentRouteStep,setCurrentRouteStep]=useState(0);
  const [signals,         setSignals]        = useState([]);
  const [restoreLoading,  setRestoreLoading] = useState(true);
  const [nextSignal,      setNextSignal]      = useState(null);   // { signalId, state, distanceKm }
  const [distRemaining,   setDistRemaining]   = useState(null);   // km
  const [liveSpeed,       setLiveSpeed]       = useState(0);

  // Chat / chatbot
  const [chatMessages, setChatMessages] = useState([{
    bot:"👋 Hi! I'm your AI Emergency Assistant.\n\nDescribe your emergency or tap 🎤 voice. I'll detect the type and report automatically.\n\nSupports English & Hinglish.",
  }]);
  const [chatInput,    setChatInput]   = useState("");
  const [chatLoading,  setChatLoading] = useState(false);
  const [voiceTranscript,setVoiceTranscript]=useState("");
  const [showDashboard,setShowDashboard]=useState(false);

  const chatEndRef   = useRef(null);
  const etaRef       = useRef(null);
  const defaultCenter= [22.7196, 75.8577]; // Indore

  const { listening, start:startVoice, stop:stopVoice, supported:voiceSupported } = useVoice({
    onResult: txt => { setVoiceTranscript(txt); setChatInput(txt); handleChatSend(txt); },
    onError:  err => setChatMessages(p=>[...p, { bot:`⚠️ ${err}`, type:"error" }]),
  });

  // ── Restore active emergency on mount ──────────────────────
  useEffect(()=>{
    (async ()=>{
      try {
        const r = await api.get("/auth/active-emergency");
        const a = r.data?.active;
        if (!a) { setRestoreLoading(false); return; }

        // Set all core state from backend data
        setReportResult({
          id:            a.id,
          lat:           a.lat || a.location?.lat,
          lng:           a.lng || a.location?.lng,
          type:          a.type,
          priority:      a.priority,
          status:        a.status,
          address:       a.address || a.location?.address || "",
          location:      a.location || {},
          severityScore: a.severityScore || 0,
          mlTags:        a.mlTags || [],
          distanceKm:    a.distanceKm,
          carbonSaved:   a.carbonSaved,
        });

        // Restore vehicle data if dispatched
        if (a.assignedVehicle && a.vehicle) {
          setVehicleId(a.assignedVehicle);
          setVehicleType(a.vehicle.type || "Ambulance");
          if (a.assignedVehicles?.length) setAllUnits(a.assignedVehicles);
          if (a.vehicle.currentLat && a.vehicle.currentLng) {
            setVehicleLocation({ lat:a.vehicle.currentLat, lng:a.vehicle.currentLng });
          }
          if (a.distanceKm) {
            setDispatchInfo({
              distanceKm:   a.distanceKm,
              carbonSavedKg:a.carbonSaved,
              vehicleFuel:  a.vehicle.fuelType,
            });
          }
        }

        // Set progress state from status
        const STATUS_STEP = {
          "Reported":1, "Acknowledged":1, "Assigned":2, "En Route":2, "On Scene":3, "Resolved":4
        };
        // step 3 = On Scene, step 4 = Resolved

        if (a.status === "On Scene") {
          setVehicleArrived(true);
          setOnScene(true);
          setRouteProgress(100);
          setEta(0);
        } else if (a.status === "Resolved") {
          setVehicleArrived(true);
          setOnScene(true);
          setResolved(true);
          setRouteProgress(100);
          setEta(0);
        }

        // Auto switch to track tab
        setTab("track");

        const locStr = a.location?.road
          ? `${a.location.road}${a.location.city?`, ${a.location.city}`:""}`
          : a.address || "your location";

        setChatMessages(p=>[...p, {
          bot: `🔄 Emergency tracking restored!\n\nType: ${a.type}\n📍 ${locStr}\nStatus: ${a.status}\n\n${
            a.assignedVehicle
              ? `🚑 Unit ${a.assignedVehicle} (${a.vehicle?.type||"Ambulance"}) assigned.`
              : "Waiting for operator dispatch."
          }\n\nStay at your location.`,
          type:"info",
        }]);
      } catch(e){
        console.warn("Restore error:", e.message);
      } finally {
        setRestoreLoading(false);
      }
    })();
  }, []);

  // ── ETA countdown ───────────────────────────────────────────
  useEffect(()=>{
    if (etaRef.current) { clearInterval(etaRef.current); etaRef.current=null; }
    if (!eta || eta<=0) return;
    etaRef.current = setInterval(()=>setEta(p=>{
      if (!p||p<=1){ clearInterval(etaRef.current); etaRef.current=null; return 0; }
      return p-1;
    }), 1000);
    return ()=>{ if(etaRef.current) clearInterval(etaRef.current); };
  }, [eta]);

  // ── Socket listeners ────────────────────────────────────────
  useEffect(()=>{
    const onMove = d=>{
      if (!vehicleId) return;
      if (d.vehicleId !== vehicleId) return;
      setVehicleLocation({ lat:d.lat, lng:d.lng, speedKmh:d.speedKmh||0 });
      if (d.heading         !=null) setVehicleHeading(d.heading);
      if (d.remainingSec    !=null) setEta(d.remainingSec);
      if (d.progressPct     !=null) setRouteProgress(d.progressPct);
      if (d.currentStepIdx  !=null) setCurrentRouteStep(d.currentStepIdx);
      if (d.distanceRemaining!=null) setDistRemaining(d.distanceRemaining);
      if (d.speedKmh        !=null) setLiveSpeed(d.speedKmh);
      if (d.nextSignal      !=null) setNextSignal(d.nextSignal);
      else if (!d.nextSignal)        setNextSignal(null);
    };

    // Vehicle arrived ON SCENE (simulator emits this)
    const onArrive = d=>{
      if (vehicleId && d.vehicleId !== vehicleId) return;
      setVehicleArrived(true);
      setOnScene(true);
      setEta(0);
      setRouteProgress(100);
      setChatMessages(p=>[...p,{
        bot:`📍 HELP HAS ARRIVED ON SCENE!\n\nUnit ${d.vehicleId} is at your location.\nResponse time: ${d.responseTime?fmtSecs(d.responseTime):"—"}\n\nWait for the operator to confirm resolution. You're safe! 🙏`,
        type:"arrived",
      }]);
    };

    // Operator manually confirmed "Resolved"
    const onResolved = d=>{
      if (!reportResult?.id) return;
      if (d.emergencyId?.toString() !== reportResult.id?.toString()) return;
      setResolved(true);
      setOnScene(true);
      setVehicleArrived(true);
      setRouteProgress(100);
      setEta(0);
      setReportResult(p=>p?{ ...p, status:"Resolved", responseTime:d.responseTime }:p);
      setChatMessages(p=>[...p,{
        bot:`✅ EMERGENCY RESOLVED!\n\nOperator has confirmed resolution.\nResponse time: ${d.responseTime?fmtSecs(d.responseTime):"—"}\n\nYou're in safe hands. Check your history for full details.`,
        type:"success",
      }]);
    };

    const onStatusUpdate = d=>{
      if (!reportResult?.id) return;
      if (d.emergencyId?.toString() !== reportResult.id?.toString()) return;
      setReportResult(p=>p?{ ...p, status:d.status }:p);
      if (d.status==="On Scene") { setVehicleArrived(true); setOnScene(true); setEta(0); setRouteProgress(100); }
      if (d.status==="Resolved") { setResolved(true); setOnScene(true); setVehicleArrived(true); }
    };

    const onDisp = d=>{
      if (!reportResult?.id) return;
      if (d.emergencyId?.toString() !== reportResult.id?.toString()) return;
      const av = d.assignedVehicle;
      // Always set primary vehicle (first dispatch)
      setVehicleId(prev => prev || av?.vehicleId);
      setVehicleType(prev => prev || av?.type || "Ambulance");
      // Track all units
      if (d.allAssignedVehicles?.length) setAllUnits(d.allAssignedVehicles);
      else if (av?.vehicleId) setAllUnits(prev => prev.includes(av.vehicleId)?prev:[...prev,av.vehicleId]);
      setDispatchInfo({
        distanceKm:   d.sustainability?.distanceKm || ((d.route?.distanceInMeters||0)/1000).toFixed(2),
        carbonSavedKg:d.sustainability?.carbonSavedKg,
        vehicleFuel:  d.sustainability?.vehicleFuel,
        hasAlt:       d.route?.hasAlternative,
        altDist:      d.route?.alternativeDistance,
      });
      setRoute(d.route?.geometry?.map(c=>[c[1],c[0]])||[]);
      setAltRoute(d.route?.alternativeGeometry?.map(c=>[c[1],c[0]])||[]);
      setRouteSteps(d.route?.steps||[]);
      setEta(d.route?.durationInSeconds||null);
      setReportResult(p=>p?{ ...p, status:"Assigned" }:p);
      const distKm  = d.sustainability?.distanceKm || ((d.route?.distanceInMeters||0)/1000).toFixed(2);
      const etaMins = Math.round((d.route?.durationInSeconds||0)/60);
      const isExtra = d.isAdditionalUnit;
      setChatMessages(p=>[...p,{
        bot: isExtra
          ? `🚒 Additional unit dispatched!\n\nUnit: ${av?.vehicleId} (${av?.type||"Vehicle"})\nTotal units assigned: ${d.unitNumber||""}\n\nStay at your location.`
          : `🚑 Help is on the way!\n\nUnit: ${av?.vehicleId} (${av?.type||"Ambulance"})\n📏 Distance: ${distKm}km\n⏱ ETA: ~${etaMins} min\n🌱 ${d.sustainability?.vehicleFuel} · Saves ${d.sustainability?.carbonSavedKg||0}kg CO₂\n\nTraffic signals are being cleared. Stay at your location.`,
        type:"dispatched",
      }]);
      setTab("track");
    };

    const onSig = d=>setSignals(p=>[...p.filter(s=>s.signalId!==d.signalId), d]);

    socket.on("vehicleLocationUpdate",  onMove);
    socket.on("vehicleArrived",         onArrive);
    socket.on("vehicleOnScene",         onArrive);   // v15 simulator event
    socket.on("emergencyResolved",      onResolved);
    socket.on("emergencyStatusUpdate",  onStatusUpdate);
    socket.on("emergencyDispatched",    onDisp);
    socket.on("signalUpdate",           onSig);
    return ()=>{
      socket.off("vehicleLocationUpdate",  onMove);
      socket.off("vehicleArrived",         onArrive);
      socket.off("vehicleOnScene",         onArrive);
      socket.off("emergencyResolved",      onResolved);
      socket.off("emergencyStatusUpdate",  onStatusUpdate);
      socket.off("emergencyDispatched",    onDisp);
      socket.off("signalUpdate",           onSig);
    };
  }, [vehicleId, reportResult]);

  useEffect(()=>{ chatEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [chatMessages]);

  // ── Report ──────────────────────────────────────────────────
  const doReport = async (type, lat, lng, phone="") => {
    setIsReporting(true); setReportError("");
    setVehicleId(null); setVehicleLocation(null); setRoute([]); setAltRoute([]);
    setRouteSteps([]); setRouteProgress(0); setEta(null);
    setVehicleArrived(false); setOnScene(false); setResolved(false);
    setSignals([]); setDispatchInfo(null);
    try {
      const r = await api.post("/emergencies", { type, lat, lng, phone: phone||reportPhone });
      const d = r.data;
      // Add to multi-emergency tracker
      const emData = {
        id:      String(d.emergencyId),
        lat, lng, type,
        priority:        d.priority || "High",
        status:          "Reported",
        address:         d.location?.address || "",
        location:        d.location || { lat, lng },
        severityScore:   d.severityScore || 0,
        mlTags:          d.mlTags || [],
        aiRecommendation:d.aiRecommendation || "",
        createdAt:       new Date().toISOString(),
      };
      setReportResult(emData); // keep backward compat
      try { notifyTrackerNewEmergency(emData); } catch(e) {}
      return d;
    } catch(e) {
      const msg = e.response?.data?.message || "Report failed. Please try again.";
      setReportError(msg); throw new Error(msg);
    } finally { setIsReporting(false); }
  };

  const geoReport = async type => {
    if (!navigator.geolocation) { setReportError("Geolocation not supported on this device"); return; }
    navigator.geolocation.getCurrentPosition(
      async p=>{
        try { await doReport(type, p.coords.latitude, p.coords.longitude); setTab("track"); }
        catch(e){}
      },
      ()=>doReport(type, defaultCenter[0], defaultCenter[1]).then(()=>setTab("track")).catch(()=>{}),
      { enableHighAccuracy:true, timeout:10000 }
    );
  };

  // ── AI Chat ─────────────────────────────────────────────────
  const handleChatSend = async override=>{
    const msg = (override||chatInput).trim();
    if (!msg||chatLoading) return;
    setChatInput(""); setVoiceTranscript("");
    setChatMessages(p=>[...p, { user:msg }]);
    setChatLoading(true);
    try {
      const det = DETECT(msg);
      let reply, apiType;
      try {
        const r = await api.post("/chatbot", { message:msg });
        reply   = r.data.response;
        apiType = r.data.detectedType||det;
      } catch(e){
        apiType = det;
        reply   = det
          ? `🚨 Detected **${det}** emergency.\n\nReporting now and getting your GPS location…`
          : "I couldn't identify the emergency. Please describe more clearly — e.g. 'there is a fire', 'I need medical help', 'road accident happened'.";
      }
      setChatMessages(p=>[...p, { bot:reply, type:apiType?"detected":"info", detectedType:apiType }]);
      if (apiType) {
        setTimeout(async ()=>{
          setChatMessages(p=>[...p, { bot:`📍 Getting your GPS location…`, type:"info" }]);
          navigator.geolocation.getCurrentPosition(
            async pos=>{
              try {
                const d = await doReport(apiType, pos.coords.latitude, pos.coords.longitude);
                setChatMessages(p=>[...p,{ bot:`✅ Emergency reported!\n📍 ${d.location?.address||"Your location"}\n🔢 Severity: ${d.severityScore}/100\n⏳ Operator notified. Go to 'Track Help' tab.`, type:"success" }]);
                setTab("track");
              } catch(err){ setChatMessages(p=>[...p,{ bot:`❌ ${err.message}`, type:"error" }]); }
            },
            ()=>doReport(apiType, defaultCenter[0], defaultCenter[1])
              .then(()=>{ setChatMessages(p=>[...p,{ bot:`✅ Reported at city centre!`, type:"success" }]); setTab("track"); })
              .catch(()=>{})
          );
        }, 600);
      }
    } finally { setChatLoading(false); }
  };

  // ── Derived ─────────────────────────────────────────────────
  const wxCurrent = weather?.current;
  const etaMins   = eta ? Math.floor(eta/60) : 0;
  const etaSecs   = eta ? eta%60 : 0;
  const etaStr    = eta>0 ? `${etaMins}:${String(etaSecs).padStart(2,"0")}` : onScene ? "ON SCENE" : "--:--";
  const etaUrgent = eta>0 && eta<120;

  // Current step index (0-4)
  const currentStep = resolved ? 4
    : onScene         ? 3
    : vehicleId       ? 2
    : reportResult    ? 1
                      : 0;

  if (restoreLoading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:200, gap:14 }}>
      <span style={{ fontSize:28 }}>⏳</span>
      <span style={{ fontFamily:"var(--font-display)", fontSize:16, color:"var(--text-muted)" }}>
        Checking for active emergencies…
      </span>
    </div>
  );

  return (
    <div style={{ maxWidth:720, margin:"0 auto" }}>
      {showDashboard && <CitizenDashboard onClose={()=>setShowDashboard(false)}/>}

      {/* ── Top nav ── */}
      <div className="flex-between mb-20" style={{ flexWrap:"wrap", gap:8 }}>
        <div className="tab-bar" style={{ marginBottom:0, flexWrap:"wrap" }}>
          {[
            ["report",  "🆘 Report"],
            ["track",   "📍 Track Help"],
            ["firstaid","🩺 First Aid"],
            ["nearby",  "📍 Nearby"],
            ["alerts",  "🔔 Alerts"],
            ["opchat",  "💬 Operator Chat"],
            ["chat",    "🤖 AI Chat"],
            ["weather", "🌤 Weather"],
          ].map(([v,l])=>(
            <button key={v} className={`tab-btn ${tab===v?"active":""}`} onClick={()=>setTab(v)}>
              {l}
              {v==="track" && reportResult && (
                <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%",
                  background:vehicleId?"var(--accent)":"var(--orange)",
                  marginLeft:6, animation:"pulse-dot 1.5s infinite" }}/>
              )}
              {v==="opchat" && reportResult?.id && !resolved && (
                <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%",
                  background:"var(--green)", marginLeft:6 }}/>
              )}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={()=>setShowDashboard(true)} title="Profile & History">
          👤 Profile
        </button>
      </div>

      {/* ══ REPORT TAB ══ */}
      {tab==="report" && (
        <div>
          {/* Active emergency banner */}
          {reportResult && !resolved && (
            <div className="card mb-16" style={{ background:"var(--orange-dim)", borderColor:"var(--orange)", borderLeft:"4px solid var(--orange)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                <div>
                  <div style={{ fontFamily:"var(--font-display)", fontWeight:700, color:"var(--orange)", fontSize:14, marginBottom:4 }}>
                    ⚠️ Active Emergency In Progress
                  </div>
                  <div style={{ fontSize:13 }}>{TI[reportResult.type]||"⚠️"} {reportResult.type}</div>
                  <div style={{ fontSize:12, color:"var(--accent)", marginTop:2 }}>
                    📍 {locLine(reportResult.location) || reportResult.address || "Your location"}
                  </div>
                  <div style={{ fontSize:12, color:"var(--text-muted)", marginTop:2 }}>
                    Status: <b style={{ color:"var(--text-primary)" }}>{reportResult.status}</b>
                    {vehicleId ? ` · Unit: ${vehicleId}` : ""}
                  </div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={()=>setTab("track")}>Track Live →</button>
              </div>
            </div>
          )}
          {resolved && (
            <div className="card mb-16" style={{ background:"var(--green-dim)", borderColor:"var(--green)", borderLeft:"4px solid var(--green)" }}>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:700, color:"var(--green)", marginBottom:4 }}>
                ✅ Last Emergency: Resolved
              </div>
              <div style={{ fontSize:13, color:"var(--text-secondary)" }}>You can report a new emergency below.</div>
            </div>
          )}

          {/* Weather */}
          {wxCurrent && (
            <div className="card mb-16" style={{
              background:wxCurrent.isHazardous?"var(--orange-dim)":"var(--accent-dim)",
              borderColor:wxCurrent.isHazardous?"var(--orange)":"var(--accent)",
              display:"flex", alignItems:"center", gap:14, padding:"12px 16px"
            }}>
              <span style={{ fontSize:26 }}>{WX(wxCurrent.condition)}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:14 }}>
                  {wxCurrent.temperature}°C — {wxCurrent.condition}
                </div>
                <div style={{ fontSize:12, color:"var(--text-muted)" }}>
                  💧{wxCurrent.humidity}% · 💨{wxCurrent.windSpeed}km/h
                </div>
                {wxCurrent.isHazardous && (
                  <div style={{ color:"var(--orange)", fontSize:12, marginTop:2 }}>
                    ⚠️ Adverse weather — response may take longer
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="card" style={{ borderTop:"3px solid var(--red)" }}>
            <h2 style={{ fontFamily:"var(--font-display)", fontSize:22, marginBottom:6 }}>🆘 Report Emergency</h2>
            <p style={{ color:"var(--text-muted)", fontSize:13, marginBottom:20 }}>
              Select the emergency type. Your GPS is shared automatically.
            </p>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
              {TYPE_OPTIONS.map(({ type, icon, desc })=>(
                <button key={type} onClick={()=>setEmergencyType(type)} style={{
                  padding:"14px 8px",
                  background:emergencyType===type?"var(--red-dim)":"var(--bg-elevated)",
                  border:`2px solid ${emergencyType===type?"var(--red)":"var(--border)"}`,
                  borderRadius:"var(--radius-md)", cursor:"pointer", transition:"var(--transition)",
                  textAlign:"center", color:emergencyType===type?"var(--red)":"var(--text-secondary)"
                }}>
                  <div style={{ fontSize:24, marginBottom:4 }}>{icon}</div>
                  <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:11 }}>{type}</div>
                  <div style={{ fontSize:9, color:"var(--text-dim)", marginTop:2 }}>{desc}</div>
                </button>
              ))}
            </div>

            <div style={{ marginBottom:16 }}>
              <label className="form-label">📞 Mobile <span style={{ color:"var(--text-dim)", fontWeight:400 }}>(optional)</span></label>
              <input className="form-input" type="tel" value={reportPhone}
                onChange={e=>setReportPhone(e.target.value)} placeholder="+91 98765 43210"/>
            </div>

            {reportError && (
              <div style={{ background:"var(--red-dim)", border:"1px solid var(--red)", borderRadius:"var(--radius-md)",
                padding:"10px 14px", color:"var(--red)", fontSize:13, marginBottom:12 }}>{reportError}</div>
            )}

            <button className="btn btn-red btn-full" style={{ padding:"14px", fontSize:16, fontWeight:700, letterSpacing:1, justifyContent:"center" }}
              onClick={()=>geoReport(emergencyType)} disabled={isReporting}>
              {isReporting ? "⏳ Reporting…" : `🆘 REPORT ${emergencyType.toUpperCase()}`}
            </button>
            <p style={{ color:"var(--text-dim)", fontSize:11, textAlign:"center", marginTop:8 }}>
              Operator will dispatch help after reviewing your report.
            </p>
          </div>
        </div>
      )}

      {/* ══ TRACK TAB ══ */}
      {tab==="track" && (
        <div>
          <EmergencyTracker/>
        </div>
      )}

      {/* ══ FIRST AID IN TRACK TAB ══ */}
      {tab==="track" && false && (
        <div/>
      )}


      {/* ══ NEARBY ══ */}
      {tab==="nearby" && (
        <div className="card">
          <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:18, marginBottom:4 }}>📍 Nearby Services</div>
          <div style={{ fontSize:13, color:"var(--text-muted)", marginBottom:16 }}>Hospitals, police, fire stations, pharmacies near you</div>
          <NearbyServices
            emergencyType={reportResult?.type||emergencyType}
            defaultLat={reportResult?.lat||reportResult?.location?.lat}
            defaultLng={reportResult?.lng||reportResult?.location?.lng}
          />
        </div>
      )}

      {/* ══ ALERTS ══ */}
      {tab==="alerts" && <CitizenAlerts lat={reportResult?.lat} lng={reportResult?.lng}/>}

      {/* ══ WEATHER ══ */}
      {tab==="weather" && (
        <div>
          {wxCurrent ? (
            <>
              <div className="card mb-16" style={{ display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" }}>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:54 }}>{WX(wxCurrent.condition)}</div>
                  <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:12, color:"var(--text-muted)", marginTop:3 }}>{wxCurrent.condition}</div>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:48, color:"var(--accent)", lineHeight:1 }}>{wxCurrent.temperature}°C</div>
                  {wxCurrent.isHazardous && <div style={{ color:"var(--orange)", fontWeight:600, fontSize:13, marginTop:6 }}>⚠️ Hazardous weather conditions</div>}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {[["💧","Humidity",`${wxCurrent.humidity}%`],["💨","Wind",`${wxCurrent.windSpeed}km/h`],["👁","Visibility",`${wxCurrent.visibility??"-"}km`],["🌡","Feels Like",`${wxCurrent.temperature}°C`]].map(([icon,l,v])=>(
                    <div key={l} style={{ background:"var(--bg-elevated)", borderRadius:"var(--radius-md)", padding:"8px 12px", border:"1px solid var(--border)", textAlign:"center" }}>
                      <div style={{ fontSize:16 }}>{icon}</div>
                      <div style={{ fontSize:10, color:"var(--text-muted)" }}>{l}</div>
                      <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:14 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
              {weather?.forecast?.length>0 && (
                <div className="card">
                  <div className="chart-title mb-10">📅 12-Hour Forecast</div>
                  <div style={{ overflowX:"auto" }}>
                    <div style={{ display:"flex", gap:8, minWidth:"max-content" }}>
                      {weather.forecast.map((f,i)=>(
                        <div key={i} style={{
                          background:i===0?"var(--accent-dim)":"var(--bg-elevated)",
                          border:`1px solid ${i===0?"var(--accent)":"var(--border)"}`,
                          borderRadius:"var(--radius-md)", padding:"10px 12px", textAlign:"center", minWidth:76
                        }}>
                          <div style={{ fontSize:10, color:i===0?"var(--accent)":"var(--text-muted)", fontFamily:"var(--font-mono)", marginBottom:4 }}>{i===0?"NOW":`${f.hour}:00`}</div>
                          <div style={{ fontSize:20, marginBottom:4 }}>{WX(f.condition)}</div>
                          <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:15 }}>{f.temp}°C</div>
                          <div style={{ fontSize:9, color:"var(--text-dim)", marginTop:2 }}>{f.condition?.slice(0,10)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ padding:40, textAlign:"center" }}>
              <button className="btn btn-primary" onClick={onReload}>Load Weather</button>
            </div>
          )}
        </div>
      )}
      {/* ══ FIRST AID TAB ══ */}
      {tab==="firstaid" && (
        <div>
          <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:18, marginBottom:4 }}>
            🩺 First Aid Guide
          </div>
          <div style={{ fontSize:13, color:"var(--text-muted)", marginBottom:16 }}>
            Step-by-step guidance while waiting for emergency services
          </div>
          <FirstAidGuide defaultType={reportResult?.type||emergencyType||null}/>
        </div>
      )}

      {/* ══ OPERATOR CHAT TAB ══ */}
      {tab==="opchat" && (
        <div>
          {reportResult?.id && !resolved ? (
            <ChatPanel emergencyId={reportResult.id} role="citizen"/>
          ) : (
            <div style={{ textAlign:"center", padding:60, background:"var(--bg-card)",
              border:"1px solid var(--border)", borderRadius:"var(--radius-lg)" }}>
              <div style={{ fontSize:36, marginBottom:8 }}>💬</div>
              <h3 style={{ fontFamily:"var(--font-display)", fontSize:18, marginBottom:8 }}>No Active Emergency</h3>
              <p style={{ color:"var(--text-muted)", fontSize:13 }}>
                Report an emergency first to chat with the operator.
              </p>
              <button className="btn btn-primary" style={{ marginTop:14 }} onClick={()=>setTab("report")}>
                🆘 Report Emergency →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══ AI CHAT TAB ══ */}
      {tab==="chat" && (
        <div className="card" style={{ padding:0, overflow:"hidden" }}>
          <div style={{ padding:"14px 16px", borderBottom:"1px solid var(--border)",
            fontFamily:"var(--font-display)", fontWeight:700, fontSize:16 }}>
            🤖 AI Emergency Assistant
          </div>
          <div style={{ maxHeight:460, overflowY:"auto", padding:14, display:"flex",
            flexDirection:"column", gap:12 }}>
            {chatMessages.map((msg,i)=>(
              <div key={i} style={{
                display:"flex", flexDirection:msg.user?"row-reverse":"row", gap:10, alignItems:"flex-start"
              }}>
                {!msg.user && (
                  <div style={{ width:32, height:32, borderRadius:"50%", background:"var(--accent-dim)",
                    border:"1px solid var(--accent)", display:"flex", alignItems:"center",
                    justifyContent:"center", fontSize:14, flexShrink:0 }}>🤖</div>
                )}
                <div style={{
                  maxWidth:"78%", padding:"10px 14px", borderRadius:12, fontSize:13, lineHeight:1.6,
                  background: msg.user ? "var(--accent)" : "var(--bg-elevated)",
                  color: msg.user ? "#fff" : "var(--text-primary)",
                  borderBottomRightRadius: msg.user ? 4 : 12,
                  borderBottomLeftRadius: msg.user ? 12 : 4,
                  border: msg.user ? "none" : "1px solid var(--border)",
                  whiteSpace:"pre-wrap",
                }}>
                  {msg.user || msg.bot}
                  {msg.detectedType && !msg.user && (
                    <div style={{ marginTop:6, padding:"4px 10px", borderRadius:8, background:"rgba(0,200,255,0.1)",
                      color:"var(--accent)", fontSize:11, fontWeight:700, display:"inline-block" }}>
                      Detected: {msg.detectedType}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div style={{ display:"flex", gap:4, padding:"10px 14px", width:60 }}>
                {[0,150,300].map(d=>(
                  <div key={d} style={{ width:8, height:8, borderRadius:"50%", background:"var(--accent)",
                    animation:"pulse-dot 1.2s infinite", animationDelay:`${d}ms` }}/>
                ))}
              </div>
            )}
            <div ref={chatEndRef}/>
          </div>
          {/* Input */}
          <div style={{ padding:"12px 14px", borderTop:"1px solid var(--border)",
            display:"flex", gap:8 }}>
            <input className="form-input" style={{ flex:1 }}
              placeholder="Describe your emergency… (English or Hindi)"
              value={chatInput} onChange={e=>setChatInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&handleChatSend()}/>
            {voiceSupported && (
              <button className={`btn ${listening?"btn-red":"btn-ghost"} btn-sm`}
                onClick={listening?stopVoice:startVoice} title="Voice input">
                {listening?"🔴":"🎤"}
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={()=>handleChatSend()}
              disabled={chatLoading||!chatInput.trim()}>Send</button>
          </div>
        </div>
      )}

    </div>
  );
}
