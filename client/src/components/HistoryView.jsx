import React, { useState, useEffect } from 'react';
import { 
  Calendar, CheckCircle2, Clock, Share2, Check, 
  Trash2, ExternalLink, Image as ImageIcon, X, DollarSign, 
  Ruler, ChevronRight, Copy, Camera, AlertCircle, FileText, 
  ShieldAlert, CheckCircle, Search, Filter, Sparkles, MapPin, Phone, ShieldCheck, AlertTriangle,
  BarChart3, Sun, Pencil, Briefcase
} from 'lucide-react';
import ShareReportModal from './ShareReportModal';
import TodayView from './TodayView';
import MonthlyView from './MonthlyView';
import EditJobModal from './EditJobModal';

const CUTOFF_LABELS = {
  '0': 'Domingo (Lunes a Domingo)',
  '1': 'Lunes (Martes a Lunes)',
  '2': 'Martes (Miércoles a Martes)',
  '3': 'Miércoles (Jueves a Miércoles)',
  '4': 'Jueves (Viernes a Jueves)',
  '5': 'Viernes (Sábado a Viernes)',
  '6': 'Sábado (Domingo a Sábado)',
};

export default function HistoryView({ 
  orders = [], 
  summaryData, 
  onRefresh, 
  onOpenPhotos, 
  onOpenScan, 
  onOrderUpdated, 
  onUpdateOrders 
}) {
  const [subTab, setSubTab] = useState('daily'); // 'daily' | 'weeks' | 'monthly' | 'all_orders'
  const [selectedWeekModal, setSelectedWeekModal] = useState(null); // Week object for overlay modal
  const [copiedWeekKey, setCopiedWeekKey] = useState(null);
  const [copiedJobId, setCopiedJobId] = useState(null);
  const [updatingWeekKey, setUpdatingWeekKey] = useState(null);
  const [reportOrder, setReportOrder] = useState(null); // Order to report via ShareReportModal
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null); // Fullscreen photo modal

  // General orders search and status filter
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL');

  const weeks = summaryData?.weeks || [];
  const totalPaidWeeks = weeks.filter(w => w.isPaid).reduce((sum, w) => sum + (w.totalEarnings || 0), 0);
  const totalPendingWeeks = weeks.filter(w => !w.isPaid).reduce((sum, w) => sum + (w.totalEarnings || 0), 0);
  const paidWeeksCount = weeks.filter(w => w.isPaid).length;
  const pendingWeeksCount = weeks.filter(w => !w.isPaid).length;

  // Active Cutoff Day & Global Balance Metrics
  const activeCutoff = String(summaryData?.cutoffDay ?? summaryData?.summary?.cutoffDay ?? '0');
  const summary = summaryData?.summary || {};
  const totalAllEarnings = summary.totalAllEarnings !== undefined 
    ? summary.totalAllEarnings 
    : orders.filter(o => o.status === 'Completado').reduce((sum, o) => sum + (parseFloat(o.rate_calculated) || 0), 0);
  const totalPaid = summary.totalPaid !== undefined 
    ? summary.totalPaid 
    : orders.filter(o => o.status === 'Completado' && o.payment_status === 'Cobrado').reduce((sum, o) => sum + (parseFloat(o.rate_calculated) || 0), 0);
  const totalPending = summary.totalPending !== undefined 
    ? summary.totalPending 
    : orders.filter(o => o.status === 'Completado' && o.payment_status !== 'Cobrado').reduce((sum, o) => sum + (parseFloat(o.rate_calculated) || 0), 0);
  const totalFeetAll = summary.totalFeetAll !== undefined 
    ? summary.totalFeetAll 
    : orders.filter(o => o.status !== 'No Realizado').reduce((sum, o) => sum + (parseFloat(o.drop_footage) || 0), 0);
  const completedOrdersCount = summary.totalCompletedCount !== undefined 
    ? summary.totalCompletedCount 
    : orders.filter(o => o.status === 'Completado').length;

  // Keep selectedWeekModal updated if summaryData refreshes
  useEffect(() => {
    if (selectedWeekModal && weeks.length > 0) {
      const updated = weeks.find(w => w.key === selectedWeekModal.key);
      if (updated) setSelectedWeekModal(updated);
    }
  }, [summaryData]);

  // Filtered list of all historical orders with smart cable search (RG6 / RG11)
  const filteredAllOrders = orders.filter((o) => {
    const q = orderSearch.toLowerCase().trim();
    if (q) {
      const cleanQ = q.replace(/[^a-z0-9]/g, '');
      const cleanCable = (o.cable_type || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      const matchesSearch = 
        o.job_id.toLowerCase().includes(q) ||
        o.address.toLowerCase().includes(q) ||
        o.city.toLowerCase().includes(q) ||
        (o.phone && o.phone.includes(q)) ||
        (o.work_date && o.work_date.includes(q)) ||
        (o.cable_type && o.cable_type.toLowerCase().includes(q)) ||
        (cleanCable && cleanQ && cleanCable.includes(cleanQ));

      if (!matchesSearch) return false;
    }

    if (orderStatusFilter !== 'ALL' && o.status !== orderStatusFilter) return false;
    return true;
  });

  // Toggle or set payment status for a week
  const handleTogglePayment = async (w, targetStatus, e) => {
    if (e) e.stopPropagation();

    const isMarkingPaid = targetStatus === 'Cobrado';
    const msg = isMarkingPaid
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
        if (onRefresh) await onRefresh();
      } else {
        const errData = await res.json();
        alert('Error: ' + (errData.error || 'No se pudo actualizar'));
      }
    } catch (err) {
      alert('Error de red: ' + err.message);
    } finally {
      setUpdatingWeekKey(null);
    }
  };

  // Comprehensive audit statement for dispute/claim
  const copyAuditStatement = (w) => {
    const completedList = w.orders.filter(o => o.status === 'Completado');
    const jobLines = completedList.map((o, idx) => {
      const boreTxt = o.bore_type && o.bore_type.includes('DW') ? ' [DW BORE +$30]' : '';
      const footageBonus = o.drop_footage > 300 ? Math.floor((o.drop_footage - 300) / 100) * 25 : 0;
      const footTxt = footageBonus > 0 ? ` [METRAJE >300ft: +$${footageBonus}]` : '';
      const adjTxt = o.manual_adjustment && o.manual_adjustment !== 0 
        ? ` [AJUSTE SUPERVISOR: ${o.manual_adjustment > 0 ? `+$${o.manual_adjustment}` : `-$${Math.abs(o.manual_adjustment)}`} (${o.adjustment_reason || 'Inconsistencia'})]`
        : '';
      const photosTxt = o.photos_count > 0 ? ` (${o.photos_count} fotos de respaldo)` : ' (Sin fotos)';
      return `${idx + 1}. Job #${o.job_id} | ${o.work_date}
   📍 ${o.address}, ${o.city}
   📏 ${o.drop_footage} ft (${o.cable_type})${boreTxt}${footTxt}${adjTxt}${photosTxt}
   💵 Valor Cobrable: $${o.rate_calculated}`;
    }).join('\n\n');

    const text = `📁 *CONSTANCIA DE AUDITORÍA & RECLAMACIÓN - XFINITY*
📅 *Período:* Semana ${w.displayLabel || w.key} (${w.startDate} al ${w.endDate})
👤 *Técnico:* Javier (P0G1)
🔢 *Órdenes Completadas:* ${completedList.length} trabajos
📏 *Metraje Total:* ${Math.round(w.totalFootage)} ft
💰 *MONTO TOTAL:* $${w.totalEarnings.toFixed(2)}
🏷️ *Estado de Cobro:* ${w.isPaid ? 'COBRADO' : 'PENDIENTE POR COBRAR'}

📋 *DESGLOSE DE ÓRDENES:*
${jobLines}

⚠️ *Nota:* Cada orden cuenta con registro de Comcast, metraje, ajustes y fotos de respaldo en el sistema.`;

    navigator.clipboard.writeText(text);
    setCopiedWeekKey(w.key);
    setTimeout(() => setCopiedWeekKey(null), 3000);
  };

  // Copy proof for single order dispute
  const copySingleJobClaim = (order) => {
    const hasDriveway = Boolean(
      order.bore_type && (
        order.bore_type.includes('DW') || 
        order.bore_type.toLowerCase().includes('driveway') || 
        order.bore_type === 'Y'
      )
    );

    const text = `📋 *COMPROBANTE DE TRABAJO - XFINITY*
🔢 *Work Order #:* ${order.job_id}
📅 *Fecha Ejecución:* ${order.work_date}
📍 *Dirección:* ${order.address}${order.city ? `, ${order.city}` : ''}
📏 *Pies / Drop:* ${order.drop_footage} ft (${order.cable_type || 'RG-6'})
🚗 *Driveway:* ${hasDriveway ? 'Sí' : 'No'}
📸 *Fotos de Evidencia:* ${order.photos_count || 0} archivada(s)
✅ *Estado:* ${order.status}`;

    navigator.clipboard.writeText(text);
    setCopiedJobId(order.id);
    setTimeout(() => setCopiedJobId(null), 2500);
  };

  return (
    <div className="space-y-4 max-w-md sm:max-w-lg mx-auto w-full pb-8">
      {/* 1. SELECTOR SUPERIOR DE 4 SUBPESTAÑAS (COCKPIT HIGH-TECH STYLE) */}
      <div className="bg-[#0f1722]/95 backdrop-blur-xl border border-white/10 p-1.5 rounded-2xl grid grid-cols-4 gap-1.5 shadow-xl">
        {[
          { id: 'daily', label: 'Diario', icon: Clock },
          { id: 'weeks', label: 'Semanal', icon: Calendar },
          { id: 'monthly', label: 'Mensual', icon: BarChart3 },
          { id: 'all_orders', label: 'Historial', icon: Search },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = subTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`flex flex-col items-center justify-center py-2 px-1 text-center rounded-xl transition-all duration-200 select-none ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-cyan-500/10 text-cyan-400 border border-cyan-500/40 shadow-sm shadow-cyan-500/20 font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 font-medium border border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 mb-1 ${isActive ? 'stroke-[2.5] text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.4)]' : 'stroke-2 text-slate-400'}`} />
              <span className={`text-[10.5px] leading-tight ${isActive ? 'font-black text-cyan-300' : 'font-medium text-slate-400'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* SUBTAB 1: REPORTE DIARIO (VISTA COMPLETA DE TRABAJOS DEL DÍA CON ANCHO COMPLETO) */}
      {subTab === 'daily' && (
        <div className="animate-fade-in w-full">
          <TodayView
            orders={orders}
            summaryData={summaryData}
            onOpenScan={onOpenScan}
            onOpenPhotos={onOpenPhotos}
            onOrderUpdated={onOrderUpdated || onRefresh}
            onUpdateOrders={onUpdateOrders}
            viewMode="classic"
            hideModeToggle={true}
          />
        </div>
      )}

      {/* SUBTAB 2: LISTADO DE CIERRES SEMANALES */}
      {subTab === 'weeks' && (
        <div className="space-y-3">
          {/* Banner de Ciclo de Cierre Semanal Activo */}
          <div className="bg-[#101722] border border-white/10 rounded-2xl p-2.5 px-3 flex items-center justify-between text-xs shadow-md">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0 shadow-xs">
                <Calendar className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[9.5px] uppercase tracking-wider text-slate-400 font-bold block">
                  Día de Cierre de Semana
                </span>
                <span className="text-xs font-black text-amber-300 font-mono block truncate">
                  {CUTOFF_LABELS[activeCutoff] || 'Sábado (Domingo a Sábado)'}
                </span>
              </div>
            </div>
            <span className="text-[10px] text-cyan-400 font-mono font-bold bg-cyan-500/10 border border-cyan-500/25 px-2 py-0.5 rounded-lg shrink-0">
              Activo
            </span>
          </div>

          {/* Resumen Superior de Cobros (KPIs Estéticos Cockpit) */}
          {weeks.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#131b26] border border-amber-500/30 rounded-2xl p-3 shadow-lg space-y-1">
                <div className="flex items-center justify-between text-amber-400 text-[10px] font-bold uppercase tracking-wider">
                  <span>Pendiente</span>
                  <Clock className="h-3.5 w-3.5" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-amber-400 font-mono leading-none drop-shadow-[0_0_8px_rgba(251,191,36,0.25)]">
                  ${totalPendingWeeks.toFixed(2)}
                </div>
                <p className="text-[10px] text-slate-400 truncate font-medium">
                  {pendingWeeksCount} semana{pendingWeeksCount !== 1 ? 's' : ''} pendiente{pendingWeeksCount !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="bg-[#131b26] border border-emerald-500/30 rounded-2xl p-3 shadow-lg space-y-1">
                <div className="flex items-center justify-between text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                  <span>Cobrado</span>
                  <ShieldCheck className="h-3.5 w-3.5" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono leading-none drop-shadow-[0_0_8px_rgba(52,211,153,0.35)]">
                  ${totalPaidWeeks.toFixed(2)}
                </div>
                <p className="text-[10px] text-slate-400 truncate font-medium">
                  {paidWeeksCount} semana{paidWeeksCount !== 1 ? 's' : ''} liquidada{paidWeeksCount !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          )}

          {weeks.length === 0 ? (
            <div className="bg-[#0f1722]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-center shadow-lg flex flex-col items-center justify-center space-y-3 my-4 select-none">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <Calendar className="h-6 w-6 stroke-[2]" />
              </div>
              <div className="space-y-1 max-w-xs">
                <h4 className="text-sm font-black text-white">No hay semanas registradas aún</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Los cierres semanales se crean automáticamente conforme agregues y completes órdenes de trabajo.
                </p>
              </div>
            </div>
          ) : (
            weeks.map((w) => {
              const completedCount = w.completedCount !== undefined 
                ? w.completedCount 
                : w.orders.filter(o => o.status === 'Completado').length;
              const isUpdating = updatingWeekKey === w.key;

              return (
                <div
                  key={w.key}
                  onClick={() => setSelectedWeekModal(w)}
                  className={`bg-[#131b26] border rounded-2xl p-3.5 cursor-pointer transition select-none space-y-2.5 shadow-lg active:scale-[0.99] group relative overflow-hidden ${
                    w.isPaid
                      ? 'border-emerald-500/30 hover:border-emerald-500/60 shadow-emerald-500/5'
                      : 'border-amber-500/30 hover:border-amber-500/60 shadow-amber-500/5'
                  }`}
                >
                  {/* Fila Superior */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-white font-mono group-hover:text-cyan-400 transition">
                          Semana {w.displayLabel || w.key}
                        </span>
                        {w.isPaid ? (
                          <span className="inline-flex items-center gap-1 text-[9px] text-emerald-400 font-bold bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Cobrado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[9px] text-amber-400 font-bold bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/30">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                            Pendiente
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 font-medium">
                        {w.startDate} al {w.endDate} • {completedCount} de {w.totalJobs} hechos
                      </p>
                    </div>

                    <div className="text-right">
                      <span className={`text-base sm:text-lg font-black font-mono block ${
                        w.isPaid ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.35)]' : 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.25)]'
                      }`}>
                        ${w.totalEarnings.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono font-bold">
                        {Math.round(w.totalFootage)} ft
                      </span>
                    </div>
                  </div>

                  {/* Fila Inferior con Espacio de Confirmación Estético */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/8">
                    <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                      <FileText className="h-3 w-3 text-cyan-400" />
                      <span>{w.orders.length} órdenes registradas</span>
                    </span>

                    <div className="flex items-center gap-2">
                      {w.isPaid ? (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={(e) => handleTogglePayment(w, 'Pendiente', e)}
                          className="px-2.5 py-1 bg-emerald-500/15 hover:bg-rose-500/15 text-emerald-400 hover:text-rose-400 border border-emerald-500/30 hover:border-rose-500/30 rounded-xl text-[10px] font-black flex items-center gap-1 transition active:scale-95 cursor-pointer shadow-xs"
                          title="Toca para cambiar a Pendiente si hubo algún error"
                        >
                          <CheckCircle className="h-3 w-3" />
                          <span>Cobrado ✓</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={(e) => handleTogglePayment(w, 'Cobrado', e)}
                          className="px-2.5 py-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-[10px] rounded-xl flex items-center gap-1 shadow-md shadow-emerald-500/20 transition active:scale-95 cursor-pointer"
                          title="Confirmar que recibiste el pago de esta semana"
                        >
                          <DollarSign className="h-3 w-3 stroke-[2.5]" />
                          <span>Confirmar Cobro</span>
                        </button>
                      )}

                      <div className="h-7 w-7 rounded-full bg-slate-800/80 border border-white/10 flex items-center justify-center text-slate-300 group-hover:text-cyan-400 group-hover:border-cyan-500/30 transition flex-shrink-0">
                        <ChevronRight className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* SUBTAB 4: HISTORIAL GENERAL DE TODOS LOS TRABAJOS (CON BUSCADOR Y FILTROS) */}
      {subTab === 'all_orders' && (
        <div className="space-y-3">
          {/* BALANCE DE CONTABILIDAD GENERAL (REPORTE HISTÓRICO COMPLETO) */}
          <div className="bg-[#0f1722]/95 border border-white/10 rounded-3xl p-4 space-y-3.5 shadow-xl backdrop-blur-xl">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
                  <DollarSign className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-black text-white uppercase tracking-wider">
                  Balance de Contabilidad General
                </span>
              </div>
              <span className="text-[10px] text-cyan-400 font-mono font-bold bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-lg">
                Histórico
              </span>
            </div>

            {/* 2 Big Cards: Pendiente por Cobrar & Total Cobrado */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-[#131b26] border border-amber-500/30 rounded-2xl p-3 space-y-1 relative overflow-hidden shadow-md">
                <div className="flex items-center justify-between text-amber-400 text-[10px] font-bold uppercase tracking-wider">
                  <span>Pendiente</span>
                  <Clock className="h-3.5 w-3.5" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-amber-300 font-mono leading-none pt-0.5 drop-shadow-[0_0_8px_rgba(251,191,36,0.2)]">
                  ${totalPending.toFixed(2)}
                </div>
                <p className="text-[9.5px] text-slate-400 leading-tight">
                  Aún por liquidar
                </p>
              </div>

              <div className="bg-[#131b26] border border-emerald-500/30 rounded-2xl p-3 space-y-1 relative overflow-hidden shadow-md">
                <div className="flex items-center justify-between text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                  <span>Cobrado</span>
                  <ShieldCheck className="h-3.5 w-3.5" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono leading-none pt-0.5 drop-shadow-[0_0_8px_rgba(52,211,153,0.2)]">
                  ${totalPaid.toFixed(2)}
                </div>
                <p className="text-[9.5px] text-slate-400 leading-tight">
                  Liquidado y confirmado
                </p>
              </div>
            </div>

            {/* Producción Histórica, Metraje y Trabajos */}
            <div className="bg-[#131b26] border border-white/5 rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <div className="p-1 bg-cyan-500/15 text-cyan-400 rounded-lg border border-cyan-500/30">
                    <DollarSign className="h-3.5 w-3.5" />
                  </div>
                  <span className="font-bold text-[11px]">Producción Total Histórica</span>
                </div>
                <span className="font-black text-white font-mono text-sm">
                  ${totalAllEarnings.toFixed(2)}
                </span>
              </div>

              <div className="h-px bg-white/5" />

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <div className="p-1 bg-amber-500/15 text-amber-400 rounded-lg border border-amber-500/30">
                    <Ruler className="h-3.5 w-3.5" />
                  </div>
                  <span className="font-bold text-[11px]">Metraje Total Instalado</span>
                </div>
                <span className="font-black text-amber-300 font-mono text-sm">
                  {Math.round(totalFeetAll).toLocaleString()} ft
                </span>
              </div>

              <div className="h-px bg-white/5" />

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <div className="p-1 bg-blue-500/15 text-blue-400 rounded-lg border border-blue-500/30">
                    <Briefcase className="h-3.5 w-3.5" />
                  </div>
                  <span className="font-bold text-[11px]">Trabajos Completados</span>
                </div>
                <span className="font-black text-cyan-300 font-mono text-sm">
                  {completedOrdersCount} de {orders.length}
                </span>
              </div>
            </div>
          </div>

          {/* BUSCADOR GENERAL INTELIGENTE */}
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por Job #, dirección, cable (RG6/RG11), ciudad..."
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              className="w-full bg-[#131b26] border border-white/10 rounded-2xl pl-9 pr-8 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition shadow-md"
            />
            {orderSearch && (
              <button
                type="button"
                onClick={() => setOrderSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-0.5"
                title="Limpiar búsqueda"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filtros de Estado Exclusivos Cockpit */}
          <div className="grid grid-cols-4 gap-1.5 text-[11px] font-bold">
            {[
              { id: 'ALL', label: `Todos (${orders.length})` },
              { id: 'Completado', label: `Hechos (${orders.filter(o => o.status === 'Completado').length})`, color: 'emerald' },
              { id: 'Pendiente', label: `Pendientes (${orders.filter(o => o.status === 'Pendiente').length})`, color: 'amber' },
              { id: 'No Realizado', label: `Cancelados (${orders.filter(o => o.status === 'No Realizado').length})`, color: 'rose' }
            ].map((f) => {
              const active = orderStatusFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setOrderStatusFilter(f.id)}
                  className={`py-2 px-1 rounded-xl text-center transition font-black ${
                    active
                      ? f.id === 'Completado'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                        : f.id === 'Pendiente'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                        : f.id === 'No Realizado'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                        : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'bg-[#131b26] border border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Listado de Órdenes Filtradas */}
          {filteredAllOrders.length === 0 ? (
            <div className="bg-[#131b26] border border-white/10 rounded-2xl p-8 text-center text-slate-400 text-xs shadow-md">
              No se encontraron trabajos con los filtros actuales.
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredAllOrders.map((order, idx) => {
                const isComp = order.status === 'Completado';
                const isCanc = order.status === 'No Realizado';
                const hasBore = order.bore_type && order.bore_type.includes('DW');

                return (
                  <div
                    key={order.id}
                    className="bg-[#131b26] border border-white/10 hover:border-cyan-500/30 rounded-2xl p-3.5 space-y-2 text-xs shadow-md transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {/* Número en círculo */}
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-black font-mono shadow-sm flex-shrink-0 ${
                          isComp
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : isCanc
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}>
                          {idx + 1}
                        </div>

                        <span className="font-mono font-black text-cyan-400">
                          Job #{order.job_id}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {order.work_date}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                          isComp ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : isCanc ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        }`}>
                          {order.status}
                        </span>
                        <span className="font-mono font-black text-emerald-400 text-sm drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]">
                          ${order.rate_calculated}
                        </span>
                      </div>
                    </div>

                    {/* Dirección */}
                    <div className="text-white">
                      <p className="font-bold">{order.address}</p>
                      <p className="text-[10px] text-slate-400">{order.city} {order.zip_code}</p>
                    </div>

                    {/* Specs */}
                    <div className="flex flex-wrap items-center gap-1 text-[10px] font-mono">
                      <span className="bg-[#0f1722] text-amber-300 border border-white/10 px-2 py-0.5 rounded font-bold">
                        {order.drop_footage} ft
                      </span>
                      <span className="bg-[#0f1722] text-slate-300 border border-white/10 px-2 py-0.5 rounded">
                        {order.cable_type}
                      </span>
                      {hasBore && (
                        <span className="bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded font-bold">
                          DW Bore +$30
                        </span>
                      )}
                      {order.drop_footage > 300 && Math.floor((order.drop_footage - 300) / 100) > 0 && (
                        <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded font-bold">
                          Drop &gt;300ft: +${Math.floor((order.drop_footage - 300) / 100) * 25}
                        </span>
                      )}
                      {order.manual_adjustment && order.manual_adjustment !== 0 ? (
                        <span className={`px-2 py-0.5 rounded border text-[9px] font-bold ${
                          order.manual_adjustment > 0 ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        }`}>
                          Ajuste {order.manual_adjustment > 0 ? `+$${order.manual_adjustment}` : `-$${Math.abs(order.manual_adjustment)}`}
                        </span>
                      ) : null}
                    </div>

                    {/* Si Cancelado: Mostrar Motivo de Cancelación */}
                    {isCanc && (
                      <div className="bg-rose-950/25 border border-rose-500/25 p-2 rounded-xl text-xs text-rose-200 flex items-start gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <span className="text-[9px] uppercase font-bold text-rose-400 block tracking-wider">
                            Motivo No Realizado:
                          </span>
                          <p className="font-semibold text-xs leading-tight truncate">
                            {order.cancel_reason || 'Sin motivo detallado'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Footer de la tarjeta con Fotos y Copiar Comprobante */}
                    <div className="pt-2 border-t border-white/8 flex items-center justify-between gap-1.5 flex-wrap">
                      {onOpenPhotos ? (
                        <button
                          onClick={() => onOpenPhotos(order)}
                          className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 bg-[#182332] px-2.5 py-1 rounded-lg border border-white/10 transition active:scale-95"
                        >
                          <Camera className="h-3 w-3" />
                          <span>{order.photos_count || 0} Fotos</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono">
                          {order.photos_count || 0} fotos
                        </span>
                      )}

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingOrder(order)}
                          className="text-[10px] text-slate-200 hover:text-white bg-[#182332] hover:bg-[#243140] border border-white/10 px-2 py-1 rounded-lg flex items-center gap-1 transition active:scale-95 shadow-xs"
                          title="Editar orden"
                        >
                          <Pencil className="h-3 w-3 text-cyan-400" />
                          <span>Editar</span>
                        </button>

                        <button
                          onClick={() => copySingleJobClaim(order)}
                          className="text-[10px] text-slate-200 hover:text-white bg-[#182332] hover:bg-[#243140] border border-white/10 px-2.5 py-1 rounded-lg flex items-center gap-1 transition active:scale-95 shadow-xs"
                          title="Copiar comprobante al portapapeles"
                        >
                          {copiedJobId === order.id ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-400" />
                              <span className="text-emerald-400 font-bold">¡Copiado!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3 text-cyan-400" />
                              <span>Comprobante</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => setReportOrder(order)}
                          className="text-[10px] text-emerald-300 hover:text-emerald-200 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1 font-bold transition active:scale-95 shadow-xs"
                          title="Reportar trabajo por WhatsApp"
                        >
                          <Share2 className="h-3 w-3 text-emerald-400" />
                          <span>Reportar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 3: REPORTE MENSUAL (INGRESOS, GASTOS & BALANCES) */}
      {subTab === 'monthly' && (
        <div className="animate-fade-in">
          <MonthlyView
            orders={orders}
            onRefresh={onRefresh || onOrderUpdated}
          />
        </div>
      )}

      {/* COMPONENTE SUPERPUESTO (MODAL DETALLADO DE LA SEMANA CON DISEÑO COCKPIT) */}
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
            className="bg-[#101722] border border-white/10 rounded-3xl max-w-sm sm:max-w-md w-full max-h-[78dvh] sm:max-h-[82dvh] modal-sheet-compact flex flex-col overflow-hidden shadow-2xl text-white"
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* Header del Modal */}
            <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-white dark:bg-slate-900/70 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-bold shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider font-mono truncate">
                      Semana {selectedWeekModal.displayLabel || selectedWeekModal.key}
                    </h3>
                    {selectedWeekModal.isPaid ? (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full font-black flex items-center gap-1 shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Cobrado
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full font-black flex items-center gap-1 shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Pendiente
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 font-mono font-semibold truncate">
                    {selectedWeekModal.startDate} al {selectedWeekModal.endDate}
                  </p>
                </div>
              </div>

              {/* Botón Cerrar */}
              <button
                type="button"
                onClick={() => setSelectedWeekModal(null)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition shrink-0 ml-2"
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
                  ${selectedWeekModal.totalEarnings.toFixed(2)}
                </span>
              </div>
              <div className="bg-[#16202c] border border-white/5 rounded-xl py-1 px-1">
                <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold">Metraje</span>
                <span className="text-xs sm:text-sm font-black text-amber-300 font-mono leading-none">
                  {Math.round(selectedWeekModal.totalFootage)} ft
                </span>
              </div>
              <div className="bg-[#16202c] border border-white/5 rounded-xl py-1 px-1">
                <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold">Trabajos</span>
                <span className="text-xs sm:text-sm font-black text-cyan-400 font-mono leading-none">
                  {selectedWeekModal.orders.length}
                </span>
              </div>
            </div>

            {/* Cuerpo del Modal con Scroll */}
            <div className="p-3.5 overflow-y-auto space-y-3 flex-1 min-h-0 scrollbar-none">
              
              {/* Acciones Rápidas: Auditoría / Confirmar Cobro */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => copyAuditStatement(selectedWeekModal)}
                  className="py-2 px-3 bg-[#16202c] hover:bg-[#1f2d3d] text-slate-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 border border-white/10 shadow-xs"
                >
                  {copiedWeekKey === selectedWeekModal.key ? (
                    <>
                      <Check className="h-3.5 w-3.5 stroke-[3] text-emerald-400" />
                      <span className="text-emerald-400">¡Constancia Copiada!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-cyan-400" />
                      <span>Copiar Auditoría</span>
                    </>
                  )}
                </button>

                {selectedWeekModal.isPaid ? (
                  <button
                    type="button"
                    onClick={() => handleTogglePayment(selectedWeekModal, 'Pendiente')}
                    className="py-2 px-3 bg-emerald-500/15 hover:bg-rose-500/15 text-emerald-300 hover:text-rose-300 border border-emerald-500/30 hover:border-rose-500/30 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition active:scale-95"
                  >
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Cobrado (Tocar para Pendiente)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleTogglePayment(selectedWeekModal, 'Cobrado')}
                    className="py-2 px-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 transition active:scale-95 cursor-pointer"
                  >
                    <DollarSign className="h-3.5 w-3.5 stroke-[3]" />
                    <span>Confirmar Cobro (${selectedWeekModal.totalEarnings.toFixed(2)})</span>
                  </button>
                )}
              </div>

              {/* Listado Completo de Trabajos */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <span>Historial de Trabajos ({selectedWeekModal.orders.length})</span>
                  <span>Fotos & Comprobantes</span>
                </div>

                {selectedWeekModal.orders.map((order, idx) => {
                  const isComp = order.status === 'Completado';
                  const isCanc = order.status === 'No Realizado';
                  const hasBore = order.bore_type && order.bore_type.includes('DW');
                  const photos = order.photos || [];

                  return (
                    <div
                      key={order.id}
                      className="bg-[#16202c] border border-white/10 hover:border-cyan-500/30 rounded-2xl p-3 space-y-2 text-xs transition shadow-md"
                    >
                      {/* Job Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-black font-mono shadow-sm flex-shrink-0 ${
                            isComp
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : isCanc
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}>
                            {idx + 1}
                          </div>

                          <span className="font-mono font-black text-cyan-400">
                            Job #{order.job_id}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {order.work_date}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                            isComp ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : isCanc ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          }`}>
                            {order.status}
                          </span>
                          <span className="font-mono font-black text-emerald-400 text-sm drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]">
                            ${order.rate_calculated}
                          </span>
                        </div>
                      </div>

                      {/* Dirección del Cliente */}
                      <div className="text-white">
                        <p className="font-bold leading-tight">{order.address}</p>
                        <p className="text-[10px] text-slate-400">{order.city} {order.zip_code}</p>
                      </div>

                      {/* Especificaciones */}
                      <div className="flex flex-wrap items-center gap-1 text-[10px] font-mono">
                        <span className="bg-[#0f1722] text-amber-300 border border-white/10 px-2 py-0.5 rounded font-bold">
                          {order.drop_footage} ft
                        </span>
                        <span className="bg-[#0f1722] text-slate-300 border border-white/10 px-2 py-0.5 rounded">
                          {order.cable_type}
                        </span>
                        {hasBore && (
                          <span className="bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded font-bold">
                            DW Bore +$30
                          </span>
                        )}
                        {order.drop_footage > 300 && Math.floor((order.drop_footage - 300) / 100) > 0 && (
                          <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded font-bold">
                            Drop &gt;300ft: +${Math.floor((order.drop_footage - 300) / 100) * 25}
                          </span>
                        )}
                        {order.manual_adjustment !== undefined && order.manual_adjustment !== 0 && (
                          <span className={`px-2 py-0.5 rounded border text-[9px] font-bold flex items-center gap-1 ${
                            order.manual_adjustment > 0 ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          }`}>
                            <Sparkles className="h-2.5 w-2.5" />
                            <span>{order.manual_adjustment > 0 ? `+$${order.manual_adjustment}` : `-$${Math.abs(order.manual_adjustment)}`}</span>
                            {order.adjustment_reason && (
                              <span className="font-normal opacity-80 text-[8px] max-w-[70px] truncate">({order.adjustment_reason})</span>
                            )}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded border text-[9px] font-bold ${
                          order.payment_status === 'Cobrado'
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                            : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                        }`}>
                          {order.payment_status || 'Pendiente'}
                        </span>
                      </div>

                      {/* Galería de Fotos de Evidencia de esa Orden */}
                      <div className="pt-2 border-t border-white/8">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                            <Camera className="h-3 w-3 text-cyan-400" />
                            <span>Fotos de Evidencia ({photos.length})</span>
                          </span>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingOrder(order)}
                              className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold"
                              title="Editar orden"
                            >
                              <Pencil className="h-3 w-3" />
                              <span>Editar</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => copySingleJobClaim(order)}
                              className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold"
                            >
                              {copiedJobId === order.id ? (
                                <>
                                  <Check className="h-3 w-3 text-emerald-400" />
                                  <span className="text-emerald-400 font-bold">¡Copiado!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                  <span>Comprobante</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => setReportOrder(order)}
                              className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-bold"
                            >
                              <Share2 className="h-3 w-3" />
                              <span>Reportar</span>
                            </button>
                          </div>
                        </div>

                        {photos.length === 0 ? (
                          <p className="text-[10px] text-slate-500 italic">
                            Sin fotos adjuntas para esta orden.
                          </p>
                        ) : (
                          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                            {photos.map((p) => (
                              <div
                                key={p.id}
                                onClick={() => setSelectedPhoto(p.photo_data || `/uploads/${p.filename}`)}
                                className="h-14 w-16 rounded-xl overflow-hidden bg-slate-950 border border-white/10 flex-shrink-0 cursor-pointer relative group"
                              >
                                <img 
                                  src={p.photo_data || `/uploads/${p.filename}`} 
                                  alt={p.category} 
                                  className="w-full h-full object-cover group-hover:scale-105 transition" 
                                />
                                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                  <ExternalLink className="h-3.5 w-3.5 text-white" />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer Estandarizado Cockpit */}
            <div className="px-4 py-2.5 border-t border-white/10 bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
              <span className="text-[11px] text-slate-400 font-mono">
                {selectedWeekModal.orders.length} órdenes registradas
              </span>
              <button
                type="button"
                onClick={() => setSelectedWeekModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold rounded-xl transition active:scale-95 border border-white/10"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULLSCREEN PHOTO PREVIEW MODAL */}
      {selectedPhoto && (
        <div
          onClick={() => setSelectedPhoto(null)}
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="relative max-w-lg w-full flex flex-col items-center">
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute -top-10 right-0 p-2 text-white hover:text-cyan-400"
            >
              <X className="h-6 w-6" />
            </button>
            <img
              src={selectedPhoto}
              alt="Evidencia"
              className="max-h-[85vh] w-auto max-w-full rounded-2xl object-contain border border-slate-800 shadow-2xl"
            />
          </div>
        </div>
      )}
      {/* MODAL DE REPORTE PARA WHATSAPP */}
      <ShareReportModal
        isOpen={!!reportOrder}
        order={reportOrder}
        onClose={() => setReportOrder(null)}
        onOrderUpdated={onRefresh}
      />
      {editingOrder && (
        <EditJobModal
          order={editingOrder}
          isOpen={Boolean(editingOrder)}
          onClose={() => setEditingOrder(null)}
          onJobUpdated={() => {
            setEditingOrder(null);
            if (onRefresh) onRefresh();
            if (onOrderUpdated) onOrderUpdated();
          }}
        />
      )}
    </div>
  );
}
