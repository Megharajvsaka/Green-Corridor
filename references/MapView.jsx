import React, { useEffect, useRef } from 'react';

/* global L */

// ── Icon factories ───────────────────────────────────────────
function createAmbulanceIcon(color) {
  return L.divIcon({
    html: `<div style="background:${color};border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:18px;border:3px solid white;box-shadow:0 0 10px ${color};" class="ambulance-icon">🚑</div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function createHospitalIcon() {
  return L.divIcon({
    html: `<div style="background:#1d4ed8;border-radius:6px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid white;box-shadow:0 0 6px rgba(29,78,216,0.8);" class="hospital-icon">🏥</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function createSignalIcon(signal) {
  return L.divIcon({
    html: `
      <div style="
        background:#111827;
        border:2px solid #374151;
        border-radius:8px;
        padding:5px 7px;
        font-size:10px;
        color:white;
        white-space:nowrap;
        box-shadow:0 2px 12px rgba(0,0,0,0.6);
        min-width:130px;
      ">
        <div style="
          font-size:9px;
          color:#9ca3af;
          margin-bottom:3px;
          font-weight:600;
          letter-spacing:0.05em;
        ">🚦 SIGNAL HELD</div>
        <div style="display:flex;align-items:center;gap:5px;margin-bottom:2px">
          <div style="
            width:10px;height:10px;border-radius:50%;flex-shrink:0;
            background:${signal.ambulanceRoadSignal === 'green' ? '#22c55e' : '#ef4444'};
            box-shadow:0 0 6px ${signal.ambulanceRoadSignal === 'green' ? '#22c55e' : '#ef4444'};
          "></div>
          <span style="color:#e5e7eb;font-size:10px">
            ${signal.ambulanceRoadName}
          </span>
          <span style="
            color:${signal.ambulanceRoadSignal === 'green' ? '#22c55e' : '#ef4444'};
            font-weight:700;font-size:9px;margin-left:auto;
          ">
            ${signal.ambulanceRoadSignal === 'green' ? 'GO' : 'STOP'}
          </span>
        </div>
        <div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">
          <div style="
            width:10px;height:10px;border-radius:50%;flex-shrink:0;
            background:${signal.crossRoadSignal === 'green' ? '#22c55e' : '#ef4444'};
            box-shadow:0 0 6px ${signal.crossRoadSignal === 'green' ? '#22c55e' : '#ef4444'};
          "></div>
          <span style="color:#e5e7eb;font-size:10px">
            ${signal.crossRoadName}
          </span>
          <span style="
            color:${signal.crossRoadSignal === 'green' ? '#22c55e' : '#ef4444'};
            font-weight:700;font-size:9px;margin-left:auto;
          ">
            ${signal.crossRoadSignal === 'green' ? 'GO' : 'STOP'}
          </span>
        </div>
        <div style="
          color:#6b7280;font-size:9px;
          border-top:1px solid #374151;
          padding-top:3px;
        ">
          ✋ ${signal.vehiclesStopped} stopped · ${signal.heldFor}s held
        </div>
      </div>
    `,
    className: '',
    iconAnchor: [0, 0],
  });
}

export default function MapView({ ambulances, signals, hospitals, availableRoutes }) {
  const mapRef              = useRef(null);
  const initializedRef      = useRef(false);
  const ambulanceMarkersRef = useRef(new Map());
  const corridorLinesRef    = useRef(new Map());
  const ghostLinesRef       = useRef(new Map());
  const signalMarkersRef    = useRef(new Map());
  const hospitalMarkersRef  = useRef(new Map());
  const previewLinesRef     = useRef(new Map());
  const vehicleMarkersRef   = useRef(new Map());

  // ── Initialize Leaflet map once ──────────────────────────
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const map = L.map('map-container', {
      center: [12.97, 77.59],
      zoom: 13,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        initializedRef.current = false;
      }
    };
  }, []);

  // ── Render Available Routes ───────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    
    previewLinesRef.current.forEach(line => line.remove());
    previewLinesRef.current.clear();
    
    if (!availableRoutes) return;
    
    const colors = { A: '#22c55e', B: '#3b82f6', C: '#eab308' };
    
    availableRoutes.routes.forEach(route => {
      const latLngs = route.coords.map(c => [c.lat, c.lng]);
      const line = L.polyline(latLngs, {
        color: colors[route.id],
        weight: 4,
        opacity: 0.7,
        dashArray: '8 6',
      }).addTo(mapRef.current);
      
      line.bindTooltip(`Route ${route.id} — ${route.label} (${route.distanceKm}km)`, { sticky: true });
      previewLinesRef.current.set(route.id, line);
    });
    
    if (availableRoutes.routes[0]?.coords.length > 0) {
      const allCoords = availableRoutes.routes
        .flatMap(r => r.coords)
        .map(c => [c.lat, c.lng]);
      mapRef.current.fitBounds(L.latLngBounds(allCoords).pad(0.1));
    }
  }, [availableRoutes]);

  // ── Update hospital markers ───────────────────────────────
  useEffect(() => {
    if (!mapRef.current || hospitals.length === 0) return;
    const map = mapRef.current;
    const existing = hospitalMarkersRef.current;

    const newIds = new Set(hospitals.map((h) => h.id));

    for (const h of hospitals) {
      if (!existing.has(h.id)) {
        const marker = L.marker([h.lat, h.lng], { icon: createHospitalIcon() })
          .addTo(map)
          .bindPopup(`<b style="color:#4ade80">🏥 ${h.name}</b><br/><span style="color:#9ca3af;font-size:12px">${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}</span>`);
        existing.set(h.id, marker);
      }
    }

    for (const [id, marker] of existing) {
      if (!newIds.has(id)) {
        marker.remove();
        existing.delete(id);
      }
    }
  }, [hospitals]);

  // ── Update ambulance markers + corridor polylines ─────────
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const markers  = ambulanceMarkersRef.current;
    const corridors = corridorLinesRef.current;
    const ghosts    = ghostLinesRef.current;

    const currentIds = new Set(ambulances.map((a) => a.id));

    for (const [id, marker] of markers) {
      if (!currentIds.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    }

    for (const [id, lines] of corridors) {
      if (!currentIds.has(id)) {
        lines.forEach((l) => l.remove());
        corridors.delete(id);
      }
    }

    for (const [id, line] of ghosts) {
      if (!currentIds.has(id)) {
        line.remove();
        ghosts.delete(id);
      }
    }

    for (const amb of ambulances) {
      if (!amb.routeCoords || amb.routeCoords.length === 0) continue;

      const currentCoord = amb.routeCoords[Math.min(amb.routeIndex, amb.routeCoords.length - 1)];
      if (!currentCoord) continue;

      if (amb.status === 'arrived') {
        if (markers.has(amb.id)) {
          const m = markers.get(amb.id);
          setTimeout(() => { m.remove(); markers.delete(amb.id); }, 2000);
        }
        if (corridors.has(amb.id)) {
          corridors.get(amb.id).forEach((l) => l.remove());
          corridors.delete(amb.id);
        }
        if (ghosts.has(amb.id)) {
          ghosts.get(amb.id).remove();
          ghosts.delete(amb.id);
        }
        continue;
      }

      if (markers.has(amb.id)) {
        markers.get(amb.id).setLatLng([currentCoord.lat, currentCoord.lng]);
      } else {
        const marker = L.marker([currentCoord.lat, currentCoord.lng], {
          icon: createAmbulanceIcon(amb.color),
          zIndexOffset: 1000,
        })
          .addTo(map)
          .bindTooltip(amb.id, { permanent: false, direction: 'top' });
        markers.set(amb.id, marker);
      }

      const sliceEnd = Math.min(amb.routeIndex + amb.stepSize + 1, amb.routeCoords.length);
      const traversedCoords = amb.routeCoords.slice(0, sliceEnd).map((c) => [c.lat, c.lng]);
      const fullCoords      = amb.routeCoords.map((c) => [c.lat, c.lng]);

      if (corridors.has(amb.id)) {
        corridors.get(amb.id).forEach((l) => l.remove());
      }

      const lines = [];
      if (traversedCoords.length >= 2) {
        const activeLine = L.polyline(traversedCoords, {
          color: amb.color,
          weight: 6,
          opacity: 0.85,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(map);
        lines.push(activeLine);

        const remainCoords = amb.routeCoords.slice(sliceEnd - 1).map((c) => [c.lat, c.lng]);
        if (remainCoords.length >= 2) {
          const dimLine = L.polyline(remainCoords, {
            color: amb.color,
            weight: 4,
            opacity: 0.3,
            dashArray: '6 6',
          }).addTo(map);
          lines.push(dimLine);
        }
      }
      corridors.set(amb.id, lines);

      if (!ghosts.has(amb.id) && fullCoords.length >= 2) {
        const ghostLine = L.polyline(fullCoords, {
          color: '#ef4444',
          weight: 2,
          opacity: 0.25,
          dashArray: '8 12',
        }).addTo(map);
        ghosts.set(amb.id, ghostLine);
      }
    }
  }, [ambulances]);

  // ── Update signal markers & vehicles ───────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    const map     = mapRef.current;
    const sigMap  = signalMarkersRef.current;
    
    signals.forEach(signal => {
      if (sigMap.has(signal.id)) {
        const marker = sigMap.get(signal.id);
        if (signal.status === 'held') {
          marker.setIcon(createSignalIcon(signal));
        }
        return;
      }
      if (signal.status !== 'held') return;
      
      const marker = L.marker([signal.lat, signal.lng], {
        icon: createSignalIcon(signal),
        zIndexOffset: 500,
      }).addTo(map);
      sigMap.set(signal.id, marker);
    });

    sigMap.forEach((marker, id) => {
      const signal = signals.find(s => s.id === id);
      if (!signal || signal.status === 'cleared') {
        marker.remove();
        sigMap.delete(id);
      }
    });

    signals.forEach(signal => {
      if (signal.status !== 'held' || !signal.stoppedVehicles) return;
      signal.stoppedVehicles.forEach(vehicle => {
        if (vehicleMarkersRef.current.has(vehicle.id)) return;
        const marker = L.marker([vehicle.lat, vehicle.lng], {
          icon: L.divIcon({
            html: `<div style="font-size:14px;filter:drop-shadow(0 0 4px rgba(239,68,68,0.8));cursor:default;">${vehicle.type}</div>`,
            className: '',
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          }),
          zIndexOffset: 400,
        }).addTo(map);
        vehicleMarkersRef.current.set(vehicle.id, marker);
      });
    });

    vehicleMarkersRef.current.forEach((marker, id) => {
      const signalId = id.replace(/^veh_/, '').replace(/_\d+$/, '');
      const signal = signals.find(s => s.id === signalId);
      if (!signal || signal.status === 'cleared') {
        marker.remove();
        vehicleMarkersRef.current.delete(id);
      }
    });
    
  }, [signals]);

  // ── Clean up unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      vehicleMarkersRef.current.forEach(m => m.remove());
      vehicleMarkersRef.current.clear();
      signalMarkersRef.current.forEach(m => m.remove());
      signalMarkersRef.current.clear();
      previewLinesRef.current.forEach(m => m.remove());
      previewLinesRef.current.clear();
      ambulanceMarkersRef.current.forEach(m => m.remove());
      ambulanceMarkersRef.current.clear();
      corridorLinesRef.current.forEach(arr => arr.forEach(l => l.remove()));
      corridorLinesRef.current.clear();
      ghostLinesRef.current.forEach(l => l.remove());
      ghostLinesRef.current.clear();
    };
  }, []);

  return (
    <div id="map-container" style={{ width: '100%', height: '100%' }} />
  );
}
