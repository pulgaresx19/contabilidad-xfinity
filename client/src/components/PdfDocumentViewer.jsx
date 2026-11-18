import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, Download, Trash2, FileText, Share2, MessageCircle } from 'lucide-react';

export default function PdfDocumentViewer({
  url,
  filename = 'reporte.pdf',
  week = null,
  onClose,
  onDelete = null
}) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const touchStartDistRef = useRef(0);
  const lastTapRef = useRef(0);

  const [blobUrl, setBlobUrl] = useState(null);

  // Convertir base64 a Blob URL para renderizado nativo ultra-rápido y limpio
  useEffect(() => {
    let createdUrl = null;
    if (url) {
      if (url.startsWith('data:application/pdf')) {
        try {
          const parts = url.split(',');
          const byteString = atob(parts[1]);
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
          }
          const blob = new Blob([ab], { type: 'application/pdf' });
          createdUrl = URL.createObjectURL(blob);
          setBlobUrl(createdUrl);
        } catch (e) {
          setBlobUrl(url);
        }
      } else {
        setBlobUrl(url);
      }
    }
    return () => {
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [url]);

  // Reiniciar escala al cambiar de archivo
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [url]);

  const handleZoomIn = () => {
    setScale((prev) => Math.min(Math.round((prev + 0.25) * 100) / 100, 3));
  };

  const handleZoomOut = () => {
    setScale((prev) => {
      const next = Math.max(Math.round((prev - 0.25) * 100) / 100, 0.6);
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Doble tap para alternar zoom (1x y 1.8x)
  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (scale > 1) {
        handleReset();
      } else {
        setScale(1.8);
      }
    }
    lastTapRef.current = now;
  };

  // Drag pan con mouse
  const handleMouseDown = (e) => {
    if (scale <= 1) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e) => {
    if (!isDragging || scale <= 1) return;
    setPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Pinch y pan táctil en móviles
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
    } else if (e.touches.length === 1 && scale > 1) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y
      };
    }
    handleDoubleTap();
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (touchStartDistRef.current > 0) {
        const factor = dist / touchStartDistRef.current;
        setScale((prev) => Math.min(Math.max(prev * factor, 0.6), 3));
        touchStartDistRef.current = dist;
      }
    } else if (e.touches.length === 1 && isDragging && scale > 1) {
      setPosition({
        x: e.touches[0].clientX - dragStartRef.current.x,
        y: e.touches[0].clientY - dragStartRef.current.y
      });
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    touchStartDistRef.current = 0;
  };

  // Zoom con rueda de ratón
  const handleWheel = (e) => {
    if (e.ctrlKey || scale > 1) {
      e.preventDefault();
      if (e.deltaY < 0) {
        handleZoomIn();
      } else {
        handleZoomOut();
      }
    }
  };

  // Compartir por WhatsApp o Web Share API
  const handleShareWhatsApp = async () => {
    const weekLabel = week?.displayLabel || week?.key || 'Semana';
    const totalAmount = week?.totalEarnings !== undefined ? `$${Number(week.totalEarnings).toFixed(2)}` : '';
    const shareText = `📄 *COMPROBANTE DE LIQUIDACIÓN / PAGO - XFINITY*\n📅 *Semana:* ${weekLabel}\n💰 *Monto:* ${totalAmount}\n📎 *Archivo:* ${filename}\n\n_Comprobante registrado y auditado correctamente._`;

    // Intentar compartir archivo directo si el navegador móvil lo soporta
    if (navigator.share && url) {
      try {
        if (url.startsWith('data:application/pdf')) {
          const res = await fetch(url);
          const blob = await res.blob();
          const file = new File([blob], filename || 'liquidacion.pdf', { type: 'application/pdf' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: `Liquidación • Semana ${weekLabel}`,
              text: shareText,
              files: [file]
            });
            return;
          }
        }
      } catch (err) {
        console.warn('Native share dismissed or not supported:', err);
      }
    }

    // Fallback directo a WhatsApp
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(waUrl, '_blank');
  };

  // Descarga directa del archivo
  const handleDownload = () => {
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'comprobante.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (_) {
      window.open(url, '_blank');
    }
  };

  const weekDisplay = week?.displayLabel || week?.key || '';
  const earningsDisplay = week?.totalEarnings !== undefined ? `$${Number(week.totalEarnings).toFixed(2)}` : null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[95] bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-2.5 sm:p-4 select-none animate-fade-in"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px) + 8px, 0.6rem)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 10px, 0.75rem)'
      }}
    >
      {/* 1. BARRA SUPERIOR FIJA (NUNCA DESAPARECE, CON POSICIONAMIENTO RELATIVO Y Z-INDEX 50) */}
      <div
        className="w-full flex items-center justify-between px-2 sm:px-3 py-2 bg-slate-900/95 border border-white/10 rounded-2xl shrink-0 z-50 relative gap-2 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Título y Datos de la Semana */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-500/20 text-white font-bold shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-black text-white uppercase tracking-wider font-mono truncate max-w-[160px] sm:max-w-xs">
              {filename}
            </h3>
            <p className="text-[10px] text-rose-300 font-mono truncate">
              {weekDisplay ? `Semana ${weekDisplay}` : 'Reporte PDF'} {earningsDisplay ? `• ${earningsDisplay}` : ''}
            </p>
          </div>
        </div>

        {/* Botones de Acción Superiores: Compartir WhatsApp, Descargar, Eliminar y Cerrar */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Botón WhatsApp */}
          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="h-8 px-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 transition active:scale-95 shadow-md cursor-pointer text-xs font-bold"
            title="Compartir por WhatsApp"
          >
            <Share2 className="w-3.5 h-3.5 stroke-[2.2]" />
            <span className="hidden sm:inline text-[11px]">WhatsApp</span>
          </button>

          {/* Botón Descargar */}
          <button
            type="button"
            onClick={handleDownload}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition active:scale-95 shadow-md cursor-pointer"
            title="Descargar PDF"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Botón Eliminar (opcional) */}
          {onDelete && (
            <button
              type="button"
              onClick={() => {
                if (week?.key) onDelete(week.key);
              }}
              className="w-8 h-8 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 hover:text-rose-200 transition active:scale-95 shadow-md cursor-pointer"
              title="Eliminar comprobante permanentemente"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Botón Cerrar */}
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-slate-300 hover:text-white transition active:scale-95 shadow-md cursor-pointer"
            title="Cerrar visor"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* 2. CUERPO CENTRAL CON ZOOM Y PAN INTERACTIVO (CLIPEADO ESTRICTAMENTE, NUNCA INVADE EL HEADER) */}
      <div
        className="flex-1 min-h-0 w-full flex items-center justify-center p-1 sm:p-2 overflow-hidden relative cursor-grab active:cursor-grabbing select-none z-10"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
      >
        <div
          style={{
            transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            width: '100%',
            height: '100%',
            maxWidth: '820px',
            maxHeight: '74dvh',
            minHeight: '280px'
          }}
          className="flex items-center justify-center rounded-2xl overflow-hidden shadow-2xl relative pointer-events-auto"
        >
          <iframe
            src={blobUrl ? `${blobUrl}#toolbar=0&navpanes=0&scrollbar=1` : url}
            title={filename || 'Reporte PDF'}
            className="w-full h-full rounded-2xl border border-white/10 bg-white shadow-2xl pointer-events-auto"
            style={{ minHeight: '340px', height: '100%', width: '100%' }}
          />
        </div>
      </div>

      {/* 3. BARRA INFERIOR FIJA CON CONTROLES DE ZOOM TIPO FOTO */}
      <div
        className="shrink-0 pt-1 flex flex-col items-center gap-2 z-50 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 bg-slate-900/90 border border-white/15 px-3 py-1.5 rounded-2xl shadow-2xl">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={scale <= 0.6}
            className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition active:scale-90 cursor-pointer"
            title="Reducir zoom"
          >
            <ZoomOut className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="px-2.5 py-1 rounded-xl text-[11px] font-mono font-bold text-cyan-300 hover:bg-white/10 transition active:scale-90 cursor-pointer"
            title="Restablecer tamaño (100%)"
          >
            {Math.round(scale * 100)}%
          </button>

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={scale >= 3}
            className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition active:scale-90 cursor-pointer"
            title="Aumentar zoom"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
