/**
 * CITY METRICS SERVICE
 * Real-time city health indicators:
 * - Emergency load index (ELI)
 * - City safety score
 * - Resource availability index
 * - Response efficiency trend
 */

const WEIGHTS = { Critical: 10, High: 6, Medium: 3, Normal: 2, Low: 1 };

exports.computeCityHealthScore = (emergencies, vehicles) => {
  const now = Date.now();
  const last24h = emergencies.filter(e => now - new Date(e.createdAt) < 86400000);
  const active = emergencies.filter(e => e.status !== "Resolved" && e.status !== "Cancelled");

  // Emergency Load Index (0-100, lower is better)
  const loadScore = active.reduce((sum, e) => sum + (WEIGHTS[e.priority] || 2), 0);
  const eli = Math.min(100, Math.round((loadScore / 50) * 100));

  // Resource utilization
  const assignedVehicles = vehicles.filter(v => v.status === "Assigned").length;
  const vehicleLoad = vehicles.length > 0
    ? Math.round((assignedVehicles / vehicles.length) * 100) : 0;

  // Response efficiency (resolved in SLA / total resolved)
  const resolved = emergencies.filter(e => e.status === "Resolved" && e.sla);
  const slaCompliant = resolved.filter(e => !e.sla.breached).length;
  const slaRate = resolved.length > 0 ? Math.round((slaCompliant / resolved.length) * 100) : 100;

  // City Safety Score (0-100, higher is better)
  const safetyScore = Math.max(0, Math.round(100 - (eli * 0.4) - (vehicleLoad * 0.3) + (slaRate * 0.3)));

  // Trend: compare last 12h vs prior 12h
  const last12h = last24h.filter(e => now - new Date(e.createdAt) < 43200000).length;
  const prior12h = last24h.filter(e => {
    const age = now - new Date(e.createdAt);
    return age >= 43200000 && age < 86400000;
  }).length;
  const trend = prior12h === 0 ? 0 : Math.round(((last12h - prior12h) / prior12h) * 100);

  return {
    safetyScore,
    emergencyLoadIndex: eli,
    vehicleUtilization: vehicleLoad,
    slaComplianceRate: slaRate,
    activeIncidents: active.length,
    last24hTotal: last24h.length,
    trend,                              // % change vs prior 12h
    trendDirection: trend > 10 ? "rising" : trend < -10 ? "falling" : "stable",
    alertLevel: eli >= 70 ? "CRITICAL" : eli >= 50 ? "HIGH" : eli >= 30 ? "ELEVATED" : "NORMAL"
  };
};

exports.getResourceMatrix = (vehicles) => {
  const byType = {};
  vehicles.forEach(v => {
    if (!byType[v.type]) byType[v.type] = { total: 0, available: 0, assigned: 0, evCount: 0 };
    byType[v.type].total++;
    if (v.status === "Available") byType[v.type].available++;
    if (v.status === "Assigned") byType[v.type].assigned++;
    if (v.fuelType === "EV") byType[v.type].evCount++;
  });
  Object.keys(byType).forEach(type => {
    byType[type].readiness = byType[type].total > 0
      ? Math.round((byType[type].available / byType[type].total) * 100) : 0;
  });
  return byType;
};
