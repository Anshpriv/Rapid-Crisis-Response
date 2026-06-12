import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AlertCard from "./components/AlertCard";
import RiskInsightsPanel from "./components/RiskInsightsPanel";
import StatsBar from "./components/StatsBar";
import { useAuth } from "./context/AuthContext";
import { acknowledgeAlert, fetchAlerts, fetchRiskInsights } from "./lib/api";
import { socket } from "./lib/socket";
import LoginPage from "./pages/LoginPage";
import "./App.css";

const Icons = {
  Dashboard: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>,
  IncidentLog: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>,
  RiskInsights: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>,
  Settings: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>,
  Asterisk: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="red" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="4" x2="12" y2="20"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="6.34" y1="6.34" x2="17.66" y2="17.66"></line><line x1="6.34" y1="17.66" x2="17.66" y2="6.34"></line></svg>,
  Bell: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>,
  User: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>,
  Shield: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>,
  ChevronLeft: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>,
  ChevronRight: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>,
  Refresh: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>,
  Logout: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
};

const TABS = [
  { key: "active", label: "Dashboard", icon: Icons.Dashboard },
  { key: "log", label: "Incident Log", icon: Icons.IncidentLog },
  { key: "insights", label: "Risk Insights", icon: Icons.RiskInsights },
  { key: "settings", label: "Settings", icon: Icons.Settings },
];

const ROLE_ALERT_TYPES = {
  manager: null,
  medical: new Set(["medical"]),
  medicine: new Set(["medical"]),
  security: new Set(["security"]),
  general: new Set(["medical", "security", "distress"]),
};

const ALERT_ENTER_ANIMATION_MS = 520;
const ALERT_NOTIFICATION_DURATION_MS = 6000;
const ALERT_NOTIFICATION_EXIT_MS = 700;

let alertAudioContext;
let isAlertAudioUnlocked = false;

function getAlertAudioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;

  if (!AudioContext) {
    return null;
  }

  try {
    if (!alertAudioContext || alertAudioContext.state === "closed") {
      alertAudioContext = new AudioContext();
    }

    return alertAudioContext;
  } catch {
    return null;
  }
}

async function unlockAlertAudio() {
  const audioContext = getAlertAudioContext();

  if (!audioContext) {
    return;
  }

  try {
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    isAlertAudioUnlocked = audioContext.state === "running";
  } catch {
    isAlertAudioUnlocked = false;
  }
}

function playAlertNotificationTone() {
  const audioContext = getAlertAudioContext();

  if (!audioContext) {
    return;
  }

  const play = () => {
    const startAt = audioContext.currentTime + 0.01;
    const gain = audioContext.createGain();
    gain.connect(audioContext.destination);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.34, startAt + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 1.08);

    [1046.5, 1568].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, startAt);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.08, startAt + 0.18);
      oscillator.connect(gain);
      oscillator.start(startAt + index * 0.07);
      oscillator.stop(startAt + 0.82 + index * 0.05);
    });
  };

  try {
    if (!isAlertAudioUnlocked || audioContext.state === "suspended") {
      unlockAlertAudio().then(() => {
        if (isAlertAudioUnlocked) {
          play();
        }
      });
      return;
    }

    play();
  } catch {
    // Browser autoplay rules can block programmatic audio before user interaction.
  }
}

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
  const { user, role, department, logout } = useAuth();

  const [alerts, setAlerts] = useState([]);
  const [activeTab, setActiveTab] = useState("active");
  const [staffName, setStaffName] = useState("Control Desk");
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [alertsError, setAlertsError] = useState("");
  const [pendingAckIds, setPendingAckIds] = useState(new Set());
  const [enteringAlertIds, setEnteringAlertIds] = useState(new Set());
  const [notificationAlert, setNotificationAlert] = useState(null);
  const [isNotificationVisible, setIsNotificationVisible] = useState(false);
  const [isNotificationExiting, setIsNotificationExiting] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [notificationSequence, setNotificationSequence] = useState(0);
  const notificationTimerRef = useRef(null);
  const notificationExitTimerRef = useRef(null);

  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState("");

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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

    // Keep the audio context unlocked: re-resume on every interaction (not once),
    // and when the tab becomes visible again — browsers suspend it on blur/idle,
    // and resume() is only honored close to a user gesture.
    const handleAudioUnlock = () => {
      unlockAlertAudio();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        unlockAlertAudio();
      }
    };

    window.addEventListener("pointerdown", handleAudioUnlock);
    window.addEventListener("keydown", handleAudioUnlock);
    window.addEventListener("click", handleAudioUnlock);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("pointerdown", handleAudioUnlock);
      window.removeEventListener("keydown", handleAudioUnlock);
      window.removeEventListener("click", handleAudioUnlock);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    socket.auth = { department: department || role || "general" };
    socket.connect();

    const handleNewAlert = (incoming) => {
      const normalized = normalizeAlert(incoming);
      const userDept = department || role;
      const allowed = ROLE_ALERT_TYPES[normalizeRole(userDept)];
      const isAllowed = allowed === null || allowed.has(normalized.type);

      setAlerts((current) => {
        if (!isAllowed) return current;
        return upsertAlert(current, normalized);
      });

      if (!isAllowed) return;
      setNotificationAlert(normalized);
      setNotificationSequence((current) => current + 1);
      setIsNotificationExiting(false);
      setIsNotificationVisible(true);
      setUnreadNotificationCount((count) => count + 1);
      playAlertNotificationTone();

      if (notificationTimerRef.current) {
        window.clearTimeout(notificationTimerRef.current);
      }
      if (notificationExitTimerRef.current) {
        window.clearTimeout(notificationExitTimerRef.current);
      }

      notificationTimerRef.current = window.setTimeout(() => {
        setIsNotificationExiting(true);
      }, ALERT_NOTIFICATION_DURATION_MS - ALERT_NOTIFICATION_EXIT_MS);

      notificationExitTimerRef.current = window.setTimeout(() => {
        setIsNotificationVisible(false);
        setIsNotificationExiting(false);
      }, ALERT_NOTIFICATION_DURATION_MS);

      if (!normalized.id) {
        return;
      }

      setEnteringAlertIds((current) => {
        const next = new Set(current);
        next.add(normalized.id);
        return next;
      });

      window.setTimeout(() => {
        setEnteringAlertIds((current) => {
          const next = new Set(current);
          next.delete(normalized.id);
          return next;
        });
      }, ALERT_ENTER_ANIMATION_MS);
    };

    const handleAlertUpdated = (incoming) => {
      setAlerts((current) => upsertAlert(current, normalizeAlert(incoming)));
    };

    // On every (re)connect, resync the full list so nothing is missed while
    // the socket was down or an event was dropped.
    const handleReconnect = () => {
      loadAlerts();
    };

    socket.on("connect", handleReconnect);
    socket.on("new_alert", handleNewAlert);
    socket.on("alert_updated", handleAlertUpdated);

    return () => {
      socket.off("connect", handleReconnect);
      socket.off("new_alert", handleNewAlert);
      socket.off("alert_updated", handleAlertUpdated);
      socket.disconnect();
      if (notificationTimerRef.current) {
        window.clearTimeout(notificationTimerRef.current);
      }
      if (notificationExitTimerRef.current) {
        window.clearTimeout(notificationExitTimerRef.current);
      }
    };
  }, [user, role, department, loadAlerts]);

  const handleNotificationBellClick = useCallback(() => {
    unlockAlertAudio();
    setUnreadNotificationCount(0);
    setIsNotificationExiting(false);
    setIsNotificationVisible((current) => (notificationAlert ? !current : false));
  }, [notificationAlert]);

  const handleAcknowledge = useCallback(
    async (alertId, newStatus) => {
      setPendingAckIds((current) => {
        const next = new Set(current);
        next.add(alertId);
        return next;
      });

      try {
        const acknowledgedBy = staffName.trim() || "Venue Staff";
        const response = await acknowledgeAlert(alertId, {
          status: newStatus,
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
    () => filterAlertsByRole(alerts, department || role),
    [alerts, department, role],
  );

  const activeAlerts = useMemo(
    () =>
      visibleAlerts.filter(
        (alert) => alert.status === "active" || alert.status === "responding",
      ),
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

  const userName = user?.email ? user.email.split('@')[0] : "Commander";

  return (
    <div className="app-layout">
      <header className="top-bar">
        <div className="brand">
          <Icons.Asterisk /> EMERGENCY CORE
        </div>
        <div className="top-bar-actions">
          <button
            type="button"
            className="bell-container notification-bell-button"
            onClick={handleNotificationBellClick}
            aria-label="Toggle latest alert notification"
          >
            <Icons.Bell />
            {unreadNotificationCount > 0 && (
              <span className="notification-count">
                {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
              </span>
            )}
            {unreadNotificationCount === 0 && <div className="bell-dot"></div>}
          </button>
          <div className="user-profile">
            <div className="user-info">
              <span className="user-name">{userName}</span>
              <span className="user-role">{normalizeRole(role) || "COMMAND"}</span>
            </div>
            <div className="avatar">
              <Icons.User />
            </div>
          </div>
          {/* Logout — shown in header on mobile only */}
          <button
            type="button"
            className="header-logout-btn"
            onClick={logout}
            title="Sign Out"
          >
            <Icons.Logout />
          </button>
        </div>
      </header>

      {notificationAlert && isNotificationVisible && (
        <aside
          key={notificationSequence}
          className={`floating-alert-notification ${isNotificationExiting ? "is-exiting" : ""}`}
          aria-live="assertive"
        >
          <div className="floating-alert-header">
            <span className={`category-label type-${notificationAlert.type}`}>
              {notificationAlert.type}
            </span>
            <span className={`status-pill status-${notificationAlert.status}`}>
              {notificationAlert.status}
            </span>
          </div>
          <strong>Room {notificationAlert.room}</strong>
          <p>{briefSummary(notificationAlert.gemini_brief)}</p>
          <span className="floating-alert-meta">
            Device: {notificationAlert.device_name}
          </span>
        </aside>
      )}

      <aside className={`sidebar ${isSidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-header">
          {!isSidebarCollapsed ? (
            <div className="sidebar-title-container">
              <h1>
                <span style={{ color: "var(--red-main)", display: "flex", alignItems: "center" }}>
                  <Icons.Shield />
                </span>
                COMMAND
              </h1>
              <p className="sidebar-subtext">OPERATIONS</p>
            </div>
          ) : (
            <div className="sidebar-title-container" style={{ paddingBottom: '0.5rem' }}>
              <span style={{ color: "var(--red-main)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icons.Shield />
              </span>
            </div>
          )}
          <button
            className="sidebar-toggle-btn"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isSidebarCollapsed ? <Icons.ChevronRight /> : <Icons.ChevronLeft />}
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Dashboard views">
          {TABS.map((tab) => {
            const IconComponent = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                className={`tab-btn ${activeTab === tab.key ? "is-active" : ""} ${tab.key === "settings" ? "desktop-only-tab" : ""}`}
                onClick={() => setActiveTab(tab.key)}
                title={isSidebarCollapsed ? tab.label : undefined}
              >
                <IconComponent />
                {!isSidebarCollapsed && tab.label}
              </button>
            );
          })}
        </nav>

        <div className="staff-tools">
          {!isSidebarCollapsed && <label htmlFor="staff-name">Acknowledge as</label>}
          {!isSidebarCollapsed && (
            <input
              id="staff-name"
              type="text"
              value={staffName}
              maxLength={120}
              onChange={(event) => setStaffName(event.target.value)}
              placeholder="Control Desk"
            />
          )}
          <button type="button" className="ghost-btn" onClick={loadAlerts} title={isSidebarCollapsed ? "Refresh Feed" : undefined}>
            {isSidebarCollapsed ? <Icons.Refresh /> : "Refresh Feed"}
          </button>
          <button type="button" className="ghost-btn" onClick={logout} title={isSidebarCollapsed ? "Sign Out" : undefined}>
            {isSidebarCollapsed ? <Icons.Logout /> : "Sign Out"}
          </button>
        </div>
      </aside>

      <main className="main-content">
        {activeTab === "active" && (
          <>
            <StatsBar stats={stats} />
            <section>
              <div className="section-title-row">
                <h2 className="section-title">Active Critical Alerts</h2>
                <button
                  type="button"
                  className="mobile-inline-refresh"
                  onClick={loadAlerts}
                  title="Refresh alerts"
                >
                  <Icons.Refresh />
                </button>
              </div>
              {loadingAlerts && (
                <p className="muted-text">Loading live alerts...</p>
              )}
              {alertsError && <p className="error-text">{alertsError}</p>}

              {!loadingAlerts && !alertsError && activeAlerts.length === 0 && (
                <div className="empty-state">
                  <svg className="empty-state-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
                  <p>No active or responding incidents right now.</p>
                </div>
              )}

              <div className="alert-grid">
                {activeAlerts.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onAcknowledge={handleAcknowledge}
                    isAcknowledgePending={pendingAckIds.has(alert.id)}
                    isEntering={enteringAlertIds.has(alert.id)}
                  />
                ))}
              </div>
            </section>
          </>
        )}

        {activeTab === "log" && (
          <section>
            <h2 className="section-title">Incident Log</h2>
            {visibleAlerts.length === 0 && !loadingAlerts && (
              <div className="empty-state">
                <svg className="empty-state-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                <p>Incident log is empty.</p>
              </div>
            )}

            {visibleAlerts.length > 0 && (
              <div className="incident-log-cards">
                {visibleAlerts.map((alert) => (
                  <div className="log-card" key={alert.id}>
                    <div className="log-card-header">
                      <div className="log-card-title">
                        <span className={`category-label type-${alert.type}`}>
                          {alert.type}
                        </span>
                        <h4>Room {alert.room}</h4>
                        <span className="log-device-name">({alert.device_name})</span>
                      </div>
                      <div className="log-card-meta">
                        <span className={`status-pill status-${alert.status}`}>
                          {alert.status}
                        </span>
                        <span className="log-time">{formatLogTime(alert.timestamp)}</span>
                      </div>
                    </div>
                    <div className="log-card-body">
                      <p><strong>Brief:</strong> {briefSummary(alert.gemini_brief)}</p>
                    </div>
                    <div className="log-card-footer">
                      <span>Acknowledged by: <strong>{alert.acknowledged_by || "Pending"}</strong></span>
                    </div>
                  </div>
                ))}
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

        {activeTab === "settings" && (
          <section>
            <h2 className="section-title">Settings</h2>
            <div className="empty-state">
              <svg className="empty-state-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              <p>Settings are configured via control desk currently.</p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
