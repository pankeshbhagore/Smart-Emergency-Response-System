/**
 * REVERSE GEOCODING SERVICE v14
 * Uses OpenStreetMap Nominatim — free, no API key
 * Returns rich address components for display & storage
 */
const axios = require("axios");

const cache = {};
const CACHE_TTL = 10 * 60 * 1000; // 10 min

exports.reverseGeocode = async (lat, lng) => {
  const key = `${parseFloat(lat).toFixed(4)},${parseFloat(lng).toFixed(4)}`;
  if (cache[key] && Date.now() - cache[key].ts < CACHE_TTL) return cache[key].data;

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
    const res = await axios.get(url, {
      timeout: 6000,
      headers: { "User-Agent": "SmartEmergencySystem/14.0 (contact@smartemergency.local)" }
    });

    const a = res.data.address || {};

    const road         = a.road || a.pedestrian || a.footway || a.path || a.highway || "";
    const neighbourhood= a.neighbourhood || a.residential || a.hamlet || "";
    const suburb       = a.suburb || a.village || "";
    const area         = neighbourhood || suburb || a.county_division || "";
    const city         = a.city || a.town || a.municipality || a.county || "";
    const district     = a.city_district || a.district || "";
    const state        = a.state || "";
    const postcode     = a.postcode || "";
    const country      = a.country || "";

    // Short readable name (for display in tight spaces)
    const shortParts = [road, neighbourhood||suburb, city].filter(Boolean);
    const shortName  = shortParts.slice(0,2).join(", ") || res.data.display_name?.split(",")[0] || `${lat.toFixed(4)},${lng.toFixed(4)}`;

    // Full name
    const fullParts = [road, area, city, district, state].filter(Boolean);
    const fullName  = fullParts.join(", ") || res.data.display_name || shortName;

    // Display lines for UI
    const displayLine1 = [road, neighbourhood||suburb].filter(Boolean).join(", ") || city;
    const displayLine2 = [city, state, postcode].filter(Boolean).join(", ");

    const data = {
      shortName, fullName,
      displayName: res.data.display_name || fullName,
      displayLine1, displayLine2,
      road, neighbourhood, suburb, area,
      city, district, state, postcode, country,
      zone: area || city,
      address: shortName,
    };

    cache[key] = { data, ts: Date.now() };
    return data;
  } catch (err) {
    console.error("Geocoding error:", err.message);
    const fallback = `${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`;
    return {
      shortName: fallback, fullName: fallback,
      displayName: fallback, displayLine1: fallback, displayLine2: "",
      road:"", neighbourhood:"", suburb:"", area:"",
      city:"", district:"", state:"", postcode:"", country:"",
      zone:"", address: fallback,
    };
  }
};
