/**
 * FIRST AID & SAFETY GUIDANCE ENGINE
 * Returns structured step-by-step instructions per emergency type
 * Also handles follow-up questions via keyword matching
 */

const GUIDES = {
  Medical: {
    icon: "🏥",
    title: "Medical Emergency — First Aid",
    steps: [
      { num:1, icon:"📞", title:"Call Emergency Services", text:"Call 112 immediately. Stay on the line and follow dispatcher instructions." },
      { num:2, icon:"🛡", title:"Ensure Safety", text:"Check if the scene is safe for you. Do not put yourself in danger to help." },
      { num:3, icon:"👁", title:"Assess Consciousness", text:"Gently tap shoulders and ask loudly 'Are you OK?' If no response, the person is unconscious." },
      { num:4, icon:"💓", title:"Check Breathing", text:"Tilt head back, lift chin, look/listen/feel for breathing for 10 seconds." },
      { num:5, icon:"🫀", title:"Start CPR if Needed", text:"30 chest compressions + 2 rescue breaths. Push hard and fast (100–120/min) in center of chest." },
      { num:6, icon:"🩹", title:"Control Bleeding", text:"Apply firm pressure with clean cloth. Do NOT remove it. Elevate injured area if possible." },
      { num:7, icon:"🌡", title:"Prevent Shock", text:"Keep person warm, lying down with legs slightly raised. Do NOT give food or water." },
      { num:8, icon:"📍", title:"Stay Until Help Arrives", text:"Stay with the person, monitor breathing, and guide emergency services to your location." },
    ],
    quickTips: ["Do NOT move spinal injury patients","Note medications the person takes","Time of incident matters — remember it","Clear a path for the ambulance"],
    doNot: ["Do not remove objects stuck in wounds","Do not give water to unconscious person","Do not leave patient alone"],
  },
  CPR: {
    icon: "🫀",
    title: "CPR — Step by Step",
    steps: [
      { num:1, icon:"🛡", title:"Confirm Scene Safety", text:"Ensure the area is safe. Put on gloves if available." },
      { num:2, icon:"👁", title:"Check Responsiveness", text:"Tap shoulders firmly, shout 'Are you OK?' — no response means begin CPR." },
      { num:3, icon:"📞", title:"Call 112 Now", text:"Tell someone to call 112 while you begin. Or use speakerphone." },
      { num:4, icon:"🤲", title:"Position Hands", text:"Place heel of hand on center of chest (lower half of breastbone). Second hand on top, fingers interlaced." },
      { num:5, icon:"⬇", title:"Compress 30 Times", text:"Push down 5–6 cm, 100–120 times per minute. Let chest fully rise between compressions." },
      { num:6, icon:"💨", title:"Give 2 Rescue Breaths", text:"Tilt head back, pinch nose, form seal, blow 1 second. Watch for chest rise. Repeat once." },
      { num:7, icon:"🔄", title:"Continue 30:2 Cycle", text:"Do not stop unless person breathes normally, help arrives, AED available, or you're exhausted." },
      { num:8, icon:"⚡", title:"Use AED if Available", text:"Turn on AED, follow voice prompts. Continue CPR while AED charges." },
    ],
    quickTips: ["100–120 compressions/min = BeeGees 'Stayin Alive' beat","Allow full chest recoil","Minimize interruptions"],
    doNot: ["Do not stop without cause","Do not compress too lightly","Do not tilt head if spinal injury suspected"],
  },
  Fire: {
    icon: "🔥",
    title: "Fire Emergency — Safety Steps",
    steps: [
      { num:1, icon:"🚨", title:"Alert Everyone", text:"Shout 'FIRE!' Activate the nearest fire alarm immediately." },
      { num:2, icon:"📞", title:"Call Fire Brigade", text:"Call 101 (fire) or 112. Give exact address, type of fire, and any trapped persons." },
      { num:3, icon:"🚪", title:"Evacuate Immediately", text:"Leave NOW. Take nothing. Use stairs — NEVER lift/elevator." },
      { num:4, icon:"🖐", title:"Check Doors", text:"Touch door with back of hand before opening. Hot door = fire on other side. Find another way." },
      { num:5, icon:"💨", title:"Stay Low in Smoke", text:"Crawl under smoke. Smoke rises — air is cleaner near the floor." },
      { num:6, icon:"🔒", title:"Close Doors Behind You", text:"Closed doors slow fire spread. This saves lives." },
      { num:7, icon:"📍", title:"Go to Assembly Point", text:"Meet at designated safe point. Account for everyone. Tell rescue teams who is missing." },
      { num:8, icon:"🚫", title:"Never Re-enter", text:"Do NOT go back for belongings. Wait for fire brigade clearance." },
    ],
    quickTips: ["STOP, DROP, ROLL if clothes catch fire","Wet cloth over nose/mouth in heavy smoke","If trapped: seal door gaps with clothing and signal from window"],
    doNot: ["Do not use lifts","Do not delay evacuation","Do not open hot doors","Do not re-enter building"],
  },
  "Gas Leak": {
    icon: "💨",
    title: "Gas Leak — Emergency Steps",
    steps: [
      { num:1, icon:"🚫", title:"Do NOT use electricity", text:"No switches, phones, lighters, or electrical equipment. A spark can ignite gas." },
      { num:2, icon:"🪟", title:"Ventilate Immediately", text:"Open all windows and doors to let gas disperse. Do it quickly." },
      { num:3, icon:"🔴", title:"Shut Off Gas Supply", text:"Turn off the main gas valve if accessible. Turn clockwise (right) to close." },
      { num:4, icon:"🚶", title:"Evacuate Everyone", text:"Get all people and pets outside immediately. Move upwind from the building." },
      { num:5, icon:"📞", title:"Call from Outside", text:"Once outside, call 101 or 112. Do NOT call from inside the building." },
      { num:6, icon:"🚗", title:"Warn Neighbours", text:"Alert neighbouring buildings. Gas can accumulate and travel to other areas." },
      { num:7, icon:"🚒", title:"Wait for HazMat Team", text:"Only authorised personnel can re-enter. Do not attempt to find the leak yourself." },
    ],
    quickTips: ["Do not start cars near the building","Stay upwind","If eyes burn or throat hurts, move further away"],
    doNot: ["Do not use any electrical device","Do not smoke","Do not re-enter until cleared"],
  },
  Flood: {
    icon: "🌊",
    title: "Flood Emergency — Survival Guide",
    steps: [
      { num:1, icon:"⬆", title:"Move to Higher Ground", text:"Move immediately to the highest floor or elevated area. Do not wait for floodwater to rise." },
      { num:2, icon:"🔌", title:"Switch Off Electricity", text:"Turn off main power at breaker box if safe to do so. Electrocution is a major flood risk." },
      { num:3, icon:"📞", title:"Call for Help", text:"Call 112. Give your exact location and floor. Signal from windows with bright cloth." },
      { num:4, icon:"💧", title:"Store Clean Water", text:"Fill bathtubs and containers with clean water before supply is contaminated." },
      { num:5, icon:"🚫", title:"Never Walk in Floodwater", text:"15cm of moving water can knock you down. 30cm can sweep a car. Stay put if elevated." },
      { num:6, icon:"📦", title:"Emergency Kit", text:"Gather medications, ID documents, phone + charger, warm clothes. Put in waterproof bag." },
      { num:7, icon:"🚁", title:"Signal for Rescue", text:"Bright colours, mirror flash, flashlight. Move to roof only if water is rising to your floor." },
    ],
    quickTips: ["Never drive through flooded roads","Floodwater is usually contaminated","Keep children and elderly with you"],
    doNot: ["Do not walk in moving floodwater","Do not touch fallen power lines","Do not return until authorities say safe"],
  },
  Accident: {
    icon: "💥",
    title: "Road Accident — First Response",
    steps: [
      { num:1, icon:"🚗", title:"Make Scene Safe", text:"Turn on hazard lights. Place warning triangles 50m behind. Switch off vehicle engines." },
      { num:2, icon:"📞", title:"Call 112 Immediately", text:"Give location (road name, km marker, landmarks), number of casualties, type of injuries." },
      { num:3, icon:"🚶", title:"Do Not Move Victims", text:"Unless immediate danger (fire, traffic). Moving can worsen spinal injuries." },
      { num:4, icon:"💓", title:"Check Vital Signs", text:"Check breathing and pulse. Start CPR only if no breathing and no pulse." },
      { num:5, icon:"🩹", title:"Control Severe Bleeding", text:"Apply firm pressure with cloth. Keep pressure steady — do not release." },
      { num:6, icon:"🧊", title:"Treat for Shock", text:"Keep person warm, lying flat. Elevate legs unless head/chest/spinal injury suspected." },
      { num:7, icon:"📱", title:"Guide Emergency Services", text:"Stay on call with dispatcher. Turn on phone flashlight to signal ambulance." },
    ],
    quickTips: ["Note vehicle registration numbers","Take photos if safe to do so","Do not give food/water to injured"],
    doNot: ["Do not move injured unless in danger","Do not remove helmets unless airway blocked","Do not leave scene until help arrives"],
  },
  Crime: {
    icon: "🚔",
    title: "Crime / Threat — Safety Steps",
    steps: [
      { num:1, icon:"🏃", title:"Run if Possible", text:"If you can escape safely, do so immediately. Leave belongings. Alert others as you go." },
      { num:2, icon:"🚪", title:"Hide if Can't Run", text:"Find concealment. Lock/barricade door. Turn off lights and silence phone." },
      { num:3, icon:"📞", title:"Call 100 (Police)", text:"If safe to do so. Whisper your location. Leave phone on even if you can't talk." },
      { num:4, icon:"🤫", title:"Stay Quiet", text:"Silence notifications. Do not reveal your location. Stay out of sight." },
      { num:5, icon:"⚔", title:"Fight as Last Resort", text:"If confronted, act aggressively, yell, use anything available. Commit fully." },
      { num:6, icon:"📝", title:"Note Details", text:"Remember appearance, vehicle, direction of travel — for police report." },
    ],
    quickTips: ["RUN → HIDE → TELL — in that priority order","Do not use social media during active threat","Trust your instincts"],
    doNot: ["Do not confront unless no option","Do not post location on social media","Do not assume it's over until police confirm"],
  },
  Breakdown: {
    icon: "🔧",
    title: "Vehicle Breakdown — Safe Protocol",
    steps: [
      { num:1, icon:"🚗", title:"Move to Safety", text:"Slowly move to shoulder/left side. Avoid stopping on bends or hills." },
      { num:2, icon:"⚠", title:"Hazard Lights On", text:"Immediately activate hazard lights. Place warning triangles 50m behind." },
      { num:3, icon:"🚶", title:"Exit Safely", text:"All passengers exit from passenger side (away from traffic). Move behind barrier if available." },
      { num:4, icon:"📞", title:"Call for Help", text:"Report emergency on this app. Also call roadside assistance if available." },
      { num:5, icon:"🔦", title:"Be Visible", text:"If night, use torch. Wear bright clothing if available. Stay visible to traffic." },
      { num:6, icon:"🚫", title:"Do Not Stand Near Traffic", text:"Stay well off road behind barrier. Do not attempt repairs on busy roads." },
    ],
    quickTips: ["Never stand between vehicles on highway","Keep warning triangles in car always","Note road/highway name and km marker"],
    doNot: ["Do not stay in vehicle on highway","Do not attempt risky repairs in traffic","Do not accept lifts from strangers"],
  },
};

// Keyword → guide mapping (for follow-up Q&A)
const KEYWORD_MAP = [
  { keys:["cpr","chest compression","resuscit"],       guide:"CPR" },
  { keys:["fire","burning","flame","smoke"],            guide:"Fire" },
  { keys:["gas","leak","smell gas","fumes"],            guide:"Gas Leak" },
  { keys:["flood","water","drowning"],                  guide:"Flood" },
  { keys:["accident","crash","collision","road"],       guide:"Accident" },
  { keys:["crime","robbery","attack","threat"],         guide:"Crime" },
  { keys:["breakdown","car stopped","tyre","vehicle"],  guide:"Breakdown" },
  { keys:["heart","cardiac","unconscious","breathing"], guide:"CPR" },
  { keys:["bleed","wound","blood","cut","injury"],      guide:"Medical" },
  { keys:["medical","faint","pain","sick","unconscious"],guide:"Medical" },
];

exports.getGuide = (emergencyType) => GUIDES[emergencyType] || GUIDES.Medical;

exports.getAllGuides = () => Object.entries(GUIDES).map(([type, g]) => ({
  type, icon: g.icon, title: g.title, stepCount: g.steps.length
}));

exports.detectFromMessage = (msg) => {
  const lower = msg.toLowerCase();
  for (const { keys, guide } of KEYWORD_MAP) {
    if (keys.some(k => lower.includes(k))) return guide;
  }
  return null;
};

// Smart Q&A for chatbot follow-ups
exports.answerQuestion = (question, emergencyType) => {
  const q = question.toLowerCase();
  const guide = GUIDES[emergencyType] || GUIDES.Medical;

  if (q.includes("cpr") || q.includes("chest compress"))
    return { answer: GUIDES.CPR.steps.map(s => `${s.num}. ${s.title}: ${s.text}`).join("\n"), guide: "CPR" };
  if (q.includes("bleed") || q.includes("blood"))
    return { answer: "Apply firm, direct pressure with clean cloth. Maintain pressure for 10+ minutes. Do NOT remove cloth. Elevate limb above heart if possible. If blood soaks through, add more cloth on top.", guide: null };
  if (q.includes("shock") || q.includes("unconscious"))
    return { answer: "Lay person flat on back. Raise legs 30cm unless head/neck injury. Keep warm with blanket. Do not give water. Monitor breathing every 2 minutes.", guide: null };
  if (q.includes("burn") || q.includes("scald"))
    return { answer: "Cool burn under cool running water for 20 minutes minimum. Do NOT use ice, butter, or toothpaste. Cover with clean cling film. Do not pop blisters.", guide: null };
  if (q.includes("chok") || q.includes("airway"))
    return { answer: "For choking adult: 5 back blows between shoulder blades. Then 5 abdominal thrusts (Heimlich). If unconscious, call 112 and begin CPR.", guide: null };

  // Return relevant guide step
  return { answer: `Here's what to do for ${emergencyType}:\n\n${guide.steps.slice(0,4).map(s=>`${s.num}. **${s.title}**: ${s.text}`).join("\n\n")}\n\nType a specific question for more detail.`, guide: emergencyType };
};

module.exports.GUIDES = GUIDES;
