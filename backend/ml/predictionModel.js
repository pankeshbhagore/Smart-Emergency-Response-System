/**
 * ADVANCED PREDICTION ENGINE
 * - Time-series frequency analysis per location
 * - Day-of-week + hour-of-day pattern detection
 * - Next incident probability estimation
 * - Resource pre-positioning recommendations
 */

exports.buildTimeSeriesModel = (emergencies) => {
  const model = {};

  emergencies.forEach(e => {
    if (!e.location) return;
    const key = `${(e.location.lat).toFixed(2)},${(e.location.lng).toFixed(2)}`;
    if (!model[key]) {
      model[key] = {
        lat: e.location.lat, lng: e.location.lng,
        total: 0, types: {}, hours: Array(24).fill(0),
        days: Array(7).fill(0), monthlyTrend: Array(12).fill(0),
        recentCount: 0
      };
    }
    const d = new Date(e.createdAt);
    model[key].total++;
    model[key].types[e.type] = (model[key].types[e.type] || 0) + 1;
    model[key].hours[d.getHours()]++;
    model[key].days[d.getDay()]++;
    model[key].monthlyTrend[d.getMonth()]++;
    if (Date.now() - d < 7 * 24 * 3600000) model[key].recentCount++;
  });

  return model;
};

const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const findPeak = (arr) => arr.indexOf(Math.max(...arr));
const normalize = (arr) => {
  const max = Math.max(...arr);
  return max > 0 ? arr.map(v => Math.round((v/max)*100)) : arr;
};

exports.generatePredictions = (model, currentHour = new Date().getHours(), currentDay = new Date().getDay()) => {
  return Object.values(model)
    .filter(z => z.total >= 2)
    .map(z => {
      const entries = Object.entries(z.types);
      if (!entries.length) return null;

      const mostCommon = entries.sort((a,b)=>b[1]-a[1])[0][0];
      const peakHour = findPeak(z.hours);
      const peakDay = findPeak(z.days);

      // Probability: higher if current time matches peak patterns
      const hourMatch = Math.abs(currentHour - peakHour) <= 2;
      const dayMatch = currentDay === peakDay;
      const recencyBoost = z.recentCount > 0 ? 1.3 : 1.0;

      let baseProbability = Math.min(95, (z.total / 20) * 100);
      if (hourMatch) baseProbability *= 1.4;
      if (dayMatch) baseProbability *= 1.2;
      baseProbability *= recencyBoost;
      baseProbability = Math.min(95, Math.round(baseProbability));

      const riskLevel = baseProbability >= 60 ? "High" : baseProbability >= 35 ? "Medium" : "Low";

      const typePercents = {};
      entries.forEach(([type, count]) => {
        typePercents[type] = Math.round((count/z.total)*100);
      });

      return {
        lat: z.lat, lng: z.lng,
        riskLevel,
        probability: baseProbability,
        predictedEmergency: mostCommon,
        typeDistribution: typePercents,
        historicalCases: z.total,
        recentCases: z.recentCount,
        peakHour, peakDay: DAY_NAMES[peakDay],
        hourlyPattern: normalize(z.hours),
        weeklyPattern: normalize(z.days),
        recommendation: `Pre-position ${mostCommon} unit. Peak: ${peakHour}:00 on ${DAY_NAMES[peakDay]}s`,
        alertNow: hourMatch && dayMatch && z.recentCount > 0
      };
    })
    .filter(Boolean)
    .sort((a,b) => b.probability - a.probability);
};
