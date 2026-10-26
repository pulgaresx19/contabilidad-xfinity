import React from 'react';
import { ShieldCheck, Clock, DollarSign, CheckCircle2, Ruler, Briefcase, Calendar } from 'lucide-react';

const CUTOFF_LABELS = {
  '0': 'Domingos (Lunes a Domingo)',
  '5': 'Viernes (Sábado a Viernes)',
  '4': 'Jueves (Viernes a Jueves)',
  '6': 'Sábados (Domingo a Sábado)',
  '3': 'Miércoles (Jueves a Miércoles)'
};

export default function ProfileView({ techName, summaryData }) {
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
      <div className="bg-white dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 font-black text-xl shadow-lg shadow-cyan-500/25">
              J
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-black text-slate-900 dark:text-white">{techName || 'Javier (P0G1)'}</h2>
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-xs text-cyan-700 dark:text-cyan-400 font-mono font-semibold">Técnico Instalador Xfinity</p>
            </div>
          </div>

          <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800/40">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Activo</span>
          </div>
        </div>

        {/* Active Rates Chips */}
        <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-950/70 p-3 rounded-2xl border border-slate-200 dark:border-slate-800/80 text-xs">
          <div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Tarifa Base por Trabajo:</span>
            <span className="text-sm font-black text-emerald-700 dark:text-emerald-400 font-mono">$100.00</span>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Bono Driveway Bore (DW):</span>
            <span className="text-sm font-black text-cyan-700 dark:text-cyan-400 font-mono">+$30.00</span>
          </div>
        </div>

        {/* Active Cutoff Day Card */}
        <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-950/60 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800/80 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 rounded-xl">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Día de Cierre de Semana:</span>
              <span className="font-bold text-amber-800 dark:text-amber-300 font-mono text-[11px]">
                {CUTOFF_LABELS[String(summary.cutoffDay ?? '0')] || 'Domingos (Lunes a Domingo)'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. FINANCIAL BALANCE: PENDIENTE VS COBRADO */}
      <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 space-y-3.5 shadow-lg">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Balance de Contabilidad
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Liquidación Semanal</span>
        </div>

        {/* 2 Big Cards: Pendiente por Cobrar & Total Cobrado */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Pendiente por Cobrar */}
          <div className="bg-amber-50/70 dark:bg-slate-950/90 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-3.5 space-y-1.5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center justify-between text-amber-700 dark:text-amber-400">
              <span className="text-[10px] font-black uppercase tracking-wider">Pendiente</span>
              <Clock className="h-4 w-4" />
            </div>
            <div className="text-2xl font-black text-amber-800 dark:text-amber-300 font-mono leading-none pt-0.5">
              ${(summary.totalPending || 0).toFixed(2)}
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
              Aún no cobrado por confirmar
            </p>
          </div>

          {/* Total Cobrado */}
          <div className="bg-emerald-50/70 dark:bg-slate-950/90 border border-emerald-200 dark:border-emerald-500/30 rounded-2xl p-3.5 space-y-1.5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
              <span className="text-[10px] font-black uppercase tracking-wider">Cobrado</span>
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div className="text-2xl font-black text-emerald-800 dark:text-emerald-400 font-mono leading-none pt-0.5">
              ${(summary.totalPaid || 0).toFixed(2)}
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
              Pago recibido y confirmado
            </p>
          </div>
        </div>

        {/* Producción Histórica y Metraje */}
        <div className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <div className="p-1.5 bg-cyan-100 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400 rounded-lg">
                <DollarSign className="h-4 w-4" />
              </div>
              <span className="font-semibold">Producción Total Histórica</span>
            </div>
            <span className="font-black text-slate-900 dark:text-white font-mono text-sm">
              ${(summary.totalAllEarnings || 0).toFixed(2)}
            </span>
          </div>

          <div className="h-px bg-slate-200 dark:bg-slate-800/80" />

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <div className="p-1.5 bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 rounded-lg">
                <Ruler className="h-4 w-4" />
              </div>
              <span className="font-semibold">Metraje Total Instalado</span>
            </div>
            <span className="font-black text-amber-800 dark:text-amber-300 font-mono text-sm">
              {(summary.totalFeetAll || 0).toLocaleString()} ft
            </span>
          </div>

          <div className="h-px bg-slate-200 dark:bg-slate-800/80" />

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <div className="p-1.5 bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 rounded-lg">
                <Briefcase className="h-4 w-4" />
              </div>
              <span className="font-semibold">Trabajos Completados</span>
            </div>
            <span className="font-black text-slate-900 dark:text-slate-200 font-mono text-sm">
              {summary.totalCompletedCount || 0} de {summary.totalOrdersCount || 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
