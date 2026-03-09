const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/authMiddleware");
const ctrl    = require("../controllers/chatSessionController");

router.get("/",                                  auth, ctrl.getAllSessions);
router.get("/:emergencyId",                      auth, ctrl.getOrCreateSession);
router.post("/:emergencyId/message",             auth, ctrl.sendMessage);
router.post("/:emergencyId/firstaid",            auth, ctrl.sendFirstAidGuide);
router.patch("/:emergencyId/close",              auth, ctrl.closeSession);

module.exports = router;
