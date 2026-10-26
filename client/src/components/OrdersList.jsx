import React, { useState } from 'react';
import { 
  Search, Camera, Copy, Check, Trash2, MapPin, 
  Phone, Clock, CheckCircle2, ChevronRight, AlertCircle, Plus
} from 'lucide-react';

export default function OrdersList({ orders, onOpenPhotos, onOrderUpdated, onDeleteOrder, onOpenScan }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'BORE' | 'FONDO' | 'COBRADO'
  const [copiedId, setCopiedId] = useState(null);

  // Filter orders
  const filteredOrders = orders.filter((o) => {
    const matchesSearch = 
      o.job_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.phone && o.phone.includes(searchTerm));

    if (!matchesSearch) return false;

    if (filter === 'BORE') return o.bore_type && o.bore_type.includes('DW');
    if (filter === 'FONDO') return o.payment_status === 'En Fondo (3 Sem)';
    if (filter === 'COBRADO') return o.payment_status === 'Cobrado';

    return true;
  });

  // Copy WhatsApp message for supervisor
  const copyWhatsAppReport = (order) => {
    const text = `📋 *REPORTE DE TRABAJO*
📅 *Fecha:* ${order.work_date}
🔢 *Orden #:* ${order.job_id}
📍 *Dirección:* ${order.address}${order.city ? `, ${order.city}` : ''}
📏 *Drop:* ${order.drop_footage} ft (${order.cable_type})${order.bore_type && order.bore_type !== 'N' ? `\n🛠️ *Bore:* ${order.bore_type}` : ''}
💵 *Tarifa:* $${order.rate_calculated}
✅ *Estado:* Completado y Verificado`;

    navigator.clipboard.writeText(text);
    setCopiedId(order.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Toggle payment status: En Fondo -> Listo para Cobro -> Cobrado
  const togglePaymentStatus = async (order) => {
    let nextStatus = 'En Fondo (3 Sem)';
    if (order.payment_status === 'En Fondo (3 Sem)') nextStatus = 'Listo para Cobro';
    else if (order.payment_status === 'Listo para Cobro') nextStatus = 'Cobrado';
    else if (order.payment_status === 'Cobrado') nextStatus = 'En Fondo (3 Sem)';

    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...order, payment_status: nextStatus })
      });
      if (res.ok) {
        onOrderUpdated();
      }
    } catch (err) {
      alert('Error actualizando cobro: ' + err.message);
    }
  };

  return (
    <div className="space-y-3 max-w-md mx-auto">
      {/* Search & Filter Bar */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por Job #, dirección, teléfono..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] no-scrollbar">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-3 py-1 rounded-full font-bold whitespace-nowrap transition ${
              filter === 'ALL'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            Todos ({orders.length})
          </button>
          <button
            onClick={() => setFilter('BORE')}
            className={`px-3 py-1 rounded-full font-bold whitespace-nowrap transition ${
              filter === 'BORE'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            Con Bore DW (+$30)
          </button>
          <button
            onClick={() => setFilter('FONDO')}
            className={`px-3 py-1 rounded-full font-bold whitespace-nowrap transition ${
              filter === 'FONDO'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            En Fondo
          </button>
          <button
            onClick={() => setFilter('COBRADO')}
            className={`px-3 py-1 rounded-full font-bold whitespace-nowrap transition ${
              filter === 'COBRADO'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            Cobrados
          </button>
        </div>
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-2">
          <p className="text-xs text-slate-400">No hay órdenes con este filtro.</p>
          <button
            onClick={onOpenScan}
            className="px-3 py-1.5 bg-cyan-600 text-slate-950 font-bold text-xs rounded-xl"
          >
            Escanear Hoja
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredOrders.map((order) => {
            const hasDrivewayBore = order.bore_type && order.bore_type.includes('DW');

            return (
              <div
                key={order.id}
                className="bg-slate-900/90 border border-slate-800/90 hover:border-slate-700/80 rounded-2xl p-3.5 space-y-2.5 shadow-sm transition"
              >
                {/* Top Row: Job ID, Status Pill, Rate */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-cyan-400 font-mono">
                      #{order.job_id}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {order.work_date}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Payment status pill button */}
                    <button
                      onClick={() => togglePaymentStatus(order)}
                      title="Toca para cambiar estado de cobro"
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold transition flex items-center gap-1 ${
                        order.payment_status === 'Cobrado'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : order.payment_status === 'Listo para Cobro'
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                      }`}
                    >
                      {order.payment_status === 'Cobrado' ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <Clock className="h-3 w-3" />
                      )}
                      <span>{order.payment_status}</span>
                    </button>

                    {/* Price */}
                    <span className="text-base font-black text-emerald-400 font-mono">
                      ${order.rate_calculated}
                    </span>
                  </div>
                </div>

                {/* Address Row */}
                <div className="flex items-start gap-1.5 text-xs text-slate-200">
                  <MapPin className="h-3.5 w-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                  <div className="truncate">
                    <p className="font-semibold truncate">{order.address}</p>
                    <p className="text-[10px] text-slate-400">{order.city} {order.zip_code}</p>
                  </div>
                </div>

                {/* Technical Badges Row: Drop footage, Cable, Bore */}
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
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

                  {order.obstacles && order.obstacles !== 'N' && (
                    <span className="bg-slate-950 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800 text-[9px]">
                      {order.obstacles}
                    </span>
                  )}
                </div>

                {/* Bottom Action Buttons Row */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                  {/* Photo Evidence button */}
                  <button
                    onClick={() => onOpenPhotos(order)}
                    className="flex items-center gap-1 px-2 py-1 bg-slate-950 hover:bg-slate-800 text-[11px] text-slate-300 rounded-lg border border-slate-800 transition"
                  >
                    <Camera className="h-3.5 w-3.5 text-cyan-400" />
                    <span>{order.photos_count || 0} fotos</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    {/* WhatsApp share */}
                    <button
                      onClick={() => copyWhatsAppReport(order)}
                      title="Copiar reporte WhatsApp para supervisor"
                      className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-200 rounded-lg transition"
                    >
                      {copiedId === order.id ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          <span className="text-emerald-400">¡Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>WhatsApp</span>
                        </>
                      )}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => onDeleteOrder(order.id)}
                      className="p-1 text-slate-500 hover:text-rose-400 transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
