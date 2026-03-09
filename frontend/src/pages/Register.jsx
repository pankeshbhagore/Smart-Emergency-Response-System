/**
 * Register Page  — Secure Citizen Registration
 * ═════════════════════════════════════════════════
 * - Citizens only register here (no role selection = no spoofing)
 * - Operators/Admins created by Admin from the Admin panel
 * - Clear messaging about what the account does
 */
import { useState } from "react";
import api from "../services/api";

export default function Register({ setView }) {
  const [form, setForm]     = useState({ name:"", email:"", password:"", confirm:"", phone:"" });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]        = useState("");
  const [error, setError]    = useState("");
  const [showPass, setShowPass] = useState(false);

  const set = (f, v) => setForm(p => ({ ...p, [f]:v }));

  const validate = () => {
    if (!form.name.trim())    return "Full name is required";
    if (!form.email.trim())   return "Email address is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Enter a valid email address";
    if (form.password.length < 6) return "Password must be at least 6 characters";
    if (form.password !== form.confirm) return "Passwords do not match";
    return null;
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError(""); setMsg("");
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);
    try {
      await api.post("/auth/register", {
        name:     form.name.trim(),
        email:    form.email.trim(),
        password: form.password,
        phone:    form.phone.trim(),
      });
      setMsg("✅ Account created! You can now log in.");
      setForm({ name:"", email:"", password:"", confirm:"", phone:"" });
    } catch(err) {
      setError(err.response?.data?.message || "Registration failed. Please try again.");
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight:"100vh", background:"var(--bg-primary)",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"var(--font-body)", padding:20,
    }}>
      <div style={{ width:"100%", maxWidth:460 }}>

        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ fontSize:48, marginBottom:10 }}>🆔</div>
          <h1 style={{ fontFamily:"var(--font-display)", fontSize:24,
            letterSpacing:"2px", color:"var(--accent)", marginBottom:4 }}>
            CITIZEN REGISTRATION
          </h1>
          <div style={{ fontFamily:"var(--font-mono)", fontSize:11,
            color:"var(--text-muted)", letterSpacing:"1px" }}>
            SMART EMERGENCY SYSTEM 
          </div>
        </div>

        {/* Info banner */}
        <div style={{ marginBottom:20, padding:"12px 16px", borderRadius:"var(--radius-md)",
          background:"rgba(0,200,255,0.08)", border:"1px solid rgba(0,200,255,0.25)",
          fontSize:12, color:"var(--text-secondary)", lineHeight:1.6 }}>
          <strong style={{ color:"var(--accent)" }}>📋 Citizen Account</strong> — Report emergencies,
          track response units in real-time, access first aid guides and nearby services.
          <br/>
          <span style={{ color:"var(--text-dim)" }}>
            Operator/Admin accounts are created by the system administrator.
          </span>
        </div>

        <div className="card" style={{ padding:32 }}>
          <h2 style={{ fontFamily:"var(--font-display)", marginBottom:24, fontSize:18,
            letterSpacing:"1px" }}>Create Account</h2>

          <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:14 }}>

            {/* Full Name */}
            <div>
              <label className="form-label">👤 Full Name *</label>
              <input className="form-input" type="text" value={form.name}
                onChange={e => set("name", e.target.value)}
                placeholder="Your full name" required autoFocus/>
            </div>

            {/* Email */}
            <div>
              <label className="form-label">📧 Email Address *</label>
              <input className="form-input" type="email" value={form.email}
                onChange={e => set("email", e.target.value)}
                placeholder="you@example.com" required/>
            </div>

            {/* Phone (optional) */}
            <div>
              <label className="form-label">
                📞 Mobile Number
                <span style={{ fontWeight:400, color:"var(--text-dim)", marginLeft:4 }}>(optional)</span>
              </label>
              <input className="form-input" type="tel" value={form.phone}
                onChange={e => set("phone", e.target.value)}
                placeholder="+91 98765 43210"/>
            </div>

            {/* Password */}
            <div>
              <label className="form-label">🔒 Password *</label>
              <div style={{ position:"relative" }}>
                <input className="form-input" type={showPass ? "text" : "password"}
                  value={form.password} onChange={e => set("password", e.target.value)}
                  placeholder="Min. 6 characters" required
                  style={{ paddingRight:44 }}/>
                <button type="button" onClick={() => setShowPass(p => !p)}
                  style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                    background:"none", border:"none", cursor:"pointer", fontSize:16,
                    color:"var(--text-muted)" }}>
                  {showPass ? "🙈" : "👁"}
                </button>
              </div>
              {/* Password strength */}
              {form.password && (
                <div style={{ marginTop:6, display:"flex", gap:4, alignItems:"center" }}>
                  {[6,8,12].map((min,i) => (
                    <div key={i} style={{ height:3, flex:1, borderRadius:2,
                      background: form.password.length >= min
                        ? i === 0 ? "var(--red)" : i === 1 ? "var(--yellow)" : "var(--green)"
                        : "var(--bg-elevated)",
                      transition:"background 0.2s" }}/>
                  ))}
                  <span style={{ fontSize:10, color:"var(--text-dim)", marginLeft:4, minWidth:36 }}>
                    {form.password.length < 6 ? "Weak"
                      : form.password.length < 8 ? "Fair" : "Good"}
                  </span>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="form-label">🔒 Confirm Password *</label>
              <input className="form-input" type={showPass ? "text" : "password"}
                value={form.confirm} onChange={e => set("confirm", e.target.value)}
                placeholder="Re-enter password" required/>
              {form.confirm && form.password !== form.confirm && (
                <div style={{ fontSize:11, color:"var(--red)", marginTop:4 }}>
                  ✗ Passwords do not match
                </div>
              )}
              {form.confirm && form.password === form.confirm && form.confirm.length >= 6 && (
                <div style={{ fontSize:11, color:"var(--green)", marginTop:4 }}>
                  ✓ Passwords match
                </div>
              )}
            </div>

            {/* Error / Success */}
            {error && (
              <div style={{ background:"var(--red-dim)", border:"1px solid var(--red)",
                color:"var(--red)", padding:"10px 14px", borderRadius:"var(--radius-md)",
                fontSize:13 }}>{error}</div>
            )}
            {msg && (
              <div style={{ background:"var(--green-dim)", border:"1px solid var(--green)",
                color:"var(--green)", padding:"10px 14px", borderRadius:"var(--radius-md)",
                fontSize:13 }}>{msg}</div>
            )}

            <button type="submit" disabled={loading} className="btn btn-primary"
              style={{ padding:"13px", fontSize:15, justifyContent:"center",
                marginTop:4, width:"100%", letterSpacing:1 }}>
              {loading ? "⏳ Creating account…" : "🆔 Create Citizen Account →"}
            </button>
          </form>

          <hr style={{ margin:"20px 0", borderColor:"var(--border)" }}/>
          <p style={{ textAlign:"center", fontSize:13, color:"var(--text-muted)" }}>
            Already registered?{" "}
            <span onClick={() => setView("login")}
              style={{ color:"var(--accent)", cursor:"pointer", fontWeight:600 }}>
              Sign in here
            </span>
          </p>
        </div>

        <div style={{ textAlign:"center", marginTop:20, fontSize:11, color:"var(--text-dim)" }}>
          🔒 Secure registration · Data encrypted · For Operators contact your system admin
        </div>
      </div>
    </div>
  );
}
