const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/authMiddleware");
const role    = require("../middleware/roleMiddleware");
const ctrl    = require("../controllers/multiAgencyController");

router.get("/:id/suggest",   auth, role("Admin","Operator"), ctrl.suggestAgencies);
router.post("/:id/dispatch", auth, role("Admin","Operator"), ctrl.dispatchMultiAgency);
router.get("/:id/status",    auth, role("Admin","Operator"), ctrl.getAgencyStatus);

module.exports = router;
