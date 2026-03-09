import { useState, useEffect, useCallback } from "react";
import api from "../services/api";
import socket from "../services/socket";

export const useRealtimeMetrics = () => {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await api.get("/analytics/realtime");
      setMetrics(res.data);
    } catch(e) { console.error("Metrics fetch:", e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    socket.on("cityMetricsUpdate", setMetrics);
    return () => { clearInterval(interval); socket.off("cityMetricsUpdate", setMetrics); };
  }, [fetchMetrics]);

  return { metrics, loading, refetch: fetchMetrics };
};
