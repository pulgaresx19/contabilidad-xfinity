import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  Navigation, MapPin, Compass, RefreshCw, CheckCircle2, 
  Clock, AlertCircle, Sparkles, ArrowUpRight, ExternalLink,
  ChevronRight, Car, Layers, Eye
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

// Great-circle distance converted to realistic driving miles (~1.28 grid detour factor)
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
  const straight = R * c;
  return straight * 1.28;
}

export default function DayMapView({ 
  orders = [], 
  activeDate, 
  onOpenPhotos, 
  onMarkCompleted, 
  onOrderUpdated 
}) {
  const { actualTheme } = useTheme();
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const routeLineRef = useRef(null);
  const userMarkerRef = useRef(null);

  const [userLocation, setUserLocation] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [optimizing, setOptimizing] = useState(false);
  const [geocodingMissing, setGeocodingMissing] = useState(false);

  // Default coordinate center (Elkhart, Indiana)
  const DEFAULT_CENTER = [41.681995, -85.97667];

  // Filter day orders and filter valid coordinates
  const validOrders = orders.filter(o => o.latitude && o.longitude);
  const missingCoordsCount = orders.length - validOrders.length;

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
      (err) => console.warn('Geolocation watch error:', err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

    const map = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER,
      zoom: 12,
      zoomControl: false,
      attributionControl: false
    });

    L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update User Marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !userLocation) return;

    const userHtml = `
      <div class="relative flex items-center justify-center w-8 h-8">
        <div class="absolute w-8 h-8 rounded-full bg-blue-500/30 animate-ping"></div>
        <div class="relative w-5 h-5 rounded-full bg-blue-600 border-2 border-white shadow-lg flex items-center justify-center text-white">
          <div class="w-2 h-2 rounded-full bg-white"></div>
        </div>
      </div>
    `;

    const userIcon = L.divIcon({
      html: userHtml,
      className: 'user-pos-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
    } else {
      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], {
        icon: userIcon,
        zIndexOffset: 1000
      }).addTo(map);
    }
  }, [userLocation]);

  // Update Job Markers and Travesía Route
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();
    if (routeLineRef.current) {
      map.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }

    if (validOrders.length === 0 && !userLocation) return;

    const points = [];
    const bounds = L.latLngBounds([]);

    if (userLocation) {
      bounds.extend([userLocation.lat, userLocation.lng]);
      points.push([userLocation.lat, userLocation.lng]);
    }

    validOrders.forEach((order, index) => {
      const latLng = [order.latitude, order.longitude];
      points.push(latLng);
      bounds.extend(latLng);

      const isCompleted = order.status === 'Completado';
      const isCancelled = order.status === 'No Realizado';
      const isSelected = selectedOrder?.id === order.id;

      // Color scheme based on order status
      let bgClass = 'bg-amber-500 text-slate-950';
      let borderClass = 'border-amber-300';
      if (isCompleted) {
        bgClass = 'bg-emerald-500 text-slate-950';
        borderClass = 'border-emerald-300';
      } else if (isCancelled) {
        bgClass = 'bg-slate-600 text-white';
        borderClass = 'border-slate-400';
      } else if (index === 0 || (!isCompleted && !isCancelled)) {
        bgClass = 'bg-cyan-500 text-slate-950';
        borderClass = 'border-cyan-200';
      }

      const markerHtml = `
        <div class="relative flex items-center justify-center cursor-pointer transition-transform duration-200 ${isSelected ? 'scale-125 z-50' : 'hover:scale-110'}">
          <div class="w-8 h-8 rounded-full ${bgClass} border-2 ${borderClass} shadow-md flex items-center justify-center font-black text-xs font-mono">
            ${index + 1}
          </div>
          ${isSelected ? '<div class="absolute -bottom-1.5 w-2 h-2 bg-white rotate-45"></div>' : ''}
        </div>
      `;

      const icon = L.divIcon({
        html: markerHtml,
        className: 'custom-job-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker(latLng, { icon }).addTo(markersLayer);
      marker.on('click', () => {
        setSelectedOrder(order);
        map.panTo(latLng);
      });
    });

    // Draw route polyline
    if (points.length >= 2) {
      routeLineRef.current = L.polyline(points, {
        color: '#06b6d4',
        weight: 3.5,
        opacity: 0.8,
        dashArray: '6, 8',
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);
    }

    // Auto-fit bounds
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [orders, selectedOrder]);

  // Center on current technician location
  const handleCenterOnMe = () => {
    if (!userLocation || !mapInstanceRef.current) return;
    mapInstanceRef.current.setView([userLocation.lat, userLocation.lng], 15, { animate: true });
  };

  // Center on entire daily route
  const handleFitRoute = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const bounds = L.latLngBounds([]);
    if (userLocation) bounds.extend([userLocation.lat, userLocation.lng]);
    validOrders.forEach(o => bounds.extend([o.latitude, o.longitude]));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  };

  // Auto-geocode any orders missing coordinates
  const handleGeocodeMissing = async () => {
    try {
      setGeocodingMissing(true);
      const res = await fetch('/api/orders/geocode-all', { method: 'POST' });
      if (res.ok) {
        if (onOrderUpdated) await onOrderUpdated();
      }
    } catch (e) {
      console.warn('Geocoding missing error:', e);
    } finally {
      setGeocodingMissing(false);
    }
  };

  // Optimize route by nearest neighbor sequence
  const handleOptimizeRoute = async () => {
    if (validOrders.length <= 1) return;
    setOptimizing(true);

    try {
      // Start from technician current location or first job
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

      // Persist new sequence
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

  // Open Turn-by-Turn GPS navigation
  const openNavigation = (order, appType = 'google') => {
    const fullAddr = `${order.address}, ${order.city || 'Elkhart'}, IN ${order.zip_code || ''}`;
    const enc = encodeURIComponent(fullAddr);

    if (appType === 'waze') {
      window.open(`https://waze.com/ul?q=${enc}&navigate=yes`, '_blank');
    } else {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${enc}`, '_blank');
    }
  };

  // Calculate cumulative route miles
  let totalRouteMiles = 0;
  for (let i = 0; i < validOrders.length; i++) {
    const prev = i === 0 ? userLocation : validOrders[i - 1];
    if (prev && validOrders[i]) {
      const d = getEstimatedDrivingMiles(prev.lat || prev.latitude, prev.lng || prev.longitude, validOrders[i].latitude, validOrders[i].longitude);
      if (d) totalRouteMiles += d;
    }
  }

  // Next pending job
  const nextPendingOrder = validOrders.find(o => o.status === 'Pendiente');
  const milesToNext = (userLocation && nextPendingOrder)
    ? getEstimatedDrivingMiles(userLocation.lat, userLocation.lng, nextPendingOrder.latitude, nextPendingOrder.longitude)
    : null;

  return (
    <div className="space-y-3">
      {/* Metrics Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-2.5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400">
              <Car className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-black text-white uppercase tracking-wider">
                Travesía del Día • {activeDate}
              </h3>
              <p className="text-[10px] text-slate-400">
                {orders.length} trabajos programados ({validOrders.length} localizados en mapa)
              </p>
            </div>
          </div>

          <button
            onClick={handleOptimizeRoute}
            disabled={optimizing || validOrders.length < 2}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-[10px] rounded-xl active:scale-95 transition shadow-xs disabled:opacity-50"
            title="Reordenar trabajos por cercanía para ahorrar tiempo y gasolina"
          >
            <Sparkles className="h-3 w-3" />
            <span>{optimizing ? 'Calculando...' : 'Optimizar Ruta'}</span>
          </button>
        </div>

        {/* Distance summary pills */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-2.5">
            <span className="text-[10px] text-slate-400 block font-medium">Próxima Parada:</span>
            <div className="font-mono font-bold text-cyan-400 flex items-center gap-1 text-sm mt-0.5">
              <span>{milesToNext !== null ? `${milesToNext.toFixed(1)} mi` : '—'}</span>
              {milesToNext !== null && (
                <span className="text-[10px] text-slate-500 font-sans font-normal">
                  (~{Math.max(1, Math.round(milesToNext * 2.2))} min)
                </span>
              )}
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-2.5">
            <span className="text-[10px] text-slate-400 block font-medium">Recorrido Total Est.:</span>
            <div className="font-mono font-bold text-amber-400 flex items-center gap-1 text-sm mt-0.5">
              <span>{totalRouteMiles > 0 ? `${totalRouteMiles.toFixed(1)} mi` : '—'}</span>
              <span className="text-[10px] text-slate-500 font-sans font-normal">
                ({validOrders.length} paradas)
              </span>
            </div>
          </div>
        </div>

        {/* Warning if any orders are missing coordinates */}
        {missingCoordsCount > 0 && (
          <div className="flex items-center justify-between p-2 rounded-xl bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-300">
            <span>{missingCoordsCount} orden{missingCoordsCount > 1 ? 'es' : ''} sin coordenadas GPS</span>
            <button
              onClick={handleGeocodeMissing}
              disabled={geocodingMissing}
              className="text-[10px] font-bold underline hover:text-white"
            >
              {geocodingMissing ? 'Localizando...' : 'Localizar ahora'}
            </button>
          </div>
        )}
      </div>

      {/* Map Container */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-800 bg-[#f7f5f0] h-80 sm:h-96 shadow-lg">
        <div ref={mapContainerRef} className="w-full h-full z-0 apple-maps-style" />

        {/* Floating Map Controls */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
          <button
            onClick={handleCenterOnMe}
            className="p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-cyan-400 border border-slate-700/80 shadow-md active:scale-90 transition backdrop-blur-sm"
            title="Mi ubicación actual"
          >
            <Compass className="h-4 w-4" />
          </button>
          <button
            onClick={handleFitRoute}
            className="p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-700/80 shadow-md active:scale-90 transition backdrop-blur-sm"
            title="Ver ruta completa"
          >
            <Layers className="h-4 w-4" />
          </button>
        </div>

        {/* Legend Overlay at bottom left */}
        <div className="absolute bottom-2 left-2 z-10 bg-slate-950/85 backdrop-blur-md border border-slate-800/80 rounded-xl px-2.5 py-1 text-[9px] font-mono flex items-center gap-2 text-slate-300 shadow">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span> Activo
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span> Pendiente
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Hecho
          </span>
        </div>
      </div>

      {/* Selected Order Bottom Action Card */}
      {selectedOrder ? (
        <div className="bg-slate-900 border-2 border-cyan-500/60 rounded-2xl p-3.5 space-y-3 shadow-xl transition-all">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-cyan-500 text-slate-950 font-black text-xs flex items-center justify-center font-mono">
                  {validOrders.findIndex(o => o.id === selectedOrder.id) + 1}
                </span>
                <span className="text-xs font-mono font-bold text-white">
                  Job #{selectedOrder.job_id}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  selectedOrder.status === 'Completado' 
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : selectedOrder.status === 'No Realizado'
                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                    : 'bg-amber-950 text-amber-300 border border-amber-800'
                }`}>
                  {selectedOrder.status}
                </span>
              </div>
              <p className="text-sm font-bold text-slate-200 mt-1 flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                <span>{selectedOrder.address}, {selectedOrder.city}</span>
              </p>
              <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 font-mono">
                <span>{selectedOrder.drop_footage || 0} ft ({selectedOrder.cable_type})</span>
                <span>•</span>
                <span className="text-emerald-400 font-bold">${selectedOrder.rate_calculated || 100}</span>
              </div>
            </div>

            <button
              onClick={() => setSelectedOrder(null)}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* Quick Action Navigation Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => openNavigation(selectedOrder, 'google')}
              className="py-2.5 px-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition shadow-md shadow-cyan-500/20"
            >
              <Navigation className="h-4 w-4 stroke-[2.5]" />
              <span>Navegar (Google)</span>
            </button>

            <button
              onClick={() => openNavigation(selectedOrder, 'waze')}
              className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 border border-slate-700 active:scale-95 transition"
            >
              <Car className="h-4 w-4 text-cyan-400" />
              <span>Waze</span>
            </button>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
            <button
              onClick={() => onOpenPhotos(selectedOrder)}
              className="flex-1 py-2 px-3 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl text-center transition"
            >
              📸 Evidencias ({selectedOrder.photos_count || 0})
            </button>

            {selectedOrder.status !== 'Completado' && (
              <button
                onClick={() => onMarkCompleted(selectedOrder)}
                className="flex-1 py-2 px-3 bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl text-center transition shadow-xs"
              >
                ✓ Marcar Hecho
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3 text-center text-xs text-slate-400">
          Toca cualquier número en el mapa para ver la casa, distancias y abrir la navegación GPS.
        </div>
      )}
    </div>
  );
}
