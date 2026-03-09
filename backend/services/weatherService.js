/**
 * REAL-TIME WEATHER SERVICE
 * Uses Open-Meteo API (free, no API key needed)
 * Provides current weather for emergency context
 */
const axios = require("axios");

const WMO_CODES = {
  0:"Clear", 1:"Mainly Clear", 2:"Partly Cloudy", 3:"Overcast",
  45:"Fog", 48:"Icy Fog", 51:"Light Drizzle", 53:"Drizzle", 55:"Heavy Drizzle",
  61:"Light Rain", 63:"Rain", 65:"Heavy Rain", 71:"Light Snow", 73:"Snow",
  75:"Heavy Snow", 77:"Snow Grains", 80:"Rain Showers", 81:"Rain Showers",
  82:"Violent Rain", 85:"Snow Showers", 86:"Snow Showers",
  95:"Thunderstorm", 96:"Thunderstorm+Hail", 99:"Thunderstorm+Hail"
};

const cache = {};
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

exports.getWeather = async (lat, lng) => {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (cache[key] && Date.now() - cache[key].ts < CACHE_TTL) return cache[key].data;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,visibility&timezone=auto`;
    const res = await axios.get(url, { timeout: 5000 });
    const c = res.data.current;
    const data = {
      condition: WMO_CODES[c.weather_code] || "Unknown",
      temperature: Math.round(c.temperature_2m),
      humidity: c.relative_humidity_2m,
      windSpeed: Math.round(c.wind_speed_10m),
      visibility: c.visibility ? Math.round(c.visibility / 1000) : null,
      weatherCode: c.weather_code,
      isHazardous: c.weather_code >= 61 || c.visibility < 1000
    };
    cache[key] = { data, ts: Date.now() };
    return data;
  } catch {
    return { condition: "Unknown", temperature: null, humidity: null, windSpeed: null, visibility: null, isHazardous: false };
  }
};

exports.getWeatherForecast = async (lat, lng) => {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,weather_code,wind_speed_10m&forecast_days=1&timezone=auto`;
    const res = await axios.get(url, { timeout: 5000 });
    const h = res.data.hourly;
    return h.time.slice(0, 24).map((t, i) => ({
      hour: new Date(t).getHours(),
      temp: Math.round(h.temperature_2m[i]),
      condition: WMO_CODES[h.weather_code[i]] || "Unknown",
      windSpeed: Math.round(h.wind_speed_10m[i])
    }));
  } catch {
    return [];
  }
};