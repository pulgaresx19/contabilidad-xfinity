import React, { useState, useEffect } from 'react';
import { 
  Calendar, DollarSign, TrendingUp, TrendingDown, Clock, 
  CheckCircle2, ChevronLeft, ChevronRight, Plus, Fuel, Wrench, 
  Car, Utensils, Smartphone, Shield, Package, Trash2, Copy, 
  Check, Share2, AlertCircle, FileText, ChevronDown, ChevronUp, Image as ImageIcon,
  ShieldCheck, CheckCircle, Edit3, X
} from 'lucide-react';
import { 
  getCurrentMonthStr, formatMonthFriendly, 
  getPreviousMonth, getNextMonth, formatDateFriendly 
} from '../utils/dateUtils';
import AddExpenseModal from './AddExpenseModal';
import EditJobModal from './EditJobModal';

const CATEGORY_ICONS = {
  Combustible: { icon: Fuel, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  Herramientas: { icon: Wrench, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  Vehículo: { icon: Car, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  Alimentación: { icon: Utensils, color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  Telefonía: { icon: Smartphone, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  Seguro: { icon: Shield, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  Otros: { icon: Package, color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
};

export default function MonthlyView({ orders = [], onRefresh }) {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthStr());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState('weeks'); // 'weeks' | 'expenses' | 'report'
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [selectedWeekModal, setSelectedWeekModal] = useState(null);
  const [copiedWeekKey, setCopiedWeekKey] = useState(null);
  const [copiedReport, setCopiedReport] = useState(false);
  const [updatingWeekKey, setUpdatingWeekKey] = useState(null);

  useEffect(() => {
    if (selectedWeekModal && data?.weeks) {
      const updated = data.weeks.find(w => w.key === selectedWeekModal.key);
      if (updated) setSelectedWeekModal(updated);
    }
  }, [data]);

  const copyWeeklyAudit = (w) => {
    const jobList = (w.orders || []).map((o, idx) => 
      `  ${idx + 1}. Job #${o.job_id}: ${o.address} (${o.drop_footage || 0} ft, ${o.cable_type || 'RG-6'}) - $${o.rate_calculated || 0}`
    ).join('\n');

    const text = `📊 *CIERRE SEMANAL - SEMANA ${w.displayLabel || w.key}*
📅 *Período:* ${w.startDate} al ${w.endDate}
💰 *Total Liquidar:* $${(w.totalEarnings || 0).toFixed(2)}
📏 *Metraje:* ${Math.round(w.totalFootage || 0)} ft
🛠️ *Trabajos:* ${w.completedCount || 0} completados de ${w.orders?.length || 0} órdenes
📌 *Estado:* ${w.isPaid ? '✅ COBRADO' : '⏳ PENDIENTE POR COBRAR'}

📋 *Detalle de Órdenes:*
${jobList || '  (Sin órdenes registradas)'}

⚠️ *Constancia generada desde Contabilidad XFinity.*`;

    try {
      navigator.clipboard.writeText(text);
      setCopiedWeekKey(w.key);
      setTimeout(() => setCopiedWeekKey(null), 2500);
    } catch (e) {}
  };

  const fetchMonthlyData = async (monthKey) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/monthly-summary?month=${encodeURIComponent(monthKey)}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Error fetching monthly summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthlyData(selectedMonth);
  }, [selectedMonth]);

  const handlePrevMonth = () => {
    setSelectedMonth((curr) => getPreviousMonth(curr));
  };

  const handleNextMonth = () => {
    setSelectedMonth((curr) => getNextMonth(curr));
  };

  const handleTodayMonth = () => {
    setSelectedMonth(getCurrentMonthStr());
  };

  const handleDeleteExpense = async (id, e) => {
    if (e) e.stopPropagation();
    if (!confirm('¿Eliminar este gasto?')) return;
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchMonthlyData(selectedMonth);
      }
    } catch (err) {
      alert('Error eliminando gasto: ' + err.message);
    }
  };

  const handleToggleWeekPayment = async (w, targetStatus, e) => {
    if (e) e.stopPropagation();
    const isPaid = targetStatus === 'Cobrado';
    const msg = isPaid
      ? `¿Confirmar que ya cobraste la Semana ${w.displayLabel || w.key} ($${w.totalEarnings.toFixed(2)})?`
      : `¿Revertir la Semana ${w.displayLabel || w.key} a PENDIENTE por cobrar?`;
    if (!confirm(msg)) return;

    setUpdatingWeekKey(w.key);
    try {
      const res = await fetch(`/api/weeks/${encodeURIComponent(w.key)}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_status: targetStatus })
      });
      if (res.ok) {
        await fetchMonthlyData(selectedMonth);
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      alert('Error actualizando estado de la semana: ' + err.message);
    } finally {
      setUpdatingWeekKey(null);
    }
  };

  // Helper to generate formatted WhatsApp text for the monthly closing
  const getReportText = () => {
    if (!data) return '';
    const totals = data.totals || {};
    const weeks = data.weeks || [];
    const expensesByCategory = data.expensesByCategory || {};
    const monthLabel = formatMonthFriendly(selectedMonth);

    const weeksLines = weeks.map((w, i) => {
      const statusIcon = w.isPaid ? '✅ COBRADO' : '⏳ PENDIENTE';
      return `  ${i + 1}. Semana ${w.displayLabel || w.key} (${w.startDate} al ${w.endDate})
     • Trabajos: ${w.completedCount || 0} órdenes | ${Math.round(w.totalFootage || 0)} ft
     • Monto: $${(w.totalEarnings || 0).toFixed(2)} [${statusIcon}]`;
    }).join('\n\n');

    let expenseLines = Object.entries(expensesByCategory).map(([cat, amt]) => {
      return `  • ${cat}: -$${Number(amt).toFixed(2)}`;
    }).join('\n');

    if (!expenseLines) expenseLines = '  • Sin gastos registrados este mes';

    return `📊 *REPORTE CONTABLE MENSUAL - XFINITY*
📅 *Mes:* ${monthLabel}
👤 *Técnico:* Javier (P0G1)

💰 *RESUMEN DE INGRESOS (SEMANAS):*
• Semanas en el mes: ${totals.totalWeeksCount || 0} (${totals.completedWeeksCount || 0} cobradas)
• Trabajos completados: ${totals.totalJobs || 0} órdenes
• Metraje total: ${(totals.totalFootage || 0).toLocaleString()} ft
• Total Facturado: $${(totals.totalEarnings || 0).toFixed(2)}
💵 *TOTAL COBRADO:* $${(totals.totalPaid || 0).toFixed(2)}
⏳ *PENDIENTE POR COBRAR:* $${(totals.totalPending || 0).toFixed(2)}

💸 *RESUMEN DE GASTOS:*
• Total Gastos: -$${(totals.totalExpenses || 0).toFixed(2)}
${expenseLines}

━━━━━━━━━━━━━━━━━━━━
💎 *BALANCE NETO REAL (EN MANO):*
💵 Total Cobrado: $${(totals.totalPaid || 0).toFixed(2)}
💸 Total Gastos:  -$${(totals.totalExpenses || 0).toFixed(2)}
👉 *GANANCIA NETA:* $${(totals.netPaidBalance || 0).toFixed(2)} (${totals.marginPercent || 0}% de margen)

📋 *DETALLE DE SEMANAS DEL MES:*
${weeksLines || '  (No hay semanas registradas)'}

⚠️ *Constancia generada automáticamente desde Contabilidad XFinity.*`;
  };

  const copyToClipboardSafely = async (text) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {
      console.warn('Navigator clipboard error, trying fallback:', e);
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch (e) {
      console.error('Fallback copy failed:', e);
      return false;
    }
  };

  // WhatsApp direct send
  const handleShareWhatsApp = async () => {
    const text = getReportText();
    if (!text) return;
    await copyToClipboardSafely(text);
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
  };

  // Clipboard monthly export
  const handleCopyMonthlyReport = async () => {
    const text = getReportText();
    if (!text) return;
    await copyToClipboardSafely(text);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 3000);
  };

  const totals = data?.totals || {
    totalWeeksCount: 0,
    completedWeeksCount: 0,
    totalJobs: 0,
    totalFootage: 0,
    totalEarnings: 0,
    totalPaid: 0,
    totalPending: 0,
    totalExpenses: 0,
    netPaidBalance: 0,
    netProjectedBalance: 0,
    marginPercent: 0
  };

  const weeks = data?.weeks || [];
  const expenses = data?.expenses || [];
  const expensesByCategory = data?.expensesByCategory || {};

  return (
    <div className="space-y-4 max-w-md sm:max-w-lg mx-auto w-full pb-24">
      {/* 1. SELECTOR DEL MES (COCKPIT STYLE) */}
      <div className="bg-[#131b26] border border-white/10 rounded-2xl p-2.5 flex items-center justify-between shadow-md">
        <button
          onClick={handlePrevMonth}
          className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white transition active:scale-95 border border-white/5"
          title="Mes Anterior"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="text-center">
          <div className="text-base font-extrabold text-white capitalize flex items-center justify-center gap-1.5">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <span>{formatMonthFriendly(selectedMonth)}</span>
          </div>
          <button
            onClick={handleTodayMonth}
            className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold tracking-wide uppercase transition mt-0.5"
          >
            Ir a Mes Actual
          </button>
        </div>

        <button
          onClick={handleNextMonth}
          className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white transition active:scale-95 border border-white/5"
          title="Mes Siguiente"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* 2. TARJETA PRINCIPAL: BALANCE NETO MENSUAL (COCKPIT HUD) */}
      <div className="relative overflow-hidden rounded-3xl bg-[#0f1722]/95 border border-white/10 p-5 shadow-xl">
        <div className="absolute top-0 right-0 w-36 h-36 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-36 h-36 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Balance Neto Mensual
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                {totals.marginPercent}% Margen
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium">
              {totals.totalWeeksCount} {totals.totalWeeksCount === 1 ? 'semana' : 'semanas'}
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-white drop-shadow-[0_0_12px_rgba(52,211,153,0.3)]">
                ${totals.netPaidBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded">en mano</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Cobrado (${totals.totalPaid.toFixed(2)}) menos gastos (-${totals.totalExpenses.toFixed(2)})
            </p>
          </div>

          {/* Sub-cards: Cobrado vs Gastos vs Pendiente */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/8">
            {/* Cobrado */}
            <div className="bg-[#131b26] border border-emerald-500/30 rounded-2xl p-2.5 shadow-sm space-y-0.5">
              <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold mb-0.5">
                <TrendingUp className="w-3 h-3 stroke-[3]" />
                <span>Cobrado</span>
              </div>
              <div className="text-sm sm:text-base font-black font-mono text-emerald-400">
                ${totals.totalPaid.toFixed(2)}
              </div>
              <div className="text-[9px] text-slate-400 font-medium">
                {totals.completedWeeksCount} sem. cobradas
              </div>
            </div>

            {/* Gastos */}
            <div className="bg-[#131b26] border border-rose-500/30 rounded-2xl p-2.5 shadow-sm space-y-0.5">
              <div className="flex items-center gap-1 text-[10px] text-rose-400 font-bold mb-0.5">
                <TrendingDown className="w-3 h-3 stroke-[3]" />
                <span>Gastos</span>
              </div>
              <div className="text-sm sm:text-base font-black font-mono text-rose-400">
                -${totals.totalExpenses.toFixed(2)}
              </div>
              <div className="text-[9px] text-slate-400 font-medium">
                {expenses.length} registros
              </div>
            </div>

            {/* Pendiente */}
            <div className="bg-[#131b26] border border-amber-500/30 rounded-2xl p-2.5 shadow-sm space-y-0.5">
              <div className="flex items-center gap-1 text-[10px] text-amber-400 font-bold mb-0.5">
                <Clock className="w-3 h-3 stroke-[2.5]" />
                <span>Pendiente</span>
              </div>
              <div className="text-sm sm:text-base font-black font-mono text-amber-400">
                ${totals.totalPending.toFixed(2)}
              </div>
              <div className="text-[9px] text-slate-400 font-medium">
                Por cobrar
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. SUB-PESTAÑAS CON FORMATO COCKPIT */}
      <div className="bg-[#0f1722]/95 backdrop-blur-xl p-1.5 rounded-2xl border border-white/10 grid grid-cols-3 gap-1 shadow-md">
        <button
          onClick={() => setActiveSubTab('weeks')}
          className={`flex flex-col items-center justify-center py-2 px-2 rounded-xl transition text-center select-none ${
            activeSubTab === 'weeks'
              ? 'bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-cyan-500/10 text-cyan-400 border border-cyan-500/40 shadow-sm shadow-cyan-500/20 font-bold'
              : 'text-slate-400 hover:text-white hover:bg-white/5 font-medium border border-transparent'
          }`}
        >
          <Calendar className={`w-4 h-4 mb-1 ${activeSubTab === 'weeks' ? 'stroke-[2.5] text-cyan-400' : 'stroke-2'}`} />
          <span className="text-[11px] leading-tight font-bold">
            Semanas ({weeks.length})
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('expenses')}
          className={`flex flex-col items-center justify-center py-2 px-2 rounded-xl transition text-center select-none ${
            activeSubTab === 'expenses'
              ? 'bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-cyan-500/10 text-cyan-400 border border-cyan-500/40 shadow-sm shadow-cyan-500/20 font-bold'
              : 'text-slate-400 hover:text-white hover:bg-white/5 font-medium border border-transparent'
          }`}
        >
          <DollarSign className={`w-4 h-4 mb-1 ${activeSubTab === 'expenses' ? 'stroke-[2.5] text-cyan-400' : 'stroke-2'}`} />
          <span className="text-[11px] leading-tight font-bold">
            Gastos ({expenses.length})
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('report')}
          className={`flex flex-col items-center justify-center py-2 px-2 rounded-xl transition text-center select-none ${
            activeSubTab === 'report'
              ? 'bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-cyan-500/10 text-cyan-400 border border-cyan-500/40 shadow-sm shadow-cyan-500/20 font-bold'
              : 'text-slate-400 hover:text-white hover:bg-white/5 font-medium border border-transparent'
          }`}
        >
          <Share2 className={`w-4 h-4 mb-1 ${activeSubTab === 'report' ? 'stroke-[2.5] text-cyan-400' : 'stroke-2'}`} />
          <span className="text-[11px] leading-tight font-bold">
            Constancia
          </span>
        </button>
      </div>

      {/* 4. CONTENIDO SEGÚN SUBPESTAÑA */}

      {/* SUBTAB 1: SEMANAS DEL MES */}
      {activeSubTab === 'weeks' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-300">
              Semanas que completaron {formatMonthFriendly(selectedMonth)}
            </span>
            <span className="text-xs text-emerald-400 font-bold">
              ${totals.totalPaid.toFixed(2)} Cobrado
            </span>
          </div>

          {weeks.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-xs">
              No hay semanas cerradas en este mes aún.
            </div>
          ) : (
            weeks.map((w) => {
              const isUpdating = updatingWeekKey === w.key;

              return (
                <div
                  key={w.key}
                  onClick={() => setSelectedWeekModal(w)}
                  className={`bg-[#131b26] border rounded-2xl p-4 transition shadow-md space-y-3 cursor-pointer group active:scale-[0.99] ${
                    w.isPaid
                      ? 'border-emerald-500/30 hover:border-emerald-500/60 shadow-emerald-500/5'
                      : 'border-amber-500/30 hover:border-amber-500/60 shadow-amber-500/5'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-black text-white font-mono group-hover:text-cyan-400 transition">
                          Semana {w.displayLabel}
                        </h3>
                        {w.isPaid ? (
                          <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shadow-xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <ShieldCheck className="w-3 h-3 text-emerald-400" />
                            <span>Cobrado</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1.5 shadow-xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                            <Clock className="w-3 h-3 text-amber-400" />
                            <span>Pendiente</span>
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
                        {w.startDate} al {w.endDate} • {w.completedCount} trabajos • {Math.round(w.totalFootage)} ft
                      </p>
                    </div>

                    <div className="text-right">
                      <div className={`text-base font-black font-mono ${
                        w.isPaid ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.35)]' : 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.25)]'
                      }`}>
                        ${w.totalEarnings.toFixed(2)}
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {w.isPaid ? 'Cobrado ✓' : `Pendiente: $${w.pendingEarnings.toFixed(2)}`}
                      </span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/8 gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedWeekModal(w);
                      }}
                      className="text-xs text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1.5 py-1 px-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 transition active:scale-95 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Ver {w.orders?.length || 0} órdenes</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleToggleWeekPayment(w, w.isPaid ? 'Pendiente' : 'Cobrado', e)}
                      disabled={isUpdating}
                      className={`text-xs px-2.5 py-1 rounded-xl font-black transition flex items-center gap-1 ${
                        w.isPaid
                          ? 'bg-emerald-500/15 hover:bg-rose-500/15 text-emerald-400 hover:text-rose-400 border border-emerald-500/30 hover:border-rose-500/30'
                          : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20 active:scale-95'
                      }`}
                    >
                      {w.isPaid ? (
                        <>
                          <CheckCircle className="h-3 w-3 text-emerald-400" />
                          <span>Cobrado ✓</span>
                        </>
                      ) : (
                        <>
                          <DollarSign className="h-3 w-3 stroke-[2.5]" />
                          <span>Confirmar Cobro</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* SUBTAB 2: GASTOS MENSUALES */}
      {activeSubTab === 'expenses' && (
        <div className="space-y-3">
          {/* Add expense button */}
          <button
            onClick={() => setIsExpenseModalOpen(true)}
            className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-600 hover:from-rose-600 hover:to-amber-700 text-white font-bold text-xs shadow-lg shadow-rose-950/30 flex items-center justify-center gap-2 transition active:scale-[0.98]"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>+ Registrar Gasto de {formatMonthFriendly(selectedMonth)}</span>
          </button>

          {/* Breakdown by Category */}
          {Object.keys(expensesByCategory).length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
              <span className="text-xs font-bold text-slate-300 block">
                Distribución de Gastos
              </span>
              <div className="space-y-1.5">
                {Object.entries(expensesByCategory).map(([cat, amt]) => {
                  const percent = totals.totalExpenses > 0 ? Math.round((amt / totals.totalExpenses) * 100) : 0;
                  const catCfg = CATEGORY_ICONS[cat] || CATEGORY_ICONS.Otros;
                  const Icon = catCfg.icon;

                  return (
                    <div key={cat} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5 text-rose-400" />
                          <span className="text-slate-300 font-medium">{cat}</span>
                        </div>
                        <div className="font-bold text-white">
                          ${amt.toFixed(2)} <span className="text-[10px] text-slate-400 font-normal">({percent}%)</span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-rose-500 to-amber-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Expenses List */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-300 px-1 block">
              Historial de Gastos ({expenses.length})
            </span>

            {expenses.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-xs">
                No has registrado gastos para este mes.
                <p className="text-[11px] text-slate-500 mt-1">Registra combustible, herramientas y repuestos para llevar tu contabilidad real.</p>
              </div>
            ) : (
              expenses.map((exp) => {
                const catCfg = CATEGORY_ICONS[exp.category] || CATEGORY_ICONS.Otros;
                const Icon = catCfg.icon;

                return (
                  <div
                    key={exp.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between transition shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${catCfg.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-white text-xs">
                          {exp.description}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span>{exp.category}</span>
                          <span>•</span>
                          <span>{exp.expense_date}</span>
                          {exp.receipt_photo && (() => {
                            let photos = [];
                            try {
                              if (exp.receipt_photo.startsWith('[')) {
                                photos = JSON.parse(exp.receipt_photo);
                              } else {
                                photos = [exp.receipt_photo];
                              }
                            } catch (e) {
                              photos = [exp.receipt_photo];
                            }
                            return (
                              <span className="flex items-center gap-1">
                                {photos.map((p, pIdx) => (
                                  <a
                                    key={pIdx}
                                    href={exp.receipt_data || `/uploads/${p}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-cyan-400 hover:text-cyan-300 underline flex items-center gap-0.5 font-medium"
                                    title={`Abrir ticket #${pIdx + 1}`}
                                  >
                                    <ImageIcon className="w-3 h-3" />
                                    <span>Ticket{photos.length > 1 ? ` #${pIdx + 1}` : ''}</span>
                                  </a>
                                ))}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="text-right">
                        <div className="font-black text-rose-400 text-sm">
                          -${Number(exp.amount).toFixed(2)}
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDeleteExpense(exp.id, e)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                        title="Eliminar gasto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 3: CONSTANCIA Y REPORTE WHATSAPP */}
      {activeSubTab === 'report' && (
        <div className="space-y-3">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-white">
                  Reporte Mensual Formal
                </h3>
                <p className="text-xs text-slate-400">
                  Desglose completo de ingresos y egresos de {formatMonthFriendly(selectedMonth)}
                </p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <FileText className="w-5 h-5" />
              </div>
            </div>

            {/* Quick summary box */}
            <div className="bg-slate-950/70 rounded-2xl p-4 border border-slate-800 font-mono text-xs space-y-2 text-slate-300">
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span>Período:</span>
                <span className="font-bold text-white">{formatMonthFriendly(selectedMonth)}</span>
              </div>
              <div className="flex justify-between">
                <span>Semanas Totales:</span>
                <span>{totals.totalWeeksCount} sem. ({totals.completedWeeksCount} cobradas)</span>
              </div>
              <div className="flex justify-between">
                <span>Órdenes Completadas:</span>
                <span>{totals.totalJobs} trabajos</span>
              </div>
              <div className="flex justify-between">
                <span>Metraje Total:</span>
                <span>{totals.totalFootage} ft</span>
              </div>
              <div className="flex justify-between text-emerald-400 font-bold border-t border-slate-800/80 pt-2">
                <span>Total Cobrado:</span>
                <span>+${totals.totalPaid.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-rose-400 font-bold">
                <span>Total Gastos:</span>
                <span>-${totals.totalExpenses.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-cyan-300 font-black text-sm border-t border-slate-800/80 pt-2">
                <span>Ganancia Neta:</span>
                <span>${totals.netPaidBalance.toFixed(2)}</span>
              </div>
            </div>

            {/* Action Buttons: WhatsApp & Copy */}
            <div className="space-y-2 pt-1">
              {/* Send direct to WhatsApp */}
              <button
                onClick={handleShareWhatsApp}
                className="w-full py-3.5 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20 transition active:scale-[0.98]"
              >
                <Share2 className="w-4 h-4 stroke-[2.5]" />
                <span>Enviar Directo a WhatsApp</span>
              </button>

              {/* Copy to Clipboard */}
              <button
                onClick={handleCopyMonthlyReport}
                className={`w-full py-3 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 border transition active:scale-[0.98] ${
                  copiedReport
                    ? 'bg-slate-800 text-emerald-400 border-emerald-500/50'
                    : 'bg-slate-950/60 hover:bg-slate-800 text-slate-300 border-slate-800'
                }`}
              >
                {copiedReport ? (
                  <>
                    <Check className="w-4 h-4 stroke-[3] text-emerald-400" />
                    <span className="text-emerald-400">¡Texto Copiado al Portapapeles!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar Texto de la Constancia</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA AGREGAR GASTO */}
      <AddExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        onExpenseAdded={() => fetchMonthlyData(selectedMonth)}
        initialDate={selectedMonth === getCurrentMonthStr() ? undefined : `${selectedMonth}-01`}
      />

      {/* MODAL PARA EDITAR TRABAJO O AJUSTAR BONO/DESCUENTO DE SUPERVISIÓN */}
      {editingOrder && (
        <EditJobModal
          order={editingOrder}
          isOpen={Boolean(editingOrder)}
          onClose={() => setEditingOrder(null)}
          onJobUpdated={() => {
            fetchMonthlyData(selectedMonth);
            if (onRefresh) onRefresh();
          }}
        />
      )}

      {/* MODAL OVERLAY DE ÓRDENES DE LA SEMANA (IDÉNTICO A CIERRE SEMANAL) */}
      {selectedWeekModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in modal-overlay-safe"
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 0px) + 16px, 1.25rem)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 1.25rem)'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedWeekModal(null);
          }}
        >
          <div 
            className="bg-[#101722] border border-white/10 rounded-3xl w-full max-w-sm sm:max-w-md h-[80dvh] sm:h-[82dvh] modal-sheet-compact flex flex-col overflow-hidden shadow-2xl text-white transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Modal */}
            <div className="px-4 sm:px-5 py-3 border-b border-white/10 flex items-center justify-between bg-slate-900/70 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-bold shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-white uppercase tracking-wider font-mono truncate">
                      Semana {selectedWeekModal.displayLabel || selectedWeekModal.key}
                    </h3>
                    {selectedWeekModal.isPaid ? (
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full font-black flex items-center gap-1 shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Cobrado
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full font-black flex items-center gap-1 shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        Pendiente
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono font-semibold truncate">
                    {selectedWeekModal.startDate} al {selectedWeekModal.endDate}
                  </p>
                </div>
              </div>

              {/* Botón Cerrar */}
              <button
                type="button"
                onClick={() => setSelectedWeekModal(null)}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition shrink-0 ml-2 cursor-pointer"
                title="Cerrar ventana"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* KPI Bar de 3 Columnas Cockpit */}
            <div className="grid grid-cols-3 gap-2 px-4 py-2 bg-[#0d141e] border-b border-white/5 shrink-0 text-center">
              <div className="bg-[#16202c] border border-white/5 rounded-xl py-1 px-1">
                <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold">Total Liquidar</span>
                <span className={`text-xs sm:text-sm font-black font-mono leading-none ${
                  selectedWeekModal.isPaid ? 'text-emerald-400' : 'text-amber-400'
                }`}>
                  ${(selectedWeekModal.totalEarnings || 0).toFixed(2)}
                </span>
              </div>
              <div className="bg-[#16202c] border border-white/5 rounded-xl py-1 px-1">
                <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold">Metraje</span>
                <span className="text-xs sm:text-sm font-black text-amber-300 font-mono leading-none">
                  {Math.round(selectedWeekModal.totalFootage || 0)} ft
                </span>
              </div>
              <div className="bg-[#16202c] border border-white/5 rounded-xl py-1 px-1">
                <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold">Trabajos</span>
                <span className="text-xs sm:text-sm font-black text-cyan-400 font-mono leading-none">
                  {selectedWeekModal.orders?.length || 0}
                </span>
              </div>
            </div>

            {/* Cuerpo del Modal con Scroll */}
            <div className="p-3.5 overflow-y-auto space-y-3 flex-1 min-h-0 scrollbar-none">
              {/* Listado Completo de Trabajos */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <span>Historial de Trabajos ({selectedWeekModal.orders?.length || 0})</span>
                  <span>Tarifa & Ajustes</span>
                </div>

                {(selectedWeekModal.orders || []).map((order, idx) => {
                  const isComp = order.status === 'Completado';
                  const isCanc = order.status === 'No Realizado';
                  const hasBore = order.bore_type && (order.bore_type.includes('DW') || order.bore_type.toLowerCase().includes('driveway') || order.bore_type === 'Y');

                  return (
                    <div
                      key={order.id}
                      className="bg-[#16202c] border border-white/10 hover:border-cyan-500/30 rounded-2xl p-3 space-y-2 text-xs transition shadow-md"
                    >
                      {/* Job Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-black font-mono shadow-sm flex-shrink-0 ${
                            isComp
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : isCanc
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}>
                            {idx + 1}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-black text-cyan-400">#{order.job_id}</span>
                              <span className="text-[10px] text-slate-400 font-mono">{order.work_date}</span>
                              {Number(order.manual_adjustment) > 0 && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                                  +${order.manual_adjustment} Bono
                                </span>
                              )}
                              {Number(order.manual_adjustment) < 0 && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                  -${Math.abs(order.manual_adjustment)} Desc.
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                            isComp
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : isCanc
                              ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                              : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                          }`}>
                            {order.status || 'Pendiente'}
                          </span>

                          <button
                            type="button"
                            onClick={() => setEditingOrder(order)}
                            className="p-1 text-slate-400 hover:text-cyan-400 bg-white/5 hover:bg-white/10 rounded-lg transition cursor-pointer"
                            title="Editar trabajo"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Dirección */}
                      <p className="text-slate-300 font-bold truncate">
                        {order.address}{order.city ? `, ${order.city}` : ''}
                      </p>

                      {/* Footer de Tarjeta con Metraje y Ganancia */}
                      <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[11px]">
                        <div className="flex items-center gap-2 text-slate-400 font-mono">
                          <span>{order.drop_footage || 0} ft</span>
                          <span>•</span>
                          <span className="text-cyan-300">{order.cable_type || 'RG-6'}</span>
                          {hasBore && (
                            <>
                              <span>•</span>
                              <span className="text-amber-400 font-bold">Driveway DW</span>
                            </>
                          )}
                        </div>

                        <span className="font-mono font-black text-emerald-400 text-sm">
                          ${order.rate_calculated || 0}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer con Acciones Rápidas: Copiar Auditoría y Confirmar Cobro (mismo ancho y texto lineal) */}
            <div className="px-4 py-3 border-t border-white/10 bg-slate-900/90 shrink-0">
              <div className="grid grid-cols-2 gap-2 w-full">
                <button
                  type="button"
                  onClick={() => copyWeeklyAudit(selectedWeekModal)}
                  className="w-full py-2 px-2 bg-[#16202c] hover:bg-[#1f2d3d] text-slate-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 border border-white/10 shadow-xs cursor-pointer truncate"
                  title="Copiar auditoría para WhatsApp"
                >
                  {copiedWeekKey === selectedWeekModal.key ? (
                    <>
                      <Check className="h-3.5 w-3.5 stroke-[3] text-emerald-400 shrink-0" />
                      <span className="text-emerald-400 truncate">¡Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                      <span className="truncate">Copiar Auditoría</span>
                    </>
                  )}
                </button>

                {selectedWeekModal.isPaid ? (
                  <button
                    type="button"
                    onClick={(e) => handleToggleWeekPayment(selectedWeekModal, 'Pendiente', e)}
                    className="w-full py-2 px-2 bg-emerald-500/15 hover:bg-rose-500/15 text-emerald-300 hover:text-rose-300 border border-emerald-500/30 hover:border-rose-500/30 font-bold text-xs rounded-xl flex items-center justify-center gap-1 shadow-xs transition active:scale-95 cursor-pointer truncate"
                    title="Tocar para marcar como pendiente"
                  >
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate whitespace-nowrap">Cobrado: ${(selectedWeekModal.totalEarnings || 0).toFixed(2)}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => handleToggleWeekPayment(selectedWeekModal, 'Cobrado', e)}
                    className="w-full py-2 px-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1 shadow-md shadow-emerald-500/20 transition active:scale-95 cursor-pointer truncate"
                    title="Confirmar cobro de la semana"
                  >
                    <DollarSign className="h-3.5 w-3.5 stroke-[3] shrink-0" />
                    <span className="truncate whitespace-nowrap">Cobrar: ${(selectedWeekModal.totalEarnings || 0).toFixed(2)}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
