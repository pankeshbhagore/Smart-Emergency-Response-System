/**
 * Admin Controller  — Full User & Platform Management
 * ═══════════════════════════════════════════════════════
 * ALL routes require: auth + role("Admin")
 *
 * User management:
 *   GET    /admin/users            — list all users with stats
 *   POST   /admin/users/create     — create Operator or Admin account
 *   PUT    /admin/users/:id/role   — change user role
 *   PUT    /admin/users/:id/status — activate or suspend
 *   PUT    /admin/users/:id/reset-password — set new password
 *   DELETE /admin/users/:id        — delete user (not self)
 *
 * Platform stats:
 *   GET    /admin/stats            — platform-wide numbers
 *
 * Seed (one-time):
 *   POST   /admin/seed             — create first Admin if none exists
 */
const User      = require("../models/User");
const Emergency = require("../models/Emergency");
const Vehicle   = require("../models/Vehicle");
const bcrypt    = require("bcryptjs");

// ── GET /admin/users ──────────────────────────────────────────
exports.listUsers = async (req, res) => {
  try {
    const { role, status, search, page=1, limit=50 } = req.query;
    const filter = {};
    if (role)   filter.role   = role;
    if (status) filter.accountStatus = status;
    if (search) filter.$or = [
      { name:  { $regex:search, $options:"i" } },
      { email: { $regex:search, $options:"i" } },
    ];

    const skip  = (parseInt(page)-1) * parseInt(limit);
    const [users, total] = await Promise.all([
      User.find(filter).select("-password")
          .sort({ createdAt:-1 }).skip(skip).limit(parseInt(limit))
          .populate("createdBy","name email role")
          .populate("approvedBy","name email role")
          .lean(),
      User.countDocuments(filter),
    ]);

    // Attach emergency counts per citizen
    const enriched = await Promise.all(users.map(async u => {
      if (u.role !== "Citizen") return { ...u, emergencyCount:0 };
      const count = await Emergency.countDocuments({ reportedByUserId:u._id });
      return { ...u, emergencyCount:count };
    }));

    res.json({ users:enriched, total, page:parseInt(page), limit:parseInt(limit),
               pages:Math.ceil(total/parseInt(limit)) });
  } catch(err) {
    console.error("listUsers:", err);
    res.status(500).json({ error:"Server error" });
  }
};

// ── POST /admin/users/create ──────────────────────────────────
// Admin creates an Operator or another Admin account with temp password
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role, phone, badgeNumber, department, shift } = req.body;
    if (!name?.trim() || !email?.trim() || !password)
      return res.status(400).json({ message:"Name, email, and password are required" });
    if (password.length < 6)
      return res.status(400).json({ message:"Password must be at least 6 characters" });
    if (!["Operator","Admin","Citizen"].includes(role))
      return res.status(400).json({ message:"Invalid role. Must be Operator, Admin, or Citizen" });
    if (await User.findOne({ email:email.toLowerCase() }))
      return res.status(400).json({ message:"Email already registered" });

    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({
      name:          name.trim(),
      email:         email.toLowerCase().trim(),
      password:      hashed,
      role,
      phone:         phone?.trim() || "",
      badgeNumber:   badgeNumber?.trim() || "",
      department:    department?.trim() || "",
      shift:         shift || "Any",
      accountStatus: "active",
      isActive:      true,
      createdBy:     req.user.id,
      approvedBy:    req.user.id,
      approvedAt:    new Date(),
    });

    res.status(201).json({
      message:`${role} account created successfully`,
      user: { id:user._id, name:user.name, email:user.email, role:user.role,
              accountStatus:user.accountStatus, createdAt:user.createdAt },
    });
  } catch(err) {
    console.error("createUser:", err);
    res.status(500).json({ error:"Failed to create user" });
  }
};

// ── PUT /admin/users/:id/role ─────────────────────────────────
exports.changeRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!["Admin","Operator","Citizen"].includes(role))
      return res.status(400).json({ message:"Invalid role" });
    if (req.params.id === req.user.id.toString())
      return res.status(400).json({ message:"You cannot change your own role" });

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role, approvedBy:req.user.id, approvedAt:new Date() },
      { new:true }
    ).select("-password");
    if (!user) return res.status(404).json({ message:"User not found" });

    res.json({ message:`Role changed to ${role}`, user });
  } catch(err) { res.status(500).json({ error:"Server error" }); }
};

// ── PUT /admin/users/:id/status ───────────────────────────────
exports.changeStatus = async (req, res) => {
  try {
    const { status, reason } = req.body; // "active" | "suspended"
    if (!["active","suspended"].includes(status))
      return res.status(400).json({ message:"Status must be 'active' or 'suspended'" });
    if (req.params.id === req.user.id.toString())
      return res.status(400).json({ message:"You cannot suspend yourself" });

    const updates = {
      accountStatus: status,
      isActive:      status === "active",
    };
    if (status === "suspended") {
      updates.suspendedBy  = req.user.id;
      updates.suspendedAt  = new Date();
      updates.suspendReason = reason || "";
    } else {
      updates.suspendedBy  = null;
      updates.suspendedAt  = null;
      updates.suspendReason = "";
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new:true }).select("-password");
    if (!user) return res.status(404).json({ message:"User not found" });

    res.json({ message:`Account ${status === "active" ? "activated" : "suspended"}`, user });
  } catch(err) { res.status(500).json({ error:"Server error" }); }
};

// ── PUT /admin/users/:id/reset-password ──────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6)
      return res.status(400).json({ message:"Password must be at least 6 characters" });

    const hashed = await bcrypt.hash(newPassword, 12);
    const user = await User.findByIdAndUpdate(req.params.id, { password:hashed }, { new:true });
    if (!user) return res.status(404).json({ message:"User not found" });

    res.json({ message:"Password reset successfully" });
  } catch(err) { res.status(500).json({ error:"Server error" }); }
};

// ── DELETE /admin/users/:id ───────────────────────────────────
exports.deleteUser = async (req, res) => {
  try {
    if (req.params.id === req.user.id.toString())
      return res.status(400).json({ message:"You cannot delete your own account" });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message:"User not found" });
    if (user.role === "Admin") {
      const adminCount = await User.countDocuments({ role:"Admin", _id:{ $ne:req.params.id } });
      if (adminCount === 0)
        return res.status(400).json({ message:"Cannot delete the last Admin account" });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message:"User deleted" });
  } catch(err) { res.status(500).json({ error:"Server error" }); }
};

// ── GET /admin/stats ──────────────────────────────────────────
exports.getPlatformStats = async (req, res) => {
  try {
    const [
      totalUsers, totalCitizens, totalOperators, totalAdmins,
      activeUsers, suspendedUsers,
      totalEms, resolvedEms, activeEms,
      totalVehicles, availableVehicles,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role:"Citizen" }),
      User.countDocuments({ role:"Operator" }),
      User.countDocuments({ role:"Admin" }),
      User.countDocuments({ isActive:true }),
      User.countDocuments({ accountStatus:"suspended" }),
      Emergency.countDocuments(),
      Emergency.countDocuments({ status:"Resolved" }),
      Emergency.countDocuments({ status:{ $nin:["Resolved","Cancelled"] } }),
      Vehicle.countDocuments(),
      Vehicle.countDocuments({ status:"Available" }),
    ]);

    // Response time avg
    const resolved = await Emergency.find({ responseTime:{ $gt:0 } }).select("responseTime").lean();
    const avgResponse = resolved.length
      ? Math.round(resolved.reduce((a,e)=>a+e.responseTime,0)/resolved.length) : 0;

    // Recent registrations (last 7 days)
    const week = new Date(Date.now() - 7*24*60*60*1000);
    const recentRegistrations = await User.countDocuments({ createdAt:{ $gte:week } });

    // Users by role for charts
    const recentUsers = await User.find()
      .select("name email role accountStatus createdAt lastLogin loginCount")
      .sort({ createdAt:-1 }).limit(10).lean();

    res.json({
      users: { total:totalUsers, citizens:totalCitizens, operators:totalOperators,
               admins:totalAdmins, active:activeUsers, suspended:suspendedUsers,
               recentRegistrations },
      emergencies: { total:totalEms, resolved:resolvedEms, active:activeEms,
                     resolutionRate: totalEms ? Math.round(resolvedEms/totalEms*100) : 0,
                     avgResponseTime: avgResponse },
      vehicles: { total:totalVehicles, available:availableVehicles,
                  utilization: totalVehicles
                    ? Math.round((totalVehicles-availableVehicles)/totalVehicles*100) : 0 },
      recentUsers,
    });
  } catch(err) {
    console.error("getPlatformStats:", err);
    res.status(500).json({ error:"Server error" });
  }
};

// ── POST /admin/seed ─────────────────────────────────────────
// Creates first Admin account if none exists — one-time setup
exports.seedAdmin = async (req, res) => {
  try {
    const { name, email, password, seedKey } = req.body;
    // Seed key must match env var (security gate)
    const expectedKey = process.env.ADMIN_SEED_KEY || "SmartCity@AdminSeed2024";
    if (seedKey !== expectedKey)
      return res.status(403).json({ message:"Invalid seed key" });

    const existingAdmin = await User.findOne({ role:"Admin" });
    if (existingAdmin)
      return res.status(400).json({ message:"Admin account already exists. Use admin panel to create more." });

    if (!name || !email || !password || password.length < 8)
      return res.status(400).json({ message:"Name, email, and password (8+ chars) required" });

    const hashed = await bcrypt.hash(password, 12);
    const admin  = await User.create({
      name, email:email.toLowerCase(), password:hashed,
      role:"Admin", accountStatus:"active", isActive:true,
    });

    res.status(201).json({
      message:"Admin account created successfully",
      admin: { id:admin._id, name:admin.name, email:admin.email, role:admin.role },
    });
  } catch(err) {
    console.error("seedAdmin:", err);
    res.status(500).json({ error:"Failed to create admin" });
  }
};
