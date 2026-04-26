import { useEffect, useState } from "react";

import { socket } from "../lib/socket";

const TYPE_STYLES = {
  medical: { dot: "#ef4444", border: "#ef4444" },
  fire: { dot: "#f97316", border: "#f97316" },
  security: { dot: "#a855f7", border: "#a855f7" },
  distress: { dot: "#3b82f6", border: "#3b82f6" },
};

function formatTime(timestamp) {
  if (!timestamp) {
    return "--:--";
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getBriefSnippet(alert) {
  if (!alert?.gemini_brief) {
    return "Generating brief...";
  }

  const summary =
    typeof alert.gemini_brief === "object"
      ? alert.gemini_brief?.summary
      : "";

  const text = typeof summary === "string" ? summary.trim() : "";
  if (!text) {
    return "Generating brief...";
  }

  return text.length > 100 ? `${text.slice(0, 100)}...` : text;
}

function NotificationBell() {
  const [alerts, setAlerts] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }

    const handleNewAlert = (incident) => {
      setAlerts((current) => [incident, ...current].slice(0, 10));
      setUnread((count) => count + 1);
    };

    socket.on("new_alert", handleNewAlert);

    return () => {
      socket.off("new_alert", handleNewAlert);
    };
  }, []);

  const toggleDropdown = () => {
    setOpen((current) => {
      const next = !current;
      if (next) {
        setUnread(0);
      }
      return next;
    });
  };

  return (
    <div
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      <button
        type="button"
        onClick={toggleDropdown}
        aria-label="Toggle notifications"
        style={{
          position: "relative",
          background: "transparent",
          border: "none",
          color: "#f8fafc",
          fontSize: "24px",
          lineHeight: 1,
          cursor: "pointer",
          padding: "6px 8px",
        }}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: "-4px",
              right: "-2px",
              minWidth: "18px",
              height: "18px",
              borderRadius: "9999px",
              background: "#ef4444",
              color: "#ffffff",
              fontSize: "11px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 5px",
              boxSizing: "border-box",
            }}
          >
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "42px",
            right: 0,
            width: "360px",
            maxHeight: "420px",
            overflowY: "auto",
            background: "#1a1a2e",
            border: "1px solid rgba(148, 163, 184, 0.25)",
            borderRadius: "12px",
            boxShadow: "0 14px 30px rgba(0, 0, 0, 0.45)",
            padding: "10px",
            zIndex: 50,
          }}
        >
          {alerts.length === 0 && (
            <div
              style={{
                color: "#cbd5e1",
                fontSize: "14px",
                padding: "14px 10px",
                textAlign: "center",
              }}
            >
              No alerts yet
            </div>
          )}

          {alerts.map((alert, index) => {
            const type = String(alert?.type || "distress").toLowerCase();
            const colors = TYPE_STYLES[type] || {
              dot: "#94a3b8",
              border: "#94a3b8",
            };

            return (
              <div
                key={alert?.id || `${alert?.timestamp || "ts"}-${index}`}
                style={{
                  background: "#23233b",
                  borderLeft: `4px solid ${colors.border}`,
                  borderRadius: "10px",
                  padding: "12px",
                  marginBottom: "10px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                    marginBottom: "6px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "9999px",
                        background: colors.dot,
                        display: "inline-block",
                      }}
                    />
                    <strong style={{ color: "#f8fafc", fontSize: "12px" }}>
                      {type.toUpperCase()}
                    </strong>
                  </div>

                  <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                    {formatTime(alert?.timestamp)}
                  </span>
                </div>

                <div
                  style={{
                    color: "#e2e8f0",
                    fontSize: "13px",
                    marginBottom: "6px",
                  }}
                >
                  Room {alert?.room || "Unknown"}
                </div>

                <div
                  style={{
                    color: "#cbd5e1",
                    fontSize: "12px",
                    lineHeight: 1.45,
                  }}
                >
                  {getBriefSnippet(alert)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
