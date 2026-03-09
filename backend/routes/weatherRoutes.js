const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const { getCurrentWeather } = require("../controllers/weatherController");
router.get("/", auth, getCurrentWeather);
module.exports = router;