import React, { useState, useEffect } from 'react';
import {
  X, DollarSign, CheckCheck, Clock, Share2,
  Camera
} from 'lucide-react';
import { formatDateFriendly } from '../utils/dateUtils';
import { formatCableType, getBoreInfo } from '../utils/remarkUtils';

const formatMoney = (val) => {
  const num = Number(val) || 0;
  return num % 1 === 0 ? num.toFixed(0) : num.toFixed(2);
};

export default function DayFinancialModal({
  isOpen,
  onClose,
  activeDate,
  orders = [],
  onSelectJob,
  onOpenPhotos,
  onOpenShareModal,
  localSharedMap = {}
}) {
  const [filter, setFilter] = useState('completed'); // 'completed' | 'pending' | 'cancelled' | 'all'

  // Siempre que se abra el modal, inicia enfocado en los trabajos Realizados
  useEffect(() => {
    if (isOpen) {
      setFilter('completed');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const completedOrders = orders.filter((o) => o.status === 'Completado');
  const pendingOrders = orders.filter((o) => o.status !== 'Completado' && o.status !== 'No Realizado');
  const cancelledOrders = orders.filter((o) => o.status === 'No Realizado');

  const completedEarnings = completedOrders.reduce((sum, o) => sum + (parseFloat(o.rate_calculated) || 0), 0);
  const pendingEarnings = pendingOrders.reduce((sum, o) => sum + (parseFloat(o.rate_calculated) || 0), 0);
  const totalPotential = completedEarnings + pendingEarnings;
  const completedFootage = completedOrders.reduce((sum, o) => sum + (parseInt(o.drop_footage, 10) || 0), 0);

  const displayedOrders = filter === 'completed'
    ? completedOrders
    : filter === 'pending'
    ? pendingOrders
    : filter === 'cancelled'
    ? cancelledOrders
    : orders;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in modal-overlay-safe select-none"
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
        {/* 1. Header */}
        <div className="px-4 sm:px-5 py-3 border-b border-white/10 flex items-center justify-between bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 shrink-0 shadow-md shadow-emerald-500/20">
              <DollarSign className="h-4.5 w-4.5 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-white truncate">
                Estado Financiero del Día
              </h3>
              <p className="text-[10.5px] text-slate-400 font-semibold truncate">
                {formatDateFriendly(activeDate)} • Balance de Jornada
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0"
            title="Cerrar ventana"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 2. Resumen de KPIs Financieros */}
        <div className="p-3 bg-[#0a0f18] border-b border-white/5 shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {/* Realizados */}
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col">
              <span className="text-[9.5px] font-bold text-emerald-300 uppercase tracking-wider truncate">
                Realizados
              </span>
              <span className="text-sm sm:text-base font-black font-mono text-emerald-400 mt-0.5">
                ${formatMoney(completedEarnings)}
              </span>
              <span className="text-[9.5px] text-emerald-300/80 font-medium mt-auto truncate">
                ✓ {completedOrders.length} {completedOrders.length === 1 ? 'realizado' : 'realizados'}
              </span>
            </div>

            {/* Pendientes */}
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col">
              <span className="text-[9.5px] font-bold text-amber-300 uppercase tracking-wider truncate">
                Pendientes
              </span>
              <span className="text-sm sm:text-base font-black font-mono text-amber-400 mt-0.5">
                ${formatMoney(pendingEarnings)}
              </span>
              <span className="text-[9.5px] text-amber-300/80 font-medium mt-auto truncate">
                ⏳ {pendingOrders.length} {pendingOrders.length === 1 ? 'pendiente' : 'pendientes'}
              </span>
            </div>

            {/* Proyección Total */}
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex flex-col">
              <span className="text-[9.5px] font-bold text-cyan-300 uppercase tracking-wider truncate">
                Proyección
              </span>
              <span className="text-sm sm:text-base font-black font-mono text-cyan-400 mt-0.5">
                ${formatMoney(totalPotential)}
              </span>
              <span className="text-[9.5px] text-cyan-300/80 font-medium mt-auto truncate">
                {orders.length} asignados
              </span>
            </div>

            {/* Metraje Instalado */}
            <div className="p-2 rounded-xl bg-[#16202c] border border-white/10 flex flex-col">
              <span className="text-[9.5px] font-bold text-slate-300 uppercase tracking-wider truncate">
                Metraje Hecho
              </span>
              <span className="text-sm sm:text-base font-black font-mono text-white mt-0.5">
                {completedFootage} <span className="text-[10px] font-normal text-slate-400">ft</span>
              </span>
              <span className="text-[9.5px] text-slate-400 font-medium mt-auto truncate">
                enterrados
              </span>
            </div>
          </div>
        </div>

        {/* 3. Filtros Segmentados 4 Columnas: Realizados, Pendientes, Cancelados, Todos */}
        <div className="px-3 sm:px-4 py-2 border-b border-white/5 bg-[#101722] shrink-0">
          <div className="grid grid-cols-4 gap-1 bg-[#121922] p-1 rounded-xl border border-white/5 text-[10px] font-bold text-center">
            {/* 1. Realizados */}
            <button
              type="button"
              onClick={() => setFilter('completed')}
              className={`py-1.5 px-0.5 rounded-lg transition font-bold truncate cursor-pointer ${
                filter === 'completed'
                  ? 'bg-emerald-500 text-slate-950 font-black shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
              title="Ver trabajos realizados"
            >
              <span className="sm:hidden">Realiz. ({completedOrders.length})</span>
              <span className="hidden sm:inline">Realizados ({completedOrders.length})</span>
            </button>

            {/* 2. Pendientes */}
            <button
              type="button"
              onClick={() => setFilter('pending')}
              className={`py-1.5 px-0.5 rounded-lg transition font-bold truncate cursor-pointer ${
                filter === 'pending'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
              title="Ver trabajos pendientes"
            >
              <span className="sm:hidden">Pend. ({pendingOrders.length})</span>
              <span className="hidden sm:inline">Pendientes ({pendingOrders.length})</span>
            </button>

            {/* 3. Cancelados */}
            <button
              type="button"
              onClick={() => setFilter('cancelled')}
              className={`py-1.5 px-0.5 rounded-lg transition font-bold truncate cursor-pointer ${
                filter === 'cancelled'
                  ? 'bg-rose-600 text-white font-black shadow-sm shadow-rose-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
              title="Ver trabajos cancelados"
            >
              <span className="sm:hidden">Canc. ({cancelledOrders.length})</span>
              <span className="hidden sm:inline">Cancelados ({cancelledOrders.length})</span>
            </button>

            {/* 4. Todos */}
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`py-1.5 px-0.5 rounded-lg transition font-bold truncate cursor-pointer ${
                filter === 'all'
                  ? 'bg-cyan-500 text-slate-950 font-black shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
              title="Ver todos los trabajos"
            >
              Todos ({orders.length})
            </button>
          </div>
        </div>

        {/* 4. Lista de Trabajos y Tarifas */}
        <div className="p-2.5 sm:p-3 space-y-2 overflow-y-auto flex-1 min-h-0 bg-[#0e1622] sleek-scroll">
          {displayedOrders.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No hay trabajos en este filtro para la jornada.
            </div>
          ) : (
            displayedOrders.map((ord, idx) => {
              const isCompleted = ord.status === 'Completado';
              const isCancelled = ord.status === 'No Realizado';
              const isPending = !isCompleted && !isCancelled;
              const rate = parseFloat(ord.rate_calculated) || 100;
              const bore = getBoreInfo(ord.bore_type);
              const isShared = Boolean(ord.whatsapp_shared || ord.whatsapp_shared_at || localSharedMap[ord.id]);

              return (
                <div
                  key={ord.id || idx}
                  className={`p-2.5 rounded-2xl border transition select-none flex flex-col gap-1.5 ${
                    isCompleted
                      ? 'bg-emerald-950/20 border-emerald-500/30'
                      : isCancelled
                      ? 'bg-rose-950/20 border-rose-500/30'
                      : 'bg-[#16202c]/90 border-amber-500/30'
                  }`}
                >
                  {/* Fila Superior: Parada + Dirección + Tarifa */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <div
                        className={`w-6 h-6 rounded-full font-black text-xs font-mono flex items-center justify-center shrink-0 mt-0.5 ${
                          isCompleted
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : isCancelled
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        {isCompleted ? '✓' : ord.route_order || idx + 1}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono text-cyan-300 font-semibold">
                            #{ord.job_id}
                          </span>
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded-md ${
                            isCompleted
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : isCancelled
                              ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                              : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          }`}>
                            {ord.status}
                          </span>
                        </div>

                        <div className="text-xs font-bold text-white truncate mt-0.5">
                          {ord.address}
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium">
                          {ord.city || 'Skokie'}
                        </div>
                      </div>
                    </div>

                    {/* Tarifa de la Orden */}
                    <div className="text-right shrink-0">
                      <div
                        className={`text-sm sm:text-base font-black font-mono ${
                          isCompleted
                            ? 'text-emerald-400'
                            : isCancelled
                            ? 'text-rose-400 line-through'
                            : 'text-amber-400'
                        }`}
                      >
                        ${formatMoney(rate)}
                      </div>
                      <div className="text-[9px] text-slate-400 font-medium mt-0.5">
                        {isCompleted ? 'Realizado' : isCancelled ? 'No Cobrado' : 'Estimado'}
                      </div>
                    </div>
                  </div>

                  {/* Fila Inferior: Desglose de Metraje, Cable, Bore y Acciones */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5 text-[10px] font-mono flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap text-slate-300">
                      <span>{ord.drop_footage || 0} ft</span>
                      <span>•</span>
                      <span className={ord.cable_type === 'EPON' ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                        {formatCableType(ord.cable_type)}
                      </span>
                      {bore && (
                        <>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1 text-[9px] font-medium text-slate-200">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${bore.dotColor}`} />
                            <span>{bore.label}</span>
                          </span>
                        </>
                      )}
                    </div>

                    {/* Botones de acción */}
                    <div className="flex items-center gap-1.5 ml-auto">
                      {isCompleted && (
                        <>
                          {isShared ? (
                            <span className="inline-flex items-center gap-1 text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/25">
                              <CheckCheck className="h-3 w-3" />
                              <span>Reportado</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                if (onOpenShareModal) onOpenShareModal(ord);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/40 text-[9px] font-bold transition active:scale-95 cursor-pointer"
                              title="Compartir reporte por WhatsApp"
                            >
                              <Share2 className="h-3 w-3" />
                              <span>Enviar Reporte</span>
                            </button>
                          )}
                        </>
                      )}

                      {onOpenPhotos && (
                        <button
                          type="button"
                          onClick={() => onOpenPhotos(ord)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 text-[9px] font-bold transition active:scale-95 cursor-pointer border border-white/10"
                          title="Ver o tomar fotos de evidencia"
                        >
                          <Camera className="h-3 w-3" />
                          <span>Evidencias</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 5. Footer */}
        <div className="px-4 py-2.5 border-t border-white/10 bg-[#131d2a] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 font-medium">Total Realizado:</span>
            <span className="text-sm font-black font-mono text-emerald-400">
              ${formatMoney(completedEarnings)}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition active:scale-95 cursor-pointer border border-white/10 shadow-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
