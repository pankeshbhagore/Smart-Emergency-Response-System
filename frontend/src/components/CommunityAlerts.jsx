/**
 * CommunityAlerts v14
 * CitizenAlerts — read-only feed for citizens
 * OperatorAlerts — full management + creation for operators/admin
 */
import { useState, useEffect, useCallback, useRef } from "react";
import api    from "../services/api";
import socket from "../services/socket";

const TYPE_OPTS = ["Accident","Flood","Fire","Traffic","Crime","Gas Leak","Weather","Medical","Breakdown","Other"];
const SEV_COLOR = { High:"#ff4060", Medium:"#ff8f00", Low:"#ffd600", Info:"#00c8ff" };
const SEV_BG    = { High:"rgba(255,64,96,0.1)", Medium:"rgba(255,143,0,0.1)", Low:"rgba(255,214,0,0.08)", Info:"rgba(0,200,255,0.08)" };
const TI = { Accident:"💥",Flood:"🌊",Fire:"🔥",Traffic:"🚗",Crime:"🚔","Gas Leak":"💨",Weather:"🌩",Medical:"🏥",Breakdown:"🔧",Other:"📢" };

/* ── Citizen view (read-only) ─────────────────────────── */
export function CitizenAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading,setLoading]= useState(true);
  const [filter, setFilter] = useState("All");

  const load = useCallback(async () => {
    try {
      const r = await api.get("/alerts");
      setAlerts((Array.isArray(r.data) ? r.data : r.data?.alerts || []).filter(a=>a.active));
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    socket.on("communityAlert", a => {
      setAlerts(p => {
        if (p.find(x=>x._id===a._id)) return p;
        return [a, ...p];
      });
    });
    socket.on("alertResolved", id => setAlerts(p => p.filter(a=>a._id!==id)));
    return () => { socket.off("communityAlert"); socket.off("alertResolved"); };
  }, [load]);

  const types = ["All", ...new Set(alerts.map(a=>a.type))];
  const shown = filter==="All" ? alerts : alerts.filter(a=>a.type===filter);

  return (
    <div>
      <div style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:16,marginBottom:12}}>
        📢 Community Alerts
        {alerts.length>0&&<span style={{marginLeft:8,color:"var(--red)",fontWeight:400,fontSize:12}}>{alerts.length} active</span>}
      </div>

      <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
        {types.map(t=>(
          <button key={t} className={`btn btn-sm ${filter===t?"btn-primary":"btn-ghost"}`}
            onClick={()=>setFilter(t)}>{t}</button>
        ))}
      </div>

      {loading && <div style={{textAlign:"center",padding:30,color:"var(--text-muted)"}}>Loading alerts…</div>}
      {!loading && shown.length===0 && (
        <div style={{textAlign:"center",padding:40,color:"var(--text-muted)"}}>
          <div style={{fontSize:32,marginBottom:8}}>✅</div>
          <div>No active alerts in your area</div>
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {shown.map(a=>(
          <div key={a._id} style={{
            background:SEV_BG[a.severity]||"var(--bg-card)",
            border:`1px solid ${SEV_COLOR[a.severity]||"var(--border)"}`,
            borderRadius:"var(--radius-lg)",padding:"14px 16px",
            borderLeft:`4px solid ${SEV_COLOR[a.severity]||"var(--border)"}`
          }}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:18}}>{TI[a.type]||"📢"}</span>
                  {a.title}
                  <span style={{color:SEV_COLOR[a.severity],fontWeight:600,fontSize:11,
                    background:SEV_BG[a.severity],border:`1px solid ${SEV_COLOR[a.severity]}`,
                    padding:"1px 8px",borderRadius:12}}>{a.severity}</span>
                </div>
                <div style={{fontSize:13,color:"var(--text-secondary)",marginTop:5,lineHeight:1.5}}>{a.message}</div>
                {a.location?.address && (
                  <div style={{fontSize:11,color:"var(--accent)",marginTop:4}}>
                    📍 {[a.location.road||a.location.address, a.location.area||a.location.suburb, a.location.city].filter(Boolean).join(", ")}
                  </div>
                )}
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <span className="badge badge-muted" style={{fontSize:10}}>{a.type}</span>
                <div style={{fontSize:10,color:"var(--text-dim)",marginTop:6}}>
                  {new Date(a.createdAt).toLocaleTimeString()}
                </div>
              </div>
            </div>
            {a.instructions?.length>0&&(
              <div style={{marginTop:10,padding:"10px 12px",background:"rgba(0,0,0,0.2)",borderRadius:"var(--radius-md)"}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--text-muted)",marginBottom:6}}>📋 INSTRUCTIONS</div>
                {a.instructions.map((ins,i)=>(
                  <div key={i} style={{fontSize:12,color:"var(--text-secondary)",display:"flex",gap:8,marginBottom:4}}>
                    <span style={{color:"var(--accent)",fontWeight:700,minWidth:18}}>{i+1}.</span>
                    <span>{ins}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Operator / Admin view (create + manage) ─────────── */
export function OperatorAlerts({ incidents = [], vehicles = [] }) {
  const [alerts,   setAlerts]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [creating, setCreating] = useState(false);
  const [sending,  setSending]  = useState(false);
  const [msg,      setMsg]      = useState("");
  const [tab,      setTab]      = useState("active");
  const [form, setForm] = useState({
    type:"Traffic", title:"", message:"",
    severity:"Medium", locationAddress:"", locationCity:"",
    instructions:"", radius:2,
    autoFromEmergency:"",
  });

  const load = useCallback(async () => {
    try {
      const r = await api.get("/alerts");
      setAlerts(Array.isArray(r.data) ? r.data : r.data?.alerts || []);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    socket.on("communityAlert",  load);
    socket.on("alertResolved",   load);
    return () => { socket.off("communityAlert"); socket.off("alertResolved"); };
  }, [load]);

  // Auto-fill from a reported emergency
  useEffect(() => {
    if (!form.autoFromEmergency) return;
    const e = incidents.find(x=>x._id===form.autoFromEmergency);
    if (!e) return;
    setForm(f=>({
      ...f,
      type: e.type==="Medical"?"Medical":e.type==="Fire"?"Fire":e.type==="Flood"?"Flood":e.type==="Crime"?"Crime":"Accident",
      title: `${e.type} Emergency Alert`,
      message: `${e.priority} ${e.type} emergency reported${e.location?.address?` at ${e.location.address}`:""}. Please avoid the area.`,
      severity: e.priority==="Critical"?"High":e.priority==="High"?"High":"Medium",
      locationAddress: e.location?.displayLine1 || e.location?.road || e.location?.address || "",
      locationCity: e.location?.city || e.location?.district || "",
    }));
  }, [form.autoFromEmergency, incidents]);

  const create = async () => {
    if (!form.title || !form.message) { setMsg("Title and message are required."); return; }
    setSending(true); setMsg("");
    try {
      const instr = form.instructions.split("\n").map(l=>l.trim()).filter(Boolean);
      await api.post("/alerts", {
        type: form.type, title: form.title, message: form.message,
        severity: form.severity,
        location: { address:form.locationAddress, city:form.locationCity },
        instructions: instr, radius: parseFloat(form.radius)||2,
        active: true,
      });
      setMsg("✅ Alert created and broadcast to all citizens!");
      setForm({type:"Traffic",title:"",message:"",severity:"Medium",locationAddress:"",locationCity:"",instructions:"",radius:2,autoFromEmergency:""});
      setCreating(false);
      load();
    } catch(e) {
      setMsg(`❌ Failed: ${e.response?.data?.message||e.message}`);
    }
    setSending(false);
  };

  const resolve = async id => {
    try {
      await api.patch(`/alerts/${id}/resolve`);
      load();
    } catch(e) { console.error(e); }
  };

  const active   = alerts.filter(a=>a.active);
  const inactive = alerts.filter(a=>!a.active);

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:16}}>
          📢 Community Alert Management
          <span style={{marginLeft:8,color:"var(--red)",fontWeight:400,fontSize:12}}>{active.length} active</span>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button className="btn btn-accent btn-sm" onClick={async()=>{
            try {
              const r = await api.post("/alerts/generate-from-predictions");
              setMsg(`🤖 ${r.data.message}`);
              load();
              setTimeout(()=>setMsg(""),8000);
            } catch(e) { setMsg("AI alert generation failed"); }
          }}>🤖 Generate AI Alerts</button>
          <button className="btn btn-primary btn-sm" onClick={()=>setCreating(v=>!v)}>
            {creating?"✕ Cancel":"+ Create Alert"}
          </button>
        </div>
      </div>

      {/* ── Create form ── */}
      {creating && (
        <div className="card mb-16" style={{padding:20,border:"1px solid var(--accent)",animation:"slideIn 0.2s ease"}}>
          <div style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:14,marginBottom:14}}>
            📝 New Community Alert
          </div>

          {/* Auto-fill from emergency */}
          {incidents.filter(e=>!["Resolved","Cancelled"].includes(e.status)).length>0&&(
            <div style={{marginBottom:12}}>
              <label className="form-label">⚡ Auto-fill from Active Emergency</label>
              <select className="form-input" value={form.autoFromEmergency} onChange={e=>setForm(f=>({...f,autoFromEmergency:e.target.value}))}>
                <option value="">— select emergency —</option>
                {incidents.filter(e=>!["Resolved","Cancelled"].includes(e.status)).map(e=>(
                  <option key={e._id} value={e._id}>{e.type} — {e.location?.address||"—"} ({e.priority})</option>
                ))}
              </select>
            </div>
          )}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div>
              <label className="form-label">Type *</label>
              <select className="form-input" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                {TYPE_OPTS.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Severity *</label>
              <select className="form-input" value={form.severity} onChange={e=>setForm(f=>({...f,severity:e.target.value}))}>
                {["High","Medium","Low","Info"].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{gridColumn:"1/-1"}}>
              <label className="form-label">Title *</label>
              <input className="form-input" placeholder="e.g. Road blocked near Station Road"
                value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/>
            </div>
            <div style={{gridColumn:"1/-1"}}>
              <label className="form-label">Message *</label>
              <textarea className="form-input" rows={3} placeholder="Describe the situation clearly for citizens…"
                value={form.message} onChange={e=>setForm(f=>({...f,message:e.target.value}))}
                style={{resize:"vertical"}}/>
            </div>
            <div>
              <label className="form-label">Location / Address</label>
              <input className="form-input" placeholder="Street, landmark"
                value={form.locationAddress} onChange={e=>setForm(f=>({...f,locationAddress:e.target.value}))}/>
            </div>
            <div>
              <label className="form-label">City</label>
              <input className="form-input" placeholder="City name"
                value={form.locationCity} onChange={e=>setForm(f=>({...f,locationCity:e.target.value}))}/>
            </div>
            <div style={{gridColumn:"1/-1"}}>
              <label className="form-label">Instructions for Citizens (one per line)</label>
              <textarea className="form-input" rows={3}
                placeholder={"1. Stay indoors\n2. Avoid the area\n3. Call 112 if urgent"}
                value={form.instructions} onChange={e=>setForm(f=>({...f,instructions:e.target.value}))}
                style={{resize:"vertical"}}/>
            </div>
            <div>
              <label className="form-label">Alert Radius (km)</label>
              <input className="form-input" type="number" min="0.5" max="50" step="0.5"
                value={form.radius} onChange={e=>setForm(f=>({...f,radius:e.target.value}))}/>
            </div>
          </div>
          {msg&&<div style={{marginTop:10,fontSize:13,color:msg.startsWith("✅")?"var(--green)":"var(--red)"}}>{msg}</div>}
          <div style={{display:"flex",gap:10,marginTop:14}}>
            <button className="btn btn-primary" onClick={create} disabled={sending}>
              {sending?"⏳ Sending…":"📢 Broadcast Alert"}
            </button>
            <button className="btn btn-ghost" onClick={()=>setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="tab-bar mb-14">
        {[["active",`Active (${active.length})`],["history",`History (${inactive.length})`]].map(([id,label])=>(
          <button key={id} className={`tab-btn ${tab===id?"active":""}`} onClick={()=>setTab(id)}>{label}</button>
        ))}
      </div>

      {loading && <div style={{textAlign:"center",padding:30,color:"var(--text-muted)"}}>Loading…</div>}

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {(tab==="active"?active:inactive).map(a=>(
          <div key={a._id} style={{
            background:a.active?SEV_BG[a.severity]||"var(--bg-card)":"var(--bg-elevated)",
            border:`1px solid ${a.active?SEV_COLOR[a.severity]||"var(--border)":"var(--border)"}`,
            borderRadius:"var(--radius-lg)",padding:"14px 16px",
            borderLeft:`4px solid ${a.active?SEV_COLOR[a.severity]||"var(--border)":"var(--border)"}`,
            opacity:a.active?1:0.6,
          }}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{fontSize:18}}>{TI[a.type]||"📢"}</span>
                  {a.title}
                  <span style={{color:SEV_COLOR[a.severity],fontWeight:600,fontSize:11,
                    border:`1px solid ${SEV_COLOR[a.severity]}`,padding:"1px 8px",borderRadius:12}}>{a.severity}</span>
                </div>
                <div style={{fontSize:13,color:"var(--text-secondary)",marginTop:4,lineHeight:1.5}}>{a.message}</div>
                {a.location?.address&&<div style={{fontSize:11,color:"var(--accent)",marginTop:4}}>📍 {[a.location.road||a.location.address, a.location.area||a.location.suburb, a.location.city].filter(Boolean).join(", ")}</div>}
                {a.instructions?.length>0&&(
                  <div style={{marginTop:8,fontSize:12,color:"var(--text-muted)"}}>
                    📋 {a.instructions.length} instruction{a.instructions.length>1?"s":""}
                  </div>
                )}
                <div style={{fontSize:10,color:"var(--text-dim)",marginTop:4}}>
                  Created {new Date(a.createdAt).toLocaleString()}
                  {a.createdBy&&` by ${a.createdBy}`}
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
                <span className="badge badge-muted" style={{fontSize:10}}>{a.type}</span>
                {a.active?(
                  <button className="btn btn-ghost btn-sm" onClick={()=>resolve(a._id)}
                    style={{fontSize:11,color:"var(--green)",borderColor:"var(--green)"}}>
                    ✓ Resolve
                  </button>
                ):(
                  <span className="badge badge-muted" style={{fontSize:10}}>Resolved</span>
                )}
              </div>
            </div>
          </div>
        ))}
        {(tab==="active"?active:inactive).length===0&&(
          <div style={{textAlign:"center",padding:50,color:"var(--text-muted)"}}>
            <div style={{fontSize:32,marginBottom:8}}>{tab==="active"?"✅":"📁"}</div>
            <div>{tab==="active"?"No active alerts":"No alert history yet"}</div>
          </div>
        )}
      </div>
    </div>
  );
}
