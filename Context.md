# Rapid Crisis Response Platform — Project Context
> Single source of truth. Do not hallucinate beyond this file.

---

## Competition

- **Event:** Google Solution Challenge 2026
- **Domain:** Rapid Crisis Response
- **Problem Statement:** Accelerated Emergency Response and Crisis Coordination in Hospitality
- **Team:** 4 members — 2 software (Soham + teammate), 2 hardware (IoT)

## Evaluation Criteria

| Criterion | Weight |
|---|---|
| Technical Merit | 40% |
| Alignment With Cause | 25% |
| Innovation and Creativity | 25% |
| User Experience | 10% |

---

## Problem Being Solved

In a hospitality emergency, the gap between something going wrong and the right people knowing about it with enough context to act. Guests don't know who to call, staff have no unified view, and first responders arrive blind. This system closes that gap entirely — in under 3 seconds from button press to coordinated response.

---

## Solution Architecture

### Two Components

**1. IoT Panic Button (Hardware team — not Soham's concern)**
- 4 buttons: Medical, Fire, Security, General Distress
- Dual-radio: BLE primary, LoRaWAN fallback
- Sends structured JSON payload to `POST /api/alert` on press
- Room/Zone ID is pre-assigned to device — location is known instantly
- LED + buzzer confirmation on press

**2. Software Platform (Soham's team)**
- Event-driven backend
- Gemini AI for situation briefs, escalation, and pattern analysis
- Firebase Cloud Messaging for role-based push notifications
- Socket.io for real-time dashboard updates
- React operations dashboard

---

## Technology Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| Database | Google Firestore |
| AI — Brief | Google Gemini API |
| AI — Escalation | Google Gemini API |
| AI — Analytics | Vertex AI / Gemini |
| Notifications | Firebase Cloud Messaging (FCM) |
| Real-time | Socket.io |
| Frontend | React (Vite scaffold — already built by teammate) |
| IoT Device | Custom hardware (teammate) |
| Tunnel (dev) | ngrok (link TBD) |

---

## Locked Incident Object (Shared Contract)

```json
{
  "id": "uuid — auto-generated",
  "type": "medical | fire | security | distress",
  "room": "412",
  "device_name": "device_01",
  "timestamp": "ISO 8601 string",
  "status": "active | responding | resolved",
  "gemini_brief": "AI-generated situation brief",
  "acknowledged_by": null,
  "acknowledged_at": null
}
```

> **CRITICAL:** Neither developer changes field names without full team agreement.

---

## Firestore Collections

### `incidents`
Fields: `id`, `type`, `room`, `device_name`, `timestamp`, `status`, `gemini_brief`, `acknowledged_by`, `acknowledged_at`

### `staff_devices`
Fields: `role`, `fcm_token`, `registered_at`

---

## Socket.io Events

| Event | Trigger |
|---|---|
| `new_alert` | New incident saved to Firestore |
| `alert_updated` | Status changed on any incident |

---

## API Routes

| Method | Route | Owner | Description |
|---|---|---|---|
| POST | `/api/alert` | Teammate | Receive + validate hardware payload, save to Firestore |
| GET | `/api/alerts` | Teammate | Return all incidents, filterable by status and type |
| PATCH | `/api/alert/:id` | Teammate | Update status, record acknowledged_by + acknowledged_at |
| POST | `/api/register-device` | **Soham** | Save `{ role, fcm_token, registered_at }` to staff_devices |
| POST | `/api/insights` | Teammate | Query 30 days of incidents, send to Vertex AI for pattern report |

---

## FCM Role Routing Rules

| Alert Type | Notified Role(s) |
|---|---|
| medical | medical staff + manager |
| fire | security staff + manager |
| security | security staff + manager |
| distress | general staff + manager |
| any | manager always notified regardless |

---

## Soham's Full Task List

These are Soham's owned deliverables. Build in this order.

### 1. FCM Setup
Enable Firebase Cloud Messaging in shared Firebase project. Create `fcm.js` service with `sendNotification(token, title, body)` function.

### 2. Staff Auth + Login
Add staff login using Firebase Auth. Each staff account has a role: `medical`, `security`, `manager`, `general`. On login, save FCM token against their role in `staff_devices` collection.

### 3. Role-Based Login + Routing
When a staff member logs in, route them to their role-specific dashboard view. Medical staff see medical alerts only. Security see security alerts only. Managers see everything (central dashboard = manager view). Right now everyone hits the same central dashboard.

### 4. POST /api/register-device
Save `{ role, fcm_token, registered_at }` to Firestore `staff_devices` collection after login.

### 5. Role-Matched FCM Notifications
Wire into `POST /api/alert` route (coordinate with teammate on integration point). On new alert: query `staff_devices`, match role per FCM routing rules above, call `sendNotification()` for each matching token.

### 6. Gemini Escalation (90-second timer)
After new alert saved: start 90s timer. On fire: check if `status` is still `active`. If yes: call Gemini for escalation message, FCM push to all `manager` role devices. If acknowledged before timer: cancel silently.

### 7. NotificationBell.jsx (Self-Contained Component)
Bell icon with unread badge count. Listens on Socket.io `new_alert` events. Dropdown showing last 10 alerts with type, room, and Gemini brief snippet. Must be self-contained — do not touch `App.jsx` structure. Hand off to teammate to drop into layout.

---

## Teammate's Task List (For Reference — Do Not Touch)

- Repo setup, folder structure (`/backend` and `/frontend`), branches
- Express server + Firebase Admin SDK init
- Firestore schema + `incidents` collection
- `POST /api/alert`, `GET /api/alerts`, `PATCH /api/alert/:id`
- Socket.io server — emit `new_alert` and `alert_updated`
- Gemini situation brief on new alert (saves to `gemini_brief` field, re-emits via Socket.io)
- React dashboard — active alerts panel, acknowledge controls, incident log tab, stats bar, risk insights tab
- `POST /api/insights` — Vertex AI pattern analysis

---

## P0 Feature Lock (MVP — must have)

Reference IDs from scope of work:

**Backend:** BE-01, BE-02, BE-03, BE-04, BE-05, BE-06

**AI:** AI-01, AI-02, AI-03

**Notifications:** NF-01, NF-02, NF-03

**Frontend:** FE-01, FE-02, FE-03, FE-04, FE-05

**Hardware:** HW-01, HW-02, HW-03

---

## Out of Scope for MVP

- PMS integration (guest data, occupancy, VIP status)
- 911 / CAD API bridge (RapidSOS / NG911)
- LoRaWAN fallback radio
- Interactive floor map on dashboard
- Multi-venue / multi-property support

---

## Key Integration Point (Coordination Required)

Soham's role-matched FCM notification logic must plug into the `POST /api/alert` route that teammate owns. Agree on exact insertion point before merging — this is the highest merge conflict risk in the project.

---

## Build Context

- **Timeline:** 4 days, ~12 focused hours of vibe-coding
- **Repo:** GitHub — Soham has access (branches: `feature/dashboard`, `feature/notifications`)
- **Dev tunnel:** ngrok link (to be added once shared)
- **Soham's branch:** `feature/notifications`
- **Teammate's branch:** `feature/dashboard`
- **Frontend:** Already scaffolded by teammate — Vite + React. Some backend URLs are empty placeholders that Soham needs to fill.
- **Working style:** Soham executes Cursor/Copilot prompts himself, reports results back. Claude provides structured prompts, not direct code dumps.