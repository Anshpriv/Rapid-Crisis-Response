import { useCallback, useEffect, useMemo, useState } from "react";
import AlertCard from "./components/AlertCard";
import RiskInsightsPanel from "./components/RiskInsightsPanel";
import StatsBar from "./components/StatsBar";
import { useAuth } from "./context/AuthContext";
import { acknowledgeAlert, fetchAlerts, fetchRiskInsights } from "./lib/api";
import { socket } from "./lib/socket";
import LoginPage from "./pages/LoginPage";
import "./App.css";

const TABS = [
  { key: "active", label: "Active Alerts" },
  { key: "log", label: "Incident Log" },
  { key: "insights", label: "Risk Insights" },
];

const ROLE_ALERT_TYPES = {
  manager: null,
  medical: new Set(["medical"]),
  security: new Set(["security", "fire"]),
  general: new Set(["distress"]),
};

function normalizeAlert(raw) {
  return {
    ...raw,
    status: raw?.status || "active",
    type: raw?.type || "distress",
    room: raw?.room || "Unknown",
    device_name: raw?.device_name || "Unknown",
  };
}

function toDate(timestamp) {
  const parsed = new Date(timestamp || "");
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function sortByNewest(alerts) {
  return [...alerts].sort((a, b) => toDate(b.timestamp) - toDate(a.timestamp));
}

function upsertAlert(alerts, incoming) {
  const index = alerts.findIndex((alert) => alert.id === incoming.id);
  if (index === -1) {
    return sortByNewest([incoming, ...alerts]);
  }

  const next = [...alerts];
  next[index] = incoming;
  return sortByNewest(next);
}

function formatLogTime(timestamp) {
  const parsed = new Date(timestamp || "");
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function briefSummary(brief) {
  if (!brief) {
    return "Pending Gemini brief...";
  }

  if (typeof brief === "string") {
    return brief;
  }

  return brief.summary || "Pending Gemini brief...";
}

function normalizeRole(role) {
  const normalized = typeof role === "string" ? role.toLowerCase() : "";

  if (normalized && Object.hasOwn(ROLE_ALERT_TYPES, normalized)) {
    return normalized;
  }

  return "general";
}

function filterAlertsByRole(alerts, role) {
  const allowedTypes = ROLE_ALERT_TYPES[normalizeRole(role)];
  if (allowedTypes === null) {
    return alerts;
  }

  return alerts.filter((alert) => allowedTypes.has(alert.type));
}

function App() {
  const { user, role, logout } = useAuth();

  const [alerts, setAlerts] = useState([]);
  const [activeTab, setActiveTab] = useState("active");
  const [staffName, setStaffName] = useState("Control Desk");
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [alertsError, setAlertsError] = useState("");
  const [pendingAckIds, setPendingAckIds] = useState(new Set());

  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState("");

  const loadAlerts = useCallback(async () => {
    setLoadingAlerts(true);
    setAlertsError("");

    try {
      const response = await fetchAlerts();
      const normalized = (response.data || []).map(normalizeAlert);
      setAlerts(sortByNewest(normalized));
    } catch (error) {
      setAlertsError(
        error?.response?.data?.detail ||
          "Unable to load alerts. Confirm API server and Firestore are configured.",
      );
    } finally {
      setLoadingAlerts(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    loadAlerts();
  }, [loadAlerts, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    socket.connect();

    const handleNewAlert = (incoming) => {
      setAlerts((current) => upsertAlert(current, normalizeAlert(incoming)));
    };

    const handleAlertUpdated = (incoming) => {
      setAlerts((current) => upsertAlert(current, normalizeAlert(incoming)));
    };

    socket.on("new_alert", handleNewAlert);
    socket.on("alert_updated", handleAlertUpdated);

    return () => {
      socket.off("new_alert", handleNewAlert);
      socket.off("alert_updated", handleAlertUpdated);
      socket.disconnect();
    };
  }, [user]);

  const handleAcknowledge = useCallback(
    async (alertId) => {
      setPendingAckIds((current) => {
        const next = new Set(current);
        next.add(alertId);
        return next;
      });

      try {
        const acknowledgedBy = staffName.trim() || "Venue Staff";
        const response = await acknowledgeAlert(alertId, {
          status: "responding",
          acknowledged_by: acknowledgedBy,
        });

        setAlerts((current) =>
          upsertAlert(current, normalizeAlert(response.data)),
        );
      } catch (error) {
        setAlertsError(
          error?.response?.data?.detail || "Failed to acknowledge alert.",
        );
      } finally {
        setPendingAckIds((current) => {
          const next = new Set(current);
          next.delete(alertId);
          return next;
        });
      }
    },
    [staffName],
  );

  const handleGenerateInsights = useCallback(async () => {
    setInsightsLoading(true);
    setInsightsError("");

    try {
      const response = await fetchRiskInsights();
      setInsights(response.data);
    } catch (error) {
      setInsightsError(
        error?.response?.data?.detail ||
          "Unable to generate risk insights. Confirm Gemini API key and backend connectivity.",
      );
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  const visibleAlerts = useMemo(
    () => filterAlertsByRole(alerts, role),
    [alerts, role],
  );

  const activeAlerts = useMemo(
    () => visibleAlerts.filter((alert) => alert.status !== "resolved"),
    [visibleAlerts],
  );

  const stats = useMemo(() => {
    const now = new Date();

    const todayCount = visibleAlerts.filter((alert) => {
      const parsed = new Date(alert.timestamp || "");
      return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toDateString() === now.toDateString()
      );
    }).length;

    return {
      total: visibleAlerts.length,
      active: visibleAlerts.filter((alert) => alert.status === "active").length,
      responding: visibleAlerts.filter((alert) => alert.status === "responding")
        .length,
      resolved: visibleAlerts.filter((alert) => alert.status === "resolved")
        .length,
      today: todayCount,
    };
  }, [visibleAlerts]);

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="app-shell">
      <header className="hero-header">
        <div>
          <p className="eyebrow">Rapid Crisis Response</p>
          <h1>Emergency Coordination Dashboard</h1>
          <p className="hero-subtext">
            Live panic-button incidents with Gemini-generated briefs and
            coordinated response updates.
          </p>
          <p className="hero-subtext">Signed in role: {normalizeRole(role)}</p>
        </div>

        <aside className="staff-tools">
          <label htmlFor="staff-name">Acknowledge as</label>
          <input
            id="staff-name"
            type="text"
            value={staffName}
            maxLength={120}
            onChange={(event) => setStaffName(event.target.value)}
            placeholder="Control Desk"
          />
          <button type="button" className="ghost-btn" onClick={loadAlerts}>
            Refresh Feed
          </button>
          <button type="button" className="ghost-btn" onClick={logout}>
            Sign Out
          </button>
        </aside>
      </header>

      <StatsBar stats={stats} />

      <nav className="tab-row" aria-label="Dashboard views">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`tab-btn ${activeTab === tab.key ? "is-active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="content-panel">
        {activeTab === "active" && (
          <section>
            {loadingAlerts && (
              <p className="muted-text">Loading live alerts...</p>
            )}
            {alertsError && <p className="error-text">{alertsError}</p>}

            {!loadingAlerts && !alertsError && activeAlerts.length === 0 && (
              <p className="empty-state">
                No active or responding incidents right now.
              </p>
            )}

            <div className="alert-grid">
              {activeAlerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onAcknowledge={handleAcknowledge}
                  isAcknowledgePending={pendingAckIds.has(alert.id)}
                />
              ))}
            </div>
          </section>
        )}

        {activeTab === "log" && (
          <section>
            {visibleAlerts.length === 0 && !loadingAlerts && (
              <p className="empty-state">Incident log is empty.</p>
            )}

            {visibleAlerts.length > 0 && (
              <div className="log-table-wrap">
                <table className="incident-log">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Type</th>
                      <th>Room</th>
                      <th>Device</th>
                      <th>Status</th>
                      <th>Acknowledged By</th>
                      <th>Gemini Brief</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAlerts.map((alert) => (
                      <tr key={alert.id}>
                        <td>{formatLogTime(alert.timestamp)}</td>
                        <td>
                          <span className={`type-chip type-${alert.type}`}>
                            {alert.type}
                          </span>
                        </td>
                        <td>{alert.room}</td>
                        <td>{alert.device_name}</td>
                        <td>{alert.status}</td>
                        <td>{alert.acknowledged_by || "-"}</td>
                        <td>{briefSummary(alert.gemini_brief)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {activeTab === "insights" && (
          <RiskInsightsPanel
            insights={insights}
            loading={insightsLoading}
            error={insightsError}
            onGenerate={handleGenerateInsights}
          />
        )}
      </main>
    </div>
  );
}

export default App;
