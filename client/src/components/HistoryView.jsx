import React, { useState, useEffect } from 'react';
import { 
  Calendar, CheckCircle2, Clock, Share2, Check, 
  Trash2, ExternalLink, Image as ImageIcon, X, DollarSign, 
  Ruler, ChevronDown, ChevronUp, Copy, Camera, AlertCircle, FileText, ShieldAlert
} from 'lucide-react';

export default function HistoryView({ summaryData, onRefresh }) {
  const [subTab, setSubTab] = useState('weeks'); // 'weeks' | 'sheets'
  const [expandedWeeks, setExpandedWeeks] = useState({}); // { [weekKey]: boolean }
  const [copiedWeekKey, setCopiedWeekKey] = useState(null);
  const [copiedJobId, setCopiedJobId] = useState(null);

  // Sheets state
  const [sheets, setSheets] = useState([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  const weeks = summaryData?.weeks || [];

  // Default expand the first week
  useEffect(() => {
    if (weeks.length > 0 && Object.keys(expandedWeeks).length === 0) {
      setExpandedWeeks({ [weeks[0].key]: true });
    }
  }, [weeks]);

  const toggleWeek = (weekKey) => {
    setExpandedWeeks(prev => ({
      ...prev,
      [weekKey]: !prev[weekKey]
    }));
  };

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

  // Comprehensive audit statement for dispute/claim
  const copyAuditStatement = (w) => {
    const completedList = w.orders.filter(o => o.status === 'Completado');
    const jobLines = completedList.map((o, idx) => {
      const boreTxt = o.bore_type && o.bore_type.includes('DW') ? ' [DW BORE +$30]' : '';
      const photosTxt = o.photos_count > 0 ? ` (${o.photos_count} fotos de respaldo)` : ' (Sin fotos)';
      return `${idx + 1}. Job #${o.job_id} | ${o.work_date}
   📍 ${o.address}, ${o.city}
   📏 ${o.drop_footage} ft (${o.cable_type})${boreTxt}${photosTxt}
   💵 Valor: $${o.rate_calculated}`;
    }).join('\n\n');

    const text = `📁 *CONSTANCIA DE AUDITORÍA & RECLAMACIÓN - XFINITY*
📅 *Período:* Semana ${w.key} (${w.startDate} al ${w.endDate})
👤 *Técnico:* Javier (P0G1)
🔢 *Órdenes Completadas:* ${completedList.length} trabajos
📏 *Metraje Total:* ${Math.round(w.totalFootage)} ft
💰 *MONTO A COBRAR:* $${w.totalEarnings.toFixed(2)}
⏳ *Fecha Exigible de Cobro (+3 sem de fondo):* ${w.payoutDueDate}

📋 *DESGLOSE DE ÓRDENES AUDITADAS:*
${jobLines}

⚠️ *Nota:* Cada trabajo cuenta con su orden de Comcast, metraje y registro fotográfico en el sistema.`;

    navigator.clipboard.writeText(text);
    setCopiedWeekKey(w.key);
    setTimeout(() => setCopiedWeekKey(null), 3000);
  };

  // Copy proof for single order dispute
  const copySingleJobClaim = (order) => {
    const text = `📋 *COMPROBANTE DE TRABAJO - XFINITY*
🔢 *Work Order #:* ${order.job_id}
📅 *Fecha Ejecución:* ${order.work_date}
📍 *Dirección:* ${order.address}, ${order.city}
📏 *Metraje Instalado:* ${order.drop_footage} ft
🛠️ *Tipo Cable:* ${order.cable_type}
🚧 *Bore:* ${order.bore_type && order.bore_type !== 'N' ? order.bore_type : 'Ninguno'}
📸 *Fotos de Evidencia:* ${order.photos_count || 0} archivada(s)
💵 *Monto:* $${order.rate_calculated}
✅ *Estado:* ${order.status}`;

    navigator.clipboard.writeText(text);
    setCopiedJobId(order.id);
    setTimeout(() => setCopiedJobId(null), 2500);
  };

  const markWeekAsPaid = async (w) => {
    if (!confirm(`¿Marcar todas las órdenes de la semana ${w.key} como COBRADAS?`)) return;

    try {
      for (const order of w.orders) {
        await fetch(`/api/orders/${order.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...order, payment_status: 'Cobrado' })
        });
      }
      onRefresh();
    } catch (err) {
      alert('Error actualizando semana: ' + err.message);
    }
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
      {/* Segmented Switcher */}
      <div className="bg-slate-900 p-1 rounded-2xl border border-slate-800 flex items-center">
        <button
          onClick={() => setSubTab('weeks')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition ${
            subTab === 'weeks'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Cierres Semanales ({weeks.length})
        </button>

        <button
          onClick={() => setSubTab('sheets')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition ${
            subTab === 'sheets'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Hojas de Ruta (Fotos)
        </button>
      </div>

      {/* SUBTAB 1: CIERRES SEMANALES CON HISTORIAL DESPLEGABLE */}
      {subTab === 'weeks' && (
        <div className="space-y-3">
          {weeks.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-xs">
              No hay semanas registradas aún.
            </div>
          ) : (
            weeks.map((w) => {
              const isExpanded = !!expandedWeeks[w.key];
              const completedCount = w.orders.filter(o => o.status === 'Completado').length;

              return (
                <div
                  key={w.key}
                  className="bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-sm transition"
                >
                  {/* ACCORDION HEADER (FLECHAR PARA EXPANDIR) */}
                  <div
                    onClick={() => toggleWeek(w.key)}
                    className="p-4 cursor-pointer hover:bg-slate-800/40 transition select-none flex items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-white font-mono">{w.key}</span>
                        <span className="text-[10px] text-cyan-400 bg-cyan-950 border border-cyan-800 px-2 py-0.2 rounded-full font-bold">
                          Cobro: {w.payoutDueDate}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {w.startDate} al {w.endDate} • {completedCount} de {w.totalJobs} hechos
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-base font-black text-emerald-400 font-mono block">
                          ${w.totalEarnings.toFixed(2)}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono">
                          {Math.round(w.totalFootage)} ft
                        </span>
                      </div>

                      <div className="h-7 w-7 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-400">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-cyan-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* EXPANDED CONTENT: COMPONENTE DETALLADO DE AUDITORÍA Y FOTOS */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-slate-800/80 bg-slate-950/40 space-y-3.5 animate-fade-in">
                      {/* Reclamation Action Bar */}
                      <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-300 flex items-center gap-1.5">
                            <ShieldAlert className="h-4 w-4 text-amber-400" />
                            Constancia de Cobro & Reclamación
                          </span>
                          <span className="text-[10px] text-blue-400 font-mono">
                            Fondo 3 Semanas
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-tight">
                          Si surge una disputa o retraso en el pago de esta semana, copia este reporte detallado con todas las órdenes y fotos de respaldo.
                        </p>

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => copyAuditStatement(w)}
                            className="flex-1 py-2 px-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20 active:scale-95 transition"
                          >
                            {copiedWeekKey === w.key ? (
                              <>
                                <Check className="h-3.5 w-3.5 stroke-[3]" />
                                <span>¡Constancia Copiada!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                <span>Copiar Auditoría de la Semana</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => markWeekAsPaid(w)}
                            className="py-2 px-3 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 font-bold text-xs rounded-xl flex items-center gap-1 transition"
                            title="Marcar toda la semana como cobrada"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Cobrada</span>
                          </button>
                        </div>
                      </div>

                      {/* Itemized List of Jobs in this Week */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between px-1 text-[11px] font-bold text-slate-400 uppercase">
                          <span>Historial de Trabajos ({w.orders.length})</span>
                          <span>Evidencias y Metraje</span>
                        </div>

                        {w.orders.map((order, idx) => {
                          const isComp = order.status === 'Completado';
                          const isCanc = order.status === 'No Realizado';
                          const hasBore = order.bore_type && order.bore_type.includes('DW');
                          const photos = order.photos || [];

                          return (
                            <div
                              key={order.id}
                              className={`bg-slate-900 border rounded-2xl p-3 space-y-2 text-xs ${
                                isComp 
                                  ? 'border-slate-800' 
                                  : isCanc 
                                  ? 'border-rose-900/40 bg-rose-950/10'
                                  : 'border-amber-900/40'
                              }`}
                            >
                              {/* Job Header */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] text-slate-500 font-bold">#{idx + 1}</span>
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

                              {/* Customer Address */}
                              <div className="text-slate-200">
                                <p className="font-semibold">{order.address}</p>
                                <p className="text-[10px] text-slate-400">{order.city} {order.zip_code}</p>
                              </div>

                              {/* Technical Specs */}
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
                              </div>

                              {/* Photo Evidence Gallery for this Job */}
                              <div className="pt-1.5 border-t border-slate-800/60">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                    <Camera className="h-3 w-3 text-cyan-400" />
                                    <span>Fotos de Respaldo ({photos.length})</span>
                                  </span>

                                  {/* Copy Single Job Claim */}
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
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* SUBTAB 2: HOJAS DE RUTA (FOTOS DE DESPACHO) */}
      {subTab === 'sheets' && (
        <div className="space-y-3">
          {loadingSheets ? (
            <div className="text-center py-8 text-slate-500 text-xs">Cargando fotos de despacho...</div>
          ) : sheets.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-1">
              <ImageIcon className="h-8 w-8 text-slate-600 mx-auto mb-1" />
              <p className="text-xs text-slate-300 font-semibold">Sin fotos de hojas todavía.</p>
              <p className="text-[10px] text-slate-500">Usa "Escanear" en la pestaña Jornada para tomar la primera foto.</p>
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
