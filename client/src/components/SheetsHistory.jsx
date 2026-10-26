import React, { useState, useEffect } from 'react';
import { History, Calendar, FileText, Trash2, ExternalLink, Image as ImageIcon, X } from 'lucide-react';

export default function SheetsHistory({ onSelectDate }) {
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  const fetchSheets = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/dispatch-sheets');
      if (res.ok) {
        const data = await res.json();
        setSheets(data);
      }
    } catch (err) {
      console.error('Error fetching sheets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSheets();
  }, []);

  const handleDeleteSheet = async (id) => {
    if (!confirm('¿Eliminar esta foto del historial de hojas de ruta?')) return;
    try {
      const res = await fetch(`/api/dispatch-sheets/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchSheets();
      }
    } catch (err) {
      alert('Error eliminando hoja: ' + err.message);
    }
  };

  return (
    <div className="space-y-4 max-w-lg mx-auto pb-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-xl">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Historial de Hojas de Ruta</h2>
            <p className="text-[11px] text-slate-400">Fotos guardadas de los despachos diarios</p>
          </div>
        </div>
        <span className="text-xs bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded-full">
          {sheets.length} hoja(s)
        </span>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400 text-xs">Cargando historial de hojas...</div>
      ) : sheets.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-2">
          <ImageIcon className="h-10 w-10 text-slate-600 mx-auto" />
          <p className="text-sm font-medium text-slate-300">Aún no hay hojas de ruta en el historial.</p>
          <p className="text-xs text-slate-500">Usa la pestaña "Escanear" para tomar la primera foto de tu jornada.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sheets.map((sheet) => (
            <div
              key={sheet.id}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-3.5 flex items-center gap-3 transition shadow-sm"
            >
              {/* Photo Thumbnail */}
              <div
                onClick={() => setSelectedPhoto(`/uploads/${sheet.filename}`)}
                className="h-20 w-24 rounded-xl overflow-hidden bg-slate-950 flex-shrink-0 relative group cursor-pointer border border-slate-800"
              >
                <img
                  src={`/uploads/${sheet.filename}`}
                  alt={sheet.original_name}
                  className="w-full h-full object-cover group-hover:scale-105 transition"
                />
                <div className="absolute inset-0 bg-black/40 group-hover:bg-transparent transition flex items-center justify-center">
                  <ExternalLink className="h-4 w-4 text-white opacity-80 group-hover:opacity-100" />
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-cyan-400 font-mono font-bold">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{sheet.sheet_date}</span>
                </div>
                <p className="text-xs font-semibold text-slate-200 truncate">
                  {sheet.original_name || 'Despacho Diario'}
                </p>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 font-mono text-emerald-400 font-semibold">
                    {sheet.orders_count || 0} órdenes registradas
                  </span>
                </div>
              </div>

              {/* Action */}
              <button
                onClick={() => handleDeleteSheet(sheet.id)}
                title="Eliminar del historial"
                className="p-2 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Fullscreen Photo Modal */}
      {selectedPhoto && (
        <div
          onClick={() => setSelectedPhoto(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center">
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute -top-10 right-0 p-2 text-white hover:text-cyan-400"
            >
              <X className="h-6 w-6" />
            </button>
            <img
              src={selectedPhoto}
              alt="Hoja completa"
              className="max-h-[85vh] w-auto max-w-full rounded-xl object-contain border border-slate-800 shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
