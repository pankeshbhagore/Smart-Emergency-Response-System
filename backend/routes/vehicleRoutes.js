const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const role = require("../middleware/roleMiddleware");
const ctrl = require("../controllers/vehicleController");

router.get("/",        auth, ctrl.getAllVehicles);
router.post("/reset",  auth, role("Admin","Operator"), ctrl.resetVehicles);  // ← reset stuck vehicles
router.post("/",       auth, role("Admin"), ctrl.createVehicle);
router.patch("/:id/maintenance", auth, role("Admin"), ctrl.setMaintenance);
router.get("/:id",     auth, ctrl.getVehicleById);
router.put("/:id",     auth, role("Admin"), ctrl.updateVehicle);
router.delete("/:id",  auth, role("Admin"), ctrl.deleteVehicle);
module.exports = router;
