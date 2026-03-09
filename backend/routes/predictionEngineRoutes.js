const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const { getFuturePredictions, getHotZones } = require("../controllers/predictionEngineController");
router.get("/", auth, getFuturePredictions);
router.get("/hot-zones", auth, getHotZones);
module.exports = router;
