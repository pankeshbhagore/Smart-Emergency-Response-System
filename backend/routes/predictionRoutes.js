const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/authMiddleware");
const { getRiskAnalysis } = require("../controllers/predictionController");
router.get("/", auth, getRiskAnalysis);
module.exports = router;
