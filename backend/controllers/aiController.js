const Emergency = require("../models/Emergency");
const Vehicle   = require("../models/Vehicle");
const ai        = require("../ml/aiServices");
const anomaly   = require("../ml/anomalyDetector");
const prediction= require("../ml/predictionModel");
const weather   = require("../services/weatherService");

const DEFAULT_LAT=22.7196, DEFAULT_LNG=75.8577;

exports.getCityRisk = async (req, res) => {
  try {
    const [emergencies, vehicles] = await Promise.all([Emergency.find().lean(), Vehicle.find().lean()]);
    const wx = await weather.getWeather(DEFAULT_LAT, DEFAULT_LNG).catch(()=>null);
    const model = prediction.buildTimeSeriesModel(emergencies);
    const preds = prediction.generatePredictions(model);
    const risk = ai.computeCityRiskIndex(emergencies, vehicles, wx, preds);
    res.json({ ...risk, weather:wx });
  } catch(e) { res.status(500).json({ error:e.message }); }
};

exports.getAutoAlerts = async (req, res) => {
  try {
    const [emergencies, vehicles] = await Promise.all([Emergency.find().lean(), Vehicle.find().lean()]);
    const wx = await weather.getWeather(DEFAULT_LAT, DEFAULT_LNG).catch(()=>null);
    const model = prediction.buildTimeSeriesModel(emergencies);
    const preds = prediction.generatePredictions(model);
    const alerts = ai.generateAutoAlerts(emergencies, preds, wx);
    res.json({ alerts, count:alerts.length });
  } catch(e) { res.status(500).json({ error:e.message }); }
};

exports.getVehicleHealth = async (req, res) => {
  try {
    const vehicles = await Vehicle.find().lean();
    const reports = vehicles.map(v => ai.monitorVehicleHealth(v));
    const critical = reports.filter(r=>r.overallHealth==="CRITICAL");
    const warnings = reports.filter(r=>r.overallHealth==="WARNING");
    res.json({ reports, critical:critical.length, warnings:warnings.length, total:vehicles.length });
  } catch(e) { res.status(500).json({ error:e.message }); }
};

exports.getShiftScore = async (req, res) => {
  try {
    const emergencies = await Emergency.find().lean();
    const score = ai.scoreShiftPerformance(emergencies);
    res.json(score);
  } catch(e) { res.status(500).json({ error:e.message }); }
};

exports.getSLAOptimizer = async (req, res) => {
  try {
    const emergencies = await Emergency.find({ status:"Resolved" }).lean();
    const result = ai.optimizeSLATargets(emergencies);
    res.json(result);
  } catch(e) { res.status(500).json({ error:e.message }); }
};

exports.predictChain = async (req, res) => {
  try {
    const { type, lat, lng } = req.body;
    const chains = ai.predictChainEvents(type, { lat, lng });
    res.json({ chains });
  } catch(e) { res.status(500).json({ error:e.message }); }
};

exports.getEvacuationZone = async (req, res) => {
  try {
    const { lat, lng, type, priority } = req.body;
    const zone = ai.calculateEvacuationZone(parseFloat(lat), parseFloat(lng), type, priority);
    res.json(zone);
  } catch(e) { res.status(500).json({ error:e.message }); }
};

exports.checkGoldenHour = async (req, res) => {
  try {
    const em = await Emergency.findById(req.body.emergencyId).lean();
    if (!em) return res.status(404).json({ error:"Not found" });
    const result = ai.checkGoldenHour(em);
    res.json(result);
  } catch(e) { res.status(500).json({ error:e.message }); }
};

exports.checkMassCasualty = async (req, res) => {
  try {
    const { type, priority, crowdDensity, weatherCondition } = req.body;
    const result = ai.predictMassCasualty(type, priority, crowdDensity||"Medium", weatherCondition||"Clear");
    res.json(result);
  } catch(e) { res.status(500).json({ error:e.message }); }
};

exports.predictRecurrence = async (req, res) => {
  try {
    const { lat, lng, type } = req.body;
    const emergencies = await Emergency.find().lean();
    const result = ai.predictRecurrence(emergencies, parseFloat(lat), parseFloat(lng), type);
    res.json(result);
  } catch(e) { res.status(500).json({ error:e.message }); }
};

exports.optimizeCarbon = async (req, res) => {
  try {
    const { type } = req.body;
    const vehicles = await Vehicle.find({ status:"Available" }).lean();
    const result = ai.optimizeCarbonFootprint(vehicles, type);
    res.json(result);
  } catch(e) { res.status(500).json({ error:e.message }); }
};
