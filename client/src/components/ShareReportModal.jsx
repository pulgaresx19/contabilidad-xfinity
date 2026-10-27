import React, { useState, useEffect } from 'react';
import { 
  X, Share2, Copy, Check, Camera, ExternalLink, AlertCircle
} from 'lucide-react';

export default function ShareReportModal({ isOpen, order, onClose, onOrderUpdated }) {
  const [reportText, setReportText] = useState('');
  const [copiedText, setCopiedText] = useState(false);
  const [orderPhotos, setOrderPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);

  useEffect(() => {
    if (!isOpen || !order) return;

    // Generar texto inicial del reporte
    const isDw = order.bore_type && order.bore_type.includes('DW');
    const isSw = order.bore_type && order.bore_type.includes('SW');
    const boreStr = isDw 
      ? 'Driveway Bore (+$30)' 
      : isSw 
      ? 'Sidewalk Bore (SW)' 
      : (order.bore_type && order.bore_type !== 'N' ? order.bore_type : 'Sin Perforación');

    const initialText = `📋 *REPORTE DE TRABAJO*
📅 *Fecha:* ${order.work_date}
🔢 *Orden #:* ${order.job_id}
📍 *Dirección:* ${order.address}${order.city ? `, ${order.city}` : ''}
📏 *Drop:* ${order.drop_footage} ft (${order.cable_type || 'RG-6'})
🚗 *Perforación / Bore:* ${boreStr}${order.drop_footage > 300 ? `\n⚡ *Metraje Extra (>300ft):* +$${Math.floor((order.drop_footage - 300) / 100) * 25}` : ''}${order.manual_adjustment ? `\n⚖️ *Ajuste Supervisor:* ${order.manual_adjustment > 0 ? `+$${order.manual_adjustment}` : `-$${Math.abs(order.manual_adjustment)}`} (${order.adjustment_reason || 'Bono/Descuento'})` : ''}
💵 *Tarifa Total:* $${order.rate_calculated}
✅ *Estado:* Completado y Verificado`;

    setReportText(initialText);
    setCopiedText(false);

    // Cargar fotos de la orden
    if (order.photos && Array.isArray(order.photos) && order.photos.length > 0) {
      setOrderPhotos(order.photos.filter((p) => p.category !== 'Constancia No Realizado'));
    } else {
      setLoadingPhotos(true);
      fetch(`/api/orders/${order.id}`)
        .then((res) => res.json())
        .then((data) => {
          const ph = (data.photos || []).filter((p) => p.category !== 'Constancia No Realizado');
          setOrderPhotos(ph);
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
              const cleanCat = (p.category || 'evidencia').replace(/[^a-zA-Z0-9]/g, '_');
              const file = new File(
                [blob], 
                `Job_${order.job_id}_${i + 1}_${cleanCat}.jpg`, 
                { type: blob.type || 'image/jpeg' }
              );
              filesToShare.push(file);
            }
          } catch (errPhoto) {
            console.error('Error preparing photo:', errPhoto);
          }
        }
      }

      // 4. Compartir nativamente con Web Share (archivos + texto juntos)
      if (filesToShare.length > 0 && navigator.canShare && navigator.canShare({ files: filesToShare })) {
        await navigator.share({
          title: `Reporte #${order.job_id}`,
          text: textToSend,
          files: filesToShare
        });
        onClose();
        return;
      }

      // 5. Compartir nativamente solo texto
      if (filesToShare.length === 0 && navigator.share && navigator.canShare && navigator.canShare({ text: textToSend })) {
        await navigator.share({
          title: `Reporte #${order.job_id}`,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-md rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-2xl space-y-3.5 max-h-[90vh] overflow-y-auto mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <Share2 className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                Reportar por WhatsApp
              </h3>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono font-bold">
                Orden #{order.job_id}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tarjeta Visual Estética con el componente Driveway destacado */}
        <div className="bg-slate-50 dark:bg-slate-950/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs space-y-2 shadow-2xs">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold text-slate-900 dark:text-white text-xs truncate">
                {order.address}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                {order.city ? `${order.city} • ` : ''}{order.work_date}
              </p>
            </div>

            <div className="text-right shrink-0">
              <span className="text-[9px] text-slate-400 uppercase block font-bold">Tarifa</span>
              <span className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400">
                ${order.rate_calculated}
              </span>
            </div>
          </div>

          {/* Especificaciones Técnicas y Componente Driveway */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-200 dark:border-slate-800/80 font-mono text-[10px]">
            <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-300 font-bold border border-slate-200 dark:border-slate-800">
              {order.drop_footage} ft
            </span>
            <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800">
              {order.cable_type || 'RG-6'}
            </span>

            {/* Badge Driveway destacado */}
            {(order.bore_type && order.bore_type.includes('DW')) ? (
              <span className="px-2 py-0.5 rounded-lg bg-cyan-100 text-cyan-900 dark:bg-cyan-500/20 dark:text-cyan-300 font-bold border border-cyan-300 dark:border-cyan-500/40 flex items-center gap-1 shadow-2xs">
                <span>🚗 Driveway Bore (DW)</span>
                <span className="font-black text-cyan-700 dark:text-cyan-400">+$30</span>
              </span>
            ) : (order.bore_type && order.bore_type.includes('SW')) ? (
              <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800">
                Sidewalk (SW)
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-lg bg-white/60 dark:bg-slate-900/60 text-slate-400 border border-slate-200 dark:border-slate-800">
                Sin Bore
              </span>
            )}

            {order.manual_adjustment !== undefined && order.manual_adjustment !== 0 && (
              <span className={`px-2 py-0.5 rounded-lg font-bold border ${
                order.manual_adjustment > 0
                  ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                  : 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
              }`}>
                {order.manual_adjustment > 0 ? `+$${order.manual_adjustment}` : `-$${Math.abs(order.manual_adjustment)}`} {order.adjustment_reason || 'Ajuste'}
              </span>
            )}
          </div>
        </div>

        {/* Texto del Reporte Editable */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
              Mensaje del Reporte (Editable):
            </label>
            <button
              type="button"
              onClick={handleCopyText}
              className="text-[10px] text-cyan-600 dark:text-cyan-400 font-bold hover:underline flex items-center gap-1"
            >
              {copiedText ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              <span>{copiedText ? '¡Copiado!' : 'Copiar texto'}</span>
            </button>
          </div>

          <textarea
            rows={6}
            value={reportText}
            onChange={(e) => setReportText(e.target.value)}
            placeholder="Escribe o modifica los detalles del reporte..."
            className="w-full bg-slate-50 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 leading-relaxed shadow-inner"
          />
          <span className="text-[10px] text-slate-400 block px-0.5">
            💡 Puedes editar cualquier dato o agregar notas antes de enviarlo al supervisor.
          </span>
        </div>

        {/* Galería de Fotos (Todas de una) */}
        <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Camera className="h-3.5 w-3.5 text-cyan-500" />
              <span>Fotos de Evidencia ({orderPhotos.length})</span>
            </label>
            {orderPhotos.length > 0 && (
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                Se enviarán juntas con el texto
              </span>
            )}
          </div>

          {loadingPhotos ? (
            <div className="py-3 text-center text-xs text-slate-400">Cargando fotos del trabajo...</div>
          ) : orderPhotos.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-36 overflow-y-auto p-1 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800/70">
              {orderPhotos.map((p, idx) => (
                <div 
                  key={p.id || idx} 
                  onClick={() => setPreviewPhoto(p.photo_data || `/uploads/${p.filename}`)}
                  className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-black/40 aspect-video group cursor-pointer hover:border-cyan-400/80 transition"
                  title="Toca para ver la foto en grande"
                >
                  <img 
                    src={p.photo_data || `/uploads/${p.filename}`} 
                    alt={p.category || `Foto ${idx + 1}`} 
                    className="w-full h-full object-cover group-hover:scale-105 transition" 
                  />
                  <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                    <ExternalLink className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span className="absolute bottom-0.5 left-0.5 bg-black/75 text-[8px] text-white px-1 py-0.2 rounded font-mono truncate max-w-[90%]">
                    {p.category || `#${idx + 1}`}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[10px] text-slate-400 italic text-center py-2 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
              Sin fotos adjuntas (se enviará solo el mensaje de texto).
            </div>
          )}
        </div>

        {/* Botón Principal: Enviar TODO JUNTOS a WhatsApp */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <button
            type="button"
            onClick={handleSendReportAndPhotos}
            disabled={sharing}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 active:scale-95 transition ring-2 ring-emerald-400/40 disabled:opacity-50"
          >
            {sharing ? (
              <span>Preparando y enviando...</span>
            ) : (
              <>
                <Share2 className="h-4 w-4 stroke-[2.5]" />
                <span>Enviar Reporte y Fotos a WhatsApp</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-xs font-bold transition text-center"
          >
            Cancelar
          </button>
        </div>
      </div>

      {/* FULLSCREEN PHOTO PREVIEW LIGHTBOX (IN-APP - EN GRANDE) */}
      {previewPhoto && (
        <div
          onClick={() => setPreviewPhoto(null)}
          className="fixed inset-0 z-[70] bg-black/95 backdrop-blur-md flex items-center justify-center p-3 animate-fade-in"
        >
          <div 
            className="relative max-w-lg w-full flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="absolute -top-11 right-0 p-2 text-white hover:text-cyan-400 bg-slate-800/80 rounded-full transition shadow-lg active:scale-90"
              title="Cerrar foto"
            >
              <X className="h-5 w-5" />
            </button>

            <img
              src={previewPhoto}
              alt="Evidencia en grande"
              className="max-h-[80vh] w-auto max-w-full rounded-2xl object-contain border border-slate-700 shadow-2xl"
            />

            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="mt-3 px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition shadow active:scale-95"
            >
              Cerrar Foto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
