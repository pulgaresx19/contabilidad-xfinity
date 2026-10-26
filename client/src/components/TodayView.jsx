import React, { useState } from 'react';
import { 
  Camera, Check, X, Phone, MapPin, Share2, Clock, 
  CheckCircle2, AlertCircle, Search, Plus, Sparkles, AlertTriangle, ArrowRight, Shield,
  SlidersHorizontal, Edit3, Minus, DollarSign
} from 'lucide-react';
import AddJobModal from './AddJobModal';

export default function TodayView({ orders, summaryData, onOpenScan, onOpenPhotos, onOrderUpdated }) {
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'Pendiente' | 'Completado' | 'No Realizado'
  const [searchTerm, setSearchTerm] = useState('');
  const [sharingId, setSharingId] = useState(null);
  const [cancelModalOrder, setCancelModalOrder] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isAddJobOpen, setIsAddJobOpen] = useState(false);

  // Manual Price Adjustment Modal State
  const [adjustModalOrder, setAdjustModalOrder] = useState(null);
  const [adjustType, setAdjustType] = useState('add'); // 'add' | 'sub'
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [savingAdjust, setSavingAdjust] = useState(false);

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

  // Daily summary calculations
  const pendingOrders = orders.filter(o => o.status === 'Pendiente');
  const completedOrders = orders.filter(o => o.status === 'Completado');
  const cancelledOrders = orders.filter(o => o.status === 'No Realizado');
  const todayEarnings = completedOrders.reduce((sum, o) => sum + (o.rate_calculated || 0), 0);
  const totalFeet = completedOrders.reduce((sum, o) => sum + (o.drop_footage || 0), 0);

  // Filtered orders list
  const filteredOrders = orders.filter(o => {
    const matchesSearch = 
      o.job_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.phone && o.phone.includes(searchTerm));

    if (!matchesSearch) return false;
    if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
    return true;
  });

  // Mark order as completed
  const handleMarkCompleted = async (order) => {
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
    setCancelReason('Sin acceso: cliente ausente o reja cerrada');
  };

  // Confirm No Realizado
  const handleConfirmCancelled = async () => {
    if (!cancelModalOrder) return;
    try {
      const res = await fetch(`/api/orders/${cancelModalOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...cancelModalOrder, 
          status: 'No Realizado', 
          cancel_reason: cancelReason || 'No realizado por inconveniente en la propiedad' 
        })
      });
      if (res.ok) {
        onOrderUpdated();
        setCancelModalOrder(null);
      }
    } catch (err) {
      alert('Error: ' + err.message);
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

  // Native WhatsApp share (with photos and text in a single block)
  const handleShareWhatsApp = async (order) => {
    setSharingId(order.id);

    let extraFootageText = '';
    if (order.drop_footage > 300) {
      const extraBlocks = Math.floor((order.drop_footage - 300) / 100);
      if (extraBlocks > 0) extraFootageText = `\n📏 *Bono Metraje Largo (>300 ft):* +$${extraBlocks * 25}`;
    }

    let adjustmentText = '';
    if (order.manual_adjustment && order.manual_adjustment !== 0) {
      adjustmentText = `\n⚖️ *Ajuste Supervisor:* ${order.manual_adjustment > 0 ? `+$${order.manual_adjustment}` : `-$${Math.abs(order.manual_adjustment)}`} (${order.adjustment_reason || 'Ajuste de precio'})`;
    }

    const reportText = `📋 *REPORTE DE TRABAJO - XFINITY*
📅 *Fecha:* ${order.work_date}
🔢 *Work Order #:* ${order.job_id}
📍 *Dirección:* ${order.address}, ${order.city}
📏 *Drop:* ${order.drop_footage} ft (${order.cable_type})${extraFootageText}
🛠️ *Bore:* ${order.bore_type && order.bore_type !== 'N' ? order.bore_type : 'Ninguno'}
⚠️ *Obstáculos:* ${order.obstacles && order.obstacles !== 'N' ? order.obstacles : 'Ninguno'}${adjustmentText}
💵 *Tarifa Cobrable:* $${order.rate_calculated}
✅ *Estado:* COMPLETADO Y VERIFICADO`;

    try {
      // First fetch the latest order with photos
      const res = await fetch(`/api/orders/${order.id}`);
      const fullOrder = await res.json();
      const photos = fullOrder.photos || [];

      // Check if browser supports sharing files (Mobile Safari / Android Chrome)
      if (navigator.canShare && photos.length > 0) {
        const filesToShare = [];
        for (let i = 0; i < photos.length; i++) {
          const p = photos[i];
          try {
            const imgRes = await fetch(`/uploads/${p.filename}`);
            const blob = await imgRes.blob();
            const file = new File([blob], `Job_${order.job_id}_evidencia_${i + 1}.jpg`, { type: 'image/jpeg' });
            filesToShare.push(file);
          } catch (e) {
            console.error('Error fetching photo blob:', e);
          }
        }

        if (filesToShare.length > 0 && navigator.canShare({ files: filesToShare })) {
          await navigator.share({
            title: `Reporte Job #${order.job_id}`,
            text: reportText,
            files: filesToShare,
          });
          setSharingId(null);
          return;
        }
      }

      // Fallback: Copy formatted text and open WhatsApp link
      await navigator.clipboard.writeText(reportText);
      const waUrl = `https://wa.me/?text=${encodeURIComponent(reportText)}`;
      window.open(waUrl, '_blank');
    } catch (err) {
      // If user cancels share sheet or error
      if (err.name !== 'AbortError') {
        navigator.clipboard.writeText(reportText);
        window.open(`https://wa.me/?text=${encodeURIComponent(reportText)}`, '_blank');
      }
    } finally {
      setSharingId(null);
    }
  };

  return (
    <div className="space-y-3.5 max-w-md mx-auto">
      {/* 1. DAILY PROGRESS HERO CARD */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-4 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block">
              Jornada de Hoy
            </span>
            <h2 className="text-xl font-black text-white font-mono mt-0.5">
              ${todayEarnings.toFixed(2)}
            </h2>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 block font-medium">Progreso de la Ruta</span>
            <span className="text-xs font-bold text-slate-200">
              <strong className="text-emerald-400 text-sm font-black">{completedOrders.length}</strong> de {orders.length} hechos
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
          <div 
            className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full rounded-full transition-all duration-500"
            style={{ width: `${orders.length > 0 ? (completedOrders.length / orders.length) * 100 : 0}%` }}
          />
        </div>

        {/* Action Buttons: Scan Dispatch Sheet & Manual Add Job */}
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
            className="py-2.5 px-3 bg-slate-800/90 hover:bg-slate-700 text-slate-100 font-extrabold text-xs rounded-2xl border border-slate-700/80 flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
          >
            <Plus className="h-4 w-4 stroke-[3] text-cyan-400" />
            <span>Añadir Trabajo</span>
          </button>
        </div>
      </div>

      {/* 2. SEARCH & STATUS FILTER TABS */}
      <div className="space-y-2">
        {/* Quick search input */}
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar casa o Job #..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Segmented status chips */}
        <div className="grid grid-cols-4 gap-1 bg-slate-900/90 p-1 rounded-2xl border border-slate-800 text-[10px] font-bold text-center">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`py-1.5 rounded-xl transition ${statusFilter === 'ALL' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'}`}
          >
            Todos ({orders.length})
          </button>
          <button
            onClick={() => setStatusFilter('Pendiente')}
            className={`py-1.5 rounded-xl transition ${statusFilter === 'Pendiente' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}
          >
            Pendientes ({pendingOrders.length})
          </button>
          <button
            onClick={() => setStatusFilter('Completado')}
            className={`py-1.5 rounded-xl transition ${statusFilter === 'Completado' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400'}`}
          >
            Hechos ({completedOrders.length})
          </button>
          <button
            onClick={() => setStatusFilter('No Realizado')}
            className={`py-1.5 rounded-xl transition ${statusFilter === 'No Realizado' ? 'bg-rose-500 text-white' : 'text-slate-400'}`}
          >
            Fallidos ({cancelledOrders.length})
          </button>
        </div>
      </div>

      {/* 3. INTERACTIVE ORDERS LIST */}
      {filteredOrders.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-1 text-slate-400 text-xs">
          <p className="font-semibold text-slate-300">No hay órdenes en esta categoría.</p>
          <p className="text-[10px]">Usa el botón de arriba para escanear la hoja del día.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredOrders.map((order, idx) => {
            const isCompleted = order.status === 'Completado';
            const isPending = order.status === 'Pendiente';
            const isCancelled = order.status === 'No Realizado';
            const hasDrivewayBore = order.bore_type && order.bore_type.includes('DW');

            return (
              <div
                key={order.id}
                className={`bg-slate-900/90 border rounded-2xl p-3.5 space-y-2.5 transition shadow-sm ${
                  isCompleted 
                    ? 'border-emerald-500/30' 
                    : isCancelled
                    ? 'border-rose-500/30 opacity-75'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Header: Item Number in Circle, Job #, Status Badge, Earnings */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {/* CIRCULAR ITEM NUMBER BADGE */}
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-black font-mono shadow-sm flex-shrink-0 ${
                      isCompleted
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : isCancelled
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    }`}>
                      {idx + 1}
                    </div>

                    <span className="text-sm font-black text-cyan-400 font-mono">
                      #{order.job_id}
                    </span>

                    {/* Status Badge */}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                      isCompleted
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : isCancelled
                        ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    }`}>
                      {isCompleted && <CheckCircle2 className="h-3 w-3" />}
                      {isPending && <Clock className="h-3 w-3" />}
                      {isCancelled && <X className="h-3 w-3" />}
                      <span>{order.status}</span>
                    </span>
                  </div>

                  {/* Clickable price to open adjustment modal */}
                  <button
                    type="button"
                    onClick={() => openAdjustModal(order)}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 rounded-xl transition group active:scale-95"
                    title="Ajustar precio o registrar cambio del supervisor"
                  >
                    <span className={`text-base font-black font-mono ${
                      isCancelled ? 'line-through text-slate-500' : 'text-emerald-400'
                    }`}>
                      ${order.rate_calculated}
                    </span>
                    <Edit3 className="h-3 w-3 text-slate-500 group-hover:text-cyan-400 transition" />
                  </button>
                </div>

                {/* Customer Address & Phone */}
                <div className="space-y-1">
                  <div className="flex items-start gap-1.5 text-xs text-slate-100">
                    <MapPin className="h-3.5 w-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">{order.address}</p>
                      <p className="text-[10px] text-slate-400">{order.city} {order.zip_code}</p>
                    </div>
                  </div>

                  {order.phone && (
                    <div className="flex items-center gap-2 pl-5 text-[11px]">
                      <a 
                        href={`tel:${order.phone}`} 
                        className="text-cyan-400 hover:underline flex items-center gap-1 font-mono"
                      >
                        <Phone className="h-3 w-3" />
                        <span>{order.phone}</span>
                      </a>
                      {order.call_first === 1 && (
                        <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-1.5 py-0.2 rounded font-bold">
                          CALL FIRST
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Tech Specs: Drop, Cable, Bore */}
                <div className="flex flex-wrap items-center gap-1 text-[10px] font-mono">
                  <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-amber-300 font-bold">
                    {order.drop_footage} ft
                  </span>

                  <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
                    {order.cable_type}
                  </span>

                  {hasDrivewayBore ? (
                    <span className="bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800 font-bold">
                      DW Bore: +$30
                    </span>
                  ) : order.bore_type && order.bore_type !== 'N' ? (
                    <span className="bg-slate-950 text-slate-300 px-2 py-0.5 rounded border border-slate-800">
                      Bore: {order.bore_type}
                    </span>
                  ) : null}

                  {/* Bono por Metraje Largo (>300 ft) */}
                  {order.drop_footage > 300 && Math.floor((order.drop_footage - 300) / 100) > 0 && (
                    <span className="bg-emerald-950/80 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800 font-bold">
                      Drop &gt;300ft: +${Math.floor((order.drop_footage - 300) / 100) * 25}
                    </span>
                  )}

                  {order.obstacles && order.obstacles !== 'N' && (
                    <span className="bg-slate-950 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800 text-[9px]">
                      {order.obstacles}
                    </span>
                  )}
                </div>

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
                      onClick={() => openAdjustModal(order)}
                      className="text-[10px] text-cyan-400 hover:text-cyan-300 underline font-semibold flex-shrink-0"
                    >
                      Editar
                    </button>
                  </div>
                )}

                {/* If Cancelled: Show Reason */}
                {isCancelled && order.cancel_reason && (
                  <div className="bg-rose-950/30 border border-rose-500/30 p-2 rounded-xl text-[10px] text-rose-300 flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong>Motivo:</strong> {order.cancel_reason}
                    </div>
                  </div>
                )}

                {/* Action Buttons Area */}
                <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  {/* Photo Evidence button */}
                  <button
                    onClick={() => onOpenPhotos(order)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-950 hover:bg-slate-800 text-[11px] font-bold text-cyan-300 border border-slate-800 rounded-xl transition"
                  >
                    <Camera className="h-3.5 w-3.5 text-cyan-400" />
                    <span>{order.photos_count || 0} Fotos</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    {/* If Pendiente: Confirm or Cancel */}
                    {isPending && (
                      <>
                        <button
                          onClick={() => openCancelModal(order)}
                          className="px-2 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold rounded-xl transition"
                        >
                          No Realizado
                        </button>

                        <button
                          onClick={() => handleMarkCompleted(order)}
                          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black rounded-xl transition flex items-center gap-1 shadow-md shadow-emerald-500/20 active:scale-95"
                        >
                          <Check className="h-3.5 w-3.5 stroke-[3]" />
                          <span>Confirmar</span>
                        </button>
                      </>
                    )}

                    {/* If Completado: WhatsApp Share */}
                    {isCompleted && (
                      <button
                        onClick={() => handleShareWhatsApp(order)}
                        disabled={sharingId === order.id}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-extrabold rounded-xl transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95"
                      >
                        <Share2 className="h-3.5 w-3.5 stroke-[2.5]" />
                        <span>{sharingId === order.id ? 'Preparando...' : 'WhatsApp (Fotos + Datos)'}</span>
                      </button>
                    )}

                    {/* If Cancelled: Reopen button */}
                    {isCancelled && (
                      <button
                        onClick={() => handleReopenOrder(order)}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-xl"
                      >
                        Reactivar Trabajo
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Marcar como No Realizado */}
      {cancelModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 w-full max-w-sm space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-400" />
              Marcar Trabajo como No Realizado
            </h3>
            <p className="text-[11px] text-slate-400">
              Job #{cancelModalOrder.job_id} ({cancelModalOrder.address})
            </p>

            <div>
              <label className="text-[10px] text-slate-400 block font-semibold mb-1">
                Motivo / Razón:
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                placeholder="ej. Sin acceso a patio, cliente no estaba, reja cerrada con perro, etc."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setCancelModalOrder(null)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs font-semibold rounded-lg"
              >
                Volver
              </button>
              <button
                onClick={handleConfirmCancelled}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg transition"
              >
                Confirmar No Realizado
              </button>
            </div>
          </div>
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
              {/* Header */}
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

              {/* Dirección */}
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 text-xs">
                <p className="font-bold text-slate-200">{adjustModalOrder.address}</p>
                <p className="text-[10px] text-slate-400">{adjustModalOrder.city}</p>
              </div>

              {/* Desglose Automático */}
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

              {/* Ajuste Manual: Sumar o Restar */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-300 block">
                  Ajuste / Inconsistencia del Supervisor:
                </label>

                {/* Switch Sumar vs Restar */}
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

                {/* Campo de Monto */}
                <div className="relative">
                  <span className={`absolute left-3 top-2.5 text-xs font-mono font-black ${
                    adjustType === 'add' ? 'text-emerald-400' : 'text-amber-400'
                  }`}>
                    {adjustType === 'add' ? '+$' : '-$'}
                  </span>
                  <input
                    type="number"
                    step="1"
                    placeholder="Monto a ajustar (ej. 30 o 25)"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs sm:text-sm text-white font-mono font-bold focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Chips rápidos de monto común */}
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

              {/* Motivo de la Inconsistencia */}
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

              {/* Previsualización del Total Final */}
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

              {/* Botones de acción */}
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

      {/* Modal para Añadir Trabajo Manualmente */}
      <AddJobModal
        isOpen={isAddJobOpen}
        onClose={() => setIsAddJobOpen(false)}
        onJobAdded={onOrderUpdated}
        defaultTech="Javier (P0G1)"
      />
    </div>
  );
}
