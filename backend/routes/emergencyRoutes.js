const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/authMiddleware");
const role    = require("../middleware/roleMiddleware");
const ctrl    = require("../controllers/emergencyController");

router.get("/:id/intelligence", auth, role("Admin","Operator"), ctrl.getEmergencyIntelligence);
router.get("/",                  auth,                           ctrl.getAllEmergencies);
router.post("/",                 auth,                           ctrl.createEmergency);

// ⚠️  Sub-routes MUST come before /:id  — otherwise Express matches /:id first
router.get("/:id/vehicles",      auth, role("Admin","Operator"), ctrl.getNearbyVehicles);
router.post("/:id/dispatch",     auth, role("Admin","Operator"), ctrl.dispatchEmergency);
router.patch("/:id/status",      auth, role("Admin","Operator"), ctrl.updateEmergencyStatus);

router.get("/:id",               auth,                           ctrl.getEmergencyById);

module.exports = router;
