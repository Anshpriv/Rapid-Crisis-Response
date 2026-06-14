import { useState, useEffect } from "react";

const TYPE_LABELS = {
  medical: "Medical",
  fire: "Fire",
  security: "Security",
  distress: "Distress",
};

// Authority dialed by the per-card SOS button (mock).
const SOS_AUTHORITY = {
  medical: "AMBULANCE",
  fire: "FIRE DEPT",
  security: "POLICE",
  distress: "EMERGENCY SERVICES",
};

// Proper authority names (mirrors the backend authority_map) for the banner.
const AUTHORITY_NAME = {
  medical: "Medical Department",
  fire: "Fire Department",
  security: "Security Department",
  distress: "Emergency Services",
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

function AlertCard({ alert, onAcknowledge, isAcknowledgePending, isEntering = false, currentUid, userRole }) {
  const brief = getBriefPayload(alert.gemini_brief);
  const secondaryTypes = Array.isArray(alert.secondary_types)
    ? alert.secondary_types.filter((t) => t && t !== alert.type)
    : [];

  // The escalation timer only runs while the alert is still active — once a
  // staff member marks it "responding" (or "resolved") the countdown stops.
  const isActive = alert.status === "active";

  // --- Live tick driving the 3-phase escalation timer ---
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    if (!isActive) return undefined;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isActive]);

  // 3-phase escalation timer — mirrors the backend escalation_timer tiers.
  const triggeredMs = alert.timestamp ? new Date(alert.timestamp).getTime() : NaN;
  const elapsedSec = Number.isNaN(triggeredMs)
    ? 0
    : Math.max(0, Math.floor((nowTs - triggeredMs) / 1000));

  // Phase boundaries
  const STAFF_WINDOW = 90; // 0–90s: staff must respond
  const MANAGER_WINDOW = 60; // 90–150s: manager must act
  const AUTHORITY_AT = 150; // 150s+: authority contact phase

  const phase = !isActive
    ? "stopped"
    : elapsedSec < STAFF_WINDOW
      ? "staff"
      : elapsedSec < AUTHORITY_AT
        ? "manager"
        : "authority";

  const staffRemaining = Math.max(0, STAFF_WINDOW - elapsedSec);
  const managerRemaining = Math.max(0, AUTHORITY_AT - elapsedSec);

  const formatCountdown = (s) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // Authority shown in the contacting/notified banner.
  const authorityName = alert.authority_type || AUTHORITY_NAME[alert.type] || "Emergency Services";

  // Once the authority phase begins (150s), show "Contacting…" for ~2s, then flip
  // to the "notified — SMS dispatched" banner (ahead of the backend T+300s flag).
  // Derived from elapsed time so it survives tab switches / remounts — no replay.
  const smsDispatchedLocal = elapsedSec >= AUTHORITY_AT + 2;

  // Once the SMS is dispatched the incident is in the authorities' hands —
  // staff can no longer mark it responding/resolved.
  const smsDispatched = smsDispatchedLocal || alert.authority_notified === true;

  // --- SOS (mock authority contact) ---
  const sosAuthority = SOS_AUTHORITY[alert.type] || "EMERGENCY SERVICES";
  const assignments = Array.isArray(alert.gemini_brief?.assignments)
    ? alert.gemini_brief.assignments
    : [];
  const isAssignedToMe = !!currentUid && assignments.some((a) => a.staff_uid === currentUid);
  const [sosOpen, setSosOpen] = useState(false);
  const [sosDispatched, setSosDispatched] = useState(false);

  useEffect(() => {
    if (!sosOpen) return undefined;
    const id = setTimeout(() => setSosDispatched(true), 3000);
    return () => clearTimeout(id);
  }, [sosOpen]);

  const openSos = () => {
    setSosDispatched(false);
    setSosOpen(true);
  };

  const closeSos = () => {
    setSosOpen(false);
    setSosDispatched(false);
  };

  return (
    <article className={`alert-card ${isEntering ? "alert-card-enter" : ""}`}>
      <div className="card-top-row">
        <span className="category-label-group">
          <span className={`category-label type-${alert.type}`}>
            {TYPE_LABELS[alert.type] || "Incident"}
          </span>
          {secondaryTypes.map((t) => (
            <span key={t} className={`secondary-tag type-${t}`}>
              +{TYPE_LABELS[t] || t}
            </span>
          ))}
        </span>
        <span className={`status-pill status-${alert.status}`}>
          {alert.status}
        </span>
      </div>

      {phase === "staff" && userRole !== "manager" && (
        <div className="phase-timer phase-staff">
          <div className="phase-label">⏱ RESPOND IN {formatCountdown(staffRemaining)}</div>
          <div className="phase-bar">
            <div
              className="phase-bar-fill staff-fill"
              style={{ width: `${(staffRemaining / STAFF_WINDOW) * 100}%` }}
            />
          </div>
        </div>
      )}

      {phase === "manager" && userRole === "manager" && (
        <div className="phase-timer phase-manager">
          <div className="phase-label">⚠️ No staff response — manager must act</div>
          <div className="phase-countdown">MANAGER ACTION IN {formatCountdown(managerRemaining)}</div>
          <div className="phase-bar">
            <div
              className="phase-bar-fill manager-fill"
              style={{ width: `${(managerRemaining / MANAGER_WINDOW) * 100}%` }}
            />
          </div>
        </div>
      )}

      {phase === "manager" && userRole !== "manager" && (
        <div className="phase-timer phase-escalated">
          🚨 ESCALATED TO MANAGER
        </div>
      )}

      {(phase === "authority" || alert.authority_notified === true) && (
        alert.authority_notified === true || smsDispatchedLocal ? (
          <div className="authority-sms-banner">
            <span className="authority-sms-icon">📡</span>
            <span className="authority-sms-text">
              {authorityName} notified — SMS dispatched
            </span>
          </div>
        ) : (
          <div className="phase-timer phase-authority-pending">
            <span>📡</span>
            <span>Contacting {authorityName}...</span>
          </div>
        )
      )}

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
          disabled={isAcknowledgePending || smsDispatched || alert.status === "responding" || alert.status === "resolved"}
        >
          RESPONDING
        </button>
        <button
          className="btn-resolved"
          onClick={() => onAcknowledge(alert.id, "resolved")}
          disabled={isAcknowledgePending || smsDispatched || alert.status === "resolved"}
        >
          RESOLVED
        </button>
      </div>

      {isAssignedToMe && (
        <button className="btn-sos" onClick={openSos}>
          🆘 CALL {sosAuthority}
        </button>
      )}

      {sosOpen && (
        <div
          className="sos-overlay"
          onClick={sosDispatched ? closeSos : undefined}
        >
          <div className="sos-modal" onClick={(e) => e.stopPropagation()}>
            {!sosDispatched ? (
              <>
                <h3 className="sos-header">CONTACTING {sosAuthority}</h3>
                <p className="sos-body">
                  {alert.authority_message || "Initiating emergency contact..."}
                </p>
                <div className="sos-progress">
                  <div className="sos-progress-fill" />
                </div>
              </>
            ) : (
              <>
                <h3 className="sos-header sos-success">
                  ✅ SMS DISPATCHED TO {sosAuthority}
                </h3>
                {alert.authority_message && (
                  <p className="sos-body">{alert.authority_message}</p>
                )}
                <div className="card-actions">
                  <button
                    className="btn-responding"
                    onClick={() => {
                      onAcknowledge(alert.id, "responding");
                      closeSos();
                    }}
                    disabled={isAcknowledgePending || alert.status === "responding" || alert.status === "resolved"}
                  >
                    RESPONDING
                  </button>
                  <button
                    className="btn-resolved"
                    onClick={() => {
                      onAcknowledge(alert.id, "resolved");
                      closeSos();
                    }}
                    disabled={isAcknowledgePending || alert.status === "resolved"}
                  >
                    RESOLVED
                  </button>
                </div>
                <button className="sos-close" onClick={closeSos}>
                  CLOSE
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

export default AlertCard;
