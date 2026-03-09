import { useState, useRef, useEffect } from "react";
import api from "../services/api";

const LOCAL_DETECT = (text) => {
  const msg = text.toLowerCase();
  if(msg.includes("fire")||msg.includes("burn")||msg.includes("smoke")||msg.includes("flame")) return "Fire";
  if(msg.includes("gas")||msg.includes("leak")||msg.includes("fumes")||msg.includes("smell")) return "Gas Leak";
  if(msg.includes("flood")||msg.includes("water")||msg.includes("drowning")||msg.includes("submerge")) return "Flood";
  if(msg.includes("accident")||msg.includes("crash")||msg.includes("collision")||msg.includes("hit")) return "Accident";
  if(msg.includes("heart")||msg.includes("medical")||msg.includes("unconscious")||msg.includes("injured")||msg.includes("bleeding")||msg.includes("pain")||msg.includes("faint")) return "Medical";
  if(msg.includes("crime")||msg.includes("robbery")||msg.includes("attack")||msg.includes("theft")||msg.includes("assault")||msg.includes("shooting")) return "Crime";
  if(msg.includes("breakdown")||msg.includes("car broke")||msg.includes("engine")||msg.includes("stuck")||msg.includes("tyre")) return "Breakdown";
  return null;
};

const QUICK_PHRASES = ["There's a fire nearby", "I need medical help", "Witnessed an accident", "My car broke down", "Flooding in the area", "I see suspicious activity"];

export default function EmergencyChatbot({ onEmergencyDetected }) {
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([{
    bot: "Hello! I'm your AI Emergency Assistant.\n\nDescribe your emergency in plain language — I'll detect the type and dispatch help immediately.\n\nYou can also tap a quick phrase below."
  }]);
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat]);

  const send = async (msg) => {
    const userMsg = (msg || message).trim();
    if (!userMsg || loading) return;
    setMessage("");
    setChat(prev => [...prev, { user: userMsg }]);
    setLoading(true);
    try {
      const res = await api.post("/chatbot", { message: userMsg });
      const { detectedType, response } = res.data;
      setChat(prev => [...prev, { bot: response, type: detectedType }]);
      if (detectedType && onEmergencyDetected) onEmergencyDetected(detectedType);
    } catch {
      const det = LOCAL_DETECT(userMsg);
      if (!det) {
        setChat(prev => [...prev, { bot: "I couldn't identify the emergency type. Please be more specific — mention: fire, accident, medical, crime, breakdown, flood, or gas leak.\n\nOr tap the 'Report Emergency' tab to select manually.", type: null }]);
      } else {
        setChat(prev => [...prev, { bot: `🚨 ${det.toUpperCase()} EMERGENCY DETECTED\n\nDispatching the nearest ${det === "Medical" ? "ambulance" : det === "Fire" || det === "Gas Leak" ? "fire unit" : det === "Crime" ? "police" : det === "Breakdown" ? "tow truck" : "rescue unit"} to your location now.\n\nStay calm and remain at your location.`, type: det }]);
        if (onEmergencyDetected) onEmergencyDetected(det);
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)", padding: "14px 20px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22 }}>🤖</span>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, letterSpacing: "0.5px" }}>AI Emergency Assistant</div>
          <div className="live-dot" style={{ fontSize: 10 }}>ONLINE</div>
        </div>
      </div>

      {/* Chat area */}
      <div style={{ height: 320, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {chat.map((c, i) => (
          <div key={i}>
            {c.user && (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{ background: "var(--accent-dim)", border: "1px solid var(--accent)", color: "var(--text-primary)", padding: "10px 14px", borderRadius: "14px 14px 4px 14px", maxWidth: "80%", fontSize: 14, lineHeight: 1.5 }}>
                  {c.user}
                </div>
              </div>
            )}
            {c.bot && (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: c.type ? "var(--green-dim)" : "var(--accent-dim)", border: `1px solid ${c.type ? "var(--green)" : "var(--accent)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                  {c.type ? "✅" : "🤖"}
                </div>
                <div style={{ background: "var(--bg-elevated)", border: `1px solid ${c.type ? "var(--green)" : "var(--border)"}`, color: c.type ? "var(--green)" : "var(--text-primary)", padding: "10px 14px", borderRadius: "4px 14px 14px 14px", maxWidth: "85%", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: c.type ? "var(--font-mono)" : "var(--font-body)" }}>
                  {c.bot}
                </div>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "8px 14px", color: "var(--text-muted)", fontSize: 13 }}>
            <span className="spin" style={{ display: "inline-block" }}>⏳</span> Analyzing your message…
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Quick phrases */}
      <div style={{ padding: "10px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {QUICK_PHRASES.map(p => (
          <button key={p} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => send(p)}>{p}</button>
        ))}
      </div>

      {/* Input */}
      <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 10 }}>
        <input
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Describe your emergency… (Enter to send)"
          className="input"
          style={{ flex: 1, fontSize: 13 }}
        />
        <button className="btn btn-danger" onClick={() => send()} disabled={loading || !message.trim()}>Send</button>
      </div>
    </div>
  );
}
