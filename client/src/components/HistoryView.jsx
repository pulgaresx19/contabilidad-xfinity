import React, { useState, useEffect } from 'react';
import { 
  Calendar, CheckCircle2, Clock, Share2, Check, 
  Trash2, ExternalLink, Image as ImageIcon, X, DollarSign, 
  Ruler, ChevronRight, Copy, Camera, AlertCircle, FileText, 
  ShieldAlert, CheckCircle, Search, Filter, Sparkles, MapPin, Phone
} from 'lucide-react';

export default function HistoryView({ orders = [], summaryData, onRefresh, onOpenPhotos }) {
  const [subTab, setSubTab] = useState('weeks'); // 'weeks' | 'all_orders' | 'sheets'
  const [selectedWeekModal, setSelectedWeekModal] = useState(null); // Week object for overlay modal
  const [copiedWeekKey, setCopiedWeekKey] = useState(null);
  const [copiedJobId, setCopiedJobId] = useState(null);
  const [updatingWeekKey, setUpdatingWeekKey] = useState(null);

  // General orders search and status filter
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL');

  // Sheets state
  const [sheets, setSheets] = useState([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  const weeks = summaryData?.weeks || [];

  const fetchSheets = async () => {
    try {
      setLoadingSheets(true);
      const res = await fetch('/api/dispatch-sheets');
      if (res.ok) {
        const data = await res.json();
        setSheets(data);
      }
    } catch (err) {
      console.error('Error fetching sheets:', err);
    } finally {
      setLoadingSheets(false);
    }
  };

  useEffect(() => {
    if (subTab === 'sheets') {
      fetchSheets();
    }
  }, [subTab]);

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
    let extraLine = '';
    if (order.drop_footage > 300) {
      const extraBlocks = Math.floor((order.drop_footage - 300) / 100);
      if (extraBlocks > 0) extraLine += `\n📏 *Bono Metraje (>300 ft):* +$${extraBlocks * 25}`;
    }
    if (order.manual_adjustment && order.manual_adjustment !== 0) {
      extraLine += `\n⚖️ *Ajuste Supervisor:* ${order.manual_adjustment > 0 ? `+$${order.manual_adjustment}` : `-$${Math.abs(order.manual_adjustment)}`} (${order.adjustment_reason || 'Inconsistencia'})`;
    }

    const text = `📋 *COMPROBANTE DE TRABAJO - XFINITY*
🔢 *Work Order #:* ${order.job_id}
📅 *Fecha Ejecución:* ${order.work_date}
📍 *Dirección:* ${order.address}, ${order.city}
📏 *Metraje Instalado:* ${order.drop_footage} ft (${order.cable_type})${extraLine}
🚧 *Bore:* ${order.bore_type && order.bore_type !== 'N' ? order.bore_type : 'Ninguno'}
📸 *Fotos de Evidencia:* ${order.photos_count || 0} archivada(s)
💵 *Monto Total:* $${order.rate_calculated}
✅ *Estado:* ${order.status}`;

    navigator.clipboard.writeText(text);
    setCopiedJobId(order.id);
    setTimeout(() => setCopiedJobId(null), 2500);
  };

  const handleDeleteSheet = async (id) => {
    if (!confirm('¿Eliminar esta foto del historial?')) return;
    try {
      const res = await fetch(`/api/dispatch-sheets/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchSheets();
      }
    } catch (err) {
      alert('Error eliminando: ' + err.message);
    }
  };

  return (
    <div className="space-y-4 max-w-md mx-auto">
      {/* 1. SELECTOR SUPERIOR DE 3 SUBPESTAÑAS */}
      <div className="bg-slate-900 p-1 rounded-2xl border border-slate-800 grid grid-cols-3 gap-1 shadow-sm">
        <button
          onClick={() => setSubTab('weeks')}
          className={`py-2 text-[11px] font-bold rounded-xl transition text-center ${
            subTab === 'weeks'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Cierres ({weeks.length})
        </button>

        <button
          onClick={() => setSubTab('all_orders')}
          className={`py-2 text-[11px] font-bold rounded-xl transition text-center ${
            subTab === 'all_orders'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Historial ({orders.length})
        </button>

        <button
          onClick={() => setSubTab('sheets')}
          className={`py-2 text-[11px] font-bold rounded-xl transition text-center ${
            subTab === 'sheets'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Hojas ({sheets.length})
        </button>
      </div>

      {/* SUBTAB 1: LISTADO DE CIERRES SEMANALES */}
      {subTab === 'weeks' && (
        <div className="space-y-2.5">
          {weeks.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-xs">
              No hay semanas registradas aún.
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
                  className="bg-slate-900/90 border border-slate-800 hover:border-cyan-500/50 rounded-2xl p-3.5 cursor-pointer transition select-none space-y-2.5 shadow-sm active:scale-[0.99] group"
                >
                  {/* Fila Superior */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-white font-mono group-hover:text-cyan-400 transition">
                          Semana {w.displayLabel || w.key}
                        </span>
                        {/* Estado de Cobro Badge */}
                        {w.isPaid ? (
                          <span className="text-[10px] text-emerald-400 bg-emerald-950/80 border border-emerald-700/60 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Cobrado
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-300 bg-amber-950/80 border border-amber-700/60 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                            Pendiente
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {w.startDate} al {w.endDate} • {completedCount} de {w.totalJobs} hechos
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-base font-black text-emerald-400 font-mono block">
                        ${w.totalEarnings.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-amber-300/80 font-mono">
                        {Math.round(w.totalFootage)} ft
                      </span>
                    </div>
                  </div>

                  {/* Fila Inferior con Botón de Cobro Directo */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                    <span className="text-[10px] text-slate-500">
                      Toca para ver el detalle y evidencias
                    </span>

                    <div className="flex items-center gap-2">
                      {w.isPaid ? (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={(e) => handleTogglePayment(w, 'Pendiente', e)}
                          className="px-2.5 py-1 bg-emerald-950/60 hover:bg-rose-950/60 text-emerald-400 hover:text-rose-300 border border-emerald-800/50 hover:border-rose-700/50 rounded-xl text-[10px] font-bold flex items-center gap-1 transition"
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
                          className="px-2.5 py-1 bg-amber-500/20 hover:bg-emerald-500 hover:text-slate-950 text-amber-300 border border-amber-500/40 rounded-xl text-[10px] font-black flex items-center gap-1 transition shadow-sm active:scale-95"
                          title="Confirmar que recibiste el pago de esta semana"
                        >
                          <DollarSign className="h-3 w-3" />
                          <span>Confirmar Cobro</span>
                        </button>
                      )}

                      <div className="h-6 w-6 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-400 group-hover:text-cyan-400 group-hover:border-cyan-500/40 transition flex-shrink-0">
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

      {/* SUBTAB 2: HISTORIAL GENERAL DE TODOS LOS TRABAJOS (CON BUSCADOR Y FILTROS) */}
      {subTab === 'all_orders' && (
        <div className="space-y-3">
          {/* BUSCADOR GENERAL INTELIGENTE (INCLUYE CABLES RG6 Y RG11) */}
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por Job #, dirección, cable (RG6/RG11), ciudad..."
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-9 pr-8 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition shadow-sm"
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

          {/* Filtros de Estado Exclusivos: Todos, Hechos, Pendientes, Cancelados */}
          <div className="grid grid-cols-4 gap-1.5 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setOrderStatusFilter('ALL')}
              className={`py-2 px-1 rounded-xl text-center transition ${
                orderStatusFilter === 'ALL'
                  ? 'bg-cyan-500 text-slate-950 font-black shadow-sm'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Todos ({orders.length})
            </button>
            <button
              type="button"
              onClick={() => setOrderStatusFilter('Completado')}
              className={`py-2 px-1 rounded-xl text-center transition ${
                orderStatusFilter === 'Completado'
                  ? 'bg-emerald-500 text-slate-950 font-black shadow-sm'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Hechos ({orders.filter(o => o.status === 'Completado').length})
            </button>
            <button
              type="button"
              onClick={() => setOrderStatusFilter('Pendiente')}
              className={`py-2 px-1 rounded-xl text-center transition ${
                orderStatusFilter === 'Pendiente'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Pendientes ({orders.filter(o => o.status === 'Pendiente').length})
            </button>
            <button
              type="button"
              onClick={() => setOrderStatusFilter('No Realizado')}
              className={`py-2 px-1 rounded-xl text-center transition ${
                orderStatusFilter === 'No Realizado'
                  ? 'bg-rose-500 text-slate-950 font-black shadow-sm'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Cancelados ({orders.filter(o => o.status === 'No Realizado').length})
            </button>
          </div>

          {/* Listado de Órdenes Filtradas */}
          {filteredAllOrders.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-xs">
              No se encontraron trabajos con los filtros actuales.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAllOrders.map((order, idx) => {
                const isComp = order.status === 'Completado';
                const isCanc = order.status === 'No Realizado';
                const hasBore = order.bore_type && order.bore_type.includes('DW');

                return (
                  <div
                    key={order.id}
                    className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 space-y-2 text-xs shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {/* Número en círculo */}
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-black font-mono shadow-sm flex-shrink-0 ${
                          isComp
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : isCanc
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
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
                        <span className="font-mono font-black text-emerald-400">
                          ${order.rate_calculated}
                        </span>
                      </div>
                    </div>

                    {/* Dirección */}
                    <div className="text-slate-200">
                      <p className="font-semibold">{order.address}</p>
                      <p className="text-[10px] text-slate-400">{order.city} {order.zip_code}</p>
                    </div>

                    {/* Specs */}
                    <div className="flex flex-wrap items-center gap-1 text-[10px] font-mono">
                      <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-amber-300 font-bold">
                        {order.drop_footage} ft
                      </span>
                      <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
                        {order.cable_type}
                      </span>
                      {hasBore && (
                        <span className="bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800 font-bold">
                          DW Bore +$30
                        </span>
                      )}
                      {order.drop_footage > 300 && Math.floor((order.drop_footage - 300) / 100) > 0 && (
                        <span className="bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800 font-bold">
                          Drop &gt;300ft: +${Math.floor((order.drop_footage - 300) / 100) * 25}
                        </span>
                      )}
                      {order.manual_adjustment && order.manual_adjustment !== 0 ? (
                        <span className={`px-2 py-0.5 rounded border text-[9px] ${
                          order.manual_adjustment > 0 ? 'bg-cyan-950 text-cyan-300 border-cyan-800' : 'bg-amber-950 text-amber-300 border-amber-800'
                        }`}>
                          Ajuste {order.manual_adjustment > 0 ? `+$${order.manual_adjustment}` : `-$${Math.abs(order.manual_adjustment)}`}
                        </span>
                      ) : null}
                    </div>

                    {/* Footer de la tarjeta con Fotos y Copiar Comprobante */}
                    <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between">
                      {onOpenPhotos ? (
                        <button
                          onClick={() => onOpenPhotos(order)}
                          className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1"
                        >
                          <Camera className="h-3 w-3" />
                          <span>{order.photos_count || 0} Fotos</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono">
                          {order.photos_count || 0} fotos
                        </span>
                      )}

                      <button
                        onClick={() => copySingleJobClaim(order)}
                        className="text-[10px] text-slate-300 hover:text-white bg-slate-800 px-2.5 py-1 rounded-lg flex items-center gap-1 transition"
                      >
                        {copiedJobId === order.id ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-400" />
                            <span className="text-emerald-400 font-bold">¡Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3 text-cyan-400" />
                            <span>Copiar Comprobante</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 3: HOJAS DE RUTA (FOTOS DE DESPACHO) */}
      {subTab === 'sheets' && (
        <div className="space-y-3">
          {loadingSheets ? (
            <div className="text-center py-8 text-slate-500 text-xs">Cargando fotos de despacho...</div>
          ) : sheets.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-1">
              <ImageIcon className="h-8 w-8 text-slate-600 mx-auto mb-1" />
              <p className="text-xs text-slate-300 font-semibold">Sin fotos de hojas todavía.</p>
              <p className="text-[10px] text-slate-500">Usa "Escanear Hoja" en Jornada para registrar una.</p>
            </div>
          ) : (
            sheets.map((s) => (
              <div
                key={s.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex items-center gap-3 shadow-sm"
              >
                <div
                  onClick={() => setSelectedPhoto(`/uploads/${s.filename}`)}
                  className="h-16 w-20 rounded-xl overflow-hidden bg-slate-950 flex-shrink-0 cursor-pointer border border-slate-800 relative group"
                >
                  <img src={`/uploads/${s.filename}`} alt="" className="w-full h-full object-cover group-hover:scale-105 transition" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-70 group-hover:opacity-100">
                    <ExternalLink className="h-4 w-4 text-white" />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs text-cyan-400 font-mono font-bold">
                    <Calendar className="h-3 w-3" />
                    <span>{s.sheet_date}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 font-semibold truncate">
                    {s.original_name || 'Hoja de Ruta'}
                  </p>
                  <span className="text-[10px] text-emerald-400 font-mono">
                    {s.orders_count || 0} órdenes registradas
                  </span>
                </div>

                <button
                  onClick={() => handleDeleteSheet(s.id)}
                  className="p-1.5 text-slate-500 hover:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* COMPONENTE SUPERPUESTO (MODAL DETALLADO DE LA SEMANA CON BOTÓN DE LA CRUZ) */}
      {selectedWeekModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-md p-0 sm:p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
            {/* Header del Modal con la Cruz */}
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-black text-white font-mono">
                    Semana {selectedWeekModal.displayLabel || selectedWeekModal.key}
                  </span>
                  {selectedWeekModal.isPaid ? (
                    <span className="text-[10px] text-emerald-400 bg-emerald-950 border border-emerald-800 px-2 py-0.5 rounded-full font-bold">
                      Cobrado ✓
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-300 bg-amber-950 border border-amber-800 px-2 py-0.5 rounded-full font-bold">
                      Pendiente
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedWeekModal.startDate} al {selectedWeekModal.endDate} • {selectedWeekModal.orders.length} trabajos
                </p>
              </div>

              {/* BOTÓN DE LA CRUZ (CERRAR) */}
              <button
                onClick={() => setSelectedWeekModal(null)}
                className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-800 transition active:scale-95"
                title="Cerrar ventana"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Cuerpo del Modal con Scroll */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {/* Resumen Financiero y Reclamación */}
              <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">
                      Total Producido Esta Semana
                    </span>
                    <span className="text-2xl font-black text-emerald-400 font-mono">
                      ${selectedWeekModal.totalEarnings.toFixed(2)}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">
                      Metraje Total
                    </span>
                    <span className="text-base font-black text-amber-300 font-mono">
                      {Math.round(selectedWeekModal.totalFootage)} ft
                    </span>
                  </div>
                </div>

                {/* Botones de Auditoría / Confirmación de Cobro */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                  <button
                    onClick={() => copyAuditStatement(selectedWeekModal)}
                    className="py-2.5 px-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20 active:scale-95 transition"
                  >
                    {copiedWeekKey === selectedWeekModal.key ? (
                      <>
                        <Check className="h-4 w-4 stroke-[3]" />
                        <span>¡Constancia Copiada!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        <span>Copiar Auditoría de Reclamación</span>
                      </>
                    )}
                  </button>

                  {selectedWeekModal.isPaid ? (
                    <button
                      onClick={() => handleTogglePayment(selectedWeekModal, 'Pendiente')}
                      className="py-2.5 px-3 bg-emerald-950/80 hover:bg-rose-950/80 text-emerald-400 hover:text-rose-300 border border-emerald-800/80 hover:border-rose-700/80 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95"
                    >
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                      <span>Cobrado (Toca para Pendiente)</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleTogglePayment(selectedWeekModal, 'Cobrado')}
                      className="py-2.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 transition active:scale-95"
                    >
                      <DollarSign className="h-4 w-4 stroke-[3]" />
                      <span>Confirmar Pago Recibido</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Listado Completo de Trabajos y Evidencias de esa Semana */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1 text-[11px] font-bold text-slate-400 uppercase">
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
                      className={`bg-slate-950/70 border rounded-2xl p-3 space-y-2 text-xs ${
                        isComp 
                          ? 'border-slate-800' 
                          : isCanc 
                          ? 'border-rose-900/40 bg-rose-950/10'
                          : 'border-amber-900/40'
                      }`}
                    >
                      {/* Job Header con Número en Círculo */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-black font-mono shadow-sm flex-shrink-0 ${
                            isComp
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : isCanc
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
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

                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                            isComp ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : isCanc ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          }`}>
                            {order.status}
                          </span>
                          <span className="font-mono font-black text-emerald-400">
                            ${order.rate_calculated}
                          </span>
                        </div>
                      </div>

                      {/* Dirección del Cliente */}
                      <div className="text-slate-200">
                        <p className="font-semibold">{order.address}</p>
                        <p className="text-[10px] text-slate-400">{order.city} {order.zip_code}</p>
                      </div>

                      {/* Especificaciones */}
                      <div className="flex flex-wrap items-center gap-1 text-[10px] font-mono">
                        <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-amber-300 font-bold">
                          {order.drop_footage} ft
                        </span>
                        <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
                          {order.cable_type}
                        </span>
                        {hasBore && (
                          <span className="bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800 font-bold">
                            DW Bore +$30
                          </span>
                        )}
                        {order.drop_footage > 300 && Math.floor((order.drop_footage - 300) / 100) > 0 && (
                          <span className="bg-emerald-950/80 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800 font-bold">
                            Drop &gt;300ft: +${Math.floor((order.drop_footage - 300) / 100) * 25}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded border text-[9px] ${
                          order.payment_status === 'Cobrado'
                            ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400'
                            : 'bg-amber-950/60 border-amber-800 text-amber-300'
                        }`}>
                          {order.payment_status || 'Pendiente'}
                        </span>
                      </div>

                      {/* Badge de Ajuste del Supervisor si existe */}
                      {order.manual_adjustment !== undefined && order.manual_adjustment !== 0 && (
                        <div className={`p-2 rounded-xl border text-[10px] flex items-center justify-between gap-1.5 ${
                          order.manual_adjustment > 0
                            ? 'bg-cyan-950/40 border-cyan-800/60 text-cyan-300'
                            : 'bg-amber-950/40 border-amber-800/60 text-amber-300'
                        }`}>
                          <span>
                            <strong>Ajuste Supervisor ({order.manual_adjustment > 0 ? `+$${order.manual_adjustment}` : `-$${Math.abs(order.manual_adjustment)}`}):</strong> {order.adjustment_reason || 'Inconsistencia acordada'}
                          </span>
                        </div>
                      )}

                      {/* Galería de Fotos de Evidencia de esa Orden */}
                      <div className="pt-1.5 border-t border-slate-800/80">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                            <Camera className="h-3 w-3 text-cyan-400" />
                            <span>Fotos de Evidencia ({photos.length})</span>
                          </span>

                          <button
                            onClick={() => copySingleJobClaim(order)}
                            className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1 font-semibold"
                          >
                            {copiedJobId === order.id ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-400" />
                                <span className="text-emerald-400">¡Copiado!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>Copiar Comprobante</span>
                              </>
                            )}
                          </button>
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
                                onClick={() => setSelectedPhoto(`/uploads/${p.filename}`)}
                                className="h-14 w-16 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex-shrink-0 cursor-pointer relative group"
                              >
                                <img 
                                  src={`/uploads/${p.filename}`} 
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

            {/* Footer con Botón de Cerrar */}
            <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/70 flex justify-end">
              <button
                onClick={() => setSelectedWeekModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition active:scale-95"
              >
                Cerrar Detalle
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
    </div>
  );
}
