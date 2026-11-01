import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { 
  Navigation, MapPin, Compass, Sparkles, CheckCircle2, 
  Clock, AlertTriangle, ChevronUp, ChevronDown, Phone, 
  Camera, Share2, DollarSign, Layers, List, Pencil, 
  SlidersHorizontal, Car, Calendar, ArrowRight, ArrowLeft, ShieldCheck, 
  X, Plus, Play, Pause, RotateCcw, Home, Star, MoreHorizontal,
  Cloud, MessageCircle, ExternalLink, Check, Eye, Sun, Moon, Globe,
  Route
} from 'lucide-react';
import { formatDateFriendly } from '../utils/dateUtils';
import { geocodeAddressWithMapbox, MAPBOX_TOKEN } from '../utils/mapboxGeocode';

const MAPBOX_ACCESS_TOKEN = MAPBOX_TOKEN;
mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

// Map Theme Definitions (Default is 'apple_dark' matching user's iPhone screenshot)
const MAP_THEMES = {
  apple_dark: {
    name: 'Apple Maps Oscuro',
    style: 'mapbox://styles/mapbox/dark-v11',
    icon: Moon,
    description: 'Calles en gris claro y parques verdes (Foto iPhone)'
  },
  streets: {
    name: 'Apple Maps Día',
    style: 'mapbox://styles/mapbox/streets-v12',
    icon: Sun,
    description: 'Mapa claro tradicional'
  },
  satellite: {
    name: 'Satélite Real',
    style: 'mapbox://styles/mapbox/satellite-streets-v12',
    icon: Globe,
    description: 'Fotos aéreas para ver tejados y postes'
  }
};

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
  const routeBadgeMarkersRef = useRef([]);
  const userMarkerRef = useRef(null);

  const [userLocation, setUserLocation] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [drawerState, setDrawerState] = useState('peek');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [optimizing, setOptimizing] = useState(false);
  const [is3DMode, setIs3DMode] = useState(true);

  // Map Theme state: Default is 'apple_dark' (Matches user's iPhone screenshot exactly)
  const [mapTheme, setMapTheme] = useState(() => {
    return localStorage.getItem('xfinity_map_theme') || 'apple_dark';
  });
  const [showThemePicker, setShowThemePicker] = useState(false);

  // Multi-route state: supports alternative routes just like Apple Maps
  const [availableRoutes, setAvailableRoutes] = useState([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);

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
  const DEFAULT_LNG_LAT = [-87.734557, 42.033592];

  // Daily statistics
  const dayPending = orders.filter(o => o.status === 'Pendiente');
  const dayCompleted = orders.filter(o => o.status === 'Completado');
  const dayCancelled = orders.filter(o => o.status === 'No Realizado');
  const dayEarnings = dayCompleted.reduce((sum, o) => sum + (o.rate_calculated || 0), 0);
  const validOrders = orders.filter(o => o.latitude && o.longitude);

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

  // 1. FAST LIVE GPS GEOLOCATION
  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading || 0,
          speed: pos.coords.speed || 0
        });
      },
      (err) => console.warn('Fast GPS fix notice:', err.message),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 }
    );

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading || 0,
          speed: pos.coords.speed || 0
        });
      },
      (err) => console.warn('GPS Watch notice:', err.message),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // 2. AUTOMATIC MAPBOX GEOCODING OF MISSING ORDERS
  useEffect(() => {
    const missing = orders.filter(o => !o.latitude || !o.longitude);
    if (missing.length === 0) return;

    let isCancelled = false;

    const runAutoGeocode = async () => {
      for (const ord of missing) {
        if (isCancelled) break;
        try {
          const geo = await geocodeAddressWithMapbox(ord.address, ord.city, ord.zip_code);
          if (geo && geo.latitude && geo.longitude) {
            ord.latitude = geo.latitude;
            ord.longitude = geo.longitude;

            fetch(`/api/orders/${ord.id}/coords`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ latitude: geo.latitude, longitude: geo.longitude })
            }).catch(() => {});

            try {
              const cached = JSON.parse(localStorage.getItem('xfinity_cached_orders') || '[]');
              const idx = cached.findIndex(c => c.id === ord.id);
              if (idx >= 0) {
                cached[idx].latitude = geo.latitude;
                cached[idx].longitude = geo.longitude;
                localStorage.setItem('xfinity_cached_orders', JSON.stringify(cached));
              }
            } catch (e) {}

            setSelectedOrder(prev => {
              if (prev && prev.id === ord.id) {
                return { ...prev, latitude: geo.latitude, longitude: geo.longitude };
              }
              return prev;
            });
          }
        } catch (e) {
          console.warn('Auto-geocoding error for order:', ord.id, e.message);
        }
      }
    };

    runAutoGeocode();

    return () => { isCancelled = true; };
  }, [orders]);

  // 3. SELECT A JOB: Locates on map, flies camera in 3D, and computes route
  const handleSelectJob = async (order) => {
    if (!order) return;
    let target = order;
    setSelectedRouteIndex(0); // Reset to primary route on stop switch

    if (!target.latitude || !target.longitude) {
      const geo = await geocodeAddressWithMapbox(target.address, target.city, target.zip_code);
      if (geo && geo.latitude && geo.longitude) {
        target = { ...target, latitude: geo.latitude, longitude: geo.longitude };
        target.latitude = geo.latitude;
        target.longitude = geo.longitude;

        fetch(`/api/orders/${target.id}/coords`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude: geo.latitude, longitude: geo.longitude })
        }).catch(() => {});

        try {
          const cached = JSON.parse(localStorage.getItem('xfinity_cached_orders') || '[]');
          const idx = cached.findIndex(c => c.id === target.id);
          if (idx >= 0) {
            cached[idx].latitude = geo.latitude;
            cached[idx].longitude = geo.longitude;
            localStorage.setItem('xfinity_cached_orders', JSON.stringify(cached));
          }
        } catch (e) {}
      }
    }

    setSelectedOrder(target);
    setCurrentNoteText(target.raw_notes || '');

    const map = mapInstanceRef.current;
    if (map && target.latitude && target.longitude) {
      map.flyTo({
        center: [target.longitude, target.latitude],
        zoom: 15.5,
        pitch: is3DMode ? 50 : 0,
        essential: true
      });
    }
  };

  // NEXT / PREVIOUS STOP NAVIGATION
  const handleNextJob = () => {
    if (!orders || orders.length === 0) return;
    const currentIdx = selectedOrder ? orders.findIndex(o => o.id === selectedOrder.id) : -1;
    const nextIdx = (currentIdx + 1) % orders.length;
    handleSelectJob(orders[nextIdx]);
  };

  const handlePrevJob = () => {
    if (!orders || orders.length === 0) return;
    const currentIdx = selectedOrder ? orders.findIndex(o => o.id === selectedOrder.id) : 0;
    const prevIdx = (currentIdx - 1 + orders.length) % orders.length;
    handleSelectJob(orders[prevIdx]);
  };

  // INITIALIZE / UPDATE SELECTION ON DAY OR TARGET CHANGE
  useEffect(() => {
    if (orders.length === 0) {
      setSelectedOrder(null);
      return;
    }

    if (targetFocusOrderId) {
      const match = orders.find(o => o.id === targetFocusOrderId);
      if (match) {
        handleSelectJob(match);
        if (onClearTargetFocus) onClearTargetFocus();
        return;
      }
    }

    if (!selectedOrder || !orders.some(o => o.id === selectedOrder.id)) {
      const firstPending = orders.find(o => o.status === 'Pendiente');
      const initial = firstPending || orders[0];
      handleSelectJob(initial);
    } else {
      const current = orders.find(o => o.id === selectedOrder.id);
      if (current) {
        setSelectedOrder(current);
        setCurrentNoteText(current.raw_notes || '');
      }
    }
  }, [orders, targetFocusOrderId]);

  // Apply Apple Maps Dark Styling (matches iPhone screenshot with light gray streets & dark green golf courses)
  const applyCustomMapStyling = (map) => {
    if (!map) return;
    if (mapTheme !== 'apple_dark') return;

    try {
      if (map.getLayer('land')) {
        map.setPaintProperty('land', 'background-color', '#1b242f');
      }
      if (map.getLayer('road-simple')) {
        map.setPaintProperty('road-simple', 'line-color', '#52667a');
      }
      if (map.getLayer('bridge-simple')) {
        map.setPaintProperty('bridge-simple', 'line-color', '#5e758c');
      }
      if (map.getLayer('landuse')) {
        map.setPaintProperty('landuse', 'fill-color', [
          'match',
          ['get', 'class'],
          ['park', 'pitch', 'cemetery', 'national_park', 'grass'],
          '#184533',
          '#202c38'
        ]);
        map.setPaintProperty('landuse', 'fill-opacity', 0.92);
      }
      if (map.getLayer('national-park')) {
        map.setPaintProperty('national-park', 'fill-color', '#184533');
      }
      if (map.getLayer('water')) {
        map.setPaintProperty('water', 'fill-color', '#142a3e');
      }
      if (map.getLayer('road-label-simple')) {
        map.setPaintProperty('road-label-simple', 'text-color', '#ffffff');
        map.setPaintProperty('road-label-simple', 'text-halo-color', '#141d27');
        map.setPaintProperty('road-label-simple', 'text-halo-width', 2);
      }
    } catch (err) {
      // Style layers may vary slightly
    }
  };

  // Helper to attach route layers cleanly whenever a style is loaded
  const setupRouteLayers = (map) => {
    if (!map) return;

    // 1. Alternative Route Source & Layer (Rendered below the active route)
    if (!map.getSource('route-alt-nav')) {
      map.addSource('route-alt-nav', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
    }

    if (!map.getLayer('route-alt-core-layer')) {
      map.addLayer({
        id: 'route-alt-core-layer',
        type: 'line',
        source: 'route-alt-nav',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#5a6e84',
          'line-width': 5.5,
          'line-opacity': 0.8
        }
      });
    }

    // 2. Active Primary Route Source & Layers (Apple Electric Blue)
    if (!map.getSource('route-nav')) {
      map.addSource('route-nav', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: [] }
        }
      });
    }

    if (!map.getLayer('route-glow-layer')) {
      map.addLayer({
        id: 'route-glow-layer',
        type: 'line',
        source: 'route-nav',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#007AFF',
          'line-width': 13,
          'line-opacity': 0.35,
          'line-blur': 2
        }
      });
    }

    if (!map.getLayer('route-core-layer')) {
      map.addLayer({
        id: 'route-core-layer',
        type: 'line',
        source: 'route-nav',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#007AFF',
          'line-width': 6.5,
          'line-opacity': 0.98
        }
      });
    }

    // Sequence connecting daily stops
    if (!map.getSource('stops-sequence')) {
      map.addSource('stops-sequence', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: [] }
        }
      });
    }

    if (!map.getLayer('stops-sequence-layer')) {
      map.addLayer({
        id: 'stops-sequence-layer',
        type: 'line',
        source: 'stops-sequence',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#007AFF',
          'line-width': 2.5,
          'line-dasharray': [2, 2],
          'line-opacity': 0.45
        }
      });
    }

    applyCustomMapStyling(map);
  };

  // 4. INITIALIZE MAPBOX GL 3D VECTOR MAP
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const targetOrder = validOrders[0];
    const initialCenter = targetOrder 
      ? [targetOrder.longitude, targetOrder.latitude] 
      : DEFAULT_LNG_LAT;

    const initialStyleUrl = MAP_THEMES[mapTheme]?.style || MAP_THEMES.apple_dark.style;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: initialStyleUrl,
      center: initialCenter,
      zoom: 14.5,
      pitch: 45,
      bearing: 0,
      attributionControl: false
    });

    map.on('load', () => {
      setupRouteLayers(map);
    });

    map.on('style.load', () => {
      setupRouteLayers(map);
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle Changing Map Theme / Estética
  const handleChangeTheme = (themeKey) => {
    setMapTheme(themeKey);
    try {
      localStorage.setItem('xfinity_map_theme', themeKey);
    } catch (e) {}
    setShowThemePicker(false);

    const map = mapInstanceRef.current;
    if (map && MAP_THEMES[themeKey]) {
      map.setStyle(MAP_THEMES[themeKey].style);
    }
  };

  // 5. UPDATE MAPBOX MARKERS, VEHICLE PUCK & ALTERNATIVE ROAD ROUTES
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear previous stop markers & route badges
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    routeBadgeMarkersRef.current.forEach(m => m.remove());
    routeBadgeMarkersRef.current = [];

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    const activeTarget = selectedOrder || validOrders[0];

    // Determine start point (real GPS location or nearby grid offset)
    let startCoords = null;
    if (userLocation && userLocation.lng && userLocation.lat) {
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

    // Render All Daily Stop Markers
    orders.forEach((order, index) => {
      if (!order.latitude || !order.longitude) return;

      const orderLngLat = [order.longitude, order.latitude];
      bounds.extend(orderLngLat);

      const isCompleted = order.status === 'Completado';
      const isCancelled = order.status === 'No Realizado';
      const isTarget = activeTarget?.id === order.id;

      const markerEl = document.createElement('div');

      if (isTarget) {
        // Destination Marker: House Icon + Curbside Needle Tip + Clean Address Label
        // Fixed: No duplicate transform - the needle tip lands with rooftop accuracy directly on the street address
        markerEl.className = 'apple-dest-badge cursor-pointer';
        markerEl.innerHTML = `
          <div class="apple-dest-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
            </svg>
          </div>
          <div class="apple-dest-pointer"></div>
          <div class="apple-dest-label">
            ${order.address || 'Destino'}
          </div>
        `;
        markerEl.onclick = () => handleSelectJob(order);

        const targetMarker = new mapboxgl.Marker({ element: markerEl, anchor: 'bottom' })
          .setLngLat(orderLngLat)
          .addTo(map);

        markersRef.current.push(targetMarker);
      } else {
        // Numbered Stop Marker
        let bg = 'bg-[#FF9500]';
        if (isCompleted) bg = 'bg-[#34C759]';
        else if (isCancelled) bg = 'bg-[#8E8E93]';

        markerEl.className = 'cursor-pointer group flex flex-col items-center';
        markerEl.innerHTML = `
          <div class="w-7 h-7 rounded-full ${bg} border-2 border-white/90 text-white font-black text-xs flex items-center justify-center shadow-lg transition-transform group-hover:scale-110">
            ${isCompleted ? '✓' : index + 1}
          </div>
        `;
        markerEl.onclick = () => handleSelectJob(order);

        const stopMarker = new mapboxgl.Marker({ element: markerEl, anchor: 'center' })
          .setLngLat(orderLngLat)
          .addTo(map);

        markersRef.current.push(stopMarker);
      }
    });

    // Connect sequence between daily stops
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

    // 6. FETCH MULTIPLE ALTERNATIVE ROAD ROUTES FROM MAPBOX DIRECTIONS API
    if (activeTarget && activeTarget.latitude && activeTarget.longitude && startCoords) {
      const destCoords = [activeTarget.longitude, activeTarget.latitude];

      const fetchDirections = async () => {
        try {
          // Request alternatives=true to get multiple route paths just like Apple Maps
          const dirUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${startCoords[0]},${startCoords[1]};${destCoords[0]},${destCoords[1]}?alternatives=true&geometries=geojson&overview=full&access_token=${MAPBOX_ACCESS_TOKEN}`;
          
          const res = await fetch(dirUrl);
          if (res.ok) {
            const data = await res.json();
            if (data.routes && data.routes.length > 0) {
              const parsedRoutes = data.routes.map((r, idx) => ({
                index: idx,
                coordinates: r.geometry.coordinates,
                miles: r.distance / 1609.34,
                minutes: Math.max(1, Math.round(r.duration / 60)),
                summary: r.legs?.[0]?.summary || `Vía opción ${idx + 1}`
              }));

              setAvailableRoutes(parsedRoutes);

              // Select active route (either user's chosen index or fastest route 0)
              const safeIndex = selectedRouteIndex < parsedRoutes.length ? selectedRouteIndex : 0;
              const activeRoute = parsedRoutes[safeIndex];
              const alternativeRoutes = parsedRoutes.filter((_, i) => i !== safeIndex);

              // Update active route line (Apple Electric Blue)
              if (map.getSource('route-nav')) {
                map.getSource('route-nav').setData({
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'LineString',
                    coordinates: activeRoute.coordinates
                  }
                });
              }

              // Update alternative route line(s) (Slate Gray)
              if (map.getSource('route-alt-nav')) {
                map.getSource('route-alt-nav').setData({
                  type: 'FeatureCollection',
                  features: alternativeRoutes.map(alt => ({
                    type: 'Feature',
                    properties: { index: alt.index },
                    geometry: {
                      type: 'LineString',
                      coordinates: alt.coordinates
                    }
                  }))
                });
              }

              // Place Interactive Floating Badge for Active Route
              if (activeRoute.coordinates.length > 2) {
                const midIdx = Math.floor(activeRoute.coordinates.length / 2);
                const midPoint = activeRoute.coordinates[midIdx];

                const activeBadgeEl = document.createElement('div');
                activeBadgeEl.className = 'apple-active-route-badge';
                activeBadgeEl.innerHTML = `
                  <div class="eta-main">${activeRoute.minutes} min</div>
                  <div class="eta-sub">${safeIndex === 0 ? 'Más rápida' : activeRoute.summary}</div>
                `;

                const activeMarker = new mapboxgl.Marker({ element: activeBadgeEl, anchor: 'center' })
                  .setLngLat(midPoint)
                  .addTo(map);

                routeBadgeMarkersRef.current.push(activeMarker);
              }

              // Place Interactive Floating Badges for Alternative Routes
              // Tapping the gray bubble immediately switches that route to active!
              alternativeRoutes.forEach(alt => {
                if (alt.coordinates.length > 2) {
                  const altMidIdx = Math.floor(alt.coordinates.length / 2);
                  const altMidPoint = alt.coordinates[altMidIdx];

                  const altBadgeEl = document.createElement('div');
                  altBadgeEl.className = 'apple-alt-route-badge';
                  altBadgeEl.innerHTML = `
                    <span>${alt.minutes} min</span>
                  `;
                  altBadgeEl.onclick = (e) => {
                    e.stopPropagation();
                    setSelectedRouteIndex(alt.index);
                  };

                  const altMarker = new mapboxgl.Marker({ element: altBadgeEl, anchor: 'center' })
                    .setLngLat(altMidPoint)
                    .addTo(map);

                  routeBadgeMarkersRef.current.push(altMarker);
                }
              });

              return;
            }
          }
        } catch (e) {
          console.warn('Mapbox directions error:', e);
        }

        // Fallback straight-line
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
        setAvailableRoutes([{
          index: 0,
          coordinates: [startCoords, destCoords],
          miles: getEstimatedDrivingMiles(startCoords[1], startCoords[0], destCoords[1], destCoords[0]) || 0.8,
          minutes: 4,
          summary: 'Ruta directa'
        }]);
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
        padding: { top: 120, bottom: 270, left: 50, right: 50 },
        pitch: is3DMode ? 48 : 0,
        maxZoom: 15.5,
        duration: 1000
      });
    }
  }, [orders, selectedOrder?.id, selectedOrder?.latitude, selectedOrder?.longitude, userLocation, is3DMode, mapTheme, selectedRouteIndex]);

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
        padding: { top: 120, bottom: 270, left: 50, right: 50 },
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

  // Formatted GPS display
  const formatCoordinates = (lat, lng) => {
    if (!lat || !lng) return 'Coordenadas en proceso de localización';
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

  const selectedIndex = selectedOrder ? orders.findIndex(o => o.id === selectedOrder.id) : 0;
  const currentTimer = selectedOrder ? jobTimers[selectedOrder.id] : null;
  const activeRoute = availableRoutes[selectedRouteIndex] || availableRoutes[0] || null;

  return (
    <div className="relative w-full max-w-md mx-auto h-[calc(100vh-8.5rem)] rounded-3xl overflow-hidden border border-[#2b3543] bg-[#1a242f] shadow-2xl flex flex-col select-none">
      
      {/* 1. MAPBOX GL 3D VECTOR CANVAS */}
      <div 
        ref={mapContainerRef} 
        className="absolute inset-0 w-full h-full z-0 mapbox-3d-canvas" 
      />

      {/* 2. TOP HUD: WEATHER / ICA BADGE + DATE PILL + QUICK ADD */}
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

      {/* 3. SELECTOR DE TRABAJOS HORIZONTAL (JOB SELECTOR RIBBON) */}
      {orders.length > 0 && (
        <div className="absolute top-16 left-3 right-16 z-20 pointer-events-auto">
          <div className="bg-[#121922]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5 shadow-xl flex items-center gap-1.5 overflow-x-auto apple-drawer-scroll">
            <span className="text-[9px] font-black uppercase text-slate-400 pl-1 shrink-0">
              Paradas ({orders.length}):
            </span>
            {orders.map((ord, idx) => {
              const isSelected = selectedOrder?.id === ord.id;
              const isDone = ord.status === 'Completado';
              const isCancel = ord.status === 'No Realizado';

              let badgeColor = 'bg-[#FF9500]';
              if (isDone) badgeColor = 'bg-[#34C759]';
              else if (isCancel) badgeColor = 'bg-[#8E8E93]';

              return (
                <button
                  key={ord.id || idx}
                  onClick={() => handleSelectJob(ord)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-[#007AFF] text-white shadow-md shadow-blue-500/40 ring-1 ring-white/60 font-black'
                      : 'bg-[#1f2937]/90 text-slate-300 hover:text-white hover:bg-[#2c3b4e] border border-white/5'
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full ${badgeColor} text-white text-[9px] flex items-center justify-center font-black`}>
                    {isDone ? '✓' : idx + 1}
                  </span>
                  <span className="truncate max-w-[110px]">
                    {ord.address ? ord.address.split(',')[0] : `Parada ${idx + 1}`}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400">
                    ${ord.rate_calculated || 100}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. RIGHT FLOATING CONTROLS: ESTILO DE MAPA + 3D/2D + CENTRAR + OPTIMIZAR */}
      <div className="absolute right-3 top-28 z-20 flex flex-col gap-2 pointer-events-auto">
        {/* Toggle Theme Popover */}
        <div className="relative">
          <button
            onClick={() => setShowThemePicker(prev => !prev)}
            className={`w-10 h-10 rounded-full backdrop-blur-xl border border-white/15 flex items-center justify-center shadow-lg active:scale-95 transition ${
              mapTheme === 'apple_dark' ? 'bg-[#007AFF] text-white' : 'bg-[#16202c]/90 text-slate-300'
            }`}
            title="Cambiar estilo de mapa"
          >
            <Layers className="h-4 w-4" />
          </button>

          {showThemePicker && (
            <div className="absolute right-12 top-0 bg-[#16202c]/98 backdrop-blur-2xl border border-white/15 rounded-2xl p-2 shadow-2xl flex flex-col gap-1 w-48 z-50 animate-fade-in">
              <span className="text-[10px] font-black uppercase text-slate-400 px-2 py-0.5">
                Estilo de Mapa
              </span>
              {Object.entries(MAP_THEMES).map(([key, t]) => {
                const IconComponent = t.icon;
                const active = mapTheme === key;
                return (
                  <button
                    key={key}
                    onClick={() => handleChangeTheme(key)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left transition ${
                      active ? 'bg-[#007AFF] text-white font-bold' : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <IconComponent className="h-3.5 w-3.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold leading-tight">{t.name}</div>
                      <div className={`text-[9px] truncate ${active ? 'text-blue-100' : 'text-slate-400'}`}>
                        {t.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Toggle 3D Perspective */}
        <button
          onClick={toggle3DView}
          className={`w-10 h-10 rounded-full backdrop-blur-xl border border-white/15 flex items-center justify-center shadow-lg active:scale-95 transition ${
            is3DMode ? 'bg-[#007AFF] text-white' : 'bg-[#16202c]/90 text-slate-300'
          }`}
          title={is3DMode ? 'Modo 3D Activo (Toca para vista 2D)' : 'Activar perspectiva 3D'}
        >
          <span className="text-[11px] font-black">{is3DMode ? '3D' : '2D'}</span>
        </button>

        {/* Recenter on Route Overview */}
        <button
          onClick={handleCenterOnRoute}
          className="w-10 h-10 rounded-full bg-[#16202c]/90 backdrop-blur-xl border border-white/15 text-slate-200 hover:text-white flex items-center justify-center shadow-lg active:scale-95 transition"
          title="Ver ruta completa de la jornada"
        >
          <Car className="h-4 w-4" />
        </button>

        {/* Recenter on Live Tech GPS */}
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

      {/* 5. BOTTOM SLIDING DRAWER: APPLE MAPS CARD (PEEK / EXPANDED) */}
      <div 
        className={`absolute bottom-0 left-0 right-0 z-30 bg-[#16202c]/96 backdrop-blur-2xl rounded-t-3xl border-t border-white/10 shadow-2xl transition-all duration-300 flex flex-col ${
          drawerState === 'expanded' ? 'h-[75%]' : 'h-64'
        }`}
      >
        {/* Grabber Handle */}
        <div 
          onClick={() => setDrawerState(prev => prev === 'peek' ? 'expanded' : 'peek')}
          className="w-full pt-2.5 pb-1 flex flex-col items-center justify-center cursor-pointer select-none"
        >
          <div className="w-10 h-1 rounded-full bg-white/20 hover:bg-white/30 transition mb-1" />
        </div>

        {selectedOrder ? (
          <div className="flex-1 flex flex-col justify-between overflow-hidden px-4 pb-3">
            
            {/* Top Bar: Share (Left) | Stepper & Address (Center) | Expand/Close (Right) */}
            <div className="flex items-center justify-between gap-2 pt-0.5 pb-1">
              <button
                type="button"
                onClick={() => onOpenShareModal(selectedOrder)}
                className="w-9 h-9 rounded-full bg-[#243140] hover:bg-[#324052] text-white flex items-center justify-center shadow-md active:scale-95 transition shrink-0"
                title="Compartir reporte"
              >
                <Share2 className="h-4 w-4" />
              </button>

              <div 
                className="text-center min-w-0 flex-1 cursor-pointer"
                onClick={() => setDrawerState(prev => prev === 'peek' ? 'expanded' : 'peek')}
              >
                <div className="flex items-center justify-center gap-2 mb-0.5">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handlePrevJob(); }}
                    className="p-0.5 text-slate-400 hover:text-white transition"
                    title="Parada anterior"
                  >
                    <ArrowLeft className="h-3 w-3" />
                  </button>
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#007AFF] bg-[#007AFF]/15 px-2 py-0.5 rounded-full">
                    Parada {selectedIndex + 1} de {orders.length}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleNextJob(); }}
                    className="p-0.5 text-slate-400 hover:text-white transition"
                    title="Siguiente parada"
                  >
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>

                <h2 className="text-base sm:text-lg font-black text-white truncate tracking-tight">
                  {selectedOrder.address || 'Dirección no asignada'}
                </h2>
                <p className="text-[11px] text-slate-400 font-medium truncate">
                  {activeRoute 
                    ? `A ${activeRoute.miles.toFixed(1)} mi • ~${activeRoute.minutes} min (${activeRoute.summary})`
                    : `${selectedOrder.city || 'Skokie'} • Job #${selectedOrder.job_id}`}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setDrawerState(prev => prev === 'peek' ? 'expanded' : 'peek')}
                className="w-9 h-9 rounded-full bg-[#243140] hover:bg-[#324052] text-white flex items-center justify-center shadow-md active:scale-95 transition shrink-0"
                title={drawerState === 'peek' ? 'Ver detalles y lista' : 'Contraer'}
              >
                {drawerState === 'peek' ? <ChevronUp className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </button>
            </div>

            {/* Alternative Route Selector (Interactive pills if more than 1 route found) */}
            {availableRoutes.length > 1 && (
              <div className="flex items-center gap-1.5 py-0.5 overflow-x-auto apple-drawer-scroll">
                <span className="text-[9px] font-black uppercase text-slate-400 shrink-0 flex items-center gap-0.5">
                  <Route className="h-3 w-3 text-[#007AFF]" />
                  Rutas:
                </span>
                {availableRoutes.map((rt, idx) => {
                  const isChosen = (selectedRouteIndex === idx);
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedRouteIndex(idx)}
                      className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition flex items-center gap-1 shrink-0 ${
                        isChosen
                          ? 'bg-[#007AFF] text-white shadow-md font-black ring-1 ring-white/50'
                          : 'bg-[#243140] text-slate-300 hover:bg-[#324052]'
                      }`}
                    >
                      <span>{rt.minutes} min</span>
                      <span className="text-[9px] opacity-75">({rt.miles.toFixed(1)} mi)</span>
                      {idx === 0 && <span className="text-[8px] bg-white/20 px-1 rounded">Rápida</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {/* 3 Horizontal Action Pills */}
            <div className="grid grid-cols-3 gap-2 py-1">
              <button
                type="button"
                onClick={() => onOpenPhotos(selectedOrder)}
                className="h-11 rounded-2xl bg-[#007AFF] hover:bg-[#006bd9] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/25 active:scale-95 transition"
              >
                <Camera className="h-4 w-4 stroke-[2.5]" />
                <span className="truncate">Fotos ({selectedOrder.photos_count || 0})</span>
              </button>

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

              <button
                type="button"
                onClick={handleNextJob}
                className="h-11 rounded-2xl bg-[#243140] hover:bg-[#324052] text-[#29b6f6] font-bold text-xs flex items-center justify-center gap-1.5 border border-white/5 shadow-md active:scale-95 transition"
                title="Ir a la siguiente parada de la jornada"
              >
                <Navigation className="h-4 w-4" />
                <span>Siguiente →</span>
              </button>
            </div>

            {/* Note Card */}
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
                    placeholder="Escribe una nota para este trabajo..."
                    className="w-full bg-[#121922] text-slate-100 text-xs rounded-xl p-2 border border-white/10 outline-none focus:border-[#007AFF] resize-none"
                    rows={2}
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsEditingNote(false)}
                      className="px-2.5 py-1 text-[11px] text-slate-400 hover:text-white"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveNote}
                      disabled={savingNote}
                      className="px-3 py-1 bg-[#007AFF] text-white text-[11px] font-bold rounded-lg shadow-sm"
                    >
                      {savingNote ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Bar: Timer + Rate + Apple Maps link */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => toggleJobTimer(selectedOrder.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition ${
                  currentTimer && currentTimer.isRunning
                    ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 animate-pulse'
                    : currentTimer && currentTimer.elapsed > 0
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-[#243140] border-white/5 text-slate-300 hover:text-white'
                }`}
                title="Temporizador de trabajo en sitio"
              >
                <Clock className="h-3.5 w-3.5" />
                <span>
                  {currentTimer && currentTimer.elapsed > 0 
                    ? formatTimerDisplay(currentTimer.elapsed) 
                    : 'En sitio'}
                </span>
                {currentTimer && currentTimer.isRunning ? (
                  <Pause className="h-3 w-3 fill-rose-300" />
                ) : (
                  <Play className="h-3 w-3 fill-slate-300" />
                )}
              </button>

              <div className="flex items-center gap-1 text-[#34C759] font-mono font-black text-sm">
                <span>${selectedOrder.rate_calculated || 100}</span>
              </div>

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

            {/* EXPANDED SECTION */}
            {drawerState === 'expanded' && (
              <div className="flex-1 overflow-y-auto mt-2 pt-2 border-t border-white/10 space-y-3 apple-drawer-scroll pr-1">
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

                <div className="bg-[#1f2937] border border-white/5 rounded-2xl p-3 space-y-2.5">
                  <h3 className="text-xs font-black text-white uppercase tracking-wider">
                    Detalles
                  </h3>
                  
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

                  <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                    <span className="text-[#8e9aa8] font-medium">Coordenadas</span>
                    <span className="text-slate-200 font-mono text-[11px]">
                      {formatCoordinates(selectedOrder.latitude, selectedOrder.longitude)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                    <span className="text-[#8e9aa8] font-medium">Metraje & Cable</span>
                    <span className="text-slate-200 font-bold text-[11px]">
                      {selectedOrder.drop_footage || 0} ft ({selectedOrder.cable_type || 'RG-6'})
                      {selectedOrder.bore_type && selectedOrder.bore_type.includes('DW') ? ' • Bore DW' : ''}
                    </span>
                  </div>

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
                      className={`py-1.5 rounded-xl transition ${statusFilter === 'No Realizado' ? 'bg-[#8E8E93] text-white shadow-sm font-black' : 'text-slate-400'}`}
                    >
                      Canc. ({dayCancelled.length})
                    </button>
                  </div>

                  <div className="space-y-2">
                    {orders
                      .filter(o => statusFilter === 'ALL' || o.status === statusFilter)
                      .map((ord, idx) => {
                        const isTarget = selectedOrder?.id === ord.id;
                        const isCompleted = ord.status === 'Completado';
                        const isCancelled = ord.status === 'No Realizado';

                        return (
                          <div
                            key={ord.id || idx}
                            onClick={() => handleSelectJob(ord)}
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
                                  <span className="text-xs font-bold text-white truncate">
                                    {ord.address}
                                  </span>
                                  {ord.bore_type && ord.bore_type.includes('DW') && (
                                    <span className="text-[9px] bg-cyan-500/20 text-cyan-400 font-bold px-1.5 py-0.2 rounded-md">
                                      DW
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 flex items-center gap-2">
                                  <span>{ord.city || 'Skokie'}</span>
                                  <span>•</span>
                                  <span>Job #{ord.job_id}</span>
                                  <span>•</span>
                                  <span>{ord.drop_footage || 0} ft</span>
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div className="text-xs font-mono font-black text-[#34C759]">
                                ${ord.rate_calculated || 100}
                              </div>
                              <span className={`text-[9px] font-bold uppercase ${
                                isCompleted ? 'text-emerald-400' : isCancelled ? 'text-rose-400' : 'text-amber-400'
                              }`}>
                                {ord.status}
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
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <MapPin className="h-8 w-8 text-slate-500 mb-2" />
            <p className="text-sm font-bold text-white">No hay órdenes para este día</p>
            <p className="text-xs text-slate-400 mt-1 mb-3">Toca "+ Trabajo" para agregar una nueva orden.</p>
            <button
              onClick={onOpenAddJob}
              className="px-4 py-2 bg-[#007AFF] text-white rounded-xl text-xs font-bold shadow-md"
            >
              + Agregar Trabajo
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
