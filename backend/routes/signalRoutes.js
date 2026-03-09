const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/authMiddleware");
const TrafficSignal = require("../models/TrafficSignal");

router.get("/", auth, async (req, res) => {
  try {
    const signals = await TrafficSignal.find().lean();
    res.json(signals);
  } catch(err) { res.status(500).json({ error: "Server error" }); }
});

module.exports = router;
