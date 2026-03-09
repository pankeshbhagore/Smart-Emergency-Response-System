/**
 * User Model  — Full Role + Account Management
 * ═══════════════════════════════════════════════
 * Roles: Admin | Operator | Citizen
 * Account status: active / suspended / pending
 * Operators require Admin approval / creation
 */
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name:     { type:String, required:true, trim:true },
  email:    { type:String, required:true, unique:true, lowercase:true, trim:true },
  password: { type:String, required:true },
  role:     { type:String, enum:["Admin","Operator","Citizen"], default:"Citizen" },

  // Account status
  accountStatus: { type:String, enum:["active","suspended","pending"], default:"active" },
  isActive:      { type:Boolean, default:true }, // quick bool for middleware checks

  // Profile (citizen)
  phone:            { type:String, default:"" },
  address:          { type:String, default:"" },
  bloodGroup:       { type:String, default:"" },
  emergencyContact: { type:String, default:"" },
  profileComplete:  { type:Boolean, default:false },

  // Operator-specific
  badgeNumber:  { type:String, default:"" },
  department:   { type:String, default:"" },
  shift:        { type:String, enum:["Morning","Evening","Night","Any"], default:"Any" },

  // Audit
  createdBy:   { type:mongoose.Schema.Types.ObjectId, ref:"User", default:null },
  approvedBy:  { type:mongoose.Schema.Types.ObjectId, ref:"User", default:null },
  approvedAt:  { type:Date, default:null },
  suspendedBy: { type:mongoose.Schema.Types.ObjectId, ref:"User", default:null },
  suspendedAt: { type:Date, default:null },
  suspendReason:{ type:String, default:"" },
  lastLogin:   { type:Date, default:null },
  loginCount:  { type:Number, default:0 },

  // Citizen stats
  totalEmergencies:    { type:Number, default:0 },
  resolvedEmergencies: { type:Number, default:0 },
  avgResponseTime:     { type:Number, default:0 },
}, { timestamps:true });

// Virtual: display name with role
userSchema.virtual("displayName").get(function() {
  return `${this.name} (${this.role})`;
});

module.exports = mongoose.model("User", userSchema);
