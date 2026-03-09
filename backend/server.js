require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const http     = require("http");
const { Server } = require("socket.io");
const connectDB = require("./config/db");

require("dotenv").config();

connectDB();

const app    = express();
const server = http.createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const io = new Server(server, {
  cors: {
    origin:  [FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"],
    methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
    credentials: true,
  },
  pingTimeout:  60000,
  pingInterval: 25000,
});

app.set("io", io);

app.use(cors({
  origin: [FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"],
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
}));
app.use(express.json({ limit:"5mb" }));
app.use(express.urlencoded({ extended:true }));

// ── Routes ───────────────────────────────────────────────────
app.use("/api/auth",           require("./routes/authRoutes"));
app.use("/api/emergencies",    require("./routes/emergencyRoutes"));
app.use("/api/chat",           require("./routes/chatRoutes"));
app.use("/api/chat-sessions",  require("./routes/chatSessionRoutes"));
app.use("/api/chatbot",        require("./routes/chatbotRoutes"));
app.use("/api/vehicles",       require("./routes/vehicleRoutes"));
app.use("/api/signals",        require("./routes/signalRoutes"));
app.use("/api/predictions",    require("./routes/predictionRoutes"));
app.use("/api/predict-future", require("./routes/predictionEngineRoutes"));
app.use("/api/analytics",      require("./routes/analyticsRoutes"));
app.use("/api/weather",        require("./routes/weatherRoutes"));
app.use("/api/alerts",         require("./routes/alertRoutes"));
app.use("/api/multi-agency",   require("./routes/multiAgencyRoutes"));
app.use("/api/ai",           require("./routes/aiRoutes"));
app.use("/api/nearby",         require("./routes/nearbyRoutes"));
app.use("/api/admin",          require("./routes/adminRoutes"));

app.get("/", (req, res) => res.json({
  status: "ok",
  version: "v18",
  message: "Smart City Emergency Backend  🚀",
  timestamp: new Date().toISOString(),
}));

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.stack);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

// ── Sockets ─────────────────────────────────────────────────
io.on("connection", socket => {
  console.log(`[Socket] Connected: ${socket.id}`);

  socket.on("join-room",      room => socket.join(room));
  socket.on("join-operators", ()   => { socket.join("operators"); console.log(`[Socket] ${socket.id} joined operators room`); });
  socket.on("join-emergency", id   => socket.join(`emergency:${id}`));
  socket.on("leave-emergency",id   => socket.leave(`emergency:${id}`));

  socket.on("disconnect", reason => console.log(`[Socket] Disconnected: ${socket.id} — ${reason}`));
});

// ── Periodic city metrics broadcast ─────────────────────────
const Emergency   = require("./models/Emergency");
const Vehicle     = require("./models/Vehicle");
const anomaly     = require("./ml/anomalyDetector");
const cityMetrics = require("./services/cityMetricsService");

setInterval(async () => {
  try {
    const [emergencies, vehicles] = await Promise.all([Emergency.find().lean(), Vehicle.find().lean()]);
    const surge  = anomaly.detectSurge(emergencies);
    const health = cityMetrics.computeCityHealthScore(emergencies, vehicles);
    const active = emergencies.filter(e=>!["Resolved","Cancelled"].includes(e.status));
    io.emit("cityMetricsUpdate", {
      timestamp:         new Date().toISOString(),
      activeIncidents:   active.length,
      criticalCount:     active.filter(e=>e.priority==="Critical").length,
      vehiclesAvailable: vehicles.filter(v=>v.status==="Available").length,
      surge, cityHealth: health,
    });
  } catch(e) { /* non-fatal */ }
}, 30000);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`✅ Smart Emergency Server  running on port ${PORT}`);
  console.log(`   Frontend: ${FRONTEND_URL}`);
});
