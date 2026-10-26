import React, { useState } from 'react';
import { Sparkles, FileText, Plus, Check, AlertCircle, ArrowRight } from 'lucide-react';
import { getLocalDateStr } from '../utils/dateUtils';

export default function AddOrderModal({ onOrderCreated, defaultTech = 'Javier (P0G1)' }) {
  const [mode, setMode] = useState('paste'); // 'paste' | 'manual'

  // Smart Paste State
  const [rawText, setRawText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [previewOrders, setPreviewOrders] = useState([]);
  const [importing, setImporting] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Manual Form State
  const [formData, setFormData] = useState({
    work_date: getLocalDateStr(),
    tech_id: defaultTech,
    job_id: '',
    address: '',
    city: 'ELKHART',
    zip_code: '',
    phone: '',
    call_first: false,
    drop_footage: '',
    cable_type: 'RG-6',
    bore_type: 'N',
    is_temp: false,
    obstacles: 'N',
    premise_access: 'N',
    neighbor_notice: 'N',
    rate_calculated: 100,
    payment_status: 'Pendiente'
  });

  // Handle parsing dispatch rows
  const handleParse = async () => {
    if (!rawText.trim()) return;
    setParsing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/parse-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText })
      });
      const data = await res.json();
      if (res.ok) {
        setPreviewOrders(data.parsed || []);
        if (data.parsed.length === 0) {
          setErrorMsg('No se detectaron filas válidas con el formato de despacho.');
        }
      } else {
        setErrorMsg(data.error || 'Error al procesar el texto.');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setParsing(false);
    }
  };

  // Import parsed batch
  const handleBatchImport = async () => {
    if (previewOrders.length === 0) return;
    setImporting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/batch-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: previewOrders })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`¡Se importaron ${data.count} órdenes con éxito!`);
        setRawText('');
        setPreviewOrders([]);
        onOrderCreated();
      } else {
        setErrorMsg(data.error || 'Error importando órdenes.');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setImporting(false);
    }
  };

  // Handle manual submit
  const handleManualSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`¡Orden #${data.job_id} agregada exitosamente!`);
        setFormData({
          work_date: getLocalDateStr(),
          tech_id: defaultTech,
          job_id: '',
          address: '',
          city: 'ELKHART',
          zip_code: '',
          phone: '',
          call_first: false,
          drop_footage: '',
          cable_type: 'RG-6',
          bore_type: 'N',
          is_temp: false,
          obstacles: 'N',
          premise_access: 'N',
          neighbor_notice: 'N',
          rate_calculated: 100,
          payment_status: 'Pendiente'
        });
        onOrderCreated();
      } else {
        setErrorMsg(data.error || 'Error al guardar la orden.');
      }
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Tab Switcher */}
      <div className="flex bg-slate-900 p-1.5 rounded-xl border border-slate-800 w-fit">
        <button
          onClick={() => { setMode('paste'); setErrorMsg(null); setSuccessMsg(null); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition ${
            mode === 'paste'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          <span>Pegado Inteligente (Recomendado)</span>
        </button>
        <button
          onClick={() => { setMode('manual'); setErrorMsg(null); setSuccessMsg(null); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition ${
            mode === 'manual'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Ingreso Manual</span>
        </button>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-3 text-emerald-400 text-sm">
          <Check className="h-5 w-5 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-3 text-rose-400 text-sm">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* MODE 1: SMART PASTE */}
      {mode === 'paste' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-cyan-400" />
              Pegar Fila(s) de Despacho de Comcast / Xfinity
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Copia directamente desde tu mensaje o archivo de Excel y pégalo aquí. El sistema extraerá automáticamente la fecha, Work Order, dirección, metraje, tipo de cable (RG-6/RG-11), cruces (BORE) y obstáculos.
            </p>
          </div>

          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={5}
            placeholder={`Ejemplo:\n10-22-2026\t${defaultTech}\t626746\t23322 IRONWOOD DR,\tELKHART\t46516-6254\tCALLFIRST/P#:2094475840/DROP:103.73/Type:RG-11/BORE:DW:1/TEMP:Y/Obstacles:SPRKLR,LANDSC/Premise ACS:RQHM/NBR:2`}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl p-3 text-xs sm:text-sm font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
          />

          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500">
              {rawText ? `${rawText.split('\n').filter(Boolean).length} línea(s) detectada(s)` : 'Pega una o varias filas'}
            </span>
            <button
              onClick={handleParse}
              disabled={parsing || !rawText.trim()}
              className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 font-bold text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-cyan-600/20"
            >
              <span>{parsing ? 'Analizando...' : 'Analizar Fila(s)'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {/* Preview Table */}
          {previewOrders.length > 0 && (
            <div className="mt-6 pt-6 border-t border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">Vista Previa de Extracción ({previewOrders.length} órdenes)</h4>
                  <p className="text-xs text-slate-400">Verifica los datos antes de guardarlos en tu contabilidad.</p>
                </div>
                <button
                  onClick={handleBatchImport}
                  disabled={importing}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  <Check className="h-4 w-4" />
                  <span>{importing ? 'Guardando...' : `Importar ${previewOrders.length} Órdenes`}</span>
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-semibold">
                    <tr>
                      <th className="px-3 py-2">Job #</th>
                      <th className="px-3 py-2">Dirección</th>
                      <th className="px-3 py-2">Metraje</th>
                      <th className="px-3 py-2">Cable</th>
                      <th className="px-3 py-2">Bore</th>
                      <th className="px-3 py-2">Obstáculos</th>
                      <th className="px-3 py-2 text-right">Tarifa Est.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {previewOrders.map((o, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="px-3 py-2 font-bold text-cyan-400">{o.job_id}</td>
                        <td className="px-3 py-2 text-slate-200 font-sans">{o.address}, {o.city}</td>
                        <td className="px-3 py-2 text-amber-300">{o.drop_footage} ft</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${o.cable_type === 'RG-11' ? 'bg-purple-900/60 text-purple-300 border border-purple-700' : 'bg-slate-800 text-slate-300'}`}>
                            {o.cable_type}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-300">{o.bore_type !== 'N' ? o.bore_type : '-'}</td>
                        <td className="px-3 py-2 text-slate-400">{o.obstacles !== 'N' ? o.obstacles : '-'}</td>
                        <td className="px-3 py-2 text-right font-bold text-emerald-400">${o.rate_calculated}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODE 2: MANUAL FORM */}
      {mode === 'manual' && (
        <form onSubmit={handleManualSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Plus className="h-5 w-5 text-cyan-400" />
            Ingresar Orden de Trabajo Manualmente
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Fecha</label>
              <input
                type="date"
                required
                value={formData.work_date}
                onChange={(e) => setFormData({ ...formData, work_date: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Tech ID / Identificador</label>
              <input
                type="text"
                required
                value={formData.tech_id}
                onChange={(e) => setFormData({ ...formData, tech_id: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Job ID / Work Order #</label>
              <input
                type="text"
                required
                placeholder="ej. 626746"
                value={formData.job_id}
                onChange={(e) => setFormData({ ...formData, job_id: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1">Dirección del Cliente</label>
              <input
                type="text"
                required
                placeholder="ej. 23322 IRONWOOD DR"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Ciudad</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Metraje (Drop en pies)</label>
              <input
                type="number"
                step="0.01"
                placeholder="ej. 103.73"
                value={formData.drop_footage}
                onChange={(e) => setFormData({ ...formData, drop_footage: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Tipo de Cable</label>
              <select
                value={formData.cable_type}
                onChange={(e) => setFormData({ ...formData, cable_type: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="RG-6">RG-6 (Estándar)</option>
                <option value="RG-11">RG-11 (Larga distancia / Grueso)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Perforación (BORE)</label>
              <select
                value={formData.bore_type}
                onChange={(e) => setFormData({ ...formData, bore_type: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="N">Ninguno (N)</option>
                <option value="DW:1">Driveway Bore (DW:1)</option>
                <option value="SW:1">Sidewalk Bore (SW:1)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Ganancia / Cobro ($)</label>
              <input
                type="number"
                step="0.5"
                value={formData.rate_calculated}
                onChange={(e) => setFormData({ ...formData, rate_calculated: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-emerald-400 font-bold focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-sm rounded-xl transition shadow-lg shadow-cyan-600/20"
            >
              Guardar Orden de Trabajo
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
