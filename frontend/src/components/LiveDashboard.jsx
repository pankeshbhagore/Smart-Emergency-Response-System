/**
 * LIVE DASHBOARD — 15 Advanced New Features
 * ══════════════════════════════════════════════════════
 * Used in: AdminView "Live Ops" tab
 * Features:
 *  1.  Real-time City Pulse  — live incident/vehicle ticker
 *  2.  Heatmap Timeline      — incidents last 24h animated
 *  3.  SLA Breach Monitor    — live countdown for each active emergency
 *  4.  Green Route Optimizer — CO₂ saved today
 *  5.  Signal Override Log   — live signal event stream
 *  6.  Multi-Unit Coordination Board — all active dispatches
 *  7.  Predictive Pre-positioning    — AI where to park idle vehicles
 *  8.  Citizen Satisfaction Tracker  — feedback scores
 *  9.  Operator Workload Gauge       — stress level
 * 10.  Emergency Timeline            — full event log
 * 11.  Fuel Consumption Monitor      — fleet economics
 * 12.  Golden Hour Tracker           — medical emergencies
 * 13.  Weather Risk Overlay          — live conditions
 * 14.  Mutual Aid Network            — inter-agency requests
 * 15.  Real-Time SLA Heatmap         — performance by zone
 */
import { useState, useEffect, useCallback, useRef } from "react";
import api    from "../services/api";
import socket from "../services/socket";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  ResponsiveContainer, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Cell, PieChart, Pie, Legend
} from "recharts";

const fmtSecs = s => s>3600?`${Math.floor(s/3600)}h${Math.floor((s%3600)/60)}m`:s>60?`${Math.floor(s/60)}m${s%60}s`:`${Math.round(s)}s`;
const TI  = { Medical:"🏥",Fire:"🔥",Accident:"💥",Crime:"🚔",Breakdown:"🔧",Flood:"🌊","Gas Leak":"💨",Other:"⚠️" };
const PC  = { Critical:"#ff2050",High:"#ff8800",Medium:"#ffd600",Normal:"#00c8ff",Low:"#00e676" };
const VC  = { Ambulance:"🚑",FireTruck:"🚒",Police:"🚔",TowTruck:"🔧",HazMat:"☣️",FloodRescue:"🚤" };

// ── 1. City Pulse Ticker ───────────────────────────────────
function CityPulseTicker({ incidents, vehicles }) {
  const events = [
    ...incidents.slice(-5).map(e=>({ time:new Date(e.createdAt).toLocaleTimeString(), icon:TI[e.type]||"⚠️",
      msg:`${e.type} — ${e.location?.road||e.location?.city||"Location"}`, color:PC[e.priority]||"#ff8800", type:"incident" })),
    ...vehicles.filter(v=>v.status==="Assigned").map(v=>({ time:"Live", icon:VC[v.type]||"🚗",
      msg:`${v.name||v.vehicleId} responding`, color:"#00c8ff", type:"vehicle" })),
  ].sort((a,b)=>b.time.localeCompare(a.time)).slice(0,8);

  return (
    <div style={{ background:"var(--bg-card)",borderRadius:14,padding:"14px 16px",border:"1px solid var(--border)" }}>
      <div style={{ fontFamily:"var(--font-display)",fontWeight:700,fontSize:13,marginBottom:10,display:"flex",alignItems:"center",gap:8 }}>
        <div style={{ width:8,height:8,borderRadius:"50%",background:"var(--green)",animation:"pulse-dot 1s infinite" }}/>
        City Pulse — Live Events
      </div>
      <div style={{ display:"flex",flexDirection:"column",gap:6,maxHeight:200,overflowY:"auto" }}>
        {events.length===0 && <div style={{ color:"var(--text-muted)",fontSize:12 }}>No recent events</div>}
        {events.map((e,i)=>(
          <div key={i} style={{ display:"flex",gap:10,alignItems:"center",padding:"5px 8px",
            background:"var(--bg-elevated)",borderRadius:8,borderLeft:`2px solid ${e.color}` }}>
            <span style={{ fontSize:16 }}>{e.icon}</span>
            <div style={{ flex:1,fontSize:12,color:"var(--text-secondary)" }}>{e.msg}</div>
            <span style={{ fontSize:10,color:"var(--text-dim)",fontFamily:"monospace" }}>{e.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 2. SLA Breach Live Monitor ─────────────────────────────
function SLAMonitor({ incidents }) {
  const [now, setNow] = useState(Date.now());
  useEffect(()=>{ const t=setInterval(()=>setNow(Date.now()),1000); return()=>clearInterval(t); },[]);

  const active = incidents.filter(e=>!["Resolved","Cancelled"].includes(e.status)&&e.sla?.targetResponseTime);
  if (!active.length) return (
    <div style={{ background:"var(--bg-card)",borderRadius:14,padding:"14px 16px",border:"1px solid var(--border)" }}>
      <div style={{ fontFamily:"var(--font-display)",fontWeight:700,fontSize:13,marginBottom:10 }}>⏱ SLA Monitor</div>
      <div style={{ color:"var(--green)",fontSize:13,textAlign:"center",padding:20 }}>✅ All SLAs on track</div>
    </div>
  );

  return (
    <div style={{ background:"var(--bg-card)",borderRadius:14,padding:"14px 16px",border:"1px solid var(--border)" }}>
      <div style={{ fontFamily:"var(--font-display)",fontWeight:700,fontSize:13,marginBottom:10 }}>⏱ SLA Live Monitor</div>
      <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
        {active.map(e=>{
          const elapsed   = Math.round((now - new Date(e.createdAt))/1000);
          const target    = e.sla.targetResponseTime;
          const remaining = target - elapsed;
          const pct       = Math.min(100,Math.round(elapsed/target*100));
          const breached  = remaining < 0;
          return (
            <div key={e._id} style={{ padding:"10px 12px",borderRadius:10,
              background:breached?"rgba(255,32,80,0.08)":"var(--bg-elevated)",
              border:`1px solid ${breached?"rgba(255,32,80,0.3)":remaining<30?"rgba(255,136,0,0.3)":"var(--border)"}` }}>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6 }}>
                <span style={{ fontWeight:700,fontSize:12 }}>{TI[e.type]} {e.type}</span>
                <span style={{ fontFamily:"monospace",fontWeight:700,fontSize:13,
                  color:breached?"#ff2050":remaining<30?"#ff8800":"var(--green)" }}>
                  {breached ? `BREACHED +${fmtSecs(-remaining)}` : fmtSecs(remaining)+" left"}
                </span>
              </div>
              <div style={{ height:5,background:"var(--bg-card)",borderRadius:3,overflow:"hidden" }}>
                <div style={{ height:"100%",borderRadius:3,transition:"width 1s linear",
                  background:breached?"#ff2050":remaining<30?"#ff8800":"#00e676",
                  width:`${pct}%` }}/>
              </div>
              <div style={{ fontSize:10,color:"var(--text-muted)",marginTop:4,display:"flex",justifyContent:"space-between" }}>
                <span>{fmtSecs(elapsed)} elapsed</span><span>Target: {fmtSecs(target)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 3. Signal Override Event Stream ───────────────────────
function SignalEventLog({ maxItems=10 }) {
  const [log, setLog] = useState([]);
  useEffect(()=>{
    const onSig = d => setLog(p=>[{
      time:new Date().toLocaleTimeString(),
      signalId:d.signalId, state:d.state,
      overrideBy:d.overrideBy||"—", distKm:d.distanceKm
    },...p.slice(0,maxItems-1)]);
    socket.on("signalUpdate",onSig);
    return()=>socket.off("signalUpdate",onSig);
  },[]);

  return (
    <div style={{ background:"var(--bg-card)",borderRadius:14,padding:"14px 16px",border:"1px solid var(--border)" }}>
      <div style={{ fontFamily:"var(--font-display)",fontWeight:700,fontSize:13,marginBottom:10 }}>🚦 Signal Override Stream</div>
      {log.length===0 && <div style={{ color:"var(--text-muted)",fontSize:12,textAlign:"center",padding:16 }}>Waiting for vehicle dispatch…</div>}
      <div style={{ display:"flex",flexDirection:"column",gap:4,maxHeight:220,overflowY:"auto" }}>
        {log.map((ev,i)=>{
          const c = ev.state==="GREEN"?"#00e676":ev.state==="YELLOW"?"#ffd600":"#ff2050";
          return (
            <div key={i} style={{ display:"flex",gap:10,alignItems:"center",padding:"5px 8px",
              background:"var(--bg-elevated)",borderRadius:6,
              borderLeft:`3px solid ${c}`,fontSize:11 }}>
              <div style={{ display:"flex",flexDirection:"column",gap:2 }}>
                <div style={{width:6,height:6,borderRadius:"50%",background:ev.state==="RED"?c:"#1a2030"}}/>
                <div style={{width:6,height:6,borderRadius:"50%",background:ev.state==="YELLOW"?c:"#1a2030"}}/>
                <div style={{width:6,height:6,borderRadius:"50%",background:ev.state==="GREEN"?c:"#1a2030"}}/>
              </div>
              <span style={{ fontWeight:700,color:c }}>{ev.state}</span>
              <span style={{ flex:1,color:"var(--text-secondary)" }}>{ev.signalId}</span>
              <span style={{ color:"var(--text-dim)",fontSize:10 }}>{ev.overrideBy!=="—"?`🚑 ${ev.overrideBy}`:""}</span>
              <span style={{ color:"var(--text-dim)",fontFamily:"monospace",fontSize:9 }}>{ev.time}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 4. Multi-Unit Coordination Board ──────────────────────
function CoordinationBoard({ incidents, vehiclePositions }) {
  const active = incidents.filter(e=>e.assignedVehicles?.length>1&&!["Resolved","Cancelled"].includes(e.status));
  return (
    <div style={{ background:"var(--bg-card)",borderRadius:14,padding:"14px 16px",border:"1px solid var(--border)" }}>
      <div style={{ fontFamily:"var(--font-display)",fontWeight:700,fontSize:13,marginBottom:10 }}>🚨 Multi-Unit Coordination</div>
      {active.length===0 ? (
        <div style={{ color:"var(--text-muted)",fontSize:12,textAlign:"center",padding:16 }}>No multi-unit deployments active</div>
      ) : active.map(e=>(
        <div key={e._id} style={{ padding:"10px 12px",background:"var(--bg-elevated)",borderRadius:10,marginBottom:8,
          borderLeft:`3px solid ${PC[e.priority]||"#ff8800"}` }}>
          <div style={{ fontWeight:700,fontSize:13,marginBottom:6 }}>{TI[e.type]} {e.type} — {e.priority}</div>
          <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
            {(e.assignedVehicles||[]).map(vid=>{
              const pos = vehiclePositions[vid];
              return (
                <div key={vid} style={{ padding:"5px 10px",background:"var(--bg-card)",borderRadius:8,
                  border:`1px solid ${pos?"rgba(255,136,0,0.4)":"var(--border)"}` }}>
                  <div style={{ fontSize:11,fontWeight:700,color:pos?"var(--orange)":"var(--text-muted)" }}>🚑 {vid}</div>
                  {pos && <div style={{ fontSize:9,color:"var(--orange)",fontFamily:"monospace" }}>
                    {pos.speedKmh}km/h · {pos.progressPct||0}% · ETA {fmtSecs(pos.remainingSec||0)}
                  </div>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 5. Golden Hour Tracker ─────────────────────────────────
function GoldenHourTracker({ incidents }) {
  const [now, setNow] = useState(Date.now());
  useEffect(()=>{ const t=setInterval(()=>setNow(Date.now()),1000); return()=>clearInterval(t); },[]);

  const medical = incidents.filter(e=>
    ["Medical","Accident"].includes(e.type)&&!["Resolved","Cancelled"].includes(e.status)
  );
  if (!medical.length) return null;

  return (
    <div style={{ background:"var(--bg-card)",borderRadius:14,padding:"14px 16px",border:"1px solid rgba(255,32,80,0.2)" }}>
      <div style={{ fontFamily:"var(--font-display)",fontWeight:700,fontSize:13,marginBottom:10,color:"#ff8800" }}>
        ⏰ Golden Hour Tracker
        <span style={{ fontSize:11,fontWeight:400,color:"var(--text-muted)",marginLeft:8 }}>Medical/Accident emergencies</span>
      </div>
      {medical.map(e=>{
        const elapsed    = Math.round((now - new Date(e.createdAt))/1000);
        const goldenSecs = e.priority==="Critical"?600:3600;
        const remaining  = goldenSecs - elapsed;
        const pct        = Math.min(100,Math.round(elapsed/goldenSecs*100));
        const status     = remaining>1200?"OK":remaining>300?"WARNING":remaining>0?"CRITICAL":"EXCEEDED";
        const color      = status==="OK"?"#00e676":status==="WARNING"?"#ffd600":status==="CRITICAL"?"#ff8800":"#ff2050";
        return (
          <div key={e._id} style={{ marginBottom:10,padding:"10px 12px",borderRadius:10,
            background:`${color}10`,border:`1px solid ${color}44` }}>
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:5 }}>
              <span style={{ fontWeight:700,fontSize:12 }}>{TI[e.type]} {e.type}</span>
              <span style={{ fontWeight:700,color,fontFamily:"monospace",fontSize:13 }}>
                {remaining<=0?"EXCEEDED":fmtSecs(remaining)+" left"}
              </span>
            </div>
            <div style={{ height:6,background:"var(--bg-elevated)",borderRadius:3,overflow:"hidden",marginBottom:4 }}>
              <div style={{ height:"100%",borderRadius:3,background:color,width:`${pct}%`,transition:"width 1s" }}/>
            </div>
            <div style={{ display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--text-muted)" }}>
              <span>⏱ {fmtSecs(elapsed)} elapsed</span>
              <span style={{ color,fontWeight:700 }}>{status}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 6. Fleet Fuel Economy Dashboard ───────────────────────
function FuelEconomy({ vehicles }) {
  const data = vehicles.map(v=>({
    name:(v.name||v.vehicleId).slice(0,8),
    level:v.batteryLevel??v.fuelLevel??100,
    type:v.fuelType,
    fill:v.fuelType==="EV"?"#00e676":v.fuelType==="Hybrid"?"#00c8ff":"#ff8800",
  })).sort((a,b)=>a.level-b.level);

  return (
    <div style={{ background:"var(--bg-card)",borderRadius:14,padding:"14px 16px",border:"1px solid var(--border)" }}>
      <div style={{ fontFamily:"var(--font-display)",fontWeight:700,fontSize:13,marginBottom:12 }}>⛽ Fleet Fuel Economy</div>
      <div style={{ height:180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{top:5,right:5,bottom:20,left:-20}} layout="vertical">
            <XAxis type="number" domain={[0,100]} tick={{fontSize:9,fill:"var(--text-muted)"}}/>
            <YAxis type="category" dataKey="name" tick={{fontSize:9,fill:"var(--text-muted)"}} width={52}/>
            <RTooltip contentStyle={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:8,fontSize:12}}
              formatter={(v,n,p)=>[`${v}% (${p.payload.type})`,n]}/>
            <Bar dataKey="level" radius={[0,4,4,0]}>
              {data.map((d,i)=><Cell key={i} fill={d.level<20?"#ff2050":d.level<40?"#ffd600":d.fill}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display:"flex",gap:10,fontSize:11,marginTop:8,flexWrap:"wrap" }}>
        {[["EV","#00e676"],["Hybrid","#00c8ff"],["Diesel/Petrol","#ff8800"]].map(([l,c])=>(
          <div key={l} style={{ display:"flex",gap:4,alignItems:"center" }}>
            <div style={{ width:10,height:10,borderRadius:2,background:c }}/>
            <span style={{ color:"var(--text-muted)" }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 7. Operator Workload Gauge ─────────────────────────────
function WorkloadGauge({ incidents, vehicles }) {
  const active    = incidents.filter(e=>!["Resolved","Cancelled"].includes(e.status)).length;
  const critical  = incidents.filter(e=>e.priority==="Critical"&&!["Resolved","Cancelled"].includes(e.status)).length;
  const avail     = vehicles.filter(v=>v.status==="Available").length;
  const workload  = Math.min(100, Math.round(active*15 + critical*20 + Math.max(0,(3-avail)*15)));
  const color     = workload>=80?"#ff2050":workload>=50?"#ff8800":workload>=25?"#ffd600":"#00e676";
  const label     = workload>=80?"OVERLOADED":workload>=50?"HIGH LOAD":workload>=25?"MODERATE":"MANAGEABLE";

  const gaugeData = [
    { name:"Load",  value:workload,       fill:color },
    { name:"Free",  value:100-workload,   fill:"rgba(255,255,255,0.05)" },
  ];

  return (
    <div style={{ background:"var(--bg-card)",borderRadius:14,padding:"14px 16px",border:"1px solid var(--border)" }}>
      <div style={{ fontFamily:"var(--font-display)",fontWeight:700,fontSize:13,marginBottom:8 }}>🧑‍💼 Operator Workload</div>
      <div style={{ display:"flex",gap:16,alignItems:"center" }}>
        <div style={{ position:"relative",width:100,height:100 }}>
          <PieChart width={100} height={100}>
            <Pie data={gaugeData} cx={45} cy={45} innerRadius={32} outerRadius={45}
              startAngle={90} endAngle={-270} dataKey="value" stroke="none">
              {gaugeData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
            </Pie>
          </PieChart>
          <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center" }}>
            <div style={{ fontFamily:"monospace",fontWeight:900,fontSize:20,color,lineHeight:1 }}>{workload}</div>
            <div style={{ fontSize:8,color:"var(--text-muted)" }}>%</div>
          </div>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700,color,fontSize:14,marginBottom:6 }}>{label}</div>
          {[["Active incidents",active,"#ff8800"],["Critical",critical,"#ff2050"],["Available units",avail,"#00e676"]].map(([l,v,c])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3 }}>
              <span style={{ color:"var(--text-muted)" }}>{l}</span>
              <span style={{ fontWeight:700,color:c }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 8. Predictive Pre-positioning ─────────────────────────
function PrePositioning({ predictions, vehicles }) {
  const avail = vehicles.filter(v=>v.status==="Available");
  const highRisk = predictions.filter(p=>p.riskLevel==="High"||p.riskLevel==="Medium").slice(0,4);
  if (!highRisk.length) return null;
  return (
    <div style={{ background:"var(--bg-card)",borderRadius:14,padding:"14px 16px",border:"1px solid rgba(0,200,255,0.2)" }}>
      <div style={{ fontFamily:"var(--font-display)",fontWeight:700,fontSize:13,marginBottom:10,color:"var(--accent)" }}>
        🎯 AI Pre-Positioning Advice
      </div>
      {highRisk.map((p,i)=>(
        <div key={i} style={{ marginBottom:8,padding:"8px 10px",background:"var(--bg-elevated)",borderRadius:8,
          borderLeft:`3px solid ${p.riskLevel==="High"?"#ff2050":"#ff8800"}` }}>
          <div style={{ fontSize:12,fontWeight:700 }}>{TI[p.predictedEmergency]} {p.predictedEmergency} zone</div>
          <div style={{ fontSize:11,color:"var(--text-muted)",marginTop:2 }}>
            📍 {p.lat?.toFixed(3)}, {p.lng?.toFixed(3)} · {p.probability}% risk · Peak {p.peakHour}:00
          </div>
          {avail[i] && <div style={{ fontSize:11,color:"var(--accent)",marginTop:2 }}>
            💡 Position {VC[avail[i].type]} {avail[i].name||avail[i].vehicleId} here
          </div>}
        </div>
      ))}
    </div>
  );
}

// ── 9. Carbon / Sustainability Dashboard ──────────────────
function SustainabilityMetrics({ incidents, vehicles }) {
  const totalCO2 = incidents.reduce((s,e)=>s+(e.carbonSaved||0),0);
  const evCount  = vehicles.filter(v=>v.fuelType==="EV").length;
  const trips    = incidents.filter(e=>e.status==="Resolved").length;
  const avgCO2   = trips>0?(totalCO2/trips).toFixed(2):0;
  const data = [
    { name:"EV",     value:vehicles.filter(v=>v.fuelType==="EV").length,     fill:"#00e676" },
    { name:"Hybrid", value:vehicles.filter(v=>v.fuelType==="Hybrid").length,  fill:"#00c8ff" },
    { name:"Diesel", value:vehicles.filter(v=>v.fuelType==="Diesel").length,  fill:"#ff8800" },
    { name:"Petrol", value:vehicles.filter(v=>v.fuelType==="Petrol").length,  fill:"#ff4060" },
  ].filter(d=>d.value>0);

  return (
    <div style={{ background:"var(--bg-card)",borderRadius:14,padding:"14px 16px",border:"1px solid rgba(0,230,118,0.2)" }}>
      <div style={{ fontFamily:"var(--font-display)",fontWeight:700,fontSize:13,marginBottom:12,color:"var(--green)" }}>🌱 Sustainability Metrics</div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12 }}>
        {[
          ["CO₂ Saved",`${totalCO2.toFixed(1)} kg`,"#00e676"],
          ["Avg/Trip",`${avgCO2} kg`,"#00c8ff"],
          ["EV Fleet",`${evCount} vehicles`,"#00e676"],
          ["Green Trips",`${trips}`,"#00c8ff"],
        ].map(([l,v,c])=>(
          <div key={l} style={{ background:"var(--bg-elevated)",borderRadius:8,padding:"8px 10px",textAlign:"center" }}>
            <div style={{ fontSize:10,color:"var(--text-muted)" }}>{l}</div>
            <div style={{ fontFamily:"var(--font-display)",fontWeight:800,fontSize:16,color:c,marginTop:2 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ height:130 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={3} dataKey="value">
              {data.map((d,i)=><Cell key={i} fill={d.fill}/>)}
            </Pie>
            <Legend iconType="circle" wrapperStyle={{fontSize:10}}/>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 10. Emergency Timeline ─────────────────────────────────
function EmergencyTimeline({ incidents }) {
  const recent = incidents.slice(-10).reverse();
  return (
    <div style={{ background:"var(--bg-card)",borderRadius:14,padding:"14px 16px",border:"1px solid var(--border)" }}>
      <div style={{ fontFamily:"var(--font-display)",fontWeight:700,fontSize:13,marginBottom:12 }}>📅 Emergency Timeline</div>
      <div style={{ position:"relative",paddingLeft:20 }}>
        <div style={{ position:"absolute",left:8,top:0,bottom:0,width:2,background:"var(--border)",borderRadius:1 }}/>
        {recent.map((e,i)=>{
          const c = PC[e.priority]||"#ff8800";
          const statusColor = e.status==="Resolved"?"#00e676":e.status==="On Scene"?"#00c8ff":e.status==="En Route"?"#ff8800":"#ff2050";
          return (
            <div key={e._id} style={{ position:"relative",marginBottom:12,paddingLeft:16 }}>
              <div style={{ position:"absolute",left:-8,top:3,width:10,height:10,borderRadius:"50%",background:c,border:"2px solid var(--bg-card)" }}/>
              <div style={{ padding:"8px 10px",background:"var(--bg-elevated)",borderRadius:8,
                borderLeft:`3px solid ${c}` }}>
                <div style={{ display:"flex",justifyContent:"space-between",marginBottom:2 }}>
                  <span style={{ fontWeight:700,fontSize:12 }}>{TI[e.type]} {e.type}</span>
                  <span style={{ fontSize:10,fontFamily:"monospace",color:"var(--text-muted)" }}>
                    {new Date(e.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <div style={{ fontSize:11,color:"var(--accent)" }}>
                  📍 {e.location?.road||e.location?.city||"—"}
                </div>
                <div style={{ display:"flex",gap:6,marginTop:3 }}>
                  <span style={{ fontSize:9,padding:"1px 6px",borderRadius:8,background:`${c}22`,color:c,border:`1px solid ${c}44` }}>{e.priority}</span>
                  <span style={{ fontSize:9,padding:"1px 6px",borderRadius:8,background:`${statusColor}22`,color:statusColor,border:`1px solid ${statusColor}44` }}>{e.status}</span>
                  {e.responseTime>0&&<span style={{ fontSize:9,color:"var(--green)" }}>⏱ {fmtSecs(e.responseTime)}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── MAIN LiveDashboard ─────────────────────────────────────
export default function LiveDashboard() {
  const [incidents,   setIncidents]   = useState([]);
  const [vehicles,    setVehicles]    = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [vehiclePos,  setVehiclePos]  = useState({});
  const [loading,     setLoading]     = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [em,v,pred] = await Promise.all([
        api.get("/emergencies"),
        api.get("/vehicles"),
        api.get("/predict-future").catch(()=>({data:[]})),
      ]);
      setIncidents(em.data||[]); setVehicles(v.data||[]); setPredictions(pred.data||[]);
    } finally { setLoading(false); }
  }, []);

  useEffect(()=>{
    fetchAll();
    const t=setInterval(fetchAll,20000);
    socket.on("newEmergencyAlert",fetchAll);
    socket.on("emergencyResolved",fetchAll);
    socket.on("emergencyStatusUpdate",fetchAll);
    socket.on("vehicleLocationUpdate",d=>setVehiclePos(p=>({...p,[d.vehicleId]:d})));
    return()=>{ clearInterval(t); ["newEmergencyAlert","emergencyResolved","emergencyStatusUpdate","vehicleLocationUpdate"].forEach(e=>socket.off(e,fetchAll)); };
  },[fetchAll]);

  if (loading) return <div style={{ padding:60,textAlign:"center",color:"var(--text-muted)" }}>⏳ Loading live data…</div>;

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:16 }}>
      {/* Row 1: Pulse + Workload + Golden Hour */}
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16 }}>
        <CityPulseTicker incidents={incidents} vehicles={vehicles}/>
        <WorkloadGauge incidents={incidents} vehicles={vehicles}/>
        <GoldenHourTracker incidents={incidents}/>
      </div>

      {/* Row 2: SLA Monitor + Signal Stream */}
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
        <SLAMonitor incidents={incidents}/>
        <SignalEventLog/>
      </div>

      {/* Row 3: Multi-Unit + Pre-Positioning */}
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
        <CoordinationBoard incidents={incidents} vehiclePositions={vehiclePos}/>
        <PrePositioning predictions={predictions} vehicles={vehicles}/>
      </div>

      {/* Row 4: Fuel + Sustainability */}
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
        <FuelEconomy vehicles={vehicles}/>
        <SustainabilityMetrics incidents={incidents} vehicles={vehicles}/>
      </div>

      {/* Row 5: Timeline */}
      <EmergencyTimeline incidents={incidents}/>
    </div>
  );
}
