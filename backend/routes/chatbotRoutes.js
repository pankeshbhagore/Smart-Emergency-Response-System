const express = require("express");

const router = express.Router();

const {
  chatbotEmergency
} = require("../controllers/chatbotController");

router.post("/", chatbotEmergency);

module.exports = router;