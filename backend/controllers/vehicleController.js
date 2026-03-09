const Vehicle = require("../models/Vehicle");

exports.getAllVehicles = async (req, res) => {
  try {
    const { type, status, fuelType } = req.query;
    const query = {};
    if (type) query.type = type;
    if (status) query.status = status;
    if (fuelType) query.fuelType = fuelType;
    const vehicles = await Vehicle.find(query).sort({ type: 1, vehicleId: 1 });
    res.json(vehicles);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
};

exports.getVehicleById = async (req, res) => {
  try {
    const v = await Vehicle.findById(req.params.id);
    if (!v) return res.status(404).json({ error: "Vehicle not found" });
    res.json(v);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
};

exports.createVehicle = async (req, res) => {
  try {
    const { vehicleId, name, type, fuelType, batteryLevel, fuelLevel, location, equipment, crew, registrationNo, notes } = req.body;
    if (!vehicleId || !type || !location?.lat || !location?.lng)
      return res.status(400).json({ error: "vehicleId, type, location.lat, location.lng required" });
    const exists = await Vehicle.findOne({ vehicleId });
    if (exists) return res.status(400).json({ error: "Vehicle ID already exists" });
    const vehicle = await Vehicle.create({ vehicleId, name, type, fuelType, batteryLevel, fuelLevel, location, equipment: equipment||[], crew, registrationNo, notes });
    res.status(201).json(vehicle);
  } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
};

exports.updateVehicle = async (req, res) => {
  try {
    const updates = req.body;
    delete updates.vehicleId; // don't allow vehicleId change
    const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
    res.json(vehicle);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
};

exports.deleteVehicle = async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
    if (vehicle.status === "Assigned") return res.status(400).json({ error: "Cannot delete an assigned vehicle" });
    await vehicle.deleteOne();
    res.json({ message: "Vehicle removed" });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
};

exports.setMaintenance = async (req, res) => {
  try {
    const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, { status: "Maintenance", lastMaintenance: new Date() }, { new: true });
    if (!vehicle) return res.status(404).json({ error: "Not found" });
    res.json(vehicle);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
};

// Reset all stuck "Assigned" vehicles back to "Available"
// Useful after server restart or simulation errors
exports.resetVehicles = async (req, res) => {
  try {
    const result = await Vehicle.updateMany(
      { status: { $in: ["Assigned", "Offline"] } },
      { status: "Available" }
    );
    const vehicles = await Vehicle.find().sort({ type: 1 });
    res.json({ 
      message: `Reset ${result.modifiedCount} vehicle(s) to Available`,
      modifiedCount: result.modifiedCount,
      vehicles 
    });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
};
