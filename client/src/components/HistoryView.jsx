import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, CheckCircle2, Clock, Share2, Check, CheckCheck,
  Trash2, ExternalLink, Image as ImageIcon, X, DollarSign, 
  Ruler, ChevronRight, ChevronLeft, Copy, Camera, AlertCircle, FileText, 
  ShieldAlert, CheckCircle, Search, Filter, Sparkles, MapPin, Phone, ShieldCheck, AlertTriangle,
  BarChart3, Sun, Pencil, Briefcase, Paperclip, ChevronDown, Eye
} from 'lucide-react';
import ShareReportModal from './ShareReportModal';
import TodayView from './TodayView';
import MonthlyView from './MonthlyView';
import EditJobModal from './EditJobModal';
import HistoricalOrderCard from './HistoricalOrderCard';
import ZoomableImageViewer from './ZoomableImageViewer';
import { getOrderRemark } from '../utils/remarkUtils';

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
  onUpdateOrders,
  focusDateRequest = null
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

  // Weekly closures search and status filter
  const [weekStatusFilter, setWeekStatusFilter] = useState('ALL'); // 'ALL' | 'Pendiente' | 'Cobrado'
  const [weekSearch, setWeekSearch] = useState('');

  // Filtro de Año y Estados de Comprobante Semanal
  const currentYear = new Date().getFullYear().toString();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [confirmPaymentWeek, setConfirmPaymentWeek] = useState(null);
  const [receiptPhotoPreview, setReceiptPhotoPreview] = useState(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [selectedReceiptModal, setSelectedReceiptModal] = useState(null);

  const weeks = summaryData?.weeks || [];

  // Años disponibles detectados en las semanas y órdenes
  const availableYears = useMemo(() => {
    const yearsSet = new Set([currentYear]);
    weeks.forEach(w => {
      if (w.startDate) yearsSet.add(w.startDate.split('-')[0]);
      if (w.endDate) yearsSet.add(w.endDate.split('-')[0]);
    });
    orders.forEach(o => {
      if (o.work_date) yearsSet.add(o.work_date.split('-')[0]);
    });
    return Array.from(yearsSet).sort().reverse();
  }, [weeks, orders, currentYear]);

  // Línea de tiempo ordenada de años: años históricos ascendentes y luego 'ALL'
  const timelineYears = useMemo(() => {
    const yearsSet = new Set([currentYear]);
    weeks.forEach(w => {
      if (w.startDate) yearsSet.add(w.startDate.split('-')[0]);
      if (w.endDate) yearsSet.add(w.endDate.split('-')[0]);
    });
    orders.forEach(o => {
      if (o.work_date) yearsSet.add(o.work_date.split('-')[0]);
    });
    const sortedYears = Array.from(yearsSet).filter(Boolean).sort();
    return [...sortedYears, 'ALL'];
  }, [weeks, orders, currentYear]);

  const currentYearIndex = timelineYears.indexOf(selectedYear);
  const canGoBackYear = currentYearIndex > 0;
  const canGoForwardYear = currentYearIndex >= 0 && currentYearIndex < timelineYears.length - 1;

  const handlePrevYear = () => {
    if (canGoBackYear) {
      setSelectedYear(timelineYears[currentYearIndex - 1]);
    }
  };

  const handleNextYear = () => {
    if (canGoForwardYear) {
      setSelectedYear(timelineYears[currentYearIndex + 1]);
    }
  };

  // Semanas filtradas por año seleccionado
  const yearWeeks = useMemo(() => {
    if (selectedYear === 'ALL') return weeks;
    return weeks.filter(w => (w.startDate && w.startDate.startsWith(selectedYear)) || (w.endDate && w.endDate.startsWith(selectedYear)));
  }, [weeks, selectedYear]);

  const totalPaidWeeks = yearWeeks.filter(w => w.isPaid).reduce((sum, w) => sum + (w.totalEarnings || 0), 0);
  const totalPendingWeeks = yearWeeks.filter(w => !w.isPaid).reduce((sum, w) => sum + (w.totalEarnings || 0), 0);
  const paidWeeksCount = yearWeeks.filter(w => w.isPaid).length;
  const pendingWeeksCount = yearWeeks.filter(w => !w.isPaid).length;

  const MONTH_NAMES_ES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];

  // Filtered weeks based on weekStatusFilter, weekSearch, AND selectedYear
  const filteredWeeks = yearWeeks.filter((w) => {
    // 1. Status filter
    if (weekStatusFilter === 'Pendiente' && w.isPaid) return false;
    if (weekStatusFilter === 'Cobrado' && !w.isPaid) return false;

    // 2. Search query filter
    const rawQ = weekSearch.trim();
    if (rawQ) {
      const q = rawQ.toLowerCase();

      // Check month names from startDate and endDate
      const [sYear, sMonth] = (w.startDate || '').split('-');
      const [eYear, eMonth] = (w.endDate || '').split('-');
      const sMonthName = sMonth ? (MONTH_NAMES_ES[parseInt(sMonth, 10) - 1] || '') : '';
      const eMonthName = eMonth ? (MONTH_NAMES_ES[parseInt(eMonth, 10) - 1] || '') : '';

      // Direct ISO date in range check (e.g. YYYY-MM-DD)
      const isIsoDate = /^\d{4}-\d{2}(-\d{2})?$/.test(rawQ);
      let fallsInRange = false;
      if (isIsoDate && w.startDate && w.endDate && rawQ.length === 10) {
        fallsInRange = rawQ >= w.startDate && rawQ <= w.endDate;
      }

      const matchesSearch =
        fallsInRange ||
        (w.key && w.key.toLowerCase().includes(q)) ||
        (w.displayLabel && String(w.displayLabel).toLowerCase().includes(q)) ||
        `semana ${w.displayLabel || w.key}`.toLowerCase().includes(q) ||
        (w.startDate && w.startDate.toLowerCase().includes(q)) ||
        (w.endDate && w.endDate.toLowerCase().includes(q)) ||
        (sMonthName && sMonthName.includes(q)) ||
        (eMonthName && eMonthName.includes(q)) ||
        (w.orders && w.orders.some(o => 
          (o.work_date && o.work_date.toLowerCase().includes(q)) ||
          (o.job_id && String(o.job_id).toLowerCase().includes(q)) ||
          (o.address && o.address.toLowerCase().includes(q)) ||
          (o.city && o.city.toLowerCase().includes(q))
        ));

      if (!matchesSearch) return false;
    }

    return true;
  });

  // Active Cutoff Day & Year-Filtered Global Balance Metrics
  const activeCutoff = String(summaryData?.cutoffDay ?? summaryData?.summary?.cutoffDay ?? '0');
  
  const yearOrders = useMemo(() => {
    if (selectedYear === 'ALL') return orders;
    return orders.filter(o => o.work_date && o.work_date.startsWith(selectedYear));
  }, [orders, selectedYear]);

  const totalAllEarnings = yearOrders.filter(o => o.status === 'Completado').reduce((sum, o) => sum + (parseFloat(o.rate_calculated) || 0), 0);
  const totalPaid = yearOrders.filter(o => o.status === 'Completado' && o.payment_status === 'Cobrado').reduce((sum, o) => sum + (parseFloat(o.rate_calculated) || 0), 0);
  const totalPending = yearOrders.filter(o => o.status === 'Completado' && o.payment_status !== 'Cobrado').reduce((sum, o) => sum + (parseFloat(o.rate_calculated) || 0), 0);
  const totalFeetAll = yearOrders.filter(o => o.status !== 'No Realizado').reduce((sum, o) => sum + (parseFloat(o.drop_footage) || 0), 0);
  const completedOrdersCount = yearOrders.filter(o => o.status === 'Completado').length;

  // Formatting helpers for clean cockpit numbers
  const formatMoneyCompact = (amount) => {
    if (amount === undefined || amount === null || isNaN(amount)) return '$0.00';
    const num = Number(amount);
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
    if (num >= 10000) return `$${Math.round(num).toLocaleString('en-US')}`;
    return `$${num.toFixed(2)}`;
  };

  const getMoneyFontSize = (amount) => {
    const num = Number(amount) || 0;
    if (num >= 100000) return 'text-lg sm:text-xl';
    if (num >= 10000) return 'text-xl sm:text-2xl';
    return 'text-xl sm:text-2xl';
  };

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
        (o.raw_notes && o.raw_notes.toLowerCase().includes(q)) ||
        (o.obstacles && o.obstacles.toLowerCase().includes(q)) ||
        (o.premise_access && o.premise_access.toLowerCase().includes(q)) ||
        (cleanCable && cleanQ && cleanCable.includes(cleanQ));

      if (!matchesSearch) return false;
    }

    if (orderStatusFilter !== 'ALL' && o.status !== orderStatusFilter) return false;
    return true;
  });

  // Initiate or toggle payment status for a week
  const handleTogglePayment = async (w, targetStatus, e) => {
    if (e) e.stopPropagation();

    if (targetStatus === 'Cobrado') {
      // Abre el modal de confirmación con comprobante opcional
      setConfirmPaymentWeek(w);
      const existingReceipt = w.receipt_photo || (typeof window !== 'undefined' ? localStorage.getItem('receipt_' + w.key) : null);
      setReceiptPhotoPreview(existingReceipt || null);
      return;
    }

    const msg = `¿Revertir la Semana ${w.displayLabel || w.key} a PENDIENTE por cobrar?`;
    if (!confirm(msg)) return;

    setUpdatingWeekKey(w.key);
    try {
      const res = await fetch(`/api/weeks/${encodeURIComponent(w.key)}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_status: 'Pendiente' })
      });

      if (res.ok) {
        try {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('receipt_' + w.key);
          }
        } catch (e) {}
        if (selectedWeekModal && selectedWeekModal.key === w.key) {
          setSelectedWeekModal(null);
        }
        if (onRefresh) await onRefresh();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert('Error: ' + (errData.error || 'No se pudo actualizar'));
      }
    } catch (err) {
      alert('Error de red: ' + err.message);
    } finally {
      setUpdatingWeekKey(null);
    }
  };

  const handleConfirmPaymentWithReceipt = async () => {
    if (!confirmPaymentWeek) return;
    setSavingPayment(true);
    setUpdatingWeekKey(confirmPaymentWeek.key);
    try {
      if (receiptPhotoPreview) {
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem('receipt_' + confirmPaymentWeek.key, receiptPhotoPreview);
          }
        } catch (e) {
          console.warn('localStorage quota', e);
        }
      }
      const res = await fetch(`/api/weeks/${encodeURIComponent(confirmPaymentWeek.key)}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_status: 'Cobrado',
          receipt_photo: receiptPhotoPreview || null
        })
      });

      if (res.ok) {
        setConfirmPaymentWeek(null);
        setReceiptPhotoPreview(null);
        setSelectedWeekModal(null); // Cerrar tarjeta de detalle para que se vea reflejada como cobrada en la lista
        if (onRefresh) await onRefresh();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert('Error: ' + (errData.error || 'No se pudo actualizar'));
      }
    } catch (err) {
      alert('Error de red: ' + err.message);
    } finally {
      setSavingPayment(false);
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

    const remark = getOrderRemark(order);

    const text = `📋 *COMPROBANTE DE TRABAJO - XFINITY*
🔢 *Work Order #:* ${order.job_id}
📅 *Fecha Ejecución:* ${order.work_date}
📍 *Dirección:* ${order.address}${order.city ? `, ${order.city}` : ''}
📏 *Pies / Drop:* ${order.drop_footage} ft (${order.cable_type || 'RG-6'})
🚗 *Driveway:* ${hasDriveway ? 'Sí' : 'No'}
📝 *Observaciones / Acceso:* ${remark || '🟢 Acceso libre'}
📸 *Fotos de Evidencia:* ${order.photos_count || (order.photos ? order.photos.length : 0)} archivada(s)
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
            focusDateRequest={focusDateRequest}
          />
        </div>
      )}

      {/* SUBTAB 2: LISTADO DE CIERRES SEMANALES */}
      {subTab === 'weeks' && (
        <div className="space-y-3">
          {/* Card Principal Cockpit: Selector de Año/Período + Componentes de Pendiente y Cobrado */}
          <div className="bg-[#0f1722]/95 border border-white/10 rounded-3xl p-3.5 sm:p-4 space-y-3 shadow-xl backdrop-blur-xl">
            {/* Componente Selector de Año con flechas (circulado en su propio contenedor) */}
            <div className="flex items-center justify-between bg-[#131b26] px-3 py-1.5 rounded-2xl border border-white/10 shadow-xs">
              <button
                type="button"
                disabled={!canGoBackYear}
                onClick={handlePrevYear}
                className={`p-1 rounded-lg transition ${
                  canGoBackYear 
                    ? 'text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer active:scale-95' 
                    : 'text-slate-600 opacity-25 cursor-not-allowed'
                }`}
                title={canGoBackYear ? `Año anterior (${timelineYears[currentYearIndex - 1]})` : 'Sin años anteriores'}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-white font-mono uppercase tracking-wider">
                  {selectedYear === 'ALL' ? 'Todo el Historial' : `Año ${selectedYear}`}
                </span>
                <span className="text-[10.5px] text-cyan-400 font-mono font-medium">
                  • {yearWeeks.length} sem.
                </span>
                {selectedYear !== currentYear && (
                  <button
                    type="button"
                    onClick={() => setSelectedYear(currentYear)}
                    className="text-[9px] bg-cyan-950 text-cyan-300 border border-cyan-800 px-1.5 py-0.5 rounded-md font-bold hover:bg-cyan-900 cursor-pointer"
                  >
                    Ir a {currentYear}
                  </button>
                )}
              </div>

              <button
                type="button"
                disabled={!canGoForwardYear}
                onClick={handleNextYear}
                className={`p-1 rounded-lg transition ${
                  canGoForwardYear 
                    ? 'text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer active:scale-95' 
                    : 'text-slate-600 opacity-25 cursor-not-allowed'
                }`}
                title={canGoForwardYear ? (timelineYears[currentYearIndex + 1] === 'ALL' ? 'Todo el Historial' : `Año ${timelineYears[currentYearIndex + 1]}`) : 'Fin del historial'}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Los dos componentes exactos de Pendiente y Cobrado (idénticos a antes, dentro de la misma tarjeta) */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-[#131b26] border border-amber-500/30 rounded-2xl p-3 shadow-lg space-y-1">
                <div className="flex items-center justify-between text-amber-400 text-[10px] font-bold uppercase tracking-wider">
                  <span>Pendiente</span>
                  <Clock className="h-3.5 w-3.5" />
                </div>
                <div className={`${getMoneyFontSize(totalPendingWeeks)} font-black text-amber-400 font-mono leading-none drop-shadow-[0_0_8px_rgba(251,191,36,0.25)]`}>
                  {formatMoneyCompact(totalPendingWeeks)}
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
                <div className={`${getMoneyFontSize(totalPaidWeeks)} font-black text-emerald-400 font-mono leading-none drop-shadow-[0_0_8px_rgba(52,211,153,0.35)]`}>
                  {formatMoneyCompact(totalPaidWeeks)}
                </div>
                <p className="text-[10px] text-slate-400 truncate font-medium">
                  {paidWeeksCount} semana{paidWeeksCount !== 1 ? 's' : ''} liquidada{paidWeeksCount !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </div>

          {/* 2. Buscador de Semanas por Fecha / Término */}
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar semana por fecha (ej. 2026, 11, Nov), # semana..."
              value={weekSearch}
              onChange={(e) => setWeekSearch(e.target.value)}
              className="w-full bg-[#131b26] border border-white/10 rounded-2xl pl-9 pr-8 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition shadow-md"
            />
            {weekSearch && (
              <button
                type="button"
                onClick={() => setWeekSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
                title="Limpiar búsqueda"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* 3. Selector de Filtro: Todos, Pendiente, Cobrado */}
          <div className="grid grid-cols-3 gap-1 bg-[#0f1722]/90 p-1 rounded-2xl border border-white/10 text-[11px] font-bold text-center shadow-md">
            <button
              type="button"
              onClick={() => setWeekStatusFilter('ALL')}
              className={`py-1.5 px-2 rounded-xl transition cursor-pointer select-none ${
                weekStatusFilter === 'ALL'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm font-black'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent font-medium'
              }`}
            >
              Todos ({weeks.length})
            </button>
            <button
              type="button"
              onClick={() => setWeekStatusFilter('Pendiente')}
              className={`py-1.5 px-2 rounded-xl transition cursor-pointer select-none ${
                weekStatusFilter === 'Pendiente'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm font-black'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent font-medium'
              }`}
            >
              Pendiente ({pendingWeeksCount})
            </button>
            <button
              type="button"
              onClick={() => setWeekStatusFilter('Cobrado')}
              className={`py-1.5 px-2 rounded-xl transition cursor-pointer select-none ${
                weekStatusFilter === 'Cobrado'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm font-black'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent font-medium'
              }`}
            >
              Cobrado ({paidWeeksCount})
            </button>
          </div>

          {/* 4. Lista de Semanas / Historial */}
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
          ) : filteredWeeks.length === 0 ? (
            <div className="bg-[#131b26] border border-white/10 rounded-2xl p-6 text-center space-y-2 select-none shadow-md">
              <p className="text-xs font-bold text-slate-300">
                No se encontraron semanas que coincidan con la búsqueda o filtro
              </p>
              <p className="text-[11px] text-slate-500">
                Prueba buscando por otra fecha, número de semana o limpia los filtros.
              </p>
              {(weekSearch || weekStatusFilter !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setWeekSearch('');
                    setWeekStatusFilter('ALL');
                  }}
                  className="mt-1 px-3 py-1 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 border border-cyan-500/30 rounded-xl text-[11px] font-bold transition cursor-pointer"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          ) : (
            filteredWeeks.map((w) => {
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
                        <div className="flex items-center gap-1.5">
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
                          {(() => {
                            const weekReceipt = w.receipt_photo || (typeof window !== 'undefined' ? localStorage.getItem('receipt_' + w.key) : null);
                            if (!weekReceipt) return null;
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedReceiptModal({ photo: weekReceipt, week: w });
                                }}
                                className="px-2 py-1 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 transition active:scale-90 cursor-pointer shadow-2xs"
                                title="Ver comprobante de liquidación / cheque"
                              >
                                <Paperclip className="h-3 w-3 stroke-[2.2]" />
                                <span className="text-[10px] font-black uppercase">Recibo</span>
                              </button>
                            );
                          })()}
                        </div>
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
                  Balance de Contabilidad
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-[#131b26] px-2 py-0.5 rounded-xl border border-white/10 shadow-xs">
                <Calendar className="h-3 w-3 text-cyan-400 shrink-0" />
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="bg-transparent text-xs font-black text-cyan-300 focus:outline-none cursor-pointer pr-1"
                >
                  {availableYears.map(y => (
                    <option key={y} value={y} className="bg-[#131b26] text-white">
                      Año {y}
                    </option>
                  ))}
                  <option value="ALL" className="bg-[#131b26] text-white">
                    Histórico Total
                  </option>
                </select>
              </div>
            </div>

            {/* 2 Big Cards: Pendiente por Cobrar & Total Cobrado */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-[#131b26] border border-amber-500/30 rounded-2xl p-3 space-y-1 relative overflow-hidden shadow-md">
                <div className="flex items-center justify-between text-amber-400 text-[10px] font-bold uppercase tracking-wider">
                  <span>Pendiente</span>
                  <Clock className="h-3.5 w-3.5" />
                </div>
                <div className={`${getMoneyFontSize(totalPending)} font-black text-amber-300 font-mono leading-none pt-0.5 drop-shadow-[0_0_8px_rgba(251,191,36,0.2)]`}>
                  {formatMoneyCompact(totalPending)}
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
                <div className={`${getMoneyFontSize(totalPaid)} font-black text-emerald-400 font-mono leading-none pt-0.5 drop-shadow-[0_0_8px_rgba(52,211,153,0.2)]`}>
                  {formatMoneyCompact(totalPaid)}
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
                  <span className="font-bold text-[11px]">{selectedYear === 'ALL' ? 'Producción Total Histórica' : `Producción Año ${selectedYear}`}</span>
                </div>
                <span className="font-black text-white font-mono text-sm">
                  {formatMoneyCompact(totalAllEarnings)}
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

          {/* Filtros de Estado Exclusivos Cockpit (Segmented Capsule idéntico a Cierre Diario) */}
          <div className="grid grid-cols-4 gap-1 bg-[#0f1722]/90 p-1 rounded-2xl border border-white/10 text-[10px] font-bold text-center shadow-md">
            <button
              type="button"
              onClick={() => setOrderStatusFilter('ALL')}
              className={`py-1.5 rounded-xl transition font-black ${
                orderStatusFilter === 'ALL'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Todos ({orders.length})
            </button>
            <button
              type="button"
              onClick={() => setOrderStatusFilter('Pendiente')}
              className={`py-1.5 rounded-xl transition font-black ${
                orderStatusFilter === 'Pendiente'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Pendientes ({orders.filter(o => o.status === 'Pendiente').length})
            </button>
            <button
              type="button"
              onClick={() => setOrderStatusFilter('Completado')}
              className={`py-1.5 rounded-xl transition font-black ${
                orderStatusFilter === 'Completado'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Hechos ({orders.filter(o => o.status === 'Completado').length})
            </button>
            <button
              type="button"
              onClick={() => setOrderStatusFilter('No Realizado')}
              className={`py-1.5 rounded-xl transition font-black ${
                orderStatusFilter === 'No Realizado'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Cancelados ({orders.filter(o => o.status === 'No Realizado').length})
            </button>
          </div>

          {/* Listado de Órdenes Filtradas */}
          {filteredAllOrders.length === 0 ? (
            <div className="bg-[#131b26] border border-white/10 rounded-2xl p-8 text-center text-slate-400 text-xs shadow-md">
              No se encontraron trabajos con los filtros actuales.
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredAllOrders.map((order, idx) => (
                <HistoricalOrderCard
                  key={order.id}
                  order={order}
                  idx={idx}
                  onOpenPhotos={onOpenPhotos}
                  onEditOrder={setEditingOrder}
                  onCopyClaim={copySingleJobClaim}
                  onShareReport={setReportOrder}
                  onSelectPhoto={setSelectedPhoto}
                  isCopied={copiedJobId === order.id}
                />
              ))}
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
            onOpenPhotos={onOpenPhotos}
            onOrderUpdated={onOrderUpdated}
            onUpdateOrders={onUpdateOrders}
          />
        </div>
      )}

      {/* COMPONENTE SUPERPUESTO (MODAL DETALLADO DE LA SEMANA CON DISEÑO COCKPIT) */}
      {selectedWeekModal && (() => {
        const modalReceiptPhoto = selectedWeekModal.receipt_photo || (typeof window !== 'undefined' ? localStorage.getItem('receipt_' + selectedWeekModal.key) : null);
        return (
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
              <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-white dark:bg-slate-900/70 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-bold shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider font-mono truncate">
                      Semana {selectedWeekModal.displayLabel || selectedWeekModal.key}
                    </h3>
                    <p className="text-[11px] text-cyan-400/90 font-mono font-medium flex items-center gap-1.5 truncate">
                      <Calendar className="w-3 h-3 text-cyan-400/70 shrink-0" />
                      <span>{selectedWeekModal.startDate} al {selectedWeekModal.endDate}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-2 shrink-0">
                  {/* Botón Comprobante en Header */}
                  {modalReceiptPhoto && (
                    <button
                      type="button"
                      onClick={() => setSelectedReceiptModal({ photo: modalReceiptPhoto, week: selectedWeekModal })}
                      className="h-8 px-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 transition active:scale-95 shadow-xs cursor-pointer"
                      title="Ver comprobante de pago o cheque de esta semana"
                    >
                      <Paperclip className="h-3.5 w-3.5 stroke-[2.2]" />
                      <span className="text-[10px] font-black uppercase tracking-wider">Recibo</span>
                    </button>
                  )}

                  {/* Botón Cerrar */}
                  <button
                    type="button"
                    onClick={() => setSelectedWeekModal(null)}
                    className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                    title="Cerrar ventana"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
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

            {/* Banner Destacado para el Comprobante Semanal (Si existe foto o para adjuntarla) */}
            {modalReceiptPhoto ? (
              <div 
                onClick={() => setSelectedReceiptModal({ photo: modalReceiptPhoto, week: selectedWeekModal })}
                className="mx-4 mt-3 p-2.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/35 hover:border-emerald-500/60 flex items-center justify-between gap-2.5 cursor-pointer transition active:scale-[0.99] shadow-md select-none shrink-0"
                title="Toca para ver el comprobante en pantalla completa"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/35 flex items-center justify-center text-emerald-400 shrink-0">
                    <Paperclip className="h-4 w-4 stroke-[2.2]" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-black text-emerald-300 block truncate leading-tight">
                      Comprobante de Pago Archivado
                    </span>
                    <span className="text-[10px] text-slate-400 block truncate">
                      Cheque / constancia de cobro semanal • Toca para abrir
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500 text-slate-950 font-black text-[11px] shadow-sm shrink-0">
                  <Eye className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>Ver Recibo</span>
                </div>
              </div>
            ) : selectedWeekModal.isPaid ? (
              <div className="mx-4 mt-2.5 px-3 py-2 rounded-2xl bg-slate-900/60 border border-white/10 flex items-center justify-between shrink-0">
                <span className="text-[10px] text-slate-400 font-medium">
                  Semana cobrada sin foto de cheque
                </span>
                <label className="text-[10px] font-bold text-cyan-300 hover:text-white flex items-center gap-1 cursor-pointer bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 px-2 py-0.5 rounded-lg transition shadow-2xs">
                  <Paperclip className="h-2.5 w-2.5" />
                  <span>+ Subir Comprobante</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = async () => {
                          const photoData = reader.result;
                          try {
                            if (typeof window !== 'undefined') {
                              localStorage.setItem('receipt_' + selectedWeekModal.key, photoData);
                            }
                          } catch (err) {
                            console.warn('localStorage quota', err);
                          }
                          await fetch(`/api/weeks/${encodeURIComponent(selectedWeekModal.key)}/receipt`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ receipt_photo: photoData })
                          });
                          setSelectedWeekModal(prev => ({ ...prev, receipt_photo: photoData }));
                          if (onRefresh) await onRefresh();
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
              </div>
            ) : null}

            {/* Cuerpo del Modal con Scroll */}
            <div className="p-3.5 overflow-y-auto space-y-3 flex-1 min-h-0 scrollbar-none">
              
              {/* Listado Completo de Trabajos */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <span>Historial de Trabajos</span>
                    <span className="text-cyan-400 font-mono">({selectedWeekModal.orders.length})</span>
                  </span>
                  {selectedWeekModal.isPaid ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-black flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Cobrado
                      </span>
                      {modalReceiptPhoto && (
                        <button
                          type="button"
                          onClick={() => setSelectedReceiptModal({ photo: modalReceiptPhoto, week: selectedWeekModal })}
                          className="text-[10px] text-cyan-300 bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 hover:bg-cyan-500/25 transition cursor-pointer"
                          title="Ver foto del cheque / comprobante de liquidación"
                        >
                          <Paperclip className="h-3 w-3 stroke-[2.2]" />
                          <span>Comprobante</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 rounded-full font-black flex items-center gap-1 shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      Pendiente
                    </span>
                  )}
                </div>

                {selectedWeekModal.orders.map((order, idx) => (
                  <HistoricalOrderCard
                    key={order.id}
                    order={order}
                    idx={idx}
                    onOpenPhotos={onOpenPhotos}
                    onEditOrder={setEditingOrder}
                    onCopyClaim={copySingleJobClaim}
                    onShareReport={setReportOrder}
                    onSelectPhoto={setSelectedPhoto}
                    isCopied={copiedJobId === order.id}
                  />
                ))}
              </div>
            </div>

            {/* Footer con Acciones Rápidas: Copiar Auditoría y Confirmar Cobro (mismo ancho y texto lineal) */}
            <div className="px-4 py-3 border-t border-white/10 bg-slate-900/90 shrink-0">
              <div className="grid grid-cols-2 gap-2 w-full">
                <button
                  type="button"
                  onClick={() => copyAuditStatement(selectedWeekModal)}
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
                    onClick={() => handleTogglePayment(selectedWeekModal, 'Pendiente')}
                    className="w-full py-2 px-2 bg-emerald-500/15 hover:bg-rose-500/15 text-emerald-300 hover:text-rose-300 border border-emerald-500/30 hover:border-rose-500/30 font-bold text-xs rounded-xl flex items-center justify-center gap-1 shadow-xs transition active:scale-95 cursor-pointer truncate"
                    title="Tocar para marcar como pendiente"
                  >
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate whitespace-nowrap">Cobrado: ${selectedWeekModal.totalEarnings.toFixed(2)}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleTogglePayment(selectedWeekModal, 'Cobrado')}
                    className="w-full py-2 px-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1 shadow-md shadow-emerald-500/20 transition active:scale-95 cursor-pointer truncate"
                    title="Confirmar cobro de la semana"
                  >
                    <DollarSign className="h-3.5 w-3.5 stroke-[3] shrink-0" />
                    <span className="truncate whitespace-nowrap">Cobrar: ${selectedWeekModal.totalEarnings.toFixed(2)}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ); })()}

      {/* FULLSCREEN PHOTO PREVIEW MODAL (CON ZOOM Y PAN INTERACTIVO) */}
      {selectedPhoto && (
        <ZoomableImageViewer
          src={selectedPhoto}
          alt="Evidencia"
          title="Evidencia de Trabajo"
          onClose={() => setSelectedPhoto(null)}
          extraFooterActions={
            <button
              type="button"
              onClick={() => setSelectedPhoto(null)}
              className="px-6 py-2 bg-[#16202c] hover:bg-[#1e2b3b] text-white border border-white/15 rounded-xl text-xs font-bold transition shadow-xl active:scale-95 cursor-pointer flex items-center gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              <span>Cerrar</span>
            </button>
          }
        />
      )}

      {/* MODAL: CONFIRMAR COBRO SEMANAL CON COMPROBANTE OPCIONAL */}
      {confirmPaymentWeek && (
        <div
          className="fixed inset-0 z-[85] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
          onClick={() => !savingPayment && setConfirmPaymentWeek(null)}
        >
          <div
            className="bg-[#131b26] border border-white/10 rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-500/15 text-emerald-400 rounded-xl border border-emerald-500/30">
                  <DollarSign className="h-5 w-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">
                    Confirmar Cobro
                  </h3>
                  <p className="text-[10.5px] text-slate-400 font-medium">
                    Semana {confirmPaymentWeek.displayLabel || confirmPaymentWeek.key}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={savingPayment}
                onClick={() => setConfirmPaymentWeek(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Monto de la semana */}
            <div className="bg-[#0f1722] p-3 rounded-2xl border border-white/5 flex items-center justify-between">
              <span className="text-xs text-slate-300 font-semibold">Total a Liquidar</span>
              <span className="text-xl font-black text-emerald-400 font-mono">
                ${confirmPaymentWeek.totalEarnings.toFixed(2)}
              </span>
            </div>

            {/* Comprobante Opcional (Foto / Recibo / Cheque) */}
            <div className="space-y-1.5">
              <label className="text-[10.5px] font-bold text-slate-300 uppercase tracking-wider block">
                Comprobante / Cheque <span className="text-slate-500 font-normal lowercase">(opcional)</span>
              </label>

              {receiptPhotoPreview ? (
                <div className="relative rounded-2xl overflow-hidden border border-emerald-500/30 bg-[#0f1722] p-2 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={receiptPhotoPreview}
                      alt="Comprobante"
                      className="h-12 w-12 object-cover rounded-xl border border-white/10 shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                        <Check className="h-3 w-3 stroke-[3]" /> Comprobante listo
                      </span>
                      <span className="text-[10px] text-slate-400 block truncate">
                        Se guardará con la semana
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReceiptPhotoPreview(null)}
                    className="p-1 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                    title="Quitar foto"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="border border-dashed border-white/15 hover:border-cyan-400/50 rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 cursor-pointer bg-white/5 hover:bg-white/10 transition text-slate-300 hover:text-white group">
                  <Camera className="h-5 w-5 text-cyan-400 group-hover:scale-110 transition" />
                  <span className="text-xs font-bold text-slate-200">Tomar o subir foto</span>
                  <span className="text-[9.5px] text-slate-400">Cheque, recibo o colilla de pago</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        const r = new FileReader();
                        r.onload = () => setReceiptPhotoPreview(r.result);
                        r.readAsDataURL(f);
                      }
                    }}
                  />
                </label>
              )}
            </div>

            {/* Botones de Acción */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={savingPayment}
                onClick={() => setConfirmPaymentWeek(null)}
                className="py-2.5 px-3 bg-white/10 hover:bg-white/15 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingPayment}
                onClick={handleConfirmPaymentWithReceipt}
                className="py-2.5 px-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-emerald-500/25 transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check className="h-4 w-4 stroke-[3]" />
                <span>{savingPayment ? 'Guardando...' : 'Confirmar Cobro'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FULLSCREEN: VISOR DE COMPROBANTE DE PAGO (CON ZOOM Y PAN INTERACTIVO) */}
      {selectedReceiptModal && (
        <ZoomableImageViewer
          src={selectedReceiptModal.photo}
          alt="Comprobante de Pago"
          title={`Comprobante • Semana ${selectedReceiptModal.week?.displayLabel || selectedReceiptModal.week?.key}`}
          onClose={() => setSelectedReceiptModal(null)}
          extraFooterActions={
            <button
              type="button"
              onClick={() => setSelectedReceiptModal(null)}
              className="px-6 py-2 bg-[#16202c] hover:bg-[#1e2b3b] text-white border border-white/15 rounded-xl text-xs font-bold transition shadow-xl active:scale-95 cursor-pointer flex items-center gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              <span>Cerrar</span>
            </button>
          }
        />
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
          initialMode="edit"
          onClose={() => setEditingOrder(null)}
          onJobUpdated={() => {
            setEditingOrder(null);
            if (onRefresh) onRefresh();
            if (onOrderUpdated) onOrderUpdated();
          }}
          onJobDeleted={() => {
            setEditingOrder(null);
            if (onRefresh) onRefresh();
            if (onOrderUpdated) onOrderUpdated();
          }}
        />
      )}
    </div>
  );
}
