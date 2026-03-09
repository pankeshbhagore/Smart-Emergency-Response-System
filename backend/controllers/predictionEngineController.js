const Emergency = require("../models/Emergency");
const prediction = require("../ml/predictionModel");
const anomaly = require("../ml/anomalyDetector");

exports.getFuturePredictions = async (req, res) => {
  try {
    const emergencies = await Emergency.find().lean();
    const model = prediction.buildTimeSeriesModel(emergencies);
    const predictions = prediction.generatePredictions(model);
    res.json(predictions);
  } catch(error) {
    console.error("Prediction engine error:", error);
    res.status(500).json({ error: "Prediction engine error" });
  }
};

exports.getHotZones = async (req, res) => {
  try {
    const emergencies = await Emergency.find().lean();
    const hotZones = anomaly.detectHotZones(emergencies);
    res.json(hotZones);
  } catch(err) {
    res.status(500).json({ error: "Hot zone error" });
  }
};
