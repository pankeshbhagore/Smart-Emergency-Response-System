/**
 * INCIDENT INTELLIGENCE ENGINE v16
 * ════════════════════════════════════════════════════════
 * Advanced ML + AI services:
 *  1. Severity score (multi-factor)
 *  2. AI recommendation (actionable per incident type)
 *  3. Resource pre-positioning recommendation
 *  4. Escalation trigger detection
 *  5. Pattern correlation (repeat location)
 *  6. Response time prediction
 */

const SEVERITY_WEIGHTS = {
  type:     { Fire:90, Accident:80, "Gas Leak":85, Medical:75, Crime:70, Flood:65, Breakdown:30, Other:40 },
  priority: { Critical:40, High:30, Medium:20, Normal:10, Low:5 },
  weather:  { Storm:20, Fog:15, Rain:10, Snow:15, Clear:0, Clouds:5 },
};

const RESPONSE_TIME_MODEL = {
  // baseline seconds by type
  Medical:180, Fire:150, Accident:200, Crime:240, Flood:300, Breakdown:480, "Gas Leak":180, Other:300,
};

// Compute weighted severity score 0–100
exports.computeSeverity = (type, priority, weatherCondition, repeatCount=0) => {
  const ts = SEVERITY_WEIGHTS.type[type]   || 50;
  const ps = SEVERITY_WEIGHTS.priority[priority] || 10;
  const ws = SEVERITY_WEIGHTS.weather[weatherCondition] || 0;
  const rs = Math.min(repeatCount * 5, 20);
  return Math.min(100, Math.round(ts*0.5 + ps*0.3 + ws*0.1 + rs*0.1));
};

// Generate AI response recommendation
exports.getRecommendation = (type, priority, weather, repeatCount=0, nearbyVehicles=[]) => {
  const parts = [];

  // Priority prefix
  if (priority === "Critical") parts.push("🚨 CRITICAL RESPONSE:");
  else if (priority === "High") parts.push("⚠️ HIGH PRIORITY:");

  // Type-specific action
  const actions = {
    Fire:      "Deploy FireTruck immediately + Ambulance standby. Clear 500m zone. Check gas lines before entry.",
    Medical:   "ALS Ambulance required. Notify nearest ER. Assess for CPR on arrival. Check patient history if available.",
    Accident:  "Ambulance + Police mandatory. DO NOT move injured. Check for fuel spill. Secure scene for evidence.",
    Crime:     "Police primary. Ambulance standby. Preserve evidence. Secure witnesses. Do not contaminate scene.",
    Flood:     "Flood Rescue boat. Evacuate 200m radius. No vehicles in submerged roads. Check for electrical hazards.",
    "Gas Leak":"HazMat FIRST. No sparks within 300m. Evacuate building. FireTruck standby for ignition risk.",
    Breakdown: "TowTruck dispatch. Set safety cones 50m behind. Check for secondary accidents. Fuel check on site.",
    Other:     "General dispatch. Assess severity on arrival. Request specialist if needed.",
  };
  parts.push(actions[type] || actions.Other);

  // Weather advisory
  if (weather?.isHazardous) {
    parts.push(`⛈ WEATHER ALERT: ${weather.condition} — Increase ETA estimate by 20%. Extra caution required.`);
  }

  // Repeat location warning
  if (repeatCount >= 5) parts.push(`🔁 HOT ZONE: ${repeatCount} incidents at this location. Root cause investigation recommended.`);
  else if (repeatCount >= 3) parts.push(`⚡ Repeat location (${repeatCount}x) — pre-position unit nearby after resolution.`);

  // Vehicle availability advisory
  const available = nearbyVehicles.filter(v => v.status === "Available").length;
  if (available === 0) parts.push("❌ NO AVAILABLE VEHICLES — request mutual aid or off-duty recall immediately.");
  else if (available <= 1) parts.push("⚠️ Only 1 unit available — consider mutual aid for backup.");

  return parts.join(" ");
};

// Predict expected response time in seconds
exports.predictResponseTime = (type, priority, distanceKm, weatherCondition, hour) => {
  let base = RESPONSE_TIME_MODEL[type] || 300;
  const priorityMult = { Critical:0.7, High:0.85, Medium:1.0, Normal:1.15, Low:1.3 };
  const weatherMult  = { Storm:1.3, Fog:1.2, Rain:1.1, Clear:1.0, Clouds:1.05, Snow:1.4 };
  const trafficMult  = (hour>=8&&hour<=10)||(hour>=17&&hour<=20) ? 1.35 : hour>=21||hour<=5 ? 0.8 : 1.0;

  const travelSecs   = Math.round((distanceKm / 60) * 3600); // 60km/h average
  const predicted    = Math.round((base + travelSecs) * (priorityMult[priority]||1.0) * (weatherMult[weatherCondition]||1.0) * trafficMult);
  return Math.max(60, predicted);
};

// Detect if this incident should trigger multi-agency
exports.shouldEscalate = (type, priority, repeatCount, nearbyActiveCount) => {
  if (priority === "Critical" && type === "Fire")    return { escalate:true, reason:"Critical fire — multi-agency required" };
  if (type === "Gas Leak")                           return { escalate:true, reason:"Gas leak — HazMat + Fire + Medical needed" };
  if (type === "Flood" && priority !== "Low")        return { escalate:true, reason:"Flood — Rescue + Medical + Police needed" };
  if (nearbyActiveCount >= 3)                        return { escalate:true, reason:`Mass incident — ${nearbyActiveCount} concurrent emergencies in area` };
  if (repeatCount >= 5 && priority === "Critical")   return { escalate:true, reason:"Critical repeat-location incident" };
  return { escalate:false };
};

// Generate pre-positioning recommendation
exports.getPrePositioningAdvice = (predictions) => {
  return predictions
    .filter(p => p.probability >= 40 && p.alertNow)
    .map(p => ({
      lat: p.lat, lng: p.lng,
      advice: `Move ${p.predictedEmergency.replace("_"," ")} unit near ${p.lat.toFixed(3)},${p.lng.toFixed(3)}. Peak: ${p.peakHour}:00. Historical: ${p.historicalCases} cases.`,
      vehicleType: p.predictedEmergency,
      probability: p.probability,
      urgency: p.probability >= 70 ? "HIGH" : "MEDIUM",
    }));
};
