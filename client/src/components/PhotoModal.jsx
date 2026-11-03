import React, { useState, useRef, useEffect } from 'react';
import { 
  X, Upload, Trash2, Camera, Image as ImageIcon, 
  CheckCircle2, AlertCircle, Check, 
  ExternalLink, Share2, Copy
} from 'lucide-react';
import ShareReportModal from './ShareReportModal';
import { stampPhotoWithWatermark } from '../utils/watermark';

const PHOTO_STEPS = [
  { id: 'Casa/Ground Block', label: 'Casa / Entrada', short: 'Casa', icon: '🏠' },
  { id: 'Terreno/Ruta', label: 'Terreno / Zanja', short: 'Terreno', icon: '🌱' },
  { id: 'Trabajo Terminado', label: 'Finalizado', short: 'Finalizado', icon: '✨' },
  { id: 'Pedestal/Tap', label: 'Pedestal / Tap', short: 'Pedestal', icon: '⚡' },
  { id: 'General', label: 'General / Extra', short: 'Extra', icon: '📷' }
];

const QUICK_CANCEL_REASONS = [
  'Perro suelto en la propiedad',
  'Cliente no estaba / Sin acceso',
  'Cliente cancela o no desea servicio',
  'Ducto o canalización obstruida',
  'Problema técnico en Tap / Línea principal',
  'Sin acceso a caja de entrada'
];

export default function PhotoModal({ order, isOpen, onClose, onPhotoUpdated }) {
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState('Casa/Ground Block');
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [copiedReportText, setCopiedReportText] = useState(false);
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [savingCancel, setSavingCancel] = useState(false);

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const cancelPromptRef = useRef(null);

  useEffect(() => {
    if (showCancelPrompt && cancelPromptRef.current) {
      setTimeout(() => {
        cancelPromptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 60);
    }
  }, [showCancelPrompt]);

  if (!isOpen || !order) return null;

  const allPhotos = order.photos || [];
  const workPhotos = allPhotos.filter(p => p.category !== 'Constancia No Realizado');
  const cancelPhotos = allPhotos.filter(p => p.category === 'Constancia No Realizado');
  const workPhotosCount = workPhotos.length;
  const isCompleted = order.status === 'Completado';

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
        if (onPhotoUpdated) onPhotoUpdated();

        // Auto-avanzar al siguiente paso si está habilitado
        if (autoAdvance) {
          const currentIdx = PHOTO_STEPS.findIndex(s => s.id === category);
          if (currentIdx !== -1 && currentIdx < PHOTO_STEPS.length - 2) {
            setCategory(PHOTO_STEPS[currentIdx + 1].id);
          } else if (currentIdx === PHOTO_STEPS.length - 2) {
            setCategory('General');
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
    const finalReason = cancelReason.trim() || 'No realizado por inconveniente en la propiedad';
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
        onClose();
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-[#101722] border border-white/10 rounded-3xl max-w-sm sm:max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl text-white transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* 1. Header (Estructura y proporciones idénticas a Travesía del Día) */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-white dark:bg-slate-900/70 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shrink-0 shadow-md shadow-cyan-500/20">
              <Camera className="h-4 w-4 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-slate-900 dark:text-white truncate">
                Evidencias del Trabajo
              </h3>
              <p className="text-[10.5px] text-slate-600 dark:text-slate-400 font-semibold truncate">
                #{order.job_id} • {order.address}{order.city ? `, ${order.city}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition cursor-pointer"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 2. Quick KPI / Specs Bar (Idéntico a la barra superior de Travesía) */}
        <div className="grid grid-cols-3 gap-2 px-4 py-2.5 bg-[#0d141e] border-b border-white/5 shrink-0 text-center">
          <div className="bg-[#16202c] p-2 rounded-xl border border-white/5">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
              Metraje / Cable
            </span>
            <span className="text-sm font-black text-cyan-400 font-mono truncate block">
              {order.drop_footage || 0} ft • {order.cable_type || 'RG-6'}
            </span>
          </div>
          <div className="bg-[#16202c] p-2 rounded-xl border border-white/5">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
              Evidencias
            </span>
            <span className="text-sm font-black text-white font-mono">
              {workPhotosCount} {workPhotosCount === 1 ? 'foto' : 'fotos'}
            </span>
          </div>
          <div className="bg-[#16202c] p-2 rounded-xl border border-white/5">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
              Tarifa
            </span>
            <span className="text-sm font-black text-emerald-400 font-mono">
              ${order.rate_calculated || 100}
            </span>
          </div>
        </div>

        {/* 3. Action Bar: Tomar Foto y Desde Galería */}
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

          <input
            ref={galleryInputRef}
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif,image/webp,.jpg,.jpeg,.png,.heic"
            multiple
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
              className="py-2 px-3 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 hover:from-blue-500 hover:to-cyan-400 text-white font-black text-xs shadow-md shadow-cyan-600/20 flex items-center justify-center gap-2 active:scale-95 transition cursor-pointer disabled:opacity-50"
            >
              <Camera className="h-3.5 w-3.5 stroke-[2.2]" />
              <span>{uploading ? 'Estampando GPS...' : 'Tomar Foto'}</span>
            </button>

            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              disabled={uploading}
              className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 hover:text-white border border-white/10 font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition cursor-pointer shadow-sm disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5 stroke-[2] text-slate-400" />
              <span>{uploading ? 'Procesando...' : 'Desde Galería'}</span>
            </button>
          </div>
        </div>

        {/* 4. Selector de Pasos (Estilo pestañas de estado de Travesía) */}
        <div className="flex items-center justify-between gap-1.5 px-4 py-2 border-b border-white/5 bg-[#101722] shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-1 py-0.5">
            {PHOTO_STEPS.map((step) => {
              const isSelected = category === step.id;
              const hasPhotos = workPhotos.some(p => p.category === step.id);
              return (
                <button
                  key={step.id}
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
                </button>
              );
            })}
          </div>

          <label className="flex items-center gap-1 cursor-pointer text-slate-400 hover:text-cyan-300 text-[10px] shrink-0 select-none font-medium ml-1">
            <input
              type="checkbox"
              checked={autoAdvance}
              onChange={(e) => setAutoAdvance(e.target.checked)}
              className="h-3 w-3 rounded border-white/20 bg-slate-900 text-cyan-500 focus:ring-0"
            />
            <span className="hidden sm:inline">Auto</span>
          </label>
        </div>

        {/* 5. Cuerpo del Modal Scrollable */}
        <div className="p-4 overflow-y-auto space-y-3.5 flex-1 scrollbar-none bg-[#101722]">
          {error && (
            <div className="p-2.5 bg-rose-500/15 border border-rose-500/35 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Galería Compacta de Fotos de Instalación */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-1 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Fotos de Instalación ({workPhotosCount})
              </span>

              {/* Botones Rápidos de Reporte y WhatsApp */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopyReportDirect}
                  className="px-2.5 py-1 bg-[#16202c] hover:bg-[#1e2b3b] text-slate-300 border border-white/10 rounded-lg text-[10px] font-bold flex items-center gap-1 transition shadow-xs cursor-pointer active:scale-95"
                  title="Copiar texto del reporte para pegar en WhatsApp"
                >
                  {copiedReportText ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-cyan-400" />}
                  <span>{copiedReportText ? '¡Copiado!' : 'Copiar'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsShareModalOpen(true)}
                  className="px-2.5 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1 transition shadow-xs cursor-pointer active:scale-95"
                  title="Abrir ventana para enviar reporte y fotos por WhatsApp"
                >
                  <Share2 className="h-3 w-3 text-emerald-400" />
                  <span>Reportar</span>
                </button>
              </div>
            </div>

            {workPhotosCount === 0 ? (
              <div className="text-center py-7 border border-dashed border-white/10 rounded-2xl bg-[#0e1622]/60">
                <ImageIcon className="h-7 w-7 text-slate-600 mx-auto mb-1.5" />
                <p className="text-xs text-slate-400 font-medium">
                  Aún no hay fotos de la instalación
                </p>
                <p className="text-[10.5px] text-slate-500 mt-0.5">
                  Toca "Tomar Foto" para registrar la evidencia con sello GPS
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {workPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    onClick={() => setPreviewPhoto(photo.photo_data || `/uploads/${photo.filename}`)}
                    className="group relative bg-[#16202c] border border-white/10 hover:border-cyan-400/50 rounded-2xl overflow-hidden aspect-video shadow-xs transition cursor-pointer"
                  >
                    <img
                      src={photo.photo_data || `/uploads/${photo.filename}`}
                      alt={photo.category}
                      className="w-full h-full object-cover group-hover:scale-105 transition"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent flex flex-col justify-between p-1.5">
                      <div className="flex justify-between items-center" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[9px] bg-black/80 backdrop-blur-xs text-cyan-300 border border-cyan-400/20 px-1.5 py-0.5 rounded-md font-bold truncate max-w-[85%]">
                          {photo.category}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeletePhoto(photo.id)}
                          title="Eliminar foto"
                          className="p-1 bg-black/70 hover:bg-rose-600 text-slate-300 hover:text-white rounded-md transition shadow active:scale-90 cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPreviewPhoto(photo.photo_data || `/uploads/${photo.filename}`)}
                        className="text-[10px] text-slate-300 truncate hover:text-cyan-300 hover:underline flex items-center gap-1 self-start font-medium cursor-pointer"
                      >
                        <span>Ver completa</span>
                        <ExternalLink className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sección Aislada: Constancias de Cancelación Previas (Si existen) */}
          {cancelPhotos.length > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                  <AlertCircle className="h-4 w-4 text-amber-400" />
                  <span>Constancia de Cancelación Previa ({cancelPhotos.length})</span>
                </div>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                  Histórico
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                Evidencias de cuando el trabajo estuvo No Realizado. Quedan como constancia de seguridad.
              </p>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {cancelPhotos.map((photo) => (
                  <div 
                    key={photo.id} 
                    onClick={() => setPreviewPhoto(photo.photo_data || `/uploads/${photo.filename}`)}
                    className="w-24 h-18 rounded-xl overflow-hidden border border-amber-500/40 relative shrink-0 group cursor-pointer"
                  >
                    <img src={photo.photo_data || `/uploads/${photo.filename}`} alt="Constancia" className="w-full h-full object-cover group-hover:scale-105 transition" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-white font-bold transition">
                      Ver ↗
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sección Expandible para Declarar Trabajo No Realizado (Al final de la lista) */}
          {showCancelPrompt && (
            <div ref={cancelPromptRef} className="p-3.5 bg-rose-950/20 border border-rose-500/30 rounded-2xl space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-black text-rose-400">
                  <AlertCircle className="h-4 w-4" />
                  <span>Declarar Trabajo No Realizado</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCancelPrompt(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-[11px] text-slate-300">
                Selecciona o escribe el motivo por el cual no se pudo completar el trabajo en la propiedad:
              </p>

              {/* Quick Reason Chips */}
              <div className="flex flex-wrap gap-1.5">
                {QUICK_CANCEL_REASONS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setCancelReason(reason)}
                    className={`text-[10px] px-2.5 py-1 rounded-lg border transition font-medium text-left cursor-pointer ${
                      cancelReason === reason
                        ? 'bg-rose-600 text-white border-rose-500 font-bold shadow-sm'
                        : 'bg-[#16202c] text-slate-300 border-white/10 hover:border-rose-400/50'
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>

              <input
                type="text"
                placeholder="Escribe un motivo específico (opcional)..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full h-9 px-3 text-xs bg-[#0d141e] border border-white/10 focus:border-rose-500 rounded-xl text-white placeholder-slate-500 focus:outline-none"
              />

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCancelPrompt(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white font-bold cursor-pointer"
                >
                  Volver
                </button>
                <button
                  type="button"
                  disabled={savingCancel}
                  onClick={handleConfirmCancelled}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl shadow-lg shadow-rose-600/30 flex items-center gap-1.5 active:scale-95 transition cursor-pointer"
                >
                  <X className="h-4 w-4 stroke-[3]" />
                  <span>{savingCancel ? 'Guardando...' : 'Confirmar No Realizado'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 6. Footer (Idéntico a Travesía del Día) */}
        <div className="px-4 py-3 border-t border-white/10 bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setShowCancelPrompt(prev => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer border ${
              showCancelPrompt
                ? 'bg-rose-600 text-white border-rose-500 shadow-sm'
                : 'bg-white/10 hover:bg-white/15 text-rose-300 hover:text-white border-white/10'
            }`}
            title="Marcar trabajo como No Realizado"
          >
            <X className="h-3.5 w-3.5 stroke-[2.5]" />
            <span>No Realizado</span>
          </button>

          {!isCompleted ? (
            <button
              type="button"
              disabled={workPhotosCount === 0 || confirming || uploading}
              onClick={handleConfirmCompletion}
              className={`px-4 py-2 text-xs font-black rounded-xl shadow-lg transition active:scale-95 flex items-center gap-1.5 cursor-pointer ${
                workPhotosCount > 0
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/25 ring-2 ring-emerald-400/30'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
              }`}
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
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsShareModalOpen(true)}
                className="px-3.5 py-2 bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 text-white font-black text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
              >
                <Share2 className="h-3.5 w-3.5 stroke-[2.5]" />
                <span>Enviar Reporte</span>
              </button>

              <div className="flex items-center gap-1.5 px-2.5 py-2 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-bold">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>Completado</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FULLSCREEN PHOTO PREVIEW MODAL */}
      {previewPhoto && (
        <div
          onClick={() => setPreviewPhoto(null)}
          className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center p-3 animate-fade-in"
        >
          <div 
            className="relative max-w-lg w-full flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="absolute -top-11 right-0 p-2 text-white hover:text-cyan-400 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full transition shadow-lg cursor-pointer"
              title="Cerrar foto"
            >
              <X className="h-5 w-5" />
            </button>

            <img
              src={previewPhoto}
              alt="Evidencia Completa"
              className="max-h-[80vh] w-auto max-w-full rounded-2xl object-contain border border-white/10 shadow-2xl"
            />

            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="mt-3 px-5 py-2 bg-[#16202c] hover:bg-[#1e2b3b] text-white border border-white/10 rounded-xl text-xs font-bold transition shadow cursor-pointer active:scale-95"
            >
              Cerrar Foto
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE REPORTE Y WHATSAPP COMPARTIDO */}
      <ShareReportModal
        isOpen={isShareModalOpen}
        order={order}
        onClose={() => setIsShareModalOpen(false)}
        onOrderUpdated={onPhotoUpdated}
      />
    </div>
  );
}
