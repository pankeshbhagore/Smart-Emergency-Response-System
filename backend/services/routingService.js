const axios = require("axios");

const getRoute = async (startLat, startLng, endLat, endLng) => {
  try {
    const url = `http://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;

    const response = await axios.get(url);

    const route = response.data.routes[0];

    return {
      distance: route.distance,
      duration: route.duration,
      geometry: route.geometry.coordinates
    };
  } catch (error) {
    console.error("Routing error:", error);
    return null;
  }
};

module.exports = getRoute;