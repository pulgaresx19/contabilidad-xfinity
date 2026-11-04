import React, { useEffect, useRef, useState, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { 
  Navigation, MapPin, Compass, Sparkles, CheckCircle2, 
  Clock, AlertTriangle, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Phone, 
  Camera, Share2, DollarSign, Layers, List, Pencil, 
  Car, Calendar, ArrowRight, ArrowLeft, 
  X, Plus, Play, Pause, MoreHorizontal,
  ExternalLink, Check, Sun, Moon, Globe,
  Route, MoveUp, MoveDown, CheckCheck, Zap, Maximize2, GripVertical, ArrowUpDown
} from 'lucide-react';
import { formatDateFriendly, normalizeDateStr, formatRouteDuration } from '../utils/dateUtils';
import { geocodeAddressWithMapbox, MAPBOX_TOKEN } from '../utils/mapboxGeocode';
import { useTheme } from '../context/ThemeContext';

const MAPBOX_ACCESS_TOKEN = MAPBOX_TOKEN;
mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

// Map Theme Definitions (Nombres profesionales y explícitos)
const MAP_THEMES = {
  dark: {
    name: 'Mapa Oscuro',
    style: 'mapbox://styles/mapbox/dark-v11',
    icon: Moon,
    description: 'Calles visibles y contraste nocturno'
  },
  streets: {
    name: 'Mapa Claro',
    style: 'mapbox://styles/mapbox/streets-v12',
    icon: Sun,
    description: 'Mapa claro de alta visibilidad'
  },
  satellite: {
    name: 'Satélite Real',
    style: 'mapbox://styles/mapbox/satellite-streets-v12',
    icon: Globe,
    description: 'Fotos aéreas para postes y acometidas'
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
  onSelectDate,
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
  onUpdateOrders,
  onSwitchToClassic
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const routeBadgeMarkersRef = useRef([]);
  const travesiaBadgeMarkersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const abortControllerRef = useRef(null);

  // High-Speed In-Memory Route Cache: start_lng,lat->dest_lng,lat => routeData
  const routeCacheRef = useRef(new Map());

  const [userLocation, setUserLocation] = useState(null);
  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [drawerState, setDrawerState] = useState('peek');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [is3DMode, setIs3DMode] = useState(true);

  // Free Exploration Mode: User can pan/zoom anywhere freely without being snapped back
  const [isUserPanned, setIsUserPanned] = useState(false);
  const userHasPannedMapRef = useRef(false);
  const framedOrderIdRef = useRef(null);

  // Reset free exploration and framed order when activeDate changes
  useEffect(() => {
    userHasPannedMapRef.current = false;
    setIsUserPanned(false);
    framedOrderIdRef.current = null;
  }, [activeDate]);

  // Date picker ref for direct calendar jump
  const dateInputRef = useRef(null);

  // Photos state for active job card and fullscreen lightbox
  const [selectedOrderPhotos, setSelectedOrderPhotos] = useState([]);
  const [fullscreenPhotoUrl, setFullscreenPhotoUrl] = useState(null);
  const [fullscreenPhotoIndex, setFullscreenPhotoIndex] = useState(0);

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

  const { actualTheme } = useTheme();

  // Map Theme state: Defaults to streets in Light Mode, dark in Dark Mode
  const [mapTheme, setMapTheme] = useState(() => {
    const saved = localStorage.getItem('xfinity_map_theme');
    if (saved === 'satellite') return 'satellite';
    if (saved === 'streets' || saved === 'dark') return saved;
    return actualTheme === 'light' ? 'streets' : 'dark';
  });
  const mapThemeRef = useRef(mapTheme);
  mapThemeRef.current = mapTheme;
  const [showThemePicker, setShowThemePicker] = useState(false);

  // Sync Mapbox theme when global app theme switches (unless user locked satellite)
  useEffect(() => {
    const isLockedSatellite = localStorage.getItem('xfinity_map_theme_locked') === 'satellite';
    if (isLockedSatellite && mapTheme === 'satellite') return;

    const targetStyle = actualTheme === 'light' ? 'streets' : 'dark';
    if (mapTheme !== targetStyle) {
      setMapTheme(targetStyle);
      mapThemeRef.current = targetStyle;
      if (mapInstanceRef.current && MAP_THEMES[targetStyle]) {
        mapInstanceRef.current.setStyle(MAP_THEMES[targetStyle].style);
      }
    }
  }, [actualTheme]);

  // Unified Overlay modal: Day's full jobs list & Travesía reordering
  const [showDayJobsOverlay, setShowDayJobsOverlay] = useState(false);
  const [overlayStatusFilter, setOverlayStatusFilter] = useState('ALL');
  const [hasOrderChanged, setHasOrderChanged] = useState(false);
  const [optimizationMode, setOptimizationMode] = useState('none'); // 'none' | 'nearest' | 'furthest'
  const originalManualListRef = useRef([]);

  // Live responsive orders state that updates in 0 ms during reordering
  const [liveOrders, setLiveOrders] = useState(orders);

  useEffect(() => {
    setLiveOrders(orders);
  }, [orders]);

  const activeOrders = useMemo(() => {
    const list = (liveOrders && liveOrders.length > 0) ? liveOrders : (orders || []);
    return [...list].sort((a, b) => {
      const orderA = Number(a.route_order) > 0 ? Number(a.route_order) : 9999;
      const orderB = Number(b.route_order) > 0 ? Number(b.route_order) : 9999;
      if (orderA !== orderB) return orderA - orderB;
      return (Number(a.id) || 0) - (Number(b.id) || 0);
    });
  }, [liveOrders, orders]);

  // Travesía Organizer & Reorder State
  const [tempOrdersList, setTempOrdersList] = useState([]);
  const [isSavingTrip, setIsSavingTrip] = useState(false);
  const [optimizedNotice, setOptimizedNotice] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [touchDragIndex, setTouchDragIndex] = useState(null);
  const [touchOverIndex, setTouchOverIndex] = useState(null);
  const touchStartYRef = useRef(null);
  const touchActiveIndexRef = useRef(null);

  // Keep tempOrdersList updated when orders prop changes and modal is closed
  useEffect(() => {
    if (!showDayJobsOverlay) {
      setTempOrdersList([...activeOrders]);
    }
  }, [activeOrders, showDayJobsOverlay]);

  // Route state
  const [activeRouteInfo, setActiveRouteInfo] = useState(null);
  const [availableRoutes, setAvailableRoutes] = useState([]);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
  const [showMoreActions, setShowMoreActions] = useState(false);

  // Multi-stop Travesía State (full day sequence route in light blue #38bdf8 + inter-stop times)
  const [travesiaLegs, setTravesiaLegs] = useState([]);
  const [travesiaSummary, setTravesiaSummary] = useState({ totalMiles: 0, totalMinutes: 0 });
  const travesiaAbortControllerRef = useRef(null);
  const travesiaGeometryRef = useRef(null);

  // Job On-Site Timers
  const [jobTimers, setJobTimers] = useState(() => {
    try {
      const saved = localStorage.getItem('xfinity_job_timers');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  // Default coordinate center: Skokie / Chicago
  const DEFAULT_LNG_LAT = [-87.734557, 42.033592];

  // Daily statistics
  const dayPending = activeOrders.filter(o => o.status === 'Pendiente');
  const dayCompleted = activeOrders.filter(o => o.status === 'Completado');
  const dayCancelled = activeOrders.filter(o => o.status === 'No Realizado');
  const dayEarnings = dayCompleted.reduce((sum, o) => sum + (parseFloat(o.rate_calculated) || 0), 0);
  const validOrders = activeOrders.filter(o => o.latitude && o.longitude);

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

  // 1. FAST LIVE GPS GEOLOCATION (Single gentle watcher, no redundant calls)
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
      (err) => console.warn('GPS Notice:', err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // 2. AUTOMATIC MAPBOX GEOCODING OF MISSING ORDERS
  useEffect(() => {
    const missing = activeOrders.filter(o => !o.latitude || !o.longitude);
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
  }, [activeOrders]);

  // Determine Origin Point ("Desde dónde estoy")
  const getOriginPoint = (targetOrder) => {
    if (userLocation && userLocation.lng && userLocation.lat) {
      return { coords: [userLocation.lng, userLocation.lat], label: 'GPS en vivo' };
    }
    const targetIdx = activeOrders.findIndex(o => o.id === targetOrder?.id);
    if (targetIdx > 0 && activeOrders[targetIdx - 1]?.latitude && activeOrders[targetIdx - 1]?.longitude) {
      return { 
        coords: [activeOrders[targetIdx - 1].longitude, activeOrders[targetIdx - 1].latitude], 
        label: `Parada ${targetIdx}` 
      };
    }
    const firstValid = activeOrders.find(o => o.latitude && o.longitude);
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
    if (!activeOrders || activeOrders.length === 0) return;
    const valid = activeOrders.filter(o => o.latitude && o.longitude);
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
  }, [activeOrders, userLocation?.lat, userLocation?.lng]);

  // Compute multi-stop sequence route for the whole day in light sky blue (#38bdf8)
  const updateTravesiaRoute = async (sequenceList) => {
    const list = sequenceList || activeOrders;
    if (!list || list.length === 0) {
      setTravesiaLegs([]);
      setTravesiaSummary({ totalMiles: 0, totalMinutes: 0 });
      travesiaGeometryRef.current = [];
      const map = mapInstanceRef.current;
      if (map && map.getSource('route-travesia')) {
        map.getSource('route-travesia').setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: [] }
        });
      }
      travesiaBadgeMarkersRef.current.forEach(m => m.remove());
      travesiaBadgeMarkersRef.current = [];
      return;
    }

    const validStops = list.filter(o => o.latitude && o.longitude);
    if (validStops.length < 2) {
      setTravesiaLegs([]);
      setTravesiaSummary({ totalMiles: 0, totalMinutes: 0 });
      travesiaGeometryRef.current = [];
      const map = mapInstanceRef.current;
      if (map && map.getSource('route-travesia')) {
        map.getSource('route-travesia').setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: [] }
        });
      }
      travesiaBadgeMarkersRef.current.forEach(m => m.remove());
      travesiaBadgeMarkersRef.current = [];
      return;
    }

    const coordsStr = validStops.map(o => `${Number(o.longitude).toFixed(5)},${Number(o.latitude).toFixed(5)}`).join(';');
    const cacheKey = `travesia:${coordsStr}`;

    if (routeCacheRef.current.has(cacheKey)) {
      const cached = routeCacheRef.current.get(cacheKey);
      setTravesiaLegs(cached.legs);
      setTravesiaSummary(cached.summary);
      travesiaGeometryRef.current = cached.coordinates;
      const map = mapInstanceRef.current;
      if (map && map.getSource('route-travesia')) {
        map.getSource('route-travesia').setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: cached.coordinates }
        });
      }
      if (map) {
        renderTravesiaLegBadges(map, cached.legs);
      }
      return;
    }

    if (travesiaAbortControllerRef.current) {
      travesiaAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    travesiaAbortControllerRef.current = controller;

    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsStr}?overview=full&geometries=geojson&access_token=${MAPBOX_ACCESS_TOKEN}`;
      const res = await fetch(url, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        if (data.routes && data.routes[0]) {
          const r = data.routes[0];
          const coordinates = r.geometry.coordinates;
          const totalMiles = r.distance / 1609.34;
          const totalMinutes = Math.max(1, Math.round(r.duration / 60));
          const legs = (r.legs || []).map((leg, idx) => ({
            fromOrder: validStops[idx],
            toOrder: validStops[idx + 1],
            fromIndex: idx,
            toIndex: idx + 1,
            miles: leg.distance / 1609.34,
            minutes: Math.max(1, Math.round(leg.duration / 60))
          }));

          const result = {
            coordinates,
            legs,
            summary: { totalMiles, totalMinutes }
          };

          routeCacheRef.current.set(cacheKey, result);
          setTravesiaLegs(legs);
          setTravesiaSummary({ totalMiles, totalMinutes });
          travesiaGeometryRef.current = coordinates;

          const map = mapInstanceRef.current;
          if (map && map.getSource('route-travesia')) {
            map.getSource('route-travesia').setData({
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates }
            });
          }
          if (map) {
            renderTravesiaLegBadges(map, legs);
          }
          return;
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.warn('Travesia directions note:', e.message);
      }
    }

    // Fallback: calculate estimated straight/road distance per leg
    let totalMilesFallback = 0;
    const fallbackCoordinates = validStops.map(o => [o.longitude, o.latitude]);
    const fallbackLegs = [];
    for (let i = 0; i < validStops.length - 1; i++) {
      const s1 = validStops[i];
      const s2 = validStops[i + 1];
      const miles = getEstimatedDrivingMiles(s1.latitude, s1.longitude, s2.latitude, s2.longitude) || 1.0;
      const minutes = Math.max(1, Math.round(miles * 2.2));
      totalMilesFallback += miles;
      fallbackLegs.push({
        fromOrder: s1,
        toOrder: s2,
        fromIndex: i,
        toIndex: i + 1,
        miles,
        minutes
      });
    }
    const fallbackSummary = {
      totalMiles: totalMilesFallback,
      totalMinutes: Math.max(1, Math.round(totalMilesFallback * 2.2))
    };
    setTravesiaLegs(fallbackLegs);
    setTravesiaSummary(fallbackSummary);
    travesiaGeometryRef.current = fallbackCoordinates;
    const map = mapInstanceRef.current;
    if (map && map.getSource('route-travesia')) {
      map.getSource('route-travesia').setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: fallbackCoordinates }
      });
    }
    if (map) {
      renderTravesiaLegBadges(map, fallbackLegs);
    }
  };

  // Render subtle floating badges on the map along each travesía leg (between consecutive stops)
  const renderTravesiaLegBadges = (map, legs) => {
    if (!map) return;
    // Clear previous travesía leg badges
    travesiaBadgeMarkersRef.current.forEach(m => m.remove());
    travesiaBadgeMarkersRef.current = [];

    if (!legs || legs.length === 0) return;

    legs.forEach((leg) => {
      const { fromOrder, toOrder, minutes, miles, fromIndex, toIndex } = leg;
      if (!fromOrder?.latitude || !fromOrder?.longitude || !toOrder?.latitude || !toOrder?.longitude) return;

      const midLng = (Number(fromOrder.longitude) + Number(toOrder.longitude)) / 2;
      const midLat = (Number(fromOrder.latitude) + Number(toOrder.latitude)) / 2;

      const legBadgeEl = document.createElement('div');
      legBadgeEl.className = 'apple-travesia-leg-badge';
      legBadgeEl.title = `De #${fromIndex + 1} a #${toIndex + 1}: ${minutes} min (~${miles.toFixed(1)} mi). Toca para seleccionar.`;
      legBadgeEl.innerHTML = `
        <span class="leg-time">+${minutes} min</span>
        <span class="leg-dot">•</span>
        <span class="leg-dist">${miles.toFixed(1)} mi</span>
      `;

      legBadgeEl.onclick = (e) => {
        e.stopPropagation();
        handleSelectJob(toOrder);
      };

      const legMarker = new mapboxgl.Marker({ element: legBadgeEl, anchor: 'center' })
        .setLngLat([midLng, midLat])
        .addTo(map);

      travesiaBadgeMarkersRef.current.push(legMarker);
    });
  };

  // Keep travesia route updated whenever activeOrders changes
  useEffect(() => {
    updateTravesiaRoute(activeOrders);
  }, [activeOrders]);

  // Helper to get driving time and distance for each stop in sequence
  const getLegInfoForOrder = (order, indexInList) => {
    if (!order) return null;
    if (indexInList === 0) {
      if (activeRouteInfo && String(selectedOrder?.id) === String(order.id)) {
        return {
          minutes: activeRouteInfo.minutes,
          miles: activeRouteInfo.miles,
          text: `A ${activeRouteInfo.minutes} min (~${activeRouteInfo.miles.toFixed(1)} mi) desde tu punto`,
          shortText: `A ${activeRouteInfo.minutes} min`,
          isFirst: true
        };
      }
      return {
        text: 'Punto de partida del día',
        shortText: 'Punto 1',
        isFirst: true
      };
    }

    const leg = travesiaLegs.find(l => String(l.toOrder?.id) === String(order.id)) || travesiaLegs[indexInList - 1];
    if (leg) {
      const prevStopNum = indexInList; // 1-based previous stop number
      return {
        minutes: leg.minutes,
        miles: leg.miles,
        prevStopNum,
        text: `🚗 +${leg.minutes} min (~${leg.miles.toFixed(1)} mi) de #${prevStopNum}`,
        shortText: `+${leg.minutes} min de #${prevStopNum}`,
        isFirst: false
      };
    }

    return null;
  };

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

    userHasPannedMapRef.current = false;
    setIsUserPanned(false);
    framedOrderIdRef.current = target.id;
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
        // Immediate guidance connection so map and HUD are NEVER stale or blank!
        const estMiles = getEstimatedDrivingMiles(startCoords[1], startCoords[0], destCoords[1], destCoords[0]) || 0.8;
        const estMinutes = Math.max(1, Math.round(estMiles * 2.2));
        setActiveRouteInfo({
          index: 0,
          coordinates: [startCoords, destCoords],
          miles: estMiles,
          minutes: estMinutes,
          summary: target.city || 'Calculando ruta...'
        });
        setAvailableRoutes([]);

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
    } else {
      setActiveRouteInfo(null);
      setAvailableRoutes([]);
    }
  };

  // NEXT / PREVIOUS STOP NAVIGATION
  const handleNextJob = () => {
    if (!activeOrders || activeOrders.length === 0) return;
    const currentIdx = selectedOrder ? activeOrders.findIndex(o => o.id === selectedOrder.id) : -1;
    const nextIdx = (currentIdx + 1) % activeOrders.length;
    handleSelectJob(activeOrders[nextIdx]);
  };

  const handlePrevJob = () => {
    if (!activeOrders || activeOrders.length === 0) return;
    const currentIdx = selectedOrder ? activeOrders.findIndex(o => o.id === selectedOrder.id) : 0;
    const prevIdx = (currentIdx - 1 + activeOrders.length) % activeOrders.length;
    handleSelectJob(activeOrders[prevIdx]);
  };

  // INITIALIZE / UPDATE SELECTION ON DAY OR TARGET CHANGE
  useEffect(() => {
    if (activeOrders.length === 0) {
      setSelectedOrder(null);
      setActiveRouteInfo(null);
      setAvailableRoutes([]);
      setTravesiaLegs([]);
      setTravesiaSummary({ totalMiles: 0, totalMinutes: 0 });

      // Clean all map polyline sources and badges immediately
      const map = mapInstanceRef.current;
      if (map) {
        if (map.getSource('route-nav')) {
          map.getSource('route-nav').setData({
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: [] }
          });
        }
        if (map.getSource('route-travesia')) {
          map.getSource('route-travesia').setData({
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: [] }
          });
        }
        routeBadgeMarkersRef.current.forEach(m => m.remove());
        routeBadgeMarkersRef.current = [];
        travesiaBadgeMarkersRef.current.forEach(m => m.remove());
        travesiaBadgeMarkersRef.current = [];
      }
      return;
    }

    if (targetFocusOrderId) {
      const match = activeOrders.find(o => o.id === targetFocusOrderId);
      if (match) {
        handleSelectJob(match);
        if (onClearTargetFocus) onClearTargetFocus();
        return;
      }
    }

    if (!selectedOrder || !activeOrders.some(o => o.id === selectedOrder.id)) {
      const firstPending = activeOrders.find(o => o.status === 'Pendiente');
      const initial = firstPending || activeOrders[0];
      handleSelectJob(initial);
    } else {
      const current = activeOrders.find(o => o.id === selectedOrder.id);
      if (current) {
        setSelectedOrder(current);
      }
    }
  }, [activeOrders, targetFocusOrderId]);

  // Apply Professional Dark Styling (visible high-contrast streets, emerald parks and deep blue water)
  const applyCustomMapStyling = (map) => {
    if (!map) return;
    const current = mapThemeRef.current;
    const isDark = current === 'dark' || current === 'apple_dark' || current === 'night';
    if (!isDark) return;

    try {
      // 1. Dark navy slate background (exact match with photo)
      if (map.getLayer('land')) {
        map.setPaintProperty('land', 'background-color', '#1b242f');
      }
      if (map.getLayer('background')) {
        map.setPaintProperty('background', 'background-color', '#1b242f');
      }

      // 2. High-contrast visible roads (clear slate-blue street grid)
      if (map.getLayer('road-simple')) {
        map.setPaintProperty('road-simple', 'line-color', [
          'match',
          ['get', 'class'],
          ['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link'],
          '#6a829e',
          ['secondary', 'secondary_link', 'tertiary', 'tertiary_link'],
          '#5a708a',
          ['street', 'street_limited'],
          '#425468',
          /* fallback / path / service */
          '#3a4a5c'
        ]);

        map.setPaintProperty('road-simple', 'line-width', [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          10, [
            'match',
            ['get', 'class'],
            ['motorway', 'trunk', 'primary'], 1.8,
            ['secondary', 'tertiary'], 1.2,
            0.8
          ],
          13, [
            'match',
            ['get', 'class'],
            ['motorway', 'trunk', 'primary'], 3.0,
            ['secondary', 'tertiary'], 2.2,
            ['street', 'street_limited'], 1.4,
            0.9
          ],
          16, [
            'match',
            ['get', 'class'],
            ['motorway', 'trunk', 'primary'], 9.0,
            ['secondary', 'tertiary'], 7.0,
            ['street', 'street_limited'], 5.0,
            3.0
          ]
        ]);
      }

      if (map.getLayer('bridge-simple')) {
        map.setPaintProperty('bridge-simple', 'line-color', [
          'match',
          ['get', 'class'],
          ['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link'],
          '#6a829e',
          ['secondary', 'secondary_link', 'tertiary', 'tertiary_link'],
          '#5a708a',
          '#425468'
        ]);
      }

      // 3. Vibrant rich forest green parks & golf clubs (e.g. Evanston Golf Club)
      if (map.getLayer('landuse')) {
        map.setPaintProperty('landuse', 'fill-color', [
          'match',
          ['get', 'class'],
          ['park', 'pitch', 'cemetery', 'national_park', 'grass', 'wood', 'scrub', 'golf', 'agriculture'],
          '#184533',
          '#1f2a37'
        ]);
        map.setPaintProperty('landuse', 'fill-opacity', 0.95);
      }
      if (map.getLayer('national-park')) {
        map.setPaintProperty('national-park', 'fill-color', '#184533');
        map.setPaintProperty('national-park', 'fill-opacity', 0.95);
      }

      // 4. Subtle dark building footprints
      if (map.getLayer('building')) {
        map.setPaintProperty('building', 'fill-color', '#1d2734');
        map.setPaintProperty('building', 'fill-outline-color', '#263445');
      }

      // 5. Deep navy water bodies
      if (map.getLayer('water')) {
        map.setPaintProperty('water', 'fill-color', '#142a3e');
      }

      // 6. Crisp white street labels with dark halo
      if (map.getLayer('road-label-simple')) {
        map.setPaintProperty('road-label-simple', 'text-color', '#ffffff');
        map.setPaintProperty('road-label-simple', 'text-halo-color', '#141d27');
        map.setPaintProperty('road-label-simple', 'text-halo-width', 2);
      }

      // 7. Natural labels with soft emerald green text (Evanston Golf Club)
      if (map.getLayer('natural-point-label')) {
        map.setPaintProperty('natural-point-label', 'text-color', '#4ade80');
        map.setPaintProperty('natural-point-label', 'text-halo-color', '#13281d');
        map.setPaintProperty('natural-point-label', 'text-halo-width', 1.5);
      }
      if (map.getLayer('natural-line-label')) {
        map.setPaintProperty('natural-line-label', 'text-color', '#4ade80');
        map.setPaintProperty('natural-line-label', 'text-halo-color', '#13281d');
        map.setPaintProperty('natural-line-label', 'text-halo-width', 1.5);
      }
      if (map.getLayer('poi-label')) {
        map.setPaintProperty('poi-label', 'text-color', '#cbd5e1');
        map.setPaintProperty('poi-label', 'text-halo-color', '#141d27');
        map.setPaintProperty('poi-label', 'text-halo-width', 1.5);
      }
    } catch (err) {
      console.warn('Map styling adjustment notice:', err);
    }
  };

  // Helper to attach route layers cleanly whenever a style is loaded
  const setupRouteLayers = (map) => {
    if (!map) return;

    // 1. Multi-stop Travesía Route Source & Layers (Light Sky Blue / Alternative Route connecting all stops in sequence)
    if (!map.getSource('route-travesia')) {
      map.addSource('route-travesia', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: travesiaGeometryRef.current || []
          }
        }
      });
    }

    if (!map.getLayer('travesia-glow-layer')) {
      map.addLayer({
        id: 'travesia-glow-layer',
        type: 'line',
        source: 'route-travesia',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#38bdf8',
          'line-width': 10,
          'line-opacity': 0.38,
          'line-blur': 2.5
        }
      });
    }

    if (!map.getLayer('travesia-core-layer')) {
      map.addLayer({
        id: 'travesia-core-layer',
        type: 'line',
        source: 'route-travesia',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#38bdf8',
          'line-width': 4.5,
          'line-opacity': 0.9
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

    // Re-feed saved travesia geometry if available
    if (travesiaGeometryRef.current && map.getSource('route-travesia')) {
      map.getSource('route-travesia').setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: travesiaGeometryRef.current }
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

    const activeKey = (mapTheme === 'apple_dark' || mapTheme === 'night') ? 'dark' : mapTheme;
    const initialStyleUrl = MAP_THEMES[activeKey]?.style || (actualTheme === 'light' ? MAP_THEMES.streets.style : MAP_THEMES.dark.style);

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: initialStyleUrl,
      center: initialCenter,
      zoom: 14.5,
      pitch: 45,
      bearing: 0,
      attributionControl: false
    });

    const handleUserInteraction = (e) => {
      // If user directly touched, dragged, or zoomed (not a programmatic camera event)
      if (!e || e.originalEvent) {
        userHasPannedMapRef.current = true;
        setIsUserPanned(true);
      }
    };

    map.on('dragstart', handleUserInteraction);
    map.on('zoomstart', handleUserInteraction);
    map.on('rotatestart', handleUserInteraction);
    map.on('pitchstart', handleUserInteraction);
    map.on('touchstart', handleUserInteraction);

    map.on('load', () => {
      setupRouteLayers(map);
    });

    map.on('style.load', () => {
      setupRouteLayers(map);
    });

    mapInstanceRef.current = map;

    return () => {
      map.off('dragstart', handleUserInteraction);
      map.off('zoomstart', handleUserInteraction);
      map.off('rotatestart', handleUserInteraction);
      map.off('pitchstart', handleUserInteraction);
      map.off('touchstart', handleUserInteraction);
      travesiaBadgeMarkersRef.current.forEach(m => m.remove());
      travesiaBadgeMarkersRef.current = [];
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Guarantee Mapbox GL canvas fits perfectly without cutoffs or distortion
  useEffect(() => {
    const handleResize = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.resize();
      }
    };
    window.addEventListener('resize', handleResize);
    const timer = setTimeout(handleResize, 150);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, []);

  // Handle Changing Map Theme
  const handleChangeTheme = (themeKey) => {
    setMapTheme(themeKey);
    mapThemeRef.current = themeKey;
    try {
      localStorage.setItem('xfinity_map_theme', themeKey);
      if (themeKey === 'satellite') {
        localStorage.setItem('xfinity_map_theme_locked', 'satellite');
      } else {
        localStorage.removeItem('xfinity_map_theme_locked');
      }
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

    travesiaBadgeMarkersRef.current.forEach(m => m.remove());
    travesiaBadgeMarkersRef.current = [];
    if (map && travesiaLegs && travesiaLegs.length > 0) {
      renderTravesiaLegBadges(map, travesiaLegs);
    }

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
    activeOrders.forEach((order, index) => {
      if (!order.latitude || !order.longitude) return;

      const orderLngLat = [order.longitude, order.latitude];
      bounds.extend(orderLngLat);

      const isCompleted = order.status === 'Completado';
      const isCancelled = order.status === 'No Realizado';
      const isTarget = String(activeTarget?.id) === String(order.id);
      const stopNumber = Number(order.route_order) > 0 ? Number(order.route_order) : (index + 1);

      const markerEl = document.createElement('div');

      if (isTarget) {
        // Destination Marker (con número de parada explícito)
        markerEl.className = 'apple-dest-badge cursor-pointer';
        markerEl.innerHTML = `
          <div class="apple-dest-icon flex items-center justify-center font-black text-sm font-mono shadow-xl">
            ${stopNumber}
          </div>
          <div class="apple-dest-pointer"></div>
          <div class="apple-dest-label font-bold text-center">
            <span>${order.address || 'Destino'}</span>
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
          <div class="w-7 h-7 rounded-full ${bg} border-2 border-white/90 text-white font-black text-xs flex items-center justify-center shadow-lg transition-transform group-hover:scale-125 font-mono">
            ${stopNumber}
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
          const durationFormatted = formatRouteDuration(currentActive.minutes);
          activeBadgeEl.innerHTML = `
            <div class="eta-main">${durationFormatted}</div>
            <div class="eta-sub">${currentActive.miles.toFixed(1)} mi • Más corta</div>
          `;

          const activeMarker = new mapboxgl.Marker({ element: activeBadgeEl, anchor: 'center' })
            .setLngLat(midPoint)
            .addTo(map);

          routeBadgeMarkersRef.current.push(activeMarker);
        }
      });
    } else {
      // Clear route lines and badges if no active destination for this date
      if (map.getSource('route-nav')) {
        map.getSource('route-nav').setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: [] }
        });
      }
      if (map.getSource('route-travesia')) {
        map.getSource('route-travesia').setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: [] }
        });
      }
      setActiveRouteInfo(null);
      setAvailableRoutes([]);
      setTravesiaLegs([]);
      setTravesiaSummary({ totalMiles: 0, totalMinutes: 0 });
    }

    // Camera Framing with 3D perspective - ONLY when NOT in free exploration and order target changed or initial load
    const isNewOrderTarget = framedOrderIdRef.current !== activeTarget?.id;
    const shouldFrameCamera = !userHasPannedMapRef.current && isNewOrderTarget;

    if (shouldFrameCamera) {
      framedOrderIdRef.current = activeTarget?.id;
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
      } else if (startCoords) {
        map.flyTo({
          center: startCoords,
          zoom: 13,
          pitch: is3DMode ? 45 : 0,
          essential: true
        });
      }
    }
  }, [activeOrders, selectedOrder?.id, selectedOrder?.route_order, selectedOrder?.latitude, selectedOrder?.longitude, is3DMode, mapTheme, selectedRouteIdx, Boolean(userLocation)]);

  // Smoothly move technician GPS vehicle puck on position updates without re-creating markers or moving camera
  useEffect(() => {
    if (userMarkerRef.current && userLocation?.lng && userLocation?.lat) {
      userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
    }
  }, [userLocation?.lat, userLocation?.lng]);

  // Center on current technician location
  const handleCenterOnMe = () => {
    userHasPannedMapRef.current = false;
    setIsUserPanned(false);
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
    userHasPannedMapRef.current = false;
    setIsUserPanned(false);
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
        duration: 800,
        maxZoom: 16
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

  // OPEN UNIFIED DAY JOBS & TRAVESÍA MODAL
  const handleOpenDayJobsModal = () => {
    setTempOrdersList([...activeOrders]);
    originalManualListRef.current = [...activeOrders];
    setOptimizationMode('none');
    setHasOrderChanged(false);
    setOptimizedNotice(null);
    setDragIndex(null);
    setDragOverIndex(null);
    setTouchDragIndex(null);
    setTouchOverIndex(null);
    setShowDayJobsOverlay(true);
  };

  // LIVE APPLY & PERSIST SEQUENCE TO LIVE APP AND BACKEND
  const applyOrdersSequenceLive = async (newSequenceList) => {
    if (!newSequenceList || newSequenceList.length === 0) return;
    const orderedIds = newSequenceList.map(o => o.id);
    const orderMap = new Map();
    orderedIds.forEach((id, idx) => {
      orderMap.set(String(id), idx + 1);
      orderMap.set(Number(id), idx + 1);
    });

    // 1. Instantly update parent React state in App.jsx (0 ms instant re-sort in TodayView & map)
    if (onUpdateOrders) {
      onUpdateOrders(prevOrders => {
        const updated = prevOrders.map(item => {
          const newOrder = orderMap.get(item.id) ?? orderMap.get(String(item.id)) ?? orderMap.get(Number(item.id));
          if (newOrder != null) {
            return { ...item, route_order: newOrder };
          }
          return item;
        });
        return [...updated];
      });
    }

    // 2. Instantly update localStorage cache
    try {
      const cachedStr = localStorage.getItem('xfinity_cached_orders');
      if (cachedStr) {
        const cachedOrders = JSON.parse(cachedStr);
        const updatedCached = cachedOrders.map(item => {
          const newOrder = orderMap.get(item.id) ?? orderMap.get(String(item.id)) ?? orderMap.get(Number(item.id));
          if (newOrder != null) {
            return { ...item, route_order: newOrder };
          }
          return item;
        });
        localStorage.setItem('xfinity_cached_orders', JSON.stringify(updatedCached));
      }
    } catch (e) {
      console.warn('Could not update localStorage cache:', e);
    }

    // 3. Keep selected order updated with its new position
    if (selectedOrder) {
      const refreshed = newSequenceList.find(o => String(o.id) === String(selectedOrder.id));
      if (refreshed) {
        const newOrder = orderMap.get(refreshed.id) ?? orderMap.get(String(refreshed.id));
        setSelectedOrder(prev => ({ ...prev, ...refreshed, route_order: newOrder || prev.route_order }));
      }
    }

    // 4. Invalidate directions route cache so polyline re-draws for new sequence
    routeCacheRef.current.clear();

    // 5. Instantly recalculate & draw the new travesía line and leg times!
    updateTravesiaRoute(newSequenceList);

    // 6. Persist to server and await so backend SQLite writes before any refresh
    try {
      const res = await fetch('/api/orders/reorder-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          orderedIds: orderedIds.map(Number),
          orders: newSequenceList.map(o => ({ id: o.id, job_id: o.job_id }))
        })
      });
      if (!res.ok) {
        console.warn('reorder-route returned status:', res.status);
      }
    } catch (e) {
      console.warn('Fetch reorder notice:', e);
    }
  };

  // REORDER HELPER FOR BOTH DRAG & DROP AND BUTTONS
  const reorderTripList = async (fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= tempOrdersList.length || toIndex >= tempOrdersList.length) return;
    const next = [...tempOrdersList];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);

    // Explicitly update route_order property on each item so all components reflect the 1-based order
    const updatedSequence = next.map((ord, idx) => ({
      ...ord,
      route_order: idx + 1
    }));

    setTempOrdersList(updatedSequence);
    setLiveOrders(updatedSequence);
    setHasOrderChanged(true);
    setOptimizationMode('none');
    setOptimizedNotice(null);

    // Apply live immediately to live map and order indicators!
    await applyOrdersSequenceLive(updatedSequence);
  };

  // MOVE STOP UP IN TRAVESÍA (Callable from overlay or map drawer)
  const handleMoveStopUp = async (orderIdOrIndex) => {
    const list = tempOrdersList.length > 0 ? tempOrdersList : activeOrders;
    let fromIndex = list.findIndex(o => String(o.id) === String(orderIdOrIndex));
    if (fromIndex === -1 && typeof orderIdOrIndex === 'number') fromIndex = orderIdOrIndex;
    if (fromIndex <= 0 || fromIndex >= list.length) return;

    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(fromIndex - 1, 0, moved);
    const updatedSequence = next.map((ord, idx) => ({
      ...ord,
      route_order: idx + 1
    }));

    setTempOrdersList(updatedSequence);
    setLiveOrders(updatedSequence);
    setHasOrderChanged(true);
    setOptimizationMode('none');
    setOptimizedNotice(null);
    await applyOrdersSequenceLive(updatedSequence);
  };

  // MOVE STOP DOWN IN TRAVESÍA (Callable from overlay or map drawer)
  const handleMoveStopDown = async (orderIdOrIndex) => {
    const list = tempOrdersList.length > 0 ? tempOrdersList : activeOrders;
    let fromIndex = list.findIndex(o => String(o.id) === String(orderIdOrIndex));
    if (fromIndex === -1 && typeof orderIdOrIndex === 'number') fromIndex = orderIdOrIndex;
    if (fromIndex < 0 || fromIndex >= list.length - 1) return;

    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(fromIndex + 1, 0, moved);
    const updatedSequence = next.map((ord, idx) => ({
      ...ord,
      route_order: idx + 1
    }));

    setTempOrdersList(updatedSequence);
    setLiveOrders(updatedSequence);
    setHasOrderChanged(true);
    setOptimizationMode('none');
    setOptimizedNotice(null);
    await applyOrdersSequenceLive(updatedSequence);
  };

  // MOVE DIRECTLY TO TARGET POSITION (1-based, e.g. picking "1" or "4")
  const handleMoveToPosition = async (orderIdOrIndex, targetPosition1Based) => {
    let fromIndex = tempOrdersList.findIndex(o => String(o.id) === String(orderIdOrIndex));
    if (fromIndex === -1 && typeof orderIdOrIndex === 'number') fromIndex = orderIdOrIndex;
    if (fromIndex === -1) return;
    const toIndex = parseInt(targetPosition1Based, 10) - 1;
    if (isNaN(toIndex) || toIndex < 0 || toIndex >= tempOrdersList.length || toIndex === fromIndex) return;
    await reorderTripList(fromIndex, toIndex);
  };

  // HTML5 DESKTOP DRAG & DROP HANDLERS
  const handleDragStart = (e, index) => {
    setDragIndex(index);
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    } catch (err) {}
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch (err) {}
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== targetIndex) {
      reorderTripList(dragIndex, targetIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // MOBILE TOUCH-DRAG HANDLERS
  const handleTouchStart = (e, index) => {
    touchStartYRef.current = e.touches[0].clientY;
    touchActiveIndexRef.current = index;
    setTouchDragIndex(index);
    setTouchOverIndex(index);
  };

  const handleTouchMove = (e) => {
    if (touchActiveIndexRef.current === null) return;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const rowEl = el ? el.closest('[data-stop-idx]') : null;
    if (rowEl) {
      const targetIdx = parseInt(rowEl.getAttribute('data-stop-idx'), 10);
      if (!isNaN(targetIdx) && targetIdx !== touchOverIndex) {
        setTouchOverIndex(targetIdx);
      }
    }
  };

  const handleTouchEnd = () => {
    if (touchActiveIndexRef.current !== null && touchOverIndex !== null && touchActiveIndexRef.current !== touchOverIndex) {
      reorderTripList(touchActiveIndexRef.current, touchOverIndex);
    }
    touchStartYRef.current = null;
    touchActiveIndexRef.current = null;
    setTouchDragIndex(null);
    setTouchOverIndex(null);
  };

  // TOGGLE AUTO-OPTIMIZATION: NEAREST FIRST VS FURTHEST FIRST OR RETURN TO MANUAL
  const handleToggleOptimization = async (targetMode) => {
    // If the clicked optimization mode is already active, DESELECT IT and revert to manual
    if (optimizationMode === targetMode) {
      setOptimizationMode('none');
      setOptimizedNotice(null);
      if (originalManualListRef.current && originalManualListRef.current.length > 0) {
        setTempOrdersList([...originalManualListRef.current]);
        setLiveOrders([...originalManualListRef.current]);
        await applyOrdersSequenceLive(originalManualListRef.current);
      }
      return;
    }

    // Save initial manual order if switching from 'none'
    if (optimizationMode === 'none') {
      originalManualListRef.current = [...tempOrdersList];
    }

    const origin = userLocation || { lat: DEFAULT_LNG_LAT[1], lng: DEFAULT_LNG_LAT[0] };
    const beforeMiles = calculateTotalTripMiles(tempOrdersList, origin);

    let newSequence;
    if (targetMode === 'nearest') {
      // 1. Ruta más corta / Más cercano primero (TSP Nearest-Neighbor)
      newSequence = optimizeStopsSequence(tempOrdersList, origin);
    } else {
      // 2. Ruta Inversa / Más lejano primero (del más distante al más cercano)
      const nearestSeq = optimizeStopsSequence(tempOrdersList, origin);
      const valid = nearestSeq.filter(o => o.latitude && o.longitude);
      const invalid = nearestSeq.filter(o => !o.latitude || !o.longitude);
      newSequence = [...valid.reverse(), ...invalid];
    }

    const afterMiles = calculateTotalTripMiles(newSequence, origin);
    const saved = Math.max(0, beforeMiles - afterMiles);

    setOptimizationMode(targetMode);
    setTempOrdersList(newSequence);
    setLiveOrders(newSequence);
    setHasOrderChanged(true);
    setOptimizedNotice({
      mode: targetMode,
      savedMiles: saved.toFixed(1),
      totalMiles: afterMiles.toFixed(1),
      savedMinutes: Math.round(saved * 2.2)
    });

    // Apply live immediately to live map and state!
    await applyOrdersSequenceLive(newSequence);
  };

  const handleAutoOptimizeTrip = () => handleToggleOptimization('nearest');

  // SAVE AND APPLY REORDERED TRAVESÍA
  const handleSaveTripOrder = async () => {
    if (tempOrdersList.length === 0) return;
    setIsSavingTrip(true);
    try {
      const finalSequence = tempOrdersList.map((ord, idx) => ({
        ...ord,
        route_order: idx + 1
      }));
      setLiveOrders(finalSequence);
      await applyOrdersSequenceLive(finalSequence);
      if (onOrderUpdated) await onOrderUpdated();
      setHasOrderChanged(false);
      setShowDayJobsOverlay(false);

      // Keep or refresh selected order with its new sequence position
      if (selectedOrder) {
        const matchingCurrent = finalSequence.find(o => String(o.id) === String(selectedOrder.id));
        if (matchingCurrent) {
          handleSelectJob(matchingCurrent);
        } else if (finalSequence[0]) {
          handleSelectJob(finalSequence[0]);
        }
      } else if (finalSequence[0]) {
        handleSelectJob(finalSequence[0]);
      }
    } catch (err) {
      console.error('Error guardando travesía:', err);
      if (onOrderUpdated) await onOrderUpdated();
      setHasOrderChanged(false);
      setShowDayJobsOverlay(false);
      if (tempOrdersList[0]) {
        handleSelectJob(tempOrdersList[0]);
      }
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

  const selectedIndex = selectedOrder ? activeOrders.findIndex(o => String(o.id) === String(selectedOrder.id)) : 0;
  const currentStopNumber = (selectedOrder && Number(selectedOrder.route_order) > 0) ? Number(selectedOrder.route_order) : (selectedIndex + 1);
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
  const hasDrivewayBore = Boolean(selectedOrder?.bore_type && selectedOrder.bore_type !== 'N' && (selectedOrder.bore_type.includes('DW') || selectedOrder.bore_type.length > 0));
  const isCallFirst = Boolean(selectedOrder && (selectedOrder.call_first === 1 || selectedOrder.call_first === true || (typeof selectedOrder.raw_notes === 'string' && /callfirst/i.test(selectedOrder.raw_notes))));

  const tripMiles = useMemo(() => {
    if (activeRouteInfo?.miles) return `${activeRouteInfo.miles.toFixed(1)} mi`;
    if (selectedOrder?.latitude && selectedOrder?.longitude) {
      const { coords } = getOriginPoint(selectedOrder);
      if (coords && coords[0] && coords[1]) {
        return `${getEstimatedDrivingMiles(coords[1], coords[0], selectedOrder.latitude, selectedOrder.longitude).toFixed(1)} mi`;
      }
    }
    return '1.4 mi';
  }, [activeRouteInfo?.miles, selectedOrder, userLocation, activeOrders]);

  const tripMinutes = useMemo(() => {
    if (activeRouteInfo?.minutes) return formatRouteDuration(activeRouteInfo.minutes, true);
    const numMiles = parseFloat(tripMiles) || 1.4;
    return formatRouteDuration(Math.max(1, Math.round(numMiles * 2.2)), true);
  }, [activeRouteInfo?.minutes, tripMiles]);

  const tripSummary = activeRouteInfo?.summary || selectedOrder?.city || 'Skokie';
  const techInitial = selectedOrder?.tech_id ? selectedOrder.tech_id.trim().charAt(0).toUpperCase() : 'J';

  const formattedHudDate = useMemo(() => {
    if (!activeDate) return '';
    const norm = normalizeDateStr(activeDate);
    const parts = norm.split('-');
    if (parts.length !== 3) return activeDate;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    const date = new Date(y, m - 1, d, 12, 0, 0);
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${days[date.getDay()]}, ${d} ${months[date.getMonth()]} ${y}`;
  }, [activeDate]);

  const originInfo = useMemo(() => getOriginPoint(selectedOrder), [selectedOrder, userLocation, orders]);

  return (
    <div className="relative w-full h-full rounded-2xl sm:rounded-3xl overflow-hidden border border-[#232f3e] bg-[#121a24] shadow-2xl flex flex-col select-none">
      
      {/* 1. MAPBOX GL 3D VECTOR CANVAS */}
      <div 
        ref={mapContainerRef} 
        className="absolute inset-0 w-full h-full z-0 mapbox-3d-canvas" 
      />

      {/* 2. TOP HUD: PREMIUM COCKPIT DATE & BALANCE PILL + ACTION BUTTONS */}
      <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between pointer-events-none gap-2">
        {/* Fixed-Height Linear Date Selector Pill */}
        <div className="pointer-events-auto bg-[#0f1722]/95 backdrop-blur-2xl border border-white/10 rounded-2xl px-1 sm:px-1.5 h-9 shadow-xl flex items-center gap-1 select-none shrink-0">
          {/* Previous Day Chevron */}
          <button
            type="button"
            onClick={() => onShiftDay(-1)}
            className="w-6 h-7 flex items-center justify-center hover:bg-white/10 text-slate-300 hover:text-white rounded-lg transition active:scale-90 text-sm font-black shrink-0 cursor-pointer"
            title="Día anterior"
          >
            ‹
          </button>
          
          {/* Center Date & Today Indicator (Single Line, Never Shifts) */}
          <div 
            className="flex items-center gap-1.5 px-1 cursor-pointer"
            onClick={() => {
              if (dateInputRef.current) {
                if (typeof dateInputRef.current.showPicker === 'function') {
                  dateInputRef.current.showPicker();
                } else {
                  dateInputRef.current.focus();
                }
              }
            }}
            title="Toca para seleccionar otra fecha en el calendario"
          >
            {/* Hidden native date input for direct calendar selection */}
            <input
              ref={dateInputRef}
              type="date"
              value={activeDate || ''}
              onChange={(e) => {
                if (e.target.value && onSelectDate) onSelectDate(e.target.value);
              }}
              className="sr-only pointer-events-none"
              tabIndex={-1}
            />

            <span className="text-xs font-black text-white truncate tracking-tight font-mono">
              {formattedHudDate}
            </span>

            {isViewingToday ? (
              <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded-full shrink-0 select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Hoy</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onGoToToday(); }}
                className="inline-flex items-center text-[9px] font-black text-amber-300 hover:text-amber-200 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 px-1.5 py-0.5 rounded-full transition active:scale-90 shrink-0 cursor-pointer shadow-xs select-none"
                title="Volver a la fecha de hoy"
              >
                <span>Ir hoy</span>
              </button>
            )}
          </div>

          {/* Next Day Chevron */}
          <button
            type="button"
            onClick={() => onShiftDay(1)}
            className="w-6 h-7 flex items-center justify-center hover:bg-white/10 text-slate-300 hover:text-white rounded-lg transition active:scale-90 text-sm font-black shrink-0 cursor-pointer"
            title="Día siguiente"
          >
            ›
          </button>
        </div>

        {/* Actions: [+] & [Travesía / Lista de Trabajos] & [Saldo Diario] */}
        <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onOpenAddJob}
            className="w-9 h-9 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-md shadow-cyan-500/30 active:scale-95 transition-all flex items-center justify-center border border-white/20 outline-none focus:outline-none select-none cursor-pointer"
            title="Añadir nuevo trabajo (+)"
          >
            <Plus className="h-4.5 w-4.5 stroke-[3]" />
          </button>

          <button
            type="button"
            onClick={handleOpenDayJobsModal}
            className="w-9 h-9 rounded-2xl bg-[#0f1722]/95 backdrop-blur-2xl hover:bg-cyan-500/10 text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 shadow-xl active:scale-95 transition flex items-center justify-center cursor-pointer"
            title="Organizar travesía y lista de trabajos del día"
          >
            <Route className="h-4 w-4 stroke-[2.3]" />
          </button>

          {/* Saldo Diario / Ganancia del Día */}
          <div
            onClick={handleOpenDayJobsModal}
            className="h-9 px-2 sm:px-2.5 rounded-2xl bg-[#0f1722]/95 backdrop-blur-2xl border border-emerald-500/30 hover:border-emerald-500/60 shadow-xl active:scale-95 transition flex items-center gap-1.5 cursor-pointer select-none group"
            title={`Saldo del día (${dayCompleted.length} completados): $${dayEarnings.toFixed(2)}. Toca para ver travesía y lista.`}
          >
            <div className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-[10.5px] font-black shrink-0 font-mono">
              $
            </div>
            <div className="flex flex-col justify-center leading-none">
              <span className="text-[7.5px] sm:text-[8px] uppercase tracking-wider text-slate-400 font-bold group-hover:text-emerald-400/80 transition">
                {isViewingToday ? 'Hoy' : 'Total'}
              </span>
              <span className="text-xs sm:text-[13px] font-black font-mono text-emerald-400 tracking-tight">
                ${dayEarnings % 1 === 0 ? dayEarnings.toFixed(0) : dayEarnings.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. RIGHT FLOATING CONTROLS: THEME (TOP) + 3D/2D (BELOW) + CENTRAR EN RUTA + CENTRAR EN GPS */}
      <div className="absolute right-3 top-20 z-20 flex flex-col gap-2 pointer-events-auto">
        {/* 1. Toggle Theme Popover (Top) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowThemePicker(prev => !prev)}
            className="w-10 h-10 rounded-full bg-[#16202c]/90 hover:bg-[#1e2b3b] text-slate-300 hover:text-white backdrop-blur-xl border border-white/15 flex items-center justify-center shadow-lg active:scale-95 transition cursor-pointer"
            title="Cambiar estilo de mapa"
          >
            <Layers className="h-4 w-4" />
          </button>

          {showThemePicker && (
            <div className="absolute right-12 top-0 bg-[#16202c]/98 backdrop-blur-2xl border border-white/15 rounded-2xl p-2 shadow-2xl flex flex-col gap-1 w-48 z-50 animate-in fade-in">
              <span className="text-[10px] font-black uppercase text-slate-400 px-2 py-0.5">
                Estilo de Mapa
              </span>
              {Object.entries(MAP_THEMES).map(([key, t]) => {
                const IconComponent = t.icon;
                const active = mapTheme === key || (key === 'dark' && (mapTheme === 'apple_dark' || mapTheme === 'night'));
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleChangeTheme(key)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left transition cursor-pointer ${
                      active ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 font-bold' : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <IconComponent className="h-3.5 w-3.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold leading-tight">{t.name}</div>
                      <div className={`text-[9px] truncate ${active ? 'text-cyan-400/80' : 'text-slate-400'}`}>
                        {t.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. Toggle 3D / 2D Perspective (Below Theme) */}
        <button
          type="button"
          onClick={toggle3DView}
          className="w-10 h-10 rounded-full bg-[#16202c]/90 hover:bg-[#1e2b3b] backdrop-blur-xl border border-white/15 flex items-center justify-center shadow-lg active:scale-95 transition cursor-pointer select-none"
          title={is3DMode ? 'Modo 3D Activo (Toca para vista 2D)' : 'Modo 2D Activo (Toca para perspectiva 3D)'}
        >
          <span className={`text-[11px] transition-colors ${
            is3DMode 
              ? 'text-cyan-400 font-black drop-shadow-[0_0_8px_rgba(34,211,238,0.7)]' 
              : 'text-slate-300 font-bold'
          }`}>
            {is3DMode ? '3D' : '2D'}
          </span>
        </button>

        {/* Recenter on Route Overview */}
        <button
          type="button"
          onClick={handleCenterOnRoute}
          className="w-10 h-10 rounded-full bg-[#16202c]/90 hover:bg-[#1e2b3b] backdrop-blur-xl border border-white/15 flex items-center justify-center shadow-lg active:scale-95 transition cursor-pointer select-none"
          title={!isUserPanned ? "Modo Travesía activo (Centrado)" : "Enfocar ruta de travesía"}
        >
          <Car className={`h-4.5 w-4.5 transition-all ${
            !isUserPanned 
              ? 'text-sky-400 dark:text-cyan-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]' 
              : 'text-slate-300'
          }`} />
        </button>

        {/* Recenter on Live Tech GPS */}
        <button
          type="button"
          onClick={handleCenterOnMe}
          className="w-10 h-10 rounded-full bg-[#16202c]/90 backdrop-blur-xl border border-white/15 text-[#007AFF] hover:text-blue-400 flex items-center justify-center shadow-lg active:scale-95 transition cursor-pointer"
          title="Centrar en mi ubicación GPS"
        >
          <Navigation className="h-4 w-4 fill-[#007AFF]/25" />
        </button>
      </div>

      {/* 5. BOTTOM SLIDING DRAWER: REFINED ACTIVE JOB CARD */}
      <div 
        className={`absolute bottom-0 left-0 right-0 z-30 bg-[#0f1722]/96 backdrop-blur-2xl rounded-t-[28px] border-t border-white/10 shadow-[0_-8px_32px_rgba(0,0,0,0.6)] transition-all duration-300 flex flex-col ${
          drawerState === 'expanded' ? 'h-[75%]' : 'min-h-[195px] sm:min-h-[205px] pb-2'
        }`}
      >
        {/* Grabber Handle */}
        <div 
          onClick={() => setDrawerState(prev => prev === 'peek' ? 'expanded' : 'peek')}
          className="w-full pt-2.5 pb-1 flex flex-col items-center justify-center cursor-pointer select-none"
        >
          <div className="w-12 h-1 rounded-full bg-slate-600/50 hover:bg-slate-400 transition" />
        </div>

        {selectedOrder ? (
          <div className="flex-1 flex flex-col justify-between overflow-hidden px-3.5 pb-3">
            
            {/* ROW 1: TOP BAR WITH ACTION/PHONE + [ ← PARADA X DE Y → ] + EXPAND */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              {/* Left Action: Circular GPS Navigation Button */}
              <div className="flex items-center gap-1.5 justify-start">
                <a
                  href={getNavUrl(selectedOrder)}
                  target="_blank"
                  rel="noreferrer"
                  className="w-9 h-9 rounded-full bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-cyan-400 hover:text-cyan-300 flex items-center justify-center transition active:scale-95 shadow-sm"
                  title="Abrir navegación GPS (Google Maps / Apple Maps)"
                >
                  <Navigation className="h-4 w-4 fill-cyan-400/20 text-cyan-400" />
                </a>
                {selectedOrder.phone && (
                  <a
                    href={`tel:${selectedOrder.phone}`}
                    className="w-9 h-9 rounded-full bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center transition active:scale-95 shadow-sm"
                    title={`Llamar: ${selectedOrder.phone}`}
                  >
                    <Phone className="h-4 w-4 text-cyan-400" />
                  </a>
                )}
              </div>

              {/* Center: Chevrons + Vibrant Pill Badge (PARADA X DE Y) */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handlePrevJob(); }}
                  className="p-1 text-slate-400 hover:text-white transition active:scale-90"
                  title="Trabajo anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <div 
                  onClick={() => setDrawerState(prev => prev === 'peek' ? 'expanded' : 'peek')}
                  className="px-3.5 py-1 rounded-full bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border border-blue-500/25 text-[10px] font-black tracking-wider uppercase cursor-pointer transition select-none shadow-xs"
                >
                  PARADA {currentStopNumber} DE {activeOrders.length}
                </div>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleNextJob(); }}
                  className="p-1 text-slate-400 hover:text-white transition active:scale-90"
                  title="Siguiente trabajo"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Right Action: Circular Expand/Collapse Chevron Button */}
              <div className="w-9 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setDrawerState(prev => prev === 'peek' ? 'expanded' : 'peek')}
                  className="w-9 h-9 rounded-full bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center transition active:scale-95 shadow-sm"
                  title={drawerState === 'expanded' ? "Colapsar tarjeta" : "Ver detalles completos"}
                >
                  <ChevronUp className={`h-4 w-4 transition-transform duration-300 ${drawerState === 'expanded' ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {/* ROW 2: CENTERED ADDRESS */}
            <div 
              className="py-0.5 cursor-pointer group text-center"
              onClick={() => setDrawerState(prev => prev === 'peek' ? 'expanded' : 'peek')}
            >
              <h2 className="text-base sm:text-lg font-black text-white truncate leading-tight group-hover:text-cyan-400 transition">
                {selectedOrder.address || 'Sin dirección asignada'}
              </h2>
              <div className="flex items-center justify-center gap-1.5 mt-0.5 text-[11px] text-slate-400 font-medium truncate">
                <span>A {tripMiles} • {tripMinutes} ({tripSummary})</span>
              </div>
            </div>

            {/* ROW 3: NOTES & WORK SPECS CARD (STATUS ICON + SPECS + REMARKS + EDIT) */}
            <div className="bg-[#131b26] border border-white/8 rounded-2xl p-2.5 flex items-center justify-between gap-2.5 my-1">
              {/* Site / Parada Circle Badge */}
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 select-none transition-all shadow-sm bg-gradient-to-tr from-cyan-500/25 to-blue-600/25 text-cyan-300 border border-cyan-400/40 font-mono shadow-cyan-500/15"
                title={`Site / Parada #${currentStopNumber} de la jornada`}
              >
                {currentStopNumber}
              </div>

              {/* Center: Specs Summary & Notes */}
              <div 
                className="min-w-0 flex-1 cursor-pointer"
                onClick={() => onOpenEditModal(selectedOrder)}
                title="Toca para ver o editar información"
              >
                <div className="text-xs font-bold text-white truncate leading-tight flex items-center gap-1.5">
                  <span>{selectedOrder.drop_footage || 0} ft</span>
                  <span className="text-slate-500">•</span>
                  <span className="text-slate-300">{selectedOrder.cable_type || 'RG-6'}</span>
                  {hasDrivewayBore && (
                    <>
                      <span className="text-slate-500">•</span>
                      <span className="text-cyan-400 font-semibold">Driveway</span>
                    </>
                  )}
                  {isCallFirst && (
                    <>
                      <span className="text-slate-500">•</span>
                      <span className="text-amber-400 font-semibold">Llamar 1ro</span>
                    </>
                  )}
                </div>
                <p className="text-[10.5px] text-slate-400 truncate mt-0.5 font-medium">
                  {selectedRemark || (selectedOrder.raw_notes ? selectedOrder.raw_notes.slice(0, 45) : 'Agregar una nota o detalle...')}
                </p>
              </div>

              {/* Pencil Edit Icon */}
              <button
                type="button"
                onClick={() => onOpenEditModal(selectedOrder)}
                className="p-1.5 text-slate-400 hover:text-cyan-400 transition active:scale-90 shrink-0 rounded-lg hover:bg-white/5"
                title="Editar orden"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* ROW 4: BOTTOM CONTROL BAR (NO REALIZADO | $SALDO EN MEDIO | 3 BOTONES MILESTONES) */}
            <div className="flex items-center justify-between gap-2 pt-1 pb-0.5">
              {/* 1. Left: Estado del Trabajo (Pendiente / Completado / Por Compartir / Reportado / No Realizado) */}
              {isSelectedCancelled ? (
                <div
                  onClick={() => onOpenCancelDetail ? onOpenCancelDetail(selectedOrder) : null}
                  className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-xs cursor-pointer hover:bg-rose-500/30 transition shrink-0 active:scale-95"
                  title="Estado: No Realizado - Toca para ver motivo y constancia"
                >
                  <X className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>No Realizado</span>
                </div>
              ) : isSelectedCompleted && isSelectedShared ? (
                <div
                  className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-xs shrink-0 select-none"
                  title="Estado: Reportado y confirmado exitosamente"
                >
                  <CheckCheck className="h-3.5 w-3.5 stroke-[2.5] text-cyan-400" />
                  <span>Reportado</span>
                </div>
              ) : isSelectedCompleted ? (
                <div
                  onClick={() => onOpenShareModal(selectedOrder)}
                  className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 bg-cyan-500/25 text-cyan-300 border border-cyan-400 shadow-md shadow-cyan-500/30 animate-pulse cursor-pointer hover:bg-cyan-500/35 transition shrink-0 active:scale-95"
                  title="Estado: Por Compartir - Toca para compartir reporte"
                >
                  <Share2 className="h-3.5 w-3.5 stroke-[2.2] text-cyan-300" />
                  <span>Por Compartir</span>
                </div>
              ) : (
                <div
                  onClick={() => onOpenPhotos(selectedOrder)}
                  className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 bg-amber-500/15 text-amber-300 border border-amber-500/35 shadow-xs cursor-pointer hover:bg-amber-500/25 transition shrink-0 active:scale-95"
                  title="Estado: Pendiente - Toca para abrir fotos y comenzar"
                >
                  <Clock className="h-3.5 w-3.5 stroke-[2.5] text-amber-400" />
                  <span>Pendiente</span>
                </div>
              )}

              {/* 2. Center: Saldo prominently in neon green monospace */}
              <div 
                className="flex items-center justify-center cursor-pointer select-none"
                onClick={() => onOpenAdjustModal ? onOpenAdjustModal(selectedOrder) : null}
                title="Toca para ajustar tarifa"
              >
                <span className={`font-mono font-black text-xl sm:text-2xl tracking-tight transition hover:scale-105 ${
                  isSelectedCancelled
                    ? 'text-slate-500 line-through'
                    : 'text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.4)]'
                }`}>
                  ${selectedOrder.rate_calculated || 100}
                </span>
              </div>

              {/* 3. Right: Cápsula con los 3 botones (1. Iniciar/Fotos -> 2. Compartir -> 3. Reportado) */}
              <div 
                className={`flex items-center gap-1 rounded-full px-2 py-1 shadow-sm shrink-0 border transition-all ${
                  isSelectedCancelled
                    ? 'bg-rose-950/25 border-rose-500/25'
                    : 'bg-[#182332] border-white/10'
                }`}
                title={
                  isSelectedCancelled
                    ? 'Historial: Trabajo no realizado'
                    : isSelectedCompleted && isSelectedShared
                    ? 'Historial: Proceso completado y reportado'
                    : isSelectedCompleted
                    ? 'Historial: Trabajo completado (pendiente de compartir)'
                    : 'Historial: Trabajo pendiente'
                }
              >
                {/* 1. Paso Iniciar / Tirar Fotos de Evidencia */}
                {isSelectedCancelled ? (
                  <div 
                    className="p-1.5 rounded-full text-rose-400/30 select-none cursor-not-allowed"
                    title="Paso 1: Cancelado / No realizado"
                  >
                    <Camera className="h-4 w-4 stroke-[2.2]" />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenPhotos(selectedOrder)}
                    className={`p-1.5 rounded-full transition active:scale-90 cursor-pointer flex items-center justify-center ${
                      isSelectedCompleted
                        ? 'text-emerald-400 bg-emerald-500/20 border border-emerald-500/40 shadow-xs'
                        : activePhotosCount > 0
                        ? 'text-emerald-400 bg-emerald-500/15 border border-emerald-500/35 animate-pulse shadow-xs'
                        : 'text-cyan-300 bg-cyan-500/20 border border-cyan-400/80 shadow-md shadow-cyan-500/30 animate-pulse'
                    }`}
                    title={
                      isSelectedCompleted
                        ? 'Paso 1: Fotos listas y trabajo completado'
                        : activePhotosCount > 0
                        ? 'Fotos tomadas - Toca para agregar más o finalizar'
                        : 'Paso 1: Solicita fotos de evidencia. Toca para tomar fotos'
                    }
                  >
                    {isSelectedCompleted ? (
                      <Check className="h-4 w-4 stroke-[3]" />
                    ) : (
                      <Camera className="h-4 w-4 stroke-[2.2]" />
                    )}
                  </button>
                )}

                {/* 2. Paso Compartir por WhatsApp */}
                {isSelectedCancelled ? (
                  <div 
                    className="p-1.5 rounded-full text-rose-400/30 select-none cursor-not-allowed"
                    title="Paso 2: Cancelado / No realizado"
                  >
                    <Share2 className="h-4 w-4 stroke-[2.2]" />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenShareModal(selectedOrder)}
                    className={`p-1.5 rounded-full transition active:scale-90 cursor-pointer ${
                      isSelectedShared
                        ? 'text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 shadow-xs'
                        : isSelectedCompleted
                        ? 'text-cyan-300 bg-cyan-500/25 border border-cyan-400 shadow-md shadow-cyan-500/40 animate-pulse'
                        : 'text-slate-500/40 border border-transparent hover:text-slate-300'
                    }`}
                    title={
                      isSelectedShared
                        ? 'Paso 2: Compartido por WhatsApp (Hecho - Toca para volver a compartir)'
                        : isSelectedCompleted
                        ? 'Paso 2: ¡Trabajo completado! Toca para compartir reporte por WhatsApp'
                        : 'Paso 2: Compartir reporte (Se habilita al completar el trabajo)'
                    }
                  >
                    <Share2 className="h-4 w-4 stroke-[2.2]" />
                  </button>
                )}

                {/* 3. Paso Reportado / Confirmar Reportado (Dos palomitas) */}
                {isSelectedCancelled ? (
                  <div 
                    className="p-1.5 rounded-full text-rose-400/30 select-none cursor-not-allowed"
                    title="Paso 3: Cancelado / No realizado"
                  >
                    <CheckCheck className="h-4 w-4 stroke-[2.5]" />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (!isSelectedCompleted) {
                        onMarkCompleted(selectedOrder);
                      } else {
                        onOpenShareModal(selectedOrder);
                      }
                    }}
                    className={`p-1.5 rounded-full transition active:scale-90 ${
                      isSelectedCompleted && isSelectedShared
                        ? 'text-cyan-400 bg-cyan-500/20 border border-cyan-500/40 shadow-xs cursor-pointer'
                        : 'text-slate-500/30 border border-transparent cursor-default'
                    }`}
                    title={
                      isSelectedCompleted && isSelectedShared
                        ? 'Paso 3: ¡Reportado y confirmado exitosamente!'
                        : 'Paso 3: Se marca completo automáticamente al compartir el reporte'
                    }
                  >
                    <CheckCheck className="h-4 w-4 stroke-[2.5]" />
                  </button>
                )}
              </div>
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
                      Cola del Día ({activeOrders.length} trabajos)
                    </h3>
                  </div>

                  <div className="grid grid-cols-4 gap-1 bg-[#121922] p-1 rounded-2xl border border-white/5 text-[10px] font-bold text-center">
                    <button
                      onClick={() => setStatusFilter('ALL')}
                      className={`py-1.5 rounded-xl transition ${statusFilter === 'ALL' ? 'bg-[#007AFF] text-white shadow-sm font-black' : 'text-slate-400'}`}
                    >
                      Todos ({activeOrders.length})
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
                    {activeOrders
                      .filter(o => statusFilter === 'ALL' || o.status === statusFilter)
                      .map((ord, idx) => {
                        const isTarget = String(selectedOrder?.id) === String(ord.id);
                        const isCompleted = ord.status === 'Completado';
                        const isCancelled = ord.status === 'No Realizado';
                        const realStopNumber = Number(ord.route_order) > 0 ? Number(ord.route_order) : (activeOrders.findIndex(o => String(o.id) === String(ord.id)) + 1);
                        const stopIndex = activeOrders.findIndex(o => String(o.id) === String(ord.id));
                        const isFirstStop = stopIndex <= 0;
                        const isLastStop = stopIndex >= activeOrders.length - 1;
                        const legInfo = getLegInfoForOrder(ord, stopIndex >= 0 ? stopIndex : idx);

                        return (
                          <div
                            key={ord.id || idx}
                            onClick={() => handleSelectJob(ord)}
                            className={`p-3 rounded-2xl border cursor-pointer transition select-none flex items-center justify-between gap-2.5 ${
                              isTarget 
                                ? 'bg-[#007AFF]/20 border-[#007AFF]/80 shadow-md ring-1 ring-[#007AFF]/50'
                                : 'bg-[#1b2533] border-white/5 hover:border-white/15'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <span className={`w-6 h-6 rounded-full text-white font-black text-xs flex items-center justify-center font-mono shrink-0 ${
                                isCompleted ? 'bg-[#34C759]' : isCancelled ? 'bg-[#FF3B30]' : 'bg-[#007AFF]'
                              }`}>
                                {isCompleted ? '✓' : isCancelled ? '✕' : (realStopNumber > 0 ? realStopNumber : idx + 1)}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-bold text-white truncate leading-tight">
                                    {ord.address}
                                  </span>
                                  {ord.bore_type && ord.bore_type.includes('DW') && (
                                    <span className="text-[9px] bg-cyan-500/20 text-cyan-400 font-bold px-1.5 py-0.2 rounded-md shrink-0">
                                      DW
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5 font-mono truncate">
                                  <span>{ord.city || 'Skokie'}</span>
                                  <span>•</span>
                                  <span className="text-cyan-300 font-semibold">#{ord.job_id}</span>
                                  <span>•</span>
                                  <span>{ord.drop_footage || 0} ft</span>
                                </div>

                                {legInfo && !legInfo.isFirst && (
                                  <div className="mt-1 inline-flex items-center gap-1 text-[9.5px] font-bold text-sky-300 bg-sky-500/15 border border-sky-400/30 px-1.5 py-0.2 rounded-md">
                                    <Car className="h-2.5 w-2.5 text-sky-400 shrink-0" />
                                    <span>{legInfo.shortText}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
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

                              {/* Tactile Up/Down Buttons directly in Drawer */}
                              <div 
                                className="flex flex-col gap-0.5 shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  disabled={isFirstStop}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveStopUp(ord.id);
                                  }}
                                  className={`w-6 h-5 rounded-md flex items-center justify-center border text-[10px] font-bold transition ${
                                    isFirstStop
                                      ? 'opacity-20 border-slate-800 text-slate-600'
                                      : 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200 active:scale-90 cursor-pointer'
                                  }`}
                                  title="Subir parada en la ruta"
                                >
                                  <MoveUp className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  disabled={isLastStop}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveStopDown(ord.id);
                                  }}
                                  className={`w-6 h-5 rounded-md flex items-center justify-center border text-[10px] font-bold transition ${
                                    isLastStop
                                      ? 'opacity-20 border-slate-800 text-slate-600'
                                      : 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200 active:scale-90 cursor-pointer'
                                  }`}
                                  title="Bajar parada en la ruta"
                                >
                                  <MoveDown className="h-3 w-3" />
                                </button>
                              </div>
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
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-2xl text-xs font-bold shadow-md flex items-center gap-1.5 active:scale-95 transition"
            >
              <Plus className="h-4 w-4 stroke-[3]" />
              <span>Trabajo</span>
            </button>
          </div>
        )}
      </div>

      {/* 6. MODAL UNIFICADO: LISTA DE TRABAJOS Y ORGANIZADOR DE TRAVESÍA DEL DÍA */}
      {showDayJobsOverlay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in modal-overlay-safe"
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 0px) + 16px, 1.25rem)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 1.25rem)'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDayJobsOverlay(false);
          }}
        >
          <div className="bg-[#101722] border border-white/10 rounded-3xl max-w-sm sm:max-w-md w-full max-h-[78dvh] sm:max-h-[82dvh] modal-sheet-compact flex flex-col overflow-hidden shadow-2xl text-white">
            {/* Header */}
            <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-white dark:bg-slate-900/70 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shrink-0 shadow-md shadow-cyan-500/20">
                  <Route className="h-4 w-4 stroke-[2.5]" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white truncate">
                    Travesía y Trabajos del Día
                  </h3>
                  <p className="text-[10.5px] text-slate-600 dark:text-slate-400 font-semibold truncate">
                    {formatDateFriendly(activeDate)} • {tempOrdersList.length} {tempOrdersList.length === 1 ? 'parada' : 'paradas'}
                    {travesiaSummary.totalMinutes > 0 && ` • 🚗 ${formatRouteDuration(travesiaSummary.totalMinutes, false)} (${travesiaSummary.totalMiles.toFixed(1)} mi)`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDayJobsOverlay(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition cursor-pointer"
                title="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick KPI Bar with Travesía Summary */}
            <div className="grid grid-cols-3 gap-2 px-4 py-2.5 bg-[#0d141e] border-b border-white/5 shrink-0 text-center">
              <div className="bg-[#16202c] p-2 rounded-xl border border-white/5">
                <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
                  Total Estimado
                </span>
                <span className="text-sm font-black text-emerald-400 font-mono">
                  ${tempOrdersList.reduce((sum, o) => sum + (parseFloat(o.rate_calculated) || 0), 0).toFixed(0)}
                </span>
              </div>
              <div className="bg-[#16202c] p-2 rounded-xl border border-sky-500/25">
                <span className="text-[9px] uppercase tracking-wider text-sky-400 font-bold block">
                  Travesía Total
                </span>
                <span className="text-xs sm:text-[13px] font-black text-sky-300 font-mono truncate block">
                  {travesiaSummary.totalMinutes > 0 ? formatRouteDuration(travesiaSummary.totalMinutes, false) : 'Calculando...'}
                </span>
                <span className="text-[9.5px] text-slate-400 font-mono block mt-0.5">
                  {travesiaSummary.totalMiles > 0 ? `${travesiaSummary.totalMiles.toFixed(1)} mi` : '0 mi'}
                </span>
              </div>
              <div className="bg-[#16202c] p-2 rounded-xl border border-white/5">
                <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
                  Completados
                </span>
                <span className="text-sm font-black text-white font-mono">
                  {tempOrdersList.filter(o => o.status === 'Completado').length} / {tempOrdersList.length}
                </span>
              </div>
            </div>

            {/* Auto Optimize Shortest / Furthest Route Action Bar */}
            <div className="px-4 py-2.5 bg-[#0e1622] border-b border-white/5 shrink-0 space-y-2">
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold px-0.5">
                <span className="uppercase tracking-wider">Modo de Organización</span>
                <span className="font-mono text-cyan-400 font-bold">
                  {optimizationMode === 'nearest'
                    ? '⚡ Más cercano primero'
                    : optimizationMode === 'furthest'
                    ? '📍 Más lejano primero'
                    : '🖐️ Manual (Flechas o arrastrar)'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* Botón 1: Más cercano primero (Ruta más corta) */}
                <button
                  type="button"
                  onClick={() => handleToggleOptimization('nearest')}
                  className={`py-2 px-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm select-none ${
                    optimizationMode === 'nearest'
                      ? 'bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 text-white border border-cyan-400/50 shadow-cyan-500/25 ring-1 ring-cyan-400/40'
                      : 'bg-[#16202c] hover:bg-[#1e2a3a] text-slate-300 hover:text-white border border-white/10'
                  }`}
                  title="Organizar por la ruta más corta (del más cercano en adelante). Toca otra vez para deseleccionar y dejar manual."
                >
                  <Route className="h-3.5 w-3.5 stroke-[2.2] shrink-0 text-cyan-300" />
                  <span className="truncate">⚡ Más cercano</span>
                  {optimizationMode === 'nearest' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 ml-auto animate-pulse" />
                  )}
                </button>

                {/* Botón 2: Más lejano primero (Inversa / De largo a corto) */}
                <button
                  type="button"
                  onClick={() => handleToggleOptimization('furthest')}
                  className={`py-2 px-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm select-none ${
                    optimizationMode === 'furthest'
                      ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white border border-purple-400/50 shadow-purple-500/25 ring-1 ring-purple-400/40'
                      : 'bg-[#16202c] hover:bg-[#1e2a3a] text-slate-300 hover:text-white border border-white/10'
                  }`}
                  title="Organizar del más lejano/largo al más corto. Toca otra vez para deseleccionar y dejar manual."
                >
                  <ArrowUpDown className="h-3.5 w-3.5 stroke-[2.2] shrink-0 text-purple-300" />
                  <span className="truncate">📍 Más lejano</span>
                  {optimizationMode === 'furthest' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-300 shrink-0 ml-auto animate-pulse" />
                  )}
                </button>
              </div>

              {optimizedNotice && (
                <div className="p-2 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-[10.5px] text-emerald-300 font-bold flex items-center gap-2">
                  <CheckCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>
                    {optimizedNotice.mode === 'nearest'
                      ? `¡Ruta más corta organizada! Ahorras ~${optimizedNotice.savedMiles} mi (${formatRouteDuration(optimizedNotice.savedMinutes, true)}). Total: ${optimizedNotice.totalMiles} mi.`
                      : `¡Ruta inversa organizada! Comienzas por el punto más distante y terminas cerca de casa. Total: ${optimizedNotice.totalMiles} mi.`}
                  </span>
                </div>
              )}
            </div>

            {/* Status Filter Tabs */}
            <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/5 bg-[#101722] shrink-0 overflow-x-auto no-scrollbar">
              {[
                { id: 'ALL', label: `Todos (${tempOrdersList.length})` },
                { id: 'Pendiente', label: `Pendientes (${tempOrdersList.filter(o => o.status !== 'Completado' && o.status !== 'No Realizado').length})` },
                { id: 'Completado', label: `Completados (${tempOrdersList.filter(o => o.status === 'Completado').length})` },
                { id: 'No Realizado', label: `Cancelados (${tempOrdersList.filter(o => o.status === 'No Realizado').length})` },
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setOverlayStatusFilter(f.id)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition whitespace-nowrap cursor-pointer ${
                    overlayStatusFilter === f.id
                      ? 'bg-cyan-500 text-slate-950 shadow-sm'
                      : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Drag & Reorder Instruction Tip */}
            <div className="px-4 py-1.5 bg-[#0a0f16] border-b border-white/5 text-[9.5px] font-bold text-slate-400 flex items-center justify-between uppercase tracking-wider">
              <span>{overlayStatusFilter === 'ALL' ? 'Arrastra (⋮⋮) o usa ↑ / ↓ para ordenar' : 'Filtrando por estado'}</span>
              <span>Toca un trabajo para ver en mapa</span>
            </div>

            {/* Jobs List (Scrollable with Drag & Drop & Direct Tactile Position Control) */}
            <div 
              className="p-2.5 sm:p-3 space-y-2.5 overflow-y-auto flex-1 min-h-0 select-none scrollbar-none"
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {tempOrdersList
                .filter(o => {
                  if (overlayStatusFilter === 'ALL') return true;
                  if (overlayStatusFilter === 'Pendiente') return o.status !== 'Completado' && o.status !== 'No Realizado';
                  return o.status === overlayStatusFilter;
                })
                .map((ord, idx) => {
                  const isTarget = selectedOrder?.id === ord.id;
                  const isCompleted = ord.status === 'Completado';
                  const isCancelled = ord.status === 'No Realizado';
                  const isReported = ord.is_reported || ord.status === 'Reportado';
                  
                  const fullIdx = tempOrdersList.findIndex(x => String(x.id) === String(ord.id));
                  const stopNumber = (fullIdx >= 0 ? fullIdx : idx) + 1;
                  const isFirst = fullIdx === 0;
                  const isLast = fullIdx === tempOrdersList.length - 1;

                  const isBeingDragged = dragIndex === fullIdx || touchDragIndex === fullIdx;
                  const isDropTarget = (dragOverIndex === fullIdx && dragIndex !== fullIdx) || (touchOverIndex === fullIdx && touchDragIndex !== fullIdx);
                  const legInfo = getLegInfoForOrder(ord, fullIdx >= 0 ? fullIdx : idx);

                  return (
                    <div
                      key={ord.id || idx}
                      data-stop-idx={fullIdx}
                      onDragOver={(e) => handleDragOver(e, fullIdx)}
                      onDrop={(e) => handleDrop(e, fullIdx)}
                      onDragEnd={handleDragEnd}
                      className={`p-3 rounded-2xl border transition-all duration-150 select-none flex flex-col gap-2 ${
                        isBeingDragged
                          ? 'opacity-40 bg-cyan-950/40 border-cyan-500 scale-[0.98]'
                          : isDropTarget
                          ? 'bg-[#1e2d40] border-cyan-400 ring-2 ring-cyan-400/50 scale-[1.01]'
                          : isTarget
                          ? 'bg-[#007AFF]/20 border-[#007AFF]/70 shadow-lg ring-1 ring-[#007AFF]/40'
                          : 'bg-[#16202c]/90 border-white/5 hover:border-white/20 hover:bg-[#1a2634]'
                      }`}
                    >
                      {/* Top Row: Reorder Handle + Position Dropdown + Address Info + Rate & Move Buttons */}
                      <div className="flex items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                          {/* Tactile Drag Handle (Punticos para mover) */}
                          <div
                            draggable={overlayStatusFilter === 'ALL'}
                            onDragStart={(e) => handleDragStart(e, fullIdx)}
                            onTouchStart={(e) => {
                              e.stopPropagation();
                              handleTouchStart(e, fullIdx);
                            }}
                            className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-slate-500 hover:text-cyan-400 touch-none flex items-center justify-center rounded-lg hover:bg-white/5 transition shrink-0"
                            title="Mantén presionado para mover parada"
                          >
                            <GripVertical className="h-4 w-4 stroke-[2.5]" />
                          </div>

                          {/* Direct Position Selector Dropdown (Toca para elegir posición 1..N directamente) */}
                          <div
                            className="relative shrink-0 flex items-center justify-center"
                            title="Cambiar posición o número de parada directamente"
                          >
                            <select
                              value={stopNumber}
                              onChange={(e) => {
                                handleMoveToPosition(ord.id, e.target.value);
                              }}
                              className={`w-8 h-8 rounded-full font-black text-xs cursor-pointer transition shadow-sm font-mono flex items-center justify-center text-center appearance-none [text-align-last:center] focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                                isCompleted
                                  ? 'bg-emerald-500/25 text-emerald-400 border border-emerald-500/40 ring-1 ring-emerald-500/20'
                                  : isCancelled
                                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                                  : isTarget
                                  ? 'bg-[#007AFF] text-white border border-blue-400 ring-2 ring-blue-400/30'
                                  : 'bg-[#007AFF]/25 text-[#007AFF] border border-[#007AFF]/40 ring-1 ring-[#007AFF]/20'
                              }`}
                            >
                              {tempOrdersList.map((_, pIdx) => (
                                <option key={pIdx + 1} value={pIdx + 1} className="bg-slate-900 text-white font-bold">
                                  {pIdx + 1}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Job Details */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-white truncate leading-tight">
                                {ord.address}
                              </span>
                              {ord.bore_type && ord.bore_type.includes('DW') && (
                                <span className="text-[9px] bg-cyan-500/20 text-cyan-400 font-bold px-1.5 py-0.2 rounded-md shrink-0">
                                  DW
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] sm:text-[10.5px] text-slate-400 flex items-center gap-1.5 mt-0.5 truncate font-mono">
                              <span>{ord.city || 'Skokie'}</span>
                              <span>•</span>
                              <span className="text-cyan-300 font-semibold">#{ord.job_id}</span>
                              <span>•</span>
                              <span>{ord.drop_footage || 0} ft</span>
                              {ord.cable_type && (
                                <>
                                  <span>•</span>
                                  <span className="text-slate-300">{ord.cable_type}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right: Rate, Status Chip & Up/Down Move Controls */}
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right flex flex-col items-end">
                            <div className="text-xs font-mono font-black text-emerald-400">
                              ${ord.rate_calculated || 100}
                            </div>
                            <span className={`text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md mt-0.5 ${
                              isReported
                                ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                                : isCompleted
                                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                : isCancelled
                                ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}>
                              {isReported ? 'Reportado' : (ord.status || 'Pendiente')}
                            </span>
                          </div>

                          {/* Direct Tactile Up / Down Buttons */}
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleMoveStopUp(ord.id)}
                              disabled={isFirst}
                              className={`w-6 h-5 rounded-md flex items-center justify-center border text-[10px] font-bold transition ${
                                isFirst
                                  ? 'opacity-20 border-slate-800 text-slate-600'
                                  : 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200 active:scale-90 cursor-pointer'
                              }`}
                              title="Subir parada"
                            >
                              <MoveUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveStopDown(ord.id)}
                              disabled={isLast}
                              className={`w-6 h-5 rounded-md flex items-center justify-center border text-[10px] font-bold transition ${
                                isLast
                                  ? 'opacity-20 border-slate-800 text-slate-600'
                                  : 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200 active:scale-90 cursor-pointer'
                              }`}
                              title="Bajar parada"
                            >
                              <MoveDown className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Bottom Sub-row: Inter-Stop Travel Time & Distance + "Ver en Mapa" Button */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5">
                        <div className="min-w-0 flex-1">
                          {legInfo ? (
                            <div className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-lg truncate ${
                              legInfo.isFirst 
                                ? 'text-cyan-300 bg-cyan-500/10 border border-cyan-500/20' 
                                : 'text-sky-300 bg-sky-500/15 border border-sky-400/30'
                            }`}>
                              <Car className="h-3 w-3 text-sky-400 shrink-0" />
                              <span className="truncate">{legInfo.text}</span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-500">Calculando tiempo...</span>
                          )}
                        </div>

                        {/* Explicit button to view on map and close modal */}
                        <button
                          type="button"
                          onClick={() => {
                            handleSelectJob(ord);
                            setShowDayJobsOverlay(false);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-400/30 text-[10.5px] font-bold transition active:scale-95 cursor-pointer shrink-0 shadow-xs"
                          title="Ver y centrar esta parada en el mapa"
                        >
                          <Navigation className="h-3 w-3 fill-cyan-400/20 text-cyan-400" />
                          <span>Ver en Mapa</span>
                        </button>
                      </div>
                    </div>
                  );
                })}

              {tempOrdersList.length === 0 && (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No hay trabajos registrados para esta jornada.
                </div>
              )}
            </div>

            {/* Footer: Añadir a la izquierda, Guardar Orden a la derecha (Cerrar se retiró pues ya está la X arriba) */}
            <div className="px-4 py-3 border-t border-white/10 bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowDayJobsOverlay(false);
                  if (onOpenAddJob) onOpenAddJob();
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 hover:text-white text-xs font-bold transition active:scale-95 cursor-pointer border border-white/10 shadow-sm"
              >
                <Plus className="h-4 w-4 stroke-[3]" />
                <span>Añadir</span>
              </button>

              <button
                type="button"
                onClick={handleSaveTripOrder}
                disabled={isSavingTrip}
                className={`px-4 py-2 text-xs font-black rounded-xl shadow-lg transition active:scale-95 flex items-center gap-1.5 cursor-pointer ${
                  hasOrderChanged
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/25 ring-2 ring-emerald-400/30'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
                }`}
                title="Guardar orden de paradas"
              >
                <Check className="h-4 w-4 stroke-[3]" />
                <span>{isSavingTrip ? 'Guardando...' : 'Guardar Orden'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
