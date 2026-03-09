/**
 * FIRST AID GUIDE COMPONENT
 * Shows step-by-step emergency guidance
 * Used in CitizenView chat AND as standalone modal
 */
import { useState } from "react";

const GUIDES = {
  Medical: {
    icon:"🏥", color:"var(--red)",
    steps:[
      { n:1, icon:"📞", t:"Call 112",           d:"Stay on line. Describe the patient and your location clearly." },
      { n:2, icon:"🛡", t:"Ensure Safety",       d:"Check scene is safe for you. Do not risk yourself." },
      { n:3, icon:"👁", t:"Check Consciousness",  d:"Tap shoulder, shout 'Are you OK?' No response = unconscious." },
      { n:4, icon:"💓", t:"Check Breathing",      d:"Tilt head back, lift chin. Look/listen/feel for 10 seconds." },
      { n:5, icon:"🫀", t:"Start CPR if Needed",  d:"30 compressions + 2 breaths. Push 5–6cm at 100–120/min." },
      { n:6, icon:"🩹", t:"Control Bleeding",     d:"Firm pressure with clean cloth. Don't remove — add more on top." },
      { n:7, icon:"🌡", t:"Prevent Shock",        d:"Keep warm, legs raised. No food or water." },
      { n:8, icon:"📍", t:"Guide Help",           d:"Stay with patient. Turn on location sharing. Wave to ambulance." },
    ],
    dont:["Remove objects from wounds","Give water to unconscious person","Leave patient alone"],
    tips:["Note time of incident","Note medications they take","Clear a path for ambulance"],
  },
  CPR: {
    icon:"🫀", color:"#e53935",
    steps:[
      { n:1, icon:"🛡", t:"Scene Safety",         d:"Check area is safe. Wear gloves if available." },
      { n:2, icon:"👁", t:"Check Response",       d:"Tap shoulders firmly, shout loudly. No response → begin CPR." },
      { n:3, icon:"📞", t:"Call 112",             d:"Put on speakerphone. Begin CPR while calling." },
      { n:4, icon:"🤲", t:"Position Hands",       d:"Heel of hand on center of chest. Second hand on top, fingers interlaced." },
      { n:5, icon:"⬇", t:"30 Compressions",      d:"Push 5–6cm at 100–120/min. Let chest fully recoil each time." },
      { n:6, icon:"💨", t:"2 Rescue Breaths",     d:"Tilt head, pinch nose, 1-second breath. Watch chest rise. Repeat." },
      { n:7, icon:"🔄", t:"Continue 30:2",        d:"Don't stop until breathing returns, AED arrives, or you can't continue." },
      { n:8, icon:"⚡", t:"Use AED if Available", d:"Turn on, follow voice prompts. Continue CPR while it charges." },
    ],
    dont:["Stop without good reason","Compress too lightly","Remove hands between cycles"],
    tips:["Think 'Stayin' Alive' for beat timing","Allow full chest recoil","Swap compressors every 2 min if possible"],
  },
  Fire: {
    icon:"🔥", color:"var(--orange)",
    steps:[
      { n:1, icon:"🚨", t:"Alert Everyone",       d:"Shout 'FIRE!'. Activate nearest alarm pull station." },
      { n:2, icon:"📞", t:"Call 101 / 112",       d:"Give address, type of fire, if anyone is trapped." },
      { n:3, icon:"🚪", t:"Evacuate NOW",          d:"Leave everything. Use stairs only. Never the lift." },
      { n:4, icon:"🖐", t:"Check Doors",           d:"Touch door with back of hand before opening. Hot door = find another exit." },
      { n:5, icon:"💨", t:"Stay Low in Smoke",    d:"Crawl under smoke. Air is cleaner near the floor." },
      { n:6, icon:"🔒", t:"Close Doors",           d:"Closed doors slow fire spread by up to 3 minutes." },
      { n:7, icon:"📍", t:"Assembly Point",        d:"Meet designated safe point. Account for everyone." },
      { n:8, icon:"🚫", t:"Never Re-enter",        d:"Wait for brigade clearance. No belongings are worth your life." },
    ],
    dont:["Use lifts during fire","Delay evacuation for belongings","Open hot doors"],
    tips:["STOP DROP ROLL if clothes on fire","Wet cloth over nose in smoke","Signal from window if trapped"],
  },
  "Gas Leak": {
    icon:"💨", color:"var(--yellow)",
    steps:[
      { n:1, icon:"🚫", t:"No Electricity",       d:"No switches, phones, lighters. Any spark can ignite gas." },
      { n:2, icon:"🪟", t:"Open Everything",      d:"Open all windows and doors to ventilate immediately." },
      { n:3, icon:"🔴", t:"Shut Off Gas",         d:"Turn main gas valve clockwise (right) to close if accessible." },
      { n:4, icon:"🚶", t:"Evacuate All",         d:"Everyone outside including pets. Move upwind." },
      { n:5, icon:"📞", t:"Call from Outside",    d:"Only call 101 or 112 once outside the building." },
      { n:6, icon:"🚗", t:"Warn Neighbours",      d:"Gas can travel. Alert adjacent buildings too." },
      { n:7, icon:"🚒", t:"Wait for HazMat",      d:"Only they can find and stop the leak safely." },
    ],
    dont:["Use any electrical device","Smoke","Re-enter until cleared"],
    tips:["Stay upwind","If eyes burn, move further away","Don't start cars near building"],
  },
  Flood: {
    icon:"🌊", color:"#1565c0",
    steps:[
      { n:1, icon:"⬆", t:"Move to High Ground",  d:"Get to highest floor immediately. Don't wait." },
      { n:2, icon:"🔌", t:"Switch Off Power",     d:"Turn off main breaker if safe. Electrocution is a major flood risk." },
      { n:3, icon:"📞", t:"Call 112",             d:"Give exact floor and address. Signal from windows." },
      { n:4, icon:"💧", t:"Store Clean Water",    d:"Fill containers before supply becomes contaminated." },
      { n:5, icon:"🚫", t:"Never Walk in Water",  d:"15cm moving water can knock you down. Stay elevated." },
      { n:6, icon:"📦", t:"Emergency Kit",        d:"Grab medicine, ID, phone+charger. Put in waterproof bag." },
      { n:7, icon:"🚁", t:"Signal for Rescue",    d:"Bright cloth, mirror flash, flashlight. Move to roof only if water reaches your floor." },
    ],
    dont:["Drive through flooded roads","Touch fallen power lines","Return before authorities say safe"],
    tips:["Floodwater is contaminated — don't drink","Keep children close","Note your floor number when calling"],
  },
  Accident: {
    icon:"💥", color:"var(--orange)",
    steps:[
      { n:1, icon:"🚗", t:"Secure Scene",          d:"Hazard lights on. Warning triangles 50m back. Switch off engines." },
      { n:2, icon:"📞", t:"Call 112",              d:"Give road name, km marker, number of casualties, injuries." },
      { n:3, icon:"🚶", t:"Don't Move Victims",    d:"Unless fire/traffic danger. Moving causes spinal damage." },
      { n:4, icon:"💓", t:"Check Vitals",          d:"Breathing + pulse. CPR only if not breathing and no pulse." },
      { n:5, icon:"🩹", t:"Stop Bleeding",         d:"Firm pressure with cloth. Keep steady, don't release." },
      { n:6, icon:"🧊", t:"Treat for Shock",       d:"Keep warm, legs raised. Don't give food or water." },
      { n:7, icon:"📱", t:"Guide Services",        d:"Stay on call. Use flashlight to signal ambulance." },
    ],
    dont:["Move injured unless in danger","Remove helmets","Leave scene before help arrives"],
    tips:["Note registration numbers","Take photos if safe","Remember time of accident"],
  },
  Crime: {
    icon:"🚔", color:"var(--accent)",
    steps:[
      { n:1, icon:"🏃", t:"Run if Possible",      d:"Escape safely, leave belongings, alert others." },
      { n:2, icon:"🚪", t:"Hide if Can't Run",    d:"Lock/barricade door. Lights off. Silence phone." },
      { n:3, icon:"📞", t:"Call 100 / 112",       d:"Whisper location. Leave phone on even if silent." },
      { n:4, icon:"🤫", t:"Stay Quiet",           d:"Silence all notifications. Stay out of sight completely." },
      { n:5, icon:"⚔", t:"Fight Last Resort",     d:"If confronted with no option: yell, act aggressively, commit fully." },
      { n:6, icon:"📝", t:"Note Details",         d:"Remember appearance, vehicle, direction — for police." },
    ],
    dont:["Confront unless no option","Post on social media","Assume it's over without police confirmation"],
    tips:["RUN → HIDE → TELL (priority order)","Trust your instincts","Lock valuables away when police arrive"],
  },
  Breakdown: {
    icon:"🔧", color:"var(--text-secondary)",
    steps:[
      { n:1, icon:"🚗", t:"Move to Safety",       d:"Pull to shoulder/left side. Avoid bends/hills." },
      { n:2, icon:"⚠", t:"Hazard Lights On",      d:"Immediately. Place triangles 50m behind vehicle." },
      { n:3, icon:"🚶", t:"Exit Passenger Side",  d:"All passengers exit away from traffic. Stand behind barrier." },
      { n:4, icon:"📞", t:"Call for Help",         d:"Use this app. Call roadside assistance if available." },
      { n:5, icon:"🔦", t:"Be Visible",            d:"Torch at night. Bright clothing if available." },
      { n:6, icon:"🚫", t:"No Roadside Repairs",  d:"Never attempt repairs on live traffic roads." },
    ],
    dont:["Stay in vehicle on highway","Do risky repairs in traffic","Accept lifts from strangers"],
    tips:["Note road/highway name and km marker","Keep warning triangles in car always","Move away from vehicle on highways"],
  },
};

const QUICK_BUTTONS = [
  { type:"Medical",   icon:"🏥", label:"First Aid" },
  { type:"CPR",       icon:"🫀", label:"CPR" },
  { type:"Fire",      icon:"🔥", label:"Fire" },
  { type:"Gas Leak",  icon:"💨", label:"Gas Leak" },
  { type:"Flood",     icon:"🌊", label:"Flood" },
  { type:"Accident",  icon:"💥", label:"Accident" },
  { type:"Crime",     icon:"🚔", label:"Crime" },
  { type:"Breakdown", icon:"🔧", label:"Breakdown" },
];

export default function FirstAidGuide({ defaultType = null, inline = false, onSend = null }) {
  const [activeType, setActiveType] = useState(defaultType);
  const [activeStep, setActiveStep] = useState(null);

  const guide = activeType ? GUIDES[activeType] : null;

  return (
    <div style={{ fontFamily:"var(--font-body)" }}>
      {/* Type selector */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:14 }}>
        {QUICK_BUTTONS.map(b => (
          <button key={b.type} onClick={() => { setActiveType(b.type); setActiveStep(null); }}
            style={{ padding:"6px 12px", borderRadius:20, border:`1.5px solid ${activeType===b.type?"var(--accent)":"var(--border)"}`, background:activeType===b.type?"var(--accent-dim)":"var(--bg-elevated)", cursor:"pointer", fontSize:12, fontWeight:activeType===b.type?700:400, color:activeType===b.type?"var(--accent)":"var(--text-secondary)", transition:"var(--transition)", display:"flex", alignItems:"center", gap:4 }}>
            <span>{b.icon}</span> {b.label}
          </button>
        ))}
      </div>

      {!guide && (
        <div style={{ textAlign:"center", padding:"30px 0", color:"var(--text-muted)", fontSize:14 }}>
          <div style={{ fontSize:40, marginBottom:10 }}>🩺</div>
          Select an emergency type above to see step-by-step guidance
        </div>
      )}

      {guide && (
        <div>
          {/* Header */}
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, padding:"10px 14px", background:"var(--bg-elevated)", borderRadius:"var(--radius-md)", border:`1px solid ${guide.color}30` }}>
            <span style={{ fontSize:30 }}>{guide.icon}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:16, color:guide.color }}>
                {activeType === "CPR" ? "CPR — Cardiopulmonary Resuscitation" : `${activeType} Emergency`}
              </div>
              <div style={{ fontSize:12, color:"var(--text-muted)", marginTop:2 }}>{guide.steps.length} steps · Tap any step to expand</div>
            </div>
            {onSend && (
              <button className="btn btn-primary btn-sm" onClick={() => onSend(activeType, guide)}>
                📤 Send to Citizen
              </button>
            )}
          </div>

          {/* Steps */}
          <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:14 }}>
            {guide.steps.map((s, i) => (
              <div key={i} onClick={() => setActiveStep(activeStep===i?null:i)}
                style={{ background:activeStep===i?"var(--accent-dim)":"var(--bg-card)", border:`1px solid ${activeStep===i?"var(--accent)":"var(--border)"}`, borderRadius:"var(--radius-md)", padding:"10px 14px", cursor:"pointer", transition:"var(--transition)" }}>
                <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                  <div style={{ width:28, height:28, borderRadius:"50%", background:activeStep===i?"var(--accent)":"var(--bg-elevated)", border:`1px solid ${activeStep===i?"var(--accent)":"var(--border)"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:activeStep===i?"#fff":"var(--text-muted)", flexShrink:0 }}>{s.n}</div>
                  <span style={{ fontSize:16 }}>{s.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:13, color:activeStep===i?"var(--accent)":"var(--text-primary)" }}>{s.t}</div>
                    {activeStep===i && <div style={{ fontSize:12, color:"var(--text-secondary)", marginTop:4, lineHeight:1.6 }}>{s.d}</div>}
                  </div>
                  <span style={{ fontSize:10, color:"var(--text-dim)" }}>{activeStep===i?"▲":"▼"}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Do Nots */}
          <div style={{ background:"var(--red-dim)", borderRadius:"var(--radius-md)", padding:"10px 14px", marginBottom:10, border:"1px solid rgba(255,64,96,0.2)" }}>
            <div style={{ fontWeight:700, fontSize:12, color:"var(--red)", marginBottom:6 }}>❌ DO NOT</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
              {guide.dont.map((d,i)=>(
                <span key={i} style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"rgba(255,64,96,0.1)", border:"1px solid rgba(255,64,96,0.15)", color:"var(--red)" }}>✗ {d}</span>
              ))}
            </div>
          </div>

          {/* Tips */}
          <div style={{ background:"var(--green-dim)", borderRadius:"var(--radius-md)", padding:"10px 14px", border:"1px solid rgba(0,230,118,0.2)" }}>
            <div style={{ fontWeight:700, fontSize:12, color:"var(--green)", marginBottom:6 }}>💡 KEY TIPS</div>
            <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
              {guide.tips.map((t,i)=>(
                <div key={i} style={{ fontSize:12, color:"var(--text-secondary)", display:"flex", gap:6 }}><span style={{ color:"var(--green)" }}>•</span>{t}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { GUIDES };
