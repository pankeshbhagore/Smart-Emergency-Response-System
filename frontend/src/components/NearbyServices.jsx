/**
 * NEARBY SERVICES v16 — Robust, fallback-aware
 * Uses Overpass API (OSM) — free, no API key
 * If API fails → shows India emergency numbers + manual search link
 */
import { useState, useEffect, useCallback } from "react";
import api from "../services/api";

const DEFAULT_CENTER = [22.7196, 75.8577]; // Indore

const ICONS = {
  hospital:"🏥", clinic:"🏥", pharmacy:"💊", police:"🚔",
  fire_station:"🚒", blood_bank:"🩸", mechanic:"🔧", fuel:"⛽", atm:"🏧"
};
const LABELS = {
  hospital:"Hospital", clinic:"Clinic", pharmacy:"Pharmacy", police:"Police",
  fire_station:"Fire Station", blood_bank:"Blood Bank", mechanic:"Auto Mechanic", fuel:"Petrol Station"
};
const EMERGENCY_NUMBERS = [
  { name:"Ambulance",       number:"108", icon:"🚑", color:"var(--red)" },
  { name:"Police",          number:"100", icon:"🚔", color:"var(--accent)" },
  { name:"Fire Brigade",    number:"101", icon:"🚒", color:"var(--orange)" },
  { name:"National Emerg.", number:"112", icon:"🆘", color:"var(--red)" },
  { name:"Women Helpline",  number:"1091",icon:"👩", color:"var(--accent)" },
  { name:"Child Helpline",  number:"1098",icon:"👶", color:"var(--yellow)" },
  { name:"Disaster Mgmt",   number:"1078",icon:"⛑",  color:"var(--orange)" },
];

export default function NearbyServices({ emergencyType, defaultLat, defaultLng }) {
  const [services,    setServices]    = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [lat,         setLat]         = useState(defaultLat || DEFAULT_CENTER[0]);
  const [lng,         setLng]         = useState(defaultLng || DEFAULT_CENTER[1]);
  const [radius,      setRadius]      = useState(3);
  const [geoStatus,   setGeoStatus]   = useState("idle"); // idle | locating | done | error
  const [selectedCat, setSelectedCat] = useState("all");

  const locate = useCallback(() => {
    setGeoStatus("locating");
    navigator.geolocation.getCurrentPosition(
      pos => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); setGeoStatus("done"); },
      ()  => { setGeoStatus("error"); },
      { enableHighAccuracy:true, timeout:8000 }
    );
  }, []);

  const search = useCallback(async (searchLat=lat, searchLng=lng) => {
    setLoading(true); setError(null);
    try {
      const r = await api.get(`/nearby?lat=${searchLat}&lng=${searchLng}&type=${emergencyType||""}&radius=${radius}`);
      setServices(r.data);
    } catch(e) {
      setError("Live search unavailable. Emergency numbers below.");
      setServices({ success:false, services:{}, emergencyNumbers:EMERGENCY_NUMBERS });
    } finally { setLoading(false); }
  }, [lat, lng, emergencyType, radius]);

  // Auto-search when lat/lng from parent
  useEffect(() => {
    if (defaultLat && defaultLng) {
      setLat(defaultLat); setLng(defaultLng);
      search(defaultLat, defaultLng);
    }
  }, [defaultLat, defaultLng]);

  const allCategories = services?.services ? Object.keys(services.services) : [];
  const displayCategories = selectedCat==="all" ? allCategories : allCategories.filter(c=>c===selectedCat);
  const totalFound = allCategories.reduce((s,c)=>s+(services?.services[c]?.length||0), 0);

  return (
    <div>
      {/* Search controls */}
      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
        <button className="btn btn-primary btn-sm" onClick={locate} disabled={geoStatus==="locating"}>
          {geoStatus==="locating"?"📡 Locating…":"📍 Use My Location"}
        </button>
        <select value={radius} onChange={e=>setRadius(+e.target.value)}
          style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)",
            borderRadius:"var(--radius-sm)", padding:"4px 10px", color:"var(--text-primary)", fontSize:12 }}>
          {[1,2,3,5,8,10].map(r=><option key={r} value={r}>{r}km radius</option>)}
        </select>
        <button className="btn btn-accent btn-sm" onClick={()=>search()} disabled={loading}>
          {loading?"⏳ Searching…":"🔍 Search"}
        </button>
        {geoStatus==="done" && <span style={{ fontSize:11, color:"var(--green)" }}>✓ GPS located</span>}
        {geoStatus==="error" && <span style={{ fontSize:11, color:"var(--orange)" }}>⚠️ GPS failed — using default</span>}
      </div>

      {/* Coordinates display */}
      <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:12, fontFamily:"var(--font-mono)" }}>
        📍 {lat.toFixed(5)}, {lng.toFixed(5)} · Radius: {radius}km
        {totalFound>0 && <span style={{ color:"var(--green)", marginLeft:8 }}>✓ {totalFound} services found</span>}
      </div>

      {/* Category filter */}
      {allCategories.length>0 && (
        <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
          <button className={`btn btn-sm ${selectedCat==="all"?"btn-primary":"btn-ghost"}`} onClick={()=>setSelectedCat("all")}>
            All ({totalFound})
          </button>
          {allCategories.map(c=>(
            <button key={c} className={`btn btn-sm ${selectedCat===c?"btn-primary":"btn-ghost"}`} onClick={()=>setSelectedCat(c)}>
              {ICONS[c]||"📍"} {LABELS[c]||c} ({services.services[c]?.length||0})
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {services?.success && displayCategories.length>0 ? (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {displayCategories.map(cat => (
            <div key={cat}>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:14, marginBottom:8,
                display:"flex", alignItems:"center", gap:8 }}>
                {ICONS[cat]||"📍"} {LABELS[cat]||cat}
                <span style={{ fontSize:11, color:"var(--text-muted)", fontWeight:400 }}>
                  {services.services[cat]?.length} nearby
                </span>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {(services.services[cat]||[]).map((s,i) => (
                  <div key={s.id||i} style={{ background:"var(--bg-elevated)", borderRadius:"var(--radius-md)",
                    padding:"12px 14px", border:"1px solid var(--border)",
                    borderLeft:`3px solid ${i===0?"var(--green)":"var(--border)"}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, fontSize:14 }}>{s.name}</div>
                        {s.address && <div style={{ fontSize:12, color:"var(--text-muted)", marginTop:2 }}>📍 {s.address}</div>}
                        <div style={{ fontSize:12, marginTop:4, display:"flex", gap:12, flexWrap:"wrap" }}>
                          <span style={{ color:"var(--green)", fontWeight:600 }}>🚗 {s.driveTime}</span>
                          <span style={{ color:"var(--text-muted)" }}>🚶 {s.walkTime}</span>
                          <span style={{ color:"var(--accent)" }}>📏 {s.distKm}km</span>
                        </div>
                        {s.phone && (
                          <a href={`tel:${s.phone}`} style={{ display:"inline-block", marginTop:6, fontSize:13,
                            color:"var(--green)", fontWeight:700, textDecoration:"none" }}>
                            📞 {s.phone}
                          </a>
                        )}
                      </div>
                      <div style={{ textAlign:"center", marginLeft:12 }}>
                        <div style={{ fontSize:26 }}>{ICONS[cat]||"📍"}</div>
                        {i===0 && <div style={{ fontSize:9, color:"var(--green)", fontWeight:700, marginTop:2 }}>NEAREST</div>}
                      </div>
                    </div>
                    {s.website && (
                      <a href={s.website} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize:11, color:"var(--accent)", marginTop:4, display:"block" }}>
                        🌐 {s.website.slice(0,40)}…
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : loading ? (
        <div style={{ textAlign:"center", padding:40 }}>
          <div style={{ fontSize:36, animation:"pulse-dot 1s infinite", marginBottom:8 }}>🔍</div>
          <div style={{ color:"var(--text-muted)" }}>Searching nearby services via OpenStreetMap…</div>
        </div>
      ) : null}

      {/* Emergency Numbers — always shown */}
      <div style={{ marginTop:20 }}>
        <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:14, marginBottom:10 }}>
          📞 Emergency Helplines (India)
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:8 }}>
          {EMERGENCY_NUMBERS.map(n => (
            <a key={n.number} href={`tel:${n.number}`}
              style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4,
                padding:"12px 8px", background:"var(--bg-elevated)",
                border:`1px solid ${n.color}22`, borderRadius:"var(--radius-md)",
                textDecoration:"none", transition:"var(--transition)", cursor:"pointer" }}
              onMouseEnter={e=>e.currentTarget.style.background="var(--bg-card)"}
              onMouseLeave={e=>e.currentTarget.style.background="var(--bg-elevated)"}>
              <div style={{ fontSize:24 }}>{n.icon}</div>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:20, color:n.color }}>{n.number}</div>
              <div style={{ fontSize:10, color:"var(--text-muted)", textAlign:"center" }}>{n.name}</div>
            </a>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ marginTop:12, padding:"10px 14px", background:"var(--orange-dim)",
          border:"1px solid var(--orange)", borderRadius:"var(--radius-md)",
          fontSize:12, color:"var(--orange)" }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
