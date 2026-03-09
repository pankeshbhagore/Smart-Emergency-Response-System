import { useEffect, useState, useCallback, useRef } from "react";
import { useTheme }    from "./context/ThemeContext";
import AdminView       from "./components/AdminView";
import OperatorPanel   from "./components/OperatorPanel";
import CitizenView     from "./components/CitizenView";
import WeatherPanel    from "./components/WeatherPanel";
import Login           from "./pages/Login";
import Register        from "./pages/Register";
import FirstTimeSetup  from "./pages/FirstTimeSetup";
import api             from "./services/api";
import socket          from "./services/socket";

const WX_ICON = c => {
  if(!c) return "🌤"; const l = c.toLowerCase();
  if(l.includes("thunder"))                   return "⛈";
  if(l.includes("rain")||l.includes("drizzle")) return "🌧";
  if(l.includes("snow"))                       return "❄️";
  if(l.includes("fog"))                        return "🌫";
  if(l.includes("cloud")||l.includes("overcast")) return "☁️";
  if(l.includes("clear")||l.includes("mainly"))   return "☀️";
  return "🌤";
};

export default function App() {
  const { theme, toggleTheme } = useTheme();

  const [auth, setAuth] = useState({
    token: localStorage.getItem("token"),
    role:  localStorage.getItem("role"),
    name:  localStorage.getItem("name"),
  });
  const [authView,      setAuthView]      = useState("login");  // "login" | "register" | "setup"
  const [setupChecked,  setSetupChecked]  = useState(false);    // have we checked if admin exists?
  const [needsSetup,    setNeedsSetup]    = useState(false);    // true = no admin in DB

  const logout = () => {
    localStorage.clear();
    setAuth({ token:null, role:null, name:null });
    setAuthView("login");
  };

  // ── Check if first-time setup needed ─────────────────────────
  // We call /admin/stats anonymously — if it returns 0 admins, show setup page.
  // (stats endpoint requires auth so we use a lightweight check endpoint)
  useEffect(() => {
    if (auth.token) { setSetupChecked(true); return; } // already logged in, skip
    (async () => {
      try {
        // Use the seed endpoint to check: if admin exists it'll say so
        // Instead, use a public "system-status" concept via seed (POST with bad key returns
        // "Admin already exists" 400 vs "Invalid seed key" 403)
        const r = await api.post("/admin/seed", {
          name:"x", email:"x@x.com", password:"xxxxxxxx", seedKey:"__CHECK__"
        });
        // 201 = created (shouldn't happen), treat as no-admin-exists
        setNeedsSetup(true);
      } catch(err) {
        const msg  = err.response?.data?.message || "";
        const code = err.response?.status;
        if (code === 400 && msg.includes("already exists")) {
          // Admin exists → normal login
          setNeedsSetup(false);
        } else if (code === 403) {
          // Got "Invalid seed key" → seed endpoint reachable but no admin yet (or bad key)
          // We try with the real key to distinguish
          try {
            await api.post("/admin/seed", {
              name:"x", email:"x@x.com", password:"xxxxxxxx",
              seedKey:"SmartCity@AdminSeed2024"
            });
            setNeedsSetup(true); // would have created one if name/email/pass valid
          } catch(e2) {
            const m2 = e2.response?.data?.message || "";
            const c2 = e2.response?.status;
            if (c2 === 400 && m2.includes("already exists")) {
              setNeedsSetup(false);
            } else if (c2 === 400 && (m2.includes("required") || m2.includes("valid"))) {
              // Seed key accepted but bad test data → no admin yet
              setNeedsSetup(true);
            } else {
              setNeedsSetup(false); // default to normal login
            }
          }
        } else {
          setNeedsSetup(false);
        }
      } finally {
        setSetupChecked(true);
      }
    })();
  }, [auth.token]);

  const [activeView,     setActiveView]     = useState("incidents");
  const [notifications,  setNotifications]  = useState([]);
  const [cityAlert,      setCityAlert]       = useState(null);
  const [weather,        setWeather]         = useState(null);
  const [weatherLoading, setWeatherLoading]  = useState(false);
  const [cityMetrics,    setCityMetrics]     = useState(null);
  const [clockNow,       setClockNow]        = useState(new Date());
  const [liveCount,      setLiveCount]       = useState(0);
  const liveCountRef = useRef(0);

  useEffect(() => {
    const t = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const addNotif = useCallback((msg, type = "info") => {
    const id = Date.now();
    setNotifications(p => [{ id, msg, type }, ...p.slice(0, 6)]);
    setTimeout(() => setNotifications(p => p.filter(n => n.id !== id)), 9000);
  }, []);

  const loadWeather = useCallback(async () => {
    if (!auth.token) return;
    setWeatherLoading(true);
    try { const r = await api.get("/weather"); setWeather(r.data); } catch(e) {}
    finally { setWeatherLoading(false); }
  }, [auth.token]);

  useEffect(() => { loadWeather(); }, [loadWeather]);

  useEffect(() => {
    if (!auth.token || auth.role === "Citizen") return;
    const fetch = async () => {
      try { const r = await api.get("/analytics/realtime"); setCityMetrics(r.data); } catch(e) {}
    };
    fetch();
    const t = setInterval(fetch, 30000);
    return () => clearInterval(t);
  }, [auth.token, auth.role]);

  useEffect(() => {
    if (!auth.token) return;
    socket.on("newEmergencyAlert", d => {
      liveCountRef.current += 1;
      setLiveCount(liveCountRef.current);
      addNotif(
        `🚨 ${d.type} · ${d.location?.address || d.location?.city || "Unknown"} · ${d.priority}`,
        d.priority === "Critical" ? "error" : "info"
      );
    });
    socket.on("cityMetricsUpdate", d => {
      if (d.surge?.isSurge) setCityAlert(d.surge.level);
      else setCityAlert(null);
      setCityMetrics(d);
    });
    socket.on("emergencyResolved", d => {
      addNotif(`✅ Emergency resolved — ${d.type || "Incident"}`, "success");
    });
    return () => {
      socket.off("newEmergencyAlert");
      socket.off("cityMetricsUpdate");
      socket.off("emergencyResolved");
    };
  }, [auth.token, addNotif]);

  // ── Not checked yet ────────────────────────────────────────
  if (!setupChecked) {
    return (
      <div style={{ minHeight:"100vh", background:"var(--bg-primary)", display:"flex",
        alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
        <div style={{ fontSize:48 }}>🚨</div>
        <div style={{ fontFamily:"var(--font-display)", fontSize:18, color:"var(--accent)",
          letterSpacing:"2px" }}>SMART EMERGENCY SYSTEM</div>
        <div style={{ fontSize:13, color:"var(--text-muted)" }}>Starting up…</div>
      </div>
    );
  }

  // ── Not logged in ──────────────────────────────────────────
  if (!auth.token) {
    if (needsSetup || authView === "setup")
      return <FirstTimeSetup onSetupComplete={() => { setNeedsSetup(false); setAuthView("login"); }}/>;
    if (authView === "register")
      return <Register setView={setAuthView}/>;
    return (
      <Login
        setAuth={setAuth}
        setView={setAuthView}
        onSetup={() => setAuthView("setup")}
      />
    );
  }

  const wxCurrent = weather?.current;

  return (
    <div className="page-wrapper">
      {/* Toasts */}
      <div className="toast-container">
        {notifications.map(n => (
          <div key={n.id} className={`toast ${n.type}`}>
            <span>{n.msg}</span>
            <button onClick={() => setNotifications(p => p.filter(x => x.id !== n.id))}
              style={{ background:"none", border:"none", color:"inherit", cursor:"pointer",
                fontSize:14, marginLeft:8, opacity:0.7 }}>✕</button>
          </div>
        ))}
      </div>

      {/* Banners */}
      {cityAlert && cityAlert !== "NORMAL" && (
        <div className="surge-banner">
          ⚡ CITY SURGE ALERT — {cityAlert} · {cityMetrics?.activeIncidents ?? 0} ACTIVE INCIDENTS
          {cityMetrics?.criticalCount > 0 && ` · ${cityMetrics.criticalCount} CRITICAL`}
        </div>
      )}
      {wxCurrent?.isHazardous && (
        <div className="weather-banner">
          🌩 WEATHER ALERT: {wxCurrent.condition} · {wxCurrent.temperature}°C · Wind {wxCurrent.windSpeed}km/h
        </div>
      )}

      {/* Header */}
      <header className="app-header">
        <div className="header-brand">
          <div className="header-logo-ring">🚨</div>
          <div>
            <div className="logo">SMART EMERGENCY SYSTEM</div>
            <div className="tagline">
              {auth.role?.toUpperCase()} PANEL · {clockNow.toLocaleTimeString()}
              {cityMetrics?.cityHealth?.safetyScore != null && (
                <span style={{ marginLeft:10, opacity:0.7 }}>
                  · Safety {cityMetrics.cityHealth.safetyScore}/100
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="header-actions">
          {/* Weather widget */}
          <div className="wx-header-widget" onClick={() => setActiveView("weather")} title="Full forecast">
            {weatherLoading ? (
              <span style={{ fontSize:12, color:"var(--text-muted)" }}>Loading…</span>
            ) : wxCurrent ? (
              <>
                <span style={{ fontSize:22 }}>{WX_ICON(wxCurrent.condition)}</span>
                <div>
                  <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:14 }}>
                    {wxCurrent.temperature}°C
                    <span style={{ fontSize:11, fontWeight:400, color:"var(--text-muted)", marginLeft:4 }}>
                      {wxCurrent.condition}
                    </span>
                  </div>
                  <div style={{ fontSize:10, color:"var(--text-muted)" }}>
                    💧{wxCurrent.humidity}% 💨{wxCurrent.windSpeed}km/h
                  </div>
                </div>
              </>
            ) : <span style={{ fontSize:12, color:"var(--text-muted)" }}>🌤 Weather</span>}
          </div>

          {auth.role !== "Citizen" && cityMetrics && (
            <div className="header-metric-chip">
              <span style={{ fontSize:10, color:"var(--text-muted)", fontFamily:"var(--font-display)",
                letterSpacing:"1px" }}>ACTIVE</span>
              <span style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:20,
                color: cityMetrics.activeIncidents>5?"var(--red)"
                      :cityMetrics.activeIncidents>2?"var(--orange)":"var(--green)" }}>
                {cityMetrics.activeIncidents ?? 0}
              </span>
            </div>
          )}

          {liveCount > 0 && (
            <button className="badge badge-red live-count-btn"
              onClick={() => { liveCountRef.current=0; setLiveCount(0); }}
              style={{ cursor:"pointer", fontWeight:700, fontSize:12 }}>
              +{liveCount} NEW
            </button>
          )}

          <div className="live-dot">LIVE</div>
          <span style={{ color:"var(--text-secondary)", fontSize:13, fontWeight:600 }}>
            {auth.name}
          </span>
          <span className={`role-pill role-${auth.role?.toLowerCase()}`}>
            {auth.role?.toUpperCase()}
          </span>
          <button className="theme-toggle" onClick={toggleTheme}
            title={`Switch to ${theme==="dark"?"light":"dark"} mode`}/>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="content-area">
        {/* ADMIN */}
        {auth.role === "Admin" && (
          <AdminView weather={weather} onReloadWeather={loadWeather} weatherLoading={weatherLoading}/>
        )}

        {/* OPERATOR */}
        {auth.role === "Operator" && (
          <>
            <div className="tab-bar mb-20">
              {[["incidents","🚨 Incidents"],["weather","🌤 Weather"]].map(([v,l]) => (
                <button key={v} className={`tab-btn ${activeView===v?"active":""}`}
                  onClick={() => setActiveView(v)}>{l}</button>
              ))}
            </div>
            {activeView==="incidents" && <OperatorPanel/>}
            {activeView==="weather"   && <WeatherPanel weather={weather} onReload={loadWeather} loading={weatherLoading}/>}
          </>
        )}

        {/* CITIZEN */}
        {auth.role === "Citizen" && (
          <CitizenView weather={weather} onReload={loadWeather} weatherLoading={weatherLoading}/>
        )}
      </div>
    </div>
  );
}
