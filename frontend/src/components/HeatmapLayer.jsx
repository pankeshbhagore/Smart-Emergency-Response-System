/**
 * HeatmapLayer v17 — Pure CSS/SVG heatmap (no leaflet.heat needed)
 * Uses CircleMarkers with gradient opacity to simulate heat effect
 */
import { CircleMarker, Tooltip } from "react-leaflet";

const HEAT_COLORS = {
  Critical: { fill:"#FF0000", opacity:0.55 },
  High:     { fill:"#FF6600", opacity:0.45 },
  Medium:   { fill:"#FFCC00", opacity:0.35 },
  Normal:   { fill:"#00C8FF", opacity:0.25 },
  Low:      { fill:"#00E676", opacity:0.20 },
};

export default function HeatmapLayer({ incidents = [] }) {
  if (!incidents.length) return null;

  return incidents.map((e, i) => {
    if (!e.location?.lat || !e.location?.lng) return null;
    const h = HEAT_COLORS[e.priority] || HEAT_COLORS.Normal;
    return (
      <CircleMarker
        key={`heat-${e._id || i}`}
        center={[e.location.lat, e.location.lng]}
        radius={28}
        pathOptions={{ color:"transparent", fillColor:h.fill, fillOpacity:h.opacity, weight:0 }}
      >
        <Tooltip>
          🌡 {e.type} · {e.priority}<br/>
          {e.location?.road || e.location?.city || ""}
        </Tooltip>
      </CircleMarker>
    );
  });
}
