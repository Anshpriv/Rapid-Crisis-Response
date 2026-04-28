<div align="center">

<br/>

```
██████╗  █████╗ ██████╗ ██╗██████╗     ██████╗ ███████╗███████╗██████╗  ██████╗ ███╗   ██╗███████╗███████╗
██╔══██╗██╔══██╗██╔══██╗██║██╔══██╗    ██╔══██╗██╔════╝██╔════╝██╔══██╗██╔═══██╗████╗  ██║██╔════╝██╔════╝
██████╔╝███████║██████╔╝██║██║  ██║    ██████╔╝█████╗  ███████╗██████╔╝██║   ██║██╔██╗ ██║███████╗█████╗
██╔══██╗██╔══██║██╔═══╝ ██║██║  ██║    ██╔══██╗██╔══╝  ╚════██║██╔═══╝ ██║   ██║██║╚██╗██║╚════██║██╔══╝
██║  ██║██║  ██║██║     ██║██████╔╝    ██║  ██║███████╗███████║██║     ╚██████╔╝██║ ╚████║███████║███████╗
╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═════╝     ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝      ╚═════╝ ╚═╝  ╚═══╝╚══════╝╚══════╝
```

### **When seconds matter, every second counts.**

*AI-powered emergency coordination for hospitality venues — from panic button to staff briefing in under 3 seconds.*

<br/>

[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![Google Gemini](https://img.shields.io/badge/Gemini_AI-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)
[![Firestore](https://img.shields.io/badge/Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/docs/firestore)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io/)
[![Vertex AI](https://img.shields.io/badge/Vertex_AI-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)](https://cloud.google.com/vertex-ai)

<br/>

> 🏨 Built for hotels, venues, and hospitality operations where emergencies demand **instant, coordinated response** — not scrambled radio calls.

</div>

---

## 🚨 The Problem

Picture this: a guest collapses in Room 401. A staff member hits the panic button. Now what?

In most hotels, that "now what" is chaos — someone picks up a walkie-talkie, tries to reach the right people, reads out a room number, and hopes the right staff with the right skills are listening. By the time a coordinated response begins, **precious minutes are already gone.**

**Rapid Response** eliminates that gap entirely.

---

## ⚡ How It Works — 3 Seconds, Start to Finish

```
[PANIC BUTTON PRESSED]
        │
        ▼ < 1s
  ┌─────────────────┐
  │  Alert Ingested  │  Type + Room + Device → validated & stored in Firestore
  └────────┬────────┘
           │
           ▼ < 1s
  ┌─────────────────────────┐
  │   Gemini AI Activates   │  Reads incident context → generates situation brief
  │                         │  + tailored action checklist in real-time
  └────────┬────────────────┘
           │
           ▼ < 1s
  ┌────────────────────────────┐
  │  Smart Task Allocation     │  Assigns checklist items to available staff
  │  + Live Dashboard Push     │  Everyone sees the same picture, instantly
  └────────────────────────────┘
```

No phone trees. No confusion about who does what. **One button — full coordinated response.**

---

## 🧠 What Makes This Different

Most emergency systems just send an alert. **Rapid Response sends a plan.**

The moment an incident is detected, Gemini AI doesn't just notify — it *thinks*. It generates a 2-3 sentence situational brief tailored to the emergency type, creates a dynamic action checklist, and intelligently assigns each task to available staff in the area. Every responder knows exactly what they're doing before they even reach the scene.

And if someone doesn't acknowledge within 90 seconds? The system escalates automatically — with a contextually-aware message generated by Gemini, routed directly to the duty manager.

---

## 🔁 The Full Incident Lifecycle

**1. Alert Triggered**
A staff member or guest presses one of four buttons on the IoT panic panel: `Medical`, `Fire`, `Security`, or `Distress`. A structured payload containing the alert type, room number, device ID, and timestamp fires instantly to the backend.

**2. Incident Logged**
The alert is validated and stored in Firestore with full context — creating a permanent, auditable record from the very first second.

**3. Gemini AI Activates**
Google Gemini reads the incident and generates two things immediately: a 2-3 sentence human-readable situation brief, and a dynamic action checklist tailored to the specific emergency type. No generic templates. Every response is contextual.

**4. Smart Task Allocation**
The system checks which staff are available in the area and assigns checklist tasks dynamically — so every action has an owner and nothing falls through the cracks.

**5. Staff Notified Instantly**
FCM push notifications fire to the right roles. The live operations dashboard updates in real-time via Socket.IO — every open screen reflects the same live incident state simultaneously.

**6. Acknowledge & Resolve**
Staff tap to acknowledge their task and update their status (`Responding → Resolved`). Every status change is broadcast live across all connected dashboards.

**7. Auto-Escalation**
No acknowledgment after 90 seconds? Gemini generates a contextual escalation message and alerts the duty manager automatically — ensuring no incident ever goes unattended.

**8. Risk Insights**
Every resolved incident feeds the analytics engine. Vertex AI analyses 30 days of incident history to surface patterns: recurring hotspots, peak risk times, common incident types — turning every emergency into actionable operational intelligence.

---

## 🏗️ Architecture

<p align="center">
  <img src="./assets/architecturediagram.png" alt="System Architecture Diagram" width="85%"/>
</p>

---

## 🛠️ Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Backend** | FastAPI + Socket.IO | Async-first, blazing fast, real-time capable |
| **Database** | Google Firestore | Real-time listeners, no-polling live sync |
| **AI — Briefing & Tasks** | Google Gemini API | Contextual, generative, sub-second response |
| **AI — Analytics** | Vertex AI | Enterprise-grade pattern analysis over incident history |
| **Notifications** | Firebase Cloud Messaging | Reliable push to the right roles, instantly |
| **Frontend** | React (Vite) + Axios | Fast build, reactive UI, clean DX |
| **IoT Device** | Custom 4-button panel | BLE + LoRaWAN — works even without WiFi |

---

## 📊 Live Dashboard Features

The operations dashboard is the central nervous system of every active incident.

- **Active Alerts Panel** — Color-coded cards by emergency type, updated live via Socket.IO
- **Acknowledge Button** — One tap per responder to claim and track their task
- **Incident Log** — Full history with timestamps, responder names, and resolution notes
- **Stats Bar** — At-a-glance metrics: active incidents, response times, resolution rate
- **Risk Insights Tab** — Gemini-powered analysis over the last 30 days of incident data

---

## 🗃️ Incident Data Schema

Every incident stored in Firestore follows this structure:

```json
{
  "id": "auto-doc-id",
  "type": "medical | fire | security | distress",
  "room": "401",
  "device_name": "panic_btn_401_a",
  "timestamp": "2026-04-26T10:45:00Z",
  "status": "active | responding | resolved",
  "gemini_brief": {
    "summary": "2-3 sentence situation brief tailored to the emergency type and location.",
    "recommended_actions": ["action 1", "action 2", "action 3"],
    "generated_at": "ISO timestamp",
    "model": "gemini-model-id"
  },
  "acknowledged_by": "Control Desk",
  "acknowledged_at": "ISO timestamp"
}
```

---

## 🚀 Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- Google Cloud project with Firestore + Gemini API enabled
- Firebase project with FCM configured

---

### 1 — Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# → Set GOOGLE_APPLICATION_CREDENTIALS and GOOGLE_API_KEY in .env

uvicorn app.main:app --reload --port 8000
```

---

### 2 — Frontend

```bash
cd frontend
npm install

cp .env.example .env
# → Set VITE_API_URL=http://localhost:8000

npm run dev
```

---

### 3 — Fire a Test Alert

```bash
curl -X POST "http://localhost:8000/api/alert" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "medical",
    "room": "401",
    "device_name": "panic_btn_401_a",
    "timestamp": "2026-04-26T10:45:00Z"
  }'
```

Within 3 seconds you should see the alert appear on the dashboard with a Gemini-generated brief and assigned action checklist.

---

## 📡 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/alert` | Ingest a new panic button alert |
| `GET` | `/api/alerts` | Retrieve all incidents (active + resolved) |
| `PATCH` | `/api/alert/{id}` | Update incident status or acknowledge |

**Real-time Socket.IO events:**

| Event | Trigger |
|-------|---------|
| `new_alert` | Fires when a new incident is created |
| `alert_updated` | Fires when an incident status changes |

---

## 🔭 Scope & Roadmap

### ✅ Implemented (This Build)

- Panic button ingestion pipeline — end-to-end
- Gemini AI brief + action checklist on every alert
- Smart task allocation to available staff
- Real-time dashboard with live Socket.IO sync
- Acknowledge & resolve workflow
- Risk Insights tab with Gemini analysis over 30-day history

### 🔜 Coming Soon (Teammate-Owned Features)

- FCM push notifications to staff devices
- IoT device registration endpoint
- Gemini-powered auto-escalation timer (90s)
- Multi-venue support

---

## 👥 Team

Built with care (and coffee) for a hackathon. Each component was owned by a dedicated team member — this repo reflects the core coordination and AI pipeline.

---

<div align="center">

**Built to protect people. Designed to move fast.**

*If even one emergency response is faster because of this — it was worth building.*

<br/>

[![Made with ❤️](https://img.shields.io/badge/Made%20with-❤️-red?style=for-the-badge)](.)
[![Powered by Gemini](https://img.shields.io/badge/Powered%20by-Gemini%20AI-4285F4?style=for-the-badge&logo=google)](https://deepmind.google/technologies/gemini/)

</div>
