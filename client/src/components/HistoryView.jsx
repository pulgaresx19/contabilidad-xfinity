import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, CheckCircle2, Clock, Share2, Check, CheckCheck,
  Trash2, ExternalLink, Image as ImageIcon, X, DollarSign, 
  Ruler, ChevronRight, ChevronLeft, Copy, Camera, AlertCircle, FileText, 
  ShieldAlert, CheckCircle, Search, Filter, Sparkles, MapPin, Phone, ShieldCheck, AlertTriangle,
  BarChart3, Sun, Pencil, Briefcase, Paperclip, ChevronDown, Eye, Download
} from 'lucide-react';
import ShareReportModal from './ShareReportModal';
import TodayView from './TodayView';
import MonthlyView from './MonthlyView';
import EditJobModal from './EditJobModal';
import HistoricalOrderCard from './HistoricalOrderCard';
import ZoomableImageViewer from './ZoomableImageViewer';
import { getOrderRemark } from '../utils/remarkUtils';
import { stampReceiptPhoto } from '../utils/receiptStamper';
import { formatAdjustmentReason } from '../utils/adjustmentUtils';

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
  const [receiptFileName, setReceiptFileName] = useState('');
  const [receiptIsPdf, setReceiptIsPdf] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconciliationResult, setReconciliationResult] = useState(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [selectedReceiptModal, setSelectedReceiptModal] = useState(null);
  const [selectedPdfModal, setSelectedPdfModal] = useState(null);

  // Modal y Filtro de Constancia General de Recibos
  const [showReceiptsModal, setShowReceiptsModal] = useState(false);
  const [receiptDateFilter, setReceiptDateFilter] = useState('');

  const weeks = summaryData?.weeks || [];

  // Recopilar todos los recibos de cobro de las semanas con comprobante
  const allWeeklyReceipts = useMemo(() => {
    return weeks
      .map(w => {
        const photo = w.receipt_photo;
        const filename = w.receipt_filename;
        if (!photo && !filename) return null;
        const isPdf = Boolean(
          photo?.startsWith('data:application/pdf') ||
          photo?.endsWith('.pdf') ||
          filename?.toLowerCase().endsWith('.pdf')
        );
        return {
          ...w,
          photo,
          filename,
          isPdf
        };
      })
      .filter(Boolean);
  }, [weeks]);

  // Filtrar los recibos por fecha escrita por el usuario
  const filteredReceipts = useMemo(() => {
    if (!receiptDateFilter || !receiptDateFilter.trim()) {
      return allWeeklyReceipts;
    }
    const q = receiptDateFilter.toLowerCase().trim();
    return allWeeklyReceipts.filter(r => {
      const weekLabel = (r.displayLabel || r.key || '').toLowerCase();
      const start = (r.startDate || '').toLowerCase();
      const end = (r.endDate || '').toLowerCase();
      return weekLabel.includes(q) || start.includes(q) || end.includes(q);
    });
  }, [allWeeklyReceipts, receiptDateFilter]);

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
  const totalFeetAll = yearOrders.filter(o => o.status === 'Completado').reduce((sum, o) => sum + (parseFloat(o.drop_footage) || 0), 0);
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

  // Filtered list of historical orders for the selected year with smart cable search (RG6 / RG11)
  const filteredAllOrders = yearOrders.filter((o) => {
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
      // Abre el modal de confirmación con comprobante opcional (foto o PDF)
      setConfirmPaymentWeek(w);
      const existingReceipt = w.receipt_photo || null;
      const existingFilename = w.receipt_filename || '';
      setReceiptPhotoPreview(existingReceipt);
      setReceiptFileName(existingFilename);
      setReceiptIsPdf(Boolean(
        existingReceipt?.startsWith('data:application/pdf') ||
        existingReceipt?.endsWith('.pdf') ||
        existingFilename?.toLowerCase().endsWith('.pdf')
      ));
      try {
        const existingAudit = w.audit_summary ? (typeof w.audit_summary === 'string' ? JSON.parse(w.audit_summary) : w.audit_summary) : null;
        setReconciliationResult(existingAudit || null);
      } catch (e) {
        setReconciliationResult(null);
      }
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

  // Eliminar permanentemente la constancia o comprobante de una semana
  const handleDeleteReceipt = async (weekKey, e) => {
    if (e) e.stopPropagation();
    const key = weekKey || confirmPaymentWeek?.key;
    if (!key) return;

    if (!confirm(`¿Eliminar permanentemente este comprobante / reporte de la Semana ${key}?`)) return;

    try {
      await fetch(`/api/weeks/${encodeURIComponent(key)}/receipt`, {
        method: 'DELETE'
      });
      if (typeof window !== 'undefined') {
        localStorage.removeItem('receipt_' + key);
        localStorage.removeItem('receipt_fn_' + key);
      }
      if (confirmPaymentWeek && confirmPaymentWeek.key === key) {
        setReceiptPhotoPreview(null);
        setReceiptFileName('');
        setReceiptIsPdf(false);
        setReconciliationResult(null);
      }
      if (selectedPdfModal && selectedPdfModal.week?.key === key) {
        setSelectedPdfModal(null);
      }
      if (selectedReceiptModal && selectedReceiptModal.week?.key === key) {
        setSelectedReceiptModal(null);
      }
      if (onRefresh) await onRefresh();
    } catch (err) {
      alert('Error al eliminar comprobante: ' + err.message);
    }
  };

  const handleConfirmPaymentWithReceipt = async () => {
    if (!confirmPaymentWeek) return;
    setSavingPayment(true);
    setUpdatingWeekKey(confirmPaymentWeek.key);
    try {
      const res = await fetch(`/api/weeks/${encodeURIComponent(confirmPaymentWeek.key)}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_status: 'Cobrado',
          receipt_photo: receiptPhotoPreview || null,
          receipt_filename: receiptPhotoPreview ? (receiptFileName || null) : null,
          audit_summary: receiptPhotoPreview ? (reconciliationResult || null) : null
        })
      });

      if (res.ok) {
        if (!receiptPhotoPreview && typeof window !== 'undefined') {
          localStorage.removeItem('receipt_' + confirmPaymentWeek.key);
          localStorage.removeItem('receipt_fn_' + confirmPaymentWeek.key);
        }
        setConfirmPaymentWeek(null);
        setReceiptPhotoPreview(null);
        setReceiptFileName('');
        setReceiptIsPdf(false);
        setReconciliationResult(null);
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

  const handleReconcileWithAi = async () => {
    if (!confirmPaymentWeek || !receiptPhotoPreview) return;
    setReconciling(true);
    try {
      const res = await fetch(`/api/weeks/${encodeURIComponent(confirmPaymentWeek.key)}/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: {
            data: receiptPhotoPreview,
            mimeType: receiptIsPdf ? 'application/pdf' : 'image/jpeg'
          },
          filename: receiptFileName || (receiptIsPdf ? 'comprobante.pdf' : 'comprobante.jpg')
        })
      });
      const data = await res.json();
      if (data.ok && data.data) {
        setReconciliationResult(data.data);
      } else {
        alert(data.error || 'No se pudo completar la auditoría con IA.');
      }
    } catch (err) {
      alert('Error al conectar con AuraCore-AI: ' + err.message);
    } finally {
      setReconciling(false);
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
        ? ` [AJUSTE SUPERVISOR: ${o.manual_adjustment > 0 ? `+$${o.manual_adjustment}` : `-$${Math.abs(o.manual_adjustment)}`} (${formatAdjustmentReason(o.adjustment_reason) || 'Inconsistencia'})]`
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
    <div className="space-y-4 max-w-md sm:max-w-lg mx-auto w-full pb-20">
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

            {/* BOTÓN CONSTANCIA GENERAL DE RECIBOS DE COBRO (ABRE COMPONENTE / MODAL) */}
            <button
              type="button"
              onClick={() => setShowReceiptsModal(true)}
              className="w-full bg-[#131b26] hover:bg-[#182332] border border-white/10 hover:border-cyan-500/35 rounded-2xl p-3 shadow-md flex items-center justify-between transition cursor-pointer select-none group active:scale-[0.99]"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0 shadow-xs group-hover:bg-emerald-500/25 transition">
                  <Paperclip className="w-4 h-4 stroke-[2.2]" />
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-white group-hover:text-cyan-400 transition">
                      Constancia de Recibos
                    </span>
                    <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded-md border border-emerald-500/20">
                      {allWeeklyReceipts.length}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Historial de cheques y recibos de cobro
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 text-slate-400 group-hover:text-cyan-400 transition">
                <span className="text-[11px] font-bold">Ver</span>
                <ChevronRight className="h-4 w-4" />
              </div>
            </button>
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
              Todos ({yearWeeks.length})
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
                  {completedOrdersCount} de {yearOrders.length}
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
              Todos ({yearOrders.length})
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
              Pendientes ({yearOrders.filter(o => o.status === 'Pendiente').length})
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
              Hechos ({yearOrders.filter(o => o.status === 'Completado').length})
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
              Cancelados ({yearOrders.filter(o => o.status === 'No Realizado').length})
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
              <div className="px-4 sm:px-5 py-3 border-b border-white/10 flex items-center justify-between bg-slate-900/80 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-bold shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-white uppercase tracking-wider font-mono truncate">
                      Semana {selectedWeekModal.displayLabel || selectedWeekModal.key}
                    </h3>
                    <p className="text-[11px] text-cyan-400/90 font-mono font-medium flex items-center gap-1.5 truncate">
                      <Calendar className="w-3 h-3 text-cyan-400/70 shrink-0" />
                      <span>{selectedWeekModal.startDate} al {selectedWeekModal.endDate}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-2 shrink-0">
                  {/* Botón Comprobante en Header (Solo icono cuadrado sin texto para evitar solapamientos) */}
                  {modalReceiptPhoto ? (
                    <button
                      type="button"
                      onClick={() => {
                        const isPdf = modalReceiptPhoto.startsWith('data:application/pdf') || modalReceiptPhoto.endsWith('.pdf') || selectedWeekModal.receipt_filename?.toLowerCase().endsWith('.pdf');
                        if (isPdf) {
                          setSelectedPdfModal({ url: modalReceiptPhoto, filename: selectedWeekModal.receipt_filename, week: selectedWeekModal });
                        } else {
                          setSelectedReceiptModal({ photo: modalReceiptPhoto, week: selectedWeekModal });
                        }
                      }}
                      className="h-8 w-8 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 flex items-center justify-center transition active:scale-95 shadow-xs cursor-pointer shrink-0"
                      title="Ver comprobante de pago o cheque de esta semana"
                    >
                      <Paperclip className="h-4 w-4 stroke-[2.2]" />
                    </button>
                  ) : selectedWeekModal.isPaid ? (
                    <label
                      className="h-8 w-8 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-400 hover:text-slate-200 border border-white/10 flex items-center justify-center transition active:scale-95 shadow-xs cursor-pointer shrink-0"
                      title="Adjuntar comprobante (Foto o PDF)"
                    >
                      <Paperclip className="h-4 w-4 stroke-[1.8]" />
                      <input
                        type="file"
                        accept="image/*,application/pdf,.pdf"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            try {
                              const isPdfFile = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
                              let photoData = null;
                              if (isPdfFile) {
                                const r = new FileReader();
                                photoData = await new Promise((resolve) => {
                                  r.onload = () => resolve(r.result);
                                  r.readAsDataURL(file);
                                });
                              } else {
                                photoData = await stampReceiptPhoto(file, { week: selectedWeekModal });
                              }
                              await fetch(`/api/weeks/${encodeURIComponent(selectedWeekModal.key)}/receipt`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ receipt_photo: photoData, receipt_filename: file.name })
                              });
                              setSelectedWeekModal(prev => ({ ...prev, receipt_photo: photoData, receipt_filename: file.name }));
                              if (onRefresh) await onRefresh();
                            } catch (err) {
                              console.warn('Error al guardar comprobante:', err);
                            }
                          }
                          e.target.value = '';
                        }}
                      />
                    </label>
                  ) : null}

                  {/* Botón Cerrar */}
                  <button
                    type="button"
                    onClick={() => setSelectedWeekModal(null)}
                    className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition cursor-pointer"
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

            {/* Cuerpo del Modal con Scroll */}
            <div className="p-3.5 overflow-y-auto space-y-3 flex-1 min-h-0 scrollbar-none">
              
              {/* Listado Completo de Trabajos */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <span>Historial de Trabajos</span>
                    <span className="text-cyan-400 font-mono">({selectedWeekModal.orders.length})</span>
                  </span>
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

      {/* MODAL: CONFIRMAR COBRO SEMANAL CON COMPROBANTE (FOTO O PDF) Y AUDITORÍA IA */}
      {confirmPaymentWeek && (
        <div
          className="fixed inset-0 z-[85] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in"
          onClick={() => !savingPayment && !reconciling && setConfirmPaymentWeek(null)}
        >
          <div
            className="bg-[#101722] border border-white/10 rounded-3xl p-4 sm:p-5 max-w-sm w-full space-y-3.5 shadow-2xl overflow-y-auto max-h-[90dvh]"
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
                  <p className="text-[10.5px] text-slate-400 font-medium font-mono">
                    Semana {confirmPaymentWeek.displayLabel || confirmPaymentWeek.key}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={savingPayment || reconciling}
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

            {/* Comprobante Opcional (Foto / Recibo / Reporte PDF) */}
            <div className="space-y-2">
              <label className="text-[10.5px] font-bold text-slate-300 uppercase tracking-wider block">
                Comprobante / Reporte Semanal <span className="text-slate-500 font-normal lowercase">(opcional)</span>
              </label>

              {receiptPhotoPreview ? (
                <div className={`relative rounded-2xl overflow-hidden border p-3 flex items-center justify-between shadow-lg ${
                  receiptIsPdf
                    ? 'border-rose-500/40 bg-gradient-to-r from-rose-950/30 to-[#0f1722]'
                    : 'border-emerald-500/40 bg-gradient-to-r from-emerald-950/20 to-[#0f1722]'
                }`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    {receiptIsPdf ? (
                      <div className="h-11 w-11 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center shrink-0 shadow-inner">
                        <FileText className="h-5 w-5 stroke-[2.2]" />
                      </div>
                    ) : (
                      <img
                        src={receiptPhotoPreview}
                        alt="Comprobante"
                        className="h-11 w-11 object-cover rounded-xl border border-white/10 shrink-0 shadow-inner"
                      />
                    )}
                    <div className="min-w-0">
                      <span className={`text-xs font-bold flex items-center gap-1 truncate ${
                        receiptIsPdf ? 'text-rose-300' : 'text-emerald-400'
                      }`}>
                        <Check className="h-3 w-3 stroke-[3] text-emerald-400 shrink-0" />
                        <span className="truncate">{receiptFileName || (receiptIsPdf ? 'Reporte_Nomina.pdf' : 'Foto comprobante')}</span>
                      </span>
                      <span className="text-[10px] text-slate-400 block truncate font-medium">
                        {receiptIsPdf ? 'Documento PDF listo para auditar con IA' : 'Foto estampada con fecha'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (confirmPaymentWeek?.key) {
                          handleDeleteReceipt(confirmPaymentWeek.key);
                        } else {
                          setReceiptPhotoPreview(null);
                          setReceiptFileName('');
                          setReceiptIsPdf(false);
                          setReconciliationResult(null);
                        }
                      }}
                      className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-200 border border-rose-500/30 transition cursor-pointer"
                      title="Eliminar este comprobante"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Opción Principal Destacada: Subir Reporte PDF (Daily Tech Summary / Nómina) */}
                  <label className="border-2 border-dashed border-rose-500/40 hover:border-rose-400 rounded-2xl p-3 flex items-center justify-between cursor-pointer bg-gradient-to-r from-rose-500/10 via-[#131b26] to-[#101722] hover:bg-rose-500/15 transition text-slate-200 group select-none shadow-md active:scale-[0.99]">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 group-hover:scale-110 transition shrink-0">
                        <FileText className="w-5 h-5 stroke-[2.2]" />
                      </div>
                      <div className="min-w-0 text-left">
                        <span className="text-xs font-black text-rose-300 uppercase tracking-wide block truncate">
                          Subir Reporte PDF
                        </span>
                        <span className="text-[10px] text-slate-400 block truncate mt-0.5">
                          Daily Tech Summary / Nómina semanal para auditar con IA
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 px-2.5 py-1 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10.5px] font-bold group-hover:bg-rose-500/30 transition">
                      Elegir PDF
                    </div>
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setReceiptFileName(f.name || 'reporte.pdf');
                          setReceiptIsPdf(true);
                          setReconciliationResult(null);
                          const r = new FileReader();
                          r.onload = () => setReceiptPhotoPreview(r.result);
                          r.readAsDataURL(f);
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>

                  {/* Opciones secundarias: Galería y Cámara */}
                  <div className="grid grid-cols-2 gap-2">
                    {/* Galería */}
                    <label className="border border-dashed border-white/15 hover:border-cyan-400/50 rounded-2xl p-2.5 flex items-center justify-center gap-2 cursor-pointer bg-white/5 hover:bg-white/10 transition text-slate-300 hover:text-white group select-none active:scale-95 text-center">
                      <ImageIcon className="h-4 w-4 text-cyan-400 group-hover:scale-110 transition shrink-0" />
                      <div className="text-left min-w-0">
                        <span className="text-[11px] font-bold text-slate-200 block truncate">Galería</span>
                        <span className="text-[8.5px] text-slate-400 block truncate">Elegir foto</span>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            setReceiptFileName(f.name || 'foto.jpg');
                            setReceiptIsPdf(false);
                            setReconciliationResult(null);
                            try {
                              const stamped = await stampReceiptPhoto(f, { week: confirmPaymentWeek });
                              setReceiptPhotoPreview(stamped);
                            } catch (err) {
                              const r = new FileReader();
                              r.onload = () => setReceiptPhotoPreview(r.result);
                              r.readAsDataURL(f);
                            }
                          }
                          e.target.value = '';
                        }}
                      />
                    </label>

                    {/* Cámara */}
                    <label className="border border-dashed border-white/15 hover:border-cyan-400/50 rounded-2xl p-2.5 flex items-center justify-center gap-2 cursor-pointer bg-white/5 hover:bg-white/10 transition text-slate-300 hover:text-white group select-none active:scale-95 text-center">
                      <Camera className="h-4 w-4 text-cyan-400 group-hover:scale-110 transition shrink-0" />
                      <div className="text-left min-w-0">
                        <span className="text-[11px] font-bold text-slate-200 block truncate">Cámara</span>
                        <span className="text-[8.5px] text-slate-400 block truncate">Tomar foto</span>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            setReceiptFileName(f.name || 'foto.jpg');
                            setReceiptIsPdf(false);
                            setReconciliationResult(null);
                            try {
                              const stamped = await stampReceiptPhoto(f, { week: confirmPaymentWeek });
                              setReceiptPhotoPreview(stamped);
                            } catch (err) {
                              const r = new FileReader();
                              r.onload = () => setReceiptPhotoPreview(r.result);
                              r.readAsDataURL(f);
                            }
                          }
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* SECCIÓN DE AUDITORÍA Y CONCILIACIÓN CON IA */}
            {receiptPhotoPreview && (
              <div className="pt-0.5 space-y-2">
                {!reconciliationResult ? (
                  <button
                    type="button"
                    disabled={reconciling}
                    onClick={handleReconcileWithAi}
                    className="w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-cyan-500/20 via-blue-600/20 to-emerald-500/20 hover:from-cyan-500/30 hover:to-emerald-500/30 border border-cyan-500/40 text-cyan-300 font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.98] cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className={`h-4 w-4 ${reconciling ? 'animate-spin text-amber-400' : 'text-cyan-400'}`} />
                    <span>{reconciling ? 'AuraCore-AI auditando liquidación...' : '✨ Analizar y Comparar con IA'}</span>
                  </button>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-[#0d141f] p-3 space-y-2 text-left animate-fade-in shadow-inner">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                        <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-200">
                          Auditoría AuraCore
                        </span>
                      </div>
                      <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-md border ${
                        reconciliationResult.status === 'MATCH'
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      }`}>
                        {reconciliationResult.status === 'MATCH' ? '🟢 Cuadra 100%' : '⚠️ Discrepancia'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-center py-1.5 bg-black/40 rounded-xl border border-white/5">
                      <div>
                        <span className="text-[8.5px] text-slate-400 block uppercase">En Reporte</span>
                        <span className="text-xs font-mono font-bold text-white">
                          ${Number(reconciliationResult.reported_total || 0).toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[8.5px] text-slate-400 block uppercase">En Sistema</span>
                        <span className="text-xs font-mono font-bold text-slate-300">
                          ${Number(reconciliationResult.expected_total || 0).toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[8.5px] text-slate-400 block uppercase">Diferencia</span>
                        <span className={`text-xs font-mono font-bold ${
                          (reconciliationResult.difference || 0) === 0
                            ? 'text-emerald-400'
                            : (reconciliationResult.difference || 0) > 0
                              ? 'text-cyan-400'
                              : 'text-rose-400'
                        }`}>
                          {(reconciliationResult.difference || 0) >= 0 ? '+' : ''}${Number(reconciliationResult.difference || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {reconciliationResult.summary_notes && (
                      <p className="text-[10px] text-slate-300 leading-relaxed bg-white/5 p-2 rounded-xl border border-white/5">
                        {reconciliationResult.summary_notes}
                      </p>
                    )}

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleReconcileWithAi}
                        disabled={reconciling}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 underline font-medium cursor-pointer"
                      >
                        {reconciling ? 'Re-analizando...' : 'Volver a auditar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Botones de Acción */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={savingPayment || reconciling}
                onClick={() => setConfirmPaymentWeek(null)}
                className="py-2.5 px-3 bg-white/10 hover:bg-white/15 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingPayment || reconciling}
                onClick={handleConfirmPaymentWithReceipt}
                className="py-2.5 px-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-emerald-500/25 transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (selectedReceiptModal.week?.key) {
                    handleDeleteReceipt(selectedReceiptModal.week.key);
                  }
                }}
                className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold transition shadow-xl active:scale-95 cursor-pointer flex items-center gap-1.5"
                title="Eliminar comprobante permanentemente"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Eliminar</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedReceiptModal(null)}
                className="px-6 py-2 bg-[#16202c] hover:bg-[#1e2b3b] text-white border border-white/15 rounded-xl text-xs font-bold transition shadow-xl active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <X className="h-3.5 w-3.5" />
                <span>Cerrar</span>
              </button>
            </div>
          }
        />
      )}

      {/* MODAL: VISOR DE DOCUMENTO PDF (COCKPIT COMPACT HIGH-TECH STYLE) */}
      {selectedPdfModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in modal-overlay-safe"
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 0px) + 16px, 1.25rem)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 1.25rem)'
          }}
          onClick={() => setSelectedPdfModal(null)}
        >
          <div 
            className="bg-[#101722]/95 backdrop-blur-xl border border-white/10 rounded-3xl w-full max-w-sm sm:max-w-md h-[80dvh] sm:h-[82dvh] modal-sheet-compact flex flex-col overflow-hidden shadow-2xl text-white transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 sm:px-5 py-3 border-b border-white/10 flex items-center justify-between bg-slate-900/80 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-500/20 text-white font-bold shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-black text-white uppercase tracking-wider font-mono truncate">
                    {selectedPdfModal.filename || 'Reporte de Liquidación'}
                  </h3>
                  <p className="text-[10.5px] text-rose-300 font-mono truncate">
                    Semana {selectedPdfModal.week?.displayLabel || selectedPdfModal.week?.key} • ${(selectedPdfModal.week?.totalEarnings || 0).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={selectedPdfModal.url}
                  download={selectedPdfModal.filename || 'reporte.pdf'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition shrink-0 cursor-pointer"
                  title="Descargar o Abrir en Pestaña"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedPdfModal.week?.key) {
                      handleDeleteReceipt(selectedPdfModal.week.key);
                    }
                  }}
                  className="w-8 h-8 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 hover:text-rose-200 transition shrink-0 cursor-pointer"
                  title="Eliminar Reporte PDF permanentemente"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPdfModal(null)}
                  className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition shrink-0 cursor-pointer"
                  title="Cerrar ventana"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-black/40 p-2 overflow-hidden flex flex-col">
              <iframe
                src={selectedPdfModal.url}
                title={selectedPdfModal.filename || 'Reporte PDF'}
                className="w-full h-full rounded-2xl border border-white/10 bg-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* COMPONENTE MODAL: HISTORIAL Y CONSTANCIA GENERAL DE RECIBOS (ESTÉTICA COCKPIT ALINEADA) */}
      {showReceiptsModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in modal-overlay-safe"
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 0px) + 16px, 1.25rem)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 1.25rem)'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowReceiptsModal(false);
          }}
        >
          <div 
            className="bg-[#101722]/95 backdrop-blur-xl border border-white/10 rounded-3xl w-full max-w-sm sm:max-w-md h-[80dvh] sm:h-[82dvh] modal-sheet-compact flex flex-col overflow-hidden shadow-2xl text-white transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Modal */}
            <div className="px-4 sm:px-5 py-3 border-b border-white/10 flex items-center justify-between bg-slate-900/80 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-slate-950 font-bold shrink-0">
                  <Paperclip className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-white uppercase tracking-wider font-mono truncate">
                    Constancia de Recibos
                  </h3>
                  <p className="text-[11px] text-cyan-400/90 font-mono font-medium truncate">
                    {allWeeklyReceipts.length} comprobante{allWeeklyReceipts.length !== 1 ? 's' : ''} archivado{allWeeklyReceipts.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowReceiptsModal(false)}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition shrink-0 cursor-pointer"
                title="Cerrar ventana"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Buscador / Filtro de Fecha (SIN autoFocus para no robar el foco al entrar) */}
            <div className="p-3 bg-[#0d141f] border-b border-white/5 shrink-0">
              <div className="relative">
                <Calendar className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400" />
                <input
                  type="text"
                  placeholder="Filtrar por fecha o semana (ej. 2026, Oct, Sem 44)..."
                  value={receiptDateFilter}
                  onChange={(e) => setReceiptDateFilter(e.target.value)}
                  className="w-full bg-[#131b26] border border-white/10 focus:border-cyan-400 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition shadow-inner"
                />
                {receiptDateFilter && (
                  <button
                    type="button"
                    onClick={() => setReceiptDateFilter('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
                    title="Borrar filtro de fecha"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Lista / Galería de Recibos con Scroll */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
              {allWeeklyReceipts.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-slate-400">
                    <Paperclip className="h-6 w-6 stroke-[1.5]" />
                  </div>
                  <p className="text-xs font-bold text-slate-300">
                    No hay recibos de cobro archivados aún
                  </p>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                    Al confirmar el cobro de una semana con foto o PDF, se estampará automáticamente con su fecha y se archivará aquí.
                  </p>
                </div>
              ) : filteredReceipts.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <p className="text-xs font-bold text-slate-300">
                    No se encontraron recibos con "{receiptDateFilter}"
                  </p>
                  <button
                    type="button"
                    onClick={() => setReceiptDateFilter('')}
                    className="px-3 py-1 bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 rounded-xl text-xs font-bold cursor-pointer hover:bg-cyan-500/25 transition"
                  >
                    Mostrar todos los recibos
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {filteredReceipts.map((r) => {
                    const isPdf = Boolean(r.isPdf || r.photo?.startsWith('data:application/pdf') || r.photo?.endsWith('.pdf') || r.filename?.toLowerCase().endsWith('.pdf'));
                    return (
                      <div
                        key={r.key}
                        onClick={() => {
                          if (isPdf) {
                            setSelectedPdfModal({ url: r.photo, filename: r.filename, week: r });
                          } else {
                            setSelectedReceiptModal({ photo: r.photo, week: r });
                          }
                        }}
                        className="relative bg-[#131b26] border border-white/10 hover:border-cyan-500/40 rounded-2xl p-2 cursor-pointer transition select-none group shadow-md hover:shadow-cyan-500/10 space-y-1.5 active:scale-95"
                        title={`Ver comprobante de Semana ${r.displayLabel || r.key} (${r.startDate} al ${r.endDate})`}
                      >
                        <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-black/60 border border-white/5 flex items-center justify-center">
                          {isPdf ? (
                            <div className="flex flex-col items-center justify-center gap-1 p-2 text-center w-full h-full bg-gradient-to-br from-rose-950/40 to-[#0f1722]">
                              <FileText className="w-8 h-8 text-rose-400 group-hover:scale-110 transition stroke-[1.8]" />
                              <span className="text-[9.5px] font-bold text-rose-300 font-mono tracking-tight truncate max-w-full px-1">
                                {r.filename || 'Reporte PDF'}
                              </span>
                            </div>
                          ) : (
                            <img
                              src={r.photo}
                              alt={`Recibo Semana ${r.displayLabel || r.key}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          )}
                          <div className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-xs text-[9.5px] font-mono font-bold text-emerald-400 border border-white/10">
                            ${(r.totalEarnings || 0).toFixed(0)}
                          </div>
                          {isPdf && (
                            <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.2 rounded bg-rose-500/80 text-[8px] font-black text-white uppercase tracking-wider">
                              PDF
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteReceipt(r.key, e);
                            }}
                            className="absolute top-1.5 left-1.5 w-7 h-7 rounded-lg bg-black/80 hover:bg-rose-600/90 text-slate-300 hover:text-white border border-white/10 flex items-center justify-center transition active:scale-90 z-10 cursor-pointer"
                            title="Eliminar comprobante permanentemente"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="px-1">
                          <p className="text-xs font-black text-white truncate font-mono">
                            Semana {r.displayLabel || r.key}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate mt-0.5 font-medium flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-cyan-400/70 shrink-0" />
                            <span>{r.startDate} al {r.endDate}</span>
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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
