const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/authMiddleware");
const ctrl    = require("../controllers/authController");

router.post("/register",           ctrl.register);
router.post("/login",              ctrl.login);
router.get ("/profile",    auth,   ctrl.getProfile);
router.put ("/profile",    auth,   ctrl.updateProfile);
router.get ("/my-emergencies", auth, ctrl.getMyEmergencies);
router.get ("/active-emergency", auth, ctrl.getActiveEmergency);

module.exports = router;
