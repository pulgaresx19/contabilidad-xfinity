import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { 
  Navigation, MapPin, Compass, Sparkles, CheckCircle2, 
  Clock, AlertTriangle, ChevronUp, ChevronDown, Phone, 
  Camera, Share2, DollarSign, Layers, List, Pencil, 
  SlidersHorizontal, Car, Calendar, ArrowRight, ShieldCheck, 
  X, Plus, Play, Pause, RotateCcw, Home, Star, MoreHorizontal,
  Cloud, MessageCircle, ExternalLink, Check, Eye
} from 'lucide-react';
import { formatDateFriendly } from '../utils/dateUtils';

// Javier's Mapbox Public Token (Free Tier: 50,000 map loads + 100,000 routes/month)
const getFallbackToken = () => {
  try {
    return atob('cGsuZXlKMUlqb2lhbUYyYVdWeU1Ua2lMQ0poSWpvaVkyMTJlR0o1YW04eU1UQm9hVEo2Y0hwMU5taDFNbUppT0NKOS42dENmLUNIRDhQemhwTGU5S19HNm9B');
  } catch (e) {
    return '';
  }
};

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || getFallbackToken();
mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

// Haversine formula for fast fallback distance calculation
function getEstimatedDrivingMiles(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1.25;
}

export default function UberDriverView({
  orders = [],
  activeDate,
  isViewingToday,
  targetFocusOrderId,
  onClearTargetFocus,
  onShiftDay,
  onGoToToday,
  onOpenScan,
  onOpenAddJob,
  onOpenPhotos,
  onMarkCompleted,
  onOpenCancelModal,
  onOpenEditModal,
  onOpenAdjustModal,
  onOpenShareModal,
  onOrderUpdated,
  onSwitchToClassic
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const routeBadgeMarkerRef = useRef(null);
  const userMarkerRef = useRef(null);

  const [userLocation, setUserLocation] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [drawerState, setDrawerState] = useState('peek'); // 'peek' | 'expanded'
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [optimizing, setOptimizing] = useState(false);
  const [geocodingMissing, setGeocodingMissing] = useState(false);
  const [is3DMode, setIs3DMode] = useState(true);

  // Turn-by-Turn Route Metrics from Mapbox Directions API
  const [routeMetrics, setRouteMetrics] = useState({
    miles: null,
    minutes: null,
    loading: false
  });

  // Note inline editing
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [currentNoteText, setCurrentNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);

  // Job On-Site Timers
  const [jobTimers, setJobTimers] = useState(() => {
    try {
      const saved = localStorage.getItem('xfinity_job_timers');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  // Default coordinate center: Skokie / Elkhart
  const DEFAULT_LNG_LAT = [-87.734557, 42.033592]; // [lng, lat]

  // Daily statistics
  const dayPending = orders.filter(o => o.status === 'Pendiente');
  const dayCompleted = orders.filter(o => o.status === 'Completado');
  const dayCancelled = orders.filter(o => o.status === 'No Realizado');
  const dayEarnings = dayCompleted.reduce((sum, o) => sum + (o.rate_calculated || 0), 0);
  const validOrders = orders.filter(o => o.latitude && o.longitude);
  const missingCoordsCount = orders.length - validOrders.length;

  // Active Timer Tick interval
  useEffect(() => {
    const interval = setInterval(() => {
      setJobTimers(prev => {
        let changed = false;
        const next = { ...prev };
        for (const [id, t] of Object.entries(next)) {
          if (t && t.isRunning) {
            next[id] = { ...t, elapsed: Math.floor((Date.now() - t.startTime) / 1000) };
            changed = true;
          }
        }
        if (changed) {
          try {
            localStorage.setItem('xfinity_job_timers', JSON.stringify(next));
          } catch (e) {}
          return next;
        }
        return prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const toggleJobTimer = (orderId) => {
    setJobTimers(prev => {
      const current = prev[orderId];
      let updated;
      if (current && current.isRunning) {
        updated = { ...current, isRunning: false };
      } else if (current && !current.isRunning) {
        const newStart = Date.now() - (current.elapsed * 1000);
        updated = { ...current, startTime: newStart, isRunning: true };
      } else {
        updated = { startTime: Date.now(), elapsed: 0, isRunning: true };
      }
      const next = { ...prev, [orderId]: updated };
      try {
        localStorage.setItem('xfinity_job_timers', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const formatTimerDisplay = (seconds = 0) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Immediate selection of target order
  useEffect(() => {
    if (targetFocusOrderId) {
      const target = orders.find(o => o.id === targetFocusOrderId);
      if (target) {
        setSelectedOrder(target);
        setCurrentNoteText(target.raw_notes || '');
        if (mapInstanceRef.current && target.latitude && target.longitude) {
          mapInstanceRef.current.flyTo({
            center: [target.longitude, target.latitude],
            zoom: 15,
            pitch: is3DMode ? 50 : 0,
            essential: true
          });
        }
        if (onClearTargetFocus) onClearTargetFocus();
        return;
      }
    }

    if (!selectedOrder && orders.length > 0) {
      const firstPending = orders.find(o => o.status === 'Pendiente');
      const chosen = firstPending || orders[0];
      setSelectedOrder(chosen);
      setCurrentNoteText(chosen?.raw_notes || '');
    } else if (selectedOrder) {
      const current = orders.find(o => o.id === selectedOrder.id);
      if (current) {
        setSelectedOrder(current);
        setCurrentNoteText(current.raw_notes || '');
      }
    }
  }, [orders, targetFocusOrderId]);

  // Track live GPS position
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading || 0,
          speed: pos.coords.speed || 0
        });
      },
      (err) => console.warn('GPS Watch error:', err.message),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Auto-geocode missing coordinates in background
  useEffect(() => {
    if (missingCoordsCount > 0 && !geocodingMissing) {
      handleGeocodeMissing();
    }
  }, [missingCoordsCount]);

  // 1. INITIALIZE MAPBOX GL 3D VECTOR MAP
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const targetOrder = validOrders[0];
    const initialCenter = targetOrder 
      ? [targetOrder.longitude, targetOrder.latitude] 
      : DEFAULT_LNG_LAT;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/navigation-night-v1', // Official Uber Navigation Night 3D style
      center: initialCenter,
      zoom: 14.5,
      pitch: 45, // 3D Perspective angle like Uber
      bearing: 0,
      attributionControl: false
    });

    map.on('load', () => {
      // Route line source
      map.addSource('route-nav', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: [] }
        }
      });

      // 1. Glowing ribbon underlayer
      map.addLayer({
        id: 'route-glow-layer',
        type: 'line',
        source: 'route-nav',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#007AFF',
          'line-width': 12,
          'line-opacity': 0.38,
          'line-blur': 2
        }
      });

      // 2. Solid Apple/Uber electric blue ribbon
      map.addLayer({
        id: 'route-core-layer',
        type: 'line',
        source: 'route-nav',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#007AFF',
          'line-width': 6,
          'line-opacity': 0.98
        }
      });

      // Connecting sequence between all daily stops
      map.addSource('stops-sequence', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: [] }
        }
      });

      map.addLayer({
        id: 'stops-sequence-layer',
        type: 'line',
        source: 'stops-sequence',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#29b6f6',
          'line-width': 2.5,
          'line-dasharray': [2, 2],
          'line-opacity': 0.45
        }
      });
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 2. UPDATE MAPBOX MARKERS, VEHICLE PUCK & TURN-BY-TURN ROAD ROUTE
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Remove previous markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    if (routeBadgeMarkerRef.current) {
      routeBadgeMarkerRef.current.remove();
      routeBadgeMarkerRef.current = null;
    }
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    const activeTarget = selectedOrder || validOrders.find(o => o.status === 'Pendiente') || validOrders[0];

    // Determine start point: GPS vehicle or initial road offset
    let startCoords = null; // [lng, lat]
    if (userLocation) {
      startCoords = [userLocation.lng, userLocation.lat];
    } else if (activeTarget && activeTarget.latitude && activeTarget.longitude) {
      startCoords = [activeTarget.longitude - 0.009, activeTarget.latitude + 0.008];
    } else {
      startCoords = DEFAULT_LNG_LAT;
    }

    // Render technician vehicle puck (pulsing neon ring)
    const userPuckEl = document.createElement('div');
    userPuckEl.className = 'apple-user-puck-mapbox';
    userPuckEl.innerHTML = `
      <div class="apple-user-pulse"></div>
      <div class="apple-user-dot"></div>
    `;

    userMarkerRef.current = new mapboxgl.Marker({ element: userPuckEl, anchor: 'center' })
      .setLngLat(startCoords)
      .addTo(map);

    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend(startCoords);

    // Render Stop Markers
    orders.forEach((order, index) => {
      if (!order.latitude || !order.longitude) return;

      const orderLngLat = [order.longitude, order.latitude];
      bounds.extend(orderLngLat);

      const isCompleted = order.status === 'Completado';
      const isCancelled = order.status === 'No Realizado';
      const isTarget = activeTarget?.id === order.id;

      const markerEl = document.createElement('div');

      if (isTarget) {
        // Destination Marker: House Badge + Street Name Pill
        markerEl.className = 'apple-dest-badge-mapbox cursor-pointer';
        markerEl.innerHTML = `
          <div class="apple-dest-badge">
            <div class="apple-dest-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
              </svg>
            </div>
            <div class="apple-dest-label">
              ${order.address || 'Destino'}
            </div>
          </div>
        `;
        markerEl.onclick = () => {
          setSelectedOrder(order);
          map.flyTo({ center: orderLngLat, zoom: 15.5, pitch: is3DMode ? 50 : 0 });
        };

        const targetMarker = new mapboxgl.Marker({ element: markerEl, anchor: 'bottom' })
          .setLngLat(orderLngLat)
          .addTo(map);

        markersRef.current.push(targetMarker);
      } else {
        // Numbered Stop Marker (Orange/Green/Gray)
        let bg = 'bg-[#FF9500]';
        if (isCompleted) bg = 'bg-[#34C759]';
        else if (isCancelled) bg = 'bg-[#8E8E93]';

        markerEl.className = 'cursor-pointer group flex flex-col items-center';
        markerEl.innerHTML = `
          <div class="w-7 h-7 rounded-full ${bg} border-2 border-white/90 text-white font-black text-xs flex items-center justify-center shadow-lg transition-transform group-hover:scale-110">
            ${isCompleted ? '✓' : index + 1}
          </div>
        `;
        markerEl.onclick = () => {
          setSelectedOrder(order);
          map.flyTo({ center: orderLngLat, zoom: 15.5, pitch: is3DMode ? 50 : 0 });
        };

        const stopMarker = new mapboxgl.Marker({ element: markerEl, anchor: 'center' })
          .setLngLat(orderLngLat)
          .addTo(map);

        markersRef.current.push(stopMarker);
      }
    });

    // Connect sequence of daily stops
    if (validOrders.length > 1 && map.getSource('stops-sequence')) {
      const stopsCoordinates = validOrders.map(o => [o.longitude, o.latitude]);
      map.getSource('stops-sequence').setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: stopsCoordinates
        }
      });
    }

    // 3. FETCH REAL TURN-BY-TURN ROAD ROUTE FROM MAPBOX DIRECTIONS API
    if (activeTarget && activeTarget.latitude && activeTarget.longitude && startCoords) {
      const destCoords = [activeTarget.longitude, activeTarget.latitude];

      const fetchDirections = async () => {
        try {
          setRouteMetrics(prev => ({ ...prev, loading: true }));
          const dirUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${startCoords[0]},${startCoords[1]};${destCoords[0]},${destCoords[1]}?geometries=geojson&overview=full&access_token=${MAPBOX_ACCESS_TOKEN}`;
          
          const res = await fetch(dirUrl);
          if (res.ok) {
            const data = await res.json();
            if (data.routes && data.routes.length > 0) {
              const route = data.routes[0];
              const roadCoordinates = route.geometry.coordinates;
              const distMiles = route.distance / 1609.34;
              const durMins = Math.max(1, Math.round(route.duration / 60));

              setRouteMetrics({
                miles: distMiles,
                minutes: durMins,
                loading: false
              });

              // Draw road-following vector line
              if (map.getSource('route-nav')) {
                map.getSource('route-nav').setData({
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'LineString',
                    coordinates: roadCoordinates
                  }
                });
              }

              // Place route badge ("X min • Más rápida") at road midpoint
              if (roadCoordinates.length > 2) {
                const midIdx = Math.floor(roadCoordinates.length / 2);
                const midPoint = roadCoordinates[midIdx];

                const badgeEl = document.createElement('div');
                badgeEl.className = 'apple-route-badge-container';
                badgeEl.innerHTML = `
                  <div class="apple-route-badge">
                    <div class="eta-main">${durMins} min</div>
                    <div class="eta-sub">Más rápida</div>
                  </div>
                `;

                if (routeBadgeMarkerRef.current) routeBadgeMarkerRef.current.remove();
                routeBadgeMarkerRef.current = new mapboxgl.Marker({ element: badgeEl, anchor: 'center' })
                  .setLngLat(midPoint)
                  .addTo(map);
              }
              return;
            }
          }
        } catch (e) {
          console.warn('Mapbox directions error:', e);
        }

        // Fallback straight-line if offline
        if (map.getSource('route-nav')) {
          map.getSource('route-nav').setData({
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [startCoords, destCoords]
            }
          });
        }
        setRouteMetrics({
          miles: getEstimatedDrivingMiles(startCoords[1], startCoords[0], destCoords[1], destCoords[0]) || 0.8,
          minutes: 4,
          loading: false
        });
      };

      if (map.isStyleLoaded()) {
        fetchDirections();
      } else {
        map.once('styledata', fetchDirections);
      }
    }

    // Camera Framing with 3D perspective
    if (activeTarget && activeTarget.latitude && activeTarget.longitude) {
      const activeBounds = new mapboxgl.LngLatBounds();
      activeBounds.extend(startCoords);
      activeBounds.extend([activeTarget.longitude, activeTarget.latitude]);

      map.fitBounds(activeBounds, {
        padding: { top: 90, bottom: 260, left: 50, right: 50 },
        pitch: is3DMode ? 48 : 0,
        maxZoom: 15.5,
        duration: 1200
      });
    }
  }, [orders, selectedOrder?.id, userLocation, is3DMode]);

  // Center on current technician location
  const handleCenterOnMe = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const target = userLocation ? [userLocation.lng, userLocation.lat] : DEFAULT_LNG_LAT;
    map.flyTo({
      center: target,
      zoom: 16,
      pitch: is3DMode ? 55 : 0,
      bearing: userLocation?.heading || 0,
      essential: true
    });
  };

  // Center on active route overview
  const handleCenterOnRoute = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const bounds = new mapboxgl.LngLatBounds();
    if (userLocation) bounds.extend([userLocation.lng, userLocation.lat]);
    if (selectedOrder?.latitude && selectedOrder?.longitude) {
      bounds.extend([selectedOrder.longitude, selectedOrder.latitude]);
    } else {
      validOrders.forEach(o => bounds.extend([o.longitude, o.latitude]));
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, {
        padding: { top: 90, bottom: 260, left: 50, right: 50 },
        pitch: is3DMode ? 45 : 0,
        duration: 1200
      });
    }
  };

  // Toggle 3D / 2D perspective
  const toggle3DView = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const nextMode = !is3DMode;
    setIs3DMode(nextMode);
    map.easeTo({
      pitch: nextMode ? 50 : 0,
      duration: 800
    });
  };

  // Auto-geocode missing coordinates
  const handleGeocodeMissing = async () => {
    try {
      setGeocodingMissing(true);
      const res = await fetch('/api/orders/geocode-all', { method: 'POST' });
      if (res.ok && onOrderUpdated) {
        await onOrderUpdated();
      }
    } catch (e) {
      console.warn('Geocoding error:', e);
    } finally {
      setGeocodingMissing(false);
    }
  };

  // Save inline note
  const handleSaveNote = async () => {
    if (!selectedOrder) return;
    try {
      setSavingNote(true);
      const res = await fetch(`/api/orders/${selectedOrder.id}/note`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: currentNoteText })
      });
      if (res.ok) {
        setIsEditingNote(false);
        if (onOrderUpdated) await onOrderUpdated();
      }
    } catch (e) {
      console.warn('Error saving note:', e);
    } finally {
      setSavingNote(false);
    }
  };

  // Optimize route sequence by proximity
  const handleOptimizeRoute = async () => {
    if (validOrders.length <= 1) return;
    setOptimizing(true);

    try {
      const startLat = userLocation?.lat || validOrders[0].latitude;
      const startLng = userLocation?.lng || validOrders[0].longitude;

      const unvisited = [...validOrders];
      const ordered = [];
      let currentPos = { lat: startLat, lng: startLng };

      while (unvisited.length > 0) {
        let bestIdx = 0;
        let minDistance = Infinity;

        for (let i = 0; i < unvisited.length; i++) {
          const ord = unvisited[i];
          const dist = getEstimatedDrivingMiles(currentPos.lat, currentPos.lng, ord.latitude, ord.longitude) || 0;
          if (dist < minDistance) {
            minDistance = dist;
            bestIdx = i;
          }
        }

        const nextStop = unvisited.splice(bestIdx, 1)[0];
        ordered.push(nextStop);
        currentPos = { lat: nextStop.latitude, lng: nextStop.longitude };
      }

      const res = await fetch('/api/orders/reorder-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: ordered.map(o => o.id) })
      });

      if (res.ok && onOrderUpdated) {
        await onOrderUpdated();
      }
    } catch (err) {
      alert('Error optimizando ruta: ' + err.message);
    } finally {
      setOptimizing(false);
    }
  };

  // Formatted GPS display (Apple style: 42.0298° N, 87.73507° O)
  const formatCoordinates = (lat, lng) => {
    if (!lat || !lng) return 'Coordenadas no disponibles';
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'O';
    return `${Math.abs(lat).toFixed(5)}° ${latDir}, ${Math.abs(lng).toFixed(5)}° ${lngDir}`;
  };

  // Open native Apple Maps on iPhone
  const handleOpenAppleMapsApp = () => {
    if (!selectedOrder) return;
    const dest = selectedOrder.latitude && selectedOrder.longitude 
      ? `${selectedOrder.latitude},${selectedOrder.longitude}`
      : encodeURIComponent(`${selectedOrder.address}, ${selectedOrder.city}`);
    window.open(`https://maps.apple.com/?daddr=${dest}&dirflg=d`, '_blank');
  };

  const filteredOrders = orders.filter(o => {
    if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
    return true;
  });

  const selectedIndex = selectedOrder ? orders.findIndex(o => o.id === selectedOrder.id) : 0;
  const currentTimer = selectedOrder ? jobTimers[selectedOrder.id] : null;

  return (
    <div className="relative w-full max-w-md mx-auto h-[calc(100vh-8.5rem)] rounded-3xl overflow-hidden border border-[#2b3543] bg-[#0b1017] shadow-2xl flex flex-col select-none">
      
      {/* 1. MAPBOX GL 3D VECTOR CANVAS */}
      <div 
        ref={mapContainerRef} 
        className="absolute inset-0 w-full h-full z-0 mapbox-3d-canvas" 
      />

      {/* 2. TOP HUD: WEATHER / ICA BADGE + DAY EARNINGS + QUICK ADD */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none gap-2">
        {/* Weather / Status Badge */}
        <div className="pointer-events-auto bg-[#16202c]/90 backdrop-blur-xl border border-white/10 rounded-2xl px-3 py-1.5 shadow-lg flex items-center gap-2">
          <Cloud className="h-4 w-4 text-slate-300" />
          <div className="text-[11px] font-bold text-white leading-tight">
            <span>53°</span>
            <span className="text-[9px] text-slate-400 ml-1 font-mono">ICA 53 🟡</span>
          </div>
        </div>

        {/* Date & Day Earnings Pill */}
        <div className="pointer-events-auto bg-[#16202c]/90 backdrop-blur-xl border border-white/10 rounded-2xl px-2.5 py-1.5 shadow-lg flex items-center gap-1.5">
          <button
            onClick={() => onShiftDay(-1)}
            className="p-1 hover:bg-white/10 text-slate-300 rounded-lg transition"
            title="Día anterior"
          >
            ‹
          </button>
          
          <div className="text-center cursor-pointer px-1" onClick={onGoToToday}>
            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-200">
              <Calendar className="h-3 w-3 text-[#007AFF]" />
              <span>{isViewingToday ? 'Hoy' : formatDateFriendly(activeDate)}</span>
            </div>
            <div className="text-xs font-black font-mono text-[#34C759] leading-tight">
              ${dayEarnings.toFixed(2)}
            </div>
          </div>

          <button
            onClick={() => onShiftDay(1)}
            className="p-1 hover:bg-white/10 text-slate-300 rounded-lg transition"
            title="Día siguiente"
          >
            ›
          </button>
        </div>

        {/* Actions: + Trabajo & Classic List */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            onClick={onOpenAddJob}
            className="px-2.5 py-2 rounded-2xl bg-[#007AFF] hover:bg-[#0062D2] text-white font-bold text-xs shadow-md shadow-blue-500/30 active:scale-95 transition flex items-center gap-1"
            title="Añadir nuevo trabajo"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            <span className="text-[11px] font-black">+ Trabajo</span>
          </button>

          <button
            onClick={onSwitchToClassic}
            className="p-2 rounded-2xl bg-[#16202c]/90 backdrop-blur-xl hover:bg-[#253242] text-slate-300 border border-white/10 shadow-md active:scale-95 transition"
            title="Cambiar a Vista Lista"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 3. RIGHT FLOATING CONTROLS: 3D/2D PERSPECTIVE + RECENTER + OPTIMIZE */}
      <div className="absolute right-3 top-20 z-20 flex flex-col gap-2 pointer-events-auto">
        {/* Toggle 3D Perspective (Uber Mode) */}
        <button
          onClick={toggle3DView}
          className={`w-10 h-10 rounded-full backdrop-blur-xl border border-white/15 flex items-center justify-center shadow-lg active:scale-95 transition ${
            is3DMode ? 'bg-[#007AFF] text-white' : 'bg-[#16202c]/90 text-slate-300'
          }`}
          title={is3DMode ? 'Modo 3D Activo (Toca para vista plana)' : 'Activar perspectiva 3D'}
        >
          <span className="text-[11px] font-black">{is3DMode ? '3D' : '2D'}</span>
        </button>

        {/* Recenter on Route Overview (Apple Car Icon) */}
        <button
          onClick={handleCenterOnRoute}
          className="w-10 h-10 rounded-full bg-[#16202c]/90 backdrop-blur-xl border border-white/15 text-slate-200 hover:text-white flex items-center justify-center shadow-lg active:scale-95 transition"
          title="Ver ruta completa de la jornada"
        >
          <Car className="h-4 w-4" />
        </button>

        {/* Recenter on Live Tech GPS (Compass Arrow) */}
        <button
          onClick={handleCenterOnMe}
          className="w-10 h-10 rounded-full bg-[#16202c]/90 backdrop-blur-xl border border-white/15 text-[#007AFF] hover:text-blue-400 flex items-center justify-center shadow-lg active:scale-95 transition"
          title="Centrar en mi ubicación GPS"
        >
          <Navigation className="h-4 w-4 fill-[#007AFF]/25" />
        </button>

        {/* Optimize Route by Proximity */}
        <button
          onClick={handleOptimizeRoute}
          disabled={optimizing || validOrders.length < 2}
          className="w-10 h-10 rounded-full bg-[#16202c]/90 backdrop-blur-xl border border-white/15 text-[#FF9500] hover:text-orange-400 flex items-center justify-center shadow-lg active:scale-95 transition disabled:opacity-40"
          title="Optimizar ruta por cercanía"
        >
          <Sparkles className={`h-4 w-4 ${optimizing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Warning Pill if orders missing coordinates */}
      {missingCoordsCount > 0 && (
        <div className="absolute top-16 left-3 right-16 z-20 pointer-events-auto">
          <div className="flex items-center justify-between p-2 rounded-2xl bg-amber-500/95 backdrop-blur-md text-white text-[11px] font-medium shadow-lg">
            <span>{missingCoordsCount} orden{missingCoordsCount > 1 ? 'es' : ''} sin coordenadas GPS</span>
            <button
              onClick={handleGeocodeMissing}
              disabled={geocodingMissing}
              className="text-[10px] font-bold underline hover:text-amber-100"
            >
              {geocodingMissing ? 'Localizando...' : 'Localizar'}
            </button>
          </div>
        </div>
      )}

      {/* 4. FLOATING BOTTOM SHEET (EXACT APPLE MAPS IPHONE NAVIGATION CARD) */}
      <div 
        className={`absolute left-0 right-0 bottom-0 z-30 bg-[#16202c]/98 backdrop-blur-2xl border-t border-white/10 rounded-t-[32px] shadow-[0_-12px_40px_rgba(0,0,0,0.65)] transition-all duration-300 ease-in-out flex flex-col ${
          drawerState === 'expanded' ? 'h-[84%]' : 'h-[258px]'
        }`}
      >
        {/* iOS Drag Handle */}
        <div 
          onClick={() => setDrawerState(prev => prev === 'peek' ? 'expanded' : 'peek')}
          className="w-full pt-2.5 pb-1 flex flex-col items-center justify-center cursor-pointer select-none"
        >
          <div className="w-10 h-1 rounded-full bg-white/20 hover:bg-white/30 transition mb-1" />
        </div>

        {selectedOrder ? (
          <div className="flex-1 flex flex-col justify-between overflow-hidden px-4 pb-3">
            
            {/* Top Bar: Share (Left) | Title + Subtitle (Center) | Close X (Right) */}
            <div className="flex items-center justify-between gap-2 pt-0.5 pb-1.5">
              {/* Share Button (iOS Style Circle) */}
              <button
                type="button"
                onClick={() => onOpenShareModal(selectedOrder)}
                className="w-10 h-10 rounded-full bg-[#243140] hover:bg-[#324052] text-white flex items-center justify-center shadow-md active:scale-95 transition shrink-0"
                title="Compartir reporte"
              >
                <Share2 className="h-4 w-4" />
              </button>

              {/* Title & Real Driving Time (Matches Apple Maps 4260 Main St header) */}
              <div 
                className="text-center min-w-0 flex-1 cursor-pointer"
                onClick={() => setDrawerState(prev => prev === 'peek' ? 'expanded' : 'peek')}
              >
                <h2 className="text-base sm:text-lg font-black text-white truncate tracking-tight">
                  {selectedOrder.address || 'Dirección no asignada'}
                </h2>
                <p className="text-[11px] text-slate-400 font-medium truncate">
                  {routeMetrics.miles !== null 
                    ? `A ${routeMetrics.miles.toFixed(1)} mi por carretera • ~${routeMetrics.minutes} min de manejo`
                    : `${selectedOrder.city || 'Skokie'} • Job #${selectedOrder.job_id}`}
                </p>
              </div>

              {/* Close Button (X in Circle) */}
              <button
                type="button"
                onClick={() => setDrawerState(prev => prev === 'peek' ? 'expanded' : 'peek')}
                className="w-10 h-10 rounded-full bg-[#243140] hover:bg-[#324052] text-white flex items-center justify-center shadow-md active:scale-95 transition shrink-0"
                title={drawerState === 'peek' ? 'Ver detalles y paradas' : 'Contraer'}
              >
                {drawerState === 'peek' ? <ChevronUp className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </button>
            </div>

            {/* 3 Horizontal Pill Action Buttons (Matches Apple Maps UI) */}
            <div className="grid grid-cols-3 gap-2 py-1">
              {/* Pill 1: Primary (iOS Blue) -> Photos with Watermark */}
              <button
                type="button"
                onClick={() => onOpenPhotos(selectedOrder)}
                className="h-11 rounded-2xl bg-[#007AFF] hover:bg-[#006bd9] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/25 active:scale-95 transition"
              >
                <Camera className="h-4 w-4 stroke-[2.5]" />
                <span className="truncate">Fotos ({selectedOrder.photos_count || 0})</span>
              </button>

              {/* Pill 2: Dark Slate -> Completar / Cerrar */}
              {selectedOrder.status !== 'Completado' ? (
                <button
                  type="button"
                  onClick={() => onMarkCompleted(selectedOrder)}
                  className="h-11 rounded-2xl bg-[#243140] hover:bg-[#324052] text-[#29b6f6] font-bold text-xs flex items-center justify-center gap-1.5 border border-white/5 shadow-md active:scale-95 transition"
                >
                  <CheckCircle2 className="h-4 w-4 stroke-[2.5]" />
                  <span>Completar</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenShareModal(selectedOrder)}
                  className="h-11 rounded-2xl bg-[#243140] hover:bg-[#324052] text-[#34C759] font-bold text-xs flex items-center justify-center gap-1.5 border border-white/5 shadow-md active:scale-95 transition"
                >
                  <MessageCircle className="h-4 w-4 stroke-[2.5]" />
                  <span>WhatsApp</span>
                </button>
              )}

              {/* Pill 3: Dark Slate -> Siguiente Parada */}
              <button
                type="button"
                onClick={() => {
                  const pendingOrders = orders.filter(o => o.status === 'Pendiente');
                  const currentIndex = pendingOrders.findIndex(o => o.id === selectedOrder.id);
                  const next = pendingOrders[(currentIndex + 1) % pendingOrders.length];
                  if (next) {
                    setSelectedOrder(next);
                    if (next.latitude && next.longitude && mapInstanceRef.current) {
                      mapInstanceRef.current.flyTo({
                        center: [next.longitude, next.latitude],
                        zoom: 15.5,
                        pitch: is3DMode ? 50 : 0
                      });
                    }
                  }
                }}
                className="h-11 rounded-2xl bg-[#243140] hover:bg-[#324052] text-[#29b6f6] font-bold text-xs flex items-center justify-center gap-1.5 border border-white/5 shadow-md active:scale-95 transition"
              >
                <Navigation className="h-4 w-4" />
                <span>Siguiente</span>
              </button>
            </div>

            {/* Note Card: "Agregar una nota" (Apple Maps Card Design) */}
            <div className="bg-[#1f2937] border border-white/5 rounded-2xl p-2.5 my-1">
              {!isEditingNote ? (
                <div 
                  onClick={() => setIsEditingNote(true)}
                  className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 transition"
                >
                  <div className="w-8 h-8 rounded-full bg-[#007AFF]/20 border border-[#007AFF]/40 flex items-center justify-center text-[#007AFF] shrink-0 font-bold text-xs">
                    J
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate">
                      {currentNoteText ? currentNoteText : 'Agregar una nota'}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {currentNoteText ? 'Toca para editar tu nota interna' : 'Sólo tú verás lo que aquí se escriba.'}
                    </p>
                  </div>
                  <Pencil className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <textarea
                    autoFocus
                    value={currentNoteText}
                    onChange={(e) => setCurrentNoteText(e.target.value)}
                    placeholder="Escribe detalles del acceso, perro, caída de cable, etc..."
                    className="w-full bg-[#121922] text-white border border-[#007AFF]/50 rounded-xl p-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#007AFF] resize-none"
                    rows={2}
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentNoteText(selectedOrder.raw_notes || '');
                        setIsEditingNote(false);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-700 text-slate-200 text-[10px] font-bold"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveNote}
                      disabled={savingNote}
                      className="px-3 py-1 rounded-lg bg-[#007AFF] text-white text-[10px] font-bold"
                    >
                      {savingNote ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Floating Pill Bar: Timer, Open in Apple Maps, More */}
            <div className="flex items-center justify-between pt-1">
              {/* On-Site Timer Pill */}
              <button
                type="button"
                onClick={() => toggleJobTimer(selectedOrder.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-[11px] font-mono font-bold transition active:scale-95 ${
                  currentTimer?.isRunning
                    ? 'bg-[#34C759]/20 text-[#34C759] border border-[#34C759]/40 animate-pulse'
                    : currentTimer?.elapsed > 0
                    ? 'bg-[#FF9500]/20 text-[#FF9500] border border-[#FF9500]/40'
                    : 'bg-[#243140] text-slate-300 border border-white/5'
                }`}
                title="Temporizador de trabajo en sitio"
              >
                <Clock className="h-3.5 w-3.5" />
                <span>{currentTimer?.elapsed ? formatTimerDisplay(currentTimer.elapsed) : 'En sitio'}</span>
              </button>

              {/* Rate medallion */}
              <div className="flex items-center gap-1 text-[#34C759] font-mono font-black text-sm">
                <span>${selectedOrder.rate_calculated || 100}</span>
              </div>

              {/* Action Pill: Check, Apple Maps App, More */}
              <div className="flex items-center gap-1 bg-[#243140] rounded-xl p-1 border border-white/5">
                <button
                  type="button"
                  onClick={() => onMarkCompleted(selectedOrder)}
                  className="p-1 hover:text-[#34C759] text-slate-300 rounded-lg transition"
                  title="Marcar completado"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleOpenAppleMapsApp}
                  className="p-1 hover:text-[#007AFF] text-slate-300 rounded-lg transition"
                  title="Abrir en la app Mapas de Apple (GPS hablado)"
                >
                  <ExternalLink className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowMoreActions(prev => !prev)}
                  className="p-1 hover:text-white text-slate-300 rounded-lg transition"
                  title="Más opciones"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* EXPANDED SECTION: "Detalles" (Dirección, Coordenadas, etc.) + Cola de Trabajos */}
            {drawerState === 'expanded' && (
              <div className="flex-1 overflow-y-auto mt-2 pt-2 border-t border-white/10 space-y-3 apple-drawer-scroll pr-1">
                
                {/* More Actions Popover if opened */}
                {showMoreActions && (
                  <div className="bg-[#121922] border border-white/10 rounded-2xl p-2 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreActions(false);
                        onOpenEditModal(selectedOrder);
                      }}
                      className="p-2 bg-[#243140] rounded-xl text-slate-200 text-[10px] font-bold text-center hover:bg-[#344558]"
                    >
                      Editar Orden
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreActions(false);
                        onOpenAdjustModal(selectedOrder);
                      }}
                      className="p-2 bg-[#243140] rounded-xl text-slate-200 text-[10px] font-bold text-center hover:bg-[#344558]"
                    >
                      Ajustar Precio
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreActions(false);
                        onOpenCancelModal(selectedOrder);
                      }}
                      className="p-2 bg-rose-500/20 text-rose-300 rounded-xl text-[10px] font-bold text-center hover:bg-rose-500/30"
                    >
                      Cancelar Orden
                    </button>
                  </div>
                )}

                {/* Apple Maps "Detalles" Section */}
                <div className="bg-[#1f2937] border border-white/5 rounded-2xl p-3 space-y-2.5">
                  <h3 className="text-xs font-black text-white uppercase tracking-wider">
                    Detalles
                  </h3>
                  
                  {/* Dirección */}
                  <div className="flex justify-between items-start text-xs border-b border-white/5 pb-2">
                    <span className="text-[#8e9aa8] font-medium">Dirección</span>
                    <div className="text-right text-slate-100 font-semibold leading-tight">
                      <div>{selectedOrder.address}</div>
                      <div className="text-[11px] text-slate-400">
                        {selectedOrder.city || 'Skokie'}, IN {selectedOrder.zip_code || ''}
                      </div>
                      <div className="text-[10px] text-slate-500">Estados Unidos</div>
                    </div>
                  </div>

                  {/* Coordenadas */}
                  <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                    <span className="text-[#8e9aa8] font-medium">Coordenadas</span>
                    <span className="text-slate-200 font-mono text-[11px]">
                      {formatCoordinates(selectedOrder.latitude, selectedOrder.longitude)}
                    </span>
                  </div>

                  {/* Tarifa y Metraje */}
                  <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                    <span className="text-[#8e9aa8] font-medium">Metraje & Cable</span>
                    <span className="text-slate-200 font-bold text-[11px]">
                      {selectedOrder.drop_footage || 0} ft ({selectedOrder.cable_type || 'RG-6'})
                      {selectedOrder.bore_type && selectedOrder.bore_type.includes('DW') ? ' • Bore DW' : ''}
                    </span>
                  </div>

                  {/* Teléfono */}
                  {selectedOrder.phone && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#8e9aa8] font-medium">Teléfono Cliente</span>
                      <a 
                        href={`tel:${selectedOrder.phone}`}
                        className="text-[#007AFF] font-mono font-bold text-[11px] flex items-center gap-1 hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        <span>{selectedOrder.phone}</span>
                      </a>
                    </div>
                  )}
                </div>

                {/* Day Job Queue Header & Segmented Filter */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-white uppercase tracking-wider">
                      Cola del Día ({orders.length} trabajos)
                    </h3>
                  </div>

                  <div className="grid grid-cols-4 gap-1 bg-[#121922] p-1 rounded-2xl border border-white/5 text-[10px] font-bold text-center">
                    <button
                      onClick={() => setStatusFilter('ALL')}
                      className={`py-1.5 rounded-xl transition ${statusFilter === 'ALL' ? 'bg-[#007AFF] text-white shadow-sm font-black' : 'text-slate-400'}`}
                    >
                      Todos ({orders.length})
                    </button>
                    <button
                      onClick={() => setStatusFilter('Pendiente')}
                      className={`py-1.5 rounded-xl transition ${statusFilter === 'Pendiente' ? 'bg-[#FF9500] text-white shadow-sm font-black' : 'text-slate-400'}`}
                    >
                      Pend. ({dayPending.length})
                    </button>
                    <button
                      onClick={() => setStatusFilter('Completado')}
                      className={`py-1.5 rounded-xl transition ${statusFilter === 'Completado' ? 'bg-[#34C759] text-white shadow-sm font-black' : 'text-slate-400'}`}
                    >
                      Hechos ({dayCompleted.length})
                    </button>
                    <button
                      onClick={() => setStatusFilter('No Realizado')}
                      className={`py-1.5 rounded-xl transition ${statusFilter === 'No Realizado' ? 'bg-[#FF3B30] text-white shadow-sm font-black' : 'text-slate-400'}`}
                    >
                      Canc. ({dayCancelled.length})
                    </button>
                  </div>

                  {/* List of orders */}
                  <div className="space-y-2">
                    {filteredOrders.map((ord, idx) => {
                      const isTarget = selectedOrder?.id === ord.id;
                      const isCompleted = ord.status === 'Completado';
                      const isCancelled = ord.status === 'No Realizado';
                      const ordTimer = jobTimers[ord.id];

                      return (
                        <div
                          key={ord.id}
                          onClick={() => {
                            setSelectedOrder(ord);
                            if (ord.latitude && ord.longitude && mapInstanceRef.current) {
                              mapInstanceRef.current.flyTo({
                                center: [ord.longitude, ord.latitude],
                                zoom: 15.5,
                                pitch: is3DMode ? 50 : 0
                              });
                            }
                          }}
                          className={`p-3 rounded-2xl border cursor-pointer transition select-none flex items-center justify-between gap-2 ${
                            isTarget 
                              ? 'bg-[#007AFF]/20 border-[#007AFF]/80 shadow-md ring-1 ring-[#007AFF]/50'
                              : 'bg-[#1f2937] border-white/5 hover:border-white/15'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`w-6 h-6 rounded-full text-white font-black text-xs flex items-center justify-center font-sans shrink-0 ${
                              isCompleted ? 'bg-[#34C759]' : isCancelled ? 'bg-[#FF3B30]' : 'bg-[#FF9500]'
                            }`}>
                              {isCompleted ? '✓' : idx + 1}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-mono font-bold text-white">#{ord.job_id}</span>
                                <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                  isCompleted ? 'bg-[#34C759]/20 text-[#34C759]' : isCancelled ? 'bg-[#FF3B30]/20 text-[#FF3B30]' : 'bg-[#FF9500]/20 text-[#FF9500]'
                                }`}>
                                  {ord.status}
                                </span>
                                {ordTimer?.elapsed > 0 && (
                                  <span className="text-[9px] font-mono text-[#007AFF] bg-blue-950/80 px-1 py-0.2 rounded border border-blue-800">
                                    ⏱️ {formatTimerDisplay(ordTimer.elapsed)}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] font-bold truncate text-slate-200">{ord.address}</p>
                              <p className="text-[10px] text-slate-400 truncate">{ord.city} • {ord.drop_footage || 0} ft</p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-sm font-black font-mono text-[#34C759] block">
                              ${ord.rate_calculated || 100}
                            </span>
                            <span className="text-[10px] text-[#007AFF] font-bold">
                              {isTarget ? 'Activo' : 'Ver'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            )}

          </div>
        ) : (
          <div className="p-6 text-center text-xs text-slate-400">
            No hay trabajos asignados para esta fecha.
          </div>
        )}
      </div>

    </div>
  );
}