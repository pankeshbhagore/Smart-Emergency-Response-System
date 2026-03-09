/**
 * EMERGENCY CONTROLLER v16
 * ══════════════════════════════════════════════════════════
 * FIXES:
 *  - Multi-unit dispatch: assignedVehicles[] array stored in DB
 *  - emergencyDispatched emits ALL unit data for citizen to track first unit
 *  - Resolve: computes timing, frees ALL assigned vehicles, updates citizen stats
 *  - AI recommendation stored on emergency creation
 *  - Full location object passed everywhere
 */
const Emergency      = require("../models/Emergency");
const Vehicle        = require("../models/Vehicle");
const User           = require("../models/User");
const ChatSession    = require("../models/ChatSession");
const calcDistance   = require("../utils/distance");
const { getOptimizedRoute } = require("../services/routeOptimizer");
const weatherService   = require("../services/weatherService");
const geocodingService = require("../services/geocodingService");
const anomaly          = require("../ml/anomalyDetector");
const { simulate }     = require("../services/vehicleSimulator");
const vehicleAI        = require("../ml/vehicleAssignmentAI");

const PRIORITY = { Fire:"Critical", Accident:"Critical", "Gas Leak":"Critical", Medical:"High", Crime:"High", Flood:"High", Breakdown:"Low" };
const SERVICE  = { Medical:"Ambulance", Fire:"FireTruck", Accident:"Ambulance", Crime:"Police", Breakdown:"TowTruck", Flood:"FireTruck", "Gas Leak":"FireTruck" };
const co2      = (v, distM) => v.fuelType==="EV" ? +((0.27-0.05)*distM/1000).toFixed(3) : 0;

// ── AI Recommendation generator ────────────────────────────
function generateAIRecommendation(type, priority, weather, nearbyCount) {
  const recs = {
    Fire:     "Deploy FireTruck + Ambulance. Clear 500m radius. Check for gas lines.",
    Medical:  "ALS Ambulance preferred. Notify nearest hospital ER. Check allergies on arrival.",
    Accident: "Ambulance + Police. Check for fuel spill. Do NOT move injured persons.",
    Crime:    "Police primary + Ambulance standby. Secure witnesses. Preserve scene.",
    Flood:    "Flood Rescue boat. Avoid flood zones. Evacuate 200m radius if rising.",
    "Gas Leak":"HazMat first. FireTruck + Ambulance standby. No sparks within 300m.",
    Breakdown:"TowTruck. Safety cones needed. Check for injuries.",
    Other:    "General response. Assess on arrival.",
  };
  let base = recs[type] || recs.Other;
  if (weather?.isHazardous) base += ` ⚠️ Hazardous weather (${weather.condition}) — increase ETA by 20%.`;
  if (nearbyCount >= 3)     base += " ⚠️ Repeat-location incident — investigate root cause.";
  if (priority === "Critical") base = "🚨 CRITICAL — " + base;
  return base;
}

// ── CREATE ─────────────────────────────────────────────────
exports.createEmergency = async (req, res) => {
  try {
    const { type, lat, lng, description, phone } = req.body;
    if (!type || lat==null || lng==null)
      return res.status(400).json({ message:"type, lat, lng required" });
    const pLat = parseFloat(lat), pLng = parseFloat(lng);
    if (isNaN(pLat)||isNaN(pLng))
      return res.status(400).json({ message:"lat/lng must be valid numbers" });

    const priority  = PRIORITY[type] || "Normal";
    const slaTarget = anomaly.getSLATarget(priority);

    let reporterPhone = phone||"", reporterName = "";
    if (req.user?.id) {
      const user = await User.findById(req.user.id).select("name phone");
      if (user) {
        reporterName = user.name;
        if (!reporterPhone && user.phone) reporterPhone = user.phone;
      }
    }

    const [weather, location, nearbyCount] = await Promise.all([
      weatherService.getWeather(pLat, pLng).catch(()=>({ condition:"Unknown", isHazardous:false })),
      geocodingService.reverseGeocode(pLat, pLng).catch(()=>({ shortName:`${pLat},${pLng}` })),
      Emergency.countDocuments({
        "location.lat":{$gte:pLat-0.02,$lte:pLat+0.02},
        "location.lng":{$gte:pLng-0.02,$lte:pLng+0.02}
      })
    ]);

    const severityScore    = anomaly.computeSeverityScore(type, priority, weather.condition, nearbyCount);
    const aiRecommendation = generateAIRecommendation(type, priority, weather, nearbyCount);

    const mlTags = [];
    if (nearbyCount >= 3)       mlTags.push("repeat-location");
    if (weather.isHazardous)    mlTags.push("hazardous-weather");
    const h = new Date().getHours();
    if (h >= 22 || h <= 5)      mlTags.push("night-incident");
    if (priority==="Critical")  mlTags.push("critical-priority");
    if (nearbyCount === 0)      mlTags.push("new-area");

    const emergency = await Emergency.create({
      type, priority, description: description||"",
      reportedBy:       req.user?.role || "Citizen",
      reportedByUserId: req.user?.id   || null,
      reporterPhone, reporterName,
      status: "Reported",
      location: {
        lat:pLat, lng:pLng,
        address:       location.shortName   || "",
        fullAddress:   location.fullName    || "",
        road:          location.road        || "",
        neighbourhood: location.neighbourhood||"",
        suburb:        location.suburb      || "",
        area:          location.area        || "",
        city:          location.city        || "",
        district:      location.district   || "",
        state:         location.state       || "",
        postcode:      location.postcode    || "",
        displayLine1:  location.displayLine1|| "",
        displayLine2:  location.displayLine2|| "",
        zone:          location.zone || location.area || location.city || "",
      },
      weatherContext: weather,
      sla: { targetResponseTime: slaTarget },
      severityScore, mlTags, aiRecommendation,
      assignedVehicles: [],
    });

    if (req.user?.id) await User.findByIdAndUpdate(req.user.id, { $inc:{ totalEmergencies:1 } });

    const locStr = location.displayLine1 || location.shortName || `${pLat},${pLng}`;
    const io = req.app.get("io");
    io?.emit("newEmergencyAlert", {
      emergencyId:  emergency._id,
      type:         emergency.type,
      priority:     emergency.priority,
      severityScore, mlTags, aiRecommendation,
      reporterName, reporterPhone,
      location: {
        lat:pLat, lng:pLng,
        address:     location.shortName,
        road:        location.road,
        area:        location.area,
        city:        location.city,
        state:       location.state,
        displayLine1:location.displayLine1,
        displayLine2:location.displayLine2,
      },
      weather: { condition:weather.condition, temperature:weather.temperature, isHazardous:weather.isHazardous },
      reportedAt:  emergency.createdAt,
      message: `🚨 ${priority.toUpperCase()} — ${type} at ${locStr}${reporterPhone?" · 📞 "+reporterPhone:""}`,
    });

    res.status(201).json({
      message:     "Emergency reported. Operator notified.",
      emergencyId: emergency._id,
      status:      "Reported",
      severityScore, mlTags, aiRecommendation,
      location: {
        address:     location.shortName,
        road:        location.road,
        area:        location.area,
        city:        location.city,
        state:       location.state,
        displayLine1:location.displayLine1,
        displayLine2:location.displayLine2,
      },
      weather: { condition:weather.condition, temperature:weather.temperature, isHazardous:weather.isHazardous },
      sla: { targetSeconds: slaTarget },
    });
  } catch(err) {
    console.error("createEmergency:", err);
    res.status(500).json({ error:"Server error: " + err.message });
  }
};

// ── GET NEARBY VEHICLES ─────────────────────────────────────
exports.getNearbyVehicles = async (req, res) => {
  try {
    const emergency = await Emergency.findById(req.params.id);
    if (!emergency) return res.status(404).json({ error:"Not found" });
    if (!emergency.location?.lat)
      return res.status(400).json({ error:"Emergency has no location" });

    const allVehicles = await Vehicle.find({}).lean();
    const available   = allVehicles.filter(v => v.status === "Available");

    let trafficFactor=1.0, weatherPenalty=0;
    try {
      const wx = await weatherService.getWeather(emergency.location.lat, emergency.location.lng);
      if (wx?.isHazardous) weatherPenalty = 2;
      const hr = new Date().getHours();
      if ((hr>=8&&hr<=10)||(hr>=17&&hr<=20)) trafficFactor=1.4;
      else if (hr>=11&&hr<=16) trafficFactor=1.15;
      else if (hr>=21||hr<=5)  trafficFactor=0.85;
    } catch(e){}

    const ranked = vehicleAI.rankVehicles(available, {
      lat:      emergency.location.lat,
      lng:      emergency.location.lng,
      type:     emergency.type,
      priority: emergency.priority,
    }, { trafficFactor, weatherPenalty });

    res.json({
      vehicles:          ranked,
      serviceType:       SERVICE[emergency.type]||"Ambulance",
      emergencyType:     emergency.type,
      emergencyPriority: emergency.priority,
      totalAvailable:    available.length,
      trafficFactor, weatherPenalty,
      aiPowered:         true,
      alreadyAssigned:   emergency.assignedVehicles||[],
    });
  } catch(err) {
    console.error("getNearbyVehicles:", err);
    res.status(500).json({ error:"Server error" });
  }
};

// ── DISPATCH (single or multi) ──────────────────────────────
exports.dispatchEmergency = async (req, res) => {
  try {
    const emergency = await Emergency.findById(req.params.id);
    if (!emergency) return res.status(404).json({ error:"Not found" });
    if (["Resolved","Cancelled"].includes(emergency.status))
      return res.status(400).json({ error:`Emergency is ${emergency.status}` });

    const { vehicleId, autoDispatch } = req.body;
    let vehicle, selectionReason = "Manual operator selection";

    if (vehicleId) {
      vehicle = await Vehicle.findOne({ vehicleId });
      if (!vehicle) return res.status(400).json({ error:`Vehicle ${vehicleId} not found` });
      if (vehicle.status !== "Available")
        return res.status(400).json({ error:`${vehicleId} is currently ${vehicle.status}` });
      // Check not already dispatched to this emergency
      if (emergency.assignedVehicles?.includes(vehicleId))
        return res.status(400).json({ error:`${vehicleId} already assigned to this emergency` });
    } else {
      const allVehicles = await Vehicle.find({ status:"Available" }).lean();
      if (!allVehicles.length) return res.status(400).json({ error:"No vehicles available" });
      const best = vehicleAI.autoSelectBest(allVehicles, {
        lat:      emergency.location.lat,
        lng:      emergency.location.lng,
        type:     emergency.type,
        priority: emergency.priority,
      });
      if (!best) return res.status(400).json({ error:"AI could not select vehicle" });
      vehicle = await Vehicle.findOne({ vehicleId: best.vehicleId });
      selectionReason = `AI: ${best.reasons?.filter(r=>r.startsWith("✓")).slice(0,2).join(", ")}`;
    }

    const route = await getOptimizedRoute(
      vehicle.location.lat, vehicle.location.lng,
      emergency.location.lat, emergency.location.lng
    );
    if (!route) return res.status(500).json({ error:"Routing failed" });

    const distKm = +(route.distance/1000).toFixed(2);
    const saved  = co2(vehicle, route.distance);

    vehicle.status          = "Assigned";
    vehicle.totalTrips      = (vehicle.totalTrips||0) + 1;
    vehicle.totalDistanceKm = (vehicle.totalDistanceKm||0) + distKm;
    await vehicle.save();

    // Update emergency — primary vehicle or additional
    const isFirst = !emergency.assignedVehicle;
    emergency.status          = "Assigned";
    emergency.assignedAt      = emergency.assignedAt || new Date();
    emergency.dispatchTime    = emergency.dispatchTime || (new Date()-emergency.createdAt)/1000;
    if (isFirst) {
      emergency.assignedVehicle = vehicle.vehicleId;
      emergency.carbonSaved     = saved;
      emergency.distanceKm      = distKm;
    }
    // Add to multi-unit array
    if (!emergency.assignedVehicles) emergency.assignedVehicles = [];
    if (!emergency.assignedVehicles.includes(vehicle.vehicleId)) {
      emergency.assignedVehicles.push(vehicle.vehicleId);
    }
    // Save route geometry to DB so citizen can reload it after page refresh
    emergency.routeGeometry          = route.geometry            || [];
    emergency.routeAltGeometry       = route.alternativeGeometry || [];
    emergency.routeSteps             = route.steps               || [];
    emergency.routeDistanceMeters    = route.distance            || 0;
    emergency.routeDurationSeconds   = route.duration            || 0;
    emergency.routeHasAlternative    = route.hasAlternative      || false;
    emergency.routeAltDistanceMeters = route.alternativeDistance || 0;
    await emergency.save();

    const io = req.app.get("io");
    const payload = {
      emergencyId:     String(emergency._id),
      type:            emergency.type,
      priority:        emergency.priority,
      location:        emergency.location,
      isAdditionalUnit:!isFirst,
      unitNumber:       emergency.assignedVehicles.length,
      assignedVehicle: {
        vehicleId:  vehicle.vehicleId,
        name:       vehicle.name,
        type:       vehicle.type,
        location:   vehicle.location,
        fuelType:   vehicle.fuelType,
        crew:       vehicle.crew,
      },
      allAssignedVehicles: emergency.assignedVehicles,
      route: {
        distanceInMeters:    route.distance,
        durationInSeconds:   route.duration,
        geometry:            route.geometry,
        steps:               route.steps||[],
        trafficFactor:       route.trafficFactor,
        hasAlternative:      route.hasAlternative,
        alternativeGeometry: route.alternativeGeometry,
        alternativeDistance: route.alternativeDistance,
        alternativeDuration: route.alternativeDuration,
      },
      sustainability:  { vehicleFuel:vehicle.fuelType, carbonSavedKg:saved, distanceKm:distKm },
      dispatchedBy:    req.user?.role || "Operator",
      selectionReason,
    };

    io?.emit("emergencyDispatched",    payload);
    io?.emit("emergencyStatusUpdate", { emergencyId: String(emergency._id), status:"Assigned" });

    simulate(io, vehicle, route.geometry, emergency._id, emergency.priority, route.steps||[]);

    res.json({
      message:          `Unit ${vehicle.vehicleId} dispatched`,
      assignedVehicle:  payload.assignedVehicle,
      route:            payload.route,
      sustainability:   payload.sustainability,
      selectionReason,
      unitNumber:       emergency.assignedVehicles.length,
      allAssignedVehicles: emergency.assignedVehicles,
    });
  } catch(err) {
    console.error("dispatchEmergency:", err);
    res.status(500).json({ error:"Server error: " + err.message });
  }
};

exports.getAllEmergencies = async (req, res) => {
  try {
    const { status, type, limit=100 } = req.query;
    const q = {};
    if (status) q.status = status;
    if (type)   q.type   = type;
    const list = await Emergency.find(q).sort({ createdAt:-1 }).limit(parseInt(limit));
    res.json(list);
  } catch(err) { res.status(500).json({ error:"Server error" }); }
};

exports.getEmergencyById = async (req, res) => {
  try {
    const em = await Emergency.findById(req.params.id);
    if (!em) return res.status(404).json({ error:"Not found" });
    res.json(em);
  } catch(err) { res.status(500).json({ error:"Server error" }); }
};

// ── UPDATE STATUS (operator manual) ────────────────────────
exports.updateEmergencyStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;
    const VALID = ["Reported","Acknowledged","Assigned","En Route","On Scene","Resolved","Cancelled"];
    if (!VALID.includes(status)) return res.status(400).json({ error:"Invalid status" });

    const em = await Emergency.findById(req.params.id);
    if (!em) return res.status(404).json({ error:"Not found" });

    const now = new Date();
    const upd = { status };
    if (notes) upd.$push = { notes:{ text:notes, by:req.user?.role||"System", at:now } };

    if (status === "Resolved") {
      const respT  = em.responseTime  || Math.round((em.vehicleArrivedAt||now - em.createdAt)/1000);
      const resolT = Math.round((now - em.createdAt)/1000);

      upd.resolvedAt        = now;
      upd.responseTime      = respT;
      upd.resolutionTime    = resolT;
      upd.totalHandlingTime = resolT;

      if (em.sla?.targetResponseTime) {
        upd["sla.breached"]     = respT > em.sla.targetResponseTime;
        upd["sla.breachMargin"] = em.sla.targetResponseTime - respT;
      }

      // Free ALL assigned vehicles
      const allVehicles = em.assignedVehicles?.length
        ? em.assignedVehicles
        : (em.assignedVehicle ? [em.assignedVehicle] : []);
      if (allVehicles.length) {
        await Vehicle.updateMany(
          { vehicleId: { $in: allVehicles } },
          { status: "Available" }
        );
      }

      // Update citizen stats
      if (em.reportedByUserId) {
        try {
          const allMine = await Emergency.find({
            reportedByUserId: em.reportedByUserId,
            status: "Resolved", responseTime: { $gt:0 }
          }).lean();
          const times = [...allMine.map(x=>x.responseTime), respT].filter(Boolean);
          const avg   = times.length ? Math.round(times.reduce((a,b)=>a+b,0)/times.length) : 0;
          await User.findByIdAndUpdate(em.reportedByUserId, {
            $inc: { resolvedEmergencies:1 },
            avgResponseTime: avg,
          });
        } catch(e){}
      }

      // Close chat session
      try {
        await ChatSession.findOneAndUpdate(
          { emergencyId: em._id },
          { status:"closed" }
        );
      } catch(e){}
    }

    const updated = await Emergency.findByIdAndUpdate(req.params.id, upd, { new:true });

    const io = req.app.get("io");
    io?.emit("emergencyStatusUpdate", { emergencyId: String(em._id), status });

    if (status === "Resolved") {
      io?.emit("emergencyResolved", {
        emergencyId:    String(em._id),
        type:           em.type,
        responseTime:   updated.responseTime,
        resolutionTime: updated.resolutionTime,
        slaBreached:    updated.sla?.breached||false,
        resolvedBy:     req.user?.role||"Operator",
        location:       em.location,
      });
      io?.to("operators").emit("incidentResolved", {
        emergencyId: em._id, type: em.type,
        location: em.location, responseTime: updated.responseTime,
      });
    }

    res.json(updated);
  } catch(err) {
    console.error("updateStatus:", err);
    res.status(500).json({ error:"Server error: " + err.message });
  }
};

// ── INTELLIGENCE endpoint ───────────────────────────────────
exports.getEmergencyIntelligence = async (req, res) => {
  try {
    const intelligence = require("../ml/incidentIntelligence");
    const em = await Emergency.findById(req.params.id).lean();
    if (!em) return res.status(404).json({ error:"Not found" });

    const [vehicles, wx, nearbyCount] = await Promise.all([
      Vehicle.find({ status:"Available" }).lean(),
      weatherService.getWeather(em.location?.lat||22.7196, em.location?.lng||75.8577).catch(()=>({ condition:"Unknown" })),
      Emergency.countDocuments({
        "location.lat": { $gte:(em.location?.lat||0)-0.02, $lte:(em.location?.lat||0)+0.02 },
        "location.lng": { $gte:(em.location?.lng||0)-0.02, $lte:(em.location?.lng||0)+0.02 },
      })
    ]);

    const distKm = em.distanceKm || 2;
    const severity     = intelligence.computeSeverity(em.type, em.priority, wx.condition, nearbyCount);
    const recommendation = intelligence.getRecommendation(em.type, em.priority, wx, nearbyCount, vehicles);
    const escalation   = intelligence.shouldEscalate(em.type, em.priority, nearbyCount, 0);
    const predictedRT  = intelligence.predictResponseTime(em.type, em.priority, distKm, wx.condition, new Date().getHours());

    res.json({
      emergencyId: em._id,
      severity, recommendation, escalation, predictedRT,
      nearbyCount,
      availableVehicles: vehicles.length,
      weather: wx,
    });
  } catch(err) {
    console.error("intelligence:", err);
    res.status(500).json({ error:"Intelligence engine error" });
  }
};
