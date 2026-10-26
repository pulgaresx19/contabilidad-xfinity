import React, { useState, useEffect } from 'react';
import { 
  Calendar, DollarSign, TrendingUp, TrendingDown, Clock, 
  CheckCircle2, ChevronLeft, ChevronRight, Plus, Fuel, Wrench, 
  Car, Utensils, Smartphone, Shield, Package, Trash2, Copy, 
  Check, Share2, AlertCircle, FileText, ChevronDown, ChevronUp, Image as ImageIcon,
  ShieldCheck, CheckCircle
} from 'lucide-react';
import { 
  getCurrentMonthStr, formatMonthFriendly, 
  getPreviousMonth, getNextMonth, formatDateFriendly 
} from '../utils/dateUtils';
import AddExpenseModal from './AddExpenseModal';

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
  const [expandedWeekKey, setExpandedWeekKey] = useState(null);
  const [copiedReport, setCopiedReport] = useState(false);
  const [updatingWeekKey, setUpdatingWeekKey] = useState(null);

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

  // WhatsApp / Clipboard monthly export
  const handleCopyMonthlyReport = () => {
    if (!data) return;
    const { totals, weeks = [], expenses = [], expensesByCategory = {} } = data;
    const monthLabel = formatMonthFriendly(selectedMonth);

    let weeksLines = weeks.map((w, i) => {
      const statusIcon = w.isPaid ? '✅ COBRADO' : '⏳ PENDIENTE';
      return `  ${i + 1}. Semana ${w.displayLabel} (${w.startDate} al ${w.endDate})
     • Trabajos: ${w.completedCount} órdenes | ${Math.round(w.totalFootage)} ft
     • Monto: $${w.totalEarnings.toFixed(2)} [${statusIcon}]`;
    }).join('\n\n');

    let expenseLines = Object.entries(expensesByCategory).map(([cat, amt]) => {
      return `  • ${cat}: -$${amt.toFixed(2)}`;
    }).join('\n');

    if (!expenseLines) expenseLines = '  • Sin gastos registrados este mes';

    const text = `📊 *REPORTE CONTABLE MENSUAL - XFINITY*
📅 *Mes:* ${monthLabel}
👤 *Técnico:* Javier (P0G1)

💰 *RESUMEN DE INGRESOS (SEMANAS):*
• Semanas en el mes: ${totals.totalWeeksCount} (${totals.completedWeeksCount} cobradas)
• Trabajos completados: ${totals.totalJobs} órdenes
• Metraje total: ${totals.totalFootage} ft
• Total Facturado: $${totals.totalEarnings.toFixed(2)}
💵 *TOTAL COBRADO:* $${totals.totalPaid.toFixed(2)}
⏳ *PENDIENTE POR COBRAR:* $${totals.totalPending.toFixed(2)}

💸 *RESUMEN DE GASTOS:*
• Total Gastos: -$${totals.totalExpenses.toFixed(2)}
${expenseLines}

━━━━━━━━━━━━━━━━━━━━
💎 *BALANCE NETO REAL (EN MANO):*
💵 Total Cobrado: $${totals.totalPaid.toFixed(2)}
💸 Total Gastos:  -$${totals.totalExpenses.toFixed(2)}
👉 *GANANCIA NETA:* $${totals.netPaidBalance.toFixed(2)} (${totals.marginPercent}% de margen)

📋 *DETALLE DE SEMANAS DEL MES:*
${weeksLines || '  (No hay semanas registradas)'}

⚠️ *Constancia generada automáticamente desde Contabilidad XFinity.*`;

    navigator.clipboard.writeText(text);
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
    <div className="space-y-4 max-w-md mx-auto pb-24">
      {/* 1. SELECTOR DEL MES */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2.5 flex items-center justify-between shadow-md">
        <button
          onClick={handlePrevMonth}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition active:scale-95"
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
            className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold tracking-wide uppercase transition mt-0.5"
          >
            Ir a Mes Actual
          </button>
        </div>

        <button
          onClick={handleNextMonth}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition active:scale-95"
          title="Mes Siguiente"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* 2. TARJETA PRINCIPAL: BALANCE NETO MENSUAL */}
      <div className="relative overflow-hidden rounded-3xl bg-white dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 p-5 shadow-xl">
        <div className="absolute top-0 right-0 w-36 h-36 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-36 h-36 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Balance Neto Mensual
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30">
                {totals.marginPercent}% Margen
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              {totals.totalWeeksCount} {totals.totalWeeksCount === 1 ? 'semana' : 'semanas'}
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white">
                ${totals.netPaidBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-transparent px-1.5 py-0.5 rounded">en mano</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Cobrado (${totals.totalPaid.toFixed(2)}) menos gastos (-${totals.totalExpenses.toFixed(2)})
            </p>
          </div>

          {/* Sub-cards: Cobrado vs Gastos vs Pendiente */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800/80">
            {/* Cobrado */}
            <div className="bg-emerald-50/80 dark:bg-slate-950/60 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl p-2.5 shadow-sm">
              <div className="flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400 font-bold mb-0.5">
                <TrendingUp className="w-3 h-3 stroke-[3]" />
                <span>Cobrado</span>
              </div>
              <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                ${totals.totalPaid.toFixed(2)}
              </div>
              <div className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
                {totals.completedWeeksCount} sem. cobradas
              </div>
            </div>

            {/* Gastos */}
            <div className="bg-rose-50/80 dark:bg-slate-950/60 border border-rose-200 dark:border-rose-500/20 rounded-2xl p-2.5 shadow-sm">
              <div className="flex items-center gap-1 text-[10px] text-rose-700 dark:text-rose-400 font-bold mb-0.5">
                <TrendingDown className="w-3 h-3 stroke-[3]" />
                <span>Gastos</span>
              </div>
              <div className="text-sm sm:text-base font-black text-rose-600 dark:text-rose-400">
                -${totals.totalExpenses.toFixed(2)}
              </div>
              <div className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
                {expenses.length} registros
              </div>
            </div>

            {/* Pendiente */}
            <div className="bg-cyan-50/80 dark:bg-slate-950/60 border border-cyan-200 dark:border-cyan-500/20 rounded-2xl p-2.5 shadow-sm">
              <div className="flex items-center gap-1 text-[10px] text-cyan-700 dark:text-cyan-400 font-bold mb-0.5">
                <Clock className="w-3 h-3 stroke-[2.5]" />
                <span>Pendiente</span>
              </div>
              <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                ${totals.totalPending.toFixed(2)}
              </div>
              <div className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
                Por cobrar
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. SUB-PESTAÑAS CON FORMATO: ÍCONO ARRIBA Y TEXTO ABAJO */}
      <div className="bg-slate-900 p-1.5 rounded-2xl border border-slate-800 grid grid-cols-3 gap-1 shadow-sm">
        <button
          onClick={() => setActiveSubTab('weeks')}
          className={`flex flex-col items-center justify-center py-2 px-2 rounded-xl transition text-center select-none ${
            activeSubTab === 'weeks'
              ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/40 font-medium'
          }`}
        >
          <Calendar className={`w-4 h-4 mb-1 ${activeSubTab === 'weeks' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[11px] leading-tight">
            Semanas ({weeks.length})
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('expenses')}
          className={`flex flex-col items-center justify-center py-2 px-2 rounded-xl transition text-center select-none ${
            activeSubTab === 'expenses'
              ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/40 font-medium'
          }`}
        >
          <DollarSign className={`w-4 h-4 mb-1 ${activeSubTab === 'expenses' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[11px] leading-tight">
            Gastos ({expenses.length})
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('report')}
          className={`flex flex-col items-center justify-center py-2 px-2 rounded-xl transition text-center select-none ${
            activeSubTab === 'report'
              ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/40 font-medium'
          }`}
        >
          <Share2 className={`w-4 h-4 mb-1 ${activeSubTab === 'report' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[11px] leading-tight">
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
              const isExpanded = expandedWeekKey === w.key;
              const isUpdating = updatingWeekKey === w.key;

              return (
                <div
                  key={w.key}
                  className={`border rounded-2xl p-4 transition shadow-sm space-y-3 ${
                    w.isPaid
                      ? 'bg-gradient-to-br from-emerald-50/70 via-white to-white dark:from-emerald-950/20 dark:via-slate-900/90 dark:to-slate-900 border-emerald-300/80 dark:border-emerald-500/35 hover:border-emerald-400'
                      : 'bg-gradient-to-br from-amber-50/70 via-white to-white dark:from-amber-950/20 dark:via-slate-900/90 dark:to-slate-900 border-amber-300/80 dark:border-amber-500/35 hover:border-amber-400'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          Semana {w.displayLabel}
                        </h3>
                        {w.isPaid ? (
                          <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/90 dark:text-emerald-300 dark:border-emerald-600/50 flex items-center gap-1.5 shadow-xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            <span>Cobrado</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/90 dark:text-amber-300 dark:border-amber-600/50 flex items-center gap-1.5 shadow-xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                            <span>Pendiente</span>
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                        {w.startDate} al {w.endDate} • {w.completedCount} trabajos • {Math.round(w.totalFootage)} ft
                      </p>
                    </div>

                    <div className="text-right">
                      <div className={`text-base font-black font-mono ${
                        w.isPaid ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
                      }`}>
                        ${w.totalEarnings.toFixed(2)}
                      </div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                        {w.isPaid ? 'Cobrado ✓' : `Pendiente: $${w.pendingEarnings.toFixed(2)}`}
                      </span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className={`flex items-center justify-between pt-2 border-t gap-2 ${
                    w.isPaid ? 'border-emerald-100 dark:border-slate-800/80' : 'border-amber-100 dark:border-slate-800/80'
                  }`}>
                    <button
                      onClick={() => setExpandedWeekKey(isExpanded ? null : w.key)}
                      className="text-xs text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 font-bold flex items-center gap-1 py-1"
                    >
                      {isExpanded ? (
                        <>
                          <span>Ocultar órdenes</span>
                          <ChevronUp className="w-3.5 h-3.5" />
                        </>
                      ) : (
                        <>
                          <span>Ver {w.orders?.length || 0} órdenes</span>
                          <ChevronDown className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>

                    <button
                      onClick={(e) => handleToggleWeekPayment(w, w.isPaid ? 'Pendiente' : 'Cobrado', e)}
                      disabled={isUpdating}
                      className={`text-xs px-2.5 py-1 rounded-xl font-black transition flex items-center gap-1 ${
                        w.isPaid
                          ? 'bg-emerald-500/10 hover:bg-rose-500/10 text-emerald-700 hover:text-rose-600 dark:text-emerald-300 dark:hover:text-rose-400 border border-emerald-500/30 hover:border-rose-500/30 shadow-2xs'
                          : 'bg-amber-500/15 hover:bg-emerald-500/15 text-amber-800 hover:text-emerald-700 dark:text-amber-300 dark:hover:text-emerald-300 border border-amber-500/30 hover:border-emerald-500/30 shadow-2xs active:scale-95'
                      }`}
                    >
                      {w.isPaid ? (
                        <>
                          <CheckCircle className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                          <span>Cobrado ✓</span>
                        </>
                      ) : (
                        <>
                          <DollarSign className="h-3 w-3 stroke-[2.5]" />
                          <span>Confirmar</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Expanded orders preview */}
                  {isExpanded && w.orders && w.orders.length > 0 && (
                    <div className="pt-2 border-t border-slate-800/60 space-y-2">
                      {w.orders.map((ord, idx) => (
                        <div
                          key={ord.id}
                          className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>#{ord.job_id}</span>
                              <span className="text-[10px] text-slate-400 font-normal">{ord.work_date}</span>
                            </div>
                            <div className="text-slate-400 truncate max-w-[200px] text-[11px]">
                              {ord.address}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {ord.drop_footage} ft • {ord.cable_type} {ord.bore_type !== 'N' ? `• ${ord.bore_type}` : ''}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-emerald-400">
                              ${ord.rate_calculated}
                            </span>
                            <div className="text-[10px] text-slate-400">
                              {ord.payment_status}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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
                                    href={`/uploads/${p}`}
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

            {/* Copy Button */}
            <button
              onClick={handleCopyMonthlyReport}
              className={`w-full py-3.5 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.98] ${
                copiedReport
                  ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/30'
                  : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-cyan-500/20'
              }`}
            >
              {copiedReport ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>¡Reporte Mensual Copiado al Portapapeles!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copiar Reporte Mensual (WhatsApp)</span>
                </>
              )}
            </button>
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
    </div>
  );
}
