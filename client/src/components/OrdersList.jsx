import React, { useState } from 'react';
import { 
  Search, Camera, Copy, Check, Trash2, Edit3, MapPin, 
  Phone, AlertTriangle, Shield, CheckCircle2, Clock, DollarSign
} from 'lucide-react';

export default function OrdersList({ orders, onOpenPhotos, onOrderUpdated, onDeleteOrder }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [cableFilter, setCableFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [copiedId, setCopiedId] = useState(null);

  // Filter orders
  const filteredOrders = orders.filter((o) => {
    const matchesSearch = 
      o.job_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.phone && o.phone.includes(searchTerm));

    const matchesCable = cableFilter === 'ALL' || o.cable_type === cableFilter;
    const matchesPayment = paymentFilter === 'ALL' || o.payment_status === paymentFilter;

    return matchesSearch && matchesCable && matchesPayment;
  });

  // Copy formatted WhatsApp report for supervisor
  const copyReportForSupervisor = (order) => {
    const text = `📋 *REPORTE DE TRABAJO - XFINITY*
📅 *Fecha:* ${order.work_date}
👤 *Técnico:* ${order.tech_id}
🔢 *Work Order #:* ${order.job_id}
📍 *Dirección:* ${order.address}, ${order.city}
📏 *Drop:* ${order.drop_footage} ft (${order.cable_type})
🛠️ *Bore:* ${order.bore_type !== 'N' ? order.bore_type : 'Ninguno'}
⚠️ *Obstáculos:* ${order.obstacles !== 'N' ? order.obstacles : 'Ninguno'}
📸 *Fotos:* ${order.photos_count || 0} evidencia(s) registradas
💵 *Valor:* $${order.rate_calculated}
✅ *Estado:* ${order.status}`;

    navigator.clipboard.writeText(text);
    setCopiedId(order.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Quick toggle payment status
  const handlePaymentStatusToggle = async (order) => {
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
      alert('Error actualizando estado de cobro: ' + err.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por Work Order #, dirección, teléfono..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Cable Type Filter */}
          <div className="flex items-center bg-slate-950 rounded-xl p-1 border border-slate-800 text-xs">
            <button
              onClick={() => setCableFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${cableFilter === 'ALL' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'}`}
            >
              Todos
            </button>
            <button
              onClick={() => setCableFilter('RG-6')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${cableFilter === 'RG-6' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'}`}
            >
              RG-6
            </button>
            <button
              onClick={() => setCableFilter('RG-11')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${cableFilter === 'RG-11' ? 'bg-purple-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
            >
              RG-11
            </button>
          </div>

          {/* Payment Status Filter */}
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Todos los Cobros</option>
            <option value="En Fondo (3 Sem)">En Fondo (3 Sem)</option>
            <option value="Listo para Cobro">Listo para Cobro</option>
            <option value="Cobrado">Cobrado</option>
          </select>
        </div>
      </div>

      {/* Results Count & Quick Stats */}
      <div className="flex items-center justify-between px-2 text-xs text-slate-400">
        <span>Mostrando {filteredOrders.length} orden(es) de trabajo</span>
        <span className="font-semibold text-emerald-400">
          Total Seleccionado: ${filteredOrders.reduce((sum, o) => sum + (o.rate_calculated || 0), 0).toFixed(2)}
        </span>
      </div>

      {/* Orders List / Table */}
      {filteredOrders.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <p className="text-slate-400 text-sm">No se encontraron órdenes con esos criterios de búsqueda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => (
            <div
              key={order.id}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 transition shadow-sm space-y-3"
            >
              {/* Row 1: Header (Job ID, Date, Tech, Payment Status) */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-base font-extrabold text-cyan-400 font-mono tracking-tight">
                    #{order.job_id}
                  </span>
                  <span className="text-xs bg-slate-800 border border-slate-700 text-slate-300 px-2 py-0.5 rounded-md font-mono">
                    {order.work_date}
                  </span>
                  {order.call_first === 1 && (
                    <span className="text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Phone className="h-3 w-3" /> CALL FIRST
                    </span>
                  )}
                </div>

                {/* Payment Status Pill */}
                <button
                  onClick={() => handlePaymentStatusToggle(order)}
                  title="Clic para cambiar estado de cobro"
                  className={`text-xs px-2.5 py-1 rounded-full font-bold transition flex items-center gap-1.5 ${
                    order.payment_status === 'Cobrado'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30'
                      : order.payment_status === 'Listo para Cobro'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30'
                      : 'bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25'
                  }`}
                >
                  {order.payment_status === 'Cobrado' ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <Clock className="h-3.5 w-3.5" />
                  )}
                  <span>{order.payment_status}</span>
                </button>
              </div>

              {/* Row 2: Address & Technical Details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                {/* Address & City */}
                <div className="flex items-start gap-2 text-xs sm:text-sm text-slate-200">
                  <MapPin className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">{order.address}</p>
                    <p className="text-xs text-slate-400">{order.city} {order.zip_code}</p>
                  </div>
                </div>

                {/* Technical Specs: Drop, Cable, Bore */}
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                  <div className="bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg">
                    <span className="text-slate-400">Drop: </span>
                    <span className="text-amber-300 font-bold">{order.drop_footage} ft</span>
                  </div>

                  <span className={`px-2 py-1 rounded-lg text-xs font-bold ${
                    order.cable_type === 'RG-11'
                      ? 'bg-purple-900/60 text-purple-300 border border-purple-700'
                      : 'bg-slate-950 border border-slate-800 text-slate-300'
                  }`}>
                    {order.cable_type}
                  </span>

                  {order.bore_type && order.bore_type !== 'N' && (
                    <span className="bg-cyan-950 text-cyan-300 border border-cyan-800 px-2 py-1 rounded-lg font-bold">
                      Bore: {order.bore_type}
                    </span>
                  )}

                  {order.obstacles && order.obstacles !== 'N' && (
                    <span className="bg-slate-950 border border-slate-800 text-slate-400 px-2 py-1 rounded-lg text-[11px]">
                      Obst: {order.obstacles}
                    </span>
                  )}
                </div>

                {/* Earnings & Actions */}
                <div className="flex items-center justify-between md:justify-end gap-3">
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Cobro</span>
                    <span className="text-lg font-extrabold text-emerald-400 font-mono">
                      ${order.rate_calculated}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 border-l border-slate-800 pl-3">
                    {/* Photos button */}
                    <button
                      onClick={() => onOpenPhotos(order)}
                      title="Ver / Subir Fotos"
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg text-slate-200 transition"
                    >
                      <Camera className="h-4 w-4 text-cyan-400" />
                      <span>{order.photos_count || 0}</span>
                    </button>

                    {/* Copy WhatsApp report */}
                    <button
                      onClick={() => copyReportForSupervisor(order)}
                      title="Copiar reporte para WhatsApp del supervisor"
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition"
                    >
                      {copiedId === order.id ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => onDeleteOrder(order.id)}
                      title="Eliminar orden"
                      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
