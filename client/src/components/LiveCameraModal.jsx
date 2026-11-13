import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Camera, Zap, ZapOff, RefreshCw, Check,
  AlertCircle, MapPin, Clock, Upload, Grid
} from 'lucide-react';
import {
  buildWatermarkLines,
  drawWatermarkOnCanvas,
  getPhysicalAddressFromLocation
} from '../utils/watermark';

const PHOTO_STEPS = [
  { id: 'Casa', label: 'Casa / Entrada', short: 'Casa', icon: '🏠' },
  { id: 'Terreno', label: 'Terreno / Ruta', short: 'Terreno', icon: '🌱' },
  { id: 'Profundidad 1', label: 'Comprobante Profundidad 1', short: 'Profundidad 1', icon: '📏' },
  { id: 'Profundidad 2', label: 'Comprobante Profundidad 2', short: 'Profundidad 2', icon: '📏' },
  { id: 'Conector Central', label: 'Conector Central / Tap', short: 'Conector Central', icon: '⚡' },
  { id: 'Pedestal Casa', label: 'Pedestal de la Casa', short: 'Pedestal Casa', icon: '🔌' },
  { id: 'Finalizado', label: 'Terreno Cerrado / Finalizado', short: 'Finalizado', icon: '✨' },
  { id: 'Extra', label: 'Foto Extra', short: 'Extra', icon: '📷' }
];

export default function LiveCameraModal({
  isOpen,
  onClose,
  order,
  initialCategory = 'Casa',
  onPhotoSaved,
  autoAdvance = true,
  onAutoAdvanceToggle,
  workPhotosCount = 0
}) {
  const [category, setCategory] = useState(initialCategory);
  const [stream, setStream] = useState(null);
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' (trasera) o 'user' (frontal)
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [flashActive, setFlashActive] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [cameraError, setCameraError] = useState(null);

  // Reloj en tiempo real (se actualiza cada 500ms para mostrar segundero en vivo)
  const [currentTime, setCurrentTime] = useState(() => new Date());

  // GPS en tiempo real
  const [gpsFix, setGpsFix] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('searching'); // 'searching', 'locked', 'error'
  const [gpsError, setGpsError] = useState(null);

  // Dirección física geocodificada en tiempo real
  const [physicalAddress, setPhysicalAddress] = useState(null);
  const [lastGeocodedCoords, setLastGeocodedCoords] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const watchIdRef = useRef(null);
  const isGeocodingRef = useRef(false);
  const fallbackInputRef = useRef(null);

  // Sincronizar categoría inicial al abrir
  useEffect(() => {
    if (isOpen) {
      setCategory(initialCategory || 'Casa');
      setCameraError(null);
      setToastMessage(null);
    }
  }, [isOpen, initialCategory]);

  // 1. Reloj en tiempo real continuo
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 500);
    return () => clearInterval(interval);
  }, [isOpen]);

  // 2. Seguimiento continuo de GPS con watchPosition de alta precisión
  useEffect(() => {
    if (!isOpen) return;

    if (!('geolocation' in navigator)) {
      setGpsStatus('error');
      setGpsError('GPS no soportado en este navegador');
      return;
    }

    setGpsStatus('searching');

    const handlePos = (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const fix = {
        lat: latitude,
        lng: longitude,
        accuracy: accuracy,
        timestamp: pos.timestamp || Date.now()
      };
      setGpsFix(fix);
      setGpsStatus('locked');
      setGpsError(null);

      // Si nos hemos movido más de ~25m o es la primera fijación, geocodificar dirección física en tiempo real
      if (!isGeocodingRef.current) {
        const last = lastGeocodedCoords;
        const needsGeocode = !last || (
          Math.hypot(latitude - last.lat, longitude - last.lng) > 0.00025
        );

        if (needsGeocode) {
          isGeocodingRef.current = true;
          getPhysicalAddressFromLocation(latitude, longitude)
            .then((addr) => {
              if (addr) {
                setPhysicalAddress(addr);
                setLastGeocodedCoords({ lat: latitude, lng: longitude });
              }
            })
            .catch(() => {})
            .finally(() => {
              isGeocodingRef.current = false;
            });
        }
      }
    };

    const handleErr = (err) => {
      console.warn('GPS watch error:', err);
      // No marcar como error si ya teníamos una posición previa válida
      setGpsFix((prev) => {
        if (!prev) {
          setGpsStatus('error');
          setGpsError(err.message || 'Sin señal GPS');
        }
        return prev;
      });
    };

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(handlePos, handleErr, {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000
      });
    } catch (e) {
      setGpsStatus('error');
      setGpsError(e.message);
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isOpen, lastGeocodedCoords]);

  // 3. Iniciar Stream de Cámara (getUserMedia)
  const startCameraStream = useCallback(async (facing) => {
    // Detener stream anterior si existe
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('unsupported');
      return;
    }

    setCameraError(null);

    // Detección de múltiples cámaras
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      setHasMultipleCameras(videoDevices.length > 1);
    } catch (e) {}

    // Intentar abrir cámara con máxima resolución ideal
    const constraintsAttempts = [
      {
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 }
        },
        audio: false
      },
      {
        video: { facingMode: facing },
        audio: false
      },
      {
        video: true,
        audio: false
      }
    ];

    let activeStream = null;
    let lastErr = null;

    for (const constraints of constraintsAttempts) {
      try {
        activeStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (activeStream) break;
      } catch (err) {
        lastErr = err;
      }
    }

    if (!activeStream) {
      console.warn('Could not acquire camera stream:', lastErr);
      setCameraError(lastErr?.name === 'NotAllowedError' ? 'permission_denied' : 'generic_error');
      return;
    }

    streamRef.current = activeStream;
    setStream(activeStream);

    // Verificar soporte de linterna / flash
    try {
      const track = activeStream.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      setHasTorch(Boolean(capabilities.torch));
    } catch (e) {
      setHasTorch(false);
    }

    if (videoRef.current) {
      videoRef.current.srcObject = activeStream;
      videoRef.current.play().catch(() => {});
    }
  }, []);

  // Iniciar/detener cámara según apertura del modal
  useEffect(() => {
    if (isOpen) {
      startCameraStream(facingMode);
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setStream(null);
      }
      setTorchOn(false);
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen, facingMode, startCameraStream]);

  // Alternar linterna / flash si está disponible
  const toggleTorch = async () => {
    if (!streamRef.current || !hasTorch) return;
    try {
      const track = streamRef.current.getVideoTracks()[0];
      const nextTorch = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: nextTorch }]
      });
      setTorchOn(nextTorch);
    } catch (e) {
      console.warn('Error toggling torch:', e);
    }
  };

  // Alternar cámara frontal/trasera
  const toggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
  };

  // Construir las 6 líneas exactas del visor y de la estampa
  const hudLines = buildWatermarkLines({
    date: currentTime,
    gps: gpsFix,
    physicalAddress: physicalAddress,
    fallbackAddress: order?.address,
    fallbackCity: order?.city,
    fallbackZip: order?.zip_code,
    fallbackLat: order?.latitude,
    fallbackLng: order?.longitude
  });

  // Tomar Foto en Alta Definición con Estampa GPS Instantánea
  const handleCapturePhoto = async () => {
    if (capturing) return;

    // Vibración háptica en teléfonos compatibles
    if (navigator.vibrate) {
      try { navigator.vibrate(40); } catch (e) {}
    }

    // Efecto visual de obturador / flash
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 150);

    setCapturing(true);

    try {
      const video = videoRef.current;
      const track = streamRef.current ? streamRef.current.getVideoTracks()[0] : null;

      let sourceImage = null;

      // 1. Intentar usar ImageCapture para resolución máxima nativa del sensor (12MP, etc.)
      if (window.ImageCapture && track) {
        try {
          const imageCapture = new window.ImageCapture(track);
          const rawBlob = await imageCapture.takePhoto();
          sourceImage = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(rawBlob);
          });
        } catch (e) {
          // Fallback al video frame
          sourceImage = null;
        }
      }

      // 2. Si no se obtuvo con ImageCapture, capturar fotograma del video
      const canvas = document.createElement('canvas');
      const width = sourceImage ? sourceImage.naturalWidth : (video?.videoWidth || 1920);
      const height = sourceImage ? sourceImage.naturalHeight : (video?.videoHeight || 1080);

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (sourceImage) {
        ctx.drawImage(sourceImage, 0, 0, width, height);
        URL.revokeObjectURL(sourceImage.src);
      } else if (video) {
        ctx.drawImage(video, 0, 0, width, height);
      } else {
        throw new Error('No hay video disponible para capturar');
      }

      // 3. Estampar la marca de agua con las líneas exactas que el usuario ve en pantalla
      drawWatermarkOnCanvas(ctx, width, height, hudLines);

      // 4. Convertir a Blob JPEG de alta calidad
      const stampedBlob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.85);
      });

      if (!stampedBlob) {
        throw new Error('Error al generar la imagen de evidencia');
      }

      const fileName = `evidencia-${category.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.jpg`;
      const stampedFile = new File([stampedBlob], fileName, {
        type: 'image/jpeg',
        lastModified: Date.now()
      });

      // 5. Entregar al padre para subir a la orden
      if (onPhotoSaved) {
        await onPhotoSaved(stampedFile, category);
      }

      // Toast de éxito
      setToastMessage(`✓ Foto de "${category}" guardada`);
      setTimeout(() => setToastMessage(null), 2500);

      // 6. Auto-avanzar al siguiente paso si está habilitado
      if (autoAdvance) {
        const currentIdx = PHOTO_STEPS.findIndex((s) => s.id === category);
        if (currentIdx !== -1 && currentIdx < PHOTO_STEPS.length - 1) {
          setCategory(PHOTO_STEPS[currentIdx + 1].id);
        }
      }
    } catch (err) {
      console.error('Error al capturar evidencia:', err);
      alert('Error al capturar foto: ' + err.message);
    } finally {
      setCapturing(false);
    }
  };

  // Fallback para cuando el usuario usa la cámara nativa del sistema
  const handleFallbackPhoto = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setCapturing(true);
    try {
      const file = files[0];
      // Cargar imagen en canvas y aplicar las coordenadas actuales
      const img = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = ev.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 1920;
      canvas.height = img.naturalHeight || 1080;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      drawWatermarkOnCanvas(ctx, canvas.width, canvas.height, hudLines);

      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.85);
      });

      const stampedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '') + '-stamped.jpg', {
        type: 'image/jpeg',
        lastModified: Date.now()
      });

      if (onPhotoSaved) {
        await onPhotoSaved(stampedFile, category);
      }

      setToastMessage(`✓ Foto de "${category}" guardada`);
      setTimeout(() => setToastMessage(null), 2500);

      if (autoAdvance) {
        const currentIdx = PHOTO_STEPS.findIndex((s) => s.id === category);
        if (currentIdx !== -1 && currentIdx < PHOTO_STEPS.length - 1) {
          setCategory(PHOTO_STEPS[currentIdx + 1].id);
        }
      }
    } catch (err) {
      alert('Error procesando foto: ' + err.message);
    } finally {
      setCapturing(false);
      if (fallbackInputRef.current) fallbackInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col select-none overflow-hidden animate-fade-in">
      {/* Input oculto para fallback a cámara del sistema o galería */}
      <input
        ref={fallbackInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFallbackPhoto}
        className="hidden"
      />

      {/* 1. Barra Superior del Visor */}
      <div className="relative z-20 px-3 py-2 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between gap-2 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-md text-white hover:bg-black/90 flex items-center justify-center transition border border-white/20 active:scale-95 cursor-pointer"
          title="Cerrar cámara"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Indicador de Orden y Estado GPS */}
        <div className="flex flex-col items-center min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-white truncate">
            <span className="text-cyan-400 font-mono">#{order?.job_id}</span>
            <span className="text-slate-400">•</span>
            <span className="truncate max-w-[160px] sm:max-w-xs">{order?.address}</span>
          </div>

          <div className="flex items-center gap-1.5 mt-0.5">
            {gpsStatus === 'locked' && gpsFix ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>GPS ±{Math.round(gpsFix.accuracy || 0)}m</span>
              </span>
            ) : gpsStatus === 'searching' ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                <span>Buscando GPS...</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                <AlertCircle className="h-2.5 w-2.5" />
                <span>GPS sin señal</span>
              </span>
            )}

            <span className="text-[10px] text-slate-400 font-mono">
              {workPhotosCount} {workPhotosCount === 1 ? 'evidencia' : 'evidencias'}
            </span>
          </div>
        </div>

        {/* Botones de Control de Cámara */}
        <div className="flex items-center gap-1.5">
          {hasTorch && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition border border-white/20 active:scale-95 cursor-pointer ${
                torchOn ? 'bg-amber-400 text-slate-950 font-bold shadow-lg shadow-amber-400/30' : 'bg-black/60 text-white'
              }`}
              title={torchOn ? 'Apagar linterna' : 'Encender linterna'}
            >
              {torchOn ? <Zap className="h-4 w-4 fill-current" /> : <ZapOff className="h-4 w-4" />}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowGrid(!showGrid)}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition border border-white/20 active:scale-95 cursor-pointer ${
              showGrid ? 'bg-cyan-500 text-slate-950' : 'bg-black/60 text-white'
            }`}
            title="Cuadrícula de encuadre"
          >
            <Grid className="h-4 w-4" />
          </button>

          {hasMultipleCameras && (
            <button
              type="button"
              onClick={toggleFacingMode}
              className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-md text-white hover:bg-black/90 flex items-center justify-center transition border border-white/20 active:scale-95 cursor-pointer"
              title="Cambiar de cámara"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Selector Rápido de Categoría / Paso (Superior) */}
      <div className="relative z-20 px-3 py-1 bg-black/50 backdrop-blur-xs flex items-center gap-1.5 overflow-x-auto scrollbar-none border-b border-white/10 shrink-0">
        {PHOTO_STEPS.map((step) => {
          const isSelected = category === step.id;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => setCategory(step.id)}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition whitespace-nowrap cursor-pointer flex items-center gap-1 shrink-0 ${
                isSelected
                  ? 'bg-cyan-400 text-slate-950 shadow-md font-black ring-2 ring-cyan-400/50'
                  : 'bg-white/10 text-slate-300 hover:text-white hover:bg-white/15 border border-white/5'
              }`}
            >
              <span>{step.icon}</span>
              <span>{step.short}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Área Central del Visor con el Stream y HUD en Tiempo Real */}
      <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center">
        {/* Elemento Video del Stream en Vivo */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Cuadrícula de Ayuda para Encuadre de Trabajo */}
        {showGrid && !cameraError && (
          <div className="absolute inset-0 pointer-events-none z-10 grid grid-cols-3 grid-rows-3 border border-white/10">
            <div className="border-r border-b border-white/10"></div>
            <div className="border-r border-b border-white/10"></div>
            <div className="border-b border-white/10"></div>
            <div className="border-r border-b border-white/10"></div>
            <div className="border-r border-b border-white/10"></div>
            <div className="border-b border-white/10"></div>
            <div className="border-r border-white/10"></div>
            <div className="border-r border-white/10"></div>
            <div></div>
          </div>
        )}

        {/* Efecto Flash Obturador */}
        {flashActive && (
          <div className="absolute inset-0 bg-white z-30 transition-opacity duration-150 animate-fade-out pointer-events-none"></div>
        )}

        {/* Notificación Toast Flotante */}
        {toastMessage && (
          <div className="absolute top-4 z-30 bg-emerald-500 text-slate-950 font-black px-4 py-2 rounded-2xl shadow-xl flex items-center gap-2 text-xs border border-emerald-300 animate-bounce">
            <Check className="h-4 w-4 stroke-[3]" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Mensaje de Error si la Cámara no puede abrirse (ej. sin HTTPS o permisos denegados) */}
        {cameraError && (
          <div className="relative z-20 max-w-xs mx-auto p-4 bg-slate-900/90 backdrop-blur-md border border-white/10 rounded-2xl text-center space-y-3 text-white">
            <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Camera className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold">Cámara en Vivo No Disponible</h4>
              <p className="text-xs text-slate-300 mt-1">
                {cameraError === 'permission_denied'
                  ? 'Permiso de cámara denegado. Permite el acceso o utiliza la cámara nativa.'
                  : 'Para activar la cámara en vivo en teléfonos móviles se requiere conexión HTTPS o permisos del navegador.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => fallbackInputRef.current?.click()}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs rounded-xl shadow-lg transition active:scale-95 cursor-pointer"
            >
              Abrir Cámara del Teléfono
            </button>
          </div>
        )}

        {/* HUD EN TIEMPO REAL: Exactamente igual a Timestamp Camera Pro */}
        {!cameraError && (
          <div className="absolute bottom-3 right-3 z-20 pointer-events-none max-w-[85%] text-right select-none">
            <div className="p-2 sm:p-2.5 rounded-xl bg-black/40 backdrop-blur-xs border border-white/10 shadow-2xl">
              {hudLines.map((line, idx) => (
                <div
                  key={idx}
                  className="text-white font-semibold text-[11px] sm:text-xs leading-[1.32] tracking-wide"
                  style={{
                    textShadow: '0 1px 3px rgba(0,0,0,0.95), 0 0 5px rgba(0,0,0,0.9), 1px 1px 2px #000, -1px -1px 2px #000'
                  }}
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Categoría Activa flotando en la esquina inferior izquierda */}
        {!cameraError && (
          <div className="absolute bottom-3 left-3 z-20 pointer-events-none">
            <div className="px-2.5 py-1 rounded-xl bg-cyan-500/90 text-slate-950 font-black text-[11px] shadow-lg flex items-center gap-1.5 border border-cyan-300">
              <Camera className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>{category}</span>
            </div>
          </div>
        )}
      </div>

      {/* 4. Barra Inferior de Disparo y Acciones */}
      <div className="relative z-20 px-4 py-3 bg-gradient-to-t from-black/95 via-black/80 to-transparent flex items-center justify-between gap-4 shrink-0">
        {/* Esquina Izquierda: Botón Automático */}
        <div className="flex-1 flex justify-start">
          {onAutoAdvanceToggle && (
            <button
              type="button"
              onClick={() => onAutoAdvanceToggle(!autoAdvance)}
              className={`px-3 py-2 rounded-xl border text-xs font-black transition cursor-pointer flex items-center gap-1.5 shadow-md active:scale-95 ${
                autoAdvance
                  ? 'bg-cyan-500/25 border-cyan-400/60 text-cyan-300 ring-1 ring-cyan-400/30'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
              }`}
              title="Avanzar automáticamente de paso al tirar cada foto"
            >
              <span>Auto</span>
              <span className={`w-2 h-2 rounded-full transition ${autoAdvance ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]' : 'bg-slate-600'}`}></span>
            </button>
          )}
        </div>

        {/* Botón Disparador Central Grande (Shutter) */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={handleCapturePhoto}
            disabled={capturing || Boolean(cameraError)}
            className="group relative w-18 h-18 sm:w-20 sm:h-20 rounded-full border-4 border-white/80 p-1 flex items-center justify-center transition active:scale-90 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xl shadow-cyan-500/20"
            title="Tirar foto con sello GPS exacto"
          >
            <div className={`w-full h-full rounded-full transition-all duration-150 ${
              capturing ? 'bg-cyan-400 scale-90 animate-pulse' : 'bg-white group-hover:bg-cyan-100'
            }`}></div>
          </button>
        </div>

        {/* Esquina Derecha: Botón Listo */}
        <div className="flex-1 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition shadow-lg active:scale-95 cursor-pointer flex items-center gap-1.5"
            title="Terminar y volver a la orden"
          >
            <Check className="h-4 w-4 stroke-[3]" />
            <span>Listo</span>
          </button>
        </div>
      </div>
    </div>
  );
}
