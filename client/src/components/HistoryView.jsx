import React, { useState, useEffect } from 'react';
import { 
  Calendar, CheckCircle2, Clock, Share2, Check, 
  Trash2, ExternalLink, Image as ImageIcon, X, DollarSign, Ruler
} from 'lucide-react';

export default function HistoryView({ summaryData, onRefresh }) {
  const [subTab, setSubTab] = useState('weeks'); // 'weeks' | 'sheets'
  const [copiedWeekKey, setCopiedWeekKey] = useState(null);

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

  const copyWeeklySummary = (w) => {
    const jobList = w.orders.map(o => `  • Job #${o.job_id}: ${o.address} (${o.drop_footage} ft) - $${o.rate_calculated}`).join('\n');
    const text = `📊 *CIERRE SEMANAL - XFINITY*
📅 *Semana:* ${w.key} (${w.startDate} al ${w.endDate})
🔢 *Total Trabajos:* ${w.totalJobs} órdenes
📏 *Metraje:* ${Math.round(w.totalFootage)} ft
💰 *TOTAL PRODUCIDO:* $${w.totalEarnings.toFixed(2)}
⏳ *Fecha de Cobro (+3 sem):* ${w.payoutDueDate}

📋 *Detalle:*
${jobList}`;

    navigator.clipboard.writeText(text);
    setCopiedWeekKey(w.key);
    setTimeout(() => setCopiedWeekKey(null), 2500);
  };

  const markWeekAsPaid = async (w) => {
    if (!confirm(`¿Marcar todas las ${w.totalJobs} órdenes de la semana ${w.key} como COBRADAS?`)) return;

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

      {/* SUBTAB 1: CIERRES SEMANALES */}
      {subTab === 'weeks' && (
        <div className="space-y-3">
          {weeks.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-xs">
              No hay semanas registradas aún.
            </div>
          ) : (
            weeks.map((w) => (
              <div
                key={w.key}
                className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-sm"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-black text-white font-mono">{w.key}</span>
                    <span className="text-[10px] text-slate-400 block">
                      {w.startDate} al {w.endDate}
                    </span>
                  </div>

                  <span className="text-base font-black text-emerald-400 font-mono">
                    ${w.totalEarnings.toFixed(2)}
                  </span>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Trabajos & Metraje</span>
                    <span className="font-bold text-slate-200">
                      {w.totalJobs} órdenes • {Math.round(w.totalFootage)} ft
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block">Cobro Estimado (+3 sem)</span>
                    <span className="font-bold text-cyan-300 font-mono">{w.payoutDueDate}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1.5">
                    {w.statusCount['En Fondo (3 Sem)'] > 0 && (
                      <span className="text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-bold">
                        {w.statusCount['En Fondo (3 Sem)']} en fondo
                      </span>
                    )}
                    {w.statusCount['Cobrado'] > 0 && (
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                        {w.statusCount['Cobrado']} cobradas
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => copyWeeklySummary(w)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1"
                    >
                      {copiedWeekKey === w.key ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          <span className="text-emerald-400 text-[11px]">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="h-3 w-3" />
                          <span className="text-[11px]">WhatsApp</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => markWeekAsPaid(w)}
                      className="px-2.5 py-1 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold rounded-lg flex items-center gap-1"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Cobrada</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* SUBTAB 2: HOJAS DE RUTA (FOTOS) */}
      {subTab === 'sheets' && (
        <div className="space-y-3">
          {loadingSheets ? (
            <div className="text-center py-8 text-slate-500 text-xs">Cargando fotos...</div>
          ) : sheets.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-1">
              <ImageIcon className="h-8 w-8 text-slate-600 mx-auto mb-1" />
              <p className="text-xs text-slate-300 font-semibold">Sin fotos de hojas todavía.</p>
              <p className="text-[10px] text-slate-500">Usa "Escanear" desde Inicio para capturar la primera.</p>
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

      {/* Fullscreen Viewer */}
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
              alt="Hoja completa"
              className="max-h-[85vh] w-auto max-w-full rounded-xl object-contain border border-slate-800"
            />
          </div>
        </div>
      )}
    </div>
  );
}
