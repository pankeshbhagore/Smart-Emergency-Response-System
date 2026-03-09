/**
 * MULTI-AGENCY COORDINATION
 * Dispatches multiple vehicle types (Fire + Ambulance + Police) for one incident
 * Tracks all agencies per emergency
 */
const Emergency = require("../models/Emergency");
const Vehicle   = require("../models/Vehicle");
const { getOptimizedRoute } = require("../services/routeOptimizer");
const { simulate }          = require("../services/vehicleSimulator");
const vehicleAI             = require("../ml/vehicleAssignmentAI");

const AGENCY_TYPES = {
  Ambulance:   { icon:"🚑", name:"Medical Unit",   priority:1 },
  FireTruck:   { icon:"🚒", name:"Fire Brigade",   priority:2 },
  Police:      { icon:"🚔", name:"Police Unit",    priority:3 },
  HazMat:      { icon:"☣️", name:"HazMat Unit",    priority:4 },
  FloodRescue: { icon:"🚤", name:"Flood Rescue",   priority:5 },
  TowTruck:    { icon:"🔧", name:"Recovery Unit",  priority:6 },
};

// Suggest which agencies are needed for an incident
exports.suggestAgencies = async (req, res) => {
  try {
    const emergency = await Emergency.findById(req.params.id).lean();
    if (!emergency) return res.status(404).json({ error: "Not found" });

    const suggestions = {
      Fire:      [{ type:"FireTruck",reason:"Primary — fight the fire"}, { type:"Ambulance",reason:"Treat casualties"}, { type:"Police",reason:"Crowd/traffic control"}],
      Medical:   [{ type:"Ambulance",reason:"Primary — patient care"}],
      Accident:  [{ type:"Ambulance",reason:"Treat injuries"}, { type:"Police",reason:"Accident report/traffic"}, { type:"TowTruck",reason:"Vehicle recovery"}],
      Crime:     [{ type:"Police",reason:"Primary — law enforcement"}, { type:"Ambulance",reason:"Treat any injured"}],
      Flood:     [{ type:"FloodRescue",reason:"Primary — rescue from water"}, { type:"Ambulance",reason:"Treat rescued victims"}, { type:"Police",reason:"Area evacuation"}],
      "Gas Leak":[{ type:"HazMat",reason:"Primary — contain hazard"}, { type:"FireTruck",reason:"Fire prevention"}, { type:"Ambulance",reason:"Treat exposure victims"}],
      Breakdown: [{ type:"TowTruck",reason:"Primary — vehicle recovery"}, { type:"Police",reason:"Traffic management if needed"}],
    };

    const recommended = suggestions[emergency.type] || [{ type:"Ambulance", reason:"General emergency response" }];

    // Get available vehicles per type
    const available = await Vehicle.find({ status: "Available" }).lean();
    const ranked = recommended.map(s => {
      const vOfType = available.filter(v => v.type === s.type);
      const best = vehicleAI.rankVehicles(vOfType, emergency)[0] || null;
      return { ...s, icon: AGENCY_TYPES[s.type]?.icon || "🚗", availableCount: vOfType.length, bestVehicle: best };
    });

    res.json({ suggestions: ranked, incidentType: emergency.type, emergencyId: emergency._id });
  } catch(err) { res.status(500).json({ error: "Server error" }); }
};

// POST — dispatch multiple agencies at once
exports.dispatchMultiAgency = async (req, res) => {
  try {
    const emergency = await Emergency.findById(req.params.id);
    if (!emergency) return res.status(404).json({ error: "Not found" });
    if (emergency.status === "Resolved") return res.status(400).json({ error: "Emergency already resolved" });

    const { vehicleIds } = req.body; // array of vehicleIds
    if (!Array.isArray(vehicleIds) || !vehicleIds.length)
      return res.status(400).json({ error: "vehicleIds array required" });

    const dispatched = [];
    const io = req.app.get("io");

    for (const vehicleId of vehicleIds) {
      try {
        const vehicle = await Vehicle.findOne({ vehicleId, status: "Available" });
        if (!vehicle) { dispatched.push({ vehicleId, status: "skipped", reason: "Not available" }); continue; }

        const route = await getOptimizedRoute(
          vehicle.location.lat, vehicle.location.lng,
          emergency.location.lat, emergency.location.lng
        );
        if (!route) { dispatched.push({ vehicleId, status: "failed", reason: "Route unavailable" }); continue; }

        vehicle.status     = "Assigned";
        vehicle.totalTrips = (vehicle.totalTrips || 0) + 1;
        await vehicle.save();

        simulate(io, vehicle, route.geometry, emergency._id, emergency.priority, route.steps || []);

        dispatched.push({
          vehicleId, status: "dispatched",
          type: vehicle.type, name: vehicle.name,
          icon: AGENCY_TYPES[vehicle.type]?.icon || "🚗",
          distanceKm: +(route.distance/1000).toFixed(2),
          etaSecs: route.duration,
          route: {
            geometry:          route.geometry,
            distanceInMeters:  route.distance,
            durationInSeconds: route.duration,
            steps:             route.steps || [],
          }
        });

        io?.emit("agencyDispatched", {
          emergencyId: emergency._id,
          vehicle: { vehicleId, type: vehicle.type, name: vehicle.name, icon: AGENCY_TYPES[vehicle.type]?.icon },
          route,
        });
      } catch(e) { dispatched.push({ vehicleId, status: "error", reason: e.message }); }
    }

    // Update emergency with all assigned vehicles
    const successIds = dispatched.filter(d => d.status === "dispatched").map(d => d.vehicleId);
    if (successIds.length > 0) {
      emergency.status         = "Assigned";
      emergency.assignedVehicle = successIds[0]; // primary
      emergency.assignedAt     = new Date();
      if (!emergency.dispatchTime) emergency.dispatchTime = (new Date() - emergency.createdAt) / 1000;
      await emergency.save();

      io?.emit("multiAgencyDispatched", {
        emergencyId: emergency._id,
        type: emergency.type,
        agencies:  dispatched.filter(d => d.status === "dispatched"),
        location:  emergency.location,
        timestamp: new Date().toISOString(),
      });
      io?.emit("emergencyStatusUpdate", { emergencyId: emergency._id, status: "Assigned" });
    }

    res.json({
      message: `${successIds.length}/${vehicleIds.length} agencies dispatched`,
      dispatched,
      emergencyId: emergency._id,
    });
  } catch(err) { console.error(err); res.status(500).json({ error: "Server error" }); }
};

// GET agency status for an emergency
exports.getAgencyStatus = async (req, res) => {
  try {
    const emergency = await Emergency.findById(req.params.id).lean();
    if (!emergency) return res.status(404).json({ error: "Not found" });
    // Return all vehicles assigned to this emergency
    res.json({ emergencyId: emergency._id, primaryVehicle: emergency.assignedVehicle, allVehicles: emergency.assignedVehicles||[], status: emergency.status });
  } catch(err) { res.status(500).json({ error: "Server error" }); }
};
