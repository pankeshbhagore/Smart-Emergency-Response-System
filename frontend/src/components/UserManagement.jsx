/**
 * UserManagement  — Complete Admin User Panel
 * ═══════════════════════════════════════════════
 * Features:
 *  ✅ Platform stats (user/emergency/vehicle counts)
 *  ✅ List all users with search + role/status filters
 *  ✅ Create Operator / Admin / Citizen accounts
 *  ✅ Change user role
 *  ✅ Suspend / Activate accounts with reason
 *  ✅ Force reset password
 *  ✅ Delete user (with guard: can't delete last admin or self)
 *  ✅ First-admin seed form (when no admin exists)
 *  ✅ Pagination (50 per page)
 */
import { useState, useEffect, useCallback } from "react";
import api from "../services/api";

const ROLE_COLOR = { Admin:"#ff2050", Operator:"#ff8800", Citizen:"#00c8ff" };
const ROLE_ICON  = { Admin:"🔑", Operator:"👮", Citizen:"👤" };
const STATUS_COLOR = { active:"#00e676", suspended:"#ff4060", pending:"#ffd600" };

const fmtDate = d => d ? new Date(d).toLocaleDateString("en-IN",
  { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "—";

const fmtSecs = s => s > 3600
  ? `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
  : s > 60 ? `${Math.floor(s/60)}m ${s%60}s` : `${Math.round(s)}s`;

// ── Modal wrapper ─────────────────────────────────────────────
function Modal({ title, onClose, children, width=520 }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)",
        borderRadius:"var(--radius-lg)", padding:28, width:"100%", maxWidth:width,
        maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
          marginBottom:20 }}>
          <h3 style={{ fontFamily:"var(--font-display)", fontSize:17, fontWeight:700 }}>{title}</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Create User Form ──────────────────────────────────────────
export function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name:"", email:"", password:"", role:"Operator",
    phone:"", badgeNumber:"", department:"", shift:"Any",
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const set = (k,v) => setForm(p => ({ ...p, [k]:v }));

  const handleSubmit = async e => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const res = await api.post("/admin/users/create", form);
      onCreated(res.data.message);
      onClose();
    } catch(err) {
      setError(err.response?.data?.message || "Failed to create account");
    } finally { setLoading(false); }
  };

  return (
    <Modal title="➕ Create New Account" onClose={onClose} width={560}>
      <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:13 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div>
            <label className="form-label">👤 Full Name *</label>
            <input className="form-input" value={form.name} required
              onChange={e => set("name",e.target.value)} placeholder="Full name"/>
          </div>
          <div>
            <label className="form-label">📧 Email *</label>
            <input className="form-input" type="email" value={form.email} required
              onChange={e => set("email",e.target.value)} placeholder="email@domain.com"/>
          </div>
          <div>
            <label className="form-label">🔒 Temp Password *</label>
            <input className="form-input" type="password" value={form.password} required
              onChange={e => set("password",e.target.value)} placeholder="Min 6 chars"/>
          </div>
          <div>
            <label className="form-label">📞 Phone</label>
            <input className="form-input" value={form.phone}
              onChange={e => set("phone",e.target.value)} placeholder="+91 98765 43210"/>
          </div>
        </div>

        {/* Role selector */}
        <div>
          <label className="form-label">🎭 Role *</label>
          <div style={{ display:"flex", gap:10 }}>
            {["Operator"].map(r => (
              <button key={r} type="button" onClick={() => set("role",r)} style={{
                flex:1, padding:"10px 8px", borderRadius:"var(--radius-md)", cursor:"pointer",
                border:`2px solid ${form.role===r ? ROLE_COLOR[r] : "var(--border)"}`,
                background: form.role===r ? `${ROLE_COLOR[r]}18` : "var(--bg-elevated)",
                color: form.role===r ? ROLE_COLOR[r] : "var(--text-secondary)",
                fontWeight:700, fontSize:12, textAlign:"center",
              }}>
                <div style={{ fontSize:20, marginBottom:3 }}>{ROLE_ICON[r]}</div>
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Operator extras */}
        {form.role === "Operator" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
            <div>
              <label className="form-label">🪪 Badge No.(Optional)</label>
              <input className="form-input" value={form.badgeNumber}
                onChange={e => set("badgeNumber",e.target.value)} placeholder="OP-001"/>
            </div>
            <div>
              <label className="form-label">🏢 Department(Optional)</label>
              <input className="form-input" value={form.department}
                onChange={e => set("department",e.target.value)} placeholder="Traffic Control"/>
            </div>
            <div>
              <label className="form-label">🕐 Shift(Optional)</label>
              <select className="form-input" value={form.shift}
                onChange={e => set("shift",e.target.value)}>
                {["Morning","Evening","Night","Any"].map(s =>
                  <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Role note */}
        <div style={{ padding:"8px 12px", borderRadius:"var(--radius-md)", fontSize:12,
          background:"rgba(0,200,255,0.06)", border:"1px solid rgba(0,200,255,0.2)",
          color:"var(--text-secondary)" }}>

          {form.role === "Operator" &&
            "👮 Operator accounts can dispatch vehicles, manage active emergencies, and use the operator panel."}
        </div>

        {error && (
          <div style={{ background:"var(--red-dim)", border:"1px solid var(--red)",
            color:"var(--red)", padding:"10px 12px", borderRadius:"var(--radius-md)",
            fontSize:13 }}>{error}</div>
        )}

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:4 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Creating…" : `➕ Create ${form.role} Account`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Reset Password Modal ──────────────────────────────────────
function ResetPasswordModal({ user, onClose, onDone }) {
  const [pwd, setPwd]       = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleSubmit = async e => {
    e.preventDefault(); setError("");
    if (pwd.length < 6) { setError("Minimum 6 characters"); return; }
    if (pwd !== confirm) { setError("Passwords do not match"); return; }
    setLoading(true);
    try {
      await api.put(`/admin/users/${user._id}/reset-password`, { newPassword:pwd });
      onDone("Password reset successfully");
      onClose();
    } catch(err) { setError(err.response?.data?.message || "Failed"); }
    finally { setLoading(false); }
  };

  return (
    <Modal title={`🔐 Reset Password — ${user.name}`} onClose={onClose} width={420}>
      <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:13 }}>
        <div>
          <label className="form-label">New Password</label>
          <input className="form-input" type="password" value={pwd}
            onChange={e => setPwd(e.target.value)} placeholder="Min 6 characters" required/>
        </div>
        <div>
          <label className="form-label">Confirm Password</label>
          <input className="form-input" type="password" value={confirm}
            onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password" required/>
        </div>
        {error && <div style={{ color:"var(--red)", fontSize:13 }}>{error}</div>}
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Resetting…" : "🔐 Reset Password"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Suspend / Activate Modal ──────────────────────────────────
function StatusModal({ user, onClose, onDone }) {
  const isSuspending = user.accountStatus === "active";
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const handleSubmit = async e => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      await api.put(`/admin/users/${user._id}/status`, {
        status: isSuspending ? "suspended" : "active",
        reason,
      });
      onDone(`Account ${isSuspending ? "suspended" : "activated"} successfully`);
      onClose();
    } catch(err) { setError(err.response?.data?.message || "Failed"); }
    finally { setLoading(false); }
  };

  return (
    <Modal title={isSuspending ? `🚫 Suspend — ${user.name}` : `✅ Activate — ${user.name}`} onClose={onClose} width={420}>
      <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:13 }}>
        <div style={{ padding:"10px 14px", borderRadius:"var(--radius-md)", fontSize:13,
          background: isSuspending ? "var(--red-dim)" : "var(--green-dim)",
          border:`1px solid ${isSuspending ? "var(--red)" : "var(--green)"}`,
          color: isSuspending ? "var(--red)" : "var(--green)" }}>
          {isSuspending
            ? "Suspending this account will immediately block login access."
            : "This will restore full login access for this account."}
        </div>
        {isSuspending && (
          <div>
            <label className="form-label">Reason (optional)</label>
            <textarea className="form-input" rows={3} value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Why is this account being suspended?"/>
          </div>
        )}
        {error && <div style={{ color:"var(--red)", fontSize:13 }}>{error}</div>}
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={loading}
            className={`btn ${isSuspending ? "btn-red" : "btn-primary"}`}>
            {loading ? "Updating…" : isSuspending ? "🚫 Suspend Account" : "✅ Activate Account"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Seed Admin Form (shown when no admin exists) ──────────────
function SeedAdminPanel({ onSeeded }) {
  const [form, setForm] = useState({ name:"", email:"", password:"", seedKey:"" });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const set = (k,v) => setForm(p => ({ ...p, [k]:v }));

  const handleSubmit = async e => {
    e.preventDefault(); setError("");
    setLoading(true);
    try {
      const res = await api.post("/admin/seed", form);
      onSeeded(res.data.message);
    } catch(err) { setError(err.response?.data?.message || "Seed failed"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ maxWidth:480, margin:"0 auto" }}>
      <div className="card" style={{ borderTop:"3px solid var(--red)" }}>
        <div style={{ fontSize:40, textAlign:"center", marginBottom:12 }}>🔑</div>
        <h3 style={{ fontFamily:"var(--font-display)", textAlign:"center", fontSize:18, marginBottom:6 }}>
          First-Time Admin Setup
        </h3>
        <p style={{ color:"var(--text-muted)", fontSize:13, textAlign:"center", marginBottom:20 }}>
          No admin account exists yet. Create the first administrator.
        </p>
        <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {[["name","👤 Admin Name","Full name"],["email","📧 Email","admin@city.gov"],
            ["password","🔒 Password","Min 8 characters"],
            ["seedKey","🗝 Seed Key","Contact developer for this key"]].map(([f,label,ph])=>(
            <div key={f}>
              <label className="form-label">{label}</label>
              <input className="form-input" type={f==="password"||f==="seedKey"?"password":"text"}
                value={form[f]} onChange={e=>set(f,e.target.value)} placeholder={ph} required/>
            </div>
          ))}
          {error && <div style={{ color:"var(--red)", fontSize:13 }}>{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={loading}
            style={{ justifyContent:"center" }}>
            {loading ? "Creating…" : "🔑 Create Admin Account"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
export default function UserManagement() {
  const [stats,     setStats]     = useState(null);
  const [users,     setUsers]     = useState([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [pages,     setPages]     = useState(1);
  const [loading,   setLoading]   = useState(true);
  const [toast,     setToast]     = useState("");

  // Filters
  const [search,    setSearch]    = useState("");
  const [filterRole,setFilterRole]= useState("");
  const [filterStatus,setFilterStatus]=useState("");

  // Modals
  const [createModal,  setCreateModal]  = useState(false);
  const [resetModal,   setResetModal]   = useState(null); // user obj
  const [statusModal,  setStatusModal]  = useState(null); // user obj
  const [deleteConfirm,setDeleteConfirm]= useState(null); // user obj

  // Inline role-change
  const [roleEditing, setRoleEditing] = useState(null); // userId
  const [roleValue,   setRoleValue]   = useState("");

  const showToast = msg => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  };

  // ── Load stats ──────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    try {
      const r = await api.get("/admin/stats");
      setStats(r.data);
    } catch(e) {}
  }, []);

  // ── Load users ──────────────────────────────────────────────
  const loadUsers = useCallback(async (p=1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page:p, limit:25 });
      if (search)       params.set("search", search);
      if (filterRole)   params.set("role",   filterRole);
      if (filterStatus) params.set("status", filterStatus);
      const r = await api.get(`/admin/users?${params}`);
      setUsers(r.data.users);
      setTotal(r.data.total);
      setPages(r.data.pages);
      setPage(p);
    } catch(e) {
      console.warn("loadUsers:", e.message);
    } finally { setLoading(false); }
  }, [search, filterRole, filterStatus]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadUsers(1); }, [loadUsers]);

  // ── Delete user ─────────────────────────────────────────────
  const doDelete = async user => {
    try {
      await api.delete(`/admin/users/${user._id}`);
      showToast(`✅ User ${user.name} deleted`);
      setDeleteConfirm(null);
      loadUsers(page);
      loadStats();
    } catch(err) {
      showToast(`❌ ${err.response?.data?.message || "Delete failed"}`);
    }
  };

  // ── Change role inline ───────────────────────────────────────
  const doRoleChange = async (userId) => {
    try {
      await api.put(`/admin/users/${userId}/role`, { role:roleValue });
      showToast(`✅ Role updated to ${roleValue}`);
      setRoleEditing(null);
      loadUsers(page); loadStats();
    } catch(err) {
      showToast(`❌ ${err.response?.data?.message || "Role change failed"}`);
    }
  };

  const myUserId = localStorage.getItem("userId");

  // ── No admin exists yet ──────────────────────────────────────
  if (!loading && stats?.users?.admins === 0) {
    return <SeedAdminPanel onSeeded={msg => { showToast(msg); loadStats(); loadUsers(1); }}/>;
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", top:20, right:20, zIndex:2000,
          padding:"12px 20px", borderRadius:"var(--radius-md)", fontSize:13, fontWeight:600,
          background: toast.startsWith("✅") ? "var(--green-dim)" : "var(--red-dim)",
          border:`1px solid ${toast.startsWith("✅") ? "var(--green)" : "var(--red)"}`,
          color: toast.startsWith("✅") ? "var(--green)" : "var(--red)" }}>
          {toast}
        </div>
      )}

      {/* Modals */}
      {createModal && (
        <CreateUserModal
          onClose={() => setCreateModal(false)}
          onCreated={msg => { showToast(`✅ ${msg}`); loadUsers(1); loadStats(); }}
        />
      )}
      {resetModal && (
        <ResetPasswordModal user={resetModal} onClose={() => setResetModal(null)}
          onDone={msg => { showToast(`✅ ${msg}`); setResetModal(null); }}/>
      )}
      {statusModal && (
        <StatusModal user={statusModal} onClose={() => setStatusModal(null)}
          onDone={msg => { showToast(`✅ ${msg}`); setStatusModal(null); loadUsers(page); loadStats(); }}/>
      )}
      {deleteConfirm && (
        <Modal title="🗑 Confirm Delete" onClose={() => setDeleteConfirm(null)} width={400}>
          <div style={{ textAlign:"center", padding:"8px 0" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>⚠️</div>
            <p style={{ fontSize:14, marginBottom:6 }}>
              Permanently delete <strong>{deleteConfirm.name}</strong>?
            </p>
            <p style={{ color:"var(--text-muted)", fontSize:12, marginBottom:20 }}>
              This cannot be undone. All their data stays but login is removed.
            </p>
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-red" onClick={() => doDelete(deleteConfirm)}>
                🗑 Delete
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
        marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:700,
            marginBottom:4 }}>👥 User Management</h2>
          <div style={{ color:"var(--text-muted)", fontSize:13 }}>
            Create, manage, and monitor all system accounts
          </div>
        </div>
      </div>

      {/* ── Stats cards ──────────────────────────────────────── */}
      {stats && (
        <div className="stat-grid mb-20" style={{ gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))" }}>
          {[
            { label:"Total Users",      val:stats.users.total,      color:"var(--accent)" },
            { label:"🔑 Admins",         val:stats.users.admins,     color:"var(--red)" },
            { label:"👮 Operators",       val:stats.users.operators,  color:"var(--orange)" },
            { label:"👤 Citizens",        val:stats.users.citizens,   color:"var(--accent)" },
            { label:"✅ Active",          val:stats.users.active,     color:"var(--green)" },
            { label:"🚫 Suspended",       val:stats.users.suspended,  color:"var(--red)" },
            { label:"📅 New This Week",   val:stats.users.recentRegistrations, color:"var(--yellow)" },
          ].map(c => (
            <div key={c.label} className="stat-card">
              <div className="stat-label" style={{ fontSize:10 }}>{c.label}</div>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:24,
                color:c.color, marginTop:4 }}>{c.val ?? 0}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────────── */}
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        <input className="form-input" placeholder="🔍 Search name or email…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex:1, minWidth:200, maxWidth:320 }}/>
        <select className="form-input" value={filterRole}
          onChange={e => setFilterRole(e.target.value)} style={{ minWidth:130 }}>
          <option value="">All Roles</option>
          <option value="Admin">Admin</option>
          <option value="Operator">Operator</option>
          <option value="Citizen">Citizen</option>
        </select>
        <select className="form-input" value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)} style={{ minWidth:140 }}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => loadUsers(1)}>
          🔄 Refresh
        </button>
        <span style={{ fontSize:12, color:"var(--text-muted)", marginLeft:4 }}>
          {total} users
        </span>
      </div>

      {/* ── User table ───────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign:"center", padding:60, color:"var(--text-muted)" }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🔄</div>
          <div>Loading users…</div>
        </div>
      ) : users.length === 0 ? (
        <div style={{ textAlign:"center", padding:60, background:"var(--bg-card)",
          border:"1px solid var(--border)", borderRadius:"var(--radius-lg)",
          color:"var(--text-muted)" }}>
          <div style={{ fontSize:36, marginBottom:8 }}>👥</div>
          <div>No users found</div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {users.map(user => {
            const rc = ROLE_COLOR[user.role] || "#667799";
            const sc = STATUS_COLOR[user.accountStatus] || "#667799";
            const isSelf = user._id?.toString() === myUserId;
            const isRoleEditing = roleEditing === user._id;

            return (
              <div key={user._id} style={{ background:"var(--bg-card)",
                border:"1px solid var(--border)", borderRadius:"var(--radius-md)",
                padding:"14px 16px",
                borderLeft:`3px solid ${user.accountStatus==="suspended"?"var(--red)":rc}` }}>

                <div style={{ display:"flex", justifyContent:"space-between",
                  alignItems:"flex-start", gap:12, flexWrap:"wrap" }}>

                  {/* Left: user info */}
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:18 }}>{ROLE_ICON[user.role]}</span>
                      <span style={{ fontFamily:"var(--font-display)", fontWeight:700,
                        fontSize:14 }}>{user.name}</span>
                      {isSelf && (
                        <span style={{ fontSize:10, padding:"1px 8px", borderRadius:10,
                          background:"rgba(0,200,255,0.15)", color:"var(--accent)",
                          border:"1px solid rgba(0,200,255,0.3)" }}>YOU</span>
                      )}
                      <span style={{ fontSize:11, padding:"2px 9px", borderRadius:12,
                        background:`${rc}18`, border:`1px solid ${rc}44`, color:rc,
                        fontWeight:700 }}>{user.role}</span>
                      <span style={{ fontSize:11, padding:"2px 9px", borderRadius:12,
                        background:`${sc}18`, border:`1px solid ${sc}44`, color:sc,
                        fontWeight:600 }}>{user.accountStatus}</span>
                    </div>
                    <div style={{ fontSize:12, color:"var(--text-muted)" }}>
                      📧 {user.email}
                      {user.phone && ` · 📞 ${user.phone}`}
                    </div>
                    <div style={{ fontSize:11, color:"var(--text-dim)", marginTop:3,
                      display:"flex", gap:12, flexWrap:"wrap" }}>
                      <span>📅 Joined {fmtDate(user.createdAt)}</span>
                      {user.lastLogin && <span>🕐 Last login {fmtDate(user.lastLogin)}</span>}
                      {user.loginCount > 0 && <span>🔑 {user.loginCount} logins</span>}
                      {user.role === "Citizen" && user.emergencyCount > 0 &&
                        <span>🚨 {user.emergencyCount} emergencies</span>}
                      {user.role === "Operator" && user.badgeNumber &&
                        <span>🪪 {user.badgeNumber}</span>}
                      {user.role === "Operator" && user.department &&
                        <span>🏢 {user.department}</span>}
                      {user.createdBy && <span>🛠 By {user.createdBy.name}</span>}
                    </div>
                    {user.suspendReason && (
                      <div style={{ marginTop:4, fontSize:11, color:"var(--red)",
                        background:"var(--red-dim)", padding:"3px 10px", borderRadius:6,
                        display:"inline-block" }}>
                        🚫 Suspended: {user.suspendReason}
                      </div>
                    )}

                    {/* Inline role editor */}
                    {isRoleEditing && !isSelf && (
                      <div style={{ marginTop:8, display:"flex", gap:8, alignItems:"center" }}>
                        <select className="form-input" value={roleValue}
                          onChange={e => setRoleValue(e.target.value)}
                          style={{ fontSize:12, padding:"4px 8px", height:30 }}>
                          {["Admin","Operator","Citizen"].map(r =>
                            <option key={r} value={r}>{r}</option>)}
                        </select>
                        <button className="btn btn-primary btn-sm"
                          onClick={() => doRoleChange(user._id)}>Save</button>
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => setRoleEditing(null)}>Cancel</button>
                      </div>
                    )}
                  </div>

                  {/* Right: action buttons */}
                  {!isSelf && (
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap", justifyContent:"flex-end" }}>
                      <button className="btn btn-ghost btn-sm" title="Change role"
                        onClick={() => {
                          setRoleEditing(isRoleEditing ? null : user._id);
                          setRoleValue(user.role);
                        }}>
                        🎭 Role
                      </button>
                      <button className="btn btn-ghost btn-sm" title="Reset password"
                        onClick={() => setResetModal(user)}>
                        🔐 Password
                      </button>
                      <button className="btn btn-ghost btn-sm"
                        title={user.accountStatus==="active" ? "Suspend" : "Activate"}
                        onClick={() => setStatusModal(user)}
                        style={{ color: user.accountStatus==="active"
                          ? "var(--orange)" : "var(--green)" }}>
                        {user.accountStatus === "active" ? "🚫 Suspend" : "✅ Activate"}
                      </button>
                      <button className="btn btn-ghost btn-sm" title="Delete user"
                        onClick={() => setDeleteConfirm(user)}
                        style={{ color:"var(--red)" }}>
                        🗑
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ───────────────────────────────────────── */}
      {pages > 1 && (
        <div style={{ display:"flex", justifyContent:"center", gap:8, marginTop:16 }}>
          <button className="btn btn-ghost btn-sm" disabled={page<=1}
            onClick={() => loadUsers(page-1)}>← Prev</button>
          <span style={{ padding:"6px 12px", fontSize:12, color:"var(--text-muted)" }}>
            Page {page} of {pages} ({total} total)
          </span>
          <button className="btn btn-ghost btn-sm" disabled={page>=pages}
            onClick={() => loadUsers(page+1)}>Next →</button>
        </div>
      )}

      {/* ── Recent users quick view (from stats) ─────────────── */}
      {stats?.recentUsers?.length > 0 && (
        <div className="card mt-20" style={{ marginTop:20 }}>
          <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:14,
            marginBottom:12 }}>📅 Recently Registered</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {stats.recentUsers.map(u => (
              <div key={u._id} style={{ display:"flex", justifyContent:"space-between",
                alignItems:"center", padding:"7px 10px",
                background:"var(--bg-elevated)", borderRadius:"var(--radius-sm)",
                border:"1px solid var(--border)", fontSize:12 }}>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <span>{ROLE_ICON[u.role]}</span>
                  <span style={{ fontWeight:600 }}>{u.name}</span>
                  <span style={{ color:"var(--text-muted)" }}>{u.email}</span>
                </div>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <span style={{ fontSize:10, padding:"1px 8px", borderRadius:10,
                    background:`${ROLE_COLOR[u.role]}18`, color:ROLE_COLOR[u.role],
                    border:`1px solid ${ROLE_COLOR[u.role]}44`, fontWeight:700 }}>{u.role}</span>
                  <span style={{ color:"var(--text-dim)", fontSize:11 }}>{fmtDate(u.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
