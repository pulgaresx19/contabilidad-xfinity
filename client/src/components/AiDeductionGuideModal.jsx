import React, { useEffect, useState } from 'react';
import { 
  X, Sparkles, ShieldCheck, Info, CheckCircle, Search 
} from 'lucide-react';
import { BADGE_DEFINITIONS } from '../utils/remarkUtils';

export default function AiDeductionGuideModal({ isOpen, onClose }) {
  const [filterSearch, setFilterSearch] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const allDefinitions = Object.values(BADGE_DEFINITIONS);
  const filtered = allDefinitions.filter((item) => {
    if (!filterSearch.trim()) return true;
    const q = filterSearch.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.dispatchCode.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.aiPattern.toLowerCase().includes(q)
    );
  });

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in modal-overlay-safe"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px) + 16px, 1.25rem)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 1.25rem)'
      }}
      onClick={onClose}
    >
      <div 
        className="bg-[#101722]/95 backdrop-blur-xl border border-white/10 rounded-3xl w-full max-w-lg modal-sheet-compact flex flex-col overflow-hidden shadow-2xl text-white transition-all transform animate-in zoom-in-95 max-h-[85dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Modal */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-amber-500 flex items-center justify-center text-white shrink-0 shadow-lg shadow-cyan-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[9.5px] uppercase tracking-wider text-cyan-400 font-bold block font-mono">
                AuraCore-AI • Inteligencia de Despacho
              </span>
              <h3 className="text-sm font-black text-white uppercase tracking-wide truncate">
                Guía de Deducción y Códigos
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

        {/* Buscador Rápido de Códigos */}
        <div className="px-4 py-2.5 bg-black/30 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0b1017] border border-white/10 text-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Buscar por código (ej. RQHM, DOG, LANDSC, NBR, rojo)..."
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="w-full bg-transparent text-slate-200 placeholder-slate-500 text-xs focus:outline-none"
            />
            {filterSearch && (
              <button
                type="button"
                onClick={() => setFilterSearch('')}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Lista Completa de Todos los Tipos / Códigos */}
        <div className="p-4 sm:p-5 space-y-3 overflow-y-auto modal-scroll-container">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              No se encontraron coincidencias para "{filterSearch}".
            </div>
          ) : (
            filtered.map((item) => (
              <div 
                key={item.key}
                className="rounded-2xl border border-white/10 bg-[#131b26] p-3.5 space-y-2.5 shadow-sm hover:border-cyan-500/30 transition"
              >
                {/* Cabecera del Tipo */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg shrink-0">{item.icon}</span>
                    <div className="min-w-0">
                      <h4 className="text-xs font-black text-white uppercase tracking-wide truncate">
                        {item.title}
                      </h4>
                      <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block font-mono">
                        {item.category}
                      </span>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded-md border text-[10px] font-mono font-bold shrink-0 ${item.colorClasses?.badge || 'bg-white/5 text-slate-300 border-white/10'}`}>
                    {item.dispatchCode}
                  </span>
                </div>

                {/* Qué patrón deduce la IA */}
                <div className="p-2 rounded-xl bg-black/40 border border-white/5 space-y-0.5 text-left">
                  <span className="text-[9.5px] uppercase font-bold text-cyan-400 block font-mono flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Patrón que deduce la IA:
                  </span>
                  <p className="text-[11px] text-slate-300 font-mono leading-snug">
                    {item.aiPattern}
                  </p>
                </div>

                {/* Significado y Recomendación */}
                <div className="space-y-1 text-left">
                  <p className="text-xs text-slate-300 leading-snug">
                    {item.description}
                  </p>
                  <p className="text-[10.5px] text-amber-300/90 flex items-start gap-1 pt-0.5">
                    <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>{item.fieldTips}</span>
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pie del Modal */}
        <div className="px-4 py-3 border-t border-white/10 bg-slate-900/60 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-slate-400 font-mono">
            {filtered.length} de {allDefinitions.length} especificaciones disponibles
          </span>
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
