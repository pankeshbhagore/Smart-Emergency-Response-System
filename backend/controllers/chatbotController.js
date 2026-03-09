const firstAid = require("../services/firstAidEngine");

const DETECT_TYPE = msg => {
  const m = msg.toLowerCase();
  if (m.match(/fire|burn|flame|smoke|blast/))         return "Fire";
  if (m.match(/gas|leak|fumes|smell|chemical/))        return "Gas Leak";
  if (m.match(/flood|drown|water|rain.*road|submerge/))return "Flood";
  if (m.match(/accident|crash|collision|hit.*car|car.*hit/)) return "Accident";
  if (m.match(/heart|medical|unconscious|bleeding|pain|faint|chest|stroke|injury|injured|sick/)) return "Medical";
  if (m.match(/crime|rob|assault|attack|theft|threat|weapon/)) return "Crime";
  if (m.match(/breakdown|car broke|tyre|puncture|engine stall|car stopped/)) return "Breakdown";
  return null;
};

const AI_RESPONSES = {
  Fire:      "🔥 **Fire detected!**\n\nImmediate actions:\n1. Evacuate the building — don't use lifts\n2. Call 101 (Fire Brigade) + 108 (Ambulance)\n3. Close doors to slow fire spread\n4. Signal from a window if trapped\n\nI'm reporting your emergency now.",
  Medical:   "🏥 **Medical emergency detected!**\n\nWhile help is coming:\n1. Keep the person calm and still\n2. Don't give food/water if unconscious\n3. If no pulse: start CPR (30 compressions, 2 breaths)\n4. Call 108 immediately\n\nReporting your location now.",
  Accident:  "💥 **Road accident detected!**\n\nImmediate actions:\n1. Don't move injured persons — spinal injury risk\n2. Turn on hazard lights\n3. Clear the scene of bystanders\n4. Note vehicle numbers for police\n\nDispatching help to your location.",
  Crime:     "🚔 **Crime in progress detected!**\n\nStay safe:\n1. Move to a safe location\n2. Don't confront the person\n3. Note physical description\n4. Call 100 (Police)\n\nAlert sent. Police being dispatched.",
  Flood:     "🌊 **Flood emergency detected!**\n\nSurvival actions:\n1. Move to higher ground IMMEDIATELY\n2. Don't walk/drive through floodwater\n3. Disconnect electrical appliances\n4. Call 1078 (Disaster Management)\n\nFlood rescue team being dispatched.",
  "Gas Leak":"💨 **Gas leak detected!**\n\n⚠️ DANGER:\n1. DO NOT switch on lights or appliances\n2. Open all windows and doors\n3. Evacuate immediately\n4. Call from outside — 101 Fire Brigade\n\nHazMat team being dispatched.",
  Breakdown: "🔧 **Vehicle breakdown detected!**\n\nStay safe:\n1. Pull off the road if possible\n2. Turn on hazard lights\n3. Stay behind crash barrier\n4. Place warning triangle 50m behind\n\nTow truck being dispatched.",
};

const FIRST_AID_PROMPTS = ["cpr","how to","bleed","burn","fracture","unconscious","first aid","what should","help me"];

exports.chatbotEmergency = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error:"Message required" });

    const detectedType = DETECT_TYPE(message);
    const lm = message.toLowerCase();

    // First aid query?
    const isFirstAidQuery = FIRST_AID_PROMPTS.some(p => lm.includes(p));
    if (isFirstAidQuery && !detectedType) {
      const guideType = firstAid.detectFromMessage(message) || "Medical";
      const { answer } = firstAid.answerQuestion(message, guideType);
      return res.json({
        response: `🩺 **First Aid Guidance (${guideType}):**\n\n${answer}`,
        detectedType: null,
        isFirstAid: true,
      });
    }

    if (!detectedType) {
      return res.json({
        response: "⚠️ I couldn't identify the emergency type.\n\nPlease describe more clearly:\n• \"There is a fire\"\n• \"Road accident happened\"\n• \"I need medical help\"\n• \"Gas leak smell\"\n• \"My car broke down\"\n• \"Flooding in my area\"",
        detectedType: null,
      });
    }

    // Return AI response with first aid if relevant
    let response = AI_RESPONSES[detectedType] || `🚨 ${detectedType} emergency detected. Help is being dispatched.`;

    // Append quick first aid tip
    try {
      const guide = firstAid.getGuide(detectedType);
      if (guide?.steps?.length) {
        const step1 = guide.steps[0];
        response += `\n\n**Immediate First Aid — Step 1:**\n${step1.num}. **${step1.title}**: ${step1.text}`;
      }
    } catch(e){}

    res.json({ response, detectedType });
  } catch(err) {
    console.error("Chatbot error:", err);
    res.status(500).json({ error:"Chatbot failed" });
  }
};
