import { useEffect, useState } from "react";

const TYPE_LABELS = {
  medical: "Medical",
  fire: "Fire",
  security: "Security",
  distress: "Distress",
};

function formatTimestamp(timestamp) {
  if (!timestamp) return "Unknown time";
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function getBriefPayload(brief) {
  if (!brief) {
    return { summary: "Generating Gemini brief...", actions: [] };
  }
  if (typeof brief === "string") {
    return { summary: brief, actions: [] };
  }
  const actions = Array.isArray(brief.recommended_actions)
    ? brief.recommended_actions.filter(Boolean).slice(0, 3)
    : [];
  return { summary: brief.summary || "No summary available.", actions };
}

function AlertCard({ alert, onAcknowledge, isAcknowledgePending, isEntering = false }) {
  const brief = getBriefPayload(alert.gemini_brief);

  return (
    <article className={`alert-card ${isEntering ? "alert-card-enter" : ""}`}>
      <div className="card-top-row">
        <span className={`category-label type-${alert.type}`}>
          {TYPE_LABELS[alert.type] || "Incident"}
        </span>
        <span className={`status-pill status-${alert.status}`}>
          {alert.status}
        </span>
      </div>

      <div className="card-title-group">
        <h3>Room {alert.room}</h3>
        <p className="card-subtitle">
          Device: {alert.device_name}
        </p>
        <p className="card-subtitle">
          Triggered At: {formatTimestamp(alert.timestamp)}
        </p>
      </div>

      <div className="ai-summary-box">
        <span className="sparkle-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11.5 0L13 8.5L21.5 10L13 11.5L11.5 20L10 11.5L1.5 10L10 8.5L11.5 0Z"/></svg>
        </span>
        <div className="summary-text">
          <p><strong>Situation Brief:</strong> {brief.summary}</p>
          {brief.actions && brief.actions.length > 0 && (
            <ul style={{marginTop: '8px', paddingLeft: '20px', fontSize: '0.85rem'}}>
              {brief.actions.map((action, i) => (
                <li key={i}>{action}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card-actions">
        <button
          className="btn-responding"
          onClick={() => onAcknowledge(alert.id, "responding")}
          disabled={isAcknowledgePending || alert.status === "responding" || alert.status === "resolved"}
        >
          RESPONDING
        </button>
        <button
          className="btn-resolved"
          onClick={() => onAcknowledge(alert.id, "resolved")}
          disabled={isAcknowledgePending || alert.status === "resolved"}
        >
          RESOLVED
        </button>
      </div>
    </article>
  );
}

export default AlertCard;
