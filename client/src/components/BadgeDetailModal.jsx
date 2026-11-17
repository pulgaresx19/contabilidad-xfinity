import React, { useEffect } from 'react';
import { 
  X, Sparkles, ShieldCheck, MapPin, Hash, Phone, 
  AlertTriangle, CheckCircle, Info, ChevronRight 
} from 'lucide-react';
import { getBadgeDetailedInfo } from '../utils/remarkUtils';

export default function BadgeDetailModal({ 
  isOpen, 
  badgeKey, 
  order, 
  onClose,
  onTogglePriority 
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !badgeKey) return null;

  const info = getBadgeDetailedInfo(badgeKey, order);
  const color = info.colorClasses || {
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    glow: 'shadow-cyan-500/20',
    accent: 'text-cyan-400'
  };

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
        className="bg-[#101722]/95 backdrop-blur-xl border border-white/10 rounded-3xl w-full max-w-sm sm:max-w-md modal-sheet-compact flex flex-col overflow-hidden shadow-2xl text-white transition-all transform animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Modal */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center text-xl shrink-0 shadow-lg ${color.badge} ${color.glow}`}>
              <span>{info.icon}</span>
            </div>
            <div className="min-w-0">
              <span className="text-[9.5px] uppercase tracking-wider text-slate-400 font-bold block font-mono">
                {info.category}
              </span>
              <h3 className="text-sm font-black text-white uppercase tracking-wide truncate">
                {info.title}
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

        {/* Contenido Principal con Scroll Seguro */}
        <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto max-h-[70dvh] modal-scroll-container">
          
          {/* Bloque Unificado: Código de Despacho y Deducción de la IA */}
          <div className="rounded-2xl border border-cyan-500/25 bg-[#0e1622] p-3.5 space-y-2.5 shadow-sm text-left">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-cyan-400">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-200 font-mono">
                  Código y Deducción IA
                </span>
              </div>
              <span className={`px-2.5 py-0.5 rounded-lg border text-[11px] font-mono font-bold tracking-tight ${color.badge} shrink-0`}>
                {info.dispatchCode}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-1.5 text-left">
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-semibold">
                Patrón analizado en la orden:
              </div>
              <div className="text-[11.5px] text-cyan-200 font-mono leading-relaxed">
                {info.aiPattern}
              </div>
            </div>
          </div>

          {/* Bloque 2: Significado de Campo y Recomendación */}
          <div className="rounded-2xl border border-white/10 bg-[#131b26] p-3.5 space-y-2.5 shadow-sm">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                Significado en Campo
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {info.description}
            </p>

            <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 text-[11px] text-amber-300/90 flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span className="leading-snug">{info.fieldTips}</span>
            </div>
          </div>

          {/* Bloque 3: Datos de esta Orden (Si se abrió desde una orden) */}
          {info.orderContext && (
            <div className="rounded-2xl border border-cyan-500/25 bg-[#0e1622] p-3.5 space-y-2 shadow-inner">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1">
                  <Hash className="w-3 h-3" />
                  Trabajo #{info.orderContext.jobId}
                </span>
                {info.orderContext.city && (
                  <span className="text-[9.5px] px-2 py-0.5 rounded-md bg-white/5 text-slate-300 border border-white/10 uppercase font-mono font-bold">
                    {info.orderContext.city}
                  </span>
                )}
              </div>

              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{info.orderContext.address}</span>
              </div>

              <div className="pt-1 border-t border-white/5 text-[10.5px] font-mono text-slate-400 flex flex-col gap-1">
                <span className="text-slate-500 uppercase text-[9px] font-bold">
                  Valor deducido en este registro:
                </span>
                <span className="text-cyan-300 bg-black/40 px-2 py-1 rounded-lg border border-white/5 font-semibold break-all">
                  {info.orderContext.matchedRaw || 'Condición estándar'}
                </span>
              </div>

              {/* Si es Prioritario, botón interactivo para alternar */}
              {info.key === 'priority-red' && onTogglePriority && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      onTogglePriority(order);
                      onClose();
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <span>🔴</span>
                    <span>{info.orderContext.isPriority ? 'Quitar Marca de Prioritario' : 'Activar como Prioritario'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Pie del Modal */}
        <div className="px-4 py-3 border-t border-white/10 bg-slate-900/60 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold transition cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 shadow-md"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Entendido</span>
          </button>
        </div>
      </div>
    </div>
  );
}
