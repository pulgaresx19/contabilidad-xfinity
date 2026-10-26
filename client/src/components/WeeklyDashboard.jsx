import React, { useState } from 'react';
import { 
  DollarSign, Clock, CheckCircle2, TrendingUp, Calendar, 
  ChevronRight, Share2, Check, ArrowUpRight, Ruler, Zap
} from 'lucide-react';

export default function WeeklyDashboard({ summaryData, onRefresh }) {
  const [copiedWeekKey, setCopiedWeekKey] = useState(null);

  if (!summaryData) {
    return <div className="text-center py-12 text-slate-400">Cargando métricas semanales...</div>;
  }

  const { summary, weeks } = summaryData;

  // Copy weekly statement to share with supervisor
  const copyWeeklySummary = (w) => {
    const jobList = w.orders.map((o) => `  • Job #${o.job_id}: ${o.address} (${o.drop_footage} ft, ${o.cable_type}) - $${o.rate_calculated}`).join('\n');
    
    const text = `📊 *CIERRE SEMANAL - XFINITY*
📅 *Semana:* ${w.key} (${w.startDate} al ${w.endDate})
🔢 *Total Trabajos:* ${w.totalJobs} órdenes
📏 *Metraje Total:* ${Math.round(w.totalFootage)} ft
🛠️ *RG-11:* ${w.rg11Count} | *RG-6:* ${w.rg6Count} | *Bores:* ${w.boresCount}
💰 *TOTAL PRODUCIDO:* $${w.totalEarnings.toFixed(2)}
⏳ *Fecha Estimada de Cobro (+3 sem):* ${w.payoutDueDate}

📋 *Detalle de Órdenes:*
${jobList}`;

    navigator.clipboard.writeText(text);
    setCopiedWeekKey(w.key);
    setTimeout(() => setCopiedWeekKey(null), 2500);
  };

  // Mark all orders in a week as paid
  const markWeekAsPaid = async (w) => {
    if (!confirm(`¿Marcar todas las ${w.totalJobs} órdenes de la semana ${w.key} como COBRADAS?`)) return;

    try {
      for (const order of w.orders) {
        await fetch(`/api/orders/${order.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...order, payment_status: 'Cobrado' })
        });
      }
      onRefresh();
    } catch (err) {
      alert('Error actualizando semana: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Producido */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Producción Total</span>
            <div className="p-2 bg-cyan-500/10 rounded-xl text-cyan-400">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            ${summary.totalAllEarnings.toFixed(2)}
          </div>
          <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
            <span>{summary.totalOrdersCount} órdenes completadas</span>
          </div>
        </div>

        {/* KPI 2: En Fondo de Retención (3 Semanas) */}
        <div className="bg-slate-900 border border-blue-900/40 rounded-2xl p-5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl"></div>
          <div className="flex items-center justify-between text-blue-300 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">En Fondo (3 Semanas)</span>
            <div className="p-2 bg-blue-500/10 rounded-xl text-blue-400">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-blue-400 font-mono">
            ${summary.totalInHoldback.toFixed(2)}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Dinero retenido en ciclo de espera
          </div>
        </div>

        {/* KPI 3: Listo para Cobro Esta Semana */}
        <div className="bg-slate-900 border border-amber-900/40 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-amber-300 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Listo para Cobro</span>
            <div className="p-2 bg-amber-500/10 rounded-xl text-amber-400">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-amber-400 font-mono">
            ${summary.totalReadyForPayout.toFixed(2)}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Cumplió las 3 semanas de retención
          </div>
        </div>

        {/* KPI 4: Total Cobrado */}
        <div className="bg-slate-900 border border-emerald-900/40 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-emerald-300 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Ya Cobrado</span>
            <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-emerald-400 font-mono">
            ${summary.totalPaid.toFixed(2)}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Pagos conciliados y liquidados
          </div>
        </div>
      </div>

      {/* Explanation Banner of the 3-Week Rolling Holdback */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700/80 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 flex-shrink-0">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Ciclo de Fondo a 3 Semanas (Rolling Holdback)</h4>
            <p className="text-xs text-slate-300 mt-0.5">
              Cada semana que trabajas se acumula en tu fondo y se liquida automáticamente al cumplirse las 3 semanas de desfase.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-700 px-3 py-1.5 rounded-xl text-xs font-mono text-cyan-300">
          <Ruler className="h-4 w-4 text-cyan-400" />
          <span>{summary.totalFeetAll.toLocaleString()} ft de cable instalados</span>
        </div>
      </div>

      {/* Weekly Breakdown Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Calendar className="h-5 w-5 text-cyan-400" />
            Desglose Semana a Semana
          </h3>
          <span className="text-xs text-slate-400">{weeks.length} semana(s) registrada(s)</span>
        </div>

        {weeks.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-sm">
            No hay semanas registradas todavía. Agrega o importa órdenes de trabajo para ver el cierre semanal.
          </div>
        ) : (
          <div className="space-y-4">
            {weeks.map((w) => (
              <div
                key={w.key}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 hover:border-slate-700 transition shadow-sm"
              >
                {/* Header of the Week Card */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-extrabold text-white font-mono">{w.key}</span>
                      <span className="text-xs text-slate-400 bg-slate-800 px-2.5 py-0.5 rounded-full">
                        {w.startDate} al {w.endDate}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-cyan-400 font-mono">
                      <span>Estimado de Cobro: <strong>{w.payoutDueDate}</strong> (+3 sem)</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copyWeeklySummary(w)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
                      title="Copiar reporte completo de la semana para WhatsApp"
                    >
                      {copiedWeekKey === w.key ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          <span className="text-emerald-400">¡Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="h-3.5 w-3.5" />
                          <span>Copiar Resumen WhatsApp</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => markWeekAsPaid(w)}
                      className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
                      title="Marcar todas las órdenes de esta semana como cobradas"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Marcar Cobrada</span>
                    </button>
                  </div>
                </div>

                {/* Week Stats Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 text-xs">
                  <div>
                    <span className="text-slate-400 block">Trabajos Realizados</span>
                    <span className="text-base font-bold text-white font-mono">{w.totalJobs} órdenes</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Metraje Instalado</span>
                    <span className="text-base font-bold text-amber-300 font-mono">{Math.round(w.totalFootage)} ft</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">RG-11 / RG-6 / Bores</span>
                    <span className="text-base font-bold text-purple-300 font-mono">
                      {w.rg11Count} / {w.rg6Count} / {w.boresCount}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Total Producido</span>
                    <span className="text-base font-extrabold text-emerald-400 font-mono">
                      ${w.totalEarnings.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Status breakdown for this week */}
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  <span className="text-slate-400">Estado de órdenes en esta semana:</span>
                  {w.statusCount['En Fondo (3 Sem)'] > 0 && (
                    <span className="bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-md">
                      {w.statusCount['En Fondo (3 Sem)']} en fondo
                    </span>
                  )}
                  {w.statusCount['Listo para Cobro'] > 0 && (
                    <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-md">
                      {w.statusCount['Listo para Cobro']} listas para cobro
                    </span>
                  )}
                  {w.statusCount['Cobrado'] > 0 && (
                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                      {w.statusCount['Cobrado']} cobradas
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
