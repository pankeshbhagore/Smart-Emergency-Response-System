const Emergency = require("../models/Emergency");
const Vehicle   = require("../models/Vehicle");
const anomaly   = require("../ml/anomalyDetector");
const cityMetrics = require("../services/cityMetricsService");

exports.getAnalytics = async (req, res) => {
  try {
    const [emergencies, vehicles] = await Promise.all([
      Emergency.find().lean(), Vehicle.find().lean()
    ]);
    const total     = emergencies.length;
    const active    = emergencies.filter(e=>!["Resolved","Cancelled"].includes(e.status)).length;
    const completed = emergencies.filter(e=>e.status==="Resolved").length;
    const cancelled = emergencies.filter(e=>e.status==="Cancelled").length;

    const responses = emergencies.filter(e=>e.responseTime>0).map(e=>e.responseTime);
    const avgResponse   = responses.length ? +(responses.reduce((a,b)=>a+b,0)/responses.length).toFixed(2) : 0;
    const fastest       = responses.length ? Math.min(...responses) : 0;
    const slowest       = responses.length ? Math.max(...responses) : 0;
    const sorted        = [...responses].sort((a,b)=>a-b);
    const medianResponse= sorted.length ? sorted[Math.floor(sorted.length/2)] : 0;
    const resolutionTimes= emergencies.filter(e=>e.resolutionTime>0).map(e=>e.resolutionTime);
    const avgResolutionTime = resolutionTimes.length ? +(resolutionTimes.reduce((a,b)=>a+b,0)/resolutionTimes.length).toFixed(2) : 0;

    // Breakdowns
    const typeBreakdown={}, priorityBreakdown={}, statusBreakdown={};
    emergencies.forEach(e=>{
      typeBreakdown[e.type]         = (typeBreakdown[e.type]||0)+1;
      priorityBreakdown[e.priority] = (priorityBreakdown[e.priority]||0)+1;
      statusBreakdown[e.status]     = (statusBreakdown[e.status]||0)+1;
    });

    // ── LOCATION ANALYTICS ─────────────────────────────────
    // 1. By city
    const cityBreakdown = {};
    emergencies.forEach(e=>{
      const city = e.location?.city || e.location?.zone || "Unknown";
      if (!cityBreakdown[city]) cityBreakdown[city] = { count:0, resolved:0, totalResponse:0, responseCount:0, types:{} };
      cityBreakdown[city].count++;
      if (e.status==="Resolved") cityBreakdown[city].resolved++;
      if (e.responseTime>0) { cityBreakdown[city].totalResponse+=e.responseTime; cityBreakdown[city].responseCount++; }
      cityBreakdown[city].types[e.type] = (cityBreakdown[city].types[e.type]||0)+1;
    });
    const cityStats = Object.entries(cityBreakdown)
      .map(([city, d]) => ({
        city,
        count:       d.count,
        resolved:    d.resolved,
        resolutionRate: d.count>0 ? +((d.resolved/d.count)*100).toFixed(1) : 0,
        avgResponse: d.responseCount>0 ? Math.round(d.totalResponse/d.responseCount) : null,
        dominantType: Object.entries(d.types).sort((a,b)=>b[1]-a[1])[0]?.[0]||"—",
        types: d.types
      }))
      .sort((a,b)=>b.count-a.count)
      .slice(0,10);

    // 2. By zone/area
    const zoneBreakdown = {};
    emergencies.forEach(e=>{
      const zone = e.location?.zone || e.location?.area || e.location?.city || "Unknown";
      zoneBreakdown[zone] = (zoneBreakdown[zone]||0)+1;
    });
    const zoneStats = Object.entries(zoneBreakdown)
      .sort((a,b)=>b[1]-a[1]).slice(0,10)
      .map(([zone,count])=>({ zone, count }));

    // 3. Repeat addresses (same address ≥ 2 times)
    const addressBreakdown = {};
    emergencies.forEach(e=>{
      const addr = e.location?.address;
      if (addr && addr!=="—") addressBreakdown[addr] = (addressBreakdown[addr]||0)+1;
    });
    const repeatAddresses = Object.entries(addressBreakdown)
      .filter(([,c])=>c>=2).sort((a,b)=>b[1]-a[1]).slice(0,8)
      .map(([address,count])=>({ address, count }));

    // 4. Peak-time vs city
    const cityTimeBreakdown = {};
    emergencies.forEach(e=>{
      const city = e.location?.city||"Unknown";
      const hr   = new Date(e.createdAt).getHours();
      const shift= hr>=6&&hr<14?"morning":hr>=14&&hr<22?"afternoon":"night";
      if (!cityTimeBreakdown[city]) cityTimeBreakdown[city] = { morning:0, afternoon:0, night:0 };
      cityTimeBreakdown[city][shift]++;
    });

    // 5. Response time by city (for ranking which city is slowest)
    const cityResponseRanking = cityStats
      .filter(c=>c.avgResponse!==null)
      .sort((a,b)=>b.avgResponse-a.avgResponse)
      .slice(0,5);

    // Hourly trends
    const now = Date.now();
    const hourlyTrends = Array.from({length:24},(_,i)=>{
      const hour = new Date(now-(23-i)*3600000);
      const count= emergencies.filter(e=>{ const c=new Date(e.createdAt); return c>=hour&&c<new Date(hour.getTime()+3600000); }).length;
      return { hour:hour.getHours(), count };
    });

    // 14-day daily trends
    const dailyTrends = Array.from({length:14},(_,i)=>{
      const day  = new Date(now-(13-i)*86400000); day.setHours(0,0,0,0);
      const next = new Date(day.getTime()+86400000);
      const dayEm= emergencies.filter(e=>new Date(e.createdAt)>=day&&new Date(e.createdAt)<next);
      return {
        date: day.toLocaleDateString("en",{weekday:"short",month:"short",day:"numeric"}),
        count: dayEm.length,
        avgResponse: dayEm.filter(e=>e.responseTime>0).length ? Math.round(dayEm.filter(e=>e.responseTime>0).reduce((s,e)=>s+e.responseTime,0)/dayEm.filter(e=>e.responseTime>0).length) : 0
      };
    });

    const thisWeek = emergencies.filter(e=>now-new Date(e.createdAt)<7*86400000).length;
    const lastWeek = emergencies.filter(e=>{const a=now-new Date(e.createdAt);return a>=7*86400000&&a<14*86400000;}).length;
    const weekTrend= lastWeek>0 ? Math.round((thisWeek-lastWeek)/lastWeek*100) : 0;

    const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const dowBreakdown = DOW.map((day,i)=>({ day, count:emergencies.filter(e=>new Date(e.createdAt).getDay()===i).length }));

    const shiftAnalysis = {
      morning:   emergencies.filter(e=>{ const h=new Date(e.createdAt).getHours(); return h>=6&&h<14; }).length,
      afternoon: emergencies.filter(e=>{ const h=new Date(e.createdAt).getHours(); return h>=14&&h<22; }).length,
      night:     emergencies.filter(e=>{ const h=new Date(e.createdAt).getHours(); return h<6||h>=22; }).length,
    };

    const rtBuckets={"0-1min":0,"1-3min":0,"3-5min":0,"5-10min":0,"10+min":0};
    responses.forEach(r=>{ if(r<60)rtBuckets["0-1min"]++; else if(r<180)rtBuckets["1-3min"]++; else if(r<300)rtBuckets["3-5min"]++; else if(r<600)rtBuckets["5-10min"]++; else rtBuckets["10+min"]++; });

    const slaData    = emergencies.filter(e=>e.sla?.targetResponseTime);
    const slaBreached= slaData.filter(e=>e.sla.breached).length;
    const slaCompliance = slaData.length ? +((1-slaBreached/slaData.length)*100).toFixed(1) : 100;

    const assignedV      = vehicles.filter(v=>v.status==="Assigned").length;
    const utilizationRate= vehicles.length ? +((assignedV/vehicles.length)*100).toFixed(2) : 0;
    const evVehicles     = vehicles.filter(v=>v.fuelType==="EV");
    const evDispatches   = emergencies.filter(e=>{ const v=vehicles.find(v=>v.vehicleId===e.assignedVehicle); return v&&v.fuelType==="EV"; }).length;
    const totalCarbonSaved = +emergencies.reduce((s,e)=>s+(+e.carbonSaved||0),0).toFixed(3);
    const totalDistanceKm  = +emergencies.reduce((s,e)=>s+(+e.distanceKm||0),0).toFixed(2);
    const evRate = total>0 ? +((evDispatches/total)*100).toFixed(1) : 0;

    const withWeather = emergencies.filter(e=>e.weatherContext?.condition);
    const weatherBreakdown = {};
    withWeather.forEach(e=>{ weatherBreakdown[e.weatherContext.condition]=(weatherBreakdown[e.weatherContext.condition]||0)+1; });
    const hazardousCount = emergencies.filter(e=>e.weatherContext?.isHazardous).length;

    const anomalies  = anomaly.detectResponseTimeAnomalies(emergencies);
    const hotZones   = anomaly.detectHotZones(emergencies);
    const surge      = anomaly.detectSurge(emergencies);
    const cityHealth = cityMetrics.computeCityHealthScore(emergencies, vehicles);
    const resourceMatrix = cityMetrics.getResourceMatrix(vehicles);

    const performance = Math.min(100, Math.round(
      (slaCompliance*0.4)+(cityHealth.safetyScore*0.3)+(100-utilizationRate)*0.15+(evRate)*0.15
    ));

    const vehiclePerformance = vehicles
      .filter(v=>v.totalTrips>0).sort((a,b)=>b.totalTrips-a.totalTrips).slice(0,5)
      .map(v=>({ vehicleId:v.vehicleId, name:v.name, trips:v.totalTrips, co2Saved:v.totalCarbonSaved||0, fuelType:v.fuelType }));

    res.json({
      total, totalEmergencies:total, active, completed, cancelled,
      resolutionRate: total>0 ? +((completed/total)*100).toFixed(1) : 0,
      avgResponse, fastest, slowest, medianResponse, avgResolutionTime,
      responseTimeBuckets: rtBuckets,
      performance, slaCompliance, slaBreached, slaTotal:slaData.length,
      hourlyTrends, dailyTrends, shiftAnalysis, dowBreakdown,
      weekTrend, thisWeek, lastWeek,
      typeBreakdown, priorityBreakdown, statusBreakdown, weatherBreakdown, hazardousCount,
      vehicleStats:{ total:vehicles.length, available:vehicles.length-assignedV, assigned:assignedV, utilizationRate, evCount:evVehicles.length },
      resourceMatrix, vehiclePerformance,
      sustainability:{ totalCarbonSaved, evDispatches, evPercentage:evRate, totalDistanceKm, co2WouldHaveEmitted:+(totalDistanceKm*0.27).toFixed(2) },
      anomalies:{ count:anomalies.length, items:anomalies.slice(0,5) },
      hotZones: hotZones.slice(0,10),
      surge, cityHealth,
      // ── NEW: Location analytics ──
      locationAnalytics: {
        cityStats,
        zoneStats,
        repeatAddresses,
        cityTimeBreakdown,
        cityResponseRanking,
        totalCitiesCovered: Object.keys(cityBreakdown).length,
        mostActiveCity: cityStats[0]?.city || "—",
        slowestCity:    cityResponseRanking[0]?.city || "—",
      }
    });
  } catch(err) {
    console.error("Analytics error:", err);
    res.status(500).json({ error:"Analytics error" });
  }
};

exports.getRealtimeMetrics = async (req, res) => {
  try {
    const [emergencies, vehicles] = await Promise.all([
      Emergency.find().lean(), Vehicle.find().lean()
    ]);
    const surge      = anomaly.detectSurge(emergencies);
    const cityHealth = cityMetrics.computeCityHealthScore(emergencies, vehicles);
    const active     = emergencies.filter(e=>!["Resolved","Cancelled"].includes(e.status));
    res.json({
      timestamp: new Date().toISOString(),
      activeIncidents:   active.length,
      criticalCount:     active.filter(e=>e.priority==="Critical").length,
      vehiclesAvailable: vehicles.filter(v=>v.status==="Available").length,
      surge, cityHealth
    });
  } catch(err) { res.status(500).json({ error:"Metrics error" }); }
};
