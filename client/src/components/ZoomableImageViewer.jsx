import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Maximize2 } from 'lucide-react';

export default function ZoomableImageViewer({
  src,
  alt = 'Foto',
  title = 'Visor de Imagen',
  onClose,
  extraHeaderActions = null,
  extraFooterActions = null
}) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const touchStartDistRef = useRef(0);
  const lastTapRef = useRef(0);

  // Reset scale and position when src changes
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [src]);

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.5, 4));
  };

  const handleZoomOut = () => {
    setScale((prev) => {
      const next = Math.max(prev - 0.5, 1);
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Double tap to toggle zoom between 1x and 2.5x
  const handleDoubleTap = (e) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (scale > 1) {
        handleReset();
      } else {
        setScale(2.5);
      }
    }
    lastTapRef.current = now;
  };

  // Mouse drag handlers
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

  // Touch handlers for mobile pinch and pan
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      // Pinch start
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
    } else if (e.touches.length === 1 && scale > 1) {
      // Pan start
      setIsDragging(true);
      dragStartRef.current = {
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y
      };
    }
    handleDoubleTap(e);
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2) {
      // Pinch zoom
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (touchStartDistRef.current > 0) {
        const factor = dist / touchStartDistRef.current;
        setScale((prev) => Math.min(Math.max(prev * factor, 1), 4));
        touchStartDistRef.current = dist;
      }
    } else if (e.touches.length === 1 && isDragging && scale > 1) {
      // Drag pan
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

  // Wheel zoom
  const handleWheel = (e) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setScale((prev) => Math.min(prev + 0.25, 4));
    } else {
      setScale((prev) => {
        const next = Math.max(prev - 0.25, 1);
        if (next === 1) setPosition({ x: 0, y: 0 });
        return next;
      });
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[95] bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-3 sm:p-4 select-none animate-fade-in"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px) + 10px, 0.75rem)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 12px, 1rem)'
      }}
    >
      {/* Barra Superior con Título y Botón Cerrar */}
      <div
        className="w-full flex items-center justify-between px-2 py-1 shrink-0 z-50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 min-w-0 text-white">
          <span className="text-xs sm:text-sm font-black tracking-wide truncate font-mono">
            {title}
          </span>
          {scale > 1 && (
            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-800">
              {scale.toFixed(1)}x
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {extraHeaderActions}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-slate-900/90 text-white hover:text-cyan-400 border border-white/20 shadow-2xl transition active:scale-90 cursor-pointer"
            title="Cerrar visor"
          >
            <X className="h-4 w-4 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* Contenedor Interactivo con Zoom y Pan */}
      <div
        className="flex-1 min-h-0 w-full flex items-center justify-center p-2 overflow-hidden relative cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
            transition: isDragging ? 'none' : 'transform 0.15s ease-out'
          }}
          className="max-h-[72dvh] max-w-[95vw] sm:max-w-xl w-auto h-auto rounded-2xl object-contain shadow-2xl select-none pointer-events-auto"
        />
      </div>

      {/* Barra de Controles Inferior (Zoom + / Zoom - / 1x / Extra) */}
      <div
        className="shrink-0 pt-2 flex flex-col items-center gap-2.5 z-50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Controles Flotantes de Zoom */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 border border-white/15 px-3 py-1.5 rounded-2xl shadow-2xl">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={scale <= 1}
            className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition active:scale-90 cursor-pointer"
            title="Reducir zoom"
          >
            <ZoomOut className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="px-2 py-1 rounded-xl text-[11px] font-mono font-bold text-cyan-300 hover:bg-white/10 transition active:scale-90 cursor-pointer"
            title="Restablecer tamaño (1x)"
          >
            {scale > 1 ? `${scale.toFixed(1)}x` : '1x'}
          </button>

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={scale >= 4}
            className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition active:scale-90 cursor-pointer"
            title="Ampliar zoom"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>

        {/* Acciones Adicionales (Ej. Cambiar Hoja / Cerrar) */}
        {extraFooterActions && (
          <div className="flex items-center gap-2.5">
            {extraFooterActions}
          </div>
        )}
      </div>
    </div>
  );
}
