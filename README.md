# 🚑 Green Corridor — Dynamic Emergency Vehicle Priority System

> **PS 2.3** · Hackathon Project · March 2026  
> *An AI-powered, real-time platform that dynamically clears traffic signals for ambulances, saving lives during the critical Golden Hour.*

---

## 🚨 The Problem

Urban traffic congestion delays ambulances by **3–8 minutes** on average. During a cardiac arrest, **1.9 million brain cells die every minute**. There is no automated system that dynamically coordinates traffic signals to provide uninterrupted routes for emergency vehicles.

---

## ✅ Our Solution

**Green Corridor** connects Citizens → Ambulance Drivers → Traffic Signals → Hospitals in a single real-time platform. When an SOS is triggered, the system:

1. Instantly alerts the nearest available drivers via Socket.IO
2. Computes a real-road route using the OSRM routing engine
3. Pre-clears traffic signals along the ambulance's path
4. Uses an AI scoring engine to select the best available hospital
5. Notifies the hospital to prep for the incoming patient

---

## 🌐 Live Roles & Pages

| Role | URL | Description |
|---|---|---|
| 🆘 Citizen | `/citizen` | One-tap SOS with GPS auto-share |
| 🚑 Driver | `/driver` | Mission console, live map, triage form |
| 🏥 Hospital | `/hospital` | Incoming alert, prep checklist, route map |
| 👮 Police / Command | `/` | City-wide dashboard, live metrics |

---

## 🧠 Key Features

### 🆘 Citizen SOS
- One-tap emergency request with GPS coordinates
- Unique session ID for deterministic dispatch matching
- Live status: Pending → Assigned → En Route → Arrived
- 20-second safety timeout with auto-retry prompt

### 🚑 Driver Mission Console
- **Full-screen alert overlay** on incoming emergencies (impossible to miss)
- Accept/Decline with 30-second countdown
- **Real-road ambulance tracking** — follows OSRM route coords, not straight lines
- Two-phase mission: Victim Intercept → Hospital Transport
- In-field triage form (conditions, notes) before hospital hand-off

### 🚦 Dynamic Green Corridor
- Traffic signals pre-cleared **500m ahead** of the ambulance route
- Index-based + distance-based signal clearing logic
- Persistent signal markers on all maps with live status (HELD 🔴 / CLEARED 🟢)
- Signals persisted in MongoDB and synced to all clients

### 🧠 AI Hospital Dispatcher
- Composite score formula:
  ```
  Score = (Travel 50%) + (Bed Availability 30%) + (Corridor Score 20%)
  ```
- Selects optimal hospital and routes the ambulance there
- Hospital receives pre-alert and displays incoming patient details

### 🏥 Hospital Portal
- Real-time incoming patient tracker
- Condition-specific prep checklists (Cardiac, Trauma, etc.)
- Live ambulance tracking map with blue route polyline
- Ready acknowledgment messaging back to driver

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Leaflet.js |
| Real-time | Socket.IO (bidirectional, <1s sync) |
| Backend | Node.js, Express |
| Database | MongoDB + Mongoose (full persistence) |
| Routing | OSRM (Open Source Routing Machine) — real road routes |
| Maps | CartoDB Voyager tiles via Leaflet |

---

## 🚀 Quick Start

### Prerequisites
- Node.js ≥ 18
- MongoDB Atlas URI (or local MongoDB)

### 1. Backend
```bash
cd backend
npm install

# Create .env file:
echo "MONGODB_URI=your_mongodb_connection_string" > .env
echo "PORT=3001" >> .env

npm start
# Server runs at http://localhost:3001
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
# App runs at http://localhost:5173
```

### 3. Open All Roles
| Tab | URL |
|---|---|
| Command Center | `http://localhost:5173/` |
| Citizen SOS | `http://localhost:5173/citizen` |
| Driver Hub | `http://localhost:5173/driver` |
| Hospital Portal | `http://localhost:5173/hospital` |

---

## 🔄 End-to-End Flow

```
Citizen triggers SOS
        │
        ▼
Backend saves Emergency (MongoDB)
        │
        ├─► Broadcasts `emergency_alert` to all drivers (Socket.IO room)
        │
        ▼
Driver sees full-screen overlay alert → Accepts
        │
        ▼
Backend: Atomic lock on Emergency, fetches OSRM route
        │
        ├─► Persists route coords + traffic signals to MongoDB
        ├─► Emits `case_assigned` to driver with routeToVictim
        └─► Emits `new_emergency` to citizen (sessionId matched)
        │
        ▼
Backend tick() runs every 1 second:
        │
        ├─► Advances ambulance routeIndex by 3 steps
        ├─► Clears signals ambulance has passed
        └─► Broadcasts `full_state` + `ambulance_positions`
        │
        ▼
Driver arrives → Triage → AI picks hospital → Hospital route computed
        │
        ▼
Hospital pre-alerted → Patient delivered → Mission complete ✅
```

---

## 📁 Project Structure

```
green-corridor/
├── backend/
│   ├── server.js       # Main server: Socket.IO events, tick(), AI dispatcher
│   ├── models.js       # MongoDB schemas: Driver, Hospital, Emergency, Signal
│   └── .env            # MONGODB_URI, PORT
└── frontend/
    └── src/
        ├── pages/
        │   ├── RequestPage.jsx   # Citizen SOS
        │   ├── DriverPage.jsx    # Driver mission console + MiniMap
        │   ├── HospitalPage.jsx  # Hospital portal + tracking map
        │   └── CommandCenter.jsx # Police/Admin dashboard
        ├── socket.js             # Shared Socket.IO client singleton
        └── App.jsx               # Routing
```

---

## 📊 Impact Metrics

| Metric | Value |
|---|---|
| ⏱️ Estimated time saved per corridor | ~4 minutes |
| 🚦 Signal pre-clearance range | 500m ahead |
| 📡 Real-time sync latency | < 1 second |
| 🏥 Hospital selection algorithm | 3-factor AI composite |
| 🗺️ Routing engine | Real road network (OSRM) |

---

## 🔮 Future Roadmap

- 🔌 IoT integration with real traffic signal hardware (MQTT/V2X)
- 📈 Predictive routing using historical congestion data
- 🌏 Multi-city fleet management dashboard
- 📞 Integration with 108 National Emergency API
- 🚁 Air ambulance corridor coordination

---

*Built with ❤️ for Bengaluru's Emergency Infrastructure.*  
*Green Corridor — Because the road to the hospital should always be clear.*
