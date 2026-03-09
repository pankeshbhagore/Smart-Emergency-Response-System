const classifyEmergency = require("../services/aiClassifier");

exports.chatEmergency = async (req, res) => {

  try {

    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        error: "Message required"
      });
    }

    const emergencyType = classifyEmergency(message);

    res.json({

      detectedType: emergencyType,

      suggestion: `Detected emergency type: ${emergencyType}`

    });

  }

  catch (error) {

    res.status(500).json({
      error: "AI processing failed"
    });

  }

};