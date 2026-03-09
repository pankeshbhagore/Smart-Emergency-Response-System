const ChatSession = require("../models/ChatSession");
const firstAid   = require("../services/firstAidEngine");

// GET or CREATE session for an emergency
exports.getOrCreateSession = async (req, res) => {
  try {
    const { emergencyId } = req.params;
    let session = await ChatSession.findOne({ emergencyId });
    if (!session) {
      // Create with welcome message
      session = await ChatSession.create({
        emergencyId,
        citizenId:  req.user?.role === "Citizen"  ? req.user.id : null,
        operatorId: req.user?.role === "Operator" ? req.user.id : null,
        messages: [{
          from: "System",
          text: "💬 Chat session opened. Operator will respond shortly. You can ask for first aid guidance here.",
          type: "system",
          at: new Date()
        }]
      });
    }
    // Mark who's online
    if (req.user?.role === "Citizen")  session.citizenOnline  = true;
    if (req.user?.role === "Operator") session.operatorOnline = true;
    await session.save();
    res.json(session);
  } catch(err) { res.status(500).json({ error: "Server error" }); }
};

// POST message to session
exports.sendMessage = async (req, res) => {
  try {
    const { emergencyId } = req.params;
    const { text, type = "text" } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: "Message required" });

    let session = await ChatSession.findOne({ emergencyId });
    if (!session) return res.status(404).json({ error: "Session not found" });

    const from = req.user?.role || "Citizen";
    const msg = {
      from,
      fromId: req.user?.id || null,
      text: text.trim(),
      type,
      at: new Date()
    };
    session.messages.push(msg);
    session.lastMessageAt = new Date();

    // Auto first-aid AI response if citizen asks
    let aiResponse = null;
    if (from === "Citizen") {
      const lower = text.toLowerCase();
      const guideType = firstAid.detectFromMessage(text);
      if (lower.includes("how") || lower.includes("what should") || lower.includes("help me") || lower.includes("first aid") || guideType) {
        const emergencyType = guideType || "Medical";
        const { answer } = firstAid.answerQuestion(text, emergencyType);
        aiResponse = {
          from: "AI",
          text: `🤖 AI First Aid Guide:\n\n${answer}`,
          type: "firstaid",
          at: new Date()
        };
        session.messages.push(aiResponse);
      }
    }

    await session.save();

    const io = req.app.get("io");
    const room = `emergency:${emergencyId}`;
    io?.to(room).emit("chatMessage", { emergencyId, message: msg, sessionId: session._id });
    if (aiResponse) io?.to(room).emit("chatMessage", { emergencyId, message: aiResponse, sessionId: session._id });

    // Notify operator of new citizen message
    if (from === "Citizen") {
      io?.to("operators").emit("citizenChatMessage", { emergencyId, text: text.slice(0,80), from: req.user?.name || "Citizen" });
    }

    res.json({ message: msg, aiResponse, sessionId: session._id });
  } catch(err) { res.status(500).json({ error: "Server error" }); }
};

// GET all sessions (operator view)
exports.getAllSessions = async (req, res) => {
  try {
    const sessions = await ChatSession.find({ status: "open" })
      .populate("emergencyId", "type priority status location")
      .sort({ lastMessageAt: -1 }).lean();
    res.json(sessions);
  } catch(err) { res.status(500).json({ error: "Server error" }); }
};

// POST /api/chat-sessions/:emergencyId/firstaid  — operator sends first aid guide to citizen
exports.sendFirstAidGuide = async (req, res) => {
  try {
    const { emergencyId } = req.params;
    const { emergencyType } = req.body;
    const guide = firstAid.getGuide(emergencyType || "Medical");

    let session = await ChatSession.findOne({ emergencyId });
    if (!session) return res.status(404).json({ error: "Session not found" });

    const guideText = `${guide.icon} ${guide.title}\n\n` +
      guide.steps.map(s => `${s.num}. **${s.title}**\n${s.text}`).join("\n\n") +
      (guide.doNot?.length ? `\n\n❌ DO NOT:\n` + guide.doNot.map(d=>`• ${d}`).join("\n") : "");

    const msg = {
      from: "Operator",
      fromId: req.user?.id || null,
      text: guideText,
      type: "firstaid",
      at: new Date()
    };
    session.messages.push(msg);
    session.lastMessageAt = new Date();
    await session.save();

    req.app.get("io")?.to(`emergency:${emergencyId}`).emit("chatMessage", {
      emergencyId, message: msg, sessionId: session._id
    });

    res.json({ message: msg });
  } catch(err) { res.status(500).json({ error: "Server error" }); }
};

// PATCH close session
exports.closeSession = async (req, res) => {
  try {
    const session = await ChatSession.findOneAndUpdate(
      { emergencyId: req.params.emergencyId },
      { status: "closed" },
      { new: true }
    );
    res.json(session);
  } catch(err) { res.status(500).json({ error: "Server error" }); }
};
