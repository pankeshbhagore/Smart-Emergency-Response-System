const router = require("express").Router();
const ctrl   = require("../controllers/communityAlertController");
const { protect } = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/roleMiddleware");

router.get("/",                protect,                                      ctrl.getAlerts);
router.post("/",               protect, requireRole("Operator","Admin"),     ctrl.createAlert);
router.patch("/:id/resolve",   protect, requireRole("Operator","Admin"),     ctrl.resolveAlert);
router.delete("/:id",          protect, requireRole("Operator","Admin"),     ctrl.deleteAlert);

router.post("/generate-from-predictions", protect, requireRole("Operator","Admin"), ctrl.generatePredictionAlerts);
module.exports = router;
