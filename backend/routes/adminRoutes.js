/**
 * Admin Routes 
 * All routes require: Bearer token + role Admin
 */
const express  = require("express");
const router   = express.Router();
const auth     = require("../middleware/authMiddleware");
const role     = require("../middleware/roleMiddleware");
const ctrl     = require("../controllers/adminController");

const isAdmin = [auth, role("Admin")];

// User management
router.get   ("/users",                  ...isAdmin, ctrl.listUsers);
router.post  ("/users/create",           ...isAdmin, ctrl.createUser);
router.put   ("/users/:id/role",         ...isAdmin, ctrl.changeRole);
router.put   ("/users/:id/status",       ...isAdmin, ctrl.changeStatus);
router.put   ("/users/:id/reset-password",...isAdmin, ctrl.resetPassword);
router.delete("/users/:id",              ...isAdmin, ctrl.deleteUser);

// Platform stats
router.get   ("/stats",                  ...isAdmin, ctrl.getPlatformStats);

// Public: check if any admin exists (used by frontend for first-time setup detection)
router.get   ("/check",                  ctrl.checkAdmin);

// One-time seed (public — protected by seedKey in body)
// Admin can only be created ONCE — if admin exists, returns 400
router.post  ("/seed",                   ctrl.seedAdmin);

module.exports = router;
