import React from 'react';
import { User, ShieldCheck, Settings, Clock, DollarSign, CheckCircle2, Ruler, Cable, Zap } from 'lucide-react';

export default function ProfileView({ techName, summaryData, onOpenSettings }) {
  const summary = summaryData?.summary || {
    totalAllEarnings: 0,
    totalInHoldback: 0,
    totalReadyForPayout: 0,
    totalPaid: 0,
    totalFeetAll: 0,
    totalOrdersCount: 0
  };

  return (
    <div className="space-y-4 max-w-md mx-auto">
      {/* 1. TECH PROFILE HEADER */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 font-black text-xl shadow-lg shadow-cyan-500/25">
              J
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-black text-white">{techName || 'Javier'}</h2>
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="text-xs text-cyan-400 font-mono">Técnico Instalador Xfinity</p>
            </div>
          </div>

          <button
            onClick={onOpenSettings}
            className="p-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-2xl transition border border-slate-700/60"
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

      {/* 2. GLOBAL FINANCIAL SUMMARY & 3-WEEK HOLDBACK */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 space-y-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Balance Global & Fondo de 3 Semanas
          </span>
          <span className="text-[10px] text-blue-400 font-mono font-bold">Cobro diferido</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {/* En Fondo */}
          <div className="bg-slate-950/80 border border-blue-900/40 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-blue-400">
              <span className="text-[10px] font-bold uppercase">En Fondo (3 Sem)</span>
              <Clock className="h-4 w-4" />
            </div>
            <div className="text-xl font-black text-white font-mono">
              ${summary.totalInHoldback.toFixed(2)}
            </div>
            <p className="text-[10px] text-slate-500">Retenido en espera</p>
          </div>

          {/* Listo para Cobro */}
          <div className="bg-slate-950/80 border border-amber-900/40 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-amber-400">
              <span className="text-[10px] font-bold uppercase">Listo para Cobro</span>
              <DollarSign className="h-4 w-4" />
            </div>
            <div className="text-xl font-black text-amber-300 font-mono">
              ${summary.totalReadyForPayout.toFixed(2)}
            </div>
            <p className="text-[10px] text-slate-500">Cumplió 3 semanas</p>
          </div>
        </div>

        {/* Ya Cobrado & Producción Total */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">Total Ya Cobrado</span>
              <span className="text-sm font-black text-emerald-400 font-mono">
                ${summary.totalPaid.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 block">Producción Total</span>
            <span className="text-sm font-black text-white font-mono">
              ${summary.totalAllEarnings.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Global Feet Metric */}
        <div className="flex items-center justify-between bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/60 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <Ruler className="h-4 w-4 text-cyan-400" />
            <span>Metraje Total Instalado</span>
          </div>
          <span className="font-bold text-amber-300 font-mono">
            {summary.totalFeetAll.toLocaleString()} ft
          </span>
        </div>
      </div>

      {/* 3. REGLA DE LAS 3 SEMANAS EXPLICACIÓN */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3.5 text-xs text-slate-400 space-y-1">
        <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-cyan-400" />
          ¿Cómo funciona el Fondo de 3 Semanas?
        </h4>
        <p className="text-[11px] leading-relaxed">
          Los trabajos que realizas esta semana se acumulan en tu fondo. Se liberan para cobro efectivo exactamente 3 semanas después del cierre semanal.
        </p>
      </div>
    </div>
  );
}
