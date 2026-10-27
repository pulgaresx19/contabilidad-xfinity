import React, { useState, useRef } from 'react';
import { 
  X, Upload, Trash2, Camera, Image as ImageIcon, 
  CheckCircle2, AlertCircle, Sparkles, Check, ArrowRight, ShieldCheck, Plus,
  ExternalLink, Share2, Copy
} from 'lucide-react';
import ShareReportModal from './ShareReportModal';

const PHOTO_STEPS = [
  { id: 'Casa/Ground Block', label: 'Casa / Entrada', short: 'Casa', icon: '🏠' },
  { id: 'Terreno/Ruta', label: 'Terreno / Zanja', short: 'Terreno', icon: '🌱' },
  { id: 'Trabajo Terminado', label: 'Finalizado', short: 'Finalizado', icon: '✨' },
  { id: 'Pedestal/Tap', label: 'Pedestal / Tap', short: 'Pedestal', icon: '⚡' },
  { id: 'General', label: 'General / Extra', short: 'Extra', icon: '📷' }
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

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

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
    for (let i = 0; i < files.length; i++) {
      formData.append('photos', files[i]);
    }

    try {
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
      setError('Debes tener al menos 1 foto de la instalación realizada antes de confirmar.');
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
        if (onPhotoUpdated) onPhotoUpdated();
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || 'Error al confirmar trabajo');
      }
    } catch (err) {
      setError('Error al confirmar: ' + err.message);
    } finally {
      setConfirming(false);
    }
  };

  const handleCopyReportDirect = async () => {
    const isDw = order.bore_type && order.bore_type.includes('DW');
    const isSw = order.bore_type && order.bore_type.includes('SW');
    const boreStr = isDw 
      ? 'Driveway Bore (+$30)' 
      : isSw 
      ? 'Sidewalk Bore (SW)' 
      : (order.bore_type && order.bore_type !== 'N' ? order.bore_type : 'Sin Perforación');

    const text = `📋 *REPORTE DE TRABAJO*
📅 *Fecha:* ${order.work_date}
🔢 *Orden #:* ${order.job_id}
📍 *Dirección:* ${order.address}${order.city ? `, ${order.city}` : ''}
📏 *Drop:* ${order.drop_footage} ft (${order.cable_type || 'RG-6'})
🚗 *Perforación / Bore:* ${boreStr}${order.drop_footage > 300 ? `\n⚡ *Metraje Extra (>300ft):* +$${Math.floor((order.drop_footage - 300) / 100) * 25}` : ''}${order.manual_adjustment ? `\n⚖️ *Ajuste Supervisor:* ${order.manual_adjustment > 0 ? `+$${order.manual_adjustment}` : `-$${Math.abs(order.manual_adjustment)}`} (${order.adjustment_reason || 'Bono/Descuento'})` : ''}
📸 *Fotos:* ${workPhotosCount} evidencia(s)
💵 *Tarifa Total:* $${order.rate_calculated}
✅ *Estado:* ${order.status}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedReportText(true);
      setTimeout(() => setCopiedReportText(false), 2000);
    } catch (e) {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-lg rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header Compacto y Directo */}
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/70">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex-shrink-0">
              <Camera className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-black text-slate-900 dark:text-white text-sm sm:text-base tracking-tight truncate">
                  Evidencias Fotográficas
                </h3>
                <span className="text-[11px] font-mono font-bold bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800 px-1.5 py-0.5 rounded">
                  #{order.job_id}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {order.address} {order.city ? `• ${order.city}` : ''}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl bg-slate-200/70 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition flex-shrink-0"
            title="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Selector de Pasos Rápido (Chips Horizontales con Iconos) */}
          <div className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px]">
                Paso actual de la foto:
              </span>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 select-none">
                <input
                  type="checkbox"
                  checked={autoAdvance}
                  onChange={(e) => setAutoAdvance(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-700 text-cyan-500 focus:ring-0"
                />
                <span className="text-[10px]">Auto-avanzar paso</span>
              </label>
            </div>

            {/* Chips de Categoría */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {PHOTO_STEPS.map((step) => {
                const isSelected = category === step.id;
                const hasPhotosInStep = workPhotos.some(p => p.category === step.id);
                return (
                  <button
                    type="button"
                    key={step.id}
                    onClick={() => setCategory(step.id)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 border text-center ${
                      isSelected
                        ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md shadow-cyan-500/20'
                        : hasPhotosInStep
                        ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{step.icon}</span>
                    <span className="truncate">{step.short}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Botones de Captura Rápida (Cámara de Móvil directa y Galería) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Input oculto para cámara directa (capture="environment") */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />

            {/* Input oculto para galería múltiple */}
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />

            {/* Botón Principal: Abrir Cámara al instante */}
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
              className="py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 active:scale-95 text-slate-950 font-black text-sm rounded-2xl flex items-center justify-center gap-2 shadow-md shadow-cyan-500/25 transition"
            >
              <Camera className="h-5 w-5 stroke-[2.5]" />
              <span>{uploading ? 'Guardando foto...' : 'Abrir Cámara'}</span>
            </button>

            {/* Botón Secundario: Seleccionar de Galería */}
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              disabled={uploading}
              className="py-3 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 text-slate-800 dark:text-slate-200 font-bold text-sm rounded-2xl border border-slate-300 dark:border-slate-700/80 flex items-center justify-center gap-2 transition"
            >
              <Upload className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
              <span>Subir de Galería</span>
            </button>
          </div>

          {/* Estado de Requisito de Fotos de Trabajo */}
          <div className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
            workPhotosCount > 0
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
          }`}>
            <div className="flex items-center gap-2">
              {workPhotosCount > 0 ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              )}
              <span className="font-semibold">
                {workPhotosCount > 0 
                  ? `Requisito de instalación cumplido: ${workPhotosCount} ${workPhotosCount === 1 ? 'foto subida' : 'fotos subidas'}`
                  : 'Falta foto de instalación para poder confirmar'}
              </span>
            </div>
            <span className="font-mono font-bold text-xs">
              {workPhotosCount} / min 1
            </span>
          </div>

          {/* Galería Compacta de Fotos de Instalación */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-1 flex-wrap">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Fotos de Instalación ({workPhotosCount})
              </span>

              {/* Botones Rápidos de Reporte y WhatsApp */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopyReportDirect}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-bold flex items-center gap-1 transition shadow-2xs"
                  title="Copiar texto del reporte para pegar en WhatsApp"
                >
                  {copiedReportText ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 text-cyan-500" />}
                  <span>{copiedReportText ? '¡Copiado!' : 'Copiar Reporte'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsShareModalOpen(true)}
                  className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1 transition shadow-2xs"
                  title="Abrir ventana para enviar reporte y fotos por WhatsApp"
                >
                  <Share2 className="h-3 w-3 text-emerald-500" />
                  <span>Reportar WhatsApp</span>
                </button>
              </div>
            </div>

            {workPhotosCount === 0 ? (
              <div className="text-center py-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-950/40">
                <ImageIcon className="h-8 w-8 text-slate-400 dark:text-slate-600 mx-auto mb-1.5" />
                <p className="text-xs text-slate-600 dark:text-slate-400 font-semibold">
                  Aún no hay fotos de la instalación
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                  Toca "Abrir Cámara" para tirar la foto de la vivienda o zanja
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {workPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    onClick={() => setPreviewPhoto(photo.photo_data || `/uploads/${photo.filename}`)}
                    className="group relative bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-xl overflow-hidden aspect-video shadow-sm transition cursor-pointer hover:border-cyan-400/60"
                  >
                    <img
                      src={photo.photo_data || `/uploads/${photo.filename}`}
                      alt={photo.category}
                      className="w-full h-full object-cover group-hover:scale-105 transition"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent flex flex-col justify-between p-1.5">
                      <div className="flex justify-between items-center" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[9px] bg-black/70 text-cyan-300 px-1.5 py-0.5 rounded font-semibold truncate max-w-[85%]">
                          {photo.category}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeletePhoto(photo.id)}
                          title="Eliminar foto"
                          className="p-1 bg-rose-600 hover:bg-rose-500 text-white rounded transition shadow active:scale-90"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPreviewPhoto(photo.photo_data || `/uploads/${photo.filename}`)}
                        className="text-[10px] text-slate-200 truncate hover:text-cyan-300 hover:underline flex items-center gap-1 self-start"
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
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <span>Constancia de Cancelación Previa ({cancelPhotos.length})</span>
                </div>
                <span className="text-[10px] bg-amber-500/20 text-amber-800 dark:text-amber-300 font-bold px-2 py-0.5 rounded-full">
                  Histórico
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Evidencias de cuando el trabajo estuvo No Realizado. Quedan como constancia de seguridad y no interfieren con la instalación.
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
        </div>

        {/* Footer con Acción Directa para Confirmar el Trabajo o Reportar */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 flex items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 bg-slate-200/80 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition shrink-0"
          >
            Cerrar
          </button>

          {!isCompleted ? (
            <button
              type="button"
              disabled={workPhotosCount === 0 || confirming || uploading}
              onClick={handleConfirmCompletion}
              className={`flex-1 h-10 px-4 text-xs font-black rounded-xl flex items-center justify-center gap-1.5 shadow-md transition active:scale-95 ${
                workPhotosCount > 0
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/25'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed border border-dashed border-slate-300 dark:border-slate-700'
              }`}
            >
              <Check className="h-4 w-4 stroke-[3]" />
              <span>
                {confirming 
                  ? 'Confirmando...' 
                  : workPhotosCount > 0 
                  ? 'Confirmar Trabajo' 
                  : 'Falta Foto de Trabajo'}
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsShareModalOpen(true)}
                className="h-10 px-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition active:scale-95"
              >
                <Share2 className="h-3.5 w-3.5 stroke-[2.5]" />
                <span>Enviar Reporte</span>
              </button>

              <div className="hidden sm:flex items-center gap-1.5 h-10 px-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-bold">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>Completado</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FULLSCREEN PHOTO PREVIEW MODAL (IN-APP - NUNCA REDIRIGE A OTRA PESTAÑA NI A JORNADA) */}
      {previewPhoto && (
        <div
          onClick={() => setPreviewPhoto(null)}
          className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-md flex items-center justify-center p-3 animate-fade-in"
        >
          <div 
            className="relative max-w-lg w-full flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="absolute -top-11 right-0 p-2 text-white hover:text-cyan-400 bg-slate-800/80 rounded-full transition shadow-lg"
              title="Cerrar foto"
            >
              <X className="h-5 w-5" />
            </button>

            <img
              src={previewPhoto}
              alt="Evidencia Completa"
              className="max-h-[80vh] w-auto max-w-full rounded-2xl object-contain border border-slate-700 shadow-2xl"
            />

            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="mt-3 px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition shadow"
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
