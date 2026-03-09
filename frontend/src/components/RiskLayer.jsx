/**
 * RiskLayer v17 — ML prediction risk zones on map
 */
import { CircleMarker, Tooltip } from "react-leaflet";

const RISK_STYLE = {
  High:   { fill:"#FF0000", opacity:0.30, radius:40 },
  Medium: { fill:"#FF8800", opacity:0.22, radius:30 },
  Low:    { fill:"#FFCC00", opacity:0.18, radius:22 },
};

export default function RiskLayer({ predictions = [] }) {
  if (!predictions.length) return null;

  return predictions.map((p, i) => {
    if (!p.lat || !p.lng) return null;
    const s = RISK_STYLE[p.riskLevel] || RISK_STYLE.Low;
    return (
      <CircleMarker
        key={`risk-${i}`}
        center={[p.lat, p.lng]}
        radius={s.radius}
        pathOptions={{ color:s.fill, fillColor:s.fill, fillOpacity:s.opacity, weight:1, opacity:0.6 }}
      >
        <Tooltip>
          🔮 {p.riskLevel} Risk — {p.predictedEmergency}<br/>
          Probability: {p.probability}%<br/>
          Peak: {p.peakHour}:00 · {p.historicalCases} past cases
        </Tooltip>
      </CircleMarker>
    );
  });
}
