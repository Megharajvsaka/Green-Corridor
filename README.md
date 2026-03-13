# Dynamic Green Corridor System — Bengaluru Emergency Response

Real-time emergency vehicle corridor management using real Bengaluru hospital
data and live OSRM road routing on OpenStreetMap.

## Data Sources (all free, no API key)
| Source | Usage |
|--------|-------|
| OpenStreetMap Overpass API | Real hospital locations in Bengaluru |
| OSRM public API | Real road routing on actual streets |
| OpenStreetMap tiles via Leaflet | Live street map |

## Quick Start

### 1. Backend
```bash
cd backend
npm install
node server.js
# → http://localhost:3001
# → Fetches real hospital data from Overpass API on startup
```

### 2. Frontend (new terminal)
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

Open **http://localhost:5173** — the map will load real Bengaluru streets and
hospital markers within a few seconds.

## Features
1. **Live Leaflet Map** — Real Bengaluru streets via OpenStreetMap tiles
2. **Real Hospital Locations** — Fetched from Overpass API (Manipal, Apollo, Victoria, etc.)
3. **Real Road Routing** — Ambulances follow actual OSRM road geometry
4. **Green Corridor Activation** — Colour-coded polylines on real streets
5. **Signal Management** — Red circle markers held along each corridor
6. **ETA Comparison** — Live comparison with vs. without corridor
7. **Admin Dashboard** — 4 stat cards + ambulance table
8. **Activity Log** — Timestamped event feed (newest first)
9. **Demo Mode** — Auto-dispatches every 8 seconds
10. **Fallbacks** — Overpass down? Uses hardcoded hospitals. OSRM down? Straight-line route.

## Architecture
```
Frontend (React + Vite)                Backend (Node.js + Express)
────────────────────────               ──────────────────────────
App.jsx                                server.js
  └─ MapView.jsx (Leaflet)     ←─────  Overpass API (hospitals)
  └─ ControlPanel.jsx          ←─────  OSRM API (routing)
  └─ AmbulanceList.jsx         ←─────  Socket.io (real-time)
  └─ ETAComparison.jsx                 tick every 2s
  └─ AdminDashboard.jsx
  └─ ActivityLog.jsx
```

## Socket Events
| Direction | Event | Payload |
|-----------|-------|---------|
| C → S | `dispatch_ambulance` | — |
| C → S | `reset_all` | — |
| S → C | `hospitals_loaded` | `{ hospitals }` |
| S → C | `full_state` | `{ ambulances, signals, log, stats }` |
| S → C | `corridor_activated` | `{ ambulanceId, hospital, routeCoords, signalCount }` |
| S → C | `ambulance_arrived` | `{ id, hospitalName, timeSaved }` |
| S → C | `log_event` | `{ time, message }` |
