require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const Vehicle = require("./models/Vehicle");

connectDB();

const seed = async () => {
  await Vehicle.deleteMany();
  await Vehicle.insertMany([
    // AMBULANCES
    { vehicleId:"AMB-001", name:"Ambulance Alpha", type:"Ambulance", fuelType:"EV",     batteryLevel:92, location:{lat:22.7196,lng:75.8577}, equipment:["Defibrillator","Oxygen","Stretcher","IV Kit"], crew:3, registrationNo:"MP09-EMG-001", totalTrips:147 },
    { vehicleId:"AMB-002", name:"Ambulance Bravo", type:"Ambulance", fuelType:"EV",     batteryLevel:78, location:{lat:22.7350,lng:75.8800}, equipment:["Oxygen","Ventilator","ECG Monitor"], crew:2, registrationNo:"MP09-EMG-002", totalTrips:203 },
    { vehicleId:"AMB-003", name:"Ambulance Charlie",type:"Ambulance", fuelType:"Diesel", fuelLevel:85,   location:{lat:22.7050,lng:75.8400}, equipment:["Oxygen","Stretcher"], crew:2, registrationNo:"MP09-EMG-003", totalTrips:89 },
    { vehicleId:"AMB-004", name:"ICU Mobile",       type:"Ambulance", fuelType:"Hybrid", fuelLevel:90,   location:{lat:22.7400,lng:75.8650}, equipment:["ICU Equipment","Defibrillator","Ventilator","Blood Bank"], crew:4, registrationNo:"MP09-EMG-004", totalTrips:312 },
    // FIRE TRUCKS
    { vehicleId:"FT-001",  name:"FireTruck Delta",  type:"FireTruck", fuelType:"Diesel", fuelLevel:95,   location:{lat:22.7150,lng:75.8700}, equipment:["Water Tank 5000L","Ladder 30m","Foam Cannon","SCBA Set"], crew:6, registrationNo:"MP09-FIR-001", totalTrips:67 },
    { vehicleId:"FT-002",  name:"FireTruck Echo",   type:"FireTruck", fuelType:"Diesel", fuelLevel:80,   location:{lat:22.7300,lng:75.8500}, equipment:["Water Tank 3000L","Rescue Tools","Thermal Camera"], crew:5, registrationNo:"MP09-FIR-002", totalTrips:54 },
    { vehicleId:"FT-003",  name:"HazMat Response",  type:"HazMat",    fuelType:"Diesel", fuelLevel:100,  location:{lat:22.7100,lng:75.8900}, equipment:["HazMat Suits","Chemical Detector","Decontamination Kit"], crew:4, registrationNo:"MP09-HAZ-001", totalTrips:23 },
    // POLICE
    { vehicleId:"POL-001", name:"Police Unit Alpha",type:"Police",    fuelType:"EV",     batteryLevel:88, location:{lat:22.7250,lng:75.8620}, equipment:["First Aid","Body Cam","Riot Gear"], crew:2, registrationNo:"MP09-POL-001", totalTrips:421 },
    { vehicleId:"POL-002", name:"Police Unit Bravo",type:"Police",    fuelType:"Petrol", fuelLevel:70,   location:{lat:22.7180,lng:75.8480}, equipment:["First Aid","Body Cam"], crew:2, registrationNo:"MP09-POL-002", totalTrips:389 },
    { vehicleId:"POL-003", name:"Police SUV",       type:"Police",    fuelType:"EV",     batteryLevel:65, location:{lat:22.7420,lng:75.8750}, equipment:["First Aid","Body Cam","Tactical Gear"], crew:4, registrationNo:"MP09-POL-003", totalTrips:256 },
    // TOW/RESCUE
    { vehicleId:"TOW-001", name:"TowTruck Foxtrot", type:"TowTruck",  fuelType:"Diesel", fuelLevel:88,   location:{lat:22.7320,lng:75.8380}, equipment:["Tow Crane","Winch","Safety Cones","Jump Start Kit"], crew:2, registrationNo:"MP09-TOW-001", totalTrips:178 },
    { vehicleId:"TOW-002", name:"TowTruck Golf",    type:"TowTruck",  fuelType:"Diesel", fuelLevel:72,   location:{lat:22.7080,lng:75.8800}, equipment:["Tow Crane","Winch","Safety Cones"], crew:1, registrationNo:"MP09-TOW-002", totalTrips:134 },
    // FLOOD RESCUE
    { vehicleId:"FLR-001", name:"Flood Rescue Boat",type:"FloodRescue",fuelType:"Petrol",fuelLevel:95,   location:{lat:22.7220,lng:75.8560}, equipment:["Rescue Boat","Life Jackets","Ropes","Pumps"], crew:3, registrationNo:"MP09-FLD-001", totalTrips:19 },
  ]);
  console.log("✅ 14 vehicles seeded successfully");
  process.exit();
};
seed();
