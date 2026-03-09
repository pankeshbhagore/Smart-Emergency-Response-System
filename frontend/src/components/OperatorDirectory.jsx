/**
 * OperatorDirectory v25
 * Admin tab — shows all operators: status, emergency history, shift, badge
 */
import { useState, useEffect, useCallback } from "react";
import api    from "../services/api";
import socket from "../services/socket";

const fmtDate = d => d ? new Date(d).toLocaleString("en-IN",
  { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "Never";
const fmtSecs = s => s>3600?`${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
  : s>60?`${Math.floor(s/60)}m ${s%60}s`:`${Math.round(s)}s`;
const STATUS_COLOR = { active:"#00e676", suspended:"#ff4060" };
const SHIFT_COLOR  = { Morning:"#ffd600", Evening:"#ff8800", Night:"#7c5cbf", Any:"#00c8ff" };

export default function OperatorDirectory() {
  const [operators, setOperators] = useState([]);
  const [stats,     setStats]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterShift,  setFilterShift]  = useState("");
  const [expanded,  setExpanded]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, statsRes] = await Promise.all([
        api.get("/admin/users?role=Operator&limit=100"),
        api.get("/admin/stats"),
      ]);
      setOperators(usersRes.data.users || []);
      setStats(statsRes.data);
    } catch(e) { console.warn("OperatorDirectory:", e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live refresh when emergency dispatched
  useEffect(() => {
    socket.on("emergencyDispatched", load);
    socket.on("emergencyResolved",   load);
    return () => {
      socket.off("emergencyDispatched", load);
      socket.off("emergencyResolved",   load);
    };
  }, [load]);

  // Filter
  const filtered = operators.filter(op => {
    if (filterStatus && op.accountStatus !== filterStatus) return false;
    if (filterShift  && op.shift         !== filterShift)  return false;
    if (search) {
      const s = search.toLowerCase();
      if (!op.name.toLowerCase().includes(s) &&
          !op.email.toLowerCase().includes(s) &&
          !(op.badgeNumber||"").toLowerCase().includes(s) &&
          !(op.department||"").toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const activeCount    = operators.filter(o => o.accountStatus === "active").length;
  const suspendedCount = operators.filter(o => o.accountStatus === "suspended").length;

  return (
    <div>
      {/* ── Header ─────────────────────────────────────── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
        marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:700,
            marginBottom:4 }}>👮 Operator Directory</h2>
          <div style={{ color:"var(--text-muted)", fontSize:13 }}>
            All dispatch operators — status, shifts, activity
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}>🔄 Refresh</button>
      </div>

      {/* ── Stats row ──────────────────────────────────── */}
      <div className="stat-grid mb-20"
        style={{ gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))" }}>
        {[
          { label:"Total Operators", val:operators.length,  color:"var(--accent)" },
          { label:"✅ Active",        val:activeCount,       color:"var(--green)" },
          { label:"🚫 Suspended",     val:suspendedCount,    color:"var(--red)" },
          { label:"🌅 Morning Shift", val:operators.filter(o=>o.shift==="Morning").length, color:"#ffd600" },
          { label:"🌆 Evening Shift", val:operators.filter(o=>o.shift==="Evening").length, color:"#ff8800" },
          { label:"🌙 Night Shift",   val:operators.filter(o=>o.shift==="Night").length,   color:"#7c5cbf" },
          { label:"🚨 Total Incidents",val:stats?.emergencies?.total||0,  color:"var(--orange)" },
          { label:"✅ Resolved",       val:stats?.emergencies?.resolved||0,color:"var(--green)" },
        ].map(c => (
          <div key={c.label} className="stat-card">
            <div className="stat-label" style={{ fontSize:10 }}>{c.label}</div>
            <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:24,
              color:c.color, marginTop:4 }}>{c.val}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ──────────────────────────────────────── */}
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        <input className="form-input" placeholder="🔍 Search name, email, badge, dept…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex:1, minWidth:200, maxWidth:300 }}/>
        <select className="form-input" value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)} style={{ minWidth:140 }}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <select className="form-input" value={filterShift}
          onChange={e => setFilterShift(e.target.value)} style={{ minWidth:140 }}>
          <option value="">All Shifts</option>
          <option value="Morning">🌅 Morning</option>
          <option value="Evening">🌆 Evening</option>
          <option value="Night">🌙 Night</option>
          <option value="Any">Any</option>
        </select>
        <span style={{ fontSize:12, color:"var(--text-muted)" }}>
          {filtered.length} of {operators.length}
        </span>
      </div>

      {/* ── Operator Cards ──────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign:"center", padding:60, color:"var(--text-muted)" }}>
          <div style={{ fontSize:36, marginBottom:8 }}>🔄</div>
          <div>Loading operators…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:"center", padding:60, background:"var(--bg-card)",
          border:"1px solid var(--border)", borderRadius:"var(--radius-lg)" }}>
          <div style={{ fontSize:40, marginBottom:10 }}>👮</div>
          <div style={{ fontFamily:"var(--font-display)", fontSize:18, marginBottom:8 }}>
            No Operators Found
          </div>
          <div style={{ color:"var(--text-muted)", fontSize:13 }}>
            Use the "➕ Create Operator" button in the top bar to add one.
          </div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {filtered.map(op => {
            const sc = STATUS_COLOR[op.accountStatus] || "#667799";
            const shiftC = SHIFT_COLOR[op.shift] || "#00c8ff";
            const isExp  = expanded === op._id;

            return (
              <div key={op._id} style={{
                background:"var(--bg-card)", border:"1px solid var(--border)",
                borderRadius:"var(--radius-md)",
                borderLeft:`4px solid ${op.accountStatus==="active"?"var(--orange)":"var(--red)"}`,
                overflow:"hidden",
              }}>
                {/* ── Main row ── */}
                <div style={{ padding:"14px 16px", display:"flex",
                  justifyContent:"space-between", alignItems:"center",
                  gap:12, flexWrap:"wrap", cursor:"pointer" }}
                  onClick={() => setExpanded(isExp ? null : op._id)}>

                  {/* Left */}
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    {/* Avatar */}
                    <div style={{ width:44, height:44, borderRadius:"50%",
                      background:`rgba(255,136,0,0.15)`, border:"2px solid rgba(255,136,0,0.4)",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:22, flexShrink:0 }}>👮</div>

                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                        <span style={{ fontFamily:"var(--font-display)", fontWeight:700,
                          fontSize:15 }}>{op.name}</span>
                        {/* Status pill */}
                        <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10,
                          background:`${sc}18`, border:`1px solid ${sc}44`,
                          color:sc, fontWeight:700 }}>
                          {op.accountStatus === "active" ? "● Active" : "● Suspended"}
                        </span>
                        {/* Shift pill */}
                        <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10,
                          background:`${shiftC}18`, border:`1px solid ${shiftC}44`,
                          color:shiftC, fontWeight:600 }}>
                          {op.shift === "Morning" ? "🌅" : op.shift === "Evening" ? "🌆"
                            : op.shift === "Night" ? "🌙" : "🕐"} {op.shift}
                        </span>
                      </div>
                      <div style={{ fontSize:12, color:"var(--text-muted)",
                        display:"flex", gap:12, flexWrap:"wrap" }}>
                        <span>📧 {op.email}</span>
                        {op.phone && <span>📞 {op.phone}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Right: key stats */}
                  <div style={{ display:"flex", gap:16, alignItems:"center", flexShrink:0 }}>
                    {op.badgeNumber && (
                      <div style={{ textAlign:"center" }}>
                        <div style={{ fontSize:9, color:"var(--text-dim)", marginBottom:1 }}>BADGE</div>
                        <div style={{ fontFamily:"var(--font-mono)", fontWeight:700,
                          fontSize:12, color:"var(--accent)" }}>{op.badgeNumber}</div>
                      </div>
                    )}
                    {op.department && (
                      <div style={{ textAlign:"center" }}>
                        <div style={{ fontSize:9, color:"var(--text-dim)", marginBottom:1 }}>DEPT</div>
                        <div style={{ fontWeight:700, fontSize:11,
                          color:"var(--text-primary)" }}>{op.department}</div>
                      </div>
                    )}
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:9, color:"var(--text-dim)", marginBottom:1 }}>LOGINS</div>
                      <div style={{ fontFamily:"var(--font-display)", fontWeight:800,
                        fontSize:18, color:"var(--accent)" }}>{op.loginCount || 0}</div>
                    </div>
                    <div style={{ fontSize:13, color:"var(--text-dim)",
                      transform: isExp ? "rotate(180deg)" : "none",
                      transition:"transform 0.2s" }}>▼</div>
                  </div>
                </div>

                {/* ── Expanded detail ── */}
                {isExp && (
                  <div style={{ padding:"14px 16px", borderTop:"1px solid var(--border)",
                    background:"var(--bg-elevated)" }}>
                    <div style={{ display:"grid",
                      gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:12 }}>
                      {[
                        ["🪪 Badge Number",  op.badgeNumber  || "Not set"],
                        ["🏢 Department",    op.department   || "Not set"],
                        ["🕐 Shift",         op.shift        || "Any"],
                        ["📅 Joined",        fmtDate(op.createdAt)],
                        ["🕐 Last Login",    fmtDate(op.lastLogin)],
                        ["🔑 Total Logins",  op.loginCount   || 0],
                        ["✅ Account Status",op.accountStatus],
                        ["🛠 Created By",    op.createdBy?.name || "System"],
                      ].map(([label, val]) => (
                        <div key={label} style={{ padding:"8px 12px",
                          background:"var(--bg-card)", borderRadius:"var(--radius-sm)",
                          border:"1px solid var(--border)" }}>
                          <div style={{ fontSize:10, color:"var(--text-muted)",
                            marginBottom:3 }}>{label}</div>
                          <div style={{ fontWeight:700, fontSize:12,
                            color: val === "active" ? "var(--green)"
                              : val === "suspended" ? "var(--red)"
                              : "var(--text-primary)" }}>
                            {String(val)}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Suspension reason */}
                    {op.accountStatus === "suspended" && op.suspendReason && (
                      <div style={{ marginTop:12, padding:"8px 12px", borderRadius:"var(--radius-sm)",
                        background:"var(--red-dim)", border:"1px solid rgba(255,64,96,0.3)",
                        fontSize:12, color:"var(--red)" }}>
                        🚫 Suspended: {op.suspendReason}
                        {op.suspendedAt && ` (${fmtDate(op.suspendedAt)})`}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
