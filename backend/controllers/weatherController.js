const weatherService = require("../services/weatherService");

exports.getCurrentWeather = async (req, res) => {
  try {
    const { lat = 22.7196, lng = 75.8577 } = req.query;
    const [current, forecast] = await Promise.all([
      weatherService.getWeather(parseFloat(lat), parseFloat(lng)),
      weatherService.getWeatherForecast(parseFloat(lat), parseFloat(lng))
    ]);
    res.json({ current, forecast: forecast.slice(0, 12) });
  } catch(err) {
    res.status(500).json({ error: "Weather service error" });
  }
};