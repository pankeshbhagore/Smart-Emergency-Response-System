/**
 * CHAT PANEL v16 — Operator-Citizen live chat + AI first aid
 * Fixed: robust loading, error handling, socket reconnect
 */
import { useState, useEffect, useRef, useCallback } from "react";
import api    from "../services/api";
import socket from "../services/socket";

const FROM_COLOR = {
  Citizen:  { bg:"var(--accent-dim)",  border:"rgba(0,200,255,0.3)",  text:"var(--accent)" },
  Operator: { bg:"var(--green-dim)",   border:"rgba(0,230,118,0.3)",  text:"var(--green)"  },
  AI:       { bg:"rgba(180,100,255,0.1)",border:"rgba(180,100,255,0.3)",text:"#b464ff"     },
  System:   { bg:"var(--bg-elevated)", border:"var(--border)",        text:"var(--text-muted)" },
};

export default function ChatPanel({ emergencyId, isOperator, emergencyType }) {
  const [messages, setMessages]   = useState([]);
  const [input,    setInput]      = useState("");
  const [loading,  setLoading]    = useState(true);
  const [sending,  setSending]    = useState(false);
  const [error,    setError]      = useState(null);
  const [sessionId,setSessionId]  = useState(null);
  const endRef = useRef(null);

  const loadSession = useCallback(async () => {
    if (!emergencyId) return;
    try {
      const r = await api.get(`/chat-sessions/${emergencyId}`);
      setMessages(r.data.messages || []);
      setSessionId(r.data._id);
      setError(null);
    } catch(e) {
      setError("Could not load chat. Retrying…");
    } finally { setLoading(false); }
  }, [emergencyId]);

  useEffect(() => { loadSession(); }, [loadSession]);

  useEffect(() => {
    if (!emergencyId) return;
    socket.emit("join-emergency", emergencyId);

    const onMsg = d => {
      if (d.emergencyId?.toString() === emergencyId?.toString()) {
        setMessages(p => {
          // Avoid duplicates
          if (d.message?._id && p.find(m=>m._id===d.message._id)) return p;
          return [...p, d.message];
        });
      }
    };
    socket.on("chatMessage", onMsg);
    return () => {
      socket.off("chatMessage", onMsg);
      socket.emit("leave-emergency", emergencyId);
    };
  }, [emergencyId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput(""); setSending(true);
    try {
      await api.post(`/chat-sessions/${emergencyId}/message`, { text });
    } catch(e) {
      setError("Failed to send message");
    } finally { setSending(false); }
  };

  const sendFirstAid = async () => {
    if (sending) return;
    setSending(true);
    try {
      await api.post(`/chat-sessions/${emergencyId}/firstaid`, { emergencyType: emergencyType||"Medical" });
    } catch(e) { setError("Failed to send first aid guide"); }
    finally { setSending(false); }
  };

  if (!emergencyId) return (
    <div style={{ padding:20, textAlign:"center", color:"var(--text-muted)", fontSize:13 }}>
      No active emergency — chat unavailable
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", height:380 }}>
      {/* Messages area */}
      <div style={{ flex:1, overflowY:"auto", padding:"12px 16px", display:"flex", flexDirection:"column", gap:8 }}>
        {loading && (
          <div style={{ textAlign:"center", color:"var(--text-muted)", padding:20 }}>
            ⏳ Loading chat…
          </div>
        )}
        {error && (
          <div style={{ padding:"8px 12px", background:"var(--red-dim)", border:"1px solid var(--red)",
            borderRadius:8, fontSize:12, color:"var(--red)" }}>
            ⚠️ {error}
            <button className="btn btn-ghost btn-sm" style={{ marginLeft:8 }} onClick={loadSession}>Retry</button>
          </div>
        )}
        {messages.map((m,i) => {
          const style = FROM_COLOR[m.from] || FROM_COLOR.System;
          const isRight = m.from === (isOperator?"Operator":"Citizen");
          return (
            <div key={m._id||i} style={{ display:"flex", justifyContent:isRight?"flex-end":"flex-start" }}>
              <div style={{
                maxWidth:"82%", padding:"8px 12px",
                background:style.bg, border:`1px solid ${style.border}`,
                borderRadius:isRight?"14px 14px 4px 14px":"4px 14px 14px 14px",
                fontSize:13, lineHeight:1.6,
              }}>
                {!isRight && (
                  <div style={{ fontSize:10, fontWeight:700, color:style.text, marginBottom:3 }}>
                    {m.from==="AI"?"🤖 AI Assistant":m.from==="System"?"⚙️ System":m.from}
                  </div>
                )}
                <div style={{ whiteSpace:"pre-wrap", color:"var(--text-primary)" }}>{m.text}</div>
                <div style={{ fontSize:10, color:"var(--text-dim)", marginTop:3, textAlign:"right" }}>
                  {m.at ? new Date(m.at).toLocaleTimeString() : ""}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef}/>
      </div>

      {/* Input area */}
      <div style={{ borderTop:"1px solid var(--border)", padding:"8px 12px" }}>
        {isOperator && (
          <div style={{ marginBottom:6 }}>
            <button className="btn btn-ghost btn-sm" onClick={sendFirstAid} disabled={sending}
              style={{ fontSize:11 }}>
              🩺 Send First Aid Guide
            </button>
          </div>
        )}
        <div style={{ display:"flex", gap:8 }}>
          <input
            value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); sendMessage(); }}}
            placeholder={isOperator?"Reply to citizen…":"Ask for help or first aid guidance…"}
            className="form-input" style={{ flex:1, fontSize:13 }}/>
          <button className="btn btn-primary" onClick={sendMessage} disabled={sending||!input.trim()}>
            {sending?"⏳":"Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
