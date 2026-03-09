const mongoose = require("mongoose");

const emergencySchema = new mongoose.Schema({
  type:     { type: String, enum: ["Medical","Fire","Accident","Crime","Breakdown","Flood","Gas Leak","Other"], default: "Other" },
  priority: { type: String, enum: ["Critical","High","Medium","Normal","Low"], default: "Normal" },
  status:   { type: String, enum: ["Reported","Acknowledged","Assigned","En Route","On Scene","Resolved","Cancelled"], default: "Reported" },
  description:      { type: String, default: "" },
  reportedBy:       { type: String, default: "Citizen" },
  reportedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reporterPhone:    { type: String, default: "" },
  reporterName:     { type: String, default: "" },

  location: {
    lat:          Number,
    lng:          Number,
    address:      { type: String, default: "" },
    fullAddress:  { type: String, default: "" },
    road:         { type: String, default: "" },
    neighbourhood:{ type: String, default: "" },
    suburb:       { type: String, default: "" },
    area:         { type: String, default: "" },
    city:         { type: String, default: "" },
    district:     { type: String, default: "" },
    state:        { type: String, default: "" },
    postcode:     { type: String, default: "" },
    displayLine1: { type: String, default: "" },
    displayLine2: { type: String, default: "" },
    zone:         { type: String, default: "" },
  },

  assignedVehicle:    { type: String, default: null },     // primary unit (first dispatched)
  assignedVehicles:   [{ type: String }],                  // ALL dispatched units (multi-agency)
  assignedAt:         Date,
  dispatchTime:       Number,
  vehicleArrivedAt:   Date,
  responseTime:       Number,
  resolvedAt:         Date,
  resolutionTime:     Number,
  totalHandlingTime:  Number,

  severityScore: { type: Number, default: 0 },
  mlTags:        [{ type: String }],
  aiRecommendation: { type: String, default: "" },

  weatherContext: {
    condition: String, temperature: Number, humidity: Number,
    windSpeed: Number, visibility: Number, isHazardous: Boolean
  },

  sla: {
    targetResponseTime: Number,
    breached:     { type: Boolean, default: false },
    breachMargin: Number,
  },

  carbonSaved: { type: Number, default: 0 },
  distanceKm:  { type: Number, default: 0 },

  // Route geometry — saved on dispatch so citizen can always reload it
  routeGeometry:            { type: [[Number]], default: [] },  // [[lng,lat], ...]
  routeAltGeometry:         { type: [[Number]], default: [] },
  routeSteps:               { type: [mongoose.Schema.Types.Mixed], default: [] },
  routeDistanceMeters:      { type: Number, default: 0 },
  routeDurationSeconds:     { type: Number, default: 0 },
  routeHasAlternative:      { type: Boolean, default: false },
  routeAltDistanceMeters:   { type: Number, default: 0 },

  notes: [{ text: String, by: String, at: { type: Date, default: Date.now } }]
}, { timestamps: true });

emergencySchema.index({ reportedByUserId: 1, createdAt: -1 });
emergencySchema.index({ "location.city": 1, createdAt: -1 });
emergencySchema.index({ status: 1, createdAt: -1 });
emergencySchema.index({ priority: 1, status: 1 });

module.exports = mongoose.model("Emergency", emergencySchema);
