require("dotenv").config();
const connectDB = require("./config/db");
const TrafficSignal = require("./models/TrafficSignal");

connectDB();

const seedSignals = async () => {
  await TrafficSignal.deleteMany();
  await TrafficSignal.insertMany([
    // MG Road / Vijay Nagar corridor
    { signalId:"SIG-MG-01",  address:"MG Road & AB Road Junction",      location:{ lat:22.7196, lng:75.8577 } },
    { signalId:"SIG-MG-02",  address:"MG Road near Treasure Island",    location:{ lat:22.7215, lng:75.8610 } },
    { signalId:"SIG-MG-03",  address:"Vijay Nagar Square",              location:{ lat:22.7350, lng:75.8800 } },
    // Bhawarkuan - Rajwada
    { signalId:"SIG-BK-01",  address:"Bhawarkuan Square",               location:{ lat:22.7050, lng:75.8400 } },
    { signalId:"SIG-BK-02",  address:"Rajwada Chowk",                   location:{ lat:22.7180, lng:75.8480 } },
    // Palasia / Ring Road
    { signalId:"SIG-PAL-01", address:"Palasia Square",                  location:{ lat:22.7250, lng:75.8620 } },
    { signalId:"SIG-PAL-02", address:"Ring Road & LIG Junction",        location:{ lat:22.7300, lng:75.8500 } },
    // Bhanwarkuan - Airport
    { signalId:"SIG-AIR-01", address:"Airport Road Junction",           location:{ lat:22.7100, lng:75.8900 } },
    { signalId:"SIG-AIR-02", address:"Lasudia Mori Junction",          location:{ lat:22.7420, lng:75.8750 } },
    // South Indore
    { signalId:"SIG-STH-01", address:"Rajendra Nagar Chowk",            location:{ lat:22.7080, lng:75.8800 } },
    { signalId:"SIG-STH-02", address:"Scheme 54 Square",                location:{ lat:22.7220, lng:75.8560 } },
    // Manik Bagh Road
    { signalId:"SIG-MBR-01", address:"Manik Bagh Road & Main",          location:{ lat:22.7320, lng:75.8380 } },
    // AB Road
    { signalId:"SIG-AB-01",  address:"AB Road near Annapurna",          location:{ lat:22.7150, lng:75.8700 } },
    { signalId:"SIG-AB-02",  address:"AB Road Bombay Hospital",         location:{ lat:22.7400, lng:75.8650 } },
  ]);
  console.log("✅ 14 traffic signals seeded across Indore!");
  process.exit();
};

seedSignals();
