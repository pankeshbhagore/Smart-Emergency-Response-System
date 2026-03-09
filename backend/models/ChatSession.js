const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  from:    { type: String, enum: ["Operator","Citizen","System","AI"], required: true },
  fromId:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  text:    { type: String, required: true },
  type:    { type: String, enum: ["text","firstaid","location","image","system"], default: "text" },
  readBy:  [{ type: String }],
  at:      { type: Date, default: Date.now },
});

const chatSessionSchema = new mongoose.Schema({
  emergencyId:  { type: mongoose.Schema.Types.ObjectId, ref: "Emergency", required: true, unique: true },
  citizenId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  operatorId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  messages:     [messageSchema],
  status:       { type: String, enum: ["open","closed"], default: "open" },
  citizenOnline: { type: Boolean, default: false },
  operatorOnline:{ type: Boolean, default: false },
  lastMessageAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model("ChatSession", chatSessionSchema);
