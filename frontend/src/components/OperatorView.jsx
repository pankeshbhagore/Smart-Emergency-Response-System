import { useState, useEffect, useCallback } from "react";
import { useTheme } from "../context/ThemeContext";
import api from "../services/api";
import socket from "../services/socket";
import { MapContainer, TileLayer, Marker, Polyline, Popup, CircleMarker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png"
});

function MapRecenter({ pos }) {
  const map = useMap();
  useEffect(() => { if (pos) map.setView(pos, 14, { animate: true }); }, [pos, map]);
  return null;
}

const TYPE_CLR = { Medical:"#3b82f6", Fire:"#ef4444", Accident:"#f59e0b", Crime:"#8b5cf6", Breakdown:"#10b981", Flood:"#06b6d4", "Gas Leak":"#fbbf24", Other:"#6b7280" };
const PRIORITY_CLR = { Critical:"#ef4444", High:"#f97316", Medium:"#f59e0b", Normal:"#3b82f6", Low:"#10b981" };

export default function OperatorView() {
  const { theme: T, fs } = useTheme();
  const [emergencies, setEmergencies] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [signals, setSignals] = useState([]);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("live");
  const [vehicleLocations, setVehicleLocations] = useState({});
  const [routes, setRoutes] = useState({});
  const [filter, setFilter] = useState("active");
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  const [manualType, setManualType] = useState("Medical");
  const [manualLat, setManualLat] = useState("22.7196");
  const [manualLng, setManualLng] = useState("75.8577");
  const [manualDesc, setManualDesc] = useState("");
  const [dispatching, setDispatching] = useState(false);

  const notify = (msg, type="info") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const fetchData = useCallback(async () => {
    try {
      const [e, v, s] = await Promise.all([
        api.get("/emergencies?limit=200"),
        api.get("/vehicles"),
        api.get("/signals")
      ]);
      setEmergencies(e.data);
      setVehicles(v.data);
      setSignals(s.data);
    } catch(err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    socket.on("newEmergency", (data) => {
      fetchData();
      notify(`🚨 NEW: ${data.type} emergency — Sev. ${data.severityScore}`, "critical");
    });
    socket.on("vehicleLocationUpdate", (data) => {
      setVehicleLocations(prev => ({ ...prev, [data.vehicleId]: { lat: data.lat, lng: data.lng, eta: data.etaSeconds, progress: data.progress } }));
    });
    socket.on("vehicleArrived", () => { fetchData(); notify("✅ Vehicle arrived", "success"); });
    socket.on("signalUpdate", (data) => setSignals(prev => [...prev.filter(s => s.signalId !== data.signalId), data]));
    socket.on("emergencyResolved", () => fetchData());
    return () => {
      socket.off("newEmergency"); socket.off("vehicleLocationUpdate");
      socket.off("vehicleArrived"); socket.off("signalUpdate"); socket.off("emergencyResolved");
    };
  }, [fetchData]);

  const acknowledge = async (id) => {
    try {
      await api.patch(`/emergencies/${id}/acknowledge`);
      notify("Emergency acknowledged", "success");
      fetchData();
    } catch { notify("Failed to acknowledge", "error"); }
  };

  const manualDispatch = async () => {
    setDispatching(true);
    try {
      const res = await api.post("/emergencies", { type: manualType, lat: parseFloat(manualLat), lng: parseFloat(manualLng), description: manualDesc });
      notify(`Dispatched for ${manualType} — Unit ${res.data.assignedVehicle?.vehicleId || "assigned"}`, "success");
      setManualDesc("");
      fetchData();
    } catch(err) { notify(err.response?.data?.message || "Dispatch failed", "error"); }
    finally { setDispatching(false); }
  };

  const TYPE_ICONS = { Medical:"🏥", Fire:"🔥", Accident:"💥", Crime:"🚔", Breakdown:"🔧", Flood:"🌊", "Gas Leak":"💨", Other:"⚠️" };
  const filtered = filter === "active" ? emergencies.filter(e => !["Resolved","Cancelled"].includes(e.status))
    : filter === "resolved" ? emergencies.filter(e => e.status === "Resolved")
    : emergencies;

  const inp = { padding: "10px 14px", background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, fontSize: fs, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" };
  const tabBtn = (t) => ({ padding: "9px 16px", background: tab === t ? T.accent : "transparent", border: `1px solid ${tab === t ? T.accent : T.border}`, borderRadius: 10, color: tab === t ? "#fff" : T.textSub, fontSize: fs - 1, fontWeight: tab === t ? 700 : 400, cursor: "pointer", transition: "all 0.2s" });

  return (
    <div style={{ padding: "12px 16px", maxWidth: 1400, margin: "0 auto" }}>

      {notification && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 9999, padding: "12px 18px", borderRadius: 12, fontSize: fs - 1, fontWeight: 600, maxWidth: 320, color: T.text, background: notification.type === "critical" ? T.redGlow : notification.type === "success" ? T.greenGlow : T.accentGlow, border: `1px solid ${notification.type === "critical" ? T.red : notification.type === "success" ? T.green : T.accent}`, backdropFilter: "blur(8px)", boxShadow: T.shadow }}>
          {notification.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontWeight: 900, fontSize: fs + 4, color: T.text }}>🎮 Operations Control</div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 14px", fontSize: fs - 1 }}>
            <span style={{ color: T.red, fontWeight: 700 }}>{emergencies.filter(e => !["Resolved","Cancelled"].includes(e.status)).length}</span>
            <span style={{ color: T.textSub }}> active</span>
          </div>
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 14px", fontSize: fs - 1 }}>
            <span style={{ color: T.green, fontWeight: 700 }}>{vehicles.filter(v => v.status === "Available").length}</span>
            <span style={{ color: T.textSub }}> vehicles</span>
          </div>
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 14px", fontSize: fs - 1 }}>
            <span style={{ color: signals.filter(s => s.state === "GREEN").length > 0 ? T.green : T.textMuted, fontWeight: 700 }}>{signals.filter(s => s.state === "GREEN").length}</span>
            <span style={{ color: T.textSub }}> green signals</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[["live","🚨 Live Feed"],["map","🗺️ Live Map"],["dispatch","⚡ Manual Dispatch"],["signals","🚦 Signals"]].map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)} style={tabBtn(t)}>{l}</button>
        ))}
      </div>

      {/* ── LIVE FEED ── */}
      {tab === "live" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {[["active","🔴 Active"],["resolved","✅ Resolved"],["all","📋 All"]].map(([f,l]) => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: "7px 14px", background: filter===f ? T.accent+"22" : "transparent", border: `1px solid ${filter===f ? T.accent : T.border}`, borderRadius: 8, color: filter===f ? T.accent : T.textSub, fontSize: fs-1, cursor: "pointer" }}>
                {l} ({f==="active"?emergencies.filter(e=>!["Resolved","Cancelled"].includes(e.status)).length:f==="resolved"?emergencies.filter(e=>e.status==="Resolved").length:emergencies.length})
              </button>
            ))}
            <button onClick={fetchData} style={{ padding: "7px 14px", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, color: T.textSub, fontSize: fs-1, cursor: "pointer", marginLeft: "auto" }}>↺ Refresh</button>
          </div>

          {loading ? <div style={{ textAlign:"center", padding: 40, color: T.textSub }}>Loading...</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map(e => (
                <div key={e._id} onClick={() => setSelected(selected?._id === e._id ? null : e)}
                  style={{ background: T.panel, borderRadius: 14, padding: "14px 16px", border: `2px solid ${selected?._id === e._id ? T.accent : T.border}`, cursor: "pointer", transition: "border 0.2s, transform 0.1s" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 28, flexShrink: 0 }}>{TYPE_ICONS[e.type] || "⚠️"}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 800, fontSize: fs + 1, color: T.text }}>{e.type}</span>
                        <span style={{ background: `${PRIORITY_CLR[e.priority] || T.accent}22`, color: PRIORITY_CLR[e.priority] || T.accent, padding: "2px 8px", borderRadius: 12, fontSize: fs - 2, fontWeight: 700, border: `1px solid ${PRIORITY_CLR[e.priority] || T.accent}44` }}>{e.priority}</span>
                        <span style={{ color: e.status === "Resolved" ? T.green : e.status === "Reported" ? T.red : T.yellow, fontWeight: 700, fontSize: fs - 1 }}>{e.status}</span>
                        {e.severityScore > 70 && <span style={{ background: T.redGlow, color: T.red, padding: "2px 8px", borderRadius: 12, fontSize: fs - 2, fontWeight: 700 }}>Sev {e.severityScore}</span>}
                      </div>
                      <div style={{ color: T.textSub, fontSize: fs - 2, marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <span>📍 {e.location?.lat?.toFixed(4)}, {e.location?.lng?.toFixed(4)}</span>
                        {e.assignedVehicle && <span>🚗 {e.assignedVehicle}</span>}
                        {e.responseTime && <span>⏱️ {e.responseTime}s RT</span>}
                        <span>🕐 {new Date(e.createdAt).toLocaleTimeString()}</span>
                      </div>
                      {e.description && <div style={{ color: T.textMuted, fontSize: fs - 2, marginTop: 4, fontStyle: "italic" }}>{e.description}</div>}
                      {e.weatherContext?.condition && (
                        <div style={{ color: T.textMuted, fontSize: fs - 3, marginTop: 3 }}>
                          🌤 {e.weatherContext.condition} · {e.weatherContext.temperature}°C {e.weatherContext.isHazardous ? "⚠️ Hazardous" : ""}
                        </div>
                      )}
                      {e.mlTags?.length > 0 && (
                        <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                          {e.mlTags.map(t => <span key={t} style={{ background: T.accentGlow, color: T.accentLight, border: `1px solid ${T.accent}33`, padding: "1px 6px", borderRadius: 10, fontSize: fs - 4, fontWeight: 600 }}>{t}</span>)}
                        </div>
                      )}
                    </div>
                    {/* Action buttons */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                      {e.status === "Reported" && (
                        <button onClick={ev => { ev.stopPropagation(); acknowledge(e._id); }} style={{ padding: "6px 12px", background: T.accentGlow, border: `1px solid ${T.accent}`, color: T.accent, borderRadius: 8, cursor: "pointer", fontSize: fs - 2, fontWeight: 700 }}>
                          ✅ Acknowledge
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded details */}
                  {selected?._id === e._id && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.border}`, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
                      {[
                        ["Reporter", e.reporterName || e.reportedBy || "—"],
                        ["SLA Target", e.sla?.targetResponseTime ? `${e.sla.targetResponseTime}s` : "—"],
                        ["SLA Status", e.sla?.breached === false ? "✅ MET" : e.sla?.breached === true ? "❌ BREACH" : "—"],
                        ["Carbon Saved", e.carbonSaved ? `${e.carbonSaved} kg` : "—"],
                        ["Distance", e.distanceKm ? `${e.distanceKm} km` : "—"],
                        ["Dispatch Time", e.dispatchTime ? `${e.dispatchTime}s` : "—"]
                      ].map(([label, val]) => (
                        <div key={label} style={{ background: T.bg2, borderRadius: 8, padding: "8px 12px" }}>
                          <div style={{ color: T.textMuted, fontSize: fs - 3, fontWeight: 700 }}>{label}</div>
                          <div style={{ color: T.text, fontWeight: 700, fontSize: fs - 1, marginTop: 2 }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {filtered.length === 0 && <div style={{ textAlign: "center", padding: 40, color: T.textSub }}>No {filter} emergencies</div>}
            </div>
          )}
        </div>
      )}

      {/* ── LIVE MAP ── */}
      {tab === "map" && (
        <div>
          <MapContainer center={[22.7196, 75.8577]} zoom={13} style={{ height: 580, borderRadius: 14, border: `1px solid ${T.border}` }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {emergencies.filter(e => !["Resolved","Cancelled"].includes(e.status)).map(e => (
              <CircleMarker key={e._id} center={[e.location.lat, e.location.lng]} radius={12}
                pathOptions={{ color: PRIORITY_CLR[e.priority] || T.accent, fillOpacity: 0.7, weight: 2 }}>
                <Popup><strong>{TYPE_ICONS[e.type]} {e.type}</strong><br />{e.priority} · {e.status}<br />{e.assignedVehicle && `Unit: ${e.assignedVehicle}`}</Popup>
              </CircleMarker>
            ))}
            {Object.entries(vehicleLocations).map(([vid, loc]) => (
              <CircleMarker key={vid} center={[loc.lat, loc.lng]} radius={8}
                pathOptions={{ color: T.green, fillOpacity: 0.9, weight: 2 }}>
                <Popup>🚑 {vid} — ETA: {loc.eta}s · {loc.progress}%</Popup>
              </CircleMarker>
            ))}
            {signals.map(s => (
              <CircleMarker key={s.signalId} center={[s.location.lat, s.location.lng]} radius={7}
                pathOptions={{ color: s.state === "GREEN" ? "#10b981" : "#ef4444", fillOpacity: 0.9, weight: 2 }}>
                <Popup>🚦 {s.signalId} — {s.state}</Popup>
              </CircleMarker>
            ))}
          </MapContainer>
          <div style={{ marginTop: 10, display: "flex", gap: 16, fontSize: fs - 2, color: T.textSub, flexWrap: "wrap" }}>
            <span>🔴 Critical/High emergency</span><span>🟡 Medium emergency</span>
            <span>🟢 Vehicle en route</span><span>🚦 Traffic signal</span>
          </div>
        </div>
      )}

      {/* ── MANUAL DISPATCH ── */}
      {tab === "dispatch" && (
        <div style={{ background: T.panel, borderRadius: 16, padding: 24, border: `1px solid ${T.border}`, maxWidth: 560 }}>
          <div style={{ fontWeight: 800, fontSize: fs + 2, marginBottom: 20 }}>⚡ Manual Emergency Dispatch</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={{ color: T.textSub, fontSize: fs - 2, fontWeight: 700, display: "block", marginBottom: 6 }}>EMERGENCY TYPE</label>
              <select value={manualType} onChange={e => setManualType(e.target.value)} style={inp}>
                {["Medical","Fire","Accident","Crime","Breakdown","Flood","Gas Leak"].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: T.textSub, fontSize: fs - 2, fontWeight: 700, display: "block", marginBottom: 6 }}>LATITUDE</label>
              <input value={manualLat} onChange={e => setManualLat(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={{ color: T.textSub, fontSize: fs - 2, fontWeight: 700, display: "block", marginBottom: 6 }}>LONGITUDE</label>
              <input value={manualLng} onChange={e => setManualLng(e.target.value)} style={inp} />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={{ color: T.textSub, fontSize: fs - 2, fontWeight: 700, display: "block", marginBottom: 6 }}>DESCRIPTION</label>
            <textarea value={manualDesc} onChange={e => setManualDesc(e.target.value)} rows={3} placeholder="Optional description..." style={{ ...inp, resize: "vertical" }} />
          </div>
          <button onClick={manualDispatch} disabled={dispatching} style={{ marginTop: 18, width: "100%", padding: "13px", background: `linear-gradient(135deg, ${T.red}, #ff6b6b)`, border: "none", borderRadius: 12, color: "#fff", fontSize: fs, fontWeight: 800, cursor: dispatching ? "not-allowed" : "pointer" }}>
            {dispatching ? "⏳ Dispatching..." : "🚨 Dispatch Emergency"}
          </button>

          {/* Available vehicles summary */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 700, fontSize: fs, marginBottom: 10 }}>Available Vehicles</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {vehicles.filter(v => v.status === "Available").map(v => (
                <div key={v.vehicleId} style={{ background: T.bg2, border: `1px solid ${T.green}44`, borderRadius: 10, padding: "8px 12px", fontSize: fs - 2 }}>
                  <div style={{ fontWeight: 700, color: T.text }}>{v.vehicleId}</div>
                  <div style={{ color: T.textSub }}>{v.type}</div>
                  <div style={{ color: v.fuelType === "EV" ? T.green : T.textMuted, fontSize: fs - 3 }}>{v.fuelType} {v.fuelType === "EV" ? `🔋${v.batteryLevel}%` : ""}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── SIGNALS ── */}
      {tab === "signals" && (
        <div>
          <div style={{ fontWeight: 800, fontSize: fs + 1, marginBottom: 14 }}>🚦 Traffic Signal Status</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {signals.map(s => (
              <div key={s.signalId} style={{ background: T.panel, border: `2px solid ${s.state === "GREEN" ? T.green : T.red}66`, borderRadius: 14, padding: "16px 20px", textAlign: "center", minWidth: 110 }}>
                <div style={{ fontSize: 28 }}>{s.state === "GREEN" ? "🟢" : "🔴"}</div>
                <div style={{ fontWeight: 700, marginTop: 8, fontSize: fs, color: T.text }}>{s.signalId}</div>
                <div style={{ color: s.state === "GREEN" ? T.green : T.red, fontWeight: 700, fontSize: fs - 1, marginTop: 4 }}>{s.state}</div>
                <div style={{ color: T.textMuted, fontSize: fs - 3, marginTop: 4 }}>
                  {s.location?.lat?.toFixed(3)}, {s.location?.lng?.toFixed(3)}
                </div>
                {s.state === "GREEN" && (
                  <div style={{ background: T.greenGlow, color: T.green, fontSize: fs - 3, marginTop: 6, borderRadius: 8, padding: "2px 6px", fontWeight: 700 }}>
                    🚑 CORRIDOR CLEAR
                  </div>
                )}
              </div>
            ))}
            {signals.length === 0 && <div style={{ color: T.textSub, padding: 20 }}>No signal data</div>}
          </div>
        </div>
      )}
    </div>
  );
}
