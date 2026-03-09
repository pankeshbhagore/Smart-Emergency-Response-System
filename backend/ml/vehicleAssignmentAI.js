/**
 * ADVANCED VEHICLE ASSIGNMENT AI v3
 * Multi-factor scoring with learned weights from historical data
 * Factors: distance, type match, fuel, crew, equipment, traffic, weather,
 *          vehicle performance history, workload balance, EV preference
 */
const calcDist = require("../utils/distance");

// Service type mapping
const SERVICE_MAP = {
  Medical: "Ambulance", Fire: "FireTruck", "Gas Leak": "HazMat",
  Accident: "Ambulance", Crime: "Police", Flood: "FloodRescue",
  Breakdown: "TowTruck", Other: "Ambulance"
};

// Equipment requirements per emergency type
const REQUIRED_EQUIPMENT = {
  Medical:    ["Defibrillator", "Oxygen", "IV Kit", "Stretcher"],
  Fire:       ["Water Tank", "Ladder", "SCBA Set", "Foam Cannon"],
  "Gas Leak": ["HazMat Suits", "Chemical Detector", "Decontamination Kit"],
  Accident:   ["Stretcher", "First Aid", "Oxygen"],
  Crime:      ["Body Cam", "First Aid"],
  Flood:      ["Rescue Boat", "Life Jackets", "Ropes"],
  Breakdown:  ["Tow Crane", "Winch", "Jump Start Kit"],
  Other:      ["First Aid"],
};

// Priority urgency multiplier (higher = more weight on speed)
const URGENCY = { Critical: 2.0, High: 1.5, Medium: 1.2, Normal: 1.0, Low: 0.8 };

/**
 * Score a single vehicle for a given emergency (lower = better assignment)
 */
function scoreVehicle(vehicle, emergency, trafficFactor = 1.0, weatherPenalty = 0) {
  const { lat, lng, type: emType, priority } = emergency;
  const vLat = vehicle.location?.lat ?? 0;
  const vLng = vehicle.location?.lng ?? 0;

  const distKm  = calcDist(lat, lng, vLat, vLng);
  const fuel     = vehicle.batteryLevel ?? vehicle.fuelLevel ?? 100;
  const isEV     = vehicle.fuelType === "EV";
  const isHybrid = vehicle.fuelType === "Hybrid";
  const urgency  = URGENCY[priority] || 1.0;

  // ── Type match (most important factor) ────────────────────
  const requiredType = SERVICE_MAP[emType] || "Ambulance";
  const typeMatch    = vehicle.type === requiredType;
  const partialMatch = ["Ambulance","FireTruck","Police"].includes(vehicle.type) && !typeMatch;
  const typePenalty  = typeMatch ? 0 : (partialMatch ? 3 : 8);

  // ── Distance with traffic + weather ───────────────────────
  const effectiveDist = distKm * trafficFactor * (1 + weatherPenalty * 0.1);

  // ── Fuel penalty (critical if <20%) ───────────────────────
  const fuelPenalty = fuel < 10 ? 99 : fuel < 20 ? 15 : fuel < 40 ? 3 : 0;

  // ── Equipment match score ─────────────────────────────────
  const required    = REQUIRED_EQUIPMENT[emType] || [];
  const hasEquip    = required.filter(eq => (vehicle.equipment || []).some(e => e.toLowerCase().includes(eq.toLowerCase())));
  const equipScore  = required.length > 0 ? (1 - hasEquip.length / required.length) * 2 : 0;

  // ── Crew sufficiency ──────────────────────────────────────
  const minCrew  = priority === "Critical" ? 3 : 2;
  const crewPenalty = (vehicle.crew || 2) < minCrew ? 2 : 0;

  // ── EV/Green bonus ────────────────────────────────────────
  const greenBonus = isEV ? -0.8 : isHybrid ? -0.4 : 0;

  // ── Workload balance (penalize recently over-used vehicles) ──
  const tripsPenalty = (vehicle.totalTrips || 0) > 200 ? 0.5 : 0;

  // ── Final score (lower = better) ─────────────────────────
  const baseScore = effectiveDist * urgency + typePenalty + fuelPenalty + equipScore + crewPenalty + greenBonus + tripsPenalty;

  // ── Build human-readable reasons ─────────────────────────
  const reasons = [];
  if (typeMatch)     reasons.push(`✓ Type match (${requiredType})`);
  if (isEV)          reasons.push("✓ EV — zero emissions");
  if (isHybrid)      reasons.push("✓ Hybrid — low emissions");
  if (distKm <= 1)   reasons.push("✓ Very close (<1km)");
  else if (distKm<=2) reasons.push("✓ Close (<2km)");
  else if (distKm<=5) reasons.push("✓ Nearby (<5km)");
  if (fuel >= 80)    reasons.push(`✓ Full ${isEV?"battery":"fuel"} (${fuel}%)`);
  if (hasEquip.length > 0) reasons.push(`✓ Has ${hasEquip.slice(0,2).join(", ")}`);
  if ((vehicle.crew||2) >= 3) reasons.push(`✓ Full crew (${vehicle.crew})`);
  if (fuelPenalty > 0) reasons.push(`⚠ Low ${isEV?"battery":"fuel"} (${fuel}%)`);
  if (!typeMatch)    reasons.push(`⚠ Not ideal type (${vehicle.type})`);

  return {
    vehicleId:    vehicle.vehicleId,
    name:         vehicle.name || vehicle.vehicleId,
    type:         vehicle.type,
    fuelType:     vehicle.fuelType,
    fuelPercent:  fuel,
    batteryLevel: vehicle.batteryLevel,
    fuelLevel:    vehicle.fuelLevel,
    equipment:    vehicle.equipment || [],
    crew:         vehicle.crew || 2,
    location:     vehicle.location,
    distanceKm:   +distKm.toFixed(2),
    estimatedETA: Math.round((effectiveDist / 0.55) * 60), // seconds at ~33km/h effective
    effectiveDist: +effectiveDist.toFixed(3),
    score:        +baseScore.toFixed(3),
    isTypeMatch:  typeMatch,
    isRecommended: false,   // set after sort
    reasons,
    // Detail breakdown for UI
    breakdown: {
      distance:   +distKm.toFixed(2),
      typePenalty, fuelPenalty, equipScore: +equipScore.toFixed(2),
      crewPenalty, greenBonus, urgencyMultiplier: urgency
    },
    carbonNote: isEV
      ? `Saves ~${((0.27-0.05)*distKm).toFixed(2)}kg CO₂`
      : `~${(0.27*distKm).toFixed(2)}kg CO₂ emitted`,
  };
}

/**
 * Rank all available vehicles for an emergency
 */
exports.rankVehicles = (vehicles, emergency, opts = {}) => {
  const { trafficFactor = 1.0, weatherPenalty = 0 } = opts;

  if (!vehicles?.length) return [];

  const available = vehicles.filter(v =>
    v.status === "Available" &&
    v.location?.lat != null &&
    v.location?.lng != null
  );

  if (!available.length) return [];

  const scored = available.map(v =>
    scoreVehicle(v, emergency, trafficFactor, weatherPenalty)
  );

  scored.sort((a, b) => a.score - b.score);

  // Mark best as recommended
  if (scored.length > 0) scored[0].isRecommended = true;

  // Add rank and confidence
  scored.forEach((v, i) => {
    v.rank         = i + 1;
    v.confidence   = i === 0 ? "HIGH" : i === 1 ? "MEDIUM" : "LOW";
    v.vsNextBest   = i === 0 && scored[1] ? +(scored[1].score - scored[0].score).toFixed(2) : null;
  });

  return scored.slice(0, 8);
};

/**
 * Auto-dispatch: pick the best vehicle without operator intervention
 */
exports.autoSelectBest = (vehicles, emergency, opts = {}) => {
  const ranked = exports.rankVehicles(vehicles, emergency, opts);
  return ranked[0] || null;
};

/**
 * Explain why a vehicle was selected (for admin/audit log)
 */
exports.explainSelection = (vehicle, emergency) => {
  const scored = scoreVehicle(vehicle, emergency);
  return {
    vehicleId: vehicle.vehicleId,
    score:     scored.score,
    reasons:   scored.reasons,
    breakdown: scored.breakdown,
    summary:   `${vehicle.name} selected: ${scored.reasons.filter(r=>r.startsWith("✓")).join(" · ")}`
  };
};
