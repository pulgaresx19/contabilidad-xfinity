import React, { useState } from 'react';
import { 
  Camera, TrendingUp, Clock, DollarSign, CheckCircle2, 
  Calendar, Share2, Check, ArrowRight, Zap, ShieldAlert, Ruler
} from 'lucide-react';

export default function HomeDashboard({ summaryData, orders, onOpenScan, onRefresh }) {
  const [copied, setCopied] = useState(false);

  if (!summaryData) {
    return <div className="text-center py-12 text-slate-500 text-xs">Cargando contabilidad...</div>;
  }

  const { summary, weeks } = summaryData;
  const currentWeek = weeks && weeks.length > 0 ? weeks[0] : null;

  // Compute stats for today
  const todayStr = new Date().toISOString().split('T')[0];
  const todayOrders = orders.filter((o) => o.work_date === todayStr);
  const displayDayOrders = todayOrders.length > 0 ? todayOrders : orders.slice(0, 7); // Fallback to current batch if today is fresh
  const todayEarnings = displayDayOrders.reduce((sum, o) => sum + (o.rate_calculated || 0), 0);
  const todayFeet = displayDayOrders.reduce((sum, o) => sum + (o.drop_footage || 0), 0);

  // Copy weekly statement for supervisor
  const copyWeeklyReport = () => {
    if (!currentWeek) return;
    const jobLines = currentWeek.orders.map(o => `  • Job #${o.job_id}: ${o.address} (${o.drop_footage} ft) - $${o.rate_calculated}`).join('\n');
    const text = `📊 *CIERRE SEMANAL - XFINITY*
📅 *Semana:* ${currentWeek.key} (${currentWeek.startDate} al ${currentWeek.endDate})
👤 *Técnico:* Javier
🔢 *Trabajos:* ${currentWeek.totalJobs} órdenes
📏 *Metraje:* ${Math.round(currentWeek.totalFootage)} ft
💰 *TOTAL:* $${currentWeek.totalEarnings.toFixed(2)}
⏳ *Cobro Estimado (+3 sem):* ${currentWeek.payoutDueDate}

📋 *Detalle:*
${jobLines}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-4 max-w-md mx-auto">
      {/* 1. HERO SCAN ACTION BUTTON (DIRECT ACCESS) */}
      <div className="relative overflow-hidden bg-gradient-to-br from-cyan-950 via-slate-900 to-slate-900 border border-cyan-500/30 rounded-3xl p-4 shadow-xl shadow-cyan-950/20">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
              <Zap className="h-3 w-3 fill-cyan-400" />
              Nueva Jornada
            </span>
            <h2 className="text-base font-extrabold text-white">Escanear Foto de Ruta</h2>
            <p className="text-[11px] text-slate-300">
              Sube foto o tómala con la cámara para archivarla y leer las órdenes al instante.
            </p>
          </div>

          <button
            onClick={onOpenScan}
            className="flex-shrink-0 h-14 w-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-slate-950 flex items-center justify-center shadow-lg shadow-cyan-500/30 active:scale-95 transition"
            title="Escanear Foto con Cámara o Galería"
          >
            <Camera className="h-7 w-7 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* 2. DAILY REPORT / JORNADA ACTIVA */}
      <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Reporte de Jornada
          </span>
          <span className="text-[10px] bg-slate-950 border border-slate-800 px-2 py-0.5 rounded-full text-slate-400 font-mono">
            {displayDayOrders[0]?.work_date || todayStr}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/60">
            <span className="text-[10px] text-slate-400 block">Trabajos</span>
            <span className="text-lg font-black text-white font-mono">{displayDayOrders.length}</span>
          </div>

          <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/60">
            <span className="text-[10px] text-slate-400 block">Metraje</span>
            <span className="text-lg font-black text-amber-300 font-mono">{Math.round(todayFeet)} ft</span>
          </div>

          <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/60">
            <span className="text-[10px] text-slate-400 block">Ganancia</span>
            <span className="text-lg font-black text-emerald-400 font-mono">${todayEarnings}</span>
          </div>
        </div>
      </div>

      {/* 3. FINANCES & 3-WEEK HOLDBACK */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Control de Cobros & Fondo
          </span>
          <span className="text-[10px] text-blue-400 font-mono">Regla 3 semanas</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {/* Card: En Fondo (3 semanas) */}
          <div className="bg-slate-900/80 border border-blue-900/50 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-blue-400">
              <span className="text-[10px] font-bold uppercase tracking-wide">En Fondo (3 Sem)</span>
              <Clock className="h-4 w-4" />
            </div>
            <div className="text-xl font-black text-white font-mono">
              ${summary.totalInHoldback.toFixed(2)}
            </div>
            <p className="text-[10px] text-slate-400">Retenido en espera</p>
          </div>

          {/* Card: Listo para Cobro Esta Semana */}
          <div className="bg-slate-900/80 border border-amber-900/50 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-amber-400">
              <span className="text-[10px] font-bold uppercase tracking-wide">Listo para Cobro</span>
              <DollarSign className="h-4 w-4" />
            </div>
            <div className="text-xl font-black text-amber-300 font-mono">
              ${summary.totalReadyForPayout.toFixed(2)}
            </div>
            <p className="text-[10px] text-slate-400">Cumplió 3 semanas</p>
          </div>
        </div>

        {/* Card: Total Ganado & Cobrado */}
        <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">Total Histórico Cobrado</span>
              <span className="text-sm font-black text-emerald-400 font-mono">
                ${summary.totalPaid.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-400 block">Total Producción</span>
            <span className="text-sm font-black text-white font-mono">
              ${summary.totalAllEarnings.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* 4. CURRENT ACTIVE WEEK CARD */}
      {currentWeek && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-cyan-400" />
              <span className="text-xs font-bold text-white font-mono">{currentWeek.key}</span>
              <span className="text-[10px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded-full">
                {currentWeek.startDate} al {currentWeek.endDate}
              </span>
            </div>
            <span className="text-xs font-black text-emerald-400 font-mono">
              ${currentWeek.totalEarnings.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            <div>
              <span className="text-[10px] text-slate-400 block">Fecha Estimada de Pago (+3 sem):</span>
              <span className="font-bold text-cyan-300 font-mono">{currentWeek.payoutDueDate}</span>
            </div>

            <button
              onClick={copyWeeklyReport}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">¡Copiado!</span>
                </>
              ) : (
                <>
                  <Share2 className="h-3.5 w-3.5" />
                  <span>WhatsApp</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
