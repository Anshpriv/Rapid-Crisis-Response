import axios from "axios";

// Empty/relative base => same-origin requests, which Vite proxies to the backend.
// This lets the app be served through a single HTTPS tunnel with no CORS issues.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

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
