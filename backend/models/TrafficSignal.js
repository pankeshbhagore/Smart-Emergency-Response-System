const mongoose = require("mongoose");

const signalSchema = new mongoose.Schema({
  signalId:    { type: String, required: true, unique: true },
  location:    { lat: Number, lng: Number },
  address:     { type: String, default: "" },
  state:       { type: String, enum: ["GREEN","YELLOW","RED"], default: "RED" },
  lastChanged: { type: Date, default: Date.now },
  autoControl: { type: Boolean, default: true },   // false = manual override
  emergencyOverrideBy: { type: String, default: null },  // vehicleId that triggered
  greenDuration:  { type: Number, default: 30 },   // seconds of green hold
  totalOverrides: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model("TrafficSignal", signalSchema);
