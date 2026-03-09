const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/authMiddleware");
const ctrl    = require("../controllers/aiController");

router.get("/city-risk",       auth, ctrl.getCityRisk);
router.get("/auto-alerts",     auth, ctrl.getAutoAlerts);
router.get("/vehicle-health",  auth, ctrl.getVehicleHealth);
router.get("/shift-score",     auth, ctrl.getShiftScore);
router.get("/sla-optimizer",   auth, ctrl.getSLAOptimizer);
router.post("/chain-predict",  auth, ctrl.predictChain);
router.post("/evacuation",     auth, ctrl.getEvacuationZone);
router.post("/golden-hour",    auth, ctrl.checkGoldenHour);
router.post("/mass-casualty",  auth, ctrl.checkMassCasualty);
router.post("/recurrence",     auth, ctrl.predictRecurrence);
router.post("/carbon-optimize",auth, ctrl.optimizeCarbon);

module.exports = router;
