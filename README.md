# Green Corridor System 🚑🚦 — Bengaluru Emergency Response

The **Green Corridor System** is an intelligent, real-time emergency response platform that automates traffic signal management and facilities synchronization. It leverages live geospatial data to create "Green Corridors" for ambulances, significantly reducing response times during the critical "Golden Hour."

## 🚀 Key Features

### 🚦 Smart Traffic Management (The Green Corridor)
- **Automated Signal Clearance**: Signals are held **GREEN** approximately 500m ahead of an active ambulance based on live velocity and OSRM routing.
- **Visual Signal HUD**: Real-time visualization of city-wide signal overrides on the Command Center map.

### 🚑 Driver Mission Deck (Two-Phase Dispatch)
- **Hyper-Alert System**: Instant "Dispatch Signal" intercept for nearby drivers.
- **Phase-Switching Logic**: Seamless transition from **Victim Intercept** to **Hospital Transport**.
- **Integrated Mission Console**: Real-time triage updates and facility coordination on a 60/40 split-pane dashboard.

### 🧠 AI-Driven Hospital Matching
- **AI Match Score**: percentage-based scoring (Proximity vs. Bed Availability vs. Department Status).
- **Facility Readiness**: Real-time acknowledgment system between Ambulance Drivers and ER units.

### 🛡️ Multi-Role Ecosystem
- **Citizen SOS**: GPS-locked SOS trigger with live arrival countdown.
- **Police Control**: City-wide mission ledger and live metric tracking (Time Saved, Signals Held).
- **Hospital Portal**: Specialized prep checklists and real-time patient dispatch radar.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, Socket.io, MongoDB (Persistence).
- **Frontend**: React (Vite), Leaflet.js (Maps), Tailwind CSS (Aesthetics).
- **APIs**: OSRM (Road Routing), Overpass API (Real-world Facility Data).

---

## 🚦 Quick Start

### 1. Backend Setup
```bash
cd backend
npm install
# Create a .env file with:
# MONGODB_URI=your_mongodb_connection_string
# PORT=3001
npm start
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
# Dashboard available at http://localhost:5173
```

---

## 🔄 Mission Lifecycle

1. **SOS Trigger**: Citizen sends a GPS-locked SOS from the `/request` page.
2. **Signal Dispatch**: Nearest ambulance receives a modal alert and accept/decline HUD.
3. **Corridor Established**: As the ambulance moves, the backend `tick()` function clears traffic signals in real-time.
4. **AI Triage**: Driver enters patient conditions; the system matches the best hospital via AI Match Engine.
5. **Hospital Handover**: ER unit confirms "Ready" on the `/hospital` page, tracking the inbound unit until arrival.

---

## 🏛️ Project Structure

- `/backend`: Node.js server, MongoDB models, and Green Corridor simulation logic.
- `/frontend`: React application using a standardized role-based routing layout.
  - `/src/pages`: Role-specific portals (Driver, Hospital, Police, Request).
  - `/src/components`: Reusable MapView and Dashboard HUD elements.

---

*Built with ❤️ for Bengaluru's Emergency Infrastructure.*
