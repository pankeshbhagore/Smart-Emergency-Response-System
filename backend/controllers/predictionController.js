const Emergency = require("../models/Emergency");

/* =========================================
   🔹 RISK ANALYSIS
   ✅ FIX: No null-check on e.location — crashes when location is missing
========================================= */
exports.getRiskAnalysis = async (req, res) => {
  try {
    const emergencies = await Emergency.find().lean();

    const riskMap = {};

    emergencies.forEach(e => {
      // ✅ FIX: Guard against missing location
      if (!e.location || e.location.lat == null || e.location.lng == null) return;

      const key = `${e.location.lat.toFixed(2)},${e.location.lng.toFixed(2)}`;

      const weights = { Accident: 3, Fire: 2, Medical: 2, Crime: 3, Breakdown: 1 };
      const weight = weights[e.type] || 1;

      if (!riskMap[key]) {
        riskMap[key] = { lat: e.location.lat, lng: e.location.lng, score: 0, count: 0 };
      }
      riskMap[key].score += weight;
      riskMap[key].count++;
    });

    const riskZones = Object.values(riskMap).map(zone => {
      let riskLevel = "Low";
      if (zone.score >= 8) riskLevel = "High";
      else if (zone.score >= 4) riskLevel = "Medium";

      return { ...zone, riskLevel };
    });

    res.json(riskZones);

  } catch (error) {
    console.error("Risk prediction error:", error);
    res.status(500).json({ error: "Prediction error" });
  }
};
