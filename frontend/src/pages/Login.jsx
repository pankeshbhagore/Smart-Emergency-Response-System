/**
 * Login Page  — Role-aware branding + suspension message
 */
import { useState } from "react";
import api from "../services/api";

export default function Login({ setAuth, setView, onSetup }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const res = await api.post("/auth/login", { email, password });
      const d   = res.data;
      localStorage.setItem("token",  d.token);
      localStorage.setItem("role",   d.role);
      localStorage.setItem("name",   d.name);
      localStorage.setItem("userId", d.userId || "");
      setAuth({ token:d.token, role:d.role, name:d.name });
    } catch(err) {
      const data = err.response?.data;
      const msg  = data?.message || "Authentication failed. Check your credentials.";
      setError(data?.suspended
        ? "🚫 " + msg + " Contact your administrator."
        : msg);
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight:"100vh", background:"var(--bg-primary)",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"var(--font-body)", padding:20,
    }}>
      <div style={{ width:"100%", maxWidth:420 }}>

        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:40 }}>
          <div style={{ fontSize:52, marginBottom:12 }}>🚨</div>
          <h1 style={{ fontFamily:"var(--font-display)", fontSize:26,
            letterSpacing:"3px", color:"var(--accent)", marginBottom:4 }}>
            SMART EMERGENCY
          </h1>
          <div style={{ fontFamily:"var(--font-mono)", fontSize:11,
            color:"var(--text-muted)", letterSpacing:"2px" }}>
            CITY COMMAND SYSTEM
          </div>
        </div>

        <div className="card" style={{ padding:36 }}>
          <h2 style={{ fontFamily:"var(--font-display)", marginBottom:6, fontSize:20,
            letterSpacing:"1px" }}>System Login</h2>
          <p style={{ color:"var(--text-muted)", fontSize:12, marginBottom:24 }}>
            Access your account — Citizen, Operator, or Admin
          </p>

          <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <label className="form-label">📧 Email Address</label>
              <input className="form-input" type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" required autoFocus/>
            </div>

            <div>
              <label className="form-label">🔒 Password</label>
              <div style={{ position:"relative" }}>
                <input className="form-input" type={showPass ? "text" : "password"}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required style={{ paddingRight:44 }}/>
                <button type="button" onClick={() => setShowPass(p => !p)}
                  style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                    background:"none", border:"none", cursor:"pointer", fontSize:16,
                    color:"var(--text-muted)" }}>
                  {showPass ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ background:"var(--red-dim)", border:"1px solid var(--red)",
                color:"var(--red)", padding:"10px 14px", borderRadius:"var(--radius-md)",
                fontSize:13, lineHeight:1.5 }}>
                ⚠️ {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn btn-primary"
              style={{ padding:"13px", fontSize:15, justifyContent:"center",
                width:"100%", letterSpacing:1, marginTop:4 }}>
              {loading
                ? <><span style={{ display:"inline-block", animation:"pulse-dot 1s infinite" }}>⏳</span> Authenticating…</>
                : "Access System →"
              }
            </button>
          </form>

          {/* Role guide */}
          <div style={{ marginTop:20, display:"flex", gap:8, justifyContent:"center",
            flexWrap:"wrap" }}>
            {[
              { role:"Admin",    icon:"🔑", color:"var(--red)" },
              { role:"Operator", icon:"👮", color:"var(--orange)" },
              { role:"Citizen",  icon:"👤", color:"var(--accent)" },
            ].map(({ role, icon, color }) => (
              <div key={role} style={{ padding:"4px 12px", borderRadius:20, fontSize:11,
                border:`1px solid ${color}44`, background:`${color}11`,
                color, fontWeight:600 }}>
                {icon} {role}
              </div>
            ))}
          </div>

          <hr style={{ margin:"20px 0", borderColor:"var(--border)" }}/>
          <p style={{ textAlign:"center", fontSize:13, color:"var(--text-muted)" }}>
            No account?{" "}
            <span onClick={() => setView("register")}
              style={{ color:"var(--accent)", cursor:"pointer", fontWeight:600 }}>
              Register as Citizen
            </span>
          </p>
          <p style={{ textAlign:"center", fontSize:11, color:"var(--text-dim)", marginTop:8 }}>
            Operator account? Contact your system administrator.
          </p>
          {onSetup && (
            <p style={{ textAlign:"center", fontSize:11, color:"var(--text-dim)", marginTop:6 }}>
              First time?{" "}
              <span onClick={onSetup}
                style={{ color:"var(--text-muted)", cursor:"pointer", textDecoration:"underline" }}>
                Run system setup
              </span>
            </p>
          )}
        </div>

        <div style={{ textAlign:"center", marginTop:24, fontSize:11, color:"var(--text-dim)" }}>
          🔒 Secure · Encrypted · Audit logged
        </div>
      </div>
    </div>
  );
}
