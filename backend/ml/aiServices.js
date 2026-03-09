/**
 * AI SERVICES ENGINE v17 — 15 New AI/ML Services
 * ════════════════════════════════════════════════════════════
 * 1.  Crowd Density Estimator
 * 2.  Resource Fatigue Detector (crew overwork)
 * 3.  Incident Chain Predictor (co-occurring emergencies)
 * 4.  Golden Hour Alert (medical time-critical)
 * 5.  Evacuation Zone Calculator
 * 6.  Carbon Footprint Optimizer
 * 7.  Shift Performance Scorer (operator performance)
 * 8.  First Responder Route Safety (road risk)
 * 9.  Mass Casualty Predictor
 * 10. Weather Impact Forecaster
 * 11. Auto-Alert Generator (AI generates community alerts)
 * 12. Vehicle Health Monitor (predictive maintenance)
 * 13. Incident Recurrence Predictor
 * 14. Response Time SLA Optimizer
 * 15. City-Wide Risk Index (composite score)
 */

// ── 1. Crowd Density Estimator ─────────────────────────────
exports.estimateCrowdDensity = (lat, lng, hour, dayOfWeek, emergencyType) => {
  const PEAK_HOURS   = { 0:[8,9,17,18,19], 1:[7,8,16,17,18,19,20], 2:[8,9,12,13,17,18,19] };
  const MARKET_DAYS  = [0,3,6]; // Sun/Wed/Sat high market activity
  const highCrowd    = PEAK_HOURS[dayOfWeek % 3]?.includes(hour) || MARKET_DAYS.includes(dayOfWeek);
  const density      = highCrowd ? "High" : (hour>=22||hour<=5) ? "Low" : "Medium";
  const multiplier   = density==="High" ? 2.5 : density==="Medium" ? 1.2 : 0.6;
  const evacNeeded   = ["Fire","Gas Leak","Flood"].includes(emergencyType) && density==="High";
  return { density, multiplier, evacuationNeeded:evacNeeded, peakHour:hour, advice:
    density==="High" ? "High crowd density — deploy crowd control + extra medical units"
    : density==="Low" ? "Low activity — standard single unit sufficient"
    : "Moderate density — standard protocol applies"
  };
};

// ── 2. Resource Fatigue Detector ───────────────────────────
exports.detectFatigue = (vehicles, emergencies) => {
  const alerts = [];
  vehicles.forEach(v => {
    const trips    = v.totalTrips || 0;
    const lastMaint= v.lastMaintenance ? Date.now()-new Date(v.lastMaintenance) : Infinity;
    const daysNoMaint = Math.round(lastMaint/86400000);
    if (trips > 150) alerts.push({ vehicleId:v.vehicleId, type:"high_usage", severity:"HIGH", message:`${v.vehicleId} has ${trips} trips — overworked, rotate out`, recommendation:"Schedule maintenance and crew rest" });
    else if (trips > 80) alerts.push({ vehicleId:v.vehicleId, type:"moderate_usage", severity:"MEDIUM", message:`${v.vehicleId} at ${trips} trips — approaching limit`, recommendation:"Monitor — maintenance due soon" });
    if (daysNoMaint > 90) alerts.push({ vehicleId:v.vehicleId, type:"maintenance_overdue", severity:"CRITICAL", message:`${v.vehicleId} — ${daysNoMaint} days since last maintenance`, recommendation:"Remove from service for immediate inspection" });
    const fuel = v.batteryLevel??v.fuelLevel??100;
    if (fuel < 15) alerts.push({ vehicleId:v.vehicleId, type:"low_fuel", severity:"HIGH", message:`${v.vehicleId} — only ${fuel}% fuel remaining`, recommendation:"Return to station immediately for refuel" });
  });
  return { alerts, count:alerts.length, critical:alerts.filter(a=>a.severity==="CRITICAL").length };
};

// ── 3. Incident Chain Predictor ────────────────────────────
const CHAIN_EVENTS = {
  Fire:      [{ type:"Medical",   prob:85, delay:"5-20 min",  reason:"Burns/smoke inhalation casualties" },
              { type:"Breakdown", prob:30, delay:"10-30 min", reason:"Vehicles blocking fire trucks" }],
  Accident:  [{ type:"Crime",     prob:25, delay:"15-45 min", reason:"Road rage escalation" },
              { type:"Medical",   prob:70, delay:"0-10 min",  reason:"Injuries need ambulance" }],
  Flood:     [{ type:"Medical",   prob:60, delay:"30-60 min", reason:"Drowning/hypothermia" },
              { type:"Breakdown", prob:40, delay:"20-45 min", reason:"Water-damaged vehicles" }],
  "Gas Leak":[{ type:"Fire",      prob:65, delay:"10-30 min", reason:"Ignition risk" },
              { type:"Medical",   prob:55, delay:"0-15 min",  reason:"Gas exposure symptoms" }],
  Crime:     [{ type:"Medical",   prob:45, delay:"5-20 min",  reason:"Violence injuries" }],
};

exports.predictChainEvents = (emergencyType, location) => {
  const chains = CHAIN_EVENTS[emergencyType] || [];
  return chains.map(c => ({
    ...c, location,
    action: `Pre-alert ${c.type} unit. Probability ${c.prob}% within ${c.delay}.`
  }));
};

// ── 4. Golden Hour Alert ───────────────────────────────────
exports.checkGoldenHour = (emergency, currentTime = new Date()) => {
  if (!["Medical","Accident"].includes(emergency.type)) return { applicable:false };
  const elapsedMins = Math.round((currentTime - new Date(emergency.createdAt)) / 60000);
  const goldenMinutes = emergency.priority === "Critical" ? 10 : 60;
  const remaining = goldenMinutes - elapsedMins;
  return {
    applicable:  true,
    elapsedMins, remaining: Math.max(0, remaining),
    status:      remaining > 20 ? "OK" : remaining > 5 ? "WARNING" : remaining <= 0 ? "CRITICAL" : "URGENT",
    message:     remaining <= 0
      ? `⚠️ GOLDEN HOUR EXCEEDED — patient outcome risk HIGH`
      : remaining <= 5 ? `🚨 ONLY ${remaining} min left in golden window — RUSH`
      : `⏱ ${remaining} min remaining in golden window`,
    urgencyLevel: remaining <= 0 ? 5 : remaining <= 5 ? 4 : remaining <= 15 ? 3 : remaining <= 30 ? 2 : 1
  };
};

// ── 5. Evacuation Zone Calculator ─────────────────────────
exports.calculateEvacuationZone = (lat, lng, emergencyType, priority) => {
  const RADII = {
    Fire:      { Critical:800, High:500, Medium:300, Normal:200, Low:100 },
    "Gas Leak":{ Critical:1000,High:600, Medium:400, Normal:250, Low:150 },
    Flood:     { Critical:1200,High:800, Medium:500, Normal:300, Low:200 },
    Accident:  { Critical:200, High:100, Medium:50,  Normal:30,  Low:20 },
  };
  const radiusM = RADII[emergencyType]?.[priority] || 100;
  const popEstimate = Math.round((Math.PI * (radiusM/1000)**2) * 4500); // ~4500 ppl/km²
  return {
    center:{ lat, lng },
    radiusMeters: radiusM,
    radiusKm: +(radiusM/1000).toFixed(2),
    estimatedPopulation: popEstimate,
    action: `Evacuate ${radiusM}m radius. Est. ${popEstimate.toLocaleString()} people affected.`,
    urgency: priority === "Critical" ? "IMMEDIATE" : priority === "High" ? "URGENT" : "ADVISORY",
    zones: [
      { label:"Danger Zone (no entry)", radius:Math.round(radiusM*0.3), color:"#FF0000" },
      { label:"Evacuation Zone",        radius:Math.round(radiusM*0.6), color:"#FF8800" },
      { label:"Warning Zone",           radius:radiusM,                 color:"#FFCC00" },
    ]
  };
};

// ── 6. Carbon Footprint Optimizer ─────────────────────────
exports.optimizeCarbonFootprint = (vehicles, emergencyType) => {
  const ev     = vehicles.filter(v=>v.fuelType==="EV"&&v.status==="Available");
  const hybrid = vehicles.filter(v=>v.fuelType==="Hybrid"&&v.status==="Available");
  const diesel = vehicles.filter(v=>v.fuelType==="Diesel"&&v.status==="Available");

  const EMISSION_RATE = { EV:0.05, Hybrid:0.14, Diesel:0.27, Petrol:0.25 };
  const totalAvail = vehicles.filter(v=>v.status==="Available").length;
  const avgEmission = totalAvail > 0
    ? vehicles.filter(v=>v.status==="Available").reduce((s,v)=>s+(EMISSION_RATE[v.fuelType]||0.27),0)/totalAvail : 0;

  return {
    evCount:     ev.length,
    hybridCount: hybrid.length,
    dieselCount: diesel.length,
    preferEV:    ev.length > 0,
    preferHybrid:hybrid.length > 0 && ev.length === 0,
    avgEmissionRate: +avgEmission.toFixed(3),
    greenScore:  Math.round(100-(avgEmission/0.27)*100),
    recommendation: ev.length > 0
      ? `✅ Use EV unit — saves ~${((0.27-0.05)*5).toFixed(2)}kg CO₂ per 5km trip`
      : hybrid.length > 0 ? `🌿 Use Hybrid unit — 48% lower emissions than diesel`
      : `⚠️ No green vehicles available — log request for EV procurement`,
    carbonPerTrip5km: +(avgEmission*5).toFixed(3)
  };
};

// ── 7. Shift Performance Scorer ────────────────────────────
exports.scoreShiftPerformance = (emergencies, shiftHours=[8,20]) => {
  const now = new Date();
  const shiftStart = new Date(); shiftStart.setHours(shiftHours[0],0,0,0);
  const shiftEmergencies = emergencies.filter(e=>new Date(e.createdAt)>=shiftStart);
  const resolved   = shiftEmergencies.filter(e=>e.status==="Resolved");
  const responseTimes = resolved.filter(e=>e.responseTime>0).map(e=>e.responseTime);
  const avgRT      = responseTimes.length ? Math.round(responseTimes.reduce((a,b)=>a+b,0)/responseTimes.length) : null;
  const slaBreaches= shiftEmergencies.filter(e=>e.sla?.breached).length;
  const score = Math.min(100, Math.max(0, Math.round(
    100 - (slaBreaches*10) - (avgRT? Math.max(0,(avgRT-180)/6) :0) + (resolved.length*2)
  )));
  return {
    score, grade: score>=90?"A":score>=75?"B":score>=60?"C":"D",
    totalIncidents:    shiftEmergencies.length,
    resolved:          resolved.length,
    avgResponseTimeSec:avgRT,
    slaBreaches,
    pendingAtShiftEnd: shiftEmergencies.filter(e=>!["Resolved","Cancelled"].includes(e.status)).length,
    message: score>=90?"Excellent shift performance"
      : score>=75 ? "Good performance — minor improvements needed"
      : score>=60 ? "Average — review SLA misses"
      : "Below target — review response protocols"
  };
};

// ── 8. First Responder Route Safety ───────────────────────
exports.assessRouteSafety = (coords, weatherCondition, hour) => {
  const hazards = [];
  const nightHrs = hour>=22||hour<=5;
  const peakHrs  = (hour>=8&&hour<=10)||(hour>=17&&hour<=20);
  if (nightHrs)   hazards.push({ type:"visibility",    risk:"Medium", action:"Use full lights + siren. Reduced civilian awareness." });
  if (peakHrs)    hazards.push({ type:"traffic",       risk:"High",   action:"Allow +20% ETA. Signal override at all intersections." });
  if (["Storm","Rain","Fog","Snow"].includes(weatherCondition))
    hazards.push({ type:"weather",      risk:"High",   action:"Reduce speed by 25%. Extra braking distance." });
  const riskScore = hazards.reduce((s,h)=>s+(h.risk==="High"?25:10),0);
  return { hazards, riskScore: Math.min(100, riskScore), safe: riskScore < 30,
    recommendation: riskScore >= 50 ? "CAUTION: High-risk route conditions" : riskScore >= 30 ? "MODERATE: Take standard precautions" : "CLEAR: Normal response protocol" };
};

// ── 9. Mass Casualty Predictor ─────────────────────────────
exports.predictMassCasualty = (emergencyType, priority, crowdDensity, weatherCondition) => {
  const HIGH_MCI_TYPES = ["Fire","Accident","Flood","Gas Leak"];
  const baseMCI = HIGH_MCI_TYPES.includes(emergencyType) ? 0.4 : 0.1;
  const densityMult = { High:2.5, Medium:1.5, Low:0.8 }[crowdDensity] || 1;
  const weatherMult = ["Storm","Flood","Snow"].includes(weatherCondition) ? 1.8 : 1;
  const priMult    = { Critical:2, High:1.5, Medium:1, Normal:0.8, Low:0.5 }[priority] || 1;
  const probability= Math.min(95, Math.round(baseMCI*densityMult*weatherMult*priMult*100));
  const estCasualties= Math.round(probability/10 * (crowdDensity==="High"?8:crowdDensity==="Medium"?4:2));
  return {
    probability, estimatedCasualties: estCasualties,
    mciLevel: probability>=70?"Level 3 (Major)":probability>=40?"Level 2 (Multiple)":"Level 1 (Minor)",
    resourcesNeeded: estCasualties >= 10 ? ["3x Ambulance","Field Hospital","Blood Bank"]
      : estCasualties >= 5 ? ["2x Ambulance","Medical Team"] : ["1x Ambulance"],
    activateMCI: probability >= 60,
    message: probability>=70 ? "🚨 MASS CASUALTY INCIDENT LIKELY — activate MCI protocol"
      : probability>=40 ? "⚠️ Multiple casualties probable — pre-alert hospitals"
      : "Standard response sufficient"
  };
};

// ── 10. Weather Impact Forecaster ─────────────────────────
exports.forecastWeatherImpact = (weatherCondition, temperature, windSpeed, forecast=[]) => {
  const IMPACTS = {
    Storm:     { fireRisk:0.2, medicalRisk:0.7, floodRisk:0.9, accidentRisk:0.8, etaMultiplier:1.4 },
    Fog:       { fireRisk:0.1, medicalRisk:0.3, floodRisk:0.1, accidentRisk:0.7, etaMultiplier:1.25 },
    Rain:      { fireRisk:0.1, medicalRisk:0.4, floodRisk:0.5, accidentRisk:0.6, etaMultiplier:1.15 },
    Snow:      { fireRisk:0.1, medicalRisk:0.6, floodRisk:0.2, accidentRisk:0.7, etaMultiplier:1.5 },
    Clear:     { fireRisk:0.3, medicalRisk:0.2, floodRisk:0.0, accidentRisk:0.2, etaMultiplier:1.0 },
    Clouds:    { fireRisk:0.2, medicalRisk:0.2, floodRisk:0.1, accidentRisk:0.3, etaMultiplier:1.05 },
    "Violent Rain":{ fireRisk:0.05,medicalRisk:0.8,floodRisk:0.95,accidentRisk:0.85,etaMultiplier:1.6 },
  };
  const impact = IMPACTS[weatherCondition] || IMPACTS.Clear;
  const heatStress = temperature >= 40;
  const coldStress = temperature <= 5;
  const highWind   = windSpeed >= 50;
  return {
    ...impact,
    heatStress, coldStress, highWind,
    alerts: [
      ...(impact.floodRisk > 0.7  ? ["Flood risk HIGH — pre-position rescue boats"] : []),
      ...(impact.accidentRisk>0.6  ? ["Accident risk elevated — increase patrol"] : []),
      ...(heatStress               ? ["Extreme heat — medical unit on standby for heat stroke"] : []),
      ...(coldStress               ? ["Cold stress — hypothermia risk for outdoor incidents"] : []),
      ...(highWind                 ? ["High winds — aerial equipment unsafe, use ground units"] : []),
    ],
    recommendation: `ETA increased by ${Math.round((impact.etaMultiplier-1)*100)}% due to ${weatherCondition}.`
  };
};

// ── 11. Auto-Alert Generator ───────────────────────────────
exports.generateAutoAlerts = (emergencies, predictions, weather) => {
  const alerts = [];
  const now    = new Date();

  // Alert: surge
  const lastHour = emergencies.filter(e=>now-new Date(e.createdAt)<3600000).length;
  if (lastHour >= 4) alerts.push({
    type:"Surge",
    title:`Emergency Surge — ${lastHour} incidents in last hour`,
    message:`Unusual activity surge detected. ${lastHour} incidents reported. All units on high alert. Avoid non-essential travel.`,
    severity:"High", instructions:["Stay home if possible","Keep 112 on speed dial","Report suspicious activity"],
    autoGenerated:true, trigger:"surge"
  });

  // Alert: critical unattended
  const criticalPending = emergencies.filter(e=>e.priority==="Critical"&&e.status==="Reported"&&now-new Date(e.createdAt)>300000);
  if (criticalPending.length > 0) alerts.push({
    type:"Critical",
    title:`${criticalPending.length} Critical Emergency Awaiting Response`,
    message:`Critical emergency at ${criticalPending[0]?.location?.address||"unknown location"} has been pending for over 5 minutes. Area residents exercise caution.`,
    severity:"Critical", instructions:["Keep area clear for emergency vehicles","Do not block roads"],
    autoGenerated:true, trigger:"critical_unattended"
  });

  // Alert: high-risk prediction zones
  const urgentZones = predictions.filter(p=>p.alertNow && p.probability>=60);
  if (urgentZones.length > 0) alerts.push({
    type:"Prediction",
    title:`AI Alert — High Risk Zone Active (${urgentZones[0].predictedEmergency})`,
    message:`ML model predicts high probability (${urgentZones[0].probability}%) of ${urgentZones[0].predictedEmergency} incident in area. Officers advised to increase patrol.`,
    severity:"Medium", instructions:["Increased patrol in high-risk areas","Report suspicious activity","Emergency services on standby"],
    autoGenerated:true, trigger:"ml_prediction"
  });

  // Alert: hazardous weather
  if (weather?.isHazardous) alerts.push({
    type:"Weather",
    title:`Hazardous Weather — ${weather.condition}`,
    message:`Dangerous weather conditions (${weather.condition}, ${weather.temperature}°C, ${weather.windSpeed}km/h wind). Response times may be affected.`,
    severity:"Medium", instructions:["Avoid unnecessary travel","Report road hazards","Keep emergency numbers ready"],
    autoGenerated:true, trigger:"hazardous_weather"
  });

  return alerts;
};

// ── 12. Vehicle Health Monitor ─────────────────────────────
exports.monitorVehicleHealth = (vehicle) => {
  const checks = [];
  const fuel   = vehicle.batteryLevel ?? vehicle.fuelLevel ?? 100;
  const trips  = vehicle.totalTrips || 0;
  const distKm = vehicle.totalDistanceKm || 0;
  const daysOld= vehicle.lastMaintenance ? Math.round((Date.now()-new Date(vehicle.lastMaintenance))/86400000) : 999;

  if (fuel < 20)           checks.push({ system:"Fuel/Battery",   status:"CRITICAL", detail:`${fuel}% — below safe operational threshold` });
  else if (fuel < 40)      checks.push({ system:"Fuel/Battery",   status:"WARNING",  detail:`${fuel}% — plan refuel soon` });
  if (daysOld > 90)        checks.push({ system:"Maintenance",     status:"CRITICAL", detail:`${daysOld} days overdue` });
  else if (daysOld > 60)   checks.push({ system:"Maintenance",     status:"WARNING",  detail:`${daysOld} days — schedule soon` });
  if (trips > 180)         checks.push({ system:"Crew Fatigue",    status:"WARNING",  detail:`${trips} trips — crew rest recommended` });
  if (distKm > 40000)      checks.push({ system:"Engine Wear",     status:"WARNING",  detail:`${distKm.toFixed(0)}km — approaching major service` });

  const overallHealth = checks.filter(c=>c.status==="CRITICAL").length > 0 ? "CRITICAL"
    : checks.filter(c=>c.status==="WARNING").length > 0 ? "WARNING" : "OK";

  return {
    vehicleId: vehicle.vehicleId,
    overallHealth,
    checks,
    healthScore: Math.max(0, 100 - checks.length*20),
    readyForDeployment: overallHealth !== "CRITICAL",
    nextMaintenanceDue: daysOld > 60 ? "OVERDUE" : `${Math.max(0,90-daysOld)} days`
  };
};

// ── 13. Incident Recurrence Predictor ─────────────────────
exports.predictRecurrence = (emergencies, lat, lng, type, radiusKm=0.5) => {
  const nearby = emergencies.filter(e => {
    const calcD = (a,b,c,d)=>{const R=6371,dL=(d-b)*Math.PI/180,r1=a*Math.PI/180,r2=c*Math.PI/180;return R*2*Math.atan2(Math.sqrt(Math.sin(dL/2)**2+Math.cos(r1)*Math.cos(r2)*Math.sin((d-b)*Math.PI/180/2)**2),Math.sqrt(1-Math.sin(dL/2)**2-Math.cos(r1)*Math.cos(r2)*Math.sin((d-b)*Math.PI/180/2)**2));};
    if (!e.location?.lat||!e.location?.lng) return false;
    return e.type===type && calcD(lat,lng,e.location.lat,e.location.lng)<radiusKm;
  });
  const recentCount = nearby.filter(e=>Date.now()-new Date(e.createdAt)<7*86400000).length;
  const probability = Math.min(95, nearby.length*15 + recentCount*20);
  return {
    nearbyCount: nearby.length, recentCount, probability,
    riskLevel: probability>=60?"High":probability>=30?"Medium":"Low",
    avgInterval: nearby.length>=2 ? Math.round((Date.now()-new Date(nearby[nearby.length-1].createdAt))/(nearby.length*3600000)) + " hrs" : "Insufficient data",
    message: probability>=60 ? `⚡ High recurrence risk — ${nearby.length} past incidents within ${radiusKm}km` : probability>=30 ? `⚠️ Moderate recurrence — monitor area` : "No significant recurrence pattern",
    action: probability>=60 ? "Pre-position unit in this zone" : "Standard monitoring"
  };
};

// ── 14. Response Time SLA Optimizer ───────────────────────
exports.optimizeSLATargets = (emergencies) => {
  const byType = {};
  emergencies.filter(e=>e.responseTime>0&&e.status==="Resolved").forEach(e=>{
    if (!byType[e.type]) byType[e.type]={ times:[], breaches:0 };
    byType[e.type].times.push(e.responseTime);
    if (e.sla?.breached) byType[e.type].breaches++;
  });
  const recommendations = Object.entries(byType).map(([type,data])=>{
    const avg = Math.round(data.times.reduce((a,b)=>a+b,0)/data.times.length);
    const p90 = data.times.sort((a,b)=>a-b)[Math.floor(data.times.length*0.9)] || avg;
    const breachRate = data.times.length ? Math.round(data.breaches/data.times.length*100) : 0;
    return {
      type, sampleSize:data.times.length, avgResponseSec:avg, p90ResponseSec:p90,
      currentBreachRate: breachRate,
      suggestedSLA: Math.round(p90*1.1),
      action: breachRate>30 ? "SLA too strict — increase target or add vehicles" : breachRate<5 ? "SLA easily met — can tighten standard" : "SLA appropriate — maintain"
    };
  });
  return { recommendations, analyzed:Object.keys(byType).length };
};

// ── 15. City-Wide Risk Index ───────────────────────────────
exports.computeCityRiskIndex = (emergencies, vehicles, weather, predictions) => {
  const now = new Date();
  const active     = emergencies.filter(e=>!["Resolved","Cancelled"].includes(e.status));
  const critical   = active.filter(e=>e.priority==="Critical").length;
  const available  = vehicles.filter(v=>v.status==="Available").length;
  const surgeCount = emergencies.filter(e=>now-new Date(e.createdAt)<3600000).length;
  const highPredictions = (predictions||[]).filter(p=>p.riskLevel==="High").length;
  const weatherRisk= weather?.isHazardous ? 25 : weather?.condition && ["Rain","Fog"].includes(weather.condition) ? 10 : 0;
  const vehicleRisk= available < 2 ? 30 : available < 4 ? 15 : 0;
  const incidentRisk=(active.length*5) + (critical*15) + (surgeCount*8);
  const predictionRisk = highPredictions * 8;
  const totalRisk  = Math.min(100, incidentRisk+weatherRisk+vehicleRisk+predictionRisk);
  return {
    score:  totalRisk,
    level:  totalRisk>=75?"CRITICAL":totalRisk>=50?"HIGH":totalRisk>=25?"ELEVATED":"NORMAL",
    color:  totalRisk>=75?"#FF0000":totalRisk>=50?"#FF8800":totalRisk>=25?"#FFCC00":"#00C853",
    breakdown:{ incidents:incidentRisk, weather:weatherRisk, vehicleShortage:vehicleRisk, predictions:predictionRisk },
    activeIncidents:active.length, criticalIncidents:critical,
    availableVehicles:available, surgeCount, highRiskZones:highPredictions,
    recommendation: totalRisk>=75 ? "🚨 CITY EMERGENCY — request mutual aid, brief all units"
      : totalRisk>=50 ? "⚠️ High city risk — all units on standby, review resource levels"
      : totalRisk>=25 ? "📊 Elevated risk — monitor closely, prepare for escalation"
      : "✅ Normal operations — standard protocols apply"
  };
};
