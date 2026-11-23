import React, { useState, useRef, useEffect } from 'react';
import { 
  X, Upload, Trash2, Camera, Image as ImageIcon, 
  CheckCircle2, AlertCircle, Check, CheckCheck,
  ExternalLink, Share2, Copy, Clock, RotateCcw, Sparkles
} from 'lucide-react';
import ShareReportModal from './ShareReportModal';
import LiveCameraModal from './LiveCameraModal';
import { stampPhotoWithWatermark } from '../utils/watermark';
import { formatCableType } from '../utils/remarkUtils';
import {
  PHOTO_STEPS,
  isStepCompleted,
  getNextPendingStep
} from '../utils/photoSteps';

const QUICK_CANCEL_REASONS = [
  'Cliente cancela o no desea el servicio',
  'Perro suelto en la propiedad',
  'Cliente no estaba / Sin acceso',
  'Ducto o canalización obstruida',
  'Problema técnico en Tap / Línea principal',
  'Sin acceso a caja de entrada'
];

export default function PhotoModal({ order, isOpen, onClose, onPhotoUpdated, initialShowCancel = false }) {
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState('Casa');
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isLiveCameraOpen, setIsLiveCameraOpen] = useState(false);
  const [copiedReportText, setCopiedReportText] = useState(false);
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [savingCancel, setSavingCancel] = useState(false);
  const [localReported, setLocalReported] = useState(false);
  const [confirmingReactivate, setConfirmingReactivate] = useState(false);
  const [localStatusOverride, setLocalStatusOverride] = useState(null);
  const [localPhotosOverride, setLocalPhotosOverride] = useState(null);

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const cancelGalleryInputRef = useRef(null);
  const cancelPromptRef = useRef(null);
  const photoStepRefs = useRef({});

  useEffect(() => {
    if (isOpen) {
      setLocalStatusOverride(null);
      setLocalPhotosOverride(null);
      const currentWorkPhotos = (order?.photos || []).filter(p => p.category !== 'Constancia No Realizado');
      const initialPending = getNextPendingStep(currentWorkPhotos);
      setCategory(initialPending);
      setShowCancelPrompt(Boolean(initialShowCancel));
      setCancelReason('');
      setError(null);
      setLocalReported(false);
      setConfirmingReactivate(false);
    }
  }, [isOpen, order?.id, initialShowCancel]);

  const handleCloseModal = () => {
    setShowCancelPrompt(false);
    setCancelReason('');
    setError(null);
    setConfirmingReactivate(false);
    setLocalStatusOverride(null);
    setLocalPhotosOverride(null);
    if (onClose) onClose();
  };

  useEffect(() => {
    if (showCancelPrompt && cancelPromptRef.current) {
      setTimeout(() => {
        cancelPromptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 60);
    }
  }, [showCancelPrompt]);

  // Auto-scroll del selector de pasos en el modal para centrar la categoría activa
  useEffect(() => {
    if (!isOpen || !order) return;
    const targetEl = photoStepRefs.current[category];
    if (targetEl) {
      const timer = setTimeout(() => {
        try {
          targetEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        } catch (e) {
          targetEl.scrollIntoView(false);
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [category, isOpen, order]);

  if (!isOpen || !order) return null;

  const currentStatus = localStatusOverride !== null ? localStatusOverride : order.status;
  const currentPhotos = localPhotosOverride !== null ? localPhotosOverride : (order.photos || []);
  const allPhotos = [...currentPhotos].sort((a, b) => (a.id || 0) - (b.id || 0));
  const isCompleted = currentStatus === 'Completado' || currentStatus === 'completed';
  const isCancelled = currentStatus === 'No Realizado' || currentStatus === 'Cancelado' || currentStatus === 'cancelled' || currentStatus === 'no_realizado';
  const specificCancelPhotos = allPhotos.filter(p => p.category === 'Constancia No Realizado' || p.category === 'Motivo' || p.category === 'Obstáculo');
  const cancelPhotos = isCancelled && specificCancelPhotos.length === 0 ? allPhotos : specificCancelPhotos;
  const workPhotos = allPhotos.filter(p => p.category !== 'Constancia No Realizado');
  const workPhotosCount = workPhotos.length;
  const isReported = localStatusOverride === 'Pendiente' ? false : Boolean(order.whatsapp_shared || order.whatsapp_shared_at || localReported);

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('category', category);

    try {
      // Stamp each photo with real-time GPS coordinates, current timestamp, and actual photo site location
      for (let i = 0; i < files.length; i++) {
        const stamped = await stampPhotoWithWatermark(files[i], {
          fallbackAddress: order.address,
          fallbackCity: order.city,
          fallbackZip: order.zip_code,
          fallbackLat: order.latitude,
          fallbackLng: order.longitude
        });
        formData.append('photos', stamped);
      }

      const res = await fetch(`/api/orders/${order.id}/photos`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        if (data.photos && data.photos.length > 0) {
          setLocalPhotosOverride(prev => {
            const base = prev !== null ? prev : (order.photos || []);
            return [...base, ...data.photos];
          });
        }
        if (onPhotoUpdated) onPhotoUpdated();

        // Auto-avanzar al siguiente paso si está habilitado
        if (autoAdvance) {
          const currentIdx = PHOTO_STEPS.findIndex(s => s.id === category);
          if (currentIdx !== -1 && currentIdx < PHOTO_STEPS.length - 1) {
            setCategory(PHOTO_STEPS[currentIdx + 1].id);
          }
        }
      } else {
        setError(data.error || 'Error al subir fotos');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  const handleCancelPhotoUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('category', 'Constancia No Realizado');

    try {
      for (let i = 0; i < files.length; i++) {
        const stamped = await stampPhotoWithWatermark(files[i], {
          fallbackAddress: order.address,
          fallbackCity: order.city,
          fallbackZip: order.zip_code,
          fallbackLat: order.latitude,
          fallbackLng: order.longitude
        });
        formData.append('photos', stamped);
      }

      const res = await fetch(`/api/orders/${order.id}/photos`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        if (onPhotoUpdated) onPhotoUpdated();
      } else {
        setError(data.error || 'Error al subir foto de obstáculo');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (cancelGalleryInputRef.current) cancelGalleryInputRef.current.value = '';
    }
  };

  const handleOpenLiveCameraForCancel = () => {
    setCategory('Constancia No Realizado');
    setIsLiveCameraOpen(true);
  };

  const handleLivePhotoSaved = async (file, photoCategory) => {
    const targetCategory = photoCategory || category;
    const formData = new FormData();
    formData.append('category', targetCategory);
    formData.append('photos', file);

    const res = await fetch(`/api/orders/${order.id}/photos`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (res.ok) {
      if (data.photos && data.photos.length > 0) {
        setLocalPhotosOverride(prev => {
          const base = prev !== null ? prev : (order.photos || []);
          return [...base, ...data.photos];
        });
      }
      if (onPhotoUpdated) onPhotoUpdated();
    } else {
      throw new Error(data.error || 'Error al guardar foto');
    }
  };

  const handleDeletePhoto = async (photoId) => {
    if (!confirm('¿Eliminar esta foto de evidencia?')) return;
    try {
      const res = await fetch(`/api/photos/${photoId}`, { method: 'DELETE' });
      if (res.ok) {
        if (onPhotoUpdated) onPhotoUpdated();
      }
    } catch (err) {
      alert('Error eliminando foto: ' + err.message);
    }
  };

  const handleConfirmCompletion = async () => {
    if (workPhotosCount === 0) {
      setError('Debes tener al menos 1 foto de evidencia antes de finalizar el trabajo.');
      return;
    }

    setConfirming(true);
    setError(null);

    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...order, status: 'Completado', cancel_reason: '' })
      });

      if (res.ok) {
        order.status = 'Completado';
        if (onPhotoUpdated) onPhotoUpdated();
        // Abrir inmediatamente el modal de WhatsApp para compartir el reporte
        setIsShareModalOpen(true);
      } else {
        const data = await res.json();
        setError(data.error || 'Error al finalizar trabajo');
      }
    } catch (err) {
      setError('Error al finalizar: ' + err.message);
    } finally {
      setConfirming(false);
    }
  };

  const handleConfirmCancelled = async () => {
    if (!cancelReason.trim()) {
      setError('El motivo de cancelación es obligatorio. Selecciona o escribe la razón para continuar.');
      return;
    }
    const finalReason = cancelReason.trim();
    setSavingCancel(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...order, status: 'No Realizado', cancel_reason: finalReason })
      });
      if (res.ok) {
        order.status = 'No Realizado';
        order.cancel_reason = finalReason;
        if (onPhotoUpdated) onPhotoUpdated();
        setShowCancelPrompt(false);
      } else {
        const d = await res.json();
        setError(d.error || 'Error al guardar cancelación');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingCancel(false);
    }
  };

  const handleReactivateOrder = async () => {
    try {
      const res = await fetch(`/api/orders/${order.id}/reactivate`, {
        method: 'POST'
      });
      if (res.ok) {
        order.status = 'Pendiente';
        order.cancel_reason = '';
        order.whatsapp_shared = 0;
        order.whatsapp_shared_at = null;
        order.photos = [];
        setLocalStatusOverride('Pendiente');
        setLocalPhotosOverride([]);
        setConfirmingReactivate(false);
        setShowCancelPrompt(false);
        setLocalReported(false);
        setCategory('Casa');
        if (onPhotoUpdated) await onPhotoUpdated();
      } else {
        const err = await res.json().catch(() => ({}));
        alert('Error al reactivar orden: ' + (err.error || res.statusText));
      }
    } catch (err) {
      alert('Error al reactivar orden: ' + err.message);
    }
  };

  const handleCopyReportDirect = async () => {
    const hasDriveway = Boolean(
      order.bore_type && (
        order.bore_type.includes('DW') || 
        order.bore_type.toLowerCase().includes('driveway') || 
        order.bore_type === 'Y'
      )
    );

    const text = `📋 *REPORTE DE TRABAJO*
📅 *Fecha:* ${order.work_date}
🔢 *Orden #:* ${order.job_id}
📍 *Dirección:* ${order.address}${order.city ? `, ${order.city}` : ''}
📏 *Pies / Drop:* ${order.drop_footage} ft (${order.cable_type || 'RG-6'})
🚗 *Driveway:* ${hasDriveway ? 'Sí' : 'No'}
📸 *Fotos:* ${workPhotosCount} evidencia(s)
✅ *Estado:* Completado y Verificado`;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedReportText(true);
      setTimeout(() => setCopiedReportText(false), 2000);
    } catch (e) {}
  };

  return (
    <div 
      className="fixed inset-0 z-[70] flex items-center justify-center p-3.5 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in modal-overlay-safe"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px) + 16px, 1.25rem)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 1.25rem)'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCloseModal();
      }}
    >
      <div 
        className="bg-[#101722] border border-white/10 rounded-3xl w-full max-w-sm sm:max-w-md h-[80dvh] sm:h-[82dvh] modal-sheet-compact flex flex-col overflow-hidden shadow-2xl text-white transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* 1. Header (Estructura y proporciones idénticas a Travesía del Día) */}
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-white dark:bg-slate-900/70 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-md ${
              showCancelPrompt || isCancelled
                ? 'bg-gradient-to-tr from-rose-500 to-amber-600 text-white shadow-rose-500/20'
                : 'bg-gradient-to-tr from-cyan-500 to-blue-600 text-slate-950 shadow-cyan-500/20'
            }`}>
              {showCancelPrompt || isCancelled ? (
                <AlertCircle className="h-4 w-4 stroke-[2.5]" />
              ) : (
                <Camera className="h-4 w-4 stroke-[2.5]" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-slate-900 dark:text-white truncate">
                {showCancelPrompt || isCancelled
                  ? 'Constancia de trabajo no realizado'
                  : 'Evidencias del Trabajo'}
              </h3>
              <p className="text-[10.5px] text-slate-600 dark:text-slate-400 font-semibold truncate">
                #{order.job_id} • {order.address}{order.city ? `, ${order.city}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCloseModal}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition cursor-pointer"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 2. Quick KPI / Specs Bar (Metraje y Cable separados para mayor claridad) */}
        {!showCancelPrompt && !isCancelled && (
          <div className="grid grid-cols-4 gap-1.5 px-3.5 py-2 bg-[#0d141e] border-b border-white/5 shrink-0 text-center">
            <div className="bg-[#16202c] p-1.5 rounded-xl border border-white/5 min-w-0">
              <span className="text-[8.5px] uppercase tracking-wider text-slate-400 font-bold block truncate">
                Metraje
              </span>
              <span className="text-xs sm:text-sm font-black text-amber-400 font-mono truncate block">
                {order.drop_footage || 0} ft
              </span>
            </div>
            <div className="bg-[#16202c] p-1.5 rounded-xl border border-white/5 min-w-0">
              <span className="text-[8.5px] uppercase tracking-wider text-slate-400 font-bold block truncate">
                Cable
              </span>
              <span className="text-xs sm:text-sm font-black text-cyan-400 font-mono truncate block">
                {formatCableType(order.cable_type)}
              </span>
            </div>
            <div className="bg-[#16202c] p-1.5 rounded-xl border border-white/5 min-w-0">
              <span className="text-[8.5px] uppercase tracking-wider text-slate-400 font-bold block truncate">
                Evidencia
              </span>
              <span className="text-xs sm:text-sm font-black font-mono truncate block text-white">
                {workPhotosCount} {workPhotosCount === 1 ? 'foto' : 'fotos'}
              </span>
            </div>
            <div className="bg-[#16202c] p-1.5 rounded-xl border border-white/5 min-w-0">
              <span className="text-[8.5px] uppercase tracking-wider text-slate-400 font-bold block truncate">
                Tarifa
              </span>
              <span className="text-xs sm:text-sm font-black font-mono text-emerald-400 truncate block">
                ${order.rate_calculated || 100}
              </span>
            </div>
          </div>
        )}

        {/* 3. Action Bar: Tomar Foto (Solo visible si el trabajo NO está cancelado y no está abierto el motivo de no realizado) */}
        {!isCancelled && !showCancelPrompt && (
          <>
            <div className="px-4 py-2.5 bg-[#0e1622] border-b border-white/5 shrink-0">
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleUpload}
                disabled={uploading}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => {
                  if (autoAdvance && isStepCompleted(category, workPhotos)) {
                    const nextPending = getNextPendingStep(workPhotos, category);
                    setCategory(nextPending);
                  }
                  setIsLiveCameraOpen(true);
                }}
                disabled={uploading}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 hover:from-blue-500 hover:to-cyan-400 text-white font-black text-xs shadow-md shadow-cyan-600/20 flex items-center justify-center gap-2 active:scale-95 transition cursor-pointer disabled:opacity-50"
                title="Tomar foto de evidencia con visor en tiempo real"
              >
                <Camera className="h-4 w-4 stroke-[2.2]" />
                <span>{uploading ? 'Procesando...' : 'Tomar Foto'}</span>
              </button>
            </div>

            {/* 4. Selector Lineal de Pasos */}
            <div className="px-4 py-2 border-b border-white/5 bg-[#101722] shrink-0 overflow-x-auto scrollbar-none">
              <div className="flex items-center gap-1.5 py-0.5">
                {PHOTO_STEPS.map((step) => {
                  const isSelected = category === step.id;
                  const hasPhotos = isStepCompleted(step.id, workPhotos);
                  return (
                    <button
                      key={step.id}
                      ref={(el) => { photoStepRefs.current[step.id] = el; }}
                      type="button"
                      onClick={() => setCategory(step.id)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition whitespace-nowrap cursor-pointer flex items-center gap-1 shrink-0 ${
                        isSelected
                          ? 'bg-cyan-500 text-slate-950 shadow-sm'
                          : hasPhotos
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <span>{step.icon}</span>
                      <span>{step.short}</span>
                      {hasPhotos && !isSelected && (
                        <span className="text-[9px] text-emerald-400 font-black">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* 5. Cuerpo del Modal Scrollable */}
        <div className="p-3.5 sm:p-4 overflow-y-auto space-y-3.5 flex-1 min-h-0 scrollbar-none bg-[#101722] flex flex-col">
          {error && (
            <div className="p-2.5 bg-rose-500/15 border border-rose-500/35 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* CASO 1: Formulario para Declarar Trabajo No Realizado */}
          {showCancelPrompt ? (
            <div ref={cancelPromptRef} className="space-y-3.5 animate-in fade-in">
              {/* 1. SECCIÓN DE FOTOS DEL OBSTÁCULO CON CÁMARA GPS Y HORA */}
              <div className="p-3.5 bg-rose-950/20 border border-rose-500/30 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Camera className="h-4 w-4 text-rose-400" />
                    <span className="text-xs font-bold text-rose-300">
                      Foto del Obstáculo (Sello GPS & Hora)
                    </span>
                  </div>
                  {cancelPhotos.length > 0 && (
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-lg">
                      ✓ {cancelPhotos.length} {cancelPhotos.length === 1 ? 'foto lista' : 'fotos listas'}
                    </span>
                  )}
                </div>

                {/* Botón de Captura: Solo Cámara en Vivo GPS a todo lo largo */}
                <button
                  type="button"
                  onClick={handleOpenLiveCameraForCancel}
                  disabled={uploading}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-black text-xs shadow-md shadow-rose-600/20 flex items-center justify-center gap-2 active:scale-95 transition cursor-pointer disabled:opacity-50"
                  title="Tomar foto de obstáculo con visor de cámara en vivo y sello GPS"
                >
                  <Camera className="h-4 w-4 stroke-[2.2]" />
                  <span>{uploading ? 'Procesando...' : 'Tomar Foto del Obstáculo (Cámara GPS)'}</span>
                </button>

                {/* Previsualización de Foto(s) con Altura Fija Estable (no cambia de tamaño al agregar fotos) */}
                <div className="h-24 rounded-xl border border-rose-500/30 bg-black/30 p-1.5 overflow-hidden flex items-center justify-center">
                  {cancelPhotos.length > 0 ? (
                    <div className="w-full h-full flex items-center gap-2 overflow-x-auto scrollbar-none">
                      {cancelPhotos.map((photo, idx) => (
                        <div
                          key={photo.id}
                          onClick={() => setPreviewPhoto(photo.photo_data || `/uploads/${photo.filename}`)}
                          className="group relative h-full aspect-[4/3] rounded-lg overflow-hidden border border-rose-500/40 shrink-0 bg-[#0e1622] cursor-pointer shadow-xs"
                        >
                          <img
                            src={photo.photo_data || `/uploads/${photo.filename}`}
                            alt={`Obstáculo ${idx + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent flex flex-col justify-between p-1">
                            <div className="flex justify-between items-center" onClick={(e) => e.stopPropagation()}>
                              <span className="text-[8.5px] bg-black/80 text-rose-300 px-1 py-0.2 rounded font-bold">
                                #{idx + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeletePhoto(photo.id)}
                                title="Eliminar foto"
                                className="p-0.5 bg-black/70 hover:bg-rose-600 text-slate-300 hover:text-white rounded transition cursor-pointer"
                              >
                                <Trash2 className="h-2.5 w-2.5" />
                              </button>
                            </div>
                            <span className="text-[8.5px] text-slate-300 flex items-center gap-0.5 font-medium">
                              <span>Ver</span>
                              <ExternalLink className="h-2 w-2" />
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 text-rose-300/70 text-xs">
                      <Camera className="h-4 w-4 text-rose-400/50" />
                      <span className="text-[11px] font-semibold text-rose-200/80">Espacio para fotos del obstáculo</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. SECCIÓN DEL MOTIVO DE CANCELACIÓN (REQUERIDO EN LA ESQUINA Y TOGGLE AL CLICKEAR) */}
              <div className="p-3 bg-rose-950/20 border border-rose-500/30 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 text-rose-400" />
                    <span className="text-xs font-bold text-rose-300 uppercase tracking-wider">
                      Motivo de Cancelación
                    </span>
                  </div>
                  <span className="text-[9.5px] font-black text-rose-300 bg-rose-500/25 border border-rose-500/40 px-2 py-0.5 rounded-md uppercase tracking-wider shadow-2xs">
                    Requerido *
                  </span>
                </div>

                {/* Quick Reason Chips (clic para activar y clic de nuevo para desactivar) */}
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_CANCEL_REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => {
                        setCancelReason((prev) => (prev === reason ? '' : reason));
                        setError(null);
                      }}
                      className={`text-[10.5px] px-2.5 py-1.5 rounded-xl border transition font-medium text-left cursor-pointer ${
                        cancelReason === reason
                          ? 'bg-rose-600 text-white border-rose-500 font-bold shadow-sm'
                          : 'bg-[#101722] text-slate-300 border-rose-500/25 hover:border-rose-400/60 hover:text-white'
                      }`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  placeholder="O escribe otro motivo específico..."
                  value={cancelReason}
                  onChange={(e) => {
                    setCancelReason(e.target.value);
                    if (e.target.value.trim()) setError(null);
                  }}
                  className="w-full h-9 px-3 text-xs bg-[#0d141e] border border-rose-500/30 focus:border-rose-500 rounded-xl text-white placeholder-slate-500 focus:outline-none"
                />
              </div>
            </div>
          ) : isCancelled ? (
            /* CASO 2: El Trabajo ya está marcado como No Realizado */
            <div className="space-y-3 flex-1 flex flex-col min-h-0">
              <div className="relative p-4 bg-rose-950/25 border border-rose-500/35 rounded-2xl text-center space-y-2.5 overflow-hidden shrink-0">
                {confirmingReactivate ? (
                  <div className="absolute inset-0 bg-[#160c14]/95 backdrop-blur-xs rounded-2xl p-3 flex flex-col items-center justify-center text-center z-20 animate-fade-in border border-rose-500/40">
                    <p className="text-xs font-black text-white leading-snug">
                      ¿Reactivar este trabajo desde cero?
                    </p>
                    <p className="text-[10px] text-rose-200/90 mt-1 mb-2 max-w-[92%] leading-tight">
                      Se pasará a Pendiente, se eliminarán las fotos de constancia y se limpiará el reporte para iniciar el trámite normal.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmingReactivate(false)}
                        className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-slate-300 text-xs font-semibold transition active:scale-95 cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleReactivateOrder}
                        className="px-3 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition active:scale-95 cursor-pointer shadow-sm"
                      >
                        Sí, Reactivar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingReactivate(true)}
                    className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/35 text-[11px] font-bold transition active:scale-95 cursor-pointer shadow-xs z-10"
                    title="Reactivar trabajo para continuar con la instalación"
                  >
                    <RotateCcw className="h-3 w-3 stroke-[2.5]" />
                    <span>Reactivar</span>
                  </button>
                )}

                <div className="w-10 h-10 mx-auto rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-rose-300">Trabajo No Realizado</h4>
                  <p className="text-xs text-slate-200 mt-1 font-semibold max-w-[85%] mx-auto">
                    "{order.cancel_reason || 'Inconveniente en la propiedad'}"
                  </p>
                </div>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setCategory('Constancia No Realizado');
                      setIsLiveCameraOpen(true);
                    }}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 shadow-md active:scale-95 transition cursor-pointer"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>Tomar Foto del Obstáculo (GPS)</span>
                  </button>
                </div>
              </div>

              {/* Fotos del Obstáculo / Constancia (expande ocupando todo el espacio restante) */}
              <div className="space-y-2 flex-1 flex flex-col min-h-0">
                <span className="text-[10px] font-bold text-rose-300 uppercase tracking-wider block shrink-0">
                  Fotos del Obstáculo ({cancelPhotos.length})
                </span>

                {cancelPhotos.length > 0 ? (
                  <div className="flex-1 min-h-[160px] p-2 bg-[#0d141e]/50 rounded-2xl border border-rose-500/25 overflow-y-auto sleek-scroll">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {cancelPhotos.map((photo, idx) => (
                        <div
                          key={photo.id || idx}
                          onClick={() => setPreviewPhoto(photo.photo_data || `/uploads/${photo.filename}`)}
                          className="group relative bg-[#16202c] border border-rose-500/30 hover:border-rose-400 rounded-xl overflow-hidden aspect-video shadow-xs transition cursor-pointer"
                          title="Toca para ver la foto completa"
                        >
                          <img
                            src={photo.photo_data || `/uploads/${photo.filename}`}
                            alt={`Motivo ${idx + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent flex flex-col justify-between p-1">
                            <div className="flex justify-between items-center" onClick={(e) => e.stopPropagation()}>
                              <span className="text-[8.5px] bg-black/85 backdrop-blur-xs text-rose-300 border border-rose-400/30 px-1 py-0.2 rounded font-bold truncate max-w-[70%]">
                                Motivo
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeletePhoto(photo.id)}
                                title="Eliminar foto"
                                className="p-1 bg-black/70 hover:bg-rose-600 text-slate-300 hover:text-white rounded transition shadow active:scale-90 cursor-pointer"
                              >
                                <Trash2 className="h-2.5 w-2.5" />
                              </button>
                            </div>
                            <span className="text-[9px] text-slate-300 flex items-center gap-0.5 font-medium truncate group-hover:text-rose-300">
                              <span>Ver</span>
                              <ExternalLink className="h-2 w-2" />
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 min-h-[160px] rounded-2xl border border-dashed border-rose-500/35 bg-[#0d141e]/40 flex flex-col items-center justify-center p-4 text-center space-y-1">
                    <Camera className="h-7 w-7 text-rose-400/50 mb-0.5" />
                    <p className="text-xs font-bold text-rose-200">
                      No hay fotos de obstáculo adjuntas aún
                    </p>
                    <p className="text-[10.5px] text-slate-400 max-w-xs leading-relaxed">
                      Toca "Tomar Foto del Obstáculo (GPS)" para agregar la evidencia.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* CASO 3: Vista Normal de Evidencias de Instalación */
            <div className="space-y-2 flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between gap-1 flex-wrap shrink-0">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Fotos de Instalación ({workPhotosCount})
                </span>

                <div className="flex items-center gap-1.5">
                  {/* Botón Copiar Reporte */}
                  <button
                    type="button"
                    onClick={handleCopyReportDirect}
                    className="px-2.5 py-1 bg-[#16202c] hover:bg-[#1e2b3b] text-slate-300 border border-white/10 rounded-lg text-[10px] font-bold flex items-center gap-1 transition shadow-xs cursor-pointer active:scale-95"
                    title="Copiar texto del reporte para pegar en WhatsApp"
                  >
                    {copiedReportText ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-cyan-400" />}
                    <span>{copiedReportText ? '¡Copiado!' : 'Copiar'}</span>
                  </button>

                  {/* Botón Modo Auto */}
                  <button
                    type="button"
                    onClick={() => setAutoAdvance(prev => !prev)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer active:scale-95 ${
                      autoAdvance
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-cyan-500/10'
                        : 'bg-[#16202c] hover:bg-[#1e2b3b] text-slate-300 border border-white/10'
                    }`}
                    title={autoAdvance ? "Modo Auto activo: Selecciona el siguiente paso pendiente automáticamente" : "Modo Auto desactivado: Toca para activar avance automático"}
                  >
                    <Sparkles className={`h-3 w-3 ${autoAdvance ? 'text-cyan-400' : 'text-slate-400'}`} />
                    <span>Auto</span>
                    <span className={`w-1.5 h-1.5 rounded-full transition ${autoAdvance ? 'bg-cyan-400 shadow-[0_0_6px_#22d3ee]' : 'bg-slate-600'}`} />
                  </button>
                </div>
              </div>

              {workPhotosCount === 0 ? (
                <div className="flex-1 min-h-[220px] sm:min-h-[250px] border border-dashed border-white/10 rounded-2xl bg-[#0e1622]/60 flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 mb-3 shadow-inner">
                    <ImageIcon className="h-6 w-6 text-cyan-400/70" />
                  </div>
                  <p className="text-xs sm:text-sm text-slate-300 font-bold">
                    Aún no hay fotos de la instalación
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1.5 max-w-[240px] leading-relaxed">
                    Toca "Tomar Foto" para registrar la evidencia con sello GPS y hora.
                  </p>
                </div>
              ) : (
                <div className="flex-1 min-h-[220px] sm:min-h-[250px] overflow-y-auto sleek-scroll p-2 bg-[#0d141e]/50 rounded-2xl border border-white/5">
                  <div className="grid grid-cols-3 gap-2">
                    {workPhotos.map((photo) => (
                      <div
                        key={photo.id}
                        onClick={() => setPreviewPhoto(photo.photo_data || `/uploads/${photo.filename}`)}
                        className="group relative bg-[#16202c] border border-white/10 hover:border-cyan-400/80 rounded-xl overflow-hidden aspect-video shadow-xs transition cursor-pointer"
                        title="Toca para ver la foto completa"
                      >
                        <img
                          src={photo.photo_data || `/uploads/${photo.filename}`}
                          alt={photo.category}
                          className="w-full h-full object-cover group-hover:scale-105 transition"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent flex flex-col justify-between p-1">
                          <div className="flex justify-between items-center" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[8.5px] bg-black/85 backdrop-blur-xs text-cyan-300 border border-cyan-400/30 px-1 py-0.2 rounded font-bold truncate max-w-[70%]">
                              {photo.category}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeletePhoto(photo.id)}
                              title="Eliminar foto"
                              className="p-1 bg-black/70 hover:bg-rose-600 text-slate-300 hover:text-white rounded transition shadow active:scale-90 cursor-pointer"
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          </div>
                          <span className="text-[9px] text-slate-300 flex items-center gap-0.5 font-medium truncate group-hover:text-cyan-300">
                            <span>Ver</span>
                            <ExternalLink className="h-2 w-2" />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 6. Footer: Exactamente 2 Botones Limpios y Bien Distribuidos */}
        <div className="px-4 py-3 border-t border-white/10 bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
          {showCancelPrompt ? (
            <>
              <button
                type="button"
                onClick={() => setShowCancelPrompt(false)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 text-xs font-bold transition active:scale-95 cursor-pointer border border-white/10"
              >
                <span>Volver a Evidencias</span>
              </button>

              <button
                type="button"
                disabled={savingCancel || !cancelReason.trim()}
                onClick={handleConfirmCancelled}
                className={`px-4 py-2 font-black text-xs rounded-xl flex items-center gap-1.5 transition active:scale-95 cursor-pointer ${
                  !cancelReason.trim()
                    ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed shadow-none'
                    : 'bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-lg shadow-rose-600/30'
                }`}
                title={!cancelReason.trim() ? "Selecciona o escribe el motivo para poder confirmar" : "Confirmar reporte de trabajo no realizado"}
              >
                <Check className="h-4 w-4 stroke-[3]" />
                <span>{savingCancel ? 'Guardando...' : !cancelReason.trim() ? 'Motivo Requerido' : 'Confirmar Reporte'}</span>
              </button>
            </>
          ) : isCancelled ? (
            <>
              <button
                type="button"
                onClick={handleCloseModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white text-xs font-bold transition active:scale-95 cursor-pointer border border-white/10 shadow-sm"
              >
                <span>Cerrar</span>
              </button>

              {isReported ? (
                <div 
                  className="px-3.5 py-2 text-xs font-black rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm flex items-center gap-1.5 select-none"
                  title="Constancia de trabajo no realizado reportada exitosamente"
                >
                  <span>Reportado</span>
                  <CheckCheck className="h-4 w-4 stroke-[2.5] text-rose-400" />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsShareModalOpen(true)}
                  className="px-4 py-2 bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-black text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition active:scale-95 cursor-pointer"
                  title="Enviar constancia por WhatsApp"
                >
                  <Share2 className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>Enviar Constancia</span>
                </button>
              )}
            </>
          ) : (
            <>
              {isReported ? (
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white text-xs font-bold transition active:scale-95 cursor-pointer border border-white/10 shadow-sm"
                >
                  <span>Cerrar</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCancelPrompt(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer border bg-white/10 hover:bg-white/15 text-rose-300 hover:text-white border-white/10"
                  title="Marcar trabajo como No Realizado"
                >
                  <X className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>No Realizado</span>
                </button>
              )}

              {isReported ? (
                <div 
                  className="px-3.5 py-2 text-xs font-black rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-sm flex items-center gap-1.5 select-none"
                  title="Trabajo completado y reportado exitosamente"
                >
                  <span>Reportado</span>
                  <CheckCheck className="h-4 w-4 stroke-[2.5] text-cyan-400" />
                </div>
              ) : isCompleted ? (
                <button
                  type="button"
                  onClick={() => setIsShareModalOpen(true)}
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 text-white font-black text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
                  title="Abrir ventana para compartir reporte y fotos por WhatsApp"
                >
                  <Share2 className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>Enviar Reporte</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={workPhotosCount === 0 || confirming || uploading}
                  onClick={handleConfirmCompletion}
                  className={`px-4 py-2 text-xs font-black rounded-xl shadow-lg transition active:scale-95 flex items-center gap-1.5 cursor-pointer ${
                    workPhotosCount > 0
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/25 ring-2 ring-emerald-400/30'
                      : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  }`}
                  title={workPhotosCount > 0 ? "Completar trabajo y abrir reporte" : "Debes tomar al menos 1 foto para finalizar"}
                >
                  <Check className="h-4 w-4 stroke-[3]" />
                  <span>
                    {confirming 
                      ? 'Finalizando...' 
                      : workPhotosCount > 0 
                      ? 'Finalizar Trabajo' 
                      : 'Foto Requerida'}
                  </span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* FULLSCREEN PHOTO PREVIEW MODAL (FOTO CENTRADA Y BOTONES DESPEGADOS) */}
      {previewPhoto && (
        <div
          onClick={() => setPreviewPhoto(null)}
          className="fixed inset-0 z-[80] bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-4 animate-fade-in select-none"
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 0px) + 12px, 1rem)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 1.25rem)'
          }}
        >
          {/* Barra superior con botón X despejado en la esquina superior derecha sin tapar la foto */}
          <div className="w-full flex items-center justify-end px-2 py-1 shrink-0 z-50">
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="p-2.5 rounded-full bg-slate-900/90 text-white hover:text-cyan-400 border border-white/20 shadow-2xl transition active:scale-90 cursor-pointer"
              title="Cerrar foto"
            >
              <X className="h-5 w-5 stroke-[2.5]" />
            </button>
          </div>

          {/* Contenedor central: foto perfectamente centrada en el medio */}
          <div 
            className="flex-1 min-h-0 w-full flex items-center justify-center p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewPhoto}
              alt="Evidencia Completa"
              className="max-h-[62dvh] sm:max-h-[68dvh] max-w-[92vw] sm:max-w-lg w-auto h-auto rounded-2xl object-contain border border-white/10 shadow-2xl"
            />
          </div>

          {/* Botón inferior despegado abajo con margen prudente */}
          <div className="shrink-0 pt-3 pb-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="px-6 py-2.5 bg-[#16202c] hover:bg-[#1e2b3b] text-white border border-white/15 rounded-xl text-xs font-bold transition shadow-xl active:scale-95 cursor-pointer flex items-center gap-2"
            >
              <X className="h-4 w-4" />
              <span>Cerrar Foto</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE REPORTE Y WHATSAPP COMPARTIDO */}
      <ShareReportModal
        isOpen={isShareModalOpen}
        order={order}
        onClose={() => setIsShareModalOpen(false)}
        onOrderUpdated={() => {
          setLocalReported(true);
          if (onPhotoUpdated) onPhotoUpdated();
        }}
        onShared={(orderId) => {
          setIsShareModalOpen(false);
          if (onClose) onClose();
          if (onPhotoUpdated) onPhotoUpdated();
        }}
      />

      {/* VISOR DE CÁMARA EN VIVO CON SELLO GPS EN TIEMPO REAL */}
      {isLiveCameraOpen && (
        <LiveCameraModal
          isOpen={isLiveCameraOpen}
          onClose={() => setIsLiveCameraOpen(false)}
          order={order}
          initialCategory={category}
          onPhotoSaved={handleLivePhotoSaved}
          autoAdvance={autoAdvance}
          onAutoAdvanceToggle={setAutoAdvance}
          workPhotosCount={workPhotosCount}
          existingPhotos={workPhotos}
          onCategoryChange={setCategory}
        />
      )}
    </div>
  );
}
