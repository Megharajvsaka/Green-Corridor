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
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN || 'http://localhost:5173', methods: ['GET', 'POST'] },
});

// ── 1. Constants ─────────────────────────────────────────────
const AMBULANCE_COLORS = ['#ef4444', '#3b82f6', '#f97316', '#a855f7', '#06b6d4', '#eab308'];
const ROAD_NAMES = ['MG Road', 'Brigade Road', 'Hosur Road', 'Outer Ring Road', 'Old Madras Road', 'Whitefield Road'];

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
  
  for (const em of activeEmergencies) {
    if (!em.routeCoords || em.routeCoords.length === 0) continue;
    
    const currentIndex = em.routeIndex || 0;
    const nextIndex = Math.min(currentIndex + 2, em.routeCoords.length - 1);
    
    await Emergency.updateOne({ _id: em._id }, { routeIndex: nextIndex });

    if (nextIndex >= em.routeCoords.length - 1) {
       if (em.status === 'en_route') {
         await Emergency.updateOne({ _id: em._id }, { status: 'at_scene' });
       } else if (em.status === 'hospital_bound') {
         await Emergency.updateOne({ _id: em._id }, { status: 'completed' });
         io.emit('patient_arrived', { emergencyId: em.id, ambulanceId: em.assignedAmbulanceId });
       }
    }
  }

  // Broadcast Signal Simulation (held signals along active routes)
  const signals = [];
  for (const em of activeEmergencies) {
    if (em.routeCoords && em.routeIndex < em.routeCoords.length) {
      const current = em.routeCoords[em.routeIndex];
      // Every 10th coordinate, simulate a "Held Signal"
      if (em.routeIndex % 10 === 0) {
        signals.push({
          id: `SIG-${em.id}-${em.routeIndex}`,
          lat: current.lat + 0.0002, // Slightly offset from road for visibility
          lng: current.lng + 0.0002,
          ambulanceId: em.assignedAmbulanceId,
          ambulanceRoadName: 'Green Corridor Arterial',
          crossRoadName: 'Stalled Traffic Lane',
          status: 'held',
          heldFor: Math.floor(Math.random() * 60) + 10,
          vehiclesStopped: Math.floor(Math.random() * 15) + 5,
          ambulanceRoadSignal: 'green',
          crossRoadSignal: 'red'
        });
      }
    }
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

  io.emit('full_state', {
    emergencies: dbEmergencies.map(flattenLoc),
    drivers: dbDrivers.map(flattenLoc),
    ambulances: dbDrivers.map(flattenLoc), // Aliasing for legacy frontend components
    hospitalStatus: dbHospitals.map(flattenLoc),
    signals: signals,
    stats: {
      active: activeEmergencies.length,
      corridors: activeEmergencies.length,
      signalsHeld: signals.length,
      avgTimeSaved: activeEmergencies.length * 4 // Heuristic: 4 mins saved per corridor
    }
  });
}

// ── 6. Socket logic with DB ───────────────────────────────────
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // 🆘 CITIZEN REQUEST
  socket.on('sos_request', async (data) => {
    const id = `SOS-${Date.now().toString().slice(-4)}`;
    const emergency = new Emergency({
      id,
      type: data.type,
      description: data.description,
      reporterName: data.reporterName,
      location: { type: 'Point', coordinates: [data.lng, data.lat] },
      statusTimeline: [{ label: 'Request Received', time: new Date() }]
    });
    await emergency.save();

    // DIAGNOSTIC: Log all registered drivers to see why they aren't matching 'available'
    const totalFleet = await Driver.find({});
    console.log(`[SOS DEBUG] Current Fleet State: ${totalFleet.map(d => `${d.driverId}(${d.status})`).join(', ') || 'NONE'}`);

    let nearbyDrivers = await Driver.find({
      status: 'available',
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [data.lng, data.lat] },
          $maxDistance: 100000 // 100km for demo
        }
      }
    });

    // Fallback 1: Any available driver anywhere
    if (nearbyDrivers.length === 0) {
      console.log('[SOS] No drivers within 100km. Searching all available drivers...');
      nearbyDrivers = await Driver.find({ status: 'available' });
    }

    // Targeted Room Broadcast (Industry Standard: Secure Mission Dispatch)
    console.log(`[SOS] Broadcaster emitting to 'drivers' room for guaranteed delivery.`);
    io.to('drivers').emit('emergency_alert', {
      emergencyId: id,
      type: data.type,
      lat: data.lat,
      lng: data.lng,
      description: data.description,
      alertedCount: Math.max(nearbyDrivers.length, totalFleet.length)
    });

    console.log(`[SOS] Final Result: Alerting targeting ${nearbyDrivers.length} drivers for SOS ${id}`);

    nearbyDrivers.forEach(drv => {
      if (drv.socketId) {
        // Individual fallback for legacy handling
        io.to(drv.socketId).emit('emergency_alert', {
          emergencyId: id,
          type: data.type,
          lat: data.lat,
          lng: data.lng,
          description: data.description,
          alertedCount: nearbyDrivers.length
        });
      }
    });

    const flattened = { ...emergency._doc, lat: data.lat, lng: data.lng };
    io.emit('new_emergency', flattened);
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
  });

  // 🚑 DRIVER ACCEPT (Lock Logic)
  socket.on('driver_accept', async ({ driverId, emergencyId }) => {
    const em = await Emergency.findOne({ id: emergencyId });
    if (!em || em.assignedDriverId) {
      socket.emit('case_already_taken');
      return;
    }

    const drv = await Driver.findOne({ driverId });
    em.status = 'en_route';
    em.assignedDriverId = driverId;
    em.assignedAmbulanceId = drv.ambulanceId;
    em.driverName = drv.name;
    em.statusTimeline.push({ label: 'Ambulance Assigned', time: new Date() });

    const route = await getRealRoute(drv.location.coordinates[1], drv.location.coordinates[0], em.location.coordinates[1], em.location.coordinates[0]);
    em.routeCoords = route.coords;
    em.routeIndex = 0;
    await em.save();

    await Driver.updateOne({ driverId }, { status: 'on_mission' });

    // Notify ALL nearby drivers who were alerted that the case is gone
    io.emit('case_assigned_broadcast', { emergencyId, driverName: drv.name });
    
    socket.emit('case_assigned', { emergencyId, emergency: em, routeToVictim: route.coords, etaSeconds: route.durationSeconds });
  });

  // 🚑 VICTIM PICKUP
  socket.on('victim_picked_up', async ({ emergencyId, driverId, victimReport }) => {
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

    socket.emit('hospital_route_assigned', {
      hospital: { name: hospital.name, lat: hospital.location.coordinates[1], lng: hospital.location.coordinates[0] },
      routeCoords: route.coords,
      etaSeconds: route.durationSeconds,
      aiResult: result,
      signalCount: Math.floor(route.coords.length / 10)
    });
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
    httpServer.listen(process.env.PORT || 3001, () => console.log('🚀 Server running on port 3001'));
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err.message);
  }
}

setInterval(tick, 2000);
start();
