import React from 'react';
import { ShieldCheck, Settings, Clock, DollarSign, CheckCircle2, Ruler, Briefcase, ChevronRight } from 'lucide-react';

export default function ProfileView({ techName, summaryData, onOpenSettings }) {
  const summary = summaryData?.summary || {
    totalAllEarnings: 0,
    totalPending: 0,
    totalPaid: 0,
    totalFeetAll: 0,
    totalOrdersCount: 0,
    totalCompletedCount: 0
  };

  return (
    <div className="space-y-4 max-w-md mx-auto">
      {/* 1. TECH PROFILE HEADER */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 font-black text-xl shadow-lg shadow-cyan-500/25">
              J
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-black text-white">{techName || 'Javier (P0G1)'}</h2>
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="text-xs text-cyan-400 font-mono">Técnico Instalador Xfinity</p>
            </div>
          </div>

          <button
            onClick={onOpenSettings}
            className="p-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-2xl transition border border-slate-700/60 active:scale-95"
            title="Configurar Tarifas"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>

        {/* Active Rates Chips */}
        <div className="grid grid-cols-2 gap-2 bg-slate-950/70 p-3 rounded-2xl border border-slate-800/80 text-xs">
          <div>
            <span className="text-[10px] text-slate-400 block font-medium">Tarifa Base por Trabajo:</span>
            <span className="text-sm font-black text-emerald-400 font-mono">$100.00</span>
          </div>

          <div>
            <span className="text-[10px] text-slate-400 block font-medium">Bono Driveway Bore (DW):</span>
            <span className="text-sm font-black text-cyan-400 font-mono">+$30.00</span>
          </div>
        </div>
      </div>

      {/* 2. FINANCIAL BALANCE: PENDIENTE VS COBRADO */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 space-y-3.5 shadow-lg">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Balance de Contabilidad
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Liquidación Semanal</span>
        </div>

        {/* 2 Big Cards: Pendiente por Cobrar & Total Cobrado */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Pendiente por Cobrar */}
          <div className="bg-slate-950/90 border border-amber-500/30 rounded-2xl p-3.5 space-y-1.5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center justify-between text-amber-400">
              <span className="text-[10px] font-black uppercase tracking-wider">Pendiente</span>
              <Clock className="h-4 w-4" />
            </div>
            <div className="text-2xl font-black text-amber-300 font-mono leading-none pt-0.5">
              ${(summary.totalPending || 0).toFixed(2)}
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              Aún no cobrado por confirmar
            </p>
          </div>

          {/* Total Cobrado */}
          <div className="bg-slate-950/90 border border-emerald-500/30 rounded-2xl p-3.5 space-y-1.5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center justify-between text-emerald-400">
              <span className="text-[10px] font-black uppercase tracking-wider">Cobrado</span>
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div className="text-2xl font-black text-emerald-400 font-mono leading-none pt-0.5">
              ${(summary.totalPaid || 0).toFixed(2)}
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              Pago recibido y confirmado
            </p>
          </div>
        </div>

        {/* Producción Histórica y Metraje */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <div className="p-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg">
                <DollarSign className="h-4 w-4" />
              </div>
              <span className="font-semibold">Producción Total Histórica</span>
            </div>
            <span className="font-black text-white font-mono text-sm">
              ${(summary.totalAllEarnings || 0).toFixed(2)}
            </span>
          </div>

          <div className="h-px bg-slate-800/80" />

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <div className="p-1.5 bg-amber-500/10 text-amber-400 rounded-lg">
                <Ruler className="h-4 w-4" />
              </div>
              <span className="font-semibold">Metraje Total Instalado</span>
            </div>
            <span className="font-black text-amber-300 font-mono text-sm">
              {(summary.totalFeetAll || 0).toLocaleString()} ft
            </span>
          </div>

          <div className="h-px bg-slate-800/80" />

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <div className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg">
                <Briefcase className="h-4 w-4" />
              </div>
              <span className="font-semibold">Trabajos Completados</span>
            </div>
            <span className="font-black text-slate-200 font-mono text-sm">
              {summary.totalCompletedCount || 0} de {summary.totalOrdersCount || 0}
            </span>
          </div>
        </div>
      </div>

      {/* 3. INSTRUCCIÓN CLARA DE COBRO */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3.5 text-xs text-slate-400 space-y-1">
        <p className="text-[11px] leading-relaxed text-slate-300">
          💡 Puedes confirmar el cobro recibido de cada semana directamente en la pestaña <strong className="text-cyan-400">Cierres</strong> con el botón <strong className="text-emerald-400">"Confirmar Cobro"</strong>.
        </p>
      </div>
    </div>
  );
}
