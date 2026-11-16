import React, { useState, useEffect } from 'react';
import { 
  X, Share2, Copy, Check, CheckCheck, Camera, ExternalLink, AlertCircle, AlertTriangle, Download, RotateCcw
} from 'lucide-react';

export default function ShareReportModal({ isOpen, order, onClose, onOrderUpdated, onShared }) {
  const [reportText, setReportText] = useState('');
  const [copiedText, setCopiedText] = useState(false);
  const [orderPhotos, setOrderPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [isSharedState, setIsSharedState] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const isCancelled = order ? (order.status === 'No Realizado' || order.status === 'Cancelado') : false;
  const hasDriveway = Boolean(
    order?.bore_type && (
      order.bore_type.includes('DW') || 
      order.bore_type.toLowerCase().includes('driveway') || 
      order.bore_type === 'Y'
    )
  );

  useEffect(() => {
    if (!isOpen || !order) return;

    setIsSharedState(Boolean(order.whatsapp_shared || order.whatsapp_shared_at));
    setAwaitingConfirmation(false);
    const isOrderCancelled = order.status === 'No Realizado' || order.status === 'Cancelado';

    let initialText = '';
    if (isOrderCancelled) {
      initialText = `🚫 *CONSTANCIA DE TRABAJO NO REALIZADO*
📅 *Fecha:* ${order.work_date}
🔢 *Orden #:* ${order.job_id}
📍 *Dirección:* ${order.address}${order.city ? `, ${order.city}` : ''}${order.phone ? `\n📞 *Teléfono:* ${order.phone}` : ''}
❌ *Estado:* NO REALIZADO
⚠️ *Motivo / Inconveniente:* ${order.cancel_reason || 'Inconveniente en la propiedad'}
👷 *Técnico:* Javier (P0G1)
${order.drop_footage ? `📏 *Drop Previsto:* ${order.drop_footage} ft (${order.cable_type || 'RG-6'})\n` : ''}📸 *Evidencia:* Constancia fotográfica adjunta`;
    } else {
      // Generar texto inicial del reporte completado (sin tarifas ni saldos)
      const hasDriveway = Boolean(
        order.bore_type && (
          order.bore_type.includes('DW') || 
          order.bore_type.toLowerCase().includes('driveway') || 
          order.bore_type === 'Y'
        )
      );

      initialText = `📋 *REPORTE DE TRABAJO*
📅 *Fecha:* ${order.work_date}
🔢 *Orden #:* ${order.job_id}
📍 *Dirección:* ${order.address}${order.city ? `, ${order.city}` : ''}
📏 *Pies / Drop:* ${order.drop_footage} ft (${order.cable_type || 'RG-6'})
🚗 *Driveway:* ${hasDriveway ? 'Sí' : 'No'}
✅ *Estado:* Completado y Verificado`;
    }

    setReportText(initialText);
    setCopiedText(false);

    // Cargar fotos de la orden ordenadas cronológicamente (primer disparo primero)
    const filterPhotos = (photos) => {
      if (!Array.isArray(photos)) return [];
      const sorted = [...photos].sort((a, b) => (a.id || 0) - (b.id || 0));
      if (isOrderCancelled) {
        // En trabajo no realizado, SOLO se muestran las fotos de constancia/obstáculo, NUNCA las de instalación normal
        return sorted.filter((p) => p.category === 'Constancia No Realizado');
      }
      return sorted.filter((p) => p.category !== 'Constancia No Realizado');
    };

    if (order.photos && Array.isArray(order.photos) && order.photos.length > 0) {
      setOrderPhotos(filterPhotos(order.photos));
    } else {
      setLoadingPhotos(true);
      fetch(`/api/orders/${order.id}`)
        .then((res) => res.json())
        .then((data) => {
          setOrderPhotos(filterPhotos(data.photos || []));
        })
        .catch(() => setOrderPhotos([]))
        .finally(() => setLoadingPhotos(false));
    }
  }, [isOpen, order]);

  if (!isOpen || !order) return null;

  const dataUrlToBlob = (dataUrl) => {
    try {
      const parts = dataUrl.split(',');
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
    } catch (e) {
      console.error('Error in dataUrlToBlob:', e);
      return null;
    }
  };

  const markOrderAsShared = () => {
    order.whatsapp_shared = 1;
    order.whatsapp_shared_at = new Date().toISOString();
    setIsSharedState(true);
    setAwaitingConfirmation(false);
    if (onShared && order.id) {
      onShared(order.id, true);
    }

    fetch(`/api/orders/${order.id}/whatsapp-shared`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shared: true })
    }).then(() => {
      if (onOrderUpdated) onOrderUpdated();
    }).catch((err) => {
      console.error('Error marking as shared:', err);
    });
  };

  const unmarkOrderAsShared = () => {
    order.whatsapp_shared = 0;
    order.whatsapp_shared_at = null;
    setIsSharedState(false);
    setAwaitingConfirmation(false);
    if (onShared && order.id) {
      onShared(order.id, false);
    }

    fetch(`/api/orders/${order.id}/whatsapp-shared`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shared: false })
    }).then(() => {
      if (onOrderUpdated) onOrderUpdated();
    }).catch((err) => {
      console.error('Error unmarking as shared:', err);
    });
  };

  const handleDownloadAllPhotos = () => {
    if (!orderPhotos.length) return;
    orderPhotos.forEach((p, idx) => {
      const src = p.photo_data || `/uploads/${p.filename}`;
      const a = document.createElement('a');
      a.href = src;
      a.download = `Job_${order.job_id}_${idx + 1}_${(p.category || 'foto').replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch (e) {}
  };

  const handleSendReportAndPhotos = async () => {
    setSharing(true);
    const textToSend = (reportText || '').trim();

    // 1. Copiar texto al portapapeles como respaldo de seguridad inmediato
    try {
      await navigator.clipboard.writeText(textToSend);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    } catch (e) {}

    try {
      // 2. Preparar fotos
      const filesToShare = [];
      if (orderPhotos.length > 0) {
        for (let i = 0; i < orderPhotos.length; i++) {
          const p = orderPhotos[i];
          try {
            let blob = null;
            if (p.photo_data && typeof p.photo_data === 'string' && p.photo_data.startsWith('data:')) {
              blob = dataUrlToBlob(p.photo_data);
            }
            if (!blob && p.filename) {
              const imgRes = await fetch(`/uploads/${p.filename}`);
              if (imgRes.ok) blob = await imgRes.blob();
            }
            if (blob) {
              const cleanCat = (p.category || (isCancelled ? 'constancia_no_realizado' : 'evidencia')).replace(/[^a-zA-Z0-9]/g, '_');
              const prefix = isCancelled ? `NoRealizado_${order.job_id}` : `Job_${order.job_id}`;
              const file = new File(
                [blob], 
                `${prefix}_${i + 1}_${cleanCat}.jpg`, 
                { type: blob.type || 'image/jpeg' }
              );
              filesToShare.push(file);
            }
          } catch (errPhoto) {
            console.error('Error preparing photo:', errPhoto);
          }
        }
      }

      const shareTitle = isCancelled 
        ? `Constancia No Realizado #${order.job_id}` 
        : `Reporte #${order.job_id}`;

      // 3. Compartir nativamente con Web Share (archivos + texto juntos si el móvil lo soporta)
      if (filesToShare.length > 0 && navigator.canShare && navigator.canShare({ files: filesToShare })) {
        await navigator.share({
          title: shareTitle,
          text: textToSend,
          files: filesToShare
        });
        setAwaitingConfirmation(true);
        return;
      }

      // 4. Compartir nativamente solo texto
      if (filesToShare.length === 0 && navigator.share && navigator.canShare && navigator.canShare({ text: textToSend })) {
        await navigator.share({
          title: shareTitle,
          text: textToSend
        });
        setAwaitingConfirmation(true);
        return;
      }

      // 5. Fallback si no hay Web Share: abrir WhatsApp por enlace wa.me
      const waUrl = `https://wa.me/?text=${encodeURIComponent(textToSend)}`;
      window.open(waUrl, '_blank');
      setAwaitingConfirmation(true);
    } catch (err) {
      if (err.name !== 'AbortError') {
        const waUrl = `https://wa.me/?text=${encodeURIComponent(textToSend)}`;
        window.open(waUrl, '_blank');
        setAwaitingConfirmation(true);
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in modal-overlay-safe"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px) + 16px, 1.25rem)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 1.25rem)'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-[#101722] border border-white/10 rounded-3xl w-full max-w-sm sm:max-w-md h-[80dvh] sm:h-[82dvh] modal-sheet-compact flex flex-col overflow-hidden shadow-2xl text-white transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Header (Misma estructura idéntica de Travesía del Día y PhotoModal) */}
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-white dark:bg-slate-900/70 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-md ${
              isCancelled
                ? 'bg-gradient-to-tr from-rose-500 to-amber-600 text-white shadow-rose-500/20'
                : 'bg-gradient-to-tr from-cyan-500 to-blue-600 text-slate-950 shadow-cyan-500/20'
            }`}>
              {isCancelled ? <AlertTriangle className="h-4 w-4 stroke-[2.5]" /> : <Share2 className="h-4 w-4 stroke-[2.5]" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-slate-900 dark:text-white truncate">
                {isCancelled ? 'Constancia No Realizado' : 'Reportar por WhatsApp'}
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

        {/* 2. Quick KPI / Specs Bar (Metraje y Cable separados; sin recuadro repetido de Driveway) */}
        {!isCancelled && (
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
                {order.cable_type || 'RG-6'}
              </span>
            </div>
            <div className="bg-[#16202c] p-1.5 rounded-xl border border-white/5 min-w-0">
              <span className="text-[8.5px] uppercase tracking-wider text-slate-400 font-bold block truncate">
                Evidencia
              </span>
              <span className="text-xs sm:text-sm font-black text-white font-mono truncate block">
                {orderPhotos.length} {orderPhotos.length === 1 ? 'foto' : 'fotos'}
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

        {/* 3. Cuerpo del Modal Scrollable */}
        <div className="p-3.5 sm:p-4 overflow-y-auto space-y-3.5 flex-1 min-h-0 scrollbar-none bg-[#101722] flex flex-col">

          {/* Alerta de Verificación / Confirmación de Envío en WhatsApp */}
          {awaitingConfirmation && (
            <div className="p-3.5 bg-amber-500/15 border border-amber-500/40 rounded-2xl space-y-2.5 animate-in fade-in shrink-0">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-xs sm:text-sm">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>¿Enviaste el reporte y fotos en WhatsApp?</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Se abrió WhatsApp con el reporte {orderPhotos.length > 0 ? `y ${orderPhotos.length} fotos` : ''}. Por seguridad, la app no da por reportado el trabajo hasta que confirmes que tocaste enviar en WhatsApp.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setAwaitingConfirmation(false)}
                  className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 font-bold text-xs transition active:scale-95 cursor-pointer text-center"
                >
                  No lo envié aún
                </button>
                <button
                  type="button"
                  onClick={() => {
                    markOrderAsShared();
                    setAwaitingConfirmation(false);
                    onClose();
                  }}
                  className="py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition active:scale-95 shadow-md shadow-emerald-500/25 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Sí, Confirmar</span>
                </button>
              </div>
            </div>
          )}

          {/* Texto del Reporte Editable */}
          <div className="space-y-1.5 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {isCancelled && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                )}
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {isCancelled ? 'Mensaje de Constancia (Editable)' : 'Mensaje del Reporte (Editable)'}
                </label>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopyText}
                  className="px-2.5 py-1 bg-[#16202c] hover:bg-[#1e2b3b] text-slate-300 border border-white/10 rounded-lg text-[10px] font-bold flex items-center gap-1 transition shadow-xs cursor-pointer active:scale-95"
                >
                  {copiedText ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-cyan-400" />}
                  <span>{copiedText ? '¡Copiado!' : 'Copiar'}</span>
                </button>
                {isSharedState && (
                  <button
                    type="button"
                    onClick={handleSendReportAndPhotos}
                    disabled={sharing}
                    className="px-2.5 py-1 bg-[#16202c] hover:bg-[#1e2b3b] text-cyan-300 border border-cyan-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1 transition shadow-xs cursor-pointer active:scale-95"
                    title="Volver a compartir por WhatsApp"
                  >
                    <Share2 className="h-3 w-3 text-cyan-400" />
                    <span>Volver a Enviar</span>
                  </button>
                )}
              </div>
            </div>

            <textarea
              rows={isCancelled ? 7 : 6}
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              placeholder="Escribe o modifica los detalles del reporte..."
              className={`w-full bg-[#0d141e] border rounded-2xl p-2.5 sm:p-3 text-xs font-mono text-slate-200 focus:outline-none leading-relaxed shadow-inner resize-none sleek-scroll overflow-y-auto h-36 sm:h-40 min-h-[145px] sm:min-h-[160px] ${
                isCancelled ? 'border-rose-500/40 focus:border-rose-400' : 'border-white/10 focus:border-cyan-400'
              }`}
            />
          </div>

          {/* Galería de Fotos Adjuntas */}
          <div className="space-y-2 pt-2 border-t border-white/5 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between shrink-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Camera className={`h-3.5 w-3.5 ${isCancelled ? 'text-rose-400' : 'text-cyan-400'}`} />
                <span>{isCancelled ? 'Fotos del Obstáculo' : 'Fotos de Instalación'} ({orderPhotos.length})</span>
              </span>
              {orderPhotos.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadAllPhotos}
                    className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 text-cyan-400 hover:text-cyan-300 border border-white/10 text-[9.5px] font-bold flex items-center gap-1 transition active:scale-95 cursor-pointer"
                    title="Descargar fotos de evidencia al dispositivo"
                  >
                    <Download className="h-3 w-3" />
                    <span>Descargar</span>
                  </button>
                  <span className={`text-[10px] font-bold ${isCancelled ? 'text-rose-400' : 'text-emerald-400'}`}>
                    Se adjuntarán juntas
                  </span>
                </div>
              )}
            </div>

            {loadingPhotos ? (
              <div className="flex-1 min-h-[180px] sm:min-h-[220px] rounded-2xl border border-white/5 bg-[#0d141e] flex flex-col items-center justify-center p-3 text-center">
                <span className="text-xs text-slate-400 font-medium">Cargando fotos del trabajo...</span>
              </div>
            ) : orderPhotos.length > 0 ? (
              <div className="flex-1 min-h-[180px] sm:min-h-[220px] p-2 bg-[#0d141e] rounded-2xl border border-white/5 overflow-y-auto sleek-scroll">
                <div className="grid grid-cols-3 gap-2">
                  {orderPhotos.map((p, idx) => (
                    <div 
                      key={p.id || idx} 
                      onClick={() => setPreviewPhoto(p.photo_data || `/uploads/${p.filename}`)}
                      className="relative rounded-xl overflow-hidden border border-white/10 bg-black/40 aspect-video group cursor-pointer hover:border-cyan-400/80 transition shadow-xs"
                      title="Toca para ver la foto completa"
                    >
                      <img 
                        src={p.photo_data || `/uploads/${p.filename}`} 
                        alt={p.category || `Foto ${idx + 1}`} 
                        className="w-full h-full object-cover group-hover:scale-105 transition" 
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                        <ExternalLink className="h-3.5 w-3.5 text-white" />
                      </div>
                      {/* Enunciado / Categoría de la foto en la esquina superior arriba para visualización clara */}
                      <div className="absolute top-1 left-1 max-w-[92%] z-10 pointer-events-none">
                        <span className="inline-block bg-black/90 backdrop-blur-xs text-[9px] font-black text-cyan-300 border border-cyan-400/40 px-1.5 py-0.5 rounded-md shadow-lg truncate leading-tight">
                          {p.category || `#${idx + 1}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-[180px] sm:min-h-[220px] rounded-2xl border border-dashed border-white/10 bg-[#0e1622]/60 flex flex-col items-center justify-center p-6 text-center space-y-1">
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 mb-2 shadow-inner">
                  <Camera className={`h-5 w-5 ${isCancelled ? 'text-rose-400/70' : 'text-cyan-400/70'}`} />
                </div>
                <p className="text-xs sm:text-sm font-bold text-slate-300">
                  {isCancelled ? 'Sin fotos de obstáculo adjuntas' : 'Aún no hay fotos de la instalación'}
                </p>
                <p className="text-[10.5px] text-slate-500 mt-1 max-w-[240px]">
                  (Se enviará solo el mensaje de texto del reporte)
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 4. Footer (Mismo estilo que Travesía del Día y PhotoModal) */}
        <div className="px-4 py-3 border-t border-white/10 bg-slate-900/80 flex items-center justify-between gap-2 shrink-0 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white text-xs font-bold transition active:scale-95 cursor-pointer border border-white/10 shadow-sm"
          >
            {isSharedState ? 'Cerrar' : 'Cancelar'}
          </button>

          {awaitingConfirmation ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSendReportAndPhotos}
                disabled={sharing}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-[#182332] hover:bg-[#223042] text-cyan-400 border border-cyan-500/30 transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
                title="Volver a abrir WhatsApp si te saliste"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reintentar</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  markOrderAsShared();
                  setAwaitingConfirmation(false);
                  onClose();
                }}
                className="px-3.5 py-2 text-xs font-black rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/25 transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="h-3.5 w-3.5 stroke-[3]" />
                <span>Sí, Confirmar</span>
              </button>
            </div>
          ) : isSharedState ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={unmarkOrderAsShared}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition active:scale-95 cursor-pointer"
                title="Desmarcar reporte si se marcó por error o no se envió"
              >
                Desmarcar Reporte
              </button>
              <div 
                className="px-3 py-2 text-xs font-black rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm flex items-center gap-1.5 select-none"
                title={order.whatsapp_shared_at ? `Reportado el ${order.whatsapp_shared_at.slice(0, 10)} a las ${order.whatsapp_shared_at.slice(11, 16)}` : 'Reportado'}
              >
                <span>Reportado</span>
                <CheckCheck className="h-4 w-4 stroke-[2.5] text-emerald-400" />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSendReportAndPhotos}
              disabled={sharing}
              className={`px-4 py-2 text-xs font-black rounded-xl shadow-lg transition active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50 ${
                isCancelled
                  ? 'bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-rose-600/25 ring-2 ring-rose-400/30'
                  : 'bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 hover:from-blue-500 hover:to-cyan-400 text-white shadow-cyan-600/25 ring-2 ring-cyan-400/30'
              }`}
            >
              {sharing ? (
                <span>Preparando...</span>
              ) : (
                <>
                  <Share2 className="h-4 w-4 stroke-[2.5]" />
                  <span>{isCancelled ? 'Enviar Constancia' : 'Enviar a WhatsApp'}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* FULLSCREEN PHOTO PREVIEW LIGHTBOX */}
      {previewPhoto && (
        <div
          onClick={() => setPreviewPhoto(null)}
          className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-md flex items-center justify-center p-3 animate-fade-in"
        >
          <div 
            className="relative max-w-lg w-full flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="absolute -top-11 right-0 p-2 text-white hover:text-cyan-400 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full transition shadow-lg active:scale-90 cursor-pointer"
              title="Cerrar foto"
            >
              <X className="h-5 w-5" />
            </button>

            <img
              src={previewPhoto}
              alt="Evidencia en grande"
              className="max-h-[80vh] w-auto max-w-full rounded-2xl object-contain border border-white/10 shadow-2xl"
            />

            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="mt-3 px-5 py-2 bg-[#16202c] hover:bg-[#1e2b3b] text-white border border-white/10 rounded-xl text-xs font-bold transition shadow active:scale-95 cursor-pointer"
            >
              Cerrar Foto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
