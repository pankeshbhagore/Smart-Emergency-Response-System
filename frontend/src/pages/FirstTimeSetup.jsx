/**
 * FirstTimeSetup.jsx 
 * ══════════════════════════════════════════════════════════
 * Public page — shown when NO admin account exists yet.
 * Accessible WITHOUT login.
 * Uses POST /api/admin/seed to create the first Admin.
 *
 * After setup: redirects to Login with prefilled credentials.
 */
import { useState } from "react";
import api from "../services/api";

const SEED_KEY = "SmartCity@AdminSeed2024"; // must match backend ADMIN_SEED_KEY

export default function FirstTimeSetup({ onSetupComplete }) {
  const [step,    setStep]    = useState(1); // 1=intro, 2=form, 3=done
  const [form,    setForm]    = useState({
    name: "System Administrator",
    email: "admin@smartcity.gov",
    password: "",
    confirm: "",
    seedKey: SEED_KEY,
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [created, setCreated] = useState(null); // { name, email }
  const [showPass, setShowPass] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleCreate = async e => {
    e.preventDefault(); setError("");
    if (!form.name.trim() || !form.email.trim() || !form.password)
      { setError("All fields are required"); return; }
    if (form.password.length < 8)
      { setError("Password must be at least 8 characters"); return; }
    if (form.password !== form.confirm)
      { setError("Passwords do not match"); return; }

    setLoading(true);
    try {
      await api.post("/admin/seed", {
        name:     form.name.trim(),
        email:    form.email.trim(),
        password: form.password,
        seedKey:  form.seedKey,
      });
      setCreated({ name: form.name.trim(), email: form.email.trim() });
      setStep(3);
    } catch(err) {
      const msg = err.response?.data?.message || "Setup failed. Check the seed key.";
      setError(msg);
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-primary)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font-body)", padding: 20,
    }}>
      <div style={{ width: "100%", maxWidth: 540 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 56, marginBottom: 10 }}>🚨</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26,
            letterSpacing: "3px", color: "var(--accent)", marginBottom: 4 }}>
            SMART EMERGENCY SYSTEM
          </h1>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11,
            color: "var(--text-muted)", letterSpacing: "2px" }}>
            FIRST TIME SETUP — CITY COMMAND
          </div>
        </div>

        {/* ══ STEP 1: INTRO ══════════════════════════════════ */}
        {step === 1 && (
          <div className="card" style={{ padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚙️</div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22,
              marginBottom: 12, color: "var(--accent)" }}>
              Welcome! Let's get started.
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 14,
              lineHeight: 1.7, marginBottom: 24 }}>
              No administrator account found. This one-time setup will create the
              <strong style={{ color: "var(--text-primary)" }}> System Administrator</strong> account
              which has full control over the platform.
            </p>

            {/* What admin can do */}
            <div style={{ textAlign: "left", marginBottom: 28 }}>
              {[
                { icon: "👥", title: "Create Operator Accounts",
                  desc: "Add, manage, and suspend dispatch operators" },
                { icon: "🔑", title: "Full Platform Access",
                  desc: "Analytics, fleet management, AI dashboard, live ops" },
                { icon: "🎭", title: "Role Management",
                  desc: "Promote citizens to operators, change roles, reset passwords" },
                { icon: "📊", title: "System Statistics",
                  desc: "Monitor all users, emergencies, response times" },
              ].map(item => (
                <div key={item.icon} style={{ display: "flex", gap: 14,
                  padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{item.title}</div>
                    <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 2 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <button className="btn btn-primary" style={{ width: "100%",
              padding: "13px", fontSize: 15, justifyContent: "center" }}
              onClick={() => setStep(2)}>
              🔑 Create Admin Account →
            </button>
            <div style={{ marginTop: 16, fontSize: 11, color: "var(--text-dim)" }}>
              Already set up?{" "}
              <span onClick={onSetupComplete}
                style={{ color: "var(--accent)", cursor: "pointer", fontWeight: 600 }}>
                Go to Login →
              </span>
            </div>
          </div>
        )}

        {/* ══ STEP 2: CREATE FORM ════════════════════════════ */}
        {step === 2 && (
          <div className="card" style={{ padding: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <button onClick={() => setStep(1)} className="btn btn-ghost btn-sm">← Back</button>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700 }}>
                🔑 Create Administrator Account
              </h2>
            </div>

            <div style={{ marginBottom: 20, padding: "10px 14px",
              borderRadius: "var(--radius-md)", fontSize: 12,
              background: "rgba(255,32,80,0.07)", border: "1px solid rgba(255,32,80,0.25)",
              color: "var(--text-secondary)", lineHeight: 1.6 }}>
              ⚠️ <strong>This account will have full system access.</strong> Use a strong password
              and keep these credentials safe. This setup can only be run once.
            </div>

            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label className="form-label">👤 Administrator Name *</label>
                <input className="form-input" value={form.name} required
                  onChange={e => set("name", e.target.value)}
                  placeholder="e.g. City Emergency Director"/>
              </div>
              <div>
                <label className="form-label">📧 Email Address *</label>
                <input className="form-input" type="email" value={form.email} required
                  onChange={e => set("email", e.target.value)}
                  placeholder="admin@cityname.gov"/>
              </div>
              <div>
                <label className="form-label">🔒 Password * <span style={{ color:"var(--text-dim)", fontWeight:400 }}>(min 8 chars)</span></label>
                <div style={{ position: "relative" }}>
                  <input className="form-input" type={showPass ? "text" : "password"}
                    value={form.password} required onChange={e => set("password", e.target.value)}
                    placeholder="Strong password" style={{ paddingRight: 44 }}/>
                  <button type="button" onClick={() => setShowPass(p => !p)}
                    style={{ position: "absolute", right: 12, top: "50%",
                      transform: "translateY(-50%)", background: "none", border: "none",
                      cursor: "pointer", fontSize: 16, color: "var(--text-muted)" }}>
                    {showPass ? "🙈" : "👁"}
                  </button>
                </div>
                {form.password && (
                  <div style={{ marginTop: 5, display: "flex", gap: 3, alignItems: "center" }}>
                    {[8,12,16].map((min,i) => (
                      <div key={i} style={{ height: 3, flex: 1, borderRadius: 2,
                        transition: "background 0.2s",
                        background: form.password.length >= min
                          ? i===0 ? "var(--red)" : i===1 ? "var(--yellow)" : "var(--green)"
                          : "var(--bg-elevated)" }}/>
                    ))}
                    <span style={{ fontSize: 10, color: "var(--text-dim)", marginLeft: 4, minWidth: 36 }}>
                      {form.password.length < 8 ? "Weak"
                        : form.password.length < 12 ? "Fair" : "Strong"}
                    </span>
                  </div>
                )}
              </div>
              <div>
                <label className="form-label">🔒 Confirm Password *</label>
                <input className="form-input" type={showPass ? "text" : "password"}
                  value={form.confirm} required onChange={e => set("confirm", e.target.value)}
                  placeholder="Re-enter password"/>
                {form.confirm && form.password !== form.confirm && (
                  <div style={{ fontSize: 11, color: "var(--red)", marginTop: 4 }}>✗ Passwords do not match</div>
                )}
                {form.confirm && form.password === form.confirm && form.confirm.length >= 8 && (
                  <div style={{ fontSize: 11, color: "var(--green)", marginTop: 4 }}>✓ Passwords match</div>
                )}
              </div>
              <div>
                <label className="form-label">🗝 Seed Key *
                  <span style={{ fontWeight: 400, color: "var(--text-dim)", marginLeft: 4 }}>
                    (from .env ADMIN_SEED_KEY)
                  </span>
                </label>
                <input className="form-input" type="password" value={form.seedKey}
                  required onChange={e => set("seedKey", e.target.value)}
                  placeholder="SmartCity@AdminSeed2024"/>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                  Default key: <code style={{ background: "var(--bg-elevated)", padding: "1px 6px",
                    borderRadius: 4, fontSize: 11 }}>SmartCity@AdminSeed2024</code>
                  {" "} — change in <code style={{ fontSize:11 }}>backend/.env</code>
                </div>
              </div>

              {error && (
                <div style={{ background: "var(--red-dim)", border: "1px solid var(--red)",
                  color: "var(--red)", padding: "10px 14px", borderRadius: "var(--radius-md)",
                  fontSize: 13 }}>⚠️ {error}</div>
              )}

              <button type="submit" disabled={loading} className="btn btn-primary"
                style={{ padding: "13px", fontSize: 15, justifyContent: "center",
                  width: "100%", marginTop: 4 }}>
                {loading ? "⏳ Creating admin account…" : "🔑 Complete Setup →"}
              </button>
            </form>
          </div>
        )}

        {/* ══ STEP 3: SUCCESS ════════════════════════════════ */}
        {step === 3 && created && (
          <div className="card" style={{ padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26,
              color: "var(--green)", marginBottom: 8, letterSpacing: 1 }}>
              Setup Complete!
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 24 }}>
              Administrator account created successfully.
            </p>

            {/* Credentials card */}
            <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)", padding: "16px 20px", marginBottom: 24,
              textAlign: "left" }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700,
                marginBottom: 10, letterSpacing: "1px" }}>YOUR ADMIN CREDENTIALS</div>
              {[["📧 Email", created.email], ["🎭 Role", "Admin"], ["🔑 Access", "Full System"]].map(([l,v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between",
                  padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                  <span style={{ color: "var(--text-muted)" }}>{l}</span>
                  <span style={{ fontWeight: 700, color: "var(--accent)" }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Next steps */}
            <div style={{ textAlign: "left", marginBottom: 24 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700,
                fontSize: 13, marginBottom: 10, color: "var(--text-muted)" }}>
                NEXT STEPS:
              </div>
              {[
                "Login with your admin credentials",
                "Go to Admin Panel → 👥 Users tab",
                "Click '➕ Create Account' → select Operator role",
                "Fill operator details: name, email, temp password",
                "Share credentials with your dispatch operators",
              ].map((step, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "7px 0",
                  borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                  <span style={{ color: "var(--accent)", fontWeight: 700,
                    minWidth: 20 }}>{i + 1}.</span>
                  <span style={{ color: "var(--text-secondary)" }}>{step}</span>
                </div>
              ))}
            </div>

            <button className="btn btn-primary" style={{ width: "100%",
              padding: "13px", fontSize: 15, justifyContent: "center" }}
              onClick={onSetupComplete}>
              🚀 Go to Login →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
