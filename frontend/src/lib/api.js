import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

export function fetchAlerts(status) {
  const params = status ? { status } : {};
  return api.get("/api/alerts", { params });
}

export function acknowledgeAlert(alertId, payload) {
  return api.patch(`/api/alert/${alertId}`, payload);
}

export function fetchRiskInsights() {
  return api.get("/api/risk-insights");
}
