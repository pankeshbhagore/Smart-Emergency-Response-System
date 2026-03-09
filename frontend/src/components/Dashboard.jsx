import { useEffect, useState, useCallback } from "react";
import api from "../services/api";
import socket from "../services/socket";
import {
  BarChart, Bar, AreaChart, Area, LineChart, Line,
  PieChart, Pie, Cell, ResponsiveContainer,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend
} from "recharts";

const T = { Medical:"#00aaff", Fire:"#ff4422", Accident:"#ffaa00", Crime:"#cc44ff", Breakdown:"#00cc88", Flood:"#0088ff", "Gas Leak":"#ffcc00", Other:"#668899" };
const P = { Critical:"var(--red)", High:"var(--orange)", Medium:"var(--yellow)", Normal:"var(--accent)", Low:"var(--green)" };

function KpiCard({ label, value, unit="", color, sub, trend }) {
  return (
    <div className="stat-card" style={{cursor:"default"}}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{color,fontSize:30,fontFamily:"var(--font-display)"}}>{value}<span style={{fontSize:13,color:"var(--text-muted)",marginLeft:2,fontWeight:400}}>{unit}</span></div>
      {sub&&<div className="stat-sub">{sub}</div>}
      {trend!==undefined&&(
        <div style={{marginTop:8,fontSize:11,fontWeight:600,color:trend>0?"var(--red)":trend<0?"var(--green)":"var(--text-muted)"}}>
          {trend>0?`↑ +${trend}%`:trend<0?`↓ ${trend}%`:"→ stable"} vs last week
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ defaultTab="overview" }) {
  const [data,    setData]    = useState(null);
  const [em,      setEm]      = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [tab,     setTab]     = useState(defaultTab);
  const [filter,  setFilter]  = useState("All");
  const [feed,    setFeed]    = useState([]);
  const [now,     setNow]     = useState(new Date());

  useEffect(()=>{ const t=setInterval(()=>setNow(new Date()),1000); return()=>clearInterval(t); },[]);

  const addFeed = useCallback((msg,sev="info")=>{
    setFeed(p=>[{id:Date.now(),msg,sev,ts:new Date().toLocaleTimeString()},...p.slice(0,19)]);
  },[]);

  const fetchAll = useCallback(async()=>{
    try{
      setError(null);
      const [a,e]=await Promise.all([api.get("/analytics"),api.get("/emergencies")]);
      setData(a.data); setEm(e.data);
    }catch(err){ setError("Analytics unavailable"); }
    finally{ setLoading(false); }
  },[]);

  useEffect(()=>{
    fetchAll();
    const onNew  = d=>{ fetchAll(); addFeed(`🚨 New ${d.type} · Sev.${d.severityScore??"?"}·${d.priority}`,"error"); };
    const onRes  = d=>{ fetchAll(); addFeed(`✅ Resolved in ${d.responseTime?.toFixed(0)}s`,"success"); };
    const onCity = d=>{ if(d.surge?.isSurge) addFeed(`⚡ SURGE: ${d.surge.level} (${d.surge.surgeRatio}x)`,"warning"); };
    socket.on("newEmergency",onNew); socket.on("emergencyResolved",onRes); socket.on("cityMetricsUpdate",onCity);
    return()=>{ socket.off("newEmergency",onNew); socket.off("emergencyResolved",onRes); socket.off("cityMetricsUpdate",onCity); };
  },[fetchAll,addFeed]);

  if(loading) return <div style={{padding:80,textAlign:"center",color:"var(--text-muted)"}}><div style={{fontSize:40,marginBottom:12}}>📊</div>Loading analytics…</div>;
  if(error)   return <div style={{padding:40,textAlign:"center"}}><div style={{color:"var(--red)",marginBottom:16}}>{error}</div><button className="btn btn-primary" onClick={fetchAll}>Retry</button></div>;

  const s   = data||{};

  // Chart datasets
  const typeChart={
    labels:Object.keys(s.typeBreakdown||{}),
    datasets:[{label:"Incidents",data:Object.values(s.typeBreakdown||{}),backgroundColor:Object.keys(s.typeBreakdown||{}).map(t=>T[t]+"bb"),borderColor:Object.keys(s.typeBreakdown||{}).map(t=>T[t]),borderWidth:1,borderRadius:4}]
  };
  const hourlyChart=s.hourlyTrends?{
    labels:s.hourlyTrends.map(h=>`${h.hour}:00`),
    datasets:[{label:"Incidents/hr",data:s.hourlyTrends.map(h=>h.count),borderColor:"var(--accent)",backgroundColor:"rgba(0,200,255,0.1)",fill:true,tension:0.4,pointRadius:3,pointBackgroundColor:"var(--accent)"}]
  }:null;
  const dailyChart=s.dailyTrends?{
    labels:s.dailyTrends.map(d=>d.date.split(",")[0]),
    datasets:[
      {label:"Incidents",data:s.dailyTrends.map(d=>d.count),borderColor:"var(--accent)",backgroundColor:"rgba(0,200,255,0.08)",fill:true,tension:0.3,pointRadius:3,yAxisID:"y"},
      {label:"Avg Response(s)",data:s.dailyTrends.map(d=>d.avgResponse),borderColor:"var(--orange)",backgroundColor:"transparent",tension:0.3,pointRadius:3,borderDash:[4,2],yAxisID:"y1"}
    ]
  }:null;
  const vehicleChart={
    labels:["Available","Assigned","Maintenance"],
    datasets:[{data:[s.vehicleStats?.available||0,s.vehicleStats?.assigned||0,0],backgroundColor:["rgba(0,230,118,0.8)","rgba(255,143,0,0.8)","rgba(255,214,0,0.6)"],borderColor:["var(--green)","var(--orange)","var(--yellow)"],borderWidth:2,hoverOffset:8}]
  };
  const rtChart={
    labels:Object.keys(s.responseTimeBuckets||{}),
    datasets:[{label:"Count",data:Object.values(s.responseTimeBuckets||{}),backgroundColor:["var(--green)","rgba(0,230,118,0.6)","var(--yellow)","var(--orange)","var(--red)"].map(c=>c+"cc"),borderWidth:0,borderRadius:4}]
  };
  const radarChart={
    labels:["Critical","High","Medium","Normal","Low"],
    datasets:[{label:"Priority",data:["Critical","High","Medium","Normal","Low"].map(p=>s.priorityBreakdown?.[p]||0),backgroundColor:"rgba(179,136,255,0.2)",borderColor:"var(--purple)",pointBackgroundColor:"var(--purple)",borderWidth:2}]
  };
  // Recharts-compatible data
  const vehicleData = [
    {name:"Available",  value:s.vehicleStats?.available||0, color:"var(--green)"},
    {name:"Assigned",   value:s.vehicleStats?.assigned||0,  color:"var(--orange)"},
    {name:"Maintenance",value:0,                             color:"var(--yellow)"},
  ].filter(d=>d.value>0);
  const priorityData = ["Critical","High","Medium","Normal","Low"].map(p=>({name:p,value:s.priorityBreakdown?.[p]||0}));
  const shiftChart={
    labels:["Morning (6-14)","Afternoon (14-22)","Night (22-6)"],
    datasets:[{label:"Incidents",data:[s.shiftAnalysis?.morning||0,s.shiftAnalysis?.afternoon||0,s.shiftAnalysis?.night||0],backgroundColor:["rgba(255,214,0,0.7)","rgba(255,143,0,0.7)","rgba(0,200,255,0.7)"],borderColor:["var(--yellow)","var(--orange)","var(--accent)"],borderWidth:1,borderRadius:6}]
  };
  const dowChart=s.dowBreakdown?{
    labels:s.dowBreakdown.map(d=>d.day),
    datasets:[{label:"Incidents",data:s.dowBreakdown.map(d=>d.count),backgroundColor:"rgba(0,200,255,0.4)",borderColor:"var(--accent)",borderWidth:1,borderRadius:4}]
  }:null;
  const weatherChart=s.weatherBreakdown&&Object.keys(s.weatherBreakdown).length>0?{
    labels:Object.keys(s.weatherBreakdown),
    datasets:[{label:"During Condition",data:Object.values(s.weatherBreakdown),backgroundColor:Object.keys(s.weatherBreakdown).map((_,i)=>["var(--accent)","var(--blue)","var(--purple)","var(--orange)","var(--yellow)"][i%5]+"99"),borderWidth:0,borderRadius:4}]
  }:null;

  // Convert chart.js format to recharts array
  const rechartify = (ch) => {
    if(!ch?.labels) return [];
    return ch.labels.map((l,i)=>({name:l, value:ch.datasets?.[0]?.data?.[i]||0}));
  };
  const filt = filter==="All"?em:em.filter(e=>e.status===filter);

  return (
    <div className="animate-in">
      {/* Header */}
      <div className="flex-between mb-20 flex-wrap gap-12">
        <div>
          <h2 style={{fontFamily:"var(--font-display)",letterSpacing:"1px"}}>📊 Command Centre</h2>
          <div style={{color:"var(--text-muted)",fontSize:12,marginTop:4}}>
            {now.toLocaleDateString("en",{weekday:"long",year:"numeric",month:"long",day:"numeric"})} · <span style={{color:"var(--accent)",fontFamily:"var(--font-mono)",fontWeight:700}}>{now.toLocaleTimeString()}</span>
          </div>
        </div>
        <div className="flex gap-8">
          {s.cityHealth?.alertLevel&&s.cityHealth.alertLevel!=="NORMAL"&&(
            <span className={`badge ${s.cityHealth.alertLevel==="CRITICAL"?"badge-red":s.cityHealth.alertLevel==="HIGH"?"badge-orange":"badge-yellow"}`}>{s.cityHealth.alertLevel}</span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={fetchAll}>↺ Refresh</button>
        </div>
      </div>

      {/* Surge */}
      {s.surge?.isSurge&&(
        <div style={{background:"var(--red-dim)",border:"1px solid var(--red)",borderRadius:"var(--radius-md)",padding:"12px 20px",marginBottom:20,display:"flex",gap:12,alignItems:"center"}}>
          <span style={{fontSize:20}}>⚡</span>
          <div>
            <span style={{color:"var(--red)",fontWeight:700,fontFamily:"var(--font-display)"}}>SURGE DETECTED — {s.surge.level}</span>
            <span style={{color:"var(--text-secondary)",fontSize:13,marginLeft:12}}>{s.surge.currentHourCount} this hour vs {s.surge.baseline} baseline ({s.surge.surgeRatio}×)</span>
          </div>
        </div>
      )}

      {/* Top KPI row */}
      <div className="stat-grid mb-20">
        <KpiCard label="City Safety" value={s.cityHealth?.safetyScore??0} unit="/100" color={(s.cityHealth?.safetyScore??0)>70?"var(--green)":(s.cityHealth?.safetyScore??0)>50?"var(--yellow)":"var(--red)"} sub={`Alert: ${s.cityHealth?.alertLevel??"NORMAL"}`} />
        <KpiCard label="Active Incidents" value={s.active??0} color={(s.active??0)>5?"var(--red)":(s.active??0)>2?"var(--orange)":"var(--green)"} sub={`${s.cityHealth?.criticalCount??0} critical`} trend={s.weekTrend} />
        <KpiCard label="SLA Compliance" value={s.slaCompliance??100} unit="%" color={(s.slaCompliance??100)>=90?"var(--green)":(s.slaCompliance??100)>=70?"var(--yellow)":"var(--red)"} sub={`${s.slaBreached??0} breaches`} />
        <KpiCard label="Avg Response" value={s.avgResponse??0} unit="s" color="var(--accent)" sub={`Median: ${s.medianResponse??0}s`} />
        <KpiCard label="Performance" value={s.performance??0} unit="%" color={(s.performance??0)>=80?"var(--green)":(s.performance??0)>=60?"var(--yellow)":"var(--red)"} sub="Composite index" />
        <KpiCard label="CO₂ Saved" value={s.sustainability?.totalCarbonSaved??0} unit=" kg" color="var(--green)" sub={`${s.sustainability?.evPercentage??0}% EV`} />
        <KpiCard label="This Week" value={s.thisWeek??0} unit=" incidents" color="var(--accent)" trend={s.weekTrend} sub={`Last week: ${s.lastWeek??0}`} />
        <KpiCard label="Resolution Rate" value={s.resolutionRate??0} unit="%" color={(s.resolutionRate??0)>=80?"var(--green)":"var(--orange)"} sub={`${s.completed??0} resolved`} />
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {[["overview","◈ Overview"],["trends","📈 Trends"],["breakdown","🔬 Breakdown"],["ml","🧠 AI/ML"],["log","🚨 Incident Log"],["resources","🚗 Resources"],["performance","🏆 Performance"],["location","📍 Location Intel"]].map(([id,label])=>(
          <button key={id} className={`tab-btn ${tab===id?"active":""}`} onClick={()=>setTab(id)}>{label}</button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab==="overview"&&(
        <div>
          <div className="grid-2 gap-16 mb-16">
            <div className="chart-card"><div className="chart-title" style={{color:"#00C8FF"}}>▶ INCIDENT TYPES</div><div style={{height:220}}><ResponsiveContainer width="100%" height="100%"><BarChart data={rechartify(typeChart).map(d=>({...d,fill:T[d.name]||"#667799"}))} margin={{top:5,right:5,bottom:20,left:-15}}><XAxis dataKey="name" tick={{fontSize:9,fill:"var(--text-muted)"}} angle={-25} textAnchor="end"/><YAxis tick={{fontSize:9,fill:"var(--text-muted)"}}/><RTooltip contentStyle={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:8,fontSize:12}}/><Bar dataKey="value" radius={[4,4,0,0]}>{rechartify(typeChart).map((d,i)=><Cell key={i} fill={T[d.name]||"#667799"}/>)}</Bar></BarChart></ResponsiveContainer></div></div>
            <div className="chart-card"><div className="chart-title">▶ VEHICLE STATUS</div>
<div style={{height:220}}>
<ResponsiveContainer width="100%" height="100%">
  <PieChart><Pie data={vehicleData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
    {vehicleData.map((entry,i)=><Cell key={i} fill={entry.color}/>)}
  </Pie><RTooltip formatter={(v,n)=>[v,n]}/><Legend/>
  </PieChart>
</ResponsiveContainer></div></div>
          </div>
          {/* Mini stats */}
          <div className="grid-4 gap-12 mb-16">
            {[
              {label:"Fastest Response",val:`${s.fastest??0}s`,icon:"⚡",color:"var(--green)"},
              {label:"Slowest Response",val:`${s.slowest??0}s`,icon:"🐢",color:"var(--orange)"},
              {label:"Avg Resolution",val:`${s.avgResolutionTime??0}s`,icon:"⏱",color:"var(--accent)"},
              {label:"SLA Breaches",val:s.slaBreached??0,icon:"🚨",color:"var(--red)"},
            ].map(m=>(
              <div key={m.label} className="card card-sm" style={{textAlign:"center"}}>
                <div style={{fontSize:24,marginBottom:4}}>{m.icon}</div>
                <div className="stat-label">{m.label}</div>
                <div style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:22,color:m.color}}>{m.val}</div>
              </div>
            ))}
          </div>
          {/* Live feed */}
          <div className="chart-card">
            <div className="chart-title flex-between" style={{marginBottom:12}}>
              <span>▶ LIVE ACTIVITY FEED</span>
              <span style={{fontSize:11,color:"var(--text-muted)"}}>{feed.length} events</span>
            </div>
            {feed.length===0?<p style={{color:"var(--text-muted)",fontSize:13}}>No recent events — system nominal</p>:
              feed.slice(0,10).map(f=>(
                <div key={f.id} style={{display:"flex",gap:12,padding:"8px 0",borderBottom:"1px solid var(--border)",alignItems:"center"}}>
                  <span style={{fontFamily:"var(--font-mono)",color:"var(--text-dim)",fontSize:10,whiteSpace:"nowrap",minWidth:70}}>{f.ts}</span>
                  <span style={{color:f.sev==="error"?"var(--red)":f.sev==="success"?"var(--green)":f.sev==="warning"?"var(--orange)":"var(--accent)",fontSize:13,fontWeight:500}}>{f.msg}</span>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* ── TRENDS ── */}
      {tab==="trends"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {hourlyChart&&<div className="chart-card"><div className="chart-title">▶ 24-HOUR INCIDENT PATTERN</div><div style={{height:200}}><ResponsiveContainer width="100%" height="100%"><AreaChart data={rechartify(hourlyChart)} margin={{top:5,right:5,bottom:5,left:-15}}><XAxis dataKey="name" tick={{fontSize:9,fill:"var(--text-muted)"}}/><YAxis tick={{fontSize:9,fill:"var(--text-muted)"}}/><RTooltip/><Area type="monotone" dataKey="value" stroke="var(--accent)" fill="rgba(0,200,255,0.08)"/></AreaChart></ResponsiveContainer></div></div>}
          {dailyChart&&<div className="chart-card"><div className="chart-title">▶ 14-DAY TREND</div><div style={{height:220}}><ResponsiveContainer width="100%" height="100%"><AreaChart data={rechartify(dailyChart)} margin={{top:5,right:5,bottom:5,left:-15}}><XAxis dataKey="name" tick={{fontSize:9,fill:"var(--text-muted)"}}/><YAxis tick={{fontSize:9,fill:"var(--text-muted)"}}/><RTooltip/><Area type="monotone" dataKey="value" stroke="var(--orange)" fill="rgba(255,143,0,0.08)"/></AreaChart></ResponsiveContainer></div></div>}
          <div className="grid-2 gap-16">
            <div className="chart-card"><div className="chart-title" style={{color:"#FFD600"}}>▶ INCIDENTS BY SHIFT</div><div style={{height:200}}><ResponsiveContainer width="100%" height="100%"><BarChart data={rechartify(shiftChart)} margin={{top:5,right:5,bottom:5,left:-15}}><XAxis dataKey="name" tick={{fontSize:9,fill:"var(--text-muted)"}}/><YAxis tick={{fontSize:9,fill:"var(--text-muted)"}}/><RTooltip contentStyle={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:8,fontSize:12}}/><Bar dataKey="value" radius={[4,4,0,0]}><Cell fill="#FFD600"/><Cell fill="#FF8800"/><Cell fill="#6644DD"/></Bar></BarChart></ResponsiveContainer></div></div>
            {dowChart&&<div className="chart-card"><div className="chart-title">▶ DAY OF WEEK PATTERN</div><div style={{height:200}}><div style={{height:200}}><ResponsiveContainer width="100%" height="100%"><BarChart data={rechartify(dowChart)} margin={{top:5,right:5,bottom:5,left:-15}}><XAxis dataKey="name" tick={{fontSize:9,fill:"var(--text-muted)"}}/><YAxis tick={{fontSize:9,fill:"var(--text-muted)"}}/><RTooltip/><Bar dataKey="value" fill="var(--accent)" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div></div></div>}
          </div>
        </div>
      )}

      {/* ── BREAKDOWN ── */}
      {tab==="breakdown"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div className="grid-2 gap-16">
            <div className="chart-card"><div className="chart-title" style={{color:"#00E676"}}>▶ RESPONSE TIME DISTRIBUTION</div><div style={{height:200}}><ResponsiveContainer width="100%" height="100%"><BarChart data={rechartify(rtChart)} margin={{top:5,right:5,bottom:5,left:-15}}><XAxis dataKey="name" tick={{fontSize:9,fill:"var(--text-muted)"}}/><YAxis tick={{fontSize:9,fill:"var(--text-muted)"}}/><RTooltip contentStyle={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:8,fontSize:12}}/><Bar dataKey="value" radius={[4,4,0,0]}><Cell fill="#00E676"/><Cell fill="#88CC00"/><Cell fill="#FFD600"/><Cell fill="#FF8800"/><Cell fill="#FF2050"/></Bar></BarChart></ResponsiveContainer></div></div>
            <div className="chart-card"><div className="chart-title">▶ PRIORITY BREAKDOWN</div>
<div style={{height:200}}>
<ResponsiveContainer width="100%" height="100%">
  <BarChart data={priorityData} margin={{top:5,right:10,bottom:5,left:-10}}>
    <XAxis dataKey="name" tick={{fontSize:10,fill:"var(--text-muted)"}}/><YAxis tick={{fontSize:10,fill:"var(--text-muted)"}}/>
    <RTooltip/><Bar dataKey="value" fill="var(--accent)" radius={[3,3,0,0]}/>
  </BarChart>
</ResponsiveContainer></div></div>
          </div>
          {weatherChart&&<div className="chart-card"><div className="chart-title">▶ INCIDENTS BY WEATHER CONDITION</div><div style={{height:200}}><div style={{height:200}}><ResponsiveContainer width="100%" height="100%"><BarChart data={rechartify(weatherChart)} margin={{top:5,right:5,bottom:5,left:-15}}><XAxis dataKey="name" tick={{fontSize:9,fill:"var(--text-muted)"}}/><YAxis tick={{fontSize:9,fill:"var(--text-muted)"}}/><RTooltip/><Bar dataKey="value" fill="var(--purple,#b464ff)" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div></div></div>}
          {/* SLA breakdown */}
          <div className="chart-card">
            <div className="chart-title mb-16">▶ SLA & PERFORMANCE METRICS</div>
            {[
              {label:"SLA Compliance",value:s.slaCompliance??100},
              {label:"System Performance Score",value:s.performance??0},
              {label:"City Load Headroom",value:100-(s.cityHealth?.emergencyLoadIndex??0)},
              {label:"EV Dispatch Rate",value:s.sustainability?.evPercentage??0},
              {label:"Resolution Rate",value:parseFloat(s.resolutionRate??0)},
            ].map(bar=>(
              <div key={bar.label} style={{marginBottom:14}}>
                <div className="flex-between mb-4" style={{fontSize:13}}>
                  <span style={{color:"var(--text-secondary)",fontWeight:500}}>{bar.label}</span>
                  <span style={{fontWeight:700,fontFamily:"var(--font-display)",color:bar.value>=80?"var(--green)":bar.value>=60?"var(--yellow)":"var(--red)"}}>{bar.value}%</span>
                </div>
                <div className="progress-bar progress-bar-lg">
                  <div className="fill" style={{width:`${Math.min(100,bar.value)}%`,background:bar.value>=80?"linear-gradient(90deg,#00cc55,var(--green))":bar.value>=60?"var(--yellow)":"var(--red)"}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ML INSIGHTS ── */}
      {tab==="ml"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div className="chart-card">
            <div className="chart-title">▶ ANOMALY DETECTION <span style={{color:(s.anomalies?.count??0)>0?"var(--red)":"var(--green)",marginLeft:8}}>{s.anomalies?.count??0} ANOMALIES</span></div>
            {s.anomalies?.items?.length>0?s.anomalies.items.map((a,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:16,padding:"10px 0",borderBottom:"1px solid var(--border)"}}>
                <span style={{fontSize:18}}>⚠️</span>
                <div style={{flex:1}}><span style={{fontWeight:600,fontFamily:"var(--font-display)"}}>{a.type}</span><span style={{color:"var(--text-muted)",fontSize:12,marginLeft:10}}>response {a.responseTime?.toFixed(0)}s</span></div>
                <span className={`badge ${a.direction==="slow"?"badge-red":"badge-green"}`}>{a.direction?.toUpperCase()} Z={a.zScore?.toFixed(2)}</span>
              </div>
            )):<p style={{color:"var(--green)",fontSize:13,fontWeight:600}}>✓ All response times within normal parameters</p>}
          </div>
          <div className="chart-card">
            <div className="chart-title">▶ HOT ZONES — {s.hotZones?.length??0} RISK CLUSTERS</div>
            {s.hotZones?.length>0?(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12,marginTop:12}}>
                {s.hotZones.map((z,i)=>(
                  <div key={i} style={{background:"var(--red-dim)",border:"1px solid rgba(255,64,96,0.3)",borderRadius:"var(--radius-md)",padding:"14px"}}>
                    <div style={{color:"var(--red)",fontSize:10,fontWeight:700,marginBottom:4}}>HOT ZONE #{i+1}</div>
                    <div style={{fontFamily:"var(--font-mono)",fontSize:10,color:"var(--text-muted)"}}>{z.lat?.toFixed(3)}, {z.lng?.toFixed(3)}</div>
                    <div style={{fontFamily:"var(--font-display)",fontSize:24,fontWeight:700,margin:"6px 0"}}>{z.count}</div>
                    <div style={{color:T[z.dominantType]||"var(--accent)",fontSize:12,fontWeight:600}}>{z.dominantType}</div>
                    <div className="badge badge-orange" style={{marginTop:6,display:"inline-flex"}}>×{z.riskMultiplier} risk</div>
                  </div>
                ))}
              </div>
            ):<p style={{color:"var(--text-muted)",fontSize:13}}>No hot zones detected — incident distribution is geographically normal</p>}
          </div>
          <div className="grid-2 gap-16">
            <div className="chart-card">
              <div className="chart-title">▶ SURGE ANALYSIS</div>
              {[
                {label:"Current Hour Count",val:`${s.surge?.currentHourCount??0} incidents`,color:s.surge?.isSurge?"var(--red)":"var(--green)"},
                {label:"Hourly Baseline",val:`${s.surge?.baseline??0} avg`,color:"var(--accent)"},
                {label:"Surge Ratio",val:`${s.surge?.surgeRatio??0}×`,color:s.surge?.isSurge?"var(--red)":"var(--green)"},
                {label:"Status",val:s.surge?.level??"NORMAL",color:s.surge?.level==="CRITICAL"?"var(--red)":s.surge?.level==="HIGH"?"var(--orange)":"var(--green)"},
              ].map(r=>(
                <div key={r.label} className="flex-between" style={{borderBottom:"1px solid var(--border)",padding:"10px 0"}}>
                  <span style={{color:"var(--text-muted)",fontSize:13}}>{r.label}</span>
                  <span style={{color:r.color,fontWeight:700,fontFamily:"var(--font-display)",fontSize:16}}>{r.val}</span>
                </div>
              ))}
            </div>
            <div className="chart-card">
              <div className="chart-title">▶ CITY HEALTH MATRIX</div>
              {[
                {label:"Safety Score",val:s.cityHealth?.safetyScore??0},
                {label:"ELI (Emergency Load)",val:100-(s.cityHealth?.emergencyLoadIndex??0)},
                {label:"Vehicle Readiness",val:100-(s.cityHealth?.vehicleUtilization??0)},
                {label:"SLA Compliance",val:s.cityHealth?.slaComplianceRate??100},
              ].map(m=>(
                <div key={m.label} style={{marginBottom:12}}>
                  <div className="flex-between mb-4" style={{fontSize:12}}>
                    <span style={{color:"var(--text-secondary)"}}>{m.label}</span>
                    <span style={{fontWeight:700,color:m.val>=70?"var(--green)":m.val>=50?"var(--yellow)":"var(--red)"}}>{m.val}</span>
                  </div>
                  <div className="progress-bar"><div className="fill" style={{width:`${m.val}%`,background:m.val>=70?"var(--green)":m.val>=50?"var(--yellow)":"var(--red)"}}/></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── INCIDENT LOG ── */}
      {tab==="log"&&(
        <div>
          <div className="flex gap-8 flex-wrap mb-16">
            {["All","Reported","Assigned","Resolved","Cancelled"].map(f=>(
              <button key={f} className={`btn btn-sm ${filter===f?"btn-primary":"btn-ghost"}`} onClick={()=>setFilter(f)}>
                {f} <span style={{opacity:0.7}}>({f==="All"?em.length:em.filter(e=>e.status===f).length})</span>
              </button>
            ))}
          </div>
          <div className="card" style={{padding:0,overflow:"hidden"}}>
            <div style={{overflowX:"auto"}}>
              <table className="data-table">
                <thead><tr><th>#</th><th>Type</th><th>Priority</th><th>Sev.</th><th>Status</th><th>Vehicle</th><th>Response</th><th>SLA</th><th>CO₂</th><th>Weather</th><th>ML Tags</th><th>Time</th></tr></thead>
                <tbody>
                  {filt.slice(0,60).map((e,i)=>(
                    <tr key={e._id}>
                      <td style={{color:"var(--text-dim)",fontFamily:"var(--font-mono)",fontSize:11}}>{i+1}</td>
                      <td><span className="badge" style={{color:T[e.type]||"var(--text-muted)",borderColor:T[e.type],background:"transparent",fontSize:11}}>{e.type}</span></td>
                      <td><span style={{color:P[e.priority]||"var(--text-primary)",fontWeight:700,fontSize:12,fontFamily:"var(--font-display)"}}>{e.priority}</span></td>
                      <td><span style={{color:(e.severityScore??0)>=70?"var(--red)":(e.severityScore??0)>=40?"var(--yellow)":"var(--green)",fontWeight:700,fontFamily:"var(--font-mono)"}}>{e.severityScore??"—"}</span></td>
                      <td><span className={`badge ${e.status==="Resolved"?"badge-green":e.status==="Assigned"||e.status==="En Route"?"badge-orange":e.status==="Cancelled"?"badge-muted":"badge-red"}`}>{e.status}</span></td>
                      <td style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text-secondary)"}}>{e.assignedVehicle||"—"}</td>
                      <td style={{color:e.sla?.breached?"var(--red)":"var(--green)",fontSize:12,fontWeight:600}}>{e.responseTime?`${e.responseTime.toFixed(0)}s`:"—"}</td>
                      <td>{e.sla?.breached!==undefined?<span className={`badge ${e.sla.breached?"badge-red":"badge-green"}`}>{e.sla.breached?"BREACH":"MET"}</span>:"—"}</td>
                      <td style={{color:"var(--green)",fontSize:12,fontWeight:600}}>{e.carbonSaved?`${e.carbonSaved}kg`:"—"}</td>
                      <td style={{fontSize:11,color:"var(--text-muted)"}}>{e.weatherContext?.condition||"—"}</td>
                      <td><div className="flex gap-4 flex-wrap">{(e.mlTags||[]).slice(0,2).map(t=><span key={t} className="badge badge-yellow" style={{fontSize:9,padding:"1px 6px"}}>{t}</span>)}</div></td>
                      <td style={{fontFamily:"var(--font-mono)",fontSize:10,color:"var(--text-dim)",whiteSpace:"nowrap"}}>{new Date(e.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                  {filt.length===0&&<tr><td colSpan="12" style={{textAlign:"center",padding:40,color:"var(--text-muted)"}}>No incidents</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── RESOURCES ── */}
      {tab==="resources"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {s.resourceMatrix&&(
            <div className="chart-card">
              <div className="chart-title">▶ FLEET RESOURCE MATRIX</div>
              {Object.entries(s.resourceMatrix).map(([type,d])=>(
                <div key={type} style={{display:"flex",alignItems:"center",gap:16,padding:"12px 0",borderBottom:"1px solid var(--border)"}}>
                  <div style={{width:110,fontFamily:"var(--font-display)",fontWeight:700,fontSize:13}}>{type}</div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",gap:4,marginBottom:6}}>
                      {Array.from({length:d.total}).map((_,i)=>(
                        <div key={i} style={{width:18,height:18,borderRadius:4,background:i<d.assigned?"var(--orange)":"var(--green)",opacity:0.85}}/>
                      ))}
                    </div>
                    <div style={{fontSize:11,color:"var(--text-muted)"}}>{d.available} available · {d.assigned} assigned · {d.evCount} EV</div>
                  </div>
                  <div style={{color:d.readiness>=70?"var(--green)":d.readiness>=40?"var(--yellow)":"var(--red)",fontWeight:700,fontSize:18,fontFamily:"var(--font-display)"}}>{d.readiness}%</div>
                </div>
              ))}
            </div>
          )}
          <div className="chart-card co2-meter" style={{background:"var(--green-dim)",borderColor:"rgba(0,230,118,0.3)"}}>
            <div className="chart-title" style={{color:"var(--green)"}}>🌱 SUSTAINABILITY METRICS</div>
            <div className="stat-grid">
              {[
                {label:"CO₂ Saved Total",val:`${s.sustainability?.totalCarbonSaved??0} kg`,color:"var(--green)"},
                {label:"EV Dispatches",val:s.sustainability?.evDispatches??0,color:"var(--green)"},
                {label:"EV Rate",val:`${s.sustainability?.evPercentage??0}%`,color:"var(--green)"},
                {label:"Total Distance",val:`${s.sustainability?.totalDistanceKm??0} km`,color:"var(--accent)"},
                {label:"Diesel Equivalent Avoided",val:`${s.sustainability?.co2WouldHaveEmitted??0} kg`,color:"var(--orange)"},
              ].map(m=>(
                <div key={m.label} className="stat-card">
                  <div className="stat-label">{m.label}</div>
                  <div className="stat-value" style={{color:m.color,fontSize:20}}>{m.val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── PERFORMANCE ── */}
      {tab==="performance"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* Top vehicles */}
          {s.vehiclePerformance?.length>0&&(
            <div className="chart-card">
              <div className="chart-title">▶ TOP PERFORMING VEHICLES</div>
              <table className="data-table">
                <thead><tr><th>Rank</th><th>Vehicle</th><th>Type</th><th>Total Trips</th><th>CO₂ Saved</th><th>Fuel</th></tr></thead>
                <tbody>
                  {s.vehiclePerformance.map((v,i)=>(
                    <tr key={v.vehicleId}>
                      <td><span style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:16,color:i===0?"var(--yellow)":i===1?"#aaa":i===2?"#cd7f32":"var(--text-muted)"}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}</span></td>
                      <td><div style={{fontWeight:700}}>{v.name||v.vehicleId}</div><div style={{fontSize:11,color:"var(--text-muted)",fontFamily:"var(--font-mono)"}}>{v.vehicleId}</div></td>
                      <td><span className="badge badge-muted">{v.type||"—"}</span></td>
                      <td style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:18,color:"var(--accent)"}}>{v.trips}</td>
                      <td style={{color:"var(--green)",fontWeight:700}}>{(+v.co2Saved||0).toFixed(1)} kg</td>
                      <td><span className={`badge ${v.fuelType==="EV"?"badge-green":v.fuelType==="Hybrid"?"badge-accent":"badge-muted"}`}>{v.fuelType}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* KPI scorecard */}
          <div className="chart-card">
            <div className="chart-title mb-16">▶ PERFORMANCE SCORECARD</div>
            <div className="grid-2 gap-16">
              {[
                {label:"Response Time vs SLA",score:Math.min(100,Math.round((1-(s.slaBreached??0)/Math.max(1,s.slaTotal??1))*100)),tip:"% of incidents meeting SLA target"},
                {label:"Fleet Efficiency",score:Math.min(100,Math.round((s.vehicleStats?.available??0)/Math.max(1,s.vehicleStats?.total??1)*100+50)),tip:"Vehicle availability + utilisation balance"},
                {label:"Green Operations",score:Math.min(100,Math.round((s.sustainability?.evPercentage??0)*1.2)),tip:"EV dispatch percentage"},
                {label:"City Resilience",score:s.cityHealth?.safetyScore??0,tip:"Combined safety + response index"},
              ].map(m=>(
                <div key={m.label} style={{background:"var(--bg-elevated)",borderRadius:"var(--radius-md)",padding:"16px 20px",border:"1px solid var(--border)"}}>
                  <div className="flex-between mb-8">
                    <span style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:13}}>{m.label}</span>
                    <span style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:22,color:m.score>=80?"var(--green)":m.score>=60?"var(--yellow)":"var(--red)"}}>{Math.min(100,m.score)}</span>
                  </div>
                  <div className="progress-bar progress-bar-lg mb-8">
                    <div className="fill" style={{width:`${Math.min(100,m.score)}%`,background:m.score>=80?"linear-gradient(90deg,#00aa44,var(--green))":m.score>=60?"var(--yellow)":"var(--red)"}}/>
                  </div>
                  <div style={{fontSize:11,color:"var(--text-muted)"}}>{m.tip}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── LOCATION INTEL TAB ── */}
      {tab==="location"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div className="stat-grid" style={{gridTemplateColumns:"repeat(4,1fr)"}}>
            {[
              {label:"Cities Covered",   val:s.locationAnalytics?.totalCitiesCovered??0, color:"var(--accent)"},
              {label:"Most Active City", val:s.locationAnalytics?.mostActiveCity||"—",   color:"var(--orange)", small:true},
              {label:"Slowest Response", val:s.locationAnalytics?.slowestCity||"—",      color:"var(--red)",    small:true},
              {label:"Repeat Locations", val:s.locationAnalytics?.repeatAddresses?.length??0, color:"var(--yellow)"},
            ].map(m=>(
              <div key={m.label} className="stat-card" style={{padding:"14px 16px"}}>
                <div className="stat-label">{m.label}</div>
                <div style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:m.small?18:28,color:m.color,marginTop:4,lineHeight:1.2}}>{m.val}</div>
              </div>
            ))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            {s.locationAnalytics?.cityStats?.length>0&&(
              <div className="chart-card" style={{padding:0,overflow:"hidden"}}>
                <div className="chart-title" style={{padding:"14px 16px 0"}}>▶ INCIDENTS BY CITY</div>
                <table className="data-table">
                  <thead><tr><th>#</th><th>City</th><th>Count</th><th>Resolved%</th><th>Avg Response</th><th>Top Type</th></tr></thead>
                  <tbody>
                    {s.locationAnalytics.cityStats.map((c,i)=>(
                      <tr key={c.city}>
                        <td style={{fontFamily:"var(--font-display)",fontWeight:700,color:i===0?"var(--red)":i===1?"var(--orange)":i===2?"var(--yellow)":"var(--text-muted)"}}>{i+1}</td>
                        <td style={{fontWeight:700}}>{c.city}</td>
                        <td style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:18,color:"var(--accent)"}}>{c.count}</td>
                        <td>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <div style={{flex:1,height:5,background:"var(--bg-elevated)",borderRadius:3,minWidth:40}}>
                              <div style={{height:"100%",borderRadius:3,background:c.resolutionRate>=80?"var(--green)":c.resolutionRate>=50?"var(--yellow)":"var(--red)",width:`${c.resolutionRate}%`}}/>
                            </div>
                            <span style={{fontSize:11,fontWeight:600,color:c.resolutionRate>=80?"var(--green)":c.resolutionRate>=50?"var(--yellow)":"var(--red)"}}>{c.resolutionRate}%</span>
                          </div>
                        </td>
                        <td style={{fontFamily:"var(--font-mono)",fontSize:12,color:c.avgResponse>300?"var(--red)":c.avgResponse>180?"var(--yellow)":"var(--green)"}}>{c.avgResponse?`${Math.round(c.avgResponse)}s`:"—"}</td>
                        <td><span className="badge badge-muted" style={{fontSize:10}}>{c.dominantType}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {s.locationAnalytics?.cityStats?.length>0&&(
              <div className="chart-card">
                <div className="chart-title mb-12">▶ CITY INCIDENT VOLUME</div>
                <div style={{height:260}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={s.locationAnalytics.cityStats.map(x=>({name:x.city.length>10?x.city.slice(0,10)+"…":x.city,value:x.count}))} margin={{top:5,right:5,bottom:5,left:-15}}>
                      <XAxis dataKey="name" tick={{fontSize:9,fill:"var(--text-muted)"}}/>
                      <YAxis tick={{fontSize:9,fill:"var(--text-muted)"}}/>
                      <RTooltip/>
                      <Bar dataKey="value" fill="var(--accent)" radius={[3,3,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {s.locationAnalytics?.cityResponseRanking?.length>0&&(
            <div className="chart-card">
              <div className="chart-title mb-14">▶ SLOWEST RESPONSE CITIES — requires attention</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {s.locationAnalytics.cityResponseRanking.map((c,i)=>(
                  <div key={c.city} style={{display:"flex",alignItems:"center",gap:14,padding:"10px 14px",background:"var(--bg-elevated)",borderRadius:"var(--radius-md)",border:`1px solid ${i===0?"rgba(255,64,96,0.3)":"var(--border)"}`}}>
                    <span style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:20,color:i===0?"var(--red)":i===1?"var(--orange)":"var(--text-muted)",minWidth:28}}>#{i+1}</span>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:15}}>{c.city}</div>
                      <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2}}>{c.count} incidents · {c.resolutionRate}% resolved · Top: {c.dominantType}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:22,color:c.avgResponse>300?"var(--red)":c.avgResponse>180?"var(--yellow)":"var(--green)"}}>{Math.round(c.avgResponse)}s</div>
                      <div style={{fontSize:11,color:"var(--text-muted)"}}>avg response</div>
                    </div>
                    <div style={{width:100}}>
                      <div className="progress-bar progress-bar-sm">
                        <div className="fill" style={{width:`${Math.min(100,c.avgResponse/6)}%`,background:c.avgResponse>300?"var(--red)":c.avgResponse>180?"var(--yellow)":"var(--green)"}}/>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            {s.locationAnalytics?.zoneStats?.length>0&&(
              <div className="chart-card">
                <div className="chart-title mb-12">▶ HOTTEST ZONES / AREAS</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {s.locationAnalytics.zoneStats.map((z,i)=>{
                    const maxC=s.locationAnalytics.zoneStats[0]?.count||1;
                    return (
                      <div key={z.zone} style={{display:"flex",gap:10,alignItems:"center"}}>
                        <span style={{fontSize:11,color:"var(--text-muted)",minWidth:18,fontFamily:"var(--font-mono)"}}>{i+1}</span>
                        <div style={{flex:1}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                            <span style={{fontSize:12,fontWeight:600,color:"var(--text-secondary)"}}>{z.zone}</span>
                            <span style={{fontSize:11,fontFamily:"var(--font-mono)",color:"var(--accent)",fontWeight:700}}>{z.count}</span>
                          </div>
                          <div style={{height:5,background:"var(--bg-elevated)",borderRadius:3}}>
                            <div style={{height:"100%",borderRadius:3,background:`linear-gradient(90deg,${i===0?"var(--red)":i<=2?"var(--orange)":"var(--accent)"},transparent)`,width:`${Math.round((z.count/maxC)*100)}%`}}/>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="chart-card">
              <div className="chart-title mb-12">▶ REPEAT INCIDENT ADDRESSES ⚠️</div>
              {s.locationAnalytics?.repeatAddresses?.length>0?(
                <div style={{display:"flex",flexDirection:"column",gap:7}}>
                  <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:6}}>Addresses with 2+ incidents — may need permanent infrastructure</div>
                  {s.locationAnalytics.repeatAddresses.map(a=>(
                    <div key={a.address} style={{background:"var(--bg-elevated)",borderRadius:"var(--radius-md)",padding:"9px 13px",border:`1px solid ${a.count>=5?"rgba(255,64,96,0.3)":a.count>=3?"rgba(255,143,0,0.2)":"var(--border)"}`,display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:16}}>{a.count>=5?"🔴":a.count>=3?"🟠":"🟡"}</span>
                      <div style={{flex:1,fontSize:12,fontWeight:600}}>{a.address}</div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:18,color:a.count>=5?"var(--red)":a.count>=3?"var(--orange)":"var(--yellow)"}}>{a.count}</div>
                        <div style={{fontSize:10,color:"var(--text-muted)"}}>reports</div>
                      </div>
                    </div>
                  ))}
                </div>
              ):(
                <div style={{padding:30,textAlign:"center",opacity:0.5}}>
                  <div style={{fontSize:28,marginBottom:8}}>✅</div>
                  <div style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:14}}>No repeat locations yet</div>
                </div>
              )}
            </div>
          </div>

          {s.locationAnalytics?.cityTimeBreakdown&&Object.keys(s.locationAnalytics.cityTimeBreakdown).length>0&&(
            <div className="chart-card">
              <div className="chart-title mb-14">▶ INCIDENT TIME PATTERNS BY CITY</div>
              <div style={{overflowX:"auto"}}>
                <table className="data-table">
                  <thead><tr><th>City</th><th>🌅 Morning (6–14h)</th><th>🌇 Afternoon (14–22h)</th><th>🌙 Night (22–6h)</th><th>Peak Shift</th></tr></thead>
                  <tbody>
                    {Object.entries(s.locationAnalytics.cityTimeBreakdown).slice(0,8).map(([city,shifts])=>{
                      const peak=Object.entries(shifts).sort((a,b)=>b[1]-a[1])[0]?.[0]||"—";
                      const total=(shifts.morning||0)+(shifts.afternoon||0)+(shifts.night||0)||1;
                      return (
                        <tr key={city}>
                          <td style={{fontWeight:700}}>{city}</td>
                          {["morning","afternoon","night"].map(sh=>(
                            <td key={sh}>
                              <div style={{display:"flex",alignItems:"center",gap:7}}>
                                <div style={{flex:1,height:7,background:"var(--bg-elevated)",borderRadius:4,minWidth:50}}>
                                  <div style={{height:"100%",borderRadius:4,background:sh==="morning"?"var(--yellow)":sh==="afternoon"?"var(--orange)":"#7c6ef0",width:`${Math.round(((shifts[sh]||0)/total)*100)}%`}}/>
                                </div>
                                <span style={{fontSize:11,fontFamily:"var(--font-mono)",fontWeight:600,minWidth:16}}>{shifts[sh]||0}</span>
                              </div>
                            </td>
                          ))}
                          <td><span className={`badge ${peak==="morning"?"badge-yellow":peak==="afternoon"?"badge-orange":"badge-muted"}`} style={{fontSize:10}}>{peak==="morning"?"🌅 Morning":peak==="afternoon"?"🌇 Afternoon":"🌙 Night"}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
