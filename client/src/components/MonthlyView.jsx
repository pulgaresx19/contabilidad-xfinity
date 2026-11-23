import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, DollarSign, TrendingUp, TrendingDown, Clock, 
  CheckCircle2, ChevronLeft, ChevronRight, Plus, Fuel, Wrench, 
  Car, Utensils, Smartphone, Shield, Package, Home, Trash2, Copy, 
  Check, CheckCheck, Share2, AlertCircle, FileText, ChevronDown, ChevronUp, Image as ImageIcon,
  ShieldCheck, CheckCircle, Edit3, Pencil, Camera, Sparkles, AlertTriangle, ExternalLink, X,
  ArrowDownWideNarrow, Paperclip, Download,
  ZoomIn, ZoomOut, Maximize2, Minimize2
} from 'lucide-react';
import { 
  getCurrentMonthStr, formatMonthFriendly, 
  getPreviousMonth, getNextMonth, formatDateFriendly 
} from '../utils/dateUtils';
import { getOrderRemark, getBoreInfo, formatCableType } from '../utils/remarkUtils';
import AddExpenseModal from './AddExpenseModal';
import EditJobModal from './EditJobModal';
import ShareReportModal from './ShareReportModal';
import HistoricalOrderCard from './HistoricalOrderCard';
import ZoomableImageViewer from './ZoomableImageViewer';
import PdfDocumentViewer from './PdfDocumentViewer';
import EmptyStateCard from './EmptyStateCard';
import { stampReceiptPhoto } from '../utils/receiptStamper';

const CATEGORY_ICONS = {
  // Orden oficial solicitado:
  'Pago de Renta': { icon: Home, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
  Renta: { icon: Home, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
  'Vehículo / Van': { icon: Car, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  'Vehículo (Van / Auto)': { icon: Car, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  Vehículo: { icon: Car, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  Seguros: { icon: Shield, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  Combustible: { icon: Fuel, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  Comida: { icon: Utensils, color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  Alimentación: { icon: Utensils, color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  'Seguros y Licencia': { icon: Shield, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  'Seguros y Licencias': { icon: Shield, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  Seguro: { icon: Shield, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  Teléfono: { icon: Smartphone, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  Telefonía: { icon: Smartphone, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  Herramientas: { icon: Wrench, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  'Otros Gastos': { icon: Package, color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
  Otros: { icon: Package, color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
};

export default function MonthlyView({ 
  orders = [], 
  onRefresh, 
  onOpenPhotos, 
  onOrderUpdated, 
  onUpdateOrders 
}) {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthStr());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState('weeks'); // 'weeks' | 'expenses' | 'report'
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [selectedWeekModal, setSelectedWeekModal] = useState(null);
  const [selectedExpenseModal, setSelectedExpenseModal] = useState(null);
  const [selectedReceiptModal, setSelectedReceiptModal] = useState(null);
  const [selectedPdfModal, setSelectedPdfModal] = useState(null);
  const [confirmPaymentWeek, setConfirmPaymentWeek] = useState(null);
  const [receiptPhotoPreview, setReceiptPhotoPreview] = useState(null);
  const [receiptFileName, setReceiptFileName] = useState('');
  const [receiptIsPdf, setReceiptIsPdf] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconciliationResult, setReconciliationResult] = useState(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [copiedWeekKey, setCopiedWeekKey] = useState(null);
  const [copiedReport, setCopiedReport] = useState(false);
  const [updatingWeekKey, setUpdatingWeekKey] = useState(null);
  const [reportOrder, setReportOrder] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [copiedJobId, setCopiedJobId] = useState(null);
  const [sortByAmountDesc, setSortByAmountDesc] = useState(false);

  const getReceiptSrc = (p) => {
    if (!p) return '';
    if (p.startsWith('http') || p.startsWith('data:')) return p;
    if (p.startsWith('/uploads/')) return p;
    if (p.startsWith('uploads/')) return `/${p}`;
    return `/uploads/${p}`;
  };

  const parseExpensePhotos = (receipt_photo) => {
    if (!receipt_photo) return [];
    try {
      if (typeof receipt_photo === 'string' && receipt_photo.startsWith('[')) {
        return JSON.parse(receipt_photo);
      }
      return [receipt_photo];
    } catch (e) {
      return [receipt_photo];
    }
  };

  const copySingleJobClaim = (order) => {
    const bInfo = getBoreInfo(order.bore_type);
    const boreLabel = bInfo ? bInfo.label : 'No';
    const remark = getOrderRemark(order);

    const text = `📋 *COMPROBANTE DE TRABAJO - XFINITY*
🔢 *Work Order #:* ${order.job_id}
📅 *Fecha Ejecución:* ${order.work_date}
📍 *Dirección:* ${order.address}${order.city ? `, ${order.city}` : ''}
📏 *Pies / Drop:* ${order.drop_footage} ft (${formatCableType(order.cable_type)})
🚧 *Cruce (Bore):* ${boreLabel}
📝 *Observaciones / Acceso:* ${remark || '🟢 Acceso libre'}
📸 *Fotos de Evidencia:* ${order.photos_count || (order.photos ? order.photos.length : 0)} archivada(s)`;

    try {
      navigator.clipboard.writeText(text);
      setCopiedJobId(order.id);
      setTimeout(() => setCopiedJobId(null), 2000);
    } catch (e) {}
  };

  useEffect(() => {
    if (selectedWeekModal && data?.weeks) {
      const updated = data.weeks.find(w => w.key === selectedWeekModal.key);
      if (updated) setSelectedWeekModal(updated);
    }
  }, [data]);

  const copyWeeklyAudit = (w) => {
    const jobList = (w.orders || []).map((o, idx) => 
      `  ${idx + 1}. Job #${o.job_id}: ${o.address} (${o.drop_footage || 0} ft, ${formatCableType(o.cable_type)}) - $${o.rate_calculated || 0}`
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
  }, [selectedMonth, orders]);

  useEffect(() => {
    const handleSettingsUpdated = () => fetchMonthlyData(selectedMonth);
    window.addEventListener('xfinity-settings-updated', handleSettingsUpdated);
    return () => window.removeEventListener('xfinity-settings-updated', handleSettingsUpdated);
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
    if (isPaid) {
      setConfirmPaymentWeek(w);
      const existingReceipt = w.receipt_photo || (typeof window !== 'undefined' ? localStorage.getItem('receipt_' + w.key) : null);
      const existingFilename = w.receipt_filename || (typeof window !== 'undefined' ? localStorage.getItem('receipt_fn_' + w.key) : null);
      setReceiptPhotoPreview(existingReceipt || null);
      setReceiptFileName(existingFilename || '');
      setReceiptIsPdf(Boolean(
        existingReceipt?.startsWith('data:application/pdf') ||
        existingReceipt?.endsWith('.pdf') ||
        existingFilename?.toLowerCase().endsWith('.pdf')
      ));
      try {
        const existingAudit = w.audit_summary ? (typeof w.audit_summary === 'string' ? JSON.parse(w.audit_summary) : w.audit_summary) : null;
        setReconciliationResult(existingAudit || null);
      } catch (err) {
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
        if (selectedWeekModal?.key === w.key) {
          setSelectedWeekModal(prev => ({ ...prev, isPaid: false }));
        }
        await fetchMonthlyData(selectedMonth);
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      alert('Error actualizando estado de la semana: ' + err.message);
    } finally {
      setUpdatingWeekKey(null);
    }
  };

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
        localStorage.removeItem('receipt_audit_' + key);
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
      if (selectedWeekModal && selectedWeekModal.key === key) {
        setSelectedWeekModal(prev => ({
          ...prev,
          receipt_photo: null,
          receipt_filename: null,
          audit_summary: null
        }));
      }
      await fetchMonthlyData(selectedMonth);
      if (onRefresh) onRefresh();
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
          receipt_filename: receiptFileName || null,
          audit_summary: reconciliationResult || null
        })
      });
      if (res.ok) {
        if (receiptPhotoPreview && typeof window !== 'undefined') {
          try {
            if (typeof receiptPhotoPreview === 'string' && receiptPhotoPreview.length < 500000) {
              localStorage.setItem('receipt_' + confirmPaymentWeek.key, receiptPhotoPreview);
            }
            localStorage.setItem('receipt_fn_' + confirmPaymentWeek.key, receiptFileName || 'comprobante.pdf');
            if (reconciliationResult) {
              localStorage.setItem('receipt_audit_' + confirmPaymentWeek.key, JSON.stringify(reconciliationResult));
            }
          } catch (lsErr) {
            console.warn('localStorage error:', lsErr);
          }
        } else if (!receiptPhotoPreview && typeof window !== 'undefined') {
          localStorage.removeItem('receipt_' + confirmPaymentWeek.key);
          localStorage.removeItem('receipt_fn_' + confirmPaymentWeek.key);
          localStorage.removeItem('receipt_audit_' + confirmPaymentWeek.key);
        }
        if (selectedWeekModal?.key === confirmPaymentWeek.key) {
          setSelectedWeekModal(prev => ({
            ...prev,
            isPaid: true,
            receipt_photo: receiptPhotoPreview || prev.receipt_photo,
            receipt_filename: receiptFileName || prev.receipt_filename,
            audit_summary: reconciliationResult || prev.audit_summary
          }));
        }
        setConfirmPaymentWeek(null);
        setReceiptPhotoPreview(null);
        setReceiptFileName('');
        setReceiptIsPdf(false);
        setReconciliationResult(null);
        await fetchMonthlyData(selectedMonth);
        if (onRefresh) onRefresh();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert('Error: ' + (errData.error || 'No se pudo actualizar'));
      }
    } catch (err) {
      alert('Error confirmando cobro: ' + err.message);
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
      const resData = await res.json();
      if (resData.ok && resData.data) {
        setReconciliationResult(resData.data);
      } else {
        alert(resData.error || 'No se pudo completar la auditoría con IA.');
      }
    } catch (err) {
      alert('Error al conectar con AuraCore-AI: ' + err.message);
    } finally {
      setReconciling(false);
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

  const displayedExpenses = useMemo(() => {
    if (!sortByAmountDesc) return expenses;
    return [...expenses].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
  }, [expenses, sortByAmountDesc]);

  return (
    <div className="space-y-4 max-w-md sm:max-w-lg mx-auto w-full pb-4">
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

          {/* Sub-cards: 1. Pendiente, 2. Cobrado, 3. Gastos */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/8">
            {/* 1. Pendiente */}
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

            {/* 2. Cobrado */}
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

            {/* 3. Gastos */}
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
            <EmptyStateCard
              icon={Calendar}
              iconColor="cyan"
              title="No hay semanas cerradas en este mes aún"
              description="Las semanas correspondientes a este mes se agruparán automáticamente cuando tengas órdenes registradas."
            />
          ) : (
            weeks.map((w) => {
              const completedCount = w.completedCount !== undefined 
                ? w.completedCount 
                : (w.orders || []).filter(o => o.status === 'Completado').length;
              const totalJobs = w.totalJobs !== undefined
                ? w.totalJobs
                : (w.orders?.length || 0);
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
                        {w.startDate} al {w.endDate} • {completedCount} de {totalJobs} hechos
                      </p>
                    </div>

                    <div className="text-right">
                      <span className={`text-base sm:text-lg font-black font-mono block ${
                        w.isPaid ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.35)]' : 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.25)]'
                      }`}>
                        ${(w.totalEarnings || 0).toFixed(2)}
                      </span>
                      <div className="flex items-center justify-end">
                        <span className="text-[10px] text-slate-400 font-mono font-bold">
                          {Math.round(w.totalFootage || 0)} ft
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Fila Inferior con Espacio de Confirmación Estético y Reporte de Bono/Faltante al lado de las órdenes */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/8 gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1 shrink-0">
                        <FileText className="h-3 w-3 text-cyan-400" />
                        <span>{w.orders?.length || 0} órdenes</span>
                      </span>

                      {w.settlementDifference && w.settlementDifference !== 0 ? (
                        <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-lg border font-mono flex items-center gap-1 shrink-0 shadow-xs ${
                          w.settlementDifference > 0
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                        }`}>
                          <span className="text-[8px]">{w.settlementDifference > 0 ? '▲' : '▼'}</span>
                          <span>{w.settlementDifference > 0 ? '+' : ''}${w.settlementDifference.toFixed(2)}</span>
                          <span className={`text-[8px] uppercase font-sans font-extrabold px-1 py-0.2 rounded ${
                            w.settlementDifference > 0 ? 'bg-emerald-500/25 text-emerald-200' : 'bg-rose-500/25 text-rose-200'
                          }`}>
                            {w.settlementDifference > 0 ? 'Bono' : 'Faltante'}
                          </span>
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      {w.isPaid ? (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={(e) => handleToggleWeekPayment(w, 'Pendiente', e)}
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
                          onClick={(e) => handleToggleWeekPayment(w, 'Cobrado', e)}
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

      {/* SUBTAB 2: GASTOS MENSUALES */}
      {activeSubTab === 'expenses' && (
        <div className="space-y-3">
          {/* Add expense button */}
          <button
            onClick={() => setIsExpenseModalOpen(true)}
            className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-600 hover:from-rose-600 hover:to-amber-700 text-white font-bold text-xs shadow-lg shadow-rose-950/30 flex items-center justify-center gap-2 transition active:scale-[0.98]"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Registrar Gasto de {formatMonthFriendly(selectedMonth)}</span>
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
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-300">
                Historial de Gastos ({expenses.length})
              </span>
              {expenses.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSortByAmountDesc((prev) => !prev)}
                  className={`w-6 h-6 rounded-full transition-colors border select-none active:scale-90 flex items-center justify-center shrink-0 ${
                    sortByAmountDesc
                      ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                      : 'bg-slate-800/60 hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 border-white/10'
                  }`}
                  title={
                    sortByAmountDesc
                      ? 'Organizado: Mayor a menor (Toca para deseleccionar)'
                      : 'Organizar por gasto más alto primero'
                  }
                  aria-label="Organizar gastos de mayor a menor"
                >
                  <ArrowDownWideNarrow className={`w-3 h-3 ${sortByAmountDesc ? 'text-rose-300 stroke-[2.2]' : 'stroke-[1.8]'}`} />
                </button>
              )}
            </div>

            {expenses.length === 0 ? (
              <EmptyStateCard
                icon={DollarSign}
                iconColor="cyan"
                title="No has registrado gastos para este mes"
                description="Registra combustible, herramientas, renta y repuestos para llevar tu contabilidad real."
              />
            ) : (
              displayedExpenses.map((exp) => {
                const catCfg = CATEGORY_ICONS[exp.category] || CATEGORY_ICONS.Otros;
                const Icon = catCfg.icon;
                const photos = parseExpensePhotos(exp.receipt_photo);
                const dataUrls = parseExpensePhotos(exp.receipt_data);
                const totalTickets = Math.max(photos.length, dataUrls.length);

                return (
                  <div
                    key={exp.id}
                    onClick={() => setSelectedExpenseModal(exp)}
                    className="bg-[#131b26] hover:bg-[#182332] border border-white/10 hover:border-cyan-500/35 rounded-2xl p-3.5 flex items-center justify-between transition shadow-md cursor-pointer group active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${catCfg.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-white text-xs truncate group-hover:text-cyan-300 transition">
                            {exp.description}
                          </span>
                          {totalTickets > 0 && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded-md border border-cyan-500/20 shrink-0">
                              <Camera className="w-2.5 h-2.5" />
                              <span>{totalTickets} {totalTickets === 1 ? 'ticket' : 'tickets'}</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="font-medium text-amber-300/90">{exp.category}</span>
                          <span>•</span>
                          <span>{exp.expense_date}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <div className="text-right">
                        <div className="font-black text-rose-400 font-mono text-sm sm:text-base">
                          -${Number(exp.amount).toFixed(2)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteExpense(exp.id, e);
                        }}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/15 rounded-lg transition active:scale-90"
                        title="Eliminar gasto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <div className="h-6 w-6 rounded-full bg-slate-800/80 border border-white/5 flex items-center justify-center text-slate-400 group-hover:text-cyan-400 group-hover:border-cyan-500/30 transition shrink-0">
                        <ChevronRight className="h-3 w-3" />
                      </div>
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
          initialMode="edit"
          onClose={() => setEditingOrder(null)}
          onJobUpdated={() => {
            fetchMonthlyData(selectedMonth);
            if (onRefresh) onRefresh();
          }}
          onJobDeleted={() => {
            fetchMonthlyData(selectedMonth);
            if (onRefresh) onRefresh();
          }}
        />
      )}

      {/* MODAL OVERLAY DE ÓRDENES DE LA SEMANA (IDÉNTICO A CIERRE SEMANAL) */}
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
              <div className="px-4 sm:px-5 py-3 border-b border-white/10 flex items-center justify-between bg-slate-900/70 shrink-0">
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
                      title="Adjuntar foto del recibo o cheque"
                    >
                      <Paperclip className="h-4 w-4 stroke-[1.8]" />
                      <input
                        type="file"
                        accept="image/*,application/pdf,.pdf"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 25 * 1024 * 1024) {
                              alert('El archivo supera los 25 MB. Por favor elige un archivo más liviano.');
                              e.target.value = '';
                              return;
                            }
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
                              await fetchMonthlyData(selectedMonth);
                              if (onRefresh) await onRefresh();
                            } catch (err) {
                              console.warn('Error al estampar recibo:', err);
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
                    className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition shrink-0 cursor-pointer"
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
                    <span className="flex items-center gap-1.5">
                      <span>Historial de Trabajos</span>
                      <span className="text-cyan-400 font-mono">({selectedWeekModal.orders?.length || 0})</span>
                    </span>
                  </div>

                {(selectedWeekModal.orders || []).map((order, idx) => (
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
      ); })()}

      {/* MODAL DETALLE DE GASTO Y EVIDENCIA DE TICKETS */}
      {selectedExpenseModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-5 bg-black/85 backdrop-blur-md animate-fade-in modal-overlay-safe"
          onClick={() => setSelectedExpenseModal(null)}
        >
          <div 
            className="bg-[#101722] border border-white/10 rounded-3xl max-w-sm sm:max-w-md w-full max-h-[82dvh] sm:max-h-[85dvh] flex flex-col overflow-hidden shadow-2xl text-white my-auto animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Cockpit */}
            <div className="px-4 sm:px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-slate-900/80 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                {(() => {
                  const catCfg = CATEGORY_ICONS[selectedExpenseModal.category] || CATEGORY_ICONS.Otros;
                  const Icon = catCfg.icon;
                  return (
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center border shadow-sm shrink-0 ${catCfg.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  );
                })()}
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-white uppercase tracking-wider font-mono truncate">
                    Detalle de Gasto
                  </h3>
                  <p className="text-[10.5px] text-slate-400 font-mono truncate">
                    {selectedExpenseModal.category} • {formatDateFriendly(selectedExpenseModal.expense_date)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedExpenseModal(null)}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition shrink-0 cursor-pointer"
                title="Cerrar detalle"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Cuerpo del Modal */}
            <div className="p-4 overflow-y-auto space-y-3.5 flex-1 min-h-0 sleek-scroll">
              {/* Tarjeta de Monto y Concepto */}
              <div className="bg-[#141d2a] border border-rose-500/20 rounded-2xl p-4 text-center space-y-1.5 shadow-sm">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                  Monto Deducible
                </span>
                <div className="text-2xl sm:text-3xl font-black font-mono text-rose-400 drop-shadow-[0_0_10px_rgba(244,63,94,0.2)]">
                  -${Number(selectedExpenseModal.amount || 0).toFixed(2)}
                </div>
                <div className="text-xs font-semibold text-slate-200 pt-1">
                  {selectedExpenseModal.description || 'Gasto General'}
                </div>
              </div>

              {/* Grid de Metadatos */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-[#16202c] border border-white/5 rounded-xl p-2.5 space-y-0.5">
                  <span className="text-[9.5px] uppercase font-bold text-slate-400 block">Categoría</span>
                  <span className="font-bold text-amber-300 font-mono">{selectedExpenseModal.category}</span>
                </div>
                <div className="bg-[#16202c] border border-white/5 rounded-xl p-2.5 space-y-0.5">
                  <span className="text-[9.5px] uppercase font-bold text-slate-400 block">Fecha Registrada</span>
                  <span className="font-bold text-slate-200 font-mono">{selectedExpenseModal.expense_date}</span>
                </div>
              </div>

              {/* Sección de Comprobantes Fotográficos / Tickets */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-cyan-400" />
                    <span>Comprobantes / Tickets Adjuntos</span>
                  </span>
                  {(() => {
                    const photos = parseExpensePhotos(selectedExpenseModal.receipt_photo);
                    const dataUrls = parseExpensePhotos(selectedExpenseModal.receipt_data);
                    const totalTickets = Math.max(photos.length, dataUrls.length);
                    return totalTickets > 0 ? (
                      <span className="text-[10px] text-cyan-400 font-mono font-bold bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
                        {totalTickets} {totalTickets === 1 ? 'ticket' : 'tickets'}
                      </span>
                    ) : null;
                  })()}
                </div>

                {(() => {
                  const photos = parseExpensePhotos(selectedExpenseModal.receipt_photo);
                  const dataUrls = parseExpensePhotos(selectedExpenseModal.receipt_data);
                  const totalTickets = Math.max(photos.length, dataUrls.length);

                  if (totalTickets === 0) {
                    return (
                      <div className="bg-[#16202c] border border-white/5 rounded-2xl p-6 text-center text-slate-400 text-xs space-y-1">
                        <ImageIcon className="w-6 h-6 mx-auto text-slate-600 mb-1" />
                        <p className="font-medium text-slate-300">Sin foto de ticket</p>
                        <p className="text-[10.5px] text-slate-500 leading-tight">
                          Este gasto fue registrado únicamente con valor numérico sin adjuntos.
                        </p>
                      </div>
                    );
                  }

                  const displayList = Array.from({ length: totalTickets });

                  return (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        {displayList.map((_, idx) => {
                          const dataUrl = dataUrls[idx];
                          const p = photos[idx];
                          const src = (dataUrl && (dataUrl.startsWith('data:') || dataUrl.startsWith('blob:')))
                            ? dataUrl
                            : getReceiptSrc(p);

                          return (
                            <div
                              key={idx}
                              onClick={() => setSelectedPhoto(src)}
                              className="group relative rounded-2xl overflow-hidden border border-white/10 hover:border-cyan-500/40 bg-black/40 aspect-[4/3] cursor-pointer shadow-md transition"
                            >
                              <img
                                src={src}
                                alt={`Ticket ${idx + 1}`}
                                className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                                onError={(e) => {
                                  if (dataUrl && e.target.src !== dataUrl) {
                                    e.target.src = dataUrl;
                                  }
                                }}
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90 group-hover:opacity-100 transition flex items-end p-2 justify-between">
                                <span className="text-[9.5px] font-mono text-white/90 font-bold bg-black/60 px-1.5 py-0.5 rounded-md border border-white/10">
                                  #{idx + 1}
                                </span>
                                <span className="text-[9.5px] text-cyan-300 font-bold flex items-center gap-0.5 bg-black/60 px-1.5 py-0.5 rounded-md border border-cyan-500/20">
                                  <span>Ampliar</span>
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-slate-500 text-center font-medium">
                        Toca cualquier ticket para abrirlo en tamaño completo.
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Footer Fijo con Acciones */}
            <div className="px-4 py-3 border-t border-white/10 bg-slate-900/90 flex items-center justify-between gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const idToDelete = selectedExpenseModal.id;
                  setSelectedExpenseModal(null);
                  handleDeleteExpense(idToDelete);
                }}
                className="py-2 px-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 hover:border-rose-500/40 text-rose-300 font-bold text-xs rounded-xl flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedExpenseModal(null)}
                className="flex-1 py-2.5 px-4 bg-gradient-to-r from-slate-800 to-slate-700 hover:from-slate-700 hover:to-slate-600 border border-white/10 text-white font-bold text-xs rounded-xl text-center transition active:scale-95 cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

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
        isOpen={Boolean(reportOrder)}
        order={reportOrder}
        onClose={() => setReportOrder(null)}
        onOrderUpdated={() => {
          if (onRefresh) onRefresh();
          if (onOrderUpdated) onOrderUpdated();
          fetchMonthlyData(selectedMonth);
        }}
      />

      {/* MODAL: VISOR DE DOCUMENTO PDF CON ZOOM INTERACTIVO Y COMPARTIR POR WHATSAPP */}
      {selectedPdfModal && (
        <PdfDocumentViewer
          url={selectedPdfModal.url}
          filename={selectedPdfModal.filename}
          week={selectedPdfModal.week}
          onClose={() => setSelectedPdfModal(null)}
          onDelete={(key) => handleDeleteReceipt(key)}
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
                ${(confirmPaymentWeek.totalEarnings || 0).toFixed(2)}
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
                          if (f.size > 25 * 1024 * 1024) {
                            alert('El archivo supera los 25 MB. Por favor elige un archivo más liviano.');
                            e.target.value = '';
                            return;
                          }
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
                            if (f.size > 25 * 1024 * 1024) {
                              alert('El archivo supera los 25 MB. Por favor elige un archivo más liviano.');
                              e.target.value = '';
                              return;
                            }
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
                            if (f.size > 25 * 1024 * 1024) {
                              alert('El archivo supera los 25 MB. Por favor elige un archivo más liviano.');
                              e.target.value = '';
                              return;
                            }
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
    </div>
  );
}
