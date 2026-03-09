import { useState } from "react";

const WX_ICON = (cond) => {
  if(!cond) return "🌤";
  const c = cond.toLowerCase();
  if(c.includes("thunder")) return "⛈";
  if(c.includes("rain")||c.includes("drizzle")) return "🌧";
  if(c.includes("snow")) return "❄️";
  if(c.includes("fog")) return "🌫";
  if(c.includes("cloud")||c.includes("overcast")) return "☁️";
  if(c.includes("clear")||c.includes("sunny")||c.includes("mainly")) return "☀️";
  return "🌤";
};

const RISK_MAP = {
  Thunderstorm:{ level:"CRITICAL", color:"var(--red)", msg:"Do not dispatch unless life-critical. Lightning + flood risk." },
  "Thunderstorm+Hail":{ level:"CRITICAL", color:"var(--red)", msg:"Extreme hazard. Hail damage possible on vehicles." },
  Fog:{ level:"HIGH", color:"var(--orange)", msg:"Reduce vehicle speed. Visibility severely impaired." },
  "Icy Fog":{ level:"HIGH", color:"var(--orange)", msg:"Road ice risk. EV performance may be reduced." },
  "Heavy Rain":{ level:"HIGH", color:"var(--orange)", msg:"Flood risk active. Avoid low-lying roads." },
  "Violent Rain":{ level:"CRITICAL", color:"var(--red)", msg:"Severe flood risk. All non-critical dispatches delayed." },
  Snow:{ level:"HIGH", color:"var(--orange)", msg:"Road traction affected. Prefer 4WD vehicles." },
  "Heavy Snow":{ level:"CRITICAL", color:"var(--red)", msg:"Routes may be blocked. Check road status before dispatch." },
  Rain:{ level:"MEDIUM", color:"var(--yellow)", msg:"Wet roads. Allow extra response time." },
  "Light Rain":{ level:"LOW", color:"var(--accent)", msg:"Minor impact. Normal operations." },
};

const HOUR_LABELS = Array.from({length:24},(_,i)=>`${i}:00`);

export default function WeatherPanel({ weather, onReload, loading }) {
  const [unit, setUnit] = useState("C");

  const toF = (c) => Math.round(c * 9/5 + 32);
  const temp = (c) => c === null || c === undefined ? "—" : unit === "C" ? `${c}°C` : `${toF(c)}°F`;

  if(loading) return (
    <div style={{padding:60,textAlign:"center",color:"var(--text-muted)"}}>
      <div style={{fontSize:40,marginBottom:12}}>🌤</div>
      <div>Loading live weather data…</div>
      <div style={{fontSize:12,marginTop:6}}>Fetching from Open-Meteo</div>
    </div>
  );

  if(!weather) return (
    <div style={{padding:60,textAlign:"center",color:"var(--text-muted)"}}>
      <div style={{fontSize:40,marginBottom:12}}>☁️</div>
      <div style={{marginBottom:16}}>Weather data not available</div>
      <button className="btn btn-primary" onClick={onReload}>Reload Weather</button>
    </div>
  );

  const { current, forecast } = weather;
  const risk = RISK_MAP[current?.condition];

  return (
    <div className="animate-in">
      <div className="flex-between mb-20 flex-wrap gap-12">
        <h2 style={{fontFamily:"var(--font-display)",letterSpacing:"1px"}}>🌤 Weather Centre <span style={{fontSize:13,color:"var(--text-muted)",fontWeight:400,letterSpacing:0}}>— Open-Meteo Live Feed</span></h2>
        <div className="flex gap-8">
          <div style={{display:"flex",background:"var(--bg-elevated)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)",overflow:"hidden"}}>
            {["C","F"].map(u=>(
              <button key={u} onClick={()=>setUnit(u)} style={{padding:"6px 16px",background:unit===u?"var(--accent-dim)":"transparent",border:"none",color:unit===u?"var(--accent)":"var(--text-muted)",cursor:"pointer",fontFamily:"var(--font-display)",fontWeight:700,fontSize:13}}>°{u}</button>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onReload}>↺ Refresh</button>
        </div>
      </div>

      {/* Risk alert */}
      {risk && (
        <div className="card mb-20" style={{background:`color-mix(in srgb,${risk.color} 10%,var(--bg-card))`,borderColor:risk.color,borderWidth:2}}>
          <div className="flex gap-12" style={{alignItems:"center"}}>
            <span style={{fontSize:28}}>⚠️</span>
            <div>
              <div style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:16,color:risk.color}}>WEATHER RISK: {risk.level}</div>
              <div style={{fontSize:13,color:"var(--text-secondary)",marginTop:4}}>{risk.msg}</div>
            </div>
            <span className={`badge ${risk.level==="CRITICAL"?"badge-red":risk.level==="HIGH"?"badge-orange":"badge-yellow"}`} style={{marginLeft:"auto"}}>{risk.level}</span>
          </div>
        </div>
      )}

      {/* Current conditions hero */}
      {current && (
        <div className="card mb-20" style={{background:"linear-gradient(135deg,var(--bg-elevated),var(--bg-card))"}}>
          <div style={{display:"flex",alignItems:"center",gap:24,flexWrap:"wrap"}}>
            <div style={{textAlign:"center",minWidth:100}}>
              <div style={{fontSize:64}}>{WX_ICON(current.condition)}</div>
              <div style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:14,color:"var(--text-secondary)",marginTop:4}}>{current.condition}</div>
            </div>
            <div style={{flex:1}}>
              <div style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:56,color:"var(--accent)",lineHeight:1}}>{temp(current.temperature)}</div>
              <div style={{fontSize:13,color:"var(--text-muted)",marginTop:8}}>Live conditions · Updated {new Date().toLocaleTimeString()}</div>
            </div>
            <div className="grid-2 gap-12" style={{minWidth:240}}>
              {[
                {icon:"💧",label:"Humidity",val:`${current.humidity}%`},
                {icon:"💨",label:"Wind",val:`${current.windSpeed} km/h`},
                {icon:"👁",label:"Visibility",val:current.visibility!=null?`${current.visibility} km`:"—"},
                {icon:"🌡",label:"Feels Like",val:temp(current.temperature)},
              ].map(m=>(
                <div key={m.label} style={{background:"var(--bg-primary)",borderRadius:"var(--radius-md)",padding:"10px 14px",border:"1px solid var(--border)"}}>
                  <div style={{fontSize:20,marginBottom:4}}>{m.icon}</div>
                  <div style={{fontSize:11,color:"var(--text-muted)",fontFamily:"var(--font-display)",fontWeight:600,letterSpacing:"0.5px"}}>{m.label}</div>
                  <div style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:18,color:"var(--text-primary)"}}>{m.val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Emergency response impact */}
      <div className="card mb-20">
        <div className="chart-title mb-16">🚑 Emergency Response Impact Assessment</div>
        <div className="grid-3 gap-12">
          {[
            {
              label:"Road Conditions",
              val: current?.weatherCode>=61&&current?.weatherCode<=82?"Wet/Hazardous": current?.weatherCode>=71&&current?.weatherCode<=77?"Icy":"Clear",
              color:current?.weatherCode>=61?"var(--orange)":"var(--green)",
              icon: current?.weatherCode>=61?"⚠️":"✅"
            },
            {
              label:"Avg Response Impact",
              val:current?.isHazardous?"+30-60% delay":"+0% (nominal)",
              color:current?.isHazardous?"var(--orange)":"var(--green)",
              icon:current?.isHazardous?"⏱":"✅"
            },
            {
              label:"Recommended Action",
              val:current?.isHazardous?"Increase standby units":"Normal operations",
              color:current?.isHazardous?"var(--yellow)":"var(--green)",
              icon:current?.isHazardous?"🔔":"✅"
            }
          ].map(m=>(
            <div key={m.label} style={{background:"var(--bg-elevated)",borderRadius:"var(--radius-md)",padding:"14px 16px",border:"1px solid var(--border)"}}>
              <div style={{fontSize:20,marginBottom:6}}>{m.icon}</div>
              <div style={{fontSize:11,color:"var(--text-muted)",fontFamily:"var(--font-display)",fontWeight:600,letterSpacing:"0.5px",marginBottom:4}}>{m.label}</div>
              <div style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:14,color:m.color}}>{m.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Hourly forecast */}
      {forecast?.length>0 && (
        <div className="card">
          <div className="chart-title mb-16">📅 12-Hour Forecast</div>
          <div style={{overflowX:"auto"}}>
            <div style={{display:"flex",gap:10,minWidth:"max-content",paddingBottom:8}}>
              {forecast.map((f,i)=>{
                const isNow = i===0;
                return (
                  <div key={i} style={{background:isNow?"var(--accent-dim)":"var(--bg-elevated)",border:`1px solid ${isNow?"var(--accent)":"var(--border)"}`,borderRadius:"var(--radius-md)",padding:"14px 16px",textAlign:"center",minWidth:90,transition:"var(--transition)"}}>
                    <div style={{fontFamily:"var(--font-mono)",fontSize:12,color:isNow?"var(--accent)":"var(--text-muted)",fontWeight:isNow?700:400,marginBottom:6}}>{isNow?"NOW":`${f.hour}:00`}</div>
                    <div style={{fontSize:26,marginBottom:6}}>{WX_ICON(f.condition)}</div>
                    <div style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:18,color:"var(--text-primary)",marginBottom:4}}>{temp(f.temp)}</div>
                    <div style={{fontSize:10,color:"var(--text-muted)",lineHeight:1.3,marginBottom:4}}>{f.condition}</div>
                    <div style={{fontSize:10,color:"var(--text-dim)"}}>💨{f.windSpeed}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}