/**
 * NEARBY SERVICES FINDER
 * Uses Overpass API (OpenStreetMap) — completely free, no API key
 * Returns hospitals, police, fire, pharmacies, blood banks, mechanics
 */
const axios = require("axios");

const CATEGORY_MAP = {
  hospital:     { query:`node["amenity"="hospital"]`, icon:"🏥", label:"Hospital" },
  clinic:       { query:`node["amenity"="clinic"]`,   icon:"🏥", label:"Clinic" },
  pharmacy:     { query:`node["amenity"="pharmacy"]`, icon:"💊", label:"Pharmacy" },
  police:       { query:`node["amenity"="police"]`,   icon:"🚔", label:"Police Station" },
  fire_station: { query:`node["amenity"="fire_station"]`, icon:"🚒", label:"Fire Station" },
  blood_bank:   { query:`node["amenity"="blood_bank"]`,   icon:"🩸", label:"Blood Bank" },
  mechanic:     { query:`node["shop"="car_repair"]`,      icon:"🔧", label:"Auto Mechanic" },
  fuel:         { query:`node["amenity"="fuel"]`,         icon:"⛽", label:"Petrol Station" },
  atm:          { query:`node["amenity"="atm"]`,          icon:"🏧", label:"ATM" },
};

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

function buildQuery(lat, lng, radiusM, categories) {
  const catList = categories.map(c => CATEGORY_MAP[c]).filter(Boolean);
  const parts   = catList.map(c => `${c.query}(around:${radiusM},${lat},${lng});`).join("\n");
  return `[out:json][timeout:10];\n(\n${parts}\n);\nout body 20;`;
}

function haversine(lat1, lng1, lat2, lng2) {
  const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return +(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))).toFixed(2);
}

function estimateWalkTime(distKm) {
  const mins = Math.round(distKm / 0.08); // ~5km/h walking
  return mins <= 1 ? "<1 min" : `~${mins} min walk`;
}

function estimateDriveTime(distKm) {
  const mins = Math.round(distKm / 0.67); // ~40km/h city
  return mins <= 1 ? "<1 min" : `~${mins} min drive`;
}

exports.getNearbyServices = async (lat, lng, categories = null, radiusKm = 3) => {
  const cats = categories || ["hospital","pharmacy","police","fire_station","blood_bank","mechanic","fuel"];
  const radiusM = radiusKm * 1000;
  const query = buildQuery(lat, lng, radiusM, cats);

  try {
    const resp = await axios.post(OVERPASS_URL, `data=${encodeURIComponent(query)}`, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 12000
    });

    const elements = resp.data?.elements || [];

    // Group by amenity/shop type
    const results = {};
    elements.forEach(el => {
      const tags = el.tags || {};
      const amenity = tags.amenity || tags.shop;
      let category = Object.entries(CATEGORY_MAP).find(([k, v]) => {
        return tags.amenity === k || tags.shop === "car_repair" && k === "mechanic";
      });
      if (!category) {
        if (tags.amenity === "hospital" || tags.amenity === "clinic") category = ["hospital", CATEGORY_MAP.hospital];
        else if (tags.amenity === "pharmacy") category = ["pharmacy", CATEGORY_MAP.pharmacy];
        else if (tags.amenity === "police") category = ["police", CATEGORY_MAP.police];
        else if (tags.amenity === "fire_station") category = ["fire_station", CATEGORY_MAP.fire_station];
        else if (tags.amenity === "blood_bank") category = ["blood_bank", CATEGORY_MAP.blood_bank];
        else if (tags.shop === "car_repair") category = ["mechanic", CATEGORY_MAP.mechanic];
        else if (tags.amenity === "fuel") category = ["fuel", CATEGORY_MAP.fuel];
        else return;
      }

      const [catKey, catDef] = category;
      const distKm = haversine(lat, lng, el.lat, el.lon);
      const service = {
        id:      el.id,
        name:    tags.name || tags["name:en"] || catDef.label,
        type:    catKey,
        icon:    catDef.icon,
        label:   catDef.label,
        lat:     el.lat,
        lng:     el.lon,
        distKm,
        walkTime:  estimateWalkTime(distKm),
        driveTime: estimateDriveTime(distKm),
        phone:   tags.phone || tags["contact:phone"] || null,
        address: [tags["addr:street"], tags["addr:housenumber"], tags["addr:city"]].filter(Boolean).join(", "),
        website: tags.website || tags["contact:website"] || null,
        openNow: tags.opening_hours ? null : null, // OSM may have this
      };

      if (!results[catKey]) results[catKey] = [];
      results[catKey].push(service);
    });

    // Sort each category by distance, keep top 5
    Object.keys(results).forEach(k => {
      results[k].sort((a, b) => a.distKm - b.distKm);
      results[k] = results[k].slice(0, 5);
    });

    return {
      success: true,
      services: results,
      totalFound: elements.length,
      searchRadius: radiusKm,
      center: { lat, lng },
    };

  } catch(err) {
    // Fallback: return well-known emergency numbers
    return {
      success: false,
      error: "Live search unavailable",
      services: {},
      emergencyNumbers: [
        { name:"Ambulance",       number:"108", icon:"🚑" },
        { name:"Police",          number:"100", icon:"🚔" },
        { name:"Fire Brigade",    number:"101", icon:"🚒" },
        { name:"Women Helpline",  number:"1091",icon:"👩" },
        { name:"Child Helpline",  number:"1098",icon:"👶" },
        { name:"Disaster Mgmt",   number:"1078",icon:"⛑" },
        { name:"National Emergency",number:"112",icon:"🆘" },
      ]
    };
  }
};

// Get category list for a given emergency type
exports.getRelevantCategories = (emergencyType) => {
  const map = {
    Medical:     ["hospital","clinic","pharmacy","blood_bank"],
    Fire:        ["fire_station","hospital"],
    Accident:    ["hospital","clinic","police","fuel"],
    Crime:       ["police"],
    Breakdown:   ["mechanic","fuel","police"],
    Flood:       ["hospital","police","fuel"],
    "Gas Leak":  ["fire_station","hospital","police"],
    Other:       ["hospital","police","pharmacy"],
  };
  return map[emergencyType] || ["hospital","police","pharmacy"];
};
