import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  Navigation, MapPin, Compass, Sparkles, CheckCircle2, 
  Clock, AlertTriangle, ChevronUp, ChevronDown, Phone, 
  Camera, Share2, DollarSign, Layers, List, Pencil, 
  SlidersHorizontal, Car, Calendar, ArrowRight, ShieldCheck, 
  X, Plus, Play, Pause, RotateCcw, Home, Star, MoreHorizontal,
  Cloud, MessageCircle, ExternalLink, Check
} from 'lucide-react';
import { formatDateFriendly } from '../utils/dateUtils';

// Haversine formula with realistic road grid factor (~1.28)
function getEstimatedDrivingMiles(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1.28;
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
  const markersLayerRef = useRef(null);
  const routeLineRef = useRef(null);
  const routeGlowRef = useRef(null);
  const routeBadgeRef = useRef(null);
  const userMarkerRef = useRef(null);

  const [userLocation, setUserLocation] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [drawerState, setDrawerState] = useState('peek'); // 'peek' | 'expanded'
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'Pendiente' | 'Completado' | 'No Realizado'
  const [optimizing, setOptimizing] = useState(false);
  const [geocodingMissing, setGeocodingMissing] = useState(false);

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

  // Default coordinate center (Elkhart / Northern Indiana)
  const DEFAULT_CENTER = [41.681995, -85.97667];

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

  // Immediate selection of target order (either newly added or default pending)
  useEffect(() => {
    if (targetFocusOrderId) {
      const target = orders.find(o => o.id === targetFocusOrderId);
      if (target) {
        setSelectedOrder(target);
        setCurrentNoteText(target.raw_notes || '');
        if (mapInstanceRef.current && target.latitude && target.longitude) {
          mapInstanceRef.current.setView([target.latitude, target.longitude], 15, { animate: true });
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
          heading: pos.coords.heading,
          speed: pos.coords.speed
        });
      },
      (err) => console.warn('GPS Watch error:', err.message),
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Auto-geocode missing coordinates immediately in the background
  useEffect(() => {
    if (missingCoordsCount > 0 && !geocodingMissing) {
      handleGeocodeMissing();
    }
  }, [missingCoordsCount]);

  // Initialize Map with Dark Gray Canvas (ArcGIS Base + Reference with maxNativeZoom: 16)
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER,
      zoom: 14,
      minZoom: 10,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: false
    });

    // Dark Gray Base layer (maxNativeZoom: 16 prevents "Map data not yet available" on zoom)
    const baseLayer = L.tileLayer(
      'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      { 
        maxZoom: 18,
        maxNativeZoom: 16,
        minZoom: 10
      }
    ).addTo(map);

    // Dark Gray Reference layer (crisp road names and labels)
    const refLayer = L.tileLayer(
      'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      { 
        maxZoom: 18,
        maxNativeZoom: 16,
        minZoom: 10,
        opacity: 0.95
      }
    ).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Job Markers & Trajectory Route on Map (Apple Maps 1:1 Aesthetic)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();
    if (routeLineRef.current) {
      map.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }
    if (routeGlowRef.current) {
      map.removeLayer(routeGlowRef.current);
      routeGlowRef.current = null;
    }
    if (routeBadgeRef.current) {
      map.removeLayer(routeBadgeRef.current);
      routeBadgeRef.current = null;
    }

    if (validOrders.length === 0 && !userLocation) return;

    const bounds = L.latLngBounds([]);

    // Determine target order
    const activeTarget = selectedOrder || validOrders.find(o => o.status === 'Pendiente') || validOrders[0];

    // Determine technician start point:
    // 1. Live GPS if available
    // 2. Or fallback offset (~0.8 miles away) so route & puck are ALWAYS drawn!
    let effectiveStart = null;
    if (userLocation) {
      effectiveStart = [userLocation.lat, userLocation.lng];
    } else if (activeTarget && activeTarget.latitude && activeTarget.longitude) {
      effectiveStart = [activeTarget.latitude + 0.0075, activeTarget.longitude - 0.0085];
    } else {
      effectiveStart = DEFAULT_CENTER;
    }

    // Render technician location puck (live GPS or active start)
    if (effectiveStart) {
      bounds.extend(effectiveStart);
      const userHtml = `
        <div class="apple-user-puck">
          <div class="apple-user-pulse"></div>
          <div class="apple-user-dot"></div>
        </div>
      `;
      const userIcon = L.divIcon({
        html: userHtml,
        className: 'apple-user-puck-container',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });
      L.marker(effectiveStart, { icon: userIcon, zIndexOffset: 1000 }).addTo(markersLayer);
    }

    orders.forEach((order, index) => {
      if (!order.latitude || !order.longitude) return;

      const latLng = [order.latitude, order.longitude];
      bounds.extend(latLng);

      const isCompleted = order.status === 'Completado';
      const isCancelled = order.status === 'No Realizado';
      const isTarget = activeTarget?.id === order.id;

      let markerHtml = '';

      if (isTarget) {
        // Destination Marker: Apple House Icon + Address Pill (Matches screenshot)
        markerHtml = `
          <div class="apple-dest-badge">
            <div class="apple-dest-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="0">
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
              </svg>
            </div>
            <div class="apple-dest-label">
              ${order.address || 'Destino'}
            </div>
          </div>
        `;

        const targetIcon = L.divIcon({
          html: markerHtml,
          className: 'apple-dest-badge-container',
          iconSize: [140, 60],
          iconAnchor: [70, 56]
        });

        const targetMarker = L.marker(latLng, { icon: targetIcon, zIndexOffset: 800 }).addTo(markersLayer);
        targetMarker.on('click', () => {
          setSelectedOrder(order);
          map.panTo(latLng);
        });
      } else {
        // Other stops: Compact Apple Numbered Badges
        let bg = 'bg-[#FF9500]';
        if (isCompleted) bg = 'bg-[#34C759]';
        else if (isCancelled) bg = 'bg-[#8E8E93]';

        markerHtml = `
          <div class="cursor-pointer group flex flex-col items-center">
            <div class="w-7 h-7 rounded-full ${bg} border-2 border-white/90 text-white font-black text-xs flex items-center justify-center shadow-lg transition-transform group-hover:scale-110">
              ${index + 1}
            </div>
          </div>
        `;

        const stopIcon = L.divIcon({
          html: markerHtml,
          className: 'apple-stop-icon',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });

        const stopMarker = L.marker(latLng, { icon: stopIcon, zIndexOffset: 400 }).addTo(markersLayer);
        stopMarker.on('click', () => {
          setSelectedOrder(order);
          map.panTo(latLng);
        });
      }
    });

    // Draw active trajectory to target job (Apple iOS Blue illuminated ribbon)
    if (activeTarget && activeTarget.latitude && activeTarget.longitude && effectiveStart) {
      const targetLatLng = [activeTarget.latitude, activeTarget.longitude];
      const routePoints = [effectiveStart, targetLatLng];

      // 1. Underlayer glow ribbon
      routeGlowRef.current = L.polyline(routePoints, {
        color: 'rgba(0, 122, 255, 0.35)',
        weight: 10,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);

      // 2. Solid Apple Blue line
      routeLineRef.current = L.polyline(routePoints, {
        color: '#007AFF',
        weight: 5,
        opacity: 0.98,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);

      // 3. Floating Route Callout Badge on the route line ("4 min • Más rápida")
      const midLat = (effectiveStart[0] + targetLatLng[0]) / 2;
      const midLng = (effectiveStart[1] + targetLatLng[1]) / 2;
      const dist = getEstimatedDrivingMiles(effectiveStart[0], effectiveStart[1], targetLatLng[0], targetLatLng[1]) || 0.8;
      const estMins = Math.max(2, Math.round(dist * 2.2));

      const badgeHtml = `
        <div class="apple-route-badge">
          <div class="eta-main">${estMins} min</div>
          <div class="eta-sub">Más rápida</div>
        </div>
      `;

      const badgeIcon = L.divIcon({
        html: badgeHtml,
        className: 'apple-route-badge-container',
        iconSize: [90, 40],
        iconAnchor: [45, 20]
      });

      routeBadgeRef.current = L.marker([midLat, midLng], {
        icon: badgeIcon,
        interactive: false,
        zIndexOffset: 600
      }).addTo(map);
    }

    // Connect multiple stops in day with dashed connector line
    if (validOrders.length > 1) {
      const stopsPoints = validOrders.map(o => [o.latitude, o.longitude]);
      L.polyline(stopsPoints, {
        color: '#007AFF',
        weight: 2.5,
        opacity: 0.5,
        dashArray: '6, 8',
        lineCap: 'round'
      }).addTo(markersLayer);
    }

    // Auto-view framing
    if (activeTarget && activeTarget.latitude && activeTarget.longitude) {
      if (effectiveStart) {
        const viewBounds = L.latLngBounds([
          effectiveStart,
          [activeTarget.latitude, activeTarget.longitude]
        ]);
        map.fitBounds(viewBounds, { padding: [60, 60], maxZoom: 15 });
      } else {
        map.setView([activeTarget.latitude, activeTarget.longitude], 14, { animate: true });
      }
    } else if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [orders, selectedOrder?.id, userLocation]);

  // Center on current technician location
  const handleCenterOnMe = () => {
    if (!userLocation || !mapInstanceRef.current) return;
    mapInstanceRef.current.setView([userLocation.lat, userLocation.lng], 15, { animate: true });
  };

  // Center on active route overview
  const handleCenterOnRoute = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const bounds = L.latLngBounds([]);
    if (userLocation) bounds.extend([userLocation.lat, userLocation.lng]);
    if (selectedOrder?.latitude && selectedOrder?.longitude) {
      bounds.extend([selectedOrder.latitude, selectedOrder.longitude]);
    } else {
      validOrders.forEach(o => bounds.extend([o.latitude, o.longitude]));
    }
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
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

  // Distance from technician to target job (with 0.8 mi fallback while GPS is acquiring)
  const distanceToTarget = (selectedOrder?.latitude && selectedOrder?.longitude)
    ? (userLocation 
        ? getEstimatedDrivingMiles(userLocation.lat, userLocation.lng, selectedOrder.latitude, selectedOrder.longitude)
        : 0.8)
    : null;

  const estMinutes = distanceToTarget !== null ? Math.max(1, Math.round(distanceToTarget * 2.2)) : null;

  // Filtered orders for expanded list
  const filteredOrders = orders.filter(o => {
    if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
    return true;
  });

  const selectedIndex = selectedOrder ? orders.findIndex(o => o.id === selectedOrder.id) : 0;
  const currentTimer = selectedOrder ? jobTimers[selectedOrder.id] : null;

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

  return (
    <div className="relative w-full max-w-md mx-auto h-[calc(100vh-8.5rem)] rounded-3xl overflow-hidden border border-[#2b3543] bg-[#1c242e] shadow-2xl flex flex-col select-none">
      
      {/* 1. MAP CANVAS (IPHONE MAPS DARK NAVIGATION) */}
      <div 
        ref={mapContainerRef} 
        className="absolute inset-0 w-full h-full z-0 apple-maps-dark" 
      />

      {/* 2. TOP HUD: WEATHER / GPS BADGE + DAY EARNINGS + ACTIONS */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none gap-2">
        {/* Weather / Status Badge (Apple Maps Style Upper Left) */}
        <div className="pointer-events-auto bg-[#1a232f]/85 backdrop-blur-xl border border-white/10 rounded-2xl px-3 py-1.5 shadow-lg flex items-center gap-2">
          <Cloud className="h-4 w-4 text-slate-300" />
          <div className="text-[11px] font-bold text-white leading-tight">
            <span>53°</span>
            <span className="text-[9px] text-slate-400 ml-1 font-mono">ICA 53 🟡</span>
          </div>
        </div>

        {/* Date & Day Earnings Pill */}
        <div className="pointer-events-auto bg-[#1a232f]/85 backdrop-blur-xl border border-white/10 rounded-2xl px-2.5 py-1.5 shadow-lg flex items-center gap-1.5">
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

        {/* Map Header Actions: + Add Job & Classic View */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            onClick={onOpenAddJob}
            className="p-2 rounded-2xl bg-[#007AFF] hover:bg-[#0062D2] text-white font-bold text-xs shadow-md shadow-blue-500/30 active:scale-95 transition flex items-center gap-1"
            title="Añadir nuevo trabajo"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
          </button>

          <button
            onClick={onSwitchToClassic}
            className="p-2 rounded-2xl bg-[#1a232f]/85 backdrop-blur-xl hover:bg-[#253242] text-slate-300 border border-white/10 shadow-md active:scale-95 transition"
            title="Cambiar a Vista Lista"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 3. RIGHT FLOATING CONTROLS (APPLE MAPS STACKED BUTTONS) */}
      <div className="absolute right-3 top-20 z-20 flex flex-col gap-2 pointer-events-auto">
        {/* Recenter on Route Overview (Apple Car Icon) */}
        <button
          onClick={handleCenterOnRoute}
          className="w-10 h-10 rounded-full bg-[#1c242e]/90 backdrop-blur-xl border border-white/15 text-slate-200 hover:text-white flex items-center justify-center shadow-lg active:scale-95 transition"
          title="Ver ruta completa"
        >
          <Car className="h-4 w-4" />
        </button>

        {/* Recenter on Live Tech GPS (Apple Compass Arrow) */}
        <button
          onClick={handleCenterOnMe}
          className="w-10 h-10 rounded-full bg-[#1c242e]/90 backdrop-blur-xl border border-white/15 text-[#007AFF] hover:text-blue-400 flex items-center justify-center shadow-lg active:scale-95 transition"
          title="Centrar en mi ubicación"
        >
          <Navigation className="h-4 w-4 fill-[#007AFF]/20" />
        </button>

        {/* Optimize Route by Proximity */}
        <button
          onClick={handleOptimizeRoute}
          disabled={optimizing || validOrders.length < 2}
          className="w-10 h-10 rounded-full bg-[#1c242e]/90 backdrop-blur-xl border border-white/15 text-[#FF9500] hover:text-orange-400 flex items-center justify-center shadow-lg active:scale-95 transition disabled:opacity-40"
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
        className={`absolute left-0 right-0 bottom-0 z-30 bg-[#1c242f]/98 backdrop-blur-2xl border-t border-white/10 rounded-t-[32px] shadow-[0_-12px_40px_rgba(0,0,0,0.5)] transition-all duration-300 ease-in-out flex flex-col ${
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
                className="w-10 h-10 rounded-full bg-[#273240] hover:bg-[#324052] text-white flex items-center justify-center shadow-md active:scale-95 transition shrink-0"
                title="Compartir reporte"
              >
                <Share2 className="h-4 w-4" />
              </button>

              {/* Title & Distance (Matches Apple Maps 4260 Main St header) */}
              <div 
                className="text-center min-w-0 flex-1 cursor-pointer"
                onClick={() => setDrawerState(prev => prev === 'peek' ? 'expanded' : 'peek')}
              >
                <h2 className="text-base sm:text-lg font-black text-white truncate tracking-tight">
                  {selectedOrder.address || 'Dirección no asignada'}
                </h2>
                <p className="text-[11px] text-slate-400 font-medium truncate">
                  {distanceToTarget !== null 
                    ? `A ${distanceToTarget.toFixed(1)} mi de distancia` + (estMinutes ? ` (~${estMinutes} min)` : '')
                    : `${selectedOrder.city || 'Elkhart, IN'} • Job #${selectedOrder.job_id}`}
                </p>
              </div>

              {/* Close Button (X in Circle) */}
              <button
                type="button"
                onClick={() => setDrawerState(prev => prev === 'peek' ? 'expanded' : 'peek')}
                className="w-10 h-10 rounded-full bg-[#273240] hover:bg-[#324052] text-white flex items-center justify-center shadow-md active:scale-95 transition shrink-0"
                title={drawerState === 'peek' ? 'Ver detalles y cola' : 'Contraer'}
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
                  className="h-11 rounded-2xl bg-[#273240] hover:bg-[#324052] text-[#29b6f6] font-bold text-xs flex items-center justify-center gap-1.5 border border-white/5 shadow-md active:scale-95 transition"
                >
                  <CheckCircle2 className="h-4 w-4 stroke-[2.5]" />
                  <span>Completar</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenShareModal(selectedOrder)}
                  className="h-11 rounded-2xl bg-[#273240] hover:bg-[#324052] text-[#34C759] font-bold text-xs flex items-center justify-center gap-1.5 border border-white/5 shadow-md active:scale-95 transition"
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
                  if (next) setSelectedOrder(next);
                }}
                className="h-11 rounded-2xl bg-[#273240] hover:bg-[#324052] text-[#29b6f6] font-bold text-xs flex items-center justify-center gap-1.5 border border-white/5 shadow-md active:scale-95 transition"
              >
                <Navigation className="h-4 w-4" />
                <span>Siguiente</span>
              </button>
            </div>

            {/* Note Card: "Agregar una nota" (Apple Maps Card Design) */}
            <div className="bg-[#222b37] border border-white/5 rounded-2xl p-2.5 my-1">
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
                    className="w-full bg-[#182029] text-white border border-[#007AFF]/50 rounded-xl p-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#007AFF] resize-none"
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

            {/* Bottom Floating Pill Bar with Shortcuts: Timer, Open in Apple Maps, More */}
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
                    : 'bg-[#273240] text-slate-300 border border-white/5'
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
              <div className="flex items-center gap-1 bg-[#273240] rounded-xl p-1 border border-white/5">
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
                  <div className="bg-[#18212c] border border-white/10 rounded-2xl p-2 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreActions(false);
                        onOpenEditModal(selectedOrder);
                      }}
                      className="p-2 bg-[#273240] rounded-xl text-slate-200 text-[10px] font-bold text-center hover:bg-[#344558]"
                    >
                      Editar Orden
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreActions(false);
                        onOpenAdjustModal(selectedOrder);
                      }}
                      className="p-2 bg-[#273240] rounded-xl text-slate-200 text-[10px] font-bold text-center hover:bg-[#344558]"
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
                <div className="bg-[#222b37] border border-white/5 rounded-2xl p-3 space-y-2.5">
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

                  <div className="grid grid-cols-4 gap-1 bg-[#182029] p-1 rounded-2xl border border-white/5 text-[10px] font-bold text-center">
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
                              mapInstanceRef.current.setView([ord.latitude, ord.longitude], 15, { animate: true });
                            }
                          }}
                          className={`p-3 rounded-2xl border cursor-pointer transition select-none flex items-center justify-between gap-2 ${
                            isTarget 
                              ? 'bg-[#007AFF]/15 border-[#007AFF]/70 shadow-md ring-1 ring-[#007AFF]/50'
                              : 'bg-[#222b37] border-white/5 hover:border-white/15'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`w-6 h-6 rounded-full text-white font-black text-xs flex items-center justify-center font-sans shrink-0 ${
                              isCompleted ? 'bg-[#34C759]' : isCancelled ? 'bg-[#FF3B30]' : 'bg-[#FF9500]'
                            }`}>
                              {idx + 1}
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