// =============================================================
// Green Corridor System — Industry Level Persistence (MongoDB)
// =============================================================
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');
const { Driver, Hospital, Emergency, Signal } = require('./models');

const app = express();
app.use(cors({ origin: '*' }));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ── 1. Constants ─────────────────────────────────────────────
const AMBULANCE_COLORS = ['#ef4444', '#3b82f6', '#f97316', '#a855f7', '#06b6d4', '#eab308'];
const ROAD_NAMES = [
  'MG Road', 'Brigade Road', 'Hosur Road', 'Outer Ring Road',
  'Bellary Road', 'Mysore Road', 'Old Madras Road', 'Bannerghatta Road',
  'Sarjapur Road', 'Whitefield Main Road', 'Marathahalli Road',
  'Koramangala Road', 'Indiranagar 100ft Road', 'CMH Road', 'HAL Road',
];

const overriddenSignals = new Set();

const FALLBACK_HOSPITALS = [
  { hospitalId: 'h1', name: 'Manipal Hospital', lat: 12.9516, lng: 77.6473, totalBeds: 80 },
  { hospitalId: 'h2', name: 'Apollo Hospital', lat: 12.9345, lng: 77.6248, totalBeds: 120 },
  { hospitalId: 'h3', name: 'Victoria Hospital', lat: 12.9634, lng: 77.5855, totalBeds: 200 },
  { hospitalId: 'h4', name: 'Fortis Hospital', lat: 12.9279, lng: 77.6271, totalBeds: 60 },
  { hospitalId: 'h5', name: 'Narayana Health City', lat: 12.8996, lng: 77.6101, totalBeds: 150 },
];

// ── 2. Distance Calc (Haversine) ─────────────────────────────
function kmDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ── 3. OSRM Routing ──────────────────────────────────────────
async function getRealRoute(originLat, originLng, destLat, destLng) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`;
    const res = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'GreenCorridorApp/2.0' } });
    const route = res.data.routes[0];
    const coords = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    return { coords, durationSeconds: Math.round(route.duration) };
  } catch (err) {
    const steps = 30;
    const coords = Array.from({ length: steps }, (_, i) => ({
      lat: originLat + (destLat - originLat) * (i / (steps-1)),
      lng: originLng + (destLng - originLng) * (i / (steps-1)),
    }));
    return { coords, durationSeconds: Math.round(kmDistance(originLat, originLng, destLat, destLng) * 80) };
  }
}

// ── 4. Signal Persistence Helper ─────────────────────────────


async function generateSignalsForRoute(emergencyId, coords, ambulanceId) {
  const signalDocs = [];
  const epoch = Date.now();
  // Signal every 10th coord (matching reference code) — skip first and last 5
  for (let i = 10; i < coords.length - 5; i += 10) {
    const coord = coords[i];
    signalDocs.push({
      signalId: `SIG-${emergencyId}-${i}-${epoch}`,
      emergencyId,
      ambulanceId,
      routeIndex: i,
      location: { type: 'Point', coordinates: [coord.lng, coord.lat] },
      lat: coord.lat,
      lng: coord.lng,
      ambulanceRoadName: ROAD_NAMES[Math.floor(Math.random() * ROAD_NAMES.length)],
      crossRoadName: ROAD_NAMES[Math.floor(Math.random() * ROAD_NAMES.length)],
      vehiclesStopped: Math.floor(Math.random() * 7) + 2,
      heldFor: 0,
      status: 'held',
    });
  }
  if (signalDocs.length > 0) {
    await Signal.insertMany(signalDocs);
  }
  console.log(`[SIGNALS] Generated ${signalDocs.length} signals for ${emergencyId}`);
}


// ── 4. AI Dispatcher ─────────────────────────────────────────
async function runAIDispatcher(emergency) {
  const hospitals = await Hospital.find();
  const scores = hospitals.map(h => {
    const lat = h.location.coordinates[1];
    const lng = h.location.coordinates[0];
    const dist = kmDistance(emergency.location.coordinates[1], emergency.location.coordinates[0], lat, lng);
    
    const travelScore = Math.max(0, 100 - (dist * 10)); 
    const loadScore = Math.min(100, (h.availableBeds / h.totalBeds) * 100);
    const corridorScore = 70 + (Math.random() * 30); 

    const composite = (travelScore * 0.5) + (loadScore * 0.3) + (corridorScore * 0.2);
    
    return { 
      hospital: h, 
      composite: Math.round(composite),
      breakdown: { travelScore: Math.round(travelScore), loadScore: Math.round(loadScore), corridorScore: Math.round(corridorScore), availableBeds: h.availableBeds } 
    };
  });

  scores.sort((a, b) => b.composite - a.composite);
  return scores[0]; 
}

// ── 5. Main State Tick ──────────── (Legacy Simulation logic simplified)
async function tick() {
  const activeEmergencies = await Emergency.find({ status: { $in: ['en_route', 'hospital_bound'] } });
  const updates = [];
  
  for (const em of activeEmergencies) {
    if (!em.routeCoords || em.routeCoords.length === 0) continue;
    
    const currentIndex = em.routeIndex || 0;
    // Step size 3 for a brisk but smooth movement (Zomato-style)
    const stepSize = 3;
    const nextIndex = Math.min(currentIndex + stepSize, em.routeCoords.length - 1);
    
    await Emergency.updateOne({ _id: em._id }, { routeIndex: nextIndex });

    const currentCoord = em.routeCoords[nextIndex];
    updates.push({
      id: em.id,
      lat: currentCoord.lat,
      lng: currentCoord.lng,
      routeIndex: nextIndex,
      status: em.status
    });

    if (nextIndex >= em.routeCoords.length - 1) {
       if (em.status === 'en_route') {
         await Emergency.updateOne({ _id: em._id }, { status: 'at_scene' });
       } else if (em.status === 'hospital_bound') {
         await Emergency.updateOne({ _id: em._id }, { status: 'completed' });
         io.emit('patient_arrived', { emergencyId: em.id, ambulanceId: em.assignedAmbulanceId });
       }
    }
  }

  // Fetch all persistent signals for active missions
  const activeEmIds = activeEmergencies.map(e => e.id);
  const dbSignals = await Signal.find({ emergencyId: { $in: activeEmIds } });
  
  const broadcastSignals = dbSignals.map(sig => {
    const em = activeEmergencies.find(e => e.id === sig.emergencyId);
    if (!em) return sig;

    // Index-based check as primary, with distance fallback from snippet logic
    const hasPassedIndex = (em.routeIndex || 0) >= (sig.routeIndex || 0);
    const currentCoord = em.routeCoords[em.routeIndex || 0];
    const hasPassedDist = currentCoord ? (
      Math.abs(currentCoord.lat - sig.lat) < 0.0002 &&
      Math.abs(currentCoord.lng - sig.lng) < 0.0002
    ) : false;

    const isOverridden = overriddenSignals.has(sig.signalId);
    const isCleared = isOverridden || hasPassedIndex || hasPassedDist;

    return {
      ...sig._doc,
      status: isCleared ? 'cleared' : 'held',
      ambulanceRoadSignal: 'green',          // ambulance lane always green
      crossRoadSignal: isCleared ? 'green' : 'red', // cross traffic: red while held, green after cleared
      vehiclesStopped: sig.vehiclesStopped || 0,
      heldFor: sig.heldFor || 0,
    };
  });

  // Increment heldFor on all still-held signals (1 second per tick)
  if (activeEmIds.length > 0) {
    await Signal.updateMany(
      { emergencyId: { $in: activeEmIds }, status: 'held' },
      { $inc: { heldFor: 1 } }
    );
  }

  if (updates.length > 0) {
    io.emit('ambulance_positions', updates);
  }

  // Broadcast Full State (Aggregated from DB and FLATTENED for frontend)
  const [dbEmergencies, dbDrivers, dbHospitals] = await Promise.all([
    Emergency.find().limit(20).sort({ createdAt: -1 }),
    Driver.find({ status: { $ne: 'offline' } }),
    Hospital.find()
  ]);
  
  const flattenLoc = (obj) => ({
    ...obj._doc,
    lat: obj.location.coordinates[1],
    lng: obj.location.coordinates[0],
    id: obj.id || obj.driverId || obj.hospitalId || obj._id.toString()
  });

  // Compute current ambulance positions from route data
  const emergenciesWithPosition = dbEmergencies.map(em => {
    const base = flattenLoc(em);
    // If the emergency has an active route, compute the ambulance's current position
    if (em.routeCoords && em.routeCoords.length > 0 && em.routeIndex != null) {
      const idx = Math.min(em.routeIndex, em.routeCoords.length - 1);
      const pos = em.routeCoords[idx];
      if (pos) {
        base.lat = pos.lat;
        base.lng = pos.lng;
        base.currentLat = pos.lat;
        base.currentLng = pos.lng;
      }
    }
    return base;
  });

  io.emit('full_state', {
    emergencies: emergenciesWithPosition,
    drivers: dbDrivers.map(flattenLoc),
    ambulances: dbDrivers.map(flattenLoc), // Aliasing for legacy frontend components
    hospitalStatus: dbHospitals.map(flattenLoc),
    signals: broadcastSignals,
    stats: {
      active: activeEmergencies.length,
      corridors: activeEmergencies.length,
      signalsHeld: broadcastSignals.filter(s => s.status === 'held').length,
      avgTimeSaved: activeEmergencies.length * 4 // Heuristic: 4 mins saved per corridor
    }
  });
}

// ── 6. Socket logic with DB ───────────────────────────────────
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // 🆘 CITIZEN REQUEST
  socket.on('sos_request', async (data) => {
    try {
      const id = `SOS-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      console.log(`[SOS] Incoming request for ${id} from session ${data.sessionId || 'UNKNOWN'}`);
      
      const emergency = new Emergency({
        id,
        type: data.type,
        description: data.description,
        reporterName: data.reporterName,
        sessionId: data.sessionId,
        location: { type: 'Point', coordinates: [data.lng, data.lat] },
        statusTimeline: [{ label: 'Request Received', time: new Date() }]
      });
      await emergency.save();

      // DIAGNOSTIC: Log fleet state
      const availableDrivers = await Driver.find({ status: 'available' });
      console.log(`[SOS] ${availableDrivers.length} drivers available for ${id}`);

      let targetDrivers = [];
      try {
        targetDrivers = await Driver.find({
          status: 'available',
          location: {
            $near: {
              $geometry: { type: 'Point', coordinates: [data.lng, data.lat] },
              $maxDistance: 100000 // 100km
            }
          }
        });
      } catch (err) {
        console.error(`[SOS] Geospatial query fail for ${id}:`, err.message);
        targetDrivers = availableDrivers;
      }

      const alertPayload = {
        emergencyId: id,
        type: data.type,
        lat: data.lat,
        lng: data.lng,
        description: data.description,
        alertedCount: Math.max(targetDrivers.length, 1)
      };

      // Guaranteed delivery via 'drivers' room
      io.to('drivers').emit('emergency_alert', alertPayload);

      // Legacy direct socket delivery as fallback
      targetDrivers.forEach(drv => {
        if (drv.socketId) io.to(drv.socketId).emit('emergency_alert', alertPayload);
      });

      // Explicit plain object so sessionId is always serialized correctly
      const broadcast = {
        id,
        sessionId: data.sessionId,
        type: data.type,
        description: data.description,
        reporterName: data.reporterName,
        lat: data.lat,
        lng: data.lng,
        status: 'pending',
        alertedCount: Math.max(targetDrivers.length, 1),
      };
      console.log(`[SOS] ✅ Dispatched ${id} | session=${data.sessionId}`);
      io.emit('new_emergency', broadcast);
    } catch (err) {
      console.error('[SOS FATAL] Request failed:', err.message);
      socket.emit('sos_request_failed', { error: 'Internal system error. Please retry or call emergency services.' });
    }
  });

  // 🚑 DRIVER REGISTER
  socket.on('driver_register', async (data) => {
    console.log(`[REGISTER] Driver: ${data.driverId} (Ambulance: ${data.ambulanceId})`);
    socket.join('drivers'); 
    await Driver.findOneAndUpdate(
      { driverId: data.driverId },
      { 
        ...data, 
        socketId: socket.id, 
        status: 'available',
        location: { type: 'Point', coordinates: [data.lng, data.lat] },
        lastUpdate: new Date()
      },
      { upsert: true, returnDocument: 'after' }
    );

    // ⚡ RACE CONDITION FIX: Check for RECENT pending emergencies the driver may have missed (last 5 min only)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const pendingEmergencies = await Emergency.find({ status: 'pending', assignedDriverId: null, createdAt: { $gte: fiveMinAgo } });
    if (pendingEmergencies.length > 0) {
      console.log(`[REGISTER] Driver ${data.driverId} joined late — replaying ${pendingEmergencies.length} pending SOS alert(s).`);
      pendingEmergencies.forEach(em => {
        socket.emit('emergency_alert', {
          emergencyId: em.id,
          type: em.type,
          lat: em.location.coordinates[1],
          lng: em.location.coordinates[0],
          description: em.description,
          alertedCount: 1
        });
      });
    }
  });

  // 🚑 DRIVER ACCEPT (Atomic Lock — prevents VersionError on concurrent accepts)
  socket.on('driver_accept', async ({ driverId, emergencyId }) => {
    try {
      // Pre-flight check: ensure driver exists
      const drv = await Driver.findOne({ driverId });
      if (!drv) { socket.emit('case_already_taken'); return; }

      // Atomic lock: only succeeds if assignedDriverId is still null
      const em = await Emergency.findOneAndUpdate(
        { id: emergencyId, assignedDriverId: null }, // filter: not yet assigned
        {
          $set: {
            status: 'en_route',
            assignedDriverId: driverId,
            assignedAmbulanceId: drv.ambulanceId,
            driverName: drv.name,
            routeIndex: 0,
          },
          $push: { statusTimeline: { label: 'Ambulance Assigned', time: new Date() } }
        },
        { returnDocument: 'after' }
      );

      if (!em) {
        // Another driver already took it
        socket.emit('case_already_taken');
        return;
      }

      // Now compute the real route to the victim
      const realRoute = await getRealRoute(
        drv.location.coordinates[1], drv.location.coordinates[0],
        em.location.coordinates[1], em.location.coordinates[0]
      );

      await Emergency.updateOne({ id: emergencyId }, { $set: { routeCoords: realRoute.coords } });
      
      // Generate and persist signals for the route
      await generateSignalsForRoute(emergencyId, realRoute.coords, drv.ambulanceId);

      await Driver.updateOne({ driverId }, { $set: { status: 'on_mission' } });

      // Notify ALL alerted drivers that the case is gone
      io.emit('case_assigned_broadcast', { emergencyId, driverName: drv.name });

      socket.emit('case_assigned', {
        emergencyId,
        emergency: em,
        routeToVictim: realRoute.coords,
        etaSeconds: realRoute.durationSeconds
      });
    } catch (err) {
      console.error('[DRIVER_ACCEPT] Error:', err.message);
      socket.emit('case_already_taken');
    }
  });

  // 🚑 VICTIM PICKUP
  socket.on('victim_picked_up', async ({ emergencyId, driverId, victimReport }) => {
    try {
      console.log(`[HOSPITAL-DISPATCH] Commencing AI Dispatch for ${emergencyId}`);
      const em = await Emergency.findOne({ id: emergencyId });
      em.status = 'hospital_bound';
      em.victimReport = { ...victimReport, pickedUpAt: new Date() };
      em.statusTimeline.push({ label: 'Victim Aboard', time: new Date() });

      const result = await runAIDispatcher(em);
      const hospital = result.hospital;
      em.selectedHospitalId = hospital.id;

      const route = await getRealRoute(em.location.coordinates[1], em.location.coordinates[0], hospital.location.coordinates[1], hospital.location.coordinates[0]);
      em.routeCoords = route.coords;
      em.routeIndex = 0;
      
      // Clear old signals and generate new ones for the hospital route
      await Signal.deleteMany({ emergencyId });
      await generateSignalsForRoute(emergencyId, route.coords, em.assignedAmbulanceId);

      await em.save();

      io.emit('incoming_patient', {
        emergencyId,
        emergencyType: em.type,
        ambulanceId: em.assignedAmbulanceId,
        driverName: em.driverName,
        etaSeconds: route.durationSeconds,
        victimReport,
        aiResult: { compositeScore: result.composite, breakdown: result.breakdown }
      });

      const newSignals = await Signal.find({ emergencyId }).lean();
      
      socket.emit('hospital_route_assigned', {
        hospital: { name: hospital.name, lat: hospital.location.coordinates[1], lng: hospital.location.coordinates[0] },
        routeCoords: route.coords,
        etaSeconds: route.durationSeconds,
        aiResult: result,
        signals: newSignals.map(s => ({ ...s, lat: s.location.coordinates[1], lng: s.location.coordinates[0], id: s.signalId })),
        signalCount: newSignals.length
      });
      console.log(`[HOSPITAL-DISPATCH] Success. AI selected ${hospital.name}`);
    } catch (err) {
      console.error(`[HOSPITAL-DISPATCH CRASH] Failed to compute/assign hospital route for ${emergencyId}:`, err);
    }
  });

  // 🚓 POLICE SIGNAL OVERRIDE
  socket.on('police_signal_override', ({ signalId }) => {
    console.log(`[POLICE] Manual Override Executed for Signal: ${signalId}`);
    overriddenSignals.add(signalId);
    // Overrides clear automatically after 3 minutes
    setTimeout(() => overriddenSignals.delete(signalId), 180000);
  });

  // 🏥 HOSPITAL READINESS ACK
  socket.on('hospital_ready_ack', async ({ hospitalId, emergencyId, message }) => {
     console.log(`[HOSPITAL] Readiness confirmed for ${emergencyId} by ${hospitalId}`);
     const em = await Emergency.findOne({ id: emergencyId });
     if (em && em.assignedDriverId) {
       const drv = await Driver.findOne({ driverId: em.assignedDriverId });
       if (drv && drv.socketId) {
         io.to(drv.socketId).emit('hospital_confirmed_ready', { message });
       }
     }
  });

  // 🏁 MISSION COMPLETE
  socket.on('mission_complete', async ({ emergencyId, hospitalId }) => {
     console.log(`[MISSION COMPLETE] Emergency ${emergencyId} arrived at Hospital ${hospitalId}`);
     const em = await Emergency.findOne({ id: emergencyId });
     if (em) {
       em.status = 'completed';
       await em.save();
       const drv = await Driver.findOne({ driverId: em.assignedDriverId });
       if (drv) {
         await Driver.updateOne({ driverId: drv.driverId }, { status: 'available' });
         if (drv.socketId) {
           io.to(drv.socketId).emit('mission_complete_ack');
         }
       }
     }
  });

  socket.on('disconnect', async () => {
    console.log(`[SOCKET] Disconnected: ${socket.id}`);
    const drv = await Driver.findOne({ socketId: socket.id });
    if (drv) {
      console.log(`[STATUS] Driver ${drv.driverId} went offline.`);
      await Driver.updateOne({ socketId: socket.id }, { status: 'offline' });
    }
  });
});

// ── 7. Boilerplate & Init ─────────────────────────────────────
async function initHospitals() {
  const count = await Hospital.countDocuments();
  if (count === 0) {
    console.log('Seed: Initializing hospitals...');
    for (const h of FALLBACK_HOSPITALS) {
      await new Hospital({
        hospitalId: h.hospitalId,
        name: h.name,
        totalBeds: h.totalBeds,
        availableBeds: Math.floor(Math.random() * h.totalBeds * 0.5),
        location: { type: 'Point', coordinates: [h.lng, h.lat] },
        departments: { cardiology: 'available', trauma: 'on_call', neurology: 'available', pediatrics: 'available', burns: 'limited' }
      }).save();
    }
  }
}

async function start() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/greencorridor');
    console.log('✅ MongoDB Connected');
    
    // Ensure Geospatial Indexes are built
    await Driver.createIndexes();
    await Emergency.createIndexes();
    await Hospital.createIndexes();
    console.log('✅ Geospatial Indexes Synchronized');

    await initHospitals();

    // 🧹 Clean start: remove old stale emergencies and reset drivers for fresh demo
    const staleCleanup = await Emergency.deleteMany({ 
      createdAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) } // older than 10 min
    });
    if (staleCleanup.deletedCount > 0) {
      console.log(`🧹 Cleaned ${staleCleanup.deletedCount} stale emergencies from previous sessions`);
    }
    await Driver.updateMany({}, { $set: { status: 'offline' } });
    console.log('🧹 All drivers reset to offline — ready for fresh connections');
    httpServer.listen(process.env.PORT || 3001, () => console.log('🚀 Server running on port 3001'));
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err.message);
  }
}

setInterval(tick, 1000);
start();
