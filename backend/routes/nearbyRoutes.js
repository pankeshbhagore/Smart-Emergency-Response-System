const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/authMiddleware");
const { getNearbyServices, getRelevantCategories } = require("../services/nearbyServicesEngine");

router.get("/", auth, async (req, res) => {
  try {
    const { lat, lng, type, radius = 3 } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: "lat and lng required" });
    const categories = type ? getRelevantCategories(type) : null;
    const result = await getNearbyServices(parseFloat(lat), parseFloat(lng), categories, parseFloat(radius));
    res.json(result);
  } catch(err) { res.status(500).json({ error: "Server error" }); }
});

module.exports = router;
