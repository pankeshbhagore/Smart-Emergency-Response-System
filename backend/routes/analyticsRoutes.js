const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const role = require("../middleware/roleMiddleware");
const { getAnalytics, getRealtimeMetrics } = require("../controllers/analyticsController");

router.get("/", auth, role("Admin","Operator"), getAnalytics);
router.get("/realtime", auth, getRealtimeMetrics);
module.exports = router;
