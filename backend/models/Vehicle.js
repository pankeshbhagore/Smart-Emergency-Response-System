const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema({
  vehicleId:   { type: String, required: true, unique: true },
  name:        { type: String, default: "" },           // "Ambulance Alpha"
  type:        { type: String, enum: ["Ambulance","FireTruck","Police","TowTruck","HazMat","FloodRescue"], default: "Ambulance" },
  fuelType:    { type: String, enum: ["EV","Diesel","Petrol","Hybrid"], default: "Diesel" },
  batteryLevel:{ type: Number, default: 100, min: 0, max: 100 },
  fuelLevel:   { type: Number, default: 100, min: 0, max: 100 },
  emissionRate:{ type: Number, default: 0.27 },  // kg CO2/km
  location:    { lat: Number, lng: Number },
  status:      { type: String, enum: ["Available","Assigned","Maintenance","Offline"], default: "Available" },
  speed:       { type: Number, default: 60 },
  crew:        { type: Number, default: 2 },            // crew count
  equipment:   [{ type: String }],                      // ["Defibrillator","Oxygen"]
  totalTrips:  { type: Number, default: 0 },
  totalDistanceKm: { type: Number, default: 0 },
  totalCarbonSaved:{ type: Number, default: 0 },
  lastMaintenance: { type: Date },
  maintenanceDueKm:{ type: Number, default: 50000 },
  registrationNo:  { type: String, default: "" },
  notes:       { type: String, default: "" }
}, { timestamps: true });

module.exports = mongoose.model("Vehicle", vehicleSchema);
