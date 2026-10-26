import React, { useState } from 'react';
import { Plus, X, Check, AlertCircle, Phone, MapPin, Ruler, DollarSign, FileText } from 'lucide-react';
import { getLocalDateStr } from '../utils/dateUtils';

export default function AddJobModal({ isOpen, onClose, onJobAdded, defaultTech }) {
  const [formData, setFormData] = useState({
    work_date: getLocalDateStr(),
    tech_id: defaultTech || 'Javier (P0G1)',
    job_id: '',
    address: '',
    city: 'ELKHART',
    zip_code: '46516',
    phone: '',
    call_first: false,
    drop_footage: '',
    cable_type: 'RG-6',
    bore_type: 'N',
    rate_calculated: 100,
    raw_notes: '',
    status: 'Pendiente',
    payment_status: 'Pendiente'
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  // Handle bore change and auto-update price
  const handleBoreChange = (bore) => {
    const isDW = bore.includes('DW');
    setFormData(prev => ({
      ...prev,
      bore_type: bore,
      rate_calculated: isDW ? 130 : 100
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.job_id.trim() || !formData.address.trim()) {
      setError('Por favor ingresa el número de trabajo y la dirección.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          drop_footage: parseFloat(formData.drop_footage) || 0,
          rate_calculated: parseFloat(formData.rate_calculated) || 100
        })
      });

      const data = await res.json();
      if (res.ok) {
        onJobAdded();
        onClose();
      } else {
        setError(data.error || 'Error al guardar el trabajo.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-md p-0 sm:p-4 animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header con botón de la cruz X */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-cyan-500/10 text-cyan-400 rounded-xl">
              <Plus className="h-4 w-4 stroke-[3]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Añadir Trabajo a la Jornada</h3>
              <p className="text-[10px] text-slate-400">Ingreso manual de orden asignada</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-800 transition"
            title="Cerrar ventana"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-4 overflow-y-auto space-y-3.5 flex-1 text-xs">
          {error && (
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Fila 1: Job ID y Fecha */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                Número de Trabajo (Work Order #) *
              </label>
              <input
                type="text"
                required
                placeholder="ej. 734521"
                value={formData.job_id}
                onChange={(e) => setFormData({ ...formData, job_id: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-cyan-400 font-mono font-bold focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                Fecha
              </label>
              <input
                type="date"
                required
                value={formData.work_date}
                onChange={(e) => setFormData({ ...formData, work_date: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          </div>

          {/* Fila 2: Dirección y Ciudad */}
          <div className="space-y-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                Dirección de la Vivienda *
              </label>
              <input
                type="text"
                required
                placeholder="ej. 1024 Prairie St"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-slate-100 font-semibold focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Ciudad</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Teléfono del Cliente</label>
                <input
                  type="tel"
                  placeholder="ej. 5741234567"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Fila 3: Metraje y Cable */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                Pies de Cable (Drop ft)
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="ej. 110"
                value={formData.drop_footage}
                onChange={(e) => setFormData({ ...formData, drop_footage: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-amber-300 font-mono font-bold focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                Tipo de Cable
              </label>
              <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, cable_type: 'RG-6' })}
                  className={`py-1 rounded-lg font-bold text-center transition ${formData.cable_type === 'RG-6' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'}`}
                >
                  RG-6
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, cable_type: 'RG-11' })}
                  className={`py-1 rounded-lg font-bold text-center transition ${formData.cable_type === 'RG-11' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'}`}
                >
                  RG-11
                </button>
              </div>
            </div>
          </div>

          {/* Fila 4: Cruce (Bore DW) y Tarifa */}
          <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                Cruce de Entrada (Driveway Bore)
              </span>
              <span className="text-sm font-black text-emerald-400 font-mono">
                ${formData.rate_calculated}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleBoreChange('N')}
                className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition text-center ${
                  formData.bore_type === 'N'
                    ? 'bg-slate-800 text-white border-cyan-500/50 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}
              >
                Sin Cruce ($100)
              </button>

              <button
                type="button"
                onClick={() => handleBoreChange('DW:1')}
                className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition text-center ${
                  formData.bore_type === 'DW:1'
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}
              >
                Con Driveway DW (+$30 = $130)
              </button>
            </div>
          </div>

          {/* Checkbox Call First */}
          <label className="flex items-center gap-2 cursor-pointer select-none bg-slate-950/40 p-2 rounded-xl border border-slate-800/60">
            <input
              type="checkbox"
              checked={formData.call_first}
              onChange={(e) => setFormData({ ...formData, call_first: e.target.checked })}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0"
            />
            <span className="text-slate-300 font-medium text-[11px]">
              Llamar al cliente antes de llegar (Call First)
            </span>
          </label>

          {/* Remarks / Notas extras */}
          <div>
            <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
              Remarks / Datos Extras u Obstáculos
            </label>
            <textarea
              rows={2}
              placeholder="ej. Obstáculos: cerca trasera, perro guardado, zanja por el lateral..."
              value={formData.raw_notes}
              onChange={(e) => setFormData({ ...formData, raw_notes: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl p-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Botones de acción */}
          <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20 active:scale-95 transition"
            >
              <Check className="h-4 w-4 stroke-[3]" />
              <span>{saving ? 'Guardando...' : 'Añadir Trabajo a Pendientes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
