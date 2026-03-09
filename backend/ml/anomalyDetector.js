const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const std = (arr) => {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / arr.length);
};
const zScore = (value, m, s) => s === 0 ? 0 : (value - m) / s;

exports.detectResponseTimeAnomalies = (emergencies) => {
  const withResponse = emergencies.filter(e => e.responseTime && e.responseTime > 0);
  if (withResponse.length < 3) return [];
  const times = withResponse.map(e => e.responseTime);
  const m = mean(times); const s = std(times);
  return withResponse
    .map(e => ({ id: e._id, type: e.type, responseTime: e.responseTime, zScore: zScore(e.responseTime, m, s), direction: e.responseTime > m ? "slow" : "fast" }))
    .filter(e => Math.abs(e.zScore) > 2);
};

exports.detectHotZones = (emergencies) => {
  const zones = {};
  emergencies.forEach(e => {
    if (!e.location) return;
    const key = ((e.location.lat).toFixed(2)) + "," + ((e.location.lng).toFixed(2));
    if (!zones[key]) zones[key] = { lat: e.location.lat, lng: e.location.lng, count: 0, types: [] };
    zones[key].count++;
    zones[key].types.push(e.type);
  });
  return Object.values(zones).filter(z => z.count >= 3).map(z => ({
    ...z,
    riskMultiplier: z.count >= 8 ? 3.0 : z.count >= 5 ? 2.0 : 1.5,
    dominantType: z.types.sort((a,b) => z.types.filter(t=>t===b).length - z.types.filter(t=>t===a).length)[0]
  }));
};

exports.detectSurge = (emergencies) => {
  const now = Date.now();
  const lastHour = emergencies.filter(e => now - new Date(e.createdAt) < 3600000).length;
  const buckets = Array.from({length:24},(_,i)=>emergencies.filter(e=>{const age=now-new Date(e.createdAt);return age>=(i+1)*3600000&&age<(i+2)*3600000;}).length);
  const baseline = buckets.length ? mean(buckets) : 0;
  const ratio = baseline > 0 ? lastHour / baseline : 0;
  return { currentHourCount: lastHour, baseline: Math.round(baseline*10)/10, surgeRatio: Math.round(ratio*100)/100, isSurge: ratio>=2, level: ratio>=4?"CRITICAL":ratio>=2?"HIGH":ratio>=1.5?"ELEVATED":"NORMAL" };
};

exports.getSLATarget = (priority) => ({ Critical:180, High:300, Medium:480, Normal:600, Low:900 }[priority] || 600);

exports.computeSeverityScore = (type, priority, weatherCondition, repeatCount=0) => {
  const ts = { Fire:90, Accident:80, "Gas Leak":85, Medical:75, Crime:70, Flood:65, Breakdown:30, Other:40 };
  const ps = { Critical:40, High:30, Medium:20, Normal:10, Low:5 };
  const ws = { Storm:20, Fog:15, Rain:10, Snow:15, Clear:0, Clouds:5 };
  return Math.min(100, Math.round((ts[type]||50)*0.5 + (ps[priority]||10)*0.3 + (ws[weatherCondition]||0)*0.1 + Math.min(repeatCount*5,20)*0.1));
};
