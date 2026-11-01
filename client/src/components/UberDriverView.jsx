import React, { useEffect, useRef, useState, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { 
  Navigation, MapPin, Compass, Sparkles, CheckCircle2, 
  Clock, AlertTriangle, ChevronUp, ChevronDown, Phone, 
  Camera, Share2, DollarSign, Layers, List, Pencil, 
  Car, Calendar, ArrowRight, ArrowLeft, 
  X, Plus, Play, Pause, MoreHorizontal,
  ExternalLink, Check, Sun, Moon, Globe,
  Route, MoveUp, MoveDown, CheckCheck, Zap, Maximize2
} from 'lucide-react';
import { formatDateFriendly } from '../utils/dateUtils';
import { geocodeAddressWithMapbox, MAPBOX_TOKEN } from '../utils/mapboxGeocode';

const MAPBOX_ACCESS_TOKEN = MAPBOX_TOKEN;
mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

// Map Theme Definitions
const MAP_THEMES = {
  apple_dark: {
    name: 'Apple Maps Oscuro',
    style: 'mapbox://styles/mapbox/dark-v11',
    icon: Moon,
    description: 'Calles en gris claro y parques verdes'
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

// Fast distance calculation (Haversine with 1.25 road curvature factor)
function getEstimatedDrivingMiles(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
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

// Calculate total driving distance for a full journey
function calculateTotalTripMiles(ordersList, startPoint) {
  if (!ordersList || ordersList.length === 0) return 0;
  let total = 0;
  let prev = startPoint;
  for (const ord of ordersList) {
    if (ord.latitude && ord.longitude) {
      if (prev && prev.lat && prev.lng) {
        total += getEstimatedDrivingMiles(prev.lat, prev.lng, ord.latitude, ord.longitude);
      }
      prev = { lat: ord.latitude, lng: ord.longitude };
    }
  }
  return total;
}

// Nearest Neighbor Travesía Optimizer (Shortest Driving Itinerary)
function optimizeStopsSequence(ordersList, startPoint) {
  if (!ordersList || ordersList.length <= 1) return ordersList;

  const valid = ordersList.filter(o => o.latitude && o.longitude);
  const invalid = ordersList.filter(o => !o.latitude || !o.longitude);

  let currentPos = startPoint || (valid[0] ? { lat: valid[0].latitude, lng: valid[0].longitude } : null);
  const unvisited = [...valid];
  const optimized = [];

  while (unvisited.length > 0) {
    let bestIdx = 0;
    let minDistance = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const ord = unvisited[i];
      const dist = currentPos 
        ? getEstimatedDrivingMiles(currentPos.lat, currentPos.lng, ord.latitude, ord.longitude)
        : 0;
      if (dist < minDistance) {
        minDistance = dist;
        bestIdx = i;
      }
    }

    const nextStop = unvisited.splice(bestIdx, 1)[0];
    optimized.push(nextStop);
    currentPos = { lat: nextStop.latitude, lng: nextStop.longitude };
  }

  return [...optimized, ...invalid];
}

// Helper to extract clean remark or obstacles
function getOrderRemark(order) {
  if (!order) return null;
  const parts = [];
  if (order.obstacles && order.obstacles !== 'N') {
    const cleanObs = String(order.obstacles).replace(/^remark[:\s-]*/i, '').trim();
    if (cleanObs && cleanObs !== 'N') parts.push(cleanObs);
  }
  if (order.raw_notes && typeof order.raw_notes === 'string') {
    let trimmed = order.raw_notes.trim();
    if (trimmed && !trimmed.startsWith('P#:') && !trimmed.startsWith('CALLFIRST/P#:')) {
      trimmed = trimmed.replace(/^remark[:\s-]*/i, '').trim();
      if (trimmed && !parts.includes(trimmed)) {
        parts.push(trimmed);
      }
    }
  }
  return parts.length > 0 ? parts.join(' • ') : null;
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
  onOpenCancelDetail,
  onOpenEditModal,
  onOpenAdjustModal,
  onOpenShareModal,
  localSharedMap = {},
  onOrderUpdated,
  onSwitchToClassic
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const routeBadgeMarkersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const abortControllerRef = useRef(null);

  // High-Speed In-Memory Route Cache: start_lng,lat->dest_lng,lat => routeData
  const routeCacheRef = useRef(new Map());

  const [userLocation, setUserLocation] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [drawerState, setDrawerState] = useState('peek');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [is3DMode, setIs3DMode] = useState(true);

  // Top stops ribbon ref for automatic scrolling
  const stopsRibbonRef = useRef(null);

  // Photos state for active job card and fullscreen lightbox
  const [selectedOrderPhotos, setSelectedOrderPhotos] = useState([]);
  const [fullscreenPhotoUrl, setFullscreenPhotoUrl] = useState(null);
  const [fullscreenPhotoIndex, setFullscreenPhotoIndex] = useState(0);

  // Auto-scroll the active stop chip into view in the top ribbon
  useEffect(() => {
    if (stopsRibbonRef.current && selectedOrder?.id) {
      const activeEl = stopsRibbonRef.current.querySelector(`[data-order-id="${selectedOrder.id}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [selectedOrder?.id]);

  // Load photos for selected order whenever selectedOrder changes or orders list updates
  useEffect(() => {
    if (!selectedOrder?.id) {
      setSelectedOrderPhotos([]);
      return;
    }

    if (Array.isArray(selectedOrder.photos) && selectedOrder.photos.length > 0) {
      setSelectedOrderPhotos(selectedOrder.photos);
    }

    let isMounted = true;
    fetch(`/api/orders/${selectedOrder.id}/photos`)
      .then(res => res.json())
      .then(data => {
        if (isMounted && data && Array.isArray(data.photos)) {
          setSelectedOrderPhotos(data.photos);
        }
      })
      .catch(() => {
        fetch(`/api/orders/${selectedOrder.id}`)
          .then(r => r.json())
          .then(d => {
            if (isMounted && d && Array.isArray(d.photos)) {
              setSelectedOrderPhotos(d.photos);
            }
          })
          .catch(() => {});
      });

    return () => { isMounted = false; };
  }, [selectedOrder?.id, selectedOrder?.photos_count, selectedOrder?.work_photos_count, orders]);

  // Map Theme state: Default is 'apple_dark'
  const [mapTheme, setMapTheme] = useState(() => {
    return localStorage.getItem('xfinity_map_theme') || 'apple_dark';
  });
  const [showThemePicker, setShowThemePicker] = useState(false);

  // Travesía Organizer Modal State
  const [showTripModal, setShowTripModal] = useState(false);
  const [tempOrdersList, setTempOrdersList] = useState([]);
  const [isSavingTrip, setIsSavingTrip] = useState(false);
  const [optimizedNotice, setOptimizedNotice] = useState(null);

  // Route state
  const [activeRouteInfo, setActiveRouteInfo] = useState(null);
  const [availableRoutes, setAvailableRoutes] = useState([]);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
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

  // Default coordinate center: Elkhart Comcast Base
  const DEFAULT_LNG_LAT = [-85.9773686, 41.6820000];

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
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 5000 }
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
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
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

  // Determine Origin Point ("Desde dónde estoy")
  const getOriginPoint = (targetOrder) => {
    if (userLocation && userLocation.lng && userLocation.lat) {
      return { coords: [userLocation.lng, userLocation.lat], label: 'GPS en vivo' };
    }
    const targetIdx = orders.findIndex(o => o.id === targetOrder?.id);
    if (targetIdx > 0 && orders[targetIdx - 1]?.latitude && orders[targetIdx - 1]?.longitude) {
      return { 
        coords: [orders[targetIdx - 1].longitude, orders[targetIdx - 1].latitude], 
        label: `Parada ${targetIdx}` 
      };
    }
    const firstValid = orders.find(o => o.latitude && o.longitude);
    if (firstValid && firstValid.id !== targetOrder?.id) {
      return { coords: [firstValid.longitude, firstValid.latitude], label: 'Inicio de ruta' };
    }
    return { coords: DEFAULT_LNG_LAT, label: 'Base Comcast' };
  };

  // Helper to fetch and cache shortest route
  const fetchShortestRoute = async (startCoords, destCoords, signal) => {
    const cacheKey = `${startCoords[0].toFixed(5)},${startCoords[1].toFixed(5)}->${destCoords[0].toFixed(5)},${destCoords[1].toFixed(5)}`;
    if (routeCacheRef.current.has(cacheKey)) {
      return routeCacheRef.current.get(cacheKey);
    }

    try {
      const dirUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${startCoords[0]},${startCoords[1]};${destCoords[0]},${destCoords[1]}?alternatives=true&overview=full&geometries=geojson&access_token=${MAPBOX_ACCESS_TOKEN}`;
      const res = await fetch(dirUrl, { signal });
      if (res.ok) {
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
          // Sort candidate routes by distance ascending so [0] is the physically shortest path
          const parsed = data.routes.map((r, idx) => ({
            index: idx,
            coordinates: r.geometry.coordinates,
            miles: r.distance / 1609.34,
            minutes: Math.max(1, Math.round(r.duration / 60)),
            summary: r.legs?.[0]?.summary || `Vía opción ${idx + 1}`
          })).sort((a, b) => a.miles - b.miles);

          const result = {
            shortest: parsed[0],
            allRoutes: parsed
          };
          routeCacheRef.current.set(cacheKey, result);
          return result;
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.warn('Directions fetch note:', e.message);
    }

    // Straight-line fallback
    const fallbackMiles = getEstimatedDrivingMiles(startCoords[1], startCoords[0], destCoords[1], destCoords[0]) || 0.8;
    const fallback = {
      shortest: {
        index: 0,
        coordinates: [startCoords, destCoords],
        miles: fallbackMiles,
        minutes: Math.max(1, Math.round(fallbackMiles * 2.2)),
        summary: 'Ruta directa'
      },
      allRoutes: []
    };
    routeCacheRef.current.set(cacheKey, fallback);
    return fallback;
  };

  // 3. BACKGROUND PRE-FETCH FOR INSTANT (0 MS) SWITCHING
  useEffect(() => {
    if (!orders || orders.length === 0) return;
    const valid = orders.filter(o => o.latitude && o.longitude);
    if (valid.length === 0) return;

    let isCancelled = false;

    const prefetch = async () => {
      for (let i = 0; i < valid.length; i++) {
        if (isCancelled) break;
        const target = valid[i];
        const origin = getOriginPoint(target).coords;
        await fetchShortestRoute(origin, [target.longitude, target.latitude]);
      }
    };

    // Stagger slightly so initial render is lightning fast
    const timer = setTimeout(prefetch, 300);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [orders, userLocation?.lat, userLocation?.lng]);

  // 4. SELECT A JOB: INSTANTLY DRAWS ROUTE (NO BLANK TIME)
  const handleSelectJob = async (order) => {
    if (!order) return;
    let target = order;
    setSelectedRouteIdx(0);

    // If target doesn't have coordinates, geocode first
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
      }
    }

    setSelectedOrder(target);

    // INSTANT ROUTE RENDER: Check cache right now (0 ms!)
    const map = mapInstanceRef.current;
    if (map && target.latitude && target.longitude) {
      const { coords: startCoords } = getOriginPoint(target);
      const destCoords = [target.longitude, target.latitude];
      const cacheKey = `${startCoords[0].toFixed(5)},${startCoords[1].toFixed(5)}->${destCoords[0].toFixed(5)},${destCoords[1].toFixed(5)}`;

      if (routeCacheRef.current.has(cacheKey)) {
        const cached = routeCacheRef.current.get(cacheKey);
        setActiveRouteInfo(cached.shortest);
        setAvailableRoutes(cached.allRoutes);

        if (map.getSource('route-nav')) {
          map.getSource('route-nav').setData({
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: cached.shortest.coordinates }
          });
        }
      } else {
        // Immediate guidance connection so map is NEVER left blank!
        if (map.getSource('route-nav')) {
          map.getSource('route-nav').setData({
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: [startCoords, destCoords] }
          });
        }
      }

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
      }
    }
  }, [orders, targetFocusOrderId]);

  // Apply Apple Maps Dark Styling
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
    } catch (err) {}
  };

  // Helper to attach route layers cleanly whenever a style is loaded
  const setupRouteLayers = (map) => {
    if (!map) return;

    // Active Primary Route Source & Layers (Apple Electric Blue)
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

    applyCustomMapStyling(map);
  };

  // 5. INITIALIZE MAPBOX GL 3D VECTOR MAP
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

  // Handle Changing Map Theme
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

  // 6. UPDATE MARKERS & ROUTE EXECUTION
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear previous markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    routeBadgeMarkersRef.current.forEach(m => m.remove());
    routeBadgeMarkersRef.current = [];

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    const activeTarget = selectedOrder || validOrders[0];
    const { coords: startCoords } = getOriginPoint(activeTarget);

    // Technician Vehicle Puck
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

    // Render ALL Daily Stop Markers simultaneously
    orders.forEach((order, index) => {
      if (!order.latitude || !order.longitude) return;

      const orderLngLat = [order.longitude, order.latitude];
      bounds.extend(orderLngLat);

      const isCompleted = order.status === 'Completado';
      const isCancelled = order.status === 'No Realizado';
      const isTarget = activeTarget?.id === order.id;

      const markerEl = document.createElement('div');

      if (isTarget) {
        // Destination Marker
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
        // Numbered Stop Marker for other jobs
        let bg = 'bg-[#FF9500]';
        if (isCompleted) bg = 'bg-[#34C759]';
        else if (isCancelled) bg = 'bg-[#8E8E93]';

        markerEl.className = 'cursor-pointer group flex flex-col items-center';
        markerEl.innerHTML = `
          <div class="w-7 h-7 rounded-full ${bg} border-2 border-white/90 text-white font-black text-xs flex items-center justify-center shadow-lg transition-transform group-hover:scale-125">
            ${isCompleted ? '✓' : isCancelled ? '✕' : index + 1}
          </div>
        `;
        markerEl.onclick = () => handleSelectJob(order);

        const stopMarker = new mapboxgl.Marker({ element: markerEl, anchor: 'center' })
          .setLngLat(orderLngLat)
          .addTo(map);

        markersRef.current.push(stopMarker);
      }
    });

    // Abort previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Compute or retrieve shortest route
    if (activeTarget && activeTarget.latitude && activeTarget.longitude && startCoords) {
      const destCoords = [activeTarget.longitude, activeTarget.latitude];

      fetchShortestRoute(startCoords, destCoords, controller.signal).then(routeData => {
        if (!routeData) return;
        const currentActive = routeData.allRoutes[selectedRouteIdx] || routeData.shortest;
        setActiveRouteInfo(currentActive);
        setAvailableRoutes(routeData.allRoutes);

        if (map.getSource('route-nav')) {
          map.getSource('route-nav').setData({
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: currentActive.coordinates
            }
          });
        }

        // Floating ETA Badge on Route
        if (currentActive.coordinates && currentActive.coordinates.length > 2) {
          const midIdx = Math.floor(currentActive.coordinates.length / 2);
          const midPoint = currentActive.coordinates[midIdx];

          const activeBadgeEl = document.createElement('div');
          activeBadgeEl.className = 'apple-active-route-badge';
          activeBadgeEl.innerHTML = `
            <div class="eta-main">${currentActive.minutes} min</div>
            <div class="eta-sub">${currentActive.miles.toFixed(1)} mi • Más corta</div>
          `;

          const activeMarker = new mapboxgl.Marker({ element: activeBadgeEl, anchor: 'center' })
            .setLngLat(midPoint)
            .addTo(map);

          routeBadgeMarkersRef.current.push(activeMarker);
        }
      });
    }

    // Camera Framing with 3D perspective
    if (activeTarget && activeTarget.latitude && activeTarget.longitude) {
      const activeBounds = new mapboxgl.LngLatBounds();
      activeBounds.extend(startCoords);
      activeBounds.extend([activeTarget.longitude, activeTarget.latitude]);

      map.fitBounds(activeBounds, {
        padding: { top: 120, bottom: 280, left: 50, right: 50 },
        pitch: is3DMode ? 48 : 0,
        maxZoom: 15.5,
        duration: 800
      });
    }
  }, [orders, selectedOrder?.id, selectedOrder?.latitude, selectedOrder?.longitude, userLocation, is3DMode, mapTheme, selectedRouteIdx]);

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
        padding: { top: 120, bottom: 280, left: 50, right: 50 },
        pitch: is3DMode ? 45 : 0,
        duration: 1000
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

  // OPEN TRAVESÍA ORGANIZER MODAL
  const handleOpenTripOrganizer = () => {
    setTempOrdersList([...orders]);
    setOptimizedNotice(null);
    setShowTripModal(true);
  };

  // MOVE STOP UP IN TRAVESÍA
  const handleMoveStopUp = (index) => {
    if (index <= 0) return;
    setTempOrdersList(prev => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
    setOptimizedNotice(null);
  };

  // MOVE STOP DOWN IN TRAVESÍA
  const handleMoveStopDown = (index) => {
    if (index >= tempOrdersList.length - 1) return;
    setTempOrdersList(prev => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
    setOptimizedNotice(null);
  };

  // RUN AUTO-OPTIMIZER FOR SHORTEST ROUTE (TSP NEAREST NEIGHBOR)
  const handleAutoOptimizeTrip = () => {
    const origin = userLocation || { lat: DEFAULT_LNG_LAT[1], lng: DEFAULT_LNG_LAT[0] };
    const beforeMiles = calculateTotalTripMiles(tempOrdersList, origin);
    const optimized = optimizeStopsSequence(tempOrdersList, origin);
    const afterMiles = calculateTotalTripMiles(optimized, origin);
    const saved = Math.max(0, beforeMiles - afterMiles);

    setTempOrdersList(optimized);
    setOptimizedNotice({
      savedMiles: saved.toFixed(1),
      totalMiles: afterMiles.toFixed(1),
      savedMinutes: Math.round(saved * 2.2)
    });
  };

  // SAVE AND APPLY REORDERED TRAVESÍA
  const handleSaveTripOrder = async () => {
    if (tempOrdersList.length === 0) return;
    setIsSavingTrip(true);
    try {
      const orderedIds = tempOrdersList.map(o => o.id);
      const res = await fetch('/api/orders/reorder-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds })
      });

      if (res.ok) {
        routeCacheRef.current.clear(); // Refresh route cache
        if (onOrderUpdated) await onOrderUpdated();
        setShowTripModal(false);
        const newFirst = tempOrdersList[0];
        if (newFirst) {
          handleSelectJob(newFirst);
        }
      }
    } catch (err) {
      alert('Error guardando travesía: ' + err.message);
    } finally {
      setIsSavingTrip(false);
    }
  };

  // Formatted GPS display
  const formatCoordinates = (lat, lng) => {
    if (!lat || !lng) return 'Coordenadas en proceso';
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'O';
    return `${Math.abs(lat).toFixed(5)}° ${latDir}, ${Math.abs(lng).toFixed(5)}° ${lngDir}`;
  };

  // Open native navigation
  const getNavUrl = (order) => {
    if (!order) return '#';
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${order.address}, ${order.city || 'Elkhart'}, IN ${order.zip_code || ''}`)}`;
  };

  const selectedIndex = selectedOrder ? orders.findIndex(o => o.id === selectedOrder.id) : 0;
  const currentTimer = selectedOrder ? jobTimers[selectedOrder.id] : null;

  // Selected Order computed properties
  const isSelectedCompleted = selectedOrder?.status === 'Completado';
  const isSelectedCancelled = selectedOrder?.status === 'No Realizado';
  const isSelectedPending = selectedOrder?.status === 'Pendiente';
  const selectedPhotosCount = selectedOrder 
    ? ((selectedOrder.work_photos_count !== undefined ? selectedOrder.work_photos_count : selectedOrder.photos_count) || (selectedOrder.photos ? selectedOrder.photos.length : 0) || 0)
    : 0;

  // Combined real-time photo list (from order payload + fetch fallback)
  const activePhotos = useMemo(() => {
    if (Array.isArray(selectedOrder?.photos) && selectedOrder.photos.length > 0) {
      return selectedOrder.photos;
    }
    if (Array.isArray(selectedOrderPhotos) && selectedOrderPhotos.length > 0) {
      return selectedOrderPhotos;
    }
    return [];
  }, [selectedOrder?.photos, selectedOrderPhotos, selectedOrder?.id]);

  const activePhotosCount = activePhotos.length || selectedPhotosCount || 0;
  const isSelectedShared = selectedOrder ? Boolean(selectedOrder.whatsapp_shared || localSharedMap[selectedOrder.id]) : false;
  const selectedRemark = selectedOrder ? getOrderRemark(selectedOrder) : null;
  const hasDrivewayBore = selectedOrder?.bore_type && selectedOrder.bore_type.includes('DW');

  const originInfo = useMemo(() => getOriginPoint(selectedOrder), [selectedOrder, userLocation, orders]);

  return (
    <div className="relative w-full max-w-md mx-auto h-[calc(100vh-8.5rem)] rounded-3xl overflow-hidden border border-[#232f3e] bg-[#121a24] shadow-2xl flex flex-col select-none">
      
      {/* 1. MAPBOX GL 3D VECTOR CANVAS */}
      <div 
        ref={mapContainerRef} 
        className="absolute inset-0 w-full h-full z-0 mapbox-3d-canvas" 
      />

      {/* 2. TOP HUD: MODERN DATE & BALANCE PILL + ACTION BUTTONS */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none gap-2">
        {/* Date & Day Earnings Pill */}
        <div className="pointer-events-auto bg-[#131b26]/95 backdrop-blur-2xl border border-slate-700/60 rounded-2xl px-3 py-1.5 shadow-xl flex items-center gap-2">
          <button
            onClick={() => onShiftDay(-1)}
            className="w-6 h-6 flex items-center justify-center hover:bg-white/10 text-slate-300 hover:text-white rounded-lg transition active:scale-90"
            title="Día anterior"
          >
            ‹
          </button>
          
          <div className="text-center cursor-pointer px-1" onClick={onGoToToday}>
            <div className="flex items-center justify-center gap-1.5 text-[10.5px] font-bold text-slate-200">
              <span className={`w-1.5 h-1.5 rounded-full ${isViewingToday ? 'bg-cyan-400 animate-pulse' : 'bg-slate-500'}`} />
              <span className="truncate">{isViewingToday ? 'Hoy' : formatDateFriendly(activeDate)}</span>
            </div>
            <div className="flex items-center justify-center gap-1.5 leading-none mt-0.5">
              <span className="text-xs sm:text-sm font-black font-mono text-emerald-400">
                ${dayEarnings.toFixed(2)}
              </span>
              <span className="text-[9px] font-bold text-slate-400 font-mono">
                ✓ {dayCompleted.length}/{orders.length}
              </span>
            </div>
          </div>

          <button
            onClick={() => onShiftDay(1)}
            className="w-6 h-6 flex items-center justify-center hover:bg-white/10 text-slate-300 hover:text-white rounded-lg transition active:scale-90"
            title="Día siguiente"
          >
            ›
          </button>
        </div>

        {/* Actions: + Trabajo & Lista */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            onClick={onOpenAddJob}
            className="px-3 py-2 rounded-2xl bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 hover:from-blue-500 hover:to-cyan-400 text-white font-extrabold text-xs shadow-lg shadow-cyan-600/25 active:scale-95 transition flex items-center gap-1.5"
            title="Añadir nuevo trabajo"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            <span className="text-[11.5px] font-black tracking-tight">+ Trabajo</span>
          </button>

          <button
            onClick={onSwitchToClassic}
            className="p-2 rounded-2xl bg-[#131b26]/95 backdrop-blur-xl hover:bg-[#1f2c3d] text-slate-300 hover:text-white border border-slate-700/60 shadow-lg active:scale-95 transition"
            title="Cambiar a Vista Lista"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 3. MODERN HORIZONTAL STOPS RIBBON (FULL WIDTH ACROSS MAP) */}
      {orders.length > 0 && (
        <div className="absolute top-16 left-3 right-3 z-20 pointer-events-auto">
          <div 
            ref={stopsRibbonRef}
            className="bg-[#121922]/95 backdrop-blur-2xl border border-slate-700/60 rounded-2xl p-1.5 shadow-2xl flex items-center gap-1.5 overflow-x-auto scrollbar-none scroll-smooth"
          >
            {orders.map((ord, idx) => {
              const isSelected = selectedOrder?.id === ord.id;
              const isDone = ord.status === 'Completado';
              const isCancel = ord.status === 'No Realizado';
              const isPending = !isDone && !isCancel;

              let badgeBg = 'bg-amber-500';
              let badgeText = idx + 1;
              if (isDone) {
                badgeBg = 'bg-emerald-500';
                badgeText = '✓';
              } else if (isCancel) {
                badgeBg = 'bg-rose-500';
                badgeText = '✕';
              }

              return (
                <button
                  key={ord.id || idx}
                  data-order-id={ord.id}
                  onClick={() => handleSelectJob(ord)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition whitespace-nowrap shrink-0 cursor-pointer active:scale-95 ${
                    isSelected
                      ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-cyan-500/35 ring-1.5 ring-cyan-300 font-black'
                      : isDone
                      ? 'bg-[#182330]/90 text-slate-300 hover:text-white border border-emerald-500/30'
                      : isCancel
                      ? 'bg-[#182330]/90 text-slate-400 hover:text-white border border-rose-500/20'
                      : 'bg-[#1c2736]/95 text-slate-200 hover:text-white hover:bg-[#253346] border border-amber-500/30 font-bold'
                  }`}
                  title={`Parada #${idx + 1}: ${ord.address || 'Sin dirección'} (${ord.status})`}
                >
                  <span className={`w-4 h-4 rounded-full ${badgeBg} text-white text-[9px] flex items-center justify-center font-black shadow-sm`}>
                    {badgeText}
                  </span>
                  <span className="truncate max-w-[110px] sm:max-w-[140px] text-[11px]">
                    {ord.address ? ord.address.split(',')[0] : `Parada ${idx + 1}`}
                  </span>
                  <span className={`text-[10px] font-mono font-bold ${
                    isSelected ? 'text-white' : isDone ? 'text-emerald-400' : isCancel ? 'text-slate-500 line-through' : 'text-emerald-400'
                  }`}>
                    ${ord.rate_calculated || 100}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. RIGHT FLOATING CONTROLS: THEME + 3D/2D + CENTRAR + ORGANIZAR */}
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
            <div className="absolute right-12 top-0 bg-[#16202c]/98 backdrop-blur-2xl border border-white/15 rounded-2xl p-2 shadow-2xl flex flex-col gap-1 w-48 z-50">
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

        {/* Open Travesía Modal */}
        <button
          onClick={handleOpenTripOrganizer}
          className="w-10 h-10 rounded-full bg-[#16202c]/90 backdrop-blur-xl border border-white/15 text-[#FF9500] hover:text-orange-400 flex items-center justify-center shadow-lg active:scale-95 transition"
          title="Organizar travesía del día"
        >
          <Sparkles className="h-4 w-4" />
        </button>
      </div>

      {/* 5. BOTTOM SLIDING DRAWER: REFINED ACTIVE JOB CARD */}
      <div 
        className={`absolute bottom-0 left-0 right-0 z-30 bg-[#131b26]/98 backdrop-blur-2xl rounded-t-3xl border-t border-slate-700/60 shadow-2xl transition-all duration-300 flex flex-col ${
          drawerState === 'expanded' ? 'h-[75%]' : 'h-[210px]'
        }`}
      >
        {/* Grabber Handle */}
        <div 
          onClick={() => setDrawerState(prev => prev === 'peek' ? 'expanded' : 'peek')}
          className="w-full pt-2 pb-1 flex flex-col items-center justify-center cursor-pointer select-none"
        >
          <div className="w-10 h-1 rounded-full bg-slate-500/40 hover:bg-slate-400/60 transition mb-0.5" />
        </div>

        {selectedOrder ? (
          <div className="flex-1 flex flex-col justify-between overflow-hidden px-4 pb-3">
            
            {/* ROW 1: COMPACT HEADER (STOP # + JOB ID + STATUS + NAV CHEVRONS + RATE + EDIT) */}
            <div className="flex items-center justify-between gap-1.5 pt-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                {/* Circle Stop Number */}
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 shadow-sm ${
                  isSelectedCompleted
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : isSelectedCancelled
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                }`}>
                  {isSelectedCompleted ? '✓' : isSelectedCancelled ? '✕' : selectedIndex + 1}
                </span>

                {/* Job ID */}
                <span className="text-xs sm:text-sm font-black font-mono text-cyan-400 tracking-tight">
                  #{selectedOrder.job_id}
                </span>

                {/* Status Badge */}
                <span className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-bold flex items-center gap-1 border ${
                  isSelectedCompleted
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : isSelectedCancelled
                    ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                    : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                }`}>
                  {isSelectedCompleted && <CheckCircle2 className="h-2.5 w-2.5" />}
                  {isSelectedPending && <Clock className="h-2.5 w-2.5" />}
                  {isSelectedCancelled && <X className="h-2.5 w-2.5" />}
                  <span>{selectedOrder.status}</span>
                </span>
              </div>

              {/* Navigation Chevrons + Rate + Edit */}
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="flex items-center bg-[#1c2736] border border-white/5 rounded-lg px-1 py-0.5">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handlePrevJob(); }}
                    className="p-0.5 text-slate-400 hover:text-white transition active:scale-90"
                    title="Parada anterior"
                  >
                    <ArrowLeft className="h-2.5 w-2.5" />
                  </button>
                  <span className="text-[9.5px] font-black text-slate-400 px-1 font-mono">
                    {selectedIndex + 1}/{orders.length}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleNextJob(); }}
                    className="p-0.5 text-slate-400 hover:text-white transition active:scale-90"
                    title="Siguiente parada"
                  >
                    <ArrowRight className="h-2.5 w-2.5" />
                  </button>
                </div>

                {/* Rate Medallion */}
                <div 
                  className={`inline-flex items-center px-2 py-0.5 rounded-lg border select-none ${
                    isSelectedCancelled
                      ? 'bg-slate-800/60 text-slate-500 border-slate-700 line-through'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 font-black'
                  }`}
                >
                  <span className="text-xs font-black font-mono">
                    ${selectedOrder.rate_calculated || 100}
                  </span>
                </div>

                {/* Edit Button */}
                <button
                  type="button"
                  onClick={() => onOpenEditModal(selectedOrder)}
                  className="p-1 rounded-lg bg-[#1c2736] text-slate-400 hover:text-cyan-400 border border-white/5 transition active:scale-90"
                  title="Editar datos del trabajo"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* ROW 2: ADDRESS & SHORTCUTS (GPS + PHONE + ROUTE DISTANCE) */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <div 
                className="min-w-0 flex-1 cursor-pointer"
                onClick={() => setDrawerState(prev => prev === 'peek' ? 'expanded' : 'peek')}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <h2 className="text-xs sm:text-sm font-black text-white truncate leading-tight">
                    {selectedOrder.address || 'Sin dirección asignada'}
                  </h2>
                  {activeRouteInfo && (
                    <span className="text-cyan-400 font-bold text-[10px] shrink-0 flex items-center gap-0.5 bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-800/60">
                      <Zap className="h-2.5 w-2.5 inline text-amber-400" />
                      <span>~{activeRouteInfo.minutes}m ({activeRouteInfo.miles.toFixed(1)}mi)</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {selectedOrder.phone && (
                  <a
                    href={`tel:${selectedOrder.phone}`}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 text-[10px] font-bold hover:bg-cyan-500/20 active:scale-95 transition"
                    title={`Llamar: ${selectedOrder.phone}`}
                  >
                    <Phone className="h-2.5 w-2.5" />
                    <span>Llamar</span>
                  </a>
                )}

                <a
                  href={getNavUrl(selectedOrder)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-600/25 text-blue-400 border border-blue-500/35 text-[10px] font-bold hover:bg-blue-600/40 active:scale-95 transition"
                  title="Abrir navegación GPS"
                >
                  <Navigation className="h-2.5 w-2.5" />
                  <span>GPS</span>
                </a>
              </div>
            </div>

            {/* ROW 3: SPECS & LINEAL PHOTOS (UNA SOLA LÍNEA COMPACTA CON CUADRADITOS AMPLIABLES) */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1 whitespace-nowrap">
              {/* Technical Specifications Chips */}
              <span className="shrink-0 bg-[#1b2533] px-1.5 py-0.5 rounded-md border border-slate-700/80 text-amber-300 font-mono text-[9.5px] font-bold">
                {selectedOrder.drop_footage || 0} ft ({selectedOrder.cable_type || 'RG-6'})
              </span>

              {hasDrivewayBore && (
                <span className="shrink-0 bg-cyan-950/80 text-cyan-300 px-1.5 py-0.5 rounded-md border border-cyan-800 text-[9.5px] font-bold">
                  Bore +$30
                </span>
              )}

              {/* Timer Badge */}
              <button
                type="button"
                onClick={() => toggleJobTimer(selectedOrder.id)}
                className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border font-mono text-[9px] font-bold transition ${
                  currentTimer && currentTimer.isRunning
                    ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 animate-pulse'
                    : currentTimer && currentTimer.elapsed > 0
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-[#1b2533] border-slate-700/80 text-slate-400 hover:text-white'
                }`}
                title="Temporizador de trabajo en sitio"
              >
                <Clock className="h-2 w-2" />
                <span>
                  {currentTimer && currentTimer.elapsed > 0 
                    ? formatTimerDisplay(currentTimer.elapsed) 
                    : 'En sitio'}
                </span>
                {currentTimer && currentTimer.isRunning ? (
                  <Pause className="h-1.5 w-1.5 fill-rose-300" />
                ) : (
                  <Play className="h-1.5 w-1.5 fill-slate-400" />
                )}
              </button>

              {/* Vertical divider */}
              <span className="w-px h-5 bg-slate-700/80 shrink-0" />

              {/* LINEAL PHOTO STRIP: Cuadraditos con las fotos en pequeño que se amplían al tocar */}
              {activePhotos && activePhotos.length > 0 ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Botón + Foto en miniatura */}
                  <button
                    type="button"
                    onClick={() => onOpenPhotos(selectedOrder)}
                    className="w-8 h-8 rounded-lg border border-dashed border-cyan-500/50 hover:border-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[10px] font-bold active:scale-95 transition shadow-sm cursor-pointer shrink-0"
                    title="Añadir otra foto de evidencia"
                  >
                    <Plus className="h-3.5 w-3.5 text-cyan-400" />
                  </button>

                  {/* Cuadraditos de fotos pequeñas */}
                  {activePhotos.map((photo, pIdx) => {
                    const photoSrc = photo.photo_data || `/uploads/${photo.filename}`;
                    return (
                      <div
                        key={photo.id || pIdx}
                        onClick={() => {
                          setFullscreenPhotoIndex(pIdx);
                          setFullscreenPhotoUrl(photoSrc);
                        }}
                        className="group relative w-8 h-8 shrink-0 rounded-lg overflow-hidden border border-slate-700/80 hover:border-cyan-400 cursor-pointer shadow-sm transition active:scale-95 bg-slate-900"
                        title={`Toca para ampliar foto #${pIdx + 1} (${photo.category || 'Evidencia'})`}
                      >
                        <img
                          src={photoSrc}
                          alt={photo.category || `Foto ${pIdx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-110 transition duration-150"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                          <Maximize2 className="h-2.5 w-2.5 text-white" />
                        </div>
                      </div>
                    );
                  })}
                  <span className="text-[9px] text-slate-400 font-mono pl-0.5 shrink-0">
                    {activePhotos.length} {activePhotos.length === 1 ? 'foto' : 'fotos'}
                  </span>
                </div>
              ) : (
                /* Estado sin fotos: Chip lineal ultra-compacto */
                <button
                  type="button"
                  onClick={() => onOpenPhotos(selectedOrder)}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-dashed border-amber-500/40 text-[9.5px] font-bold text-amber-300 transition active:scale-95 shrink-0"
                  title="Abrir cámara y registrar fotos de evidencia"
                >
                  <Camera className="h-2.5 w-2.5 text-amber-400" />
                  <span>Sin fotos de evidencia aún</span>
                  <span className="text-[8.5px] bg-amber-500/20 px-1 rounded text-amber-300 font-black">+</span>
                </button>
              )}
            </div>

            {/* ROW 4: ACTION BUTTONS (COMPACT AND CONCISE) */}
            <div className="pt-0.5">
              {/* If CANCELLED */}
              {isSelectedCancelled && (
                <div className="p-1.5 rounded-xl bg-rose-950/40 border border-rose-900/60 text-xs flex items-center justify-between gap-2 shadow-sm">
                  <div
                    onClick={() => onOpenCancelDetail ? onOpenCancelDetail(selectedOrder) : null}
                    className="flex items-center gap-1.5 min-w-0 cursor-pointer flex-1 group"
                    title="Ver detalles de cancelación"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                    <p className="text-[11px] font-semibold text-rose-200 truncate">
                      {selectedOrder.cancel_reason || 'Sin motivo detallado'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenShareModal(selectedOrder)}
                    className="px-2.5 py-1 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 text-white text-[10.5px] font-black rounded-lg transition flex items-center gap-1 active:scale-95 shrink-0"
                  >
                    <Share2 className="h-3 w-3 stroke-[2.5]" />
                    <span>WhatsApp</span>
                  </button>
                </div>
              )}

              {/* If PENDING */}
              {isSelectedPending && (
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenCancelModal(selectedOrder)}
                    className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10.5px] font-bold rounded-xl transition active:scale-95"
                  >
                    No Realizado
                  </button>

                  <div className="flex items-center gap-1.5">
                    {activePhotosCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => onMarkCompleted(selectedOrder)}
                        className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black rounded-xl transition flex items-center gap-1 shadow-md shadow-emerald-500/25 active:scale-95"
                        title="Confirmar trabajo completado"
                      >
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                        <span>Confirmar</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenPhotos(selectedOrder)}
                        className="px-3 py-1.5 bg-[#1b2533] hover:bg-amber-500/15 text-slate-400 hover:text-amber-300 border border-dashed border-slate-600 hover:border-amber-500/50 text-[10.5px] font-bold rounded-xl transition flex items-center gap-1.5 active:scale-95"
                        title="Debes subir fotos de evidencia antes de poder confirmar"
                      >
                        <Camera className="h-3 w-3 text-amber-400" />
                        <span>Foto Requerida</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* If COMPLETED */}
              {isSelectedCompleted && (
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-emerald-400 text-[11px] font-bold bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-xl">
                    <Check className="h-3 w-3 stroke-[3]" />
                    <span>Completado</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => onOpenShareModal(selectedOrder)}
                    className="px-3 py-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 text-slate-950 text-[11px] font-black rounded-xl transition flex items-center gap-1 shadow-sm active:scale-95"
                  >
                    <Share2 className="h-3 w-3 stroke-[2.5]" />
                    <span>WhatsApp</span>
                  </button>
                </div>
              )}
            </div>

            {/* EXPANDED SECTION */}
            {drawerState === 'expanded' && (
              <div className="flex-1 overflow-y-auto mt-2 pt-2 border-t border-slate-700/60 space-y-3 scrollbar-none pr-1">
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

                <div className="bg-[#1b2533] border border-white/5 rounded-2xl p-3 space-y-2.5">
                  <h3 className="text-xs font-black text-white uppercase tracking-wider">
                    Detalles del Trabajo
                  </h3>
                  
                  <div className="flex justify-between items-start text-xs border-b border-white/5 pb-2">
                    <span className="text-slate-400 font-medium">Dirección</span>
                    <div className="text-right text-slate-100 font-semibold leading-tight">
                      <div>{selectedOrder.address}</div>
                      <div className="text-[11px] text-slate-400">
                        {selectedOrder.city || 'Skokie'}, IN {selectedOrder.zip_code || ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                    <span className="text-slate-400 font-medium">Coordenadas</span>
                    <span className="text-slate-200 font-mono text-[11px]">
                      {formatCoordinates(selectedOrder.latitude, selectedOrder.longitude)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                    <span className="text-slate-400 font-medium">Metraje & Cable</span>
                    <span className="text-slate-200 font-bold text-[11px]">
                      {selectedOrder.drop_footage || 0} ft ({selectedOrder.cable_type || 'RG-6'})
                      {hasDrivewayBore ? ' • Bore DW' : ''}
                    </span>
                  </div>

                  {selectedOrder.phone && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-medium">Teléfono Cliente</span>
                      <a 
                        href={`tel:${selectedOrder.phone}`}
                        className="text-cyan-400 font-mono font-bold text-[11px] flex items-center gap-1 hover:underline"
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
                                : 'bg-[#1b2533] border-white/5 hover:border-white/15'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className={`w-6 h-6 rounded-full text-white font-black text-xs flex items-center justify-center font-sans shrink-0 ${
                                isCompleted ? 'bg-[#34C759]' : isCancelled ? 'bg-[#FF3B30]' : 'bg-[#FF9500]'
                              }`}>
                                {isCompleted ? '✓' : isCancelled ? '✕' : idx + 1}
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
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl text-xs font-bold shadow-md"
            >
              + Agregar Trabajo
            </button>
          </div>
        )}
      </div>

      {/* 6. MODAL: ORGANIZAR TRAVESÍA DEL DÍA & RUTA MÁS CORTA */}
      {showTripModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-[#121922] border border-slate-700/80 rounded-3xl p-4 shadow-2xl max-w-sm w-full max-h-[90vh] flex flex-col text-slate-100">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white leading-tight">Organizar Travesía</h3>
                  <p className="text-[10px] text-slate-400">Orden de paradas para llegar más rápido</p>
                </div>
              </div>
              <button
                onClick={() => setShowTripModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Auto Optimize Button */}
            <div className="py-2.5">
              <button
                type="button"
                onClick={handleAutoOptimizeTrip}
                className="w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 hover:from-blue-500 hover:to-cyan-400 text-white font-black text-xs shadow-lg shadow-cyan-600/25 flex items-center justify-center gap-2 active:scale-95 transition"
              >
                <Sparkles className="h-4 w-4 stroke-[2.5]" />
                <span>⚡ Optimizar Ruta Más Corta (Automático)</span>
              </button>

              {optimizedNotice && (
                <div className="mt-2 p-2 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-[11px] text-emerald-300 font-bold flex items-center gap-2">
                  <CheckCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>
                    ¡Ruta optimizada! Ahorras ~{optimizedNotice.savedMiles} mi (~{optimizedNotice.savedMinutes} min). Total estimado: {optimizedNotice.totalMiles} mi.
                  </span>
                </div>
              )}
            </div>

            {/* List of stops with manual Move Up / Move Down buttons */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-none py-1">
              <div className="flex items-center justify-between px-1 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                <span>Orden de la jornada ({tempOrdersList.length} paradas)</span>
                <span>Subir / Bajar</span>
              </div>

              {tempOrdersList.map((ord, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === tempOrdersList.length - 1;
                const isDone = ord.status === 'Completado';
                const isCancel = ord.status === 'No Realizado';

                return (
                  <div
                    key={ord.id || idx}
                    className="p-2.5 rounded-2xl bg-[#1b2533] border border-slate-700/60 flex items-center justify-between gap-2 shadow-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Step Number in circle */}
                      <span className={`w-6 h-6 rounded-full text-white font-black text-xs flex items-center justify-center shrink-0 shadow-sm ${
                        isDone ? 'bg-emerald-500' : isCancel ? 'bg-rose-500' : 'bg-cyan-500'
                      }`}>
                        {isDone ? '✓' : isCancel ? '✕' : idx + 1}
                      </span>

                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate leading-tight">
                          {ord.address}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span>Job #{ord.job_id}</span>
                          <span>•</span>
                          <span>${ord.rate_calculated || 100}</span>
                          {ord.bore_type && ord.bore_type.includes('DW') && (
                            <span className="text-cyan-400 font-bold">• DW</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Up / Down Controls */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMoveStopUp(idx)}
                        disabled={isFirst}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center border text-xs font-bold transition ${
                          isFirst 
                            ? 'opacity-25 border-slate-800 text-slate-600' 
                            : 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200 active:scale-90'
                        }`}
                        title="Mover hacia arriba"
                      >
                        <MoveUp className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMoveStopDown(idx)}
                        disabled={isLast}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center border text-xs font-bold transition ${
                          isLast 
                            ? 'opacity-25 border-slate-800 text-slate-600' 
                            : 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200 active:scale-90'
                        }`}
                        title="Mover hacia abajo"
                      >
                        <MoveDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer Buttons */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowTripModal(false)}
                className="px-3 py-2 text-xs font-bold text-slate-400 hover:text-white transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveTripOrder}
                disabled={isSavingTrip}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow-md active:scale-95 transition"
              >
                {isSavingTrip ? 'Guardando...' : 'Guardar y Aplicar Travesía'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
