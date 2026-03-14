// =============================================================
// Dynamic Green Corridor System — Backend Server
// =============================================================
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: 'http://localhost:5173', methods: ['GET', 'POST'] },
});

const LOOKAHEAD_COUNT = 3;

const ROAD_NAMES = [
  'MG Road','Brigade Road','Hosur Road','Outer Ring Road',
  'Bellary Road','Mysore Road','Old Madras Road','Bannerghatta Road',
  'Sarjapur Road','Whitefield Main Road','Marathahalli Road',
  'Koramangala Road','Indiranagar 100ft Road','CMH Road','HAL Road'
];

// ── 2. Ambulance colour palette ──────────────────────────────
const AMBULANCE_COLORS = [
  '#ef4444', '#3b82f6', '#f97316', '#a855f7', '#06b6d4', '#eab308',
];

// ── 3. Fallback hospitals ────────────────────────────────────
const FALLBACK_HOSPITALS = [
  { id: 'h1',  name: 'Manipal Hospital',      lat: 12.9516, lng: 77.6473 },
  { id: 'h2',  name: 'Apollo Hospital',        lat: 12.9345, lng: 77.6248 },
  { id: 'h3',  name: 'Victoria Hospital',      lat: 12.9634, lng: 77.5855 },
  { id: 'h4',  name: 'Fortis Hospital',        lat: 12.9279, lng: 77.6271 },
  { id: 'h5',  name: 'Narayana Health City',   lat: 12.8996, lng: 77.6101 },
  { id: 'h6',  name: 'St. Johns Hospital',     lat: 12.9404, lng: 77.6231 },
  { id: 'h7',  name: 'MS Ramaiah Hospital',    lat: 13.0195, lng: 77.5496 },
  { id: 'h8',  name: 'Sakra World Hospital',   lat: 12.9340, lng: 77.6836 },
  { id: 'h9',  name: 'BGS Gleneagles',         lat: 12.9121, lng: 77.5468 },
  { id: 'h10', name: 'Cloudnine Hospital',     lat: 12.9784, lng: 77.6408 },
];

// ── 4. In-memory state ───────────────────────────────────────
const state = {
  hospitals: [],
  ambulances: new Map(),
  signals: new Map(),
  log: [],
  counter: 0,
};

// ── 5. Fetch hospitals from Overpass API ─────────────────────
async function fetchHospitals() {
  try {
    const query = `
      [out:json];
      node["amenity"="hospital"](12.85,77.48,13.09,77.75);
      out 10;
    `;
    const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);
    const res = await axios.get(url, { timeout: 10000 });
    const elements = res.data.elements || [];
    if (elements.length === 0) throw new Error('Empty result from Overpass');
    const hospitals = elements.map((el) => ({
      id: String(el.id),
      name: el.tags.name || 'City Hospital',
      lat: el.lat,
      lng: el.lon,
    }));
    return hospitals;
  } catch (err) {
    return FALLBACK_HOSPITALS;
  }
}

// ── 6. OSRM real-road routing ────────────────────────────────
async function getRealRoute(originLat, originLng, destLat, destLng) {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${originLng},${originLat};${destLng},${destLat}` +
      `?overview=full&geometries=geojson`;
    const res = await axios.get(url, {
      timeout: 15000,
      headers: { 'User-Agent': 'GreenCorridorApp/2.0' }
    });
    const route = res.data.routes[0];
    if (!route || !route.geometry || !route.geometry.coordinates || route.geometry.coordinates.length === 0) {
      throw new Error('Invalid route from OSRM');
    }
    const coords = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    const durationSeconds = Math.round(route.duration);
    return { coords, durationSeconds };
  } catch (err) {
    const steps = 40;
    const coords = Array.from({ length: steps }, (_, i) => ({
      lat: parseFloat((originLat + (destLat - originLat) * (i / (steps - 1))).toFixed(6)),
      lng: parseFloat((originLng + (destLng - originLng) * (i / (steps - 1))).toFixed(6)),
    }));
    const dist = Math.sqrt(
      Math.pow((destLat - originLat) * 111000, 2) +
      Math.pow((destLng - originLng) * 111000, 2)
    );
    return { coords, durationSeconds: Math.round(dist / 13.8) };
  }
}

// ── 7. Random origin inside Bengaluru ────────────────────────
function getRandomOrigin() {
  const lat = 12.88 + Math.random() * 0.18;
  const lng = 77.50 + Math.random() * 0.22;
  return {
    lat: parseFloat(lat.toFixed(5)),
    lng: parseFloat(lng.toFixed(5)),
  };
}

// ── 8. Nearest hospital (Manhattan distance) ─────────────────
function getNearestHospital(lat, lng, hospitals) {
  return hospitals.reduce((nearest, h) => {
    const d  = Math.abs(h.lat - lat) + Math.abs(h.lng - lng);
    const nd = Math.abs(nearest.lat - lat) + Math.abs(nearest.lng - lng);
    return d < nd ? h : nearest;
  });
}

// ── 9. Signal intersections (every 10th coord) ───────────────
function getSignalPoints(routeCoords, ambulanceId) {
  return routeCoords
    .filter((_, i) => i % 10 === 0 && i !== 0)
    .map((coord, i) => {
      const signalObj = {
        id: `sig_${Date.now()}_${i}`,
        lat: coord.lat,
        lng: coord.lng,
        status: 'held',
        ambulanceId,
        ambulanceRoadSignal: 'green',
        crossRoadSignal: 'red',
        heldFor: 0,
        vehiclesStopped: Math.floor(Math.random() * 7) + 2,
        ambulanceRoadName: ROAD_NAMES[
          Math.floor(Math.random() * ROAD_NAMES.length)
        ],
        crossRoadName: ROAD_NAMES[
          Math.floor(Math.random() * ROAD_NAMES.length)
        ],
        clearedAt: null,
      };
      signalObj.stoppedVehicles = generateStoppedVehicles(signalObj);
      return signalObj;
    });
}

function generateStoppedVehicles(signal) {
  const count = Math.min(signal.vehiclesStopped, 4);
  const isNorthSouth = Math.random() > 0.5;
  const types = ['🚗','🚕','🚌','🛺'];
  return Array.from({ length: count }, (_, i) => ({
    id: `veh_${signal.id}_${i}`,
    lat: signal.lat + (isNorthSouth ? (i + 1) * 0.0003 : 0),
    lng: signal.lng + (isNorthSouth ? 0 : (i + 1) * 0.0003),
    type: types[Math.floor(Math.random() * types.length)],
  }));
}

// ── 10. Time string ──────────────────────────────────────────
function getTimeString() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// ── 11. Activity log ─────────────────────────────────────────
function addLog(message) {
  const entry = { time: getTimeString(), message };
  state.log.unshift(entry);
  if (state.log.length > 50) state.log.pop();
  io.emit('log_event', entry);
}

// ── 12. Serialise state for broadcast ────────────────────────
function serializeState() {
  const ambulancesArr = Array.from(state.ambulances.values());
  const signalsArr = Array.from(state.signals.values());

  const active    = ambulancesArr.filter((a) => a.status !== 'arrived').length;
  const corridors = active;
  const signalsHeld = signalsArr.filter((s) => s.status === 'held').length;

  const arrivedWithSaved = ambulancesArr.filter(
    (a) => a.status === 'arrived' && a.timeSaved > 0
  );
  const avgTimeSaved =
    arrivedWithSaved.length > 0
      ? Math.round(
          arrivedWithSaved.reduce((sum, a) => sum + a.timeSaved, 0) /
            arrivedWithSaved.length
        )
      : 0;

  return {
    ambulances: ambulancesArr,
    signals: signalsArr,
    log: state.log,
    stats: { active, corridors, signalsHeld, avgTimeSaved },
  };
}

function getUpcomingSignals(ambulance) {
  const ambulanceSignals = Array.from(state.signals.values())
    .filter(s => s.ambulanceId === ambulance.id && s.status === 'held');
  
  return ambulanceSignals
    .map((signal, i) => {
      const signalRouteIndex = (i + 1) * 10;
      const stepsAway = Math.ceil(
        (signalRouteIndex - ambulance.routeIndex) / ambulance.stepSize
      );
      const etaSeconds = Math.max(0, stepsAway * 2);
      return {
        signalId: signal.id,
        roadName: signal.ambulanceRoadName,
        crossRoad: signal.crossRoadName,
        etaSeconds,
        position: i + 1,
        status: etaSeconds <= 10 ? 'clearing' 
              : etaSeconds <= 20 ? 'queued' : 'pending',
      };
    })
    .filter(s => s.etaSeconds >= 0)
    .slice(0, LOOKAHEAD_COUNT);
}

// ── 13. Tick: advance ambulances ─────────────────────────────
function tickAmbulances() {
  for (const [id, amb] of state.ambulances) {
    if (amb.status === 'arrived') continue;

    amb.routeIndex = Math.min(
      amb.routeIndex + amb.stepSize,
      amb.totalCoords - 1
    );

    // Clear passed signals
    for (const sigId of amb.signalIds) {
      const sig = state.signals.get(sigId);
      if (!sig || sig.status === 'cleared') continue;
      const passed = amb.routeCoords.findIndex(
        (c) =>
          Math.abs(c.lat - sig.lat) < 0.0002 &&
          Math.abs(c.lng - sig.lng) < 0.0002
      );
      if (passed !== -1 && passed <= amb.routeIndex) {
        sig.status = 'cleared';
        sig.clearedAt = Date.now();
        addLog(`${amb.id} cleared signal at ${sig.lat.toFixed(4)}, ${sig.lng.toFixed(4)}`);
      }
    }

    const remaining = Math.max(0, amb.totalCoords - amb.routeIndex);
    const stepsRemaining = Math.ceil(remaining / amb.stepSize);
    amb.etaWith    = stepsRemaining * 2;
    amb.etaWithout = stepsRemaining * 4;

    amb.upcomingSignals = getUpcomingSignals(amb);

    if (amb.routeIndex >= amb.totalCoords - 1) {
      amb.status = 'arrived';
      amb.timeSaved = Math.max(0, amb.etaWithout / 2);

      for (const sigId of amb.signalIds) {
        state.signals.delete(sigId);
      }

      const savedMin = Math.floor(amb.timeSaved / 60);
      const savedSec = Math.round(amb.timeSaved % 60);
      const savedStr = savedMin > 0
        ? `${savedMin}m ${savedSec}s`
        : `${savedSec}s`;

      io.emit('ambulance_arrived', {
        id: amb.id,
        hospitalName: amb.hospital.name,
        timeSaved: amb.timeSaved,
      });
      addLog(`${amb.id} arrived at ${amb.hospital.name} — saved ~${savedStr}`);
    }
  }

  state.signals.forEach(sig => {
    if (sig.status === 'held') sig.heldFor += 2;
  });

  io.emit('predictive_update', {
    ambulances: Array.from(state.ambulances.values()).map(a => ({
      id: a.id,
      upcomingSignals: a.upcomingSignals || [],
    }))
  });
}

// ── 14. Socket.io connection handler ────────────────────────
io.on('connection', (socket) => {
  socket.emit('hospitals_loaded', { hospitals: state.hospitals });
  socket.emit('full_state', serializeState());

  socket.on('request_routes', async ({ originLat, originLng, hospitalId }) => {
    const hospital = state.hospitals.find(h => h.id === hospitalId)
      || state.hospitals[0];
    
    let routes = [];
    
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/`
        + `${originLng},${originLat};${hospital.lng},${hospital.lat}`
        + `?overview=full&geometries=geojson&alternatives=true`;
      const res = await axios.get(url, {
        timeout: 15000,
        headers: { 'User-Agent': 'GreenCorridorApp/2.0' }
      });
      
      routes = res.data.routes.slice(0, 3).map((r, i) => ({
        id: ['A','B','C'][i],
        label: ['Fastest','Alternate','Scenic'][i],
        coords: r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
        distanceKm: parseFloat((r.distance / 1000).toFixed(1)),
        durationSeconds: Math.round(r.duration),
        signalCount: Math.floor(r.geometry.coordinates.length / 10),
        recommended: i === 0,
      }));
    } catch (e) {
      console.error('⚠️ request_routes OSRM API failed:', e.message);
      if (e.response) {
        console.error('Response data:', e.response.data);
      }
    }
    
    // Always ensure 3 routes
    while (routes.length < 3) {
      const idx = routes.length;
      const steps = 20 + idx * 5;
      const jitter = idx * 0.002;
      const coords = Array.from({ length: steps }, (_, i) => ({
        lat: originLat + (hospital.lat - originLat) * (i / steps) 
             + (i % 2 === 0 ? jitter : -jitter),
        lng: originLng + (hospital.lng - originLng) * (i / steps),
      }));
      routes.push({
        id: ['A','B','C'][idx],
        label: ['Fastest','Alternate','Shortest'][idx],
        coords,
        distanceKm: parseFloat(
          (Math.sqrt(
            Math.pow((hospital.lat - originLat) * 111000, 2) +
            Math.pow((hospital.lng - originLng) * 111000, 2)
          ) / 1000 * (1 + idx * 0.3)).toFixed(1)
        ),
        durationSeconds: 180 + idx * 60,
        signalCount: Math.floor(steps / 10),
        recommended: idx === 0,
      });
    }
    
    socket.emit('routes_available', {
      routes,
      hospitalId,
      hospitalName: hospital.name,
      originLat,
      originLng,
    });
  });

  socket.on('dispatch_ambulance', async (payload) => {
    const activeCount = Array.from(state.ambulances.values()).filter(
      (a) => a.status !== 'arrived'
    ).length;
    if (activeCount >= 6) return;

    state.counter += 1;
    const ambNum  = String(state.counter).padStart(3, '0');
    const ambId   = `AMB-${ambNum}`;
    const color   = AMBULANCE_COLORS[(state.counter - 1) % AMBULANCE_COLORS.length];

    let routeCoords, hospital, originLat, originLng;
    
    if (payload && payload.routeCoords && payload.routeCoords.length > 0) {
      routeCoords = payload.routeCoords;
      hospital = state.hospitals.find(h => h.id === payload.hospitalId)
        || state.hospitals[0];
      originLat = payload.originLat;
      originLng = payload.originLng;
    } else {
      const origin = getRandomOrigin();
      originLat = origin.lat;
      originLng = origin.lng;
      hospital = getNearestHospital(originLat, originLng, state.hospitals);
      const route = await getRealRoute(originLat, originLng, hospital.lat, hospital.lng);
      routeCoords = route.coords;
    }

    const stepSize = 5;
    const signals = getSignalPoints(routeCoords, ambId);
    for (const sig of signals) {
      state.signals.set(sig.id, sig);
    }

    const remaining    = routeCoords.length;
    const stepsRemain  = Math.ceil(remaining / stepSize);
    const etaWith      = stepsRemain * 2;
    const etaWithout   = stepsRemain * 4;

    const ambulance = {
      id: ambId,
      color,
      status: 'en_route',
      originLat,
      originLng,
      originLabel: `${originLat.toFixed(5)}, ${originLng.toFixed(5)}`,
      hospital,
      routeCoords: routeCoords,
      routeIndex: 0,
      stepSize,
      totalCoords: routeCoords.length,
      etaWith,
      etaWithout,
      timeSaved: 0,
      signalIds: signals.map((s) => s.id),
      dispatchedAt: Date.now(),
      upcomingSignals: [],
    };

    state.ambulances.set(ambId, ambulance);

    io.emit('corridor_activated', {
      ambulanceId: ambId,
      hospital,
      routeCoords,
      signalCount: signals.length,
    });

    addLog(`${ambId} dispatched → ${hospital.name} (${signals.length} signals held)`);
  });

  socket.on('reset_all', () => {
    state.ambulances.clear();
    state.signals.clear();
    state.log.length = 0;
    state.counter = 0;
    addLog('All systems reset');
    io.emit('full_state', serializeState());
  });

});

setInterval(tickAmbulances, 2000);
setInterval(() => { io.emit('full_state', serializeState()); }, 2000);

async function start() {
  state.hospitals = await fetchHospitals();
  httpServer.listen(3001);
}
start().catch(() => process.exit(1));
