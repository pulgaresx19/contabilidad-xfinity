import React, { useState } from 'react';
import { 
  Camera, Check, X, Phone, MapPin, Share2, Clock, 
  CheckCircle2, AlertCircle, Plus, Sparkles, AlertTriangle, Shield,
  SlidersHorizontal, Edit3, Minus, DollarSign, Calendar, ChevronLeft, ChevronRight, Pencil, Info,
  Image as ImageIcon
} from 'lucide-react';
import AddJobModal from './AddJobModal';
import EditJobModal from './EditJobModal';
import { getLocalDateStr, normalizeDateStr, formatDateFriendly } from '../utils/dateUtils';

export default function TodayView({ orders, summaryData, onOpenScan, onOpenPhotos, onOrderUpdated }) {
  // Uses local device time (ET/CT/MT/PT) - never jumps to tomorrow in late evening hours
  const todayReal = getLocalDateStr();
  
  // Find which date to display by default:
  // If today has orders, start on today.
  // If not, find the most recent order's date, or default to today.
  const [activeDate, setActiveDate] = useState(() => {
    const hasToday = orders.some(o => normalizeDateStr(o.work_date) === todayReal);
    if (hasToday) return todayReal;
    if (orders.length > 0) {
      // Return the most recent order's date
      const sorted = [...orders].sort((a, b) => normalizeDateStr(b.work_date).localeCompare(normalizeDateStr(a.work_date)));
      return normalizeDateStr(sorted[0].work_date) || todayReal;
    }
    return todayReal;
  });

  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'Pendiente' | 'Completado' | 'No Realizado'
  const [sharingId, setSharingId] = useState(null);
  const [localSharedMap, setLocalSharedMap] = useState({});
  const [cancelModalOrder, setCancelModalOrder] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelPhotoFiles, setCancelPhotoFiles] = useState([]);
  const [cancelPhotoPreviews, setCancelPhotoPreviews] = useState([]);
  const [savingCancel, setSavingCancel] = useState(false);
  const [cancelDetailOrder, setCancelDetailOrder] = useState(null);
  const [cancelDetailPhotos, setCancelDetailPhotos] = useState([]);
  const [loadingCancelPhotos, setLoadingCancelPhotos] = useState(false);
  const [isAddJobOpen, setIsAddJobOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);

  // WhatsApp Share Modal State (Primero Texto, Luego Fotos)
  const [shareModalOrder, setShareModalOrder] = useState(null);
  const [shareStep1Done, setShareStep1Done] = useState(false);
  const [shareOrderPhotos, setShareOrderPhotos] = useState([]);
  const [loadingSharePhotos, setLoadingSharePhotos] = useState(false);
  const [sharingAllInOne, setSharingAllInOne] = useState(false);

  // Manual Price Adjustment Modal State
  const [adjustModalOrder, setAdjustModalOrder] = useState(null);
  const [adjustType, setAdjustType] = useState('add'); // 'add' | 'sub'
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [savingAdjust, setSavingAdjust] = useState(false);

  // 1. FILTER ORDERS EXCLUSIVELY FOR THE ACTIVE DAY
  const dayOrders = orders.filter(o => normalizeDateStr(o.work_date) === activeDate);
  const dayPending = dayOrders.filter(o => o.status === 'Pendiente');
  const dayCompleted = dayOrders.filter(o => o.status === 'Completado');
  const dayCancelled = dayOrders.filter(o => o.status === 'No Realizado');
  const dayEarnings = dayCompleted.reduce((sum, o) => sum + (o.rate_calculated || 0), 0);
  const dayFeet = dayCompleted.reduce((sum, o) => sum + (o.drop_footage || 0), 0);

  // Filtered by status chip
  const visibleOrders = dayOrders.filter(o => {
    if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
    return true;
  });

  // Helper to extract clean remark or obstacles
  const getOrderRemark = (order) => {
    const parts = [];
    if (order.obstacles && order.obstacles !== 'N') {
      parts.push(order.obstacles);
    }
    if (order.raw_notes && typeof order.raw_notes === 'string') {
      const trimmed = order.raw_notes.trim();
      if (trimmed && !trimmed.startsWith('P#:') && !trimmed.startsWith('CALLFIRST/P#:')) {
        if (!parts.includes(trimmed)) {
          parts.push(trimmed);
        }
      }
    }
    return parts.length > 0 ? parts.join(' • ') : null;
  };

  // Base calculation without manual adjustment
  const getOrderBaseCalculation = (order) => {
    if (!order) return { base: 100, dwBonus: 0, footageBonus: 0, autoSubtotal: 100 };
    let base = 100;
    let dwBonus = (order.bore_type && order.bore_type.includes('DW')) ? 30 : 0;
    let footageBonus = 0;
    if (order.drop_footage > 300) {
      const extraBlocks = Math.floor((order.drop_footage - 300) / 100);
      if (extraBlocks > 0) footageBonus = extraBlocks * 25;
    }
    const autoSubtotal = base + dwBonus + footageBonus;
    return { base, dwBonus, footageBonus, autoSubtotal };
  };

  const openAdjustModal = (order) => {
    setAdjustModalOrder(order);
    const currentAdj = order.manual_adjustment || 0;
    if (currentAdj < 0) {
      setAdjustType('sub');
      setAdjustAmount(String(Math.abs(currentAdj)));
    } else if (currentAdj > 0) {
      setAdjustType('add');
      setAdjustAmount(String(currentAdj));
    } else {
      setAdjustType('add');
      setAdjustAmount('');
    }
    setAdjustReason(order.adjustment_reason || '');
  };

  const handleSaveAdjustment = async () => {
    if (!adjustModalOrder) return;
    setSavingAdjust(true);

    const { autoSubtotal } = getOrderBaseCalculation(adjustModalOrder);
    const rawAmt = parseFloat(adjustAmount) || 0;
    const finalAdjustment = adjustType === 'sub' ? -Math.abs(rawAmt) : Math.abs(rawAmt);
    const finalRate = Math.max(0, autoSubtotal + finalAdjustment);

    try {
      const res = await fetch(`/api/orders/${adjustModalOrder.id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rate_calculated: finalRate,
          manual_adjustment: finalAdjustment,
          adjustment_reason: adjustReason.trim()
        })
      });

      if (res.ok) {
        onOrderUpdated();
        setAdjustModalOrder(null);
      } else {
        const err = await res.json();
        alert('Error: ' + err.error);
      }
    } catch (err) {
      alert('Error guardando ajuste: ' + err.message);
    } finally {
      setSavingAdjust(false);
    }
  };

  const handleResetAdjustment = async () => {
    if (!adjustModalOrder) return;
    const { autoSubtotal } = getOrderBaseCalculation(adjustModalOrder);
    setSavingAdjust(true);

    try {
      const res = await fetch(`/api/orders/${adjustModalOrder.id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rate_calculated: autoSubtotal,
          manual_adjustment: 0,
          adjustment_reason: ''
        })
      });

      if (res.ok) {
        onOrderUpdated();
        setAdjustModalOrder(null);
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSavingAdjust(false);
    }
  };

  // Date navigation helpers
  const shiftDay = (days) => {
    const [y, m, d] = activeDate.split('-');
    // Noon avoids daylight saving time boundary skips
    const current = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), 12, 0, 0);
    current.setDate(current.getDate() + days);
    const newY = current.getFullYear();
    const newM = String(current.getMonth() + 1).padStart(2, '0');
    const newD = String(current.getDate()).padStart(2, '0');
    setActiveDate(`${newY}-${newM}-${newD}`);
  };

  // Mark order as completed (requires at least 1 work photo evidence)
  const handleMarkCompleted = async (order) => {
    const photosCount = (order.work_photos_count !== undefined ? order.work_photos_count : order.photos_count) || 0;
    if (photosCount === 0) {
      onOpenPhotos(order);
      return;
    }

    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...order, status: 'Completado', cancel_reason: '' })
      });
      if (res.ok) {
        onOrderUpdated();
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // Open modal to mark as No Realizado
  const openCancelModal = (order) => {
    setCancelModalOrder(order);
    setCancelReason('');
    setCancelPhotoFiles([]);
    setCancelPhotoPreviews([]);
  };

  const handleCancelPhotoSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const newPreviews = files.map(f => URL.createObjectURL(f));
    setCancelPhotoFiles(prev => [...prev, ...files]);
    setCancelPhotoPreviews(prev => [...prev, ...newPreviews]);
    e.target.value = '';
  };

  const handleRemoveCancelPhoto = (index) => {
    setCancelPhotoFiles(prev => prev.filter((_, i) => i !== index));
    setCancelPhotoPreviews(prev => {
      if (prev[index]) URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Confirm No Realizado
  const handleConfirmCancelled = async () => {
    if (!cancelModalOrder) return;
    setSavingCancel(true);
    try {
      const res = await fetch(`/api/orders/${cancelModalOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...cancelModalOrder, 
          status: 'No Realizado', 
          cancel_reason: cancelReason.trim() || 'No realizado por inconveniente en la propiedad' 
        })
      });

      if (res.ok) {
        if (cancelPhotoFiles.length > 0) {
          const formData = new FormData();
          formData.append('category', 'Constancia No Realizado');
          cancelPhotoFiles.forEach(f => formData.append('photos', f));
          await fetch(`/api/orders/${cancelModalOrder.id}/photos`, {
            method: 'POST',
            body: formData
          });
        }
        onOrderUpdated();
        setCancelModalOrder(null);
        setCancelPhotoFiles([]);
        setCancelPhotoPreviews([]);
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSavingCancel(false);
    }
  };

  // Open detail modal for cancelled order
  const openCancelDetail = async (order) => {
    setCancelDetailOrder(order);
    setCancelDetailPhotos([]);
    setLoadingCancelPhotos(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`);
      if (res.ok) {
        const full = await res.json();
        const cPhotos = (full.photos || []).filter(p => p.category === 'Constancia No Realizado');
        setCancelDetailPhotos(cPhotos.length > 0 ? cPhotos : (full.photos || []));
      }
    } catch (err) {
      console.error('Error fetching cancel detail photos:', err);
    } finally {
      setLoadingCancelPhotos(false);
    }
  };

  const handleAddPhotoToCancelled = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !cancelDetailOrder) return;
    try {
      const formData = new FormData();
      formData.append('category', 'Constancia No Realizado');
      files.forEach(f => formData.append('photos', f));
      const res = await fetch(`/api/orders/${cancelDetailOrder.id}/photos`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const updatedRes = await fetch(`/api/orders/${cancelDetailOrder.id}`);
        if (updatedRes.ok) {
          const updated = await updatedRes.json();
          const cPhotos = (updated.photos || []).filter(p => p.category === 'Constancia No Realizado');
          setCancelDetailPhotos(cPhotos.length > 0 ? cPhotos : (updated.photos || []));
          onOrderUpdated();
        }
      }
    } catch (err) {
      alert('Error al subir foto: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  // Re-open cancelled order
  const handleReopenOrder = async (order) => {
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...order, status: 'Pendiente', cancel_reason: '' })
      });
      if (res.ok) {
        onOrderUpdated();
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // Funciones para Reporte WhatsApp (Primero Texto, Luego Fotos)
  const markOrderAsShared = (order) => {
    order.whatsapp_shared = 1;
    order.whatsapp_shared_at = new Date().toISOString();
    setLocalSharedMap((prev) => ({ ...prev, [order.id]: true }));

    fetch(`/api/orders/${order.id}/whatsapp-shared`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shared: true })
    }).then(() => {
      if (onOrderUpdated) onOrderUpdated();
    }).catch((err) => {
      console.error('Error marking as shared:', err);
    });
  };

  const getReportText = (order) => {
    return `📋 *REPORTE DE TRABAJO*
📅 *Fecha:* ${order.work_date}
🔢 *Orden #:* ${order.job_id}
📍 *Dirección:* ${order.address}${order.city ? `, ${order.city}` : ''}
📏 *Drop:* ${order.drop_footage} ft (${order.cable_type})${order.bore_type && order.bore_type !== 'N' ? `\n🛠️ *Bore:* ${order.bore_type}` : ''}
💵 *Tarifa:* $${order.rate_calculated}
✅ *Estado:* Completado y Verificado`;
  };

  const openShareModal = async (order) => {
    setShareModalOrder(order);
    setShareStep1Done(Boolean(order.whatsapp_shared || localSharedMap[order.id]));
    setLoadingSharePhotos(true);

    try {
      const res = await fetch(`/api/orders/${order.id}`);
      const fullOrder = await res.json();
      const photos = (fullOrder.photos || []).filter((p) => p.category !== 'Constancia No Realizado');
      setShareOrderPhotos(photos);
    } catch (e) {
      setShareOrderPhotos([]);
    } finally {
      setLoadingSharePhotos(false);
    }
  };

  // Paso 1: Enviar primero el texto del trabajo por WhatsApp
  const handleSendText = async () => {
    if (!shareModalOrder) return;
    const reportText = getReportText(shareModalOrder);

    try {
      await navigator.clipboard.writeText(reportText);
    } catch (e) {}

    markOrderAsShared(shareModalOrder);
    setShareStep1Done(true);

    const waUrl = `https://wa.me/?text=${encodeURIComponent(reportText)}`;
    window.open(waUrl, '_blank');
  };

  // Paso 2: Enviar fotos de evidencia para que bajen justo después del texto
  const handleSendPhotos = async () => {
    if (!shareModalOrder || shareOrderPhotos.length === 0) return;
    setSharingId(shareModalOrder.id);
    markOrderAsShared(shareModalOrder);

    try {
      const filesToShare = [];
      for (let i = 0; i < shareOrderPhotos.length; i++) {
        const p = shareOrderPhotos[i];
        try {
          const imgRes = await fetch(`/uploads/${p.filename}`);
          const blob = await imgRes.blob();
          const cleanCat = (p.category || 'evidencia').replace(/[^a-zA-Z0-9]/g, '_');
          const file = new File(
            [blob], 
            `Orden_${shareModalOrder.job_id}_${i + 1}_${cleanCat}.jpg`, 
            { type: blob.type || 'image/jpeg' }
          );
          filesToShare.push(file);
        } catch (e) {
          console.error('Error fetching photo blob:', e);
        }
      }

      if (filesToShare.length > 0 && navigator.canShare && navigator.canShare({ files: filesToShare })) {
        await navigator.share({
          title: `Fotos #${shareModalOrder.job_id}`,
          files: filesToShare,
        });
      } else {
        alert('No se pudieron compartir directamente las fotos. Puedes verlas o descargarlas desde el visor de fotos.');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Error sharing photos:', err);
      }
    } finally {
      setSharingId(null);
    }
  };

  // Opción Todo en Uno
  const handleShareAllInOne = async () => {
    if (!shareModalOrder) return;
    setSharingAllInOne(true);
    markOrderAsShared(shareModalOrder);
    const reportText = getReportText(shareModalOrder);

    try {
      try {
        await navigator.clipboard.writeText(reportText);
      } catch (e) {}

      if (navigator.canShare && shareOrderPhotos.length > 0) {
        const filesToShare = [];
        for (let i = 0; i < shareOrderPhotos.length; i++) {
          const p = shareOrderPhotos[i];
          try {
            const imgRes = await fetch(`/uploads/${p.filename}`);
            const blob = await imgRes.blob();
            const cleanCat = (p.category || 'evidencia').replace(/[^a-zA-Z0-9]/g, '_');
            const file = new File(
              [blob], 
              `Orden_${shareModalOrder.job_id}_${i + 1}_${cleanCat}.jpg`, 
              { type: blob.type || 'image/jpeg' }
            );
            filesToShare.push(file);
          } catch (e) {
            console.error('Error fetching photo blob:', e);
          }
        }

        if (filesToShare.length > 0 && navigator.canShare({ files: filesToShare })) {
          await navigator.share({
            title: `Reporte #${shareModalOrder.job_id}`,
            text: reportText,
            files: filesToShare,
          });
          setSharingAllInOne(false);
          return;
        }
      }

      const waUrl = `https://wa.me/?text=${encodeURIComponent(reportText)}`;
      window.open(waUrl, '_blank');
    } catch (err) {
      if (err.name !== 'AbortError') {
        const waUrl = `https://wa.me/?text=${encodeURIComponent(reportText)}`;
        window.open(waUrl, '_blank');
      }
    } finally {
      setSharingAllInOne(false);
    }
  };

  const isViewingToday = activeDate === todayReal;

  return (
    <div className="space-y-3.5 max-w-md mx-auto">
      {/* 1. NAVEGADOR DE FECHA & HERO CARD DE LA JORNADA */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-4 shadow-xl space-y-3">
        {/* Barra superior de Fecha de la Jornada */}
        <div className="flex items-center justify-between bg-slate-950/70 px-3 py-2 rounded-2xl border border-slate-800/80">
          <button
            type="button"
            onClick={() => shiftDay(-1)}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            title="Día anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-xs font-black text-white font-mono">
              {isViewingToday ? `Hoy (${formatDateFriendly(activeDate)})` : formatDateFriendly(activeDate)}
            </span>
            {!isViewingToday && (
              <button
                type="button"
                onClick={() => setActiveDate(todayReal)}
                className="text-[9px] bg-cyan-950 text-cyan-300 border border-cyan-800 px-1.5 py-0.2 rounded-md font-bold hover:bg-cyan-900"
              >
                Ir a Hoy
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => shiftDay(1)}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            title="Día siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Métricas de la Jornada de ese día */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider block">
              {isViewingToday ? 'Jornada de Hoy' : 'Producción del Día'}
            </span>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white font-mono mt-0.5">
              ${dayEarnings.toFixed(2)}
            </h2>
            <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 font-mono block mt-0.5">
              {Math.round(dayFeet)} ft instalados
            </span>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-semibold">Progreso del Día</span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              <strong className="text-emerald-600 dark:text-emerald-400 text-sm font-black">{dayCompleted.length}</strong> de {dayOrders.length} hechos
            </span>
            {dayPending.length > 0 && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 block font-bold mt-0.5">
                {dayPending.length} pendientes
              </span>
            )}
          </div>
        </div>

        {/* Barra de Progreso del Día */}
        <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
          <div 
            className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full rounded-full transition-all duration-500"
            style={{ width: `${dayOrders.length > 0 ? (dayCompleted.length / dayOrders.length) * 100 : 0}%` }}
          />
        </div>

        {/* Botones de Acción: Escanear Hoja & Añadir Trabajo */}
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <button
            onClick={onOpenScan}
            className="py-2.5 px-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-extrabold text-xs rounded-2xl shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
          >
            <Camera className="h-4 w-4 stroke-[2.5]" />
            <span>Escanear Hoja</span>
          </button>

          <button
            onClick={() => setIsAddJobOpen(true)}
            className="py-2.5 px-3 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 shadow-sm dark:bg-slate-800/90 dark:hover:bg-slate-700 dark:text-slate-100 dark:border-slate-700/80 font-extrabold text-xs rounded-2xl flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
          >
            <Plus className="h-4 w-4 stroke-[3] text-cyan-600 dark:text-cyan-400" />
            <span>Añadir Trabajo</span>
          </button>
        </div>
      </div>

      {/* 2. CHIPS DE FILTRO DE ESTADO (SIN BUSCADOR) */}
      <div className="grid grid-cols-4 gap-1 bg-slate-900/90 p-1 rounded-2xl border border-slate-800 text-[10px] font-bold text-center">
        <button
          onClick={() => setStatusFilter('ALL')}
          className={`py-1.5 rounded-xl transition ${statusFilter === 'ALL' ? 'bg-cyan-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'}`}
        >
          Todos ({dayOrders.length})
        </button>
        <button
          onClick={() => setStatusFilter('Pendiente')}
          className={`py-1.5 rounded-xl transition ${statusFilter === 'Pendiente' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'}`}
        >
          Pendientes ({dayPending.length})
        </button>
        <button
          onClick={() => setStatusFilter('Completado')}
          className={`py-1.5 rounded-xl transition ${statusFilter === 'Completado' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'}`}
        >
          Hechos ({dayCompleted.length})
        </button>
        <button
          onClick={() => setStatusFilter('No Realizado')}
          className={`py-1.5 rounded-xl transition ${statusFilter === 'No Realizado' ? 'bg-rose-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'}`}
        >
          Cancelados ({dayCancelled.length})
        </button>
      </div>

      {/* 3. LISTA DE TRABAJOS DEL DÍA CON NÚMEROS EN CÍRCULO */}
      {visibleOrders.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-3">
          <div className="h-12 w-12 rounded-2xl bg-slate-800/80 text-slate-500 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-slate-200">
              Sin trabajos en esta fecha
            </h4>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              {isViewingToday 
                ? 'No tienes trabajos registrados para hoy aún. Escanea tu hoja de despacho o añade el primer trabajo.'
                : `No hay órdenes registradas para el día ${formatDateFriendly(activeDate)}.`
              }
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              onClick={onOpenScan}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl transition"
            >
              Escanear Hoja
            </button>
            <button
              onClick={() => setIsAddJobOpen(true)}
              className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 shadow-sm dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white dark:border-transparent font-bold text-xs rounded-xl transition"
            >
              Añadir Trabajo
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibleOrders.map((order, idx) => {
            const isCompleted = order.status === 'Completado';
            const isCancelled = order.status === 'No Realizado';
            const isPending = order.status === 'Pendiente';
            const hasDrivewayBore = order.bore_type && order.bore_type.includes('DW');

            return (
              <div
                key={order.id}
                className={`rounded-2xl p-3.5 pl-4 space-y-2.5 transition border ${
                  isCompleted
                    ? 'relative overflow-hidden bg-gradient-to-br from-white via-emerald-50/20 to-emerald-50/60 dark:from-slate-900/95 dark:via-slate-900/90 dark:to-emerald-950/30 border-emerald-500/50 dark:border-emerald-500/40 shadow-[0_4px_22px_-2px_rgba(16,185,129,0.22)] ring-1 ring-emerald-500/20 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 before:bg-gradient-to-b before:from-emerald-400 before:to-emerald-600'
                    : isCancelled
                    ? 'relative overflow-hidden bg-rose-50/40 dark:bg-rose-950/15 border-rose-200 dark:border-rose-900/40 opacity-80 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 before:bg-rose-400'
                    : 'relative overflow-hidden bg-white dark:bg-slate-900/90 border-slate-200 dark:border-slate-800 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.4)] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 before:bg-amber-400'
                }`}
              >
                {/* Header de la Tarjeta con Número en Círculo */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {/* Número de ítem en círculo */}
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-black font-mono shadow-sm flex-shrink-0 ${
                      isCompleted
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40'
                        : isCancelled
                        ? 'bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/40'
                        : 'bg-cyan-100 text-cyan-800 border border-cyan-300 dark:bg-cyan-500/20 dark:text-cyan-300 dark:border-cyan-500/40'
                    }`}>
                      {idx + 1}
                    </div>

                    <span className="text-sm font-black text-cyan-700 dark:text-cyan-400 font-mono">
                      #{order.job_id}
                    </span>

                    {/* Status Badge */}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                      isCompleted
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30'
                        : isCancelled
                        ? 'bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/30'
                        : 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30'
                    }`}>
                      {isCompleted && <CheckCircle2 className="h-3 w-3" />}
                      {isPending && <Clock className="h-3 w-3" />}
                      {isCancelled && <X className="h-3 w-3" />}
                      <span>{order.status}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Medallón de Dinero Profesional / Saldo */}
                    <div 
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border shadow-sm select-none transition-all ${
                        isCancelled
                          ? 'bg-slate-100 text-slate-400 border-slate-300 dark:bg-slate-900/60 dark:text-slate-500 dark:border-slate-800 line-through'
                          : isCompleted
                          ? 'bg-gradient-to-r from-emerald-500/20 via-emerald-500/15 to-teal-500/20 border-emerald-500/50 dark:border-emerald-400/50 text-emerald-800 dark:text-emerald-200 shadow-emerald-500/20 ring-1 ring-emerald-500/25'
                          : 'bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/35 text-emerald-800 dark:text-emerald-300 shadow-emerald-500/10'
                      }`}
                      title={`Tarifa del trabajo: $${order.rate_calculated} USD`}
                    >
                      <span className={`h-4.5 w-4.5 rounded-full flex items-center justify-center text-[10px] font-black shadow-inner flex-shrink-0 ${
                        isCancelled
                          ? 'bg-slate-300 dark:bg-slate-800 text-slate-500'
                          : 'bg-emerald-500 text-slate-950'
                      }`}>
                        $
                      </span>
                      <span className="text-sm sm:text-base font-black font-mono tracking-tight leading-none">
                        {order.rate_calculated}
                      </span>
                      <span className="text-[9px] font-extrabold uppercase tracking-wider opacity-60">
                        USD
                      </span>
                    </div>

                    {/* Botón de Edición Completa */}
                    <button
                      type="button"
                      onClick={() => setEditingOrder(order)}
                      className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 border border-slate-200 dark:border-slate-700 hover:border-cyan-500/50 transition active:scale-90"
                      title="Editar datos del trabajo (dirección, teléfono, metraje, precio, etc.)"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Dirección y Teléfono */}
                <div className="space-y-1">
                  <div className="flex items-start gap-1.5 text-xs text-slate-800 dark:text-slate-100">
                    <MapPin className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">{order.address}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{order.city} {order.zip_code}</p>
                    </div>
                  </div>

                  {order.phone && (
                    <div className="flex items-center gap-2 pl-5 text-[11px]">
                      <a 
                        href={`tel:${order.phone}`} 
                        className="text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 font-mono font-bold"
                      >
                        <Phone className="h-3 w-3" />
                        <span>{order.phone}</span>
                      </a>
                      {order.call_first === 1 && (
                        <span className="text-[9px] bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30 px-1.5 py-0.2 rounded font-bold">
                          CALL FIRST
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Especificaciones Técnicas (Fila deslizable horizontalmente con Remark al final) */}
                {(() => {
                  const orderRemark = getOrderRemark(order);
                  return (
                    <div className="flex items-center gap-1.5 text-[10px] font-mono overflow-x-auto scrollbar-none pb-0.5 whitespace-nowrap">
                      <span className="shrink-0 bg-slate-100 dark:bg-slate-950 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-800 text-amber-800 dark:text-amber-300 font-bold">
                        {order.drop_footage} ft
                      </span>

                      <span className="shrink-0 bg-slate-100 dark:bg-slate-950 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                        {order.cable_type}
                      </span>

                      {hasDrivewayBore ? (
                        <span className="shrink-0 bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 px-2 py-0.5 rounded border border-cyan-300 dark:border-cyan-800 font-bold">
                          DW Bore: +$30
                        </span>
                      ) : order.bore_type && order.bore_type !== 'N' ? (
                        <span className="shrink-0 bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-800">
                          Bore: {order.bore_type}
                        </span>
                      ) : null}

                      {/* Bono por Metraje Largo (>300 ft) */}
                      {order.drop_footage > 300 && Math.floor((order.drop_footage - 300) / 100) > 0 && (
                        <span className="shrink-0 bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-800 font-bold">
                          Drop &gt;300ft: +${Math.floor((order.drop_footage - 300) / 100) * 25}
                        </span>
                      )}

                      {/* Recuadro Amarillo para Remark / Obstáculos Extras al final de la línea */}
                      {orderRemark && (
                        <span 
                          className="shrink-0 bg-amber-50 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700/80 px-2 py-0.5 rounded font-medium flex items-center gap-1 shadow-2xs"
                          title={`Remark / Obstáculos: ${orderRemark}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                          <span className="font-bold text-amber-800 dark:text-amber-400">Remark:</span>
                          <span>{orderRemark}</span>
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Badge de Ajuste Manual si existe */}
                {order.manual_adjustment !== undefined && order.manual_adjustment !== 0 && (
                  <div className={`p-2 rounded-xl border text-[11px] flex items-center justify-between gap-2 ${
                    order.manual_adjustment > 0
                      ? 'bg-cyan-950/40 border-cyan-800/60 text-cyan-300'
                      : 'bg-amber-950/40 border-amber-800/60 text-amber-300'
                  }`}>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Sparkles className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">
                        <strong>Ajuste {order.manual_adjustment > 0 ? `+$${order.manual_adjustment}` : `-$${Math.abs(order.manual_adjustment)}`}:</strong> {order.adjustment_reason || 'Inconsistencia de precio'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingOrder(order)}
                      className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline font-semibold flex-shrink-0"
                    >
                      Editar
                    </button>
                  </div>
                )}

                {/* Si Cancelado: Rectángulo Curvado con Motivo e Icono Interactivo para Ver Detalle / Foto */}
                {isCancelled && (
                  <div
                    onClick={() => openCancelDetail(order)}
                    className="p-2.5 rounded-2xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 hover:border-rose-400 dark:hover:border-rose-700 text-xs transition cursor-pointer flex items-center justify-between gap-2 shadow-sm group active:scale-[0.99]"
                    title="Toca para ver el detalle y la foto de constancia"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 shrink-0">
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400 block tracking-wider">
                          Motivo No Realizado:
                        </span>
                        <p className="text-xs font-semibold text-rose-900 dark:text-rose-100 truncate">
                          {order.cancel_reason || 'Sin motivo detallado'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 font-bold text-[10px] shrink-0 group-hover:bg-rose-500 group-hover:text-white transition shadow-xs">
                      {(order.cancel_photos_count > 0 || (order.photos_count > 0 && (!order.work_photos_count || order.work_photos_count === 0))) ? (
                        <>
                          <Camera className="h-3.5 w-3.5" />
                          <span>Ver Foto</span>
                        </>
                      ) : (
                        <>
                          <Info className="h-3.5 w-3.5" />
                          <span>Ver Detalle</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Botones de Acción para Trabajos Activos (Pendientes / Completados). Los No Realizados no tienen botones afuera para no agrandar la tarjeta */}
                {!isCancelled && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenPhotos(order)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-950 dark:hover:bg-slate-800 text-[11px] font-bold text-cyan-700 dark:text-cyan-300 border border-slate-300 dark:border-slate-800 rounded-xl transition active:scale-95"
                    >
                      <Camera className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                      <span>{(order.work_photos_count !== undefined ? order.work_photos_count : order.photos_count) || 0} Fotos</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      {/* Si Pendiente: Confirmar o No Realizado */}
                      {isPending && (
                        <>
                          <button
                            type="button"
                            onClick={() => openCancelModal(order)}
                            className="px-2 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold rounded-xl transition"
                          >
                            No Realizado
                          </button>

                          {Boolean((order.work_photos_count !== undefined ? order.work_photos_count : order.photos_count) > 0) ? (
                            <button
                              type="button"
                              onClick={() => handleMarkCompleted(order)}
                              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black rounded-xl transition flex items-center gap-1 shadow-md shadow-emerald-500/20 active:scale-95"
                              title="Confirmar trabajo completado"
                            >
                              <Check className="h-3.5 w-3.5 stroke-[3]" />
                              <span>Confirmar</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onOpenPhotos(order)}
                              className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-950 hover:bg-amber-500/10 dark:hover:bg-amber-500/15 text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 border border-dashed border-slate-300 dark:border-slate-800 hover:border-amber-500/50 text-[11px] font-bold rounded-xl transition flex items-center gap-1.5 active:scale-95"
                              title="Debes subir fotos de evidencia antes de poder confirmar"
                            >
                              <Camera className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
                              <span>Foto Requerida</span>
                            </button>
                          )}
                        </>
                      )}

                      {/* Si Completado: WhatsApp Share con Constancia de Envío */}
                      {isCompleted && (() => {
                        const isShared = Boolean(order.whatsapp_shared || localSharedMap[order.id]);
                        return isShared ? (
                          <button
                            type="button"
                            onClick={() => openShareModal(order)}
                            className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[11px] font-bold rounded-xl transition flex items-center gap-1 shadow-2xs active:scale-95"
                            title={`Reporte ya enviado al supervisor${order.whatsapp_shared_at ? ` (${order.whatsapp_shared_at.slice(11, 16)})` : ''}. Toca para abrir opciones de WhatsApp.`}
                          >
                            <Check className="h-3 w-3 stroke-[3] text-emerald-600 dark:text-emerald-400" />
                            <span>Reportado ✓</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openShareModal(order)}
                            className="px-3 py-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-black rounded-xl transition flex items-center gap-1.5 shadow-md shadow-emerald-500/25 active:scale-95 ring-1 ring-emerald-400/50"
                            title="Trabajo completado: Toca para reportar al supervisor por WhatsApp"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-950 animate-ping shrink-0" />
                            <Share2 className="h-3.5 w-3.5 stroke-[2.5]" />
                            <span>WhatsApp</span>
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Ajustar Tarifa / Inconsistencia de Pago */}
      {adjustModalOrder && (() => {
        const { base, dwBonus, footageBonus, autoSubtotal } = getOrderBaseCalculation(adjustModalOrder);
        const parsedAmt = parseFloat(adjustAmount) || 0;
        const calcAdj = adjustType === 'sub' ? -Math.abs(parsedAmt) : Math.abs(parsedAmt);
        const finalEstRate = Math.max(0, autoSubtotal + calcAdj);

        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-t-3xl sm:rounded-2xl p-4 sm:p-5 shadow-2xl space-y-3.5 max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-xl">
                    <SlidersHorizontal className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Ajustar Precio de la Orden</h3>
                    <p className="text-[10px] text-slate-400 font-mono">Job #{adjustModalOrder.job_id}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setAdjustModalOrder(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 text-xs">
                <p className="font-bold text-slate-200">{adjustModalOrder.address}</p>
                <p className="text-[10px] text-slate-400">{adjustModalOrder.city}</p>
              </div>

              <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-1 text-xs font-mono">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span>Tarifa Base:</span>
                  <span className="text-white font-bold">$100.00</span>
                </div>

                {dwBonus > 0 && (
                  <div className="flex items-center justify-between text-cyan-400 text-[11px]">
                    <span>Driveway Bore (DW):</span>
                    <span className="font-bold">+$30.00</span>
                  </div>
                )}

                {footageBonus > 0 && (
                  <div className="flex items-center justify-between text-amber-300 text-[11px]">
                    <span>Drop Extra ({adjustModalOrder.drop_footage} ft):</span>
                    <span className="font-bold">+${footageBonus.toFixed(2)}</span>
                  </div>
                )}

                <div className="pt-1 border-t border-slate-800 flex items-center justify-between font-bold text-xs">
                  <span className="text-slate-300 font-sans">Subtotal Automático:</span>
                  <span className="text-emerald-400">${autoSubtotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-300 block">
                  Ajuste / Inconsistencia del Supervisor:
                </label>

                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setAdjustType('add')}
                    className={`py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1 ${
                      adjustType === 'add'
                        ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Plus className="h-3 w-3 stroke-[3]" />
                    <span>Sumar (+ Bono)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdjustType('sub')}
                    className={`py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1 ${
                      adjustType === 'sub'
                        ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Minus className="h-3 w-3 stroke-[3]" />
                    <span>Restar (- Descuento)</span>
                  </button>
                </div>

                <div className="relative">
                  <span className={`absolute left-3 top-2.5 text-xs font-mono font-black ${
                    adjustType === 'add' ? 'text-emerald-400' : 'text-amber-400'
                  }`}>
                    {adjustType === 'add' ? '+$' : '-$'}
                  </span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Monto a ajustar (ej. 30 o 25)"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs sm:text-sm text-white font-mono font-bold focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-[10px] text-slate-500">Rápidos:</span>
                  <button
                    type="button"
                    onClick={() => { setAdjustType('sub'); setAdjustAmount('30'); setAdjustReason('Supervisor descontó DW (no se perforó)'); }}
                    className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[10px] rounded-lg hover:bg-slate-700"
                  >
                    -30 (Sin DW)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAdjustType('add'); setAdjustAmount('25'); setAdjustReason('Bono metraje extra autorizado'); }}
                    className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[10px] rounded-lg hover:bg-slate-700"
                  >
                    +25 (Bono)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAdjustType('add'); setAdjustAmount('50'); setAdjustReason('Trabajo complejo / rocoso'); }}
                    className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[10px] rounded-lg hover:bg-slate-700"
                  >
                    +50 (Extra)
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300 block">
                  Motivo / Constancia del Ajuste:
                </label>
                <input
                  type="text"
                  placeholder="ej. Supervisor descontó DW / Terreno rocoso aprobado"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="p-3 bg-gradient-to-r from-slate-950 to-slate-900 border border-cyan-500/30 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold uppercase">
                    Tarifa Final Cobrable
                  </span>
                  {calcAdj !== 0 ? (
                    <span className="text-[11px] text-cyan-300 font-mono">
                      ${autoSubtotal} {calcAdj > 0 ? `+ $${Math.abs(calcAdj)}` : `- $${Math.abs(calcAdj)}`}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500 font-mono">Sin ajuste manual</span>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-xl font-black text-emerald-400 font-mono">
                    ${finalEstRate.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                {adjustModalOrder.manual_adjustment !== 0 && (
                  <button
                    type="button"
                    disabled={savingAdjust}
                    onClick={handleResetAdjustment}
                    className="py-2.5 px-3 bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 text-xs font-bold rounded-xl transition"
                    title="Eliminar ajuste y volver a la tarifa automática"
                  >
                    Restablecer
                  </button>
                )}

                <button
                  type="button"
                  disabled={savingAdjust}
                  onClick={handleSaveAdjustment}
                  className="flex-1 py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20 active:scale-95 transition"
                >
                  <Check className="h-4 w-4 stroke-[3]" />
                  <span>{savingAdjust ? 'Guardando...' : 'Guardar Ajuste'}</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL: Marcar como No Realizado */}
      {cancelModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-sm rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-2xl space-y-3.5 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl">
                  <AlertTriangle className="h-4 w-4 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Trabajo No Realizado
                  </h3>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Registrar motivo de cancelación
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCancelModalOrder(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Detalles del Trabajo */}
            <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-cyan-700 dark:text-cyan-400">
                  #{cancelModalOrder.job_id}
                </span>
                <span className="text-[10px] bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-900 px-1.5 py-0.2 rounded font-semibold">
                  Se marcará No Realizado
                </span>
              </div>
              <p className="font-bold text-slate-900 dark:text-white mt-1">{cancelModalOrder.address}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">{cancelModalOrder.city} {cancelModalOrder.zip_code}</p>
            </div>

            {/* Sugerencias Rápidas de Motivos */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                  Opciones rápidas (Opcional):
                </label>
                {cancelReason && (
                  <button
                    type="button"
                    onClick={() => setCancelReason('')}
                    className="text-[10px] text-slate-400 hover:text-rose-500 flex items-center gap-0.5 transition font-semibold"
                  >
                    <X className="h-3 w-3" />
                    <span>Deseleccionar</span>
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Sin acceso: cliente ausente o reja cerrada',
                  'Perro suelto en patio / Sin acceso seguro',
                  'Cancelado por el cliente en el sitio',
                  'Conflicto de servicios públicos (Gas/Agua)',
                  'Terreno inundado / Imposible perforar'
                ].map((reason) => {
                  const isSelected = cancelReason === reason;
                  return (
                    <button
                      type="button"
                      key={reason}
                      onClick={() => setCancelReason(isSelected ? '' : reason)}
                      className={`text-[10px] px-2 py-1 rounded-lg border text-left transition flex items-center gap-1 ${
                        isSelected
                          ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-400 dark:border-rose-500 font-bold shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span>{reason}</span>
                      {isSelected && <X className="h-2.5 w-2.5 opacity-70" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Campo de Texto Personalizado con botón de Limpiar X */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                  Escribir motivo manualmente:
                </label>
                {cancelReason && (
                  <button
                    type="button"
                    onClick={() => setCancelReason('')}
                    className="text-[10px] text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 font-bold"
                  >
                    <X className="h-3 w-3" />
                    <span>Limpiar texto</span>
                  </button>
                )}
              </div>

              <div className="relative">
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  placeholder="Escribe la razón aquí manualmente..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 pr-8 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
                {cancelReason && (
                  <button
                    type="button"
                    onClick={() => setCancelReason('')}
                    className="absolute top-2.5 right-2.5 p-1 rounded-full bg-slate-200/90 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-500 text-slate-500 dark:text-slate-400 transition"
                    title="Borrar texto para escribir manualmente"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Fotos de Constancia del Obstáculo */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                  Fotos de Constancia del Obstáculo (Opcional):
                </label>
                {cancelPhotoPreviews.length > 0 && (
                  <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                    {cancelPhotoPreviews.length} {cancelPhotoPreviews.length === 1 ? 'foto' : 'fotos'}
                  </span>
                )}
              </div>

              {/* Botones Siempre Arriba a Primera Vista */}
              <div className="grid grid-cols-2 gap-2">
                {/* Botón Cámara */}
                <label className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl border border-dashed border-rose-300 dark:border-rose-700/60 hover:border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-xs font-bold cursor-pointer transition active:scale-95 text-center">
                  <Camera className="h-4 w-4 shrink-0" />
                  <span>Cámara</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleCancelPhotoSelect}
                    className="hidden"
                  />
                </label>

                {/* Botón Galería */}
                <label className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-rose-500 bg-slate-50 dark:bg-slate-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 text-xs font-bold cursor-pointer transition active:scale-95 text-center">
                  <ImageIcon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
                  <span>Galería / Fotos</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleCancelPhotoSelect}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Tira de Fotos Añadidas Abajo */}
              {cancelPhotoPreviews.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 scrollbar-thin">
                  {cancelPhotoPreviews.map((src, idx) => (
                    <div
                      key={idx}
                      className="relative w-24 h-16 flex-shrink-0 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black/40 shadow-sm"
                    >
                      <img src={src} alt={`Preview ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveCancelPhoto(idx)}
                        className="absolute top-1 right-1 p-1 rounded-full bg-rose-600/90 hover:bg-rose-500 text-white shadow active:scale-90 transition"
                        title="Quitar foto"
                      >
                        <X className="h-3 w-3 stroke-[2.5]" />
                      </button>
                      <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-mono text-white/90">
                        #{idx + 1}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Botones de Acción */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCancelModalOrder(null)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition"
              >
                Volver
              </button>
              <button
                type="button"
                disabled={savingCancel}
                onClick={handleConfirmCancelled}
                className="flex-1 py-2 px-4 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl shadow-md shadow-rose-600/25 active:scale-95 transition flex items-center justify-center gap-1.5"
              >
                <X className="h-4 w-4 stroke-[2.5]" />
                <span>{savingCancel ? 'Guardando...' : 'Confirmar No Realizado'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Ver Constancia y Foto del Motivo Cancelado */}
      {cancelDetailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-sm rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-2xl space-y-3.5 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl">
                  <AlertTriangle className="h-4 w-4 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Constancia No Realizado
                  </h3>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Job #{cancelDetailOrder.job_id} • {cancelDetailOrder.address}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCancelDetailOrder(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Motivo Detallado */}
            <div className="p-3 rounded-2xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 space-y-1">
              <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider block">
                Motivo Registrado:
              </span>
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">
                {cancelDetailOrder.cancel_reason || 'Sin motivo detallado'}
              </p>
            </div>

            {/* Foto de Evidencia / Constancia */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                  Foto de Constancia:
                </span>
                {cancelDetailPhotos.length > 0 && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                    ✓ {cancelDetailPhotos.length} {cancelDetailPhotos.length === 1 ? 'foto registrada' : 'fotos registradas'}
                  </span>
                )}
              </div>

              {/* Botones Siempre Arriba a Primera Vista */}
              <div className="grid grid-cols-2 gap-2">
                {/* Botón Cámara */}
                <label className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl border border-dashed border-rose-300 dark:border-rose-700/60 hover:border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-xs font-bold cursor-pointer transition active:scale-95 text-center">
                  <Camera className="h-4 w-4 shrink-0" />
                  <span>Cámara</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleAddPhotoToCancelled}
                    className="hidden"
                  />
                </label>

                {/* Botón Galería */}
                <label className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-rose-500 bg-slate-50 dark:bg-slate-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 text-xs font-bold cursor-pointer transition active:scale-95 text-center">
                  <ImageIcon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
                  <span>Galería / Fotos</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleAddPhotoToCancelled}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Contenido de Fotos Abajo */}
              {loadingCancelPhotos ? (
                <div className="py-4 text-center text-xs text-slate-400">Cargando constancia...</div>
              ) : cancelDetailPhotos.length > 0 ? (
                <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 scrollbar-thin">
                  {cancelDetailPhotos.map((photo, idx) => (
                    <div
                      key={photo.id}
                      className="relative w-24 h-16 flex-shrink-0 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm bg-slate-100 dark:bg-slate-800 group"
                    >
                      <img
                        src={photo.photo_data || `/uploads/${photo.filename}`}
                        alt={`Constancia ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <a
                        href={photo.photo_data || `/uploads/${photo.filename}`}
                        target="_blank"
                        rel="noreferrer"
                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-white font-bold transition backdrop-blur-[1px]"
                        title="Ver foto completa en nueva pestaña"
                      >
                        Ver ↗
                      </a>
                      <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-mono text-white/90">
                        #{idx + 1}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-center text-slate-400 dark:text-slate-500 py-1.5 font-medium">
                  No hay fotos adjuntas todavía
                </p>
              )}
            </div>

            {/* Botones de Acción */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCancelDetailOrder(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition"
              >
                Cerrar
              </button>

              <button
                type="button"
                onClick={() => {
                  handleReopenOrder(cancelDetailOrder);
                  setCancelDetailOrder(null);
                }}
                className="px-3 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition"
              >
                Reactivar Trabajo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Enviar Reporte a WhatsApp (Primero Texto, Luego Fotos) */}
      {shareModalOrder && (() => {
        const reportText = getReportText(shareModalOrder);

        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-sm rounded-t-3xl sm:rounded-2xl p-4 sm:p-5 shadow-2xl space-y-3.5 max-h-[92vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
                    <Share2 className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">
                      Reportar por WhatsApp
                    </h3>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono font-bold">
                      Orden #{shareModalOrder.job_id}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setShareModalOrder(null)}
                  className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                  title="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Burbuja con vista previa del texto */}
              <div className="bg-slate-50 dark:bg-slate-950/80 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed shadow-xs">
                {reportText}
              </div>

              {/* Botón Paso 1: Enviar primero el texto */}
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={handleSendText}
                  className={`w-full py-2.5 px-3.5 rounded-xl font-black text-xs flex items-center justify-between transition shadow-md ${
                    shareStep1Done
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 active:scale-95'
                      : 'bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-500/25 active:scale-95 ring-2 ring-emerald-400/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-950/10 dark:bg-white/10 flex items-center justify-center font-mono text-[11px] font-bold">1</span>
                    <span>{shareStep1Done ? 'Reenviar Texto del Trabajo' : '1. Enviar Texto del Trabajo'}</span>
                  </div>
                  {shareStep1Done ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                      <Check className="h-3.5 w-3.5 stroke-[3]" />
                      <span>Enviado</span>
                    </span>
                  ) : (
                    <Share2 className="h-3.5 w-3.5" />
                  )}
                </button>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 px-1">
                  Abre WhatsApp con los datos completos listos para que el supervisor los reciba primero.
                </p>
              </div>

              {/* Botón Paso 2: Enviar fotos para que bajen justo después */}
              {loadingSharePhotos ? (
                <div className="py-2 text-center text-xs text-slate-400">Cargando fotos...</div>
              ) : shareOrderPhotos.length > 0 ? (
                <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                  <button
                    type="button"
                    onClick={handleSendPhotos}
                    disabled={sharingId === shareModalOrder.id}
                    className={`w-full py-2.5 px-3.5 rounded-xl font-black text-xs flex items-center justify-between transition shadow-md ${
                      shareStep1Done
                        ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-500/25 active:scale-95 animate-pulse ring-2 ring-emerald-400/40'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 active:scale-95'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-950/10 dark:bg-white/10 flex items-center justify-center font-mono text-[11px] font-bold">2</span>
                      <span>
                        {sharingId === shareModalOrder.id 
                          ? 'Preparando fotos...' 
                          : `2. Enviar Fotos (${shareOrderPhotos.length})`}
                      </span>
                    </div>
                    <Camera className="h-3.5 w-3.5" />
                  </button>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 px-1">
                    Envía las fotos para que bajen justo debajo del mensaje en el chat.
                  </p>

                  {/* Tira compacta de fotos */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                    {shareOrderPhotos.map((p, idx) => (
                      <div key={p.id} className="relative w-16 h-12 flex-shrink-0 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800">
                        <img src={p.photo_data || `/uploads/${p.filename}`} alt="" className="w-full h-full object-cover" />
                        <span className="absolute bottom-0.5 left-0.5 bg-black/70 text-[8px] text-white px-1 rounded font-mono">
                          #{idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-[10px] text-slate-400 italic text-center py-1">
                  Sin fotos de evidencia registradas.
                </div>
              )}

              {/* Botón Cerrar y Opción Todo en Uno */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                {shareOrderPhotos.length > 0 && (
                  <button
                    type="button"
                    onClick={handleShareAllInOne}
                    disabled={sharingAllInOne}
                    className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 hover:underline"
                  >
                    {sharingAllInOne ? 'Enviando...' : 'O enviar fotos + texto a la vez'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShareModalOrder(null)}
                  className="ml-auto px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition"
                >
                  Listo
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal para Añadir Trabajo Manualmente */}
      <AddJobModal
        isOpen={isAddJobOpen}
        onClose={() => setIsAddJobOpen(false)}
        onJobAdded={onOrderUpdated}
        defaultTech="Javier (P0G1)"
      />

      {/* Modal para Edición Completa de Trabajo */}
      <EditJobModal
        order={editingOrder}
        isOpen={Boolean(editingOrder)}
        onClose={() => setEditingOrder(null)}
        onJobUpdated={() => {
          setEditingOrder(null);
          if (onOrderUpdated) onOrderUpdated();
        }}
      />
    </div>
  );
}
