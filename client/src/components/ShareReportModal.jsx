import React, { useState, useEffect } from 'react';
import { 
  X, Share2, Copy, Check, Camera, ExternalLink, AlertCircle, AlertTriangle
} from 'lucide-react';

export default function ShareReportModal({ isOpen, order, onClose, onOrderUpdated, onShared }) {
  const [reportText, setReportText] = useState('');
  const [copiedText, setCopiedText] = useState(false);
  const [orderPhotos, setOrderPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);

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

    // Cargar fotos de la orden con el filtro adecuado según el estado
    const filterPhotos = (photos) => {
      if (!Array.isArray(photos)) return [];
      if (isOrderCancelled) {
        const cancelPhotos = photos.filter((p) => p.category === 'Constancia No Realizado');
        return cancelPhotos.length > 0 ? cancelPhotos : photos;
      }
      return photos.filter((p) => p.category !== 'Constancia No Realizado');
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
    if (onShared && order.id) {
      onShared(order.id);
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

    // 1. Marcar como compartido
    markOrderAsShared();

    // 2. Copiar texto al portapapeles como respaldo
    try {
      await navigator.clipboard.writeText(textToSend);
      setCopiedText(true);
    } catch (e) {}

    try {
      // 3. Preparar fotos
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

      // 4. Compartir nativamente con Web Share (archivos + texto juntos)
      if (filesToShare.length > 0 && navigator.canShare && navigator.canShare({ files: filesToShare })) {
        await navigator.share({
          title: shareTitle,
          text: textToSend,
          files: filesToShare
        });
        onClose();
        return;
      }

      // 5. Compartir nativamente solo texto
      if (filesToShare.length === 0 && navigator.share && navigator.canShare && navigator.canShare({ text: textToSend })) {
        await navigator.share({
          title: shareTitle,
          text: textToSend
        });
        onClose();
        return;
      }

      // 6. Fallback si no hay Web Share: abrir WhatsApp
      const waUrl = `https://wa.me/?text=${encodeURIComponent(textToSend)}`;
      window.open(waUrl, '_blank');
      onClose();
    } catch (err) {
      if (err.name !== 'AbortError') {
        const waUrl = `https://wa.me/?text=${encodeURIComponent(textToSend)}`;
        window.open(waUrl, '_blank');
        onClose();
      }
    } finally {
      setSharing(false);
    }
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
        {/* 1. Header (Misma estructura idéntica de Travesía del Día y PhotoModal) */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-slate-900/70 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-md ${
              isCancelled
                ? 'bg-gradient-to-tr from-rose-500 to-amber-600 text-white shadow-rose-500/20'
                : 'bg-gradient-to-tr from-cyan-500 to-blue-600 text-slate-950 shadow-cyan-500/20'
            }`}>
              {isCancelled ? <AlertTriangle className="h-4 w-4 stroke-[2.5]" /> : <Share2 className="h-4 w-4 stroke-[2.5]" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-white truncate">
                {isCancelled ? 'Constancia No Realizado' : 'Reportar por WhatsApp'}
              </h3>
              <p className="text-[10.5px] text-slate-400 font-medium truncate">
                #{order.job_id} • {order.address}{order.city ? `, ${order.city}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 2. Quick KPI / Specs Bar (Idéntico a Travesía del Día y PhotoModal) */}
        <div className="grid grid-cols-3 gap-2 px-4 py-2.5 bg-[#0d141e] border-b border-white/5 shrink-0 text-center">
          <div className="bg-[#16202c] p-2 rounded-xl border border-white/5">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
              {isCancelled ? 'Motivo' : 'Metraje / Cable'}
            </span>
            <span className={`text-sm font-black font-mono truncate block ${isCancelled ? 'text-rose-400' : 'text-cyan-400'}`}>
              {isCancelled 
                ? (order.cancel_reason ? order.cancel_reason.slice(0, 15) : 'Inconveniente') 
                : `${order.drop_footage || 0} ft • ${order.cable_type || 'RG-6'}`}
            </span>
          </div>
          <div className="bg-[#16202c] p-2 rounded-xl border border-white/5">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
              Evidencias
            </span>
            <span className="text-sm font-black text-white font-mono">
              {orderPhotos.length} {orderPhotos.length === 1 ? 'adjunta' : 'adjuntas'}
            </span>
          </div>
          <div className="bg-[#16202c] p-2 rounded-xl border border-white/5">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
              {isCancelled ? 'Estado' : 'Driveway'}
            </span>
            <span className={`text-sm font-black font-mono ${
              isCancelled ? 'text-rose-400' : hasDriveway ? 'text-cyan-400' : 'text-slate-400'
            }`}>
              {isCancelled ? 'No Realizado' : hasDriveway ? 'Sí' : 'No'}
            </span>
          </div>
        </div>

        {/* 3. Cuerpo del Modal Scrollable */}
        <div className="p-4 overflow-y-auto space-y-3.5 flex-1 scrollbar-none bg-[#101722]">
          
          {/* Detalles Técnicos Extra si aplican (Driveway) */}
          {hasDriveway && (
            <div className="bg-[#16202c] border border-white/5 rounded-2xl p-2.5 flex items-center gap-2 flex-wrap text-xs">
              <span className="px-2 py-0.5 rounded-lg bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40 text-[10px] flex items-center gap-1 font-mono">
                🚗 Driveway Bore: Sí
              </span>
            </div>
          )}

          {/* Texto del Reporte Editable */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {isCancelled ? 'Mensaje de Constancia (Editable)' : 'Mensaje del Reporte (Editable)'}
              </label>
              <button
                type="button"
                onClick={handleCopyText}
                className="px-2.5 py-1 bg-[#16202c] hover:bg-[#1e2b3b] text-slate-300 border border-white/10 rounded-lg text-[10px] font-bold flex items-center gap-1 transition shadow-xs cursor-pointer active:scale-95"
              >
                {copiedText ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-cyan-400" />}
                <span>{copiedText ? '¡Copiado!' : 'Copiar Texto'}</span>
              </button>
            </div>

            <textarea
              rows={isCancelled ? 7 : 6}
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              placeholder="Escribe o modifica los detalles del reporte..."
              className={`w-full bg-[#0d141e] border border-white/10 rounded-2xl p-3 text-xs font-mono text-slate-200 focus:outline-none leading-relaxed shadow-inner resize-none ${
                isCancelled ? 'focus:border-rose-500' : 'focus:border-cyan-400'
              }`}
            />
            <span className="text-[10px] text-slate-500 block px-0.5">
              💡 Puedes editar cualquier dato o agregar notas antes de enviarlo al supervisor.
            </span>
          </div>

          {/* Galería de Fotos Adjuntas */}
          <div className="space-y-2 pt-1 border-t border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Camera className={`h-3.5 w-3.5 ${isCancelled ? 'text-rose-400' : 'text-cyan-400'}`} />
                <span>{isCancelled ? 'Fotos del Obstáculo' : 'Fotos Adjuntas'} ({orderPhotos.length})</span>
              </span>
              {orderPhotos.length > 0 && (
                <span className={`text-[10px] font-bold ${isCancelled ? 'text-rose-400' : 'text-emerald-400'}`}>
                  Se adjuntarán juntas
                </span>
              )}
            </div>

            {loadingPhotos ? (
              <div className="py-4 text-center text-xs text-slate-400 font-medium">Cargando fotos del trabajo...</div>
            ) : orderPhotos.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 p-2 bg-[#0d141e] rounded-2xl border border-white/5 max-h-36 overflow-y-auto scrollbar-none">
                {orderPhotos.map((p, idx) => (
                  <div 
                    key={p.id || idx} 
                    onClick={() => setPreviewPhoto(p.photo_data || `/uploads/${p.filename}`)}
                    className="relative rounded-xl overflow-hidden border border-white/10 bg-black/40 aspect-video group cursor-pointer hover:border-cyan-400/80 transition"
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
                    <span className="absolute bottom-0.5 left-0.5 bg-black/80 backdrop-blur-xs text-[8px] text-cyan-300 border border-cyan-400/20 px-1 py-0.2 rounded font-mono truncate max-w-[90%]">
                      {p.category || `#${idx + 1}`}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[10.5px] text-slate-400 italic text-center py-4 bg-[#0d141e]/50 rounded-2xl border border-dashed border-white/10">
                {isCancelled ? 'Sin fotos de constancia (se enviará solo el mensaje de texto).' : 'Sin fotos adjuntas (se enviará solo el mensaje de texto).'}
              </div>
            )}
          </div>
        </div>

        {/* 4. Footer (Mismo estilo que Travesía del Día y PhotoModal) */}
        <div className="px-4 py-3 border-t border-white/10 bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white text-xs font-bold transition active:scale-95 cursor-pointer border border-white/10 shadow-sm"
          >
            Cancelar
          </button>

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
