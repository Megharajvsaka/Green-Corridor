const mongoose = require('mongoose');

// 🚑 Driver Schema
const driverSchema = new mongoose.Schema({
  driverId: { type: String, required: true, unique: true },
  name: String,
  ambulanceId: String,
  status: { type: String, enum: ['available', 'on_mission', 'alerted', 'offline'], default: 'offline' },
  location: {
    type: { type: String, default: 'Point' },
    coordinates: [Number], // [lng, lat]
  },
  socketId: String,
  lastUpdate: { type: Date, default: Date.now }
});

driverSchema.index({ location: '2dsphere' });

// 🏥 Hospital Schema
const hospitalSchema = new mongoose.Schema({
  hospitalId: { type: String, required: true, unique: true },
  name: String,
  totalBeds: Number,
  availableBeds: Number,
  location: {
    type: { type: String, default: 'Point' },
    coordinates: [Number],
  },
  departments: {
    cardiology: String,
    trauma: String,
    neurology: String,
    pediatrics: String,
    burns: String,
  },
  incomingQueue: [String] // Array of Emergency IDs
});

hospitalSchema.index({ location: '2dsphere' });

// 🆘 Emergency / SOS Schema
const emergencySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  type: String,
  description: String,
  reporterName: String,
  reporterPhone: String,
  status: { type: String, enum: ['pending', 'en_route', 'at_scene', 'hospital_bound', 'completed'], default: 'pending' },
  location: {
    type: { type: String, default: 'Point' },
    coordinates: [Number],
  },
  assignedDriverId: String,
  assignedAmbulanceId: String,
  selectedHospitalId: String,
  victimReport: {
    conditions: [String],
    notes: String,
    pickedUpAt: Date
  },
  statusTimeline: [{
    label: String,
    time: { type: Date, default: Date.now }
  }],
  routeCoords: Array,
  createdAt: { type: Date, default: Date.now }
});

emergencySchema.index({ location: '2dsphere' });

// 🚥 Signal Schema
const signalSchema = new mongoose.Schema({
  signalId: { type: String, required: true, unique: true },
  location: {
    type: { type: String, default: 'Point' },
    coordinates: [Number],
  },
  ambulanceRoadName: String,
  crossRoadName: String,
  status: { type: String, enum: ['normal', 'caution', 'held', 'flushing', 'cleared'], default: 'normal' },
  ambulanceId: String,
  heldSince: Date
});

signalSchema.index({ location: '2dsphere' });

module.exports = {
  Driver: mongoose.model('Driver', driverSchema),
  Hospital: mongoose.model('Hospital', hospitalSchema),
  Emergency: mongoose.model('Emergency', emergencySchema),
  Signal: mongoose.model('Signal', signalSchema)
};
