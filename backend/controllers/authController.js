/**
 * Auth Controller v22 — Full Auth + Admin Management
 * ════════════════════════════════════════════════════
 * PUBLIC:
 *   POST /register  — Citizen only (secure: no role spoofing)
 *   POST /login     — All roles, checks isActive
 *
 * PROTECTED (any auth):
 *   GET  /profile          — own profile + stats
 *   PUT  /profile          — update own profile
 *   GET  /my-emergencies   — citizen history
 *   GET  /active-emergency — current active em
 *
 * ADMIN ONLY (via adminController → adminRoutes):
 *   GET    /admin/users             — all users with stats
 *   POST   /admin/users/create      — create operator/admin account
 *   PUT    /admin/users/:id/role    — change role
 *   PUT    /admin/users/:id/status  — activate / suspend
 *   PUT    /admin/users/:id/reset-password — force reset
 *   DELETE /admin/users/:id         — delete user
 *   GET    /admin/stats             — platform stats
 *   POST   /admin/seed              — create first admin (one-time)
 */
const User      = require("../models/User");
const Emergency = require("../models/Emergency");
const Vehicle   = require("../models/Vehicle");
const bcrypt    = require("bcryptjs");
const jwt       = require("jsonwebtoken");

// ── Token helper ──────────────────────────────────────────────
function signToken(user) {
  return jwt.sign(
    { id:user._id, role:user.role, name:user.name },
    process.env.JWT_SECRET,
    { expiresIn:"7d" }
  );
}

// ── PUBLIC: Register (Citizen only) ─────────────────────────
exports.register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name?.trim() || !email?.trim() || !password)
      return res.status(400).json({ message:"Name, email, and password are required" });
    if (password.length < 6)
      return res.status(400).json({ message:"Password must be at least 6 characters" });
    if (await User.findOne({ email: email.toLowerCase() }))
      return res.status(400).json({ message:"Email already registered" });

    const hashed = await bcrypt.hash(password, 12);
    await User.create({
      name:          name.trim(),
      email:         email.toLowerCase().trim(),
      password:      hashed,
      role:          "Citizen",   // ← FIXED: always Citizen, no role spoofing
      phone:         phone?.trim() || "",
      accountStatus: "active",
      isActive:      true,
    });
    res.status(201).json({ message:"Account created successfully. You can now log in." });
  } catch(err) {
    console.error("register:", err);
    res.status(500).json({ error:"Registration failed" });
  }
};

// ── PUBLIC: Login ─────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message:"Email and password required" });

    const user = await User.findOne({ email:email.toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(400).json({ message:"Invalid email or password" });

    // Check account status
    if (!user.isActive || user.accountStatus === "suspended")
      return res.status(403).json({
        message:"Your account has been suspended. Contact the administrator.",
        suspended: true,
      });

    // Update last login
    user.lastLogin  = new Date();
    user.loginCount = (user.loginCount || 0) + 1;
    await user.save();

    res.json({
      token:    signToken(user),
      role:     user.role,
      name:     user.name,
      email:    user.email,
      phone:    user.phone || "",
      userId:   user._id,
      accountStatus: user.accountStatus,
    });
  } catch(err) {
    console.error("login:", err);
    res.status(500).json({ error:"Login failed" });
  }
};

// ── PROTECTED: Get own profile ────────────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password").lean();
    if (!user) return res.status(404).json({ error:"User not found" });

    let stats = null;
    if (user.role === "Citizen") {
      const mine     = await Emergency.find({ reportedByUserId:req.user.id }).sort({ createdAt:-1 }).lean();
      const resolved = mine.filter(e => e.status === "Resolved");
      const times    = resolved.filter(e => e.responseTime > 0).map(e => e.responseTime);
      stats = {
        total:           mine.length,
        resolved:        resolved.length,
        active:          mine.filter(e => !["Resolved","Cancelled"].includes(e.status)).length,
        avgResponseTime: times.length ? Math.round(times.reduce((a,b)=>a+b,0)/times.length) : null,
        fastestResponse: times.length ? Math.round(Math.min(...times)) : null,
      };
    }
    res.json({ ...user, stats });
  } catch(err) { res.status(500).json({ error:"Server error" }); }
};

// ── PROTECTED: Update own profile ────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const allowed = ["name","phone","address","bloodGroup","emergencyContact"];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    updates.profileComplete = !!(req.body.phone?.trim());
    const user = await User.findByIdAndUpdate(req.user.id, updates, { new:true }).select("-password");
    res.json({ message:"Profile updated", user });
  } catch(err) { res.status(500).json({ error:"Update failed" }); }
};

// ── PROTECTED: Citizen emergency history ─────────────────────
exports.getMyEmergencies = async (req, res) => {
  try {
    const emergencies = await Emergency.find({ reportedByUserId:req.user.id })
      .sort({ createdAt:-1 }).limit(50).lean();
    res.json(emergencies);
  } catch(err) { res.status(500).json({ error:"Server error" }); }
};

// ── PROTECTED: Active emergency ───────────────────────────────
exports.getActiveEmergency = async (req, res) => {
  try {
    const ems = await Emergency.find({
      reportedByUserId: req.user.id,
      status: { $nin:["Resolved","Cancelled"] }
    }).sort({ createdAt:-1 }).lean();

    if (!ems.length) return res.json({ active:null, all:[] });

    const buildEmData = async em => {
      let vehicleData = null;
      if (em.assignedVehicle) {
        const v = await Vehicle.findOne({ vehicleId:em.assignedVehicle }).lean().catch(()=>null);
        if (v) vehicleData = {
          vehicleId:v.vehicleId, name:v.name, type:v.type, fuelType:v.fuelType,
          currentLat:v.location?.lat||null, currentLng:v.location?.lng||null,
        };
      }
      let allVehiclesData = [];
      if (em.assignedVehicles?.length) {
        const vs = await Vehicle.find({ vehicleId:{ $in:em.assignedVehicles } }).lean().catch(()=>[]);
        allVehiclesData = vs.map(v=>({
          vehicleId:v.vehicleId, name:v.name, type:v.type,
          currentLat:v.location?.lat||null, currentLng:v.location?.lng||null,
        }));
      }
      return {
        id: String(em._id), type:em.type, priority:em.priority, status:em.status,
        description:em.description||"", severityScore:em.severityScore||0,
        mlTags:em.mlTags||[], aiRecommendation:em.aiRecommendation||"",
        location:em.location||{}, address:em.location?.address||"",
        assignedVehicle:em.assignedVehicle||null, assignedVehicles:em.assignedVehicles||[],
        responseTime:em.responseTime||0, carbonSaved:em.carbonSaved||0,
        distanceKm:em.distanceKm||0, sla:em.sla||{}, createdAt:em.createdAt,
        vehicle:vehicleData, allVehicles:allVehiclesData,
        // Route geometry for map (saved on dispatch)
        route: em.routeGeometry?.length ? {
          geometry:            em.routeGeometry,
          alternativeGeometry: em.routeAltGeometry      || [],
          steps:               em.routeSteps            || [],
          distanceInMeters:    em.routeDistanceMeters   || 0,
          durationInSeconds:   em.routeDurationSeconds  || 0,
          hasAlternative:      em.routeHasAlternative   || false,
          alternativeDistance: em.routeAltDistanceMeters|| 0,
        } : null,
      };
    };

    const allData = await Promise.all(ems.map(buildEmData));
    res.json({ active:allData[0]||null, all:allData });
  } catch(err) {
    console.error("getActiveEmergency:", err);
    res.status(500).json({ error:"Server error" });
  }
};
