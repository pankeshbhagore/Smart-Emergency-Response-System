exports.calculateCarbonImpact = (
  distanceMeters,
  vehicleType
) => {

  const distanceKm = distanceMeters / 1000;

  const dieselFactor = 0.27;  // kg/km
  const evFactor = 0.05;      // kg/km

  const dieselEmission = distanceKm * dieselFactor;
  const selectedEmission =
    vehicleType === "EV"
      ? distanceKm * evFactor
      : distanceKm * dieselFactor;

  const carbonSaved =
    vehicleType === "EV"
      ? dieselEmission - selectedEmission
      : 0;

  return {
    dieselEmission: Number(dieselEmission.toFixed(3)),
    selectedEmission: Number(selectedEmission.toFixed(3)),
    carbonSaved: Number(carbonSaved.toFixed(3))
  };
};