# Rapid Crisis Response Backend

FastAPI backend for venue emergency coordination with Firestore persistence, Gemini-generated briefs, and Socket.IO real-time updates.

## Features

- `POST /api/alert` to ingest IoT panic alerts
- `GET /api/alerts` to list incidents
- `PATCH /api/alert/{id}` to acknowledge or update incidents
- `GET /api/risk-insights` for 30-day Gemini pattern analysis
- Socket.IO events: `new_alert`, `alert_updated`

## Run

1. Create and activate a Python virtual environment.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Copy environment template and set values:
   ```bash
   cp .env.example .env
   ```
4. Start the API:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

## Sample Alert Payload

```json
{
  "type": "medical",
  "room": "401",
  "device_name": "panic_btn_401_a",
  "timestamp": "2026-04-26T10:45:00Z"
}
```

# kill ngrok

Terminal: pkill -f "ngrok http 8000"

```bash

```
