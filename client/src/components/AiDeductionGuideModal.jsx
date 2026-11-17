import React, { useEffect, useState, useRef } from 'react';
import { 
  X, Sparkles, ShieldCheck, Info, CheckCircle, ChevronLeft, ChevronRight 
} from 'lucide-react';
import { BADGE_DEFINITIONS } from '../utils/remarkUtils';

export default function AiDeductionGuideModal({ isOpen, onClose }) {
  const allDefinitions = Object.values(BADGE_DEFINITIONS);
  const [selectedKey, setSelectedKey] = useState(() => allDefinitions[0]?.key || 'priority-red');
  const selectorContainerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedKey, onClose]);

  if (!isOpen) return null;

  const currentIndex = allDefinitions.findIndex((d) => d.key === selectedKey);
  const currentItem = allDefinitions[currentIndex >= 0 ? currentIndex : 0];

  const handleSelect = (key) => {
    setSelectedKey(key);
  };

  const handleNext = () => {
    const nextIdx = (currentIndex + 1) % allDefinitions.length;
    setSelectedKey(allDefinitions[nextIdx].key);
  };

  const handlePrev = () => {
    const prevIdx = (currentIndex - 1 + allDefinitions.length) % allDefinitions.length;
    setSelectedKey(allDefinitions[prevIdx].key);
  };

  const color = currentItem.colorClasses || {
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    glow: 'shadow-cyan-500/20',
    accent: 'text-cyan-400'
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in modal-overlay-safe"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px) + 16px, 1.25rem)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 1.25rem)'
      }}
      onClick={onClose}
    >
      <div 
        className="bg-[#101722]/95 backdrop-blur-xl border border-white/10 rounded-3xl w-full max-w-sm sm:max-w-md modal-sheet-compact flex flex-col overflow-hidden shadow-2xl text-white transition-all transform animate-in zoom-in-95 max-h-[85dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Cabecera del Modal */}
        <div className="px-4 sm:px-5 py-3 border-b border-white/10 flex items-center justify-between bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-cyan-500 to-amber-500 flex items-center justify-center text-white shrink-0 shadow-lg shadow-cyan-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[9px] uppercase tracking-wider text-cyan-400 font-bold block font-mono">
                AuraCore-AI • Despacho Xfinity
              </span>
              <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-wide truncate">
                Guía de Deducción de la IA
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition shrink-0 cursor-pointer active:scale-95"
            title="Cerrar ventana"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. Selector Horizontal de Tipos (Con Estética Cockpit y Padding Holgado) */}
        <div className="px-3 sm:px-4 py-2.5 bg-black/40 border-b border-white/5 shrink-0">
          <div className="flex items-center justify-between pb-1.5 px-1">
            <span className="text-[9.5px] uppercase font-black tracking-wider text-slate-400 font-mono">
              Selecciona un Tipo o Alerta:
            </span>
            <span className="text-[9px] font-mono font-bold text-cyan-400/80">
              {currentIndex + 1} de {allDefinitions.length}
            </span>
          </div>

          <div 
            ref={selectorContainerRef}
            className="cockpit-scroll-x flex items-center gap-2 overflow-x-auto px-1.5 pb-2 pt-1 select-none scroll-smooth"
          >
            {allDefinitions.map((item) => {
              const isSelected = item.key === selectedKey;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleSelect(item.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold shrink-0 transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                    isSelected
                      ? `${item.colorClasses?.badge || 'bg-cyan-500/25 text-white border-cyan-400'} ring-1 ring-cyan-400/60 shadow-lg scale-[1.02]`
                      : 'bg-[#141d28] hover:bg-[#1b2736] text-slate-400 hover:text-slate-200 border border-white/10'
                  }`}
                  title={`Ver detalle de ${item.title}`}
                >
                  <span className="text-xs shrink-0">{item.icon}</span>
                  <span className="truncate">{item.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Contenido Dinámico del Tipo Seleccionado */}
        <div className="p-4 sm:p-5 space-y-3 overflow-y-auto cockpit-scroll flex-1">
          
          {/* Tarjeta de Encabezado del Tipo Separada en Contenedores Limpios */}
          <div className="rounded-2xl border border-white/10 bg-[#131b26] p-3.5 space-y-3 shadow-sm animate-fade-in text-left">
            {/* Contenedor Superior: Icono, Título y Categoría */}
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center text-2xl shrink-0 shadow-lg ${color.badge} ${color.glow}`}>
                <span>{currentItem.icon}</span>
              </div>
              <div className="min-w-0 text-left">
                <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block font-mono">
                  {currentItem.category}
                </span>
                <h4 className="text-sm sm:text-base font-black text-white uppercase tracking-wide truncate">
                  {currentItem.title}
                </h4>
              </div>
            </div>

            {/* Contenedor Inferior Independiente: Código Oficial en Despacho */}
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-black/40 border border-white/5">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-semibold">
                Código Oficial en Despacho:
              </span>
              <span className={`px-2.5 py-0.5 rounded-lg border text-[11px] font-mono font-bold tracking-tight text-right ${color.badge}`}>
                {currentItem.dispatchCode}
              </span>
            </div>
          </div>

          {/* Bloque: ¿Qué patrón deduce la IA? */}
          <div className="rounded-2xl border border-cyan-500/25 bg-[#0e1622] p-3.5 space-y-1.5 shadow-sm text-left animate-fade-in">
            <div className="flex items-center gap-1.5 text-cyan-400">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span className="text-xs font-black uppercase tracking-wider text-slate-200 font-mono">
                ¿Qué patrón deduce la IA?
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 text-[11.5px] text-cyan-200 font-mono leading-relaxed">
              {currentItem.aiPattern}
            </div>
          </div>

          {/* Bloque: Significado en Terreno y Procedimiento Operativo */}
          <div className="rounded-2xl border border-white/10 bg-[#131b26] p-3.5 space-y-2.5 shadow-sm text-left animate-fade-in">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span className="text-xs font-black uppercase tracking-wider text-slate-200 font-mono">
                Significado en Terreno
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed pl-0.5">
              {currentItem.description}
            </p>

            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-300/90 flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span className="leading-snug">{currentItem.fieldTips}</span>
            </div>
          </div>

        </div>

        {/* 4. Pie del Modal con Navegación Anterior/Siguiente y Botón de Cierre */}
        <div className="px-4 py-3 border-t border-white/10 bg-slate-900/70 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrev}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition active:scale-90 cursor-pointer"
              title="Tipo Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition active:scale-90 cursor-pointer"
              title="Tipo Siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold transition cursor-pointer active:scale-95 flex items-center gap-1.5 shadow-md"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Entendido</span>
          </button>
        </div>
      </div>
    </div>
  );
}
