import React, { useState } from 'react';
import { Plus, X, Check, AlertCircle, Phone, MapPin, Ruler, DollarSign, Calendar, Sparkles } from 'lucide-react';
import { getLocalDateStr } from '../utils/dateUtils';

export default function AddJobModal({ isOpen, onClose, onJobAdded, defaultTech }) {
  const [formData, setFormData] = useState({
    work_date: getLocalDateStr(),
    tech_id: defaultTech || 'Javier (P0G1)',
    job_id: '',
    address: '',
    city: '',
    zip_code: '',
    phone: '',
    call_first: false,
    drop_footage: '',
    cable_type: 'RG-6',
    bore_type: 'N',
    raw_notes: '',
    status: 'Pendiente',
    payment_status: 'Pendiente'
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  // Cálculo Dinámico de Tarifa Xfinity:
  // - Tarifa Base: $100
  // - Driveway Bore (DW): +$30
  // - Bono Metraje Largo (>300 ft): +$25 por cada 100 ft adicionales completos sobre 300
  const numFootage = parseFloat(formData.drop_footage) || 0;
  const isDW = formData.bore_type && formData.bore_type.includes('DW');
  const boreBonus = isDW ? 30 : 0;
  const extraBlocks = numFootage > 300 ? Math.floor((numFootage - 300) / 100) : 0;
  const footageBonus = extraBlocks > 0 ? extraBlocks * 25 : 0;
  const currentTotal = 100 + boreBonus + footageBonus;

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
          city: (formData.city || '').trim().toUpperCase(),
          drop_footage: numFootage,
          rate_calculated: currentTotal
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2.5 sm:p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-lg rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[94vh] overflow-hidden transition-colors mx-auto">
        {/* Header Compacto */}
        <div className="px-3.5 sm:px-4 py-2 sm:py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 rounded-lg">
              <Plus className="h-4 w-4 stroke-[3]" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-tight">
                Añadir Trabajo a la Jornada
              </h3>
              <p className="text-[9px] text-slate-500 dark:text-slate-400">
                Ingreso rápido de orden de trabajo
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition"
            title="Cerrar ventana"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Formulario Compacto - Todo a primera vista */}
        <form onSubmit={handleSubmit} className="p-3 sm:p-4 overflow-y-auto space-y-2 sm:space-y-2.5 flex-1 text-xs">
          {error && (
            <div className="p-2 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-600 dark:text-rose-300 text-[11px] flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Saldo / Tarifa Dinámica con Desglose Inmediato */}
          <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/15 to-emerald-500/10 dark:from-emerald-950/40 dark:via-emerald-900/30 dark:to-emerald-950/40 border border-emerald-500/30 rounded-xl px-3 py-1.5 flex items-center justify-between gap-2 shadow-xs shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">
                  Tarifa Estimada:
                </span>
                <span className="text-[11px] font-mono text-slate-700 dark:text-slate-300 font-semibold">
                  Base $100
                  {boreBonus > 0 && <strong className="text-cyan-600 dark:text-cyan-400 font-bold"> +$30 DW</strong>}
                  {footageBonus > 0 && <strong className="text-emerald-600 dark:text-emerald-400 font-bold"> +${footageBonus} Drop</strong>}
                </span>
              </div>
              {footageBonus > 0 ? (
                <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold truncate">
                  ✓ Bono metraje: {extraBlocks} tramo(s) de 100 ft sobre 300 ft
                </p>
              ) : numFootage > 300 ? (
                <p className="text-[9px] text-slate-400 truncate">
                  Drop &gt;300 ft (bono +$25 aplica a partir de 400 ft)
                </p>
              ) : null}
            </div>

            {/* Medallón Dinero */}
            <div className="flex items-center gap-0.5 px-2.5 py-1 bg-emerald-500 text-slate-950 rounded-xl font-mono font-black shadow-xs shrink-0">
              <span className="text-[10px]">$</span>
              <span className="text-base sm:text-lg leading-none">{currentTotal}</span>
            </div>
          </div>

          {/* Fila 1: Job ID y Fecha (Lineales lado a lado en 2 columnas 50% / 50%) */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="min-w-0">
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 truncate">
                Work Order # (Job ID) *
              </label>
              <input
                type="text"
                required
                placeholder="ej. 734521"
                value={formData.job_id}
                onChange={(e) => setFormData({ ...formData, job_id: e.target.value })}
                className="w-full h-10 min-w-0 box-border bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2 text-cyan-700 dark:text-cyan-400 font-mono font-bold focus:outline-none focus:border-cyan-500 text-xs shadow-2xs"
                style={{ height: '40px', minHeight: '40px', maxHeight: '40px', fontSize: '12px', lineHeight: 'normal' }}
              />
            </div>

            <div className="min-w-0">
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1 truncate">
                Fecha Asignada
              </label>
              <input
                type="date"
                required
                value={formData.work_date}
                onChange={(e) => setFormData({ ...formData, work_date: e.target.value })}
                className="w-full h-10 min-w-0 box-border bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500 font-mono font-bold text-xs [color-scheme:light] dark:[color-scheme:dark] shadow-2xs"
                style={{ height: '40px', minHeight: '40px', maxHeight: '40px', fontSize: '12px', lineHeight: 'normal' }}
              />
            </div>
          </div>

          {/* Fila 2: Dirección de la Vivienda */}
          <div>
            <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-0.5">
              Dirección de la Vivienda *
            </label>
            <div className="relative">
              <MapPin className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
              <input
                type="text"
                required
                placeholder="ej. 1024 Prairie St"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full min-w-0 box-border bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700/80 rounded-xl pl-8 pr-2.5 py-1.5 text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-cyan-500 text-xs"
              />
            </div>
          </div>

          {/* Fila 3: Ciudad (Manual) y Teléfono (Lineales lado a lado) */}
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-0.5 truncate">
                Ciudad (Manual)
              </label>
              <input
                type="text"
                placeholder="ej. Skokie, Elkhart"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full min-w-0 box-border bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700/80 rounded-xl px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500 uppercase font-semibold text-xs"
              />
            </div>

            <div className="min-w-0">
              <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-0.5 truncate">
                Teléfono del Cliente
              </label>
              <div className="relative">
                <Phone className="h-3 w-3 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
                <input
                  type="tel"
                  placeholder="ej. 5741234567"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full min-w-0 box-border bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700/80 rounded-xl pl-7 pr-2 py-1.5 text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-cyan-500 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Fila 4: Pies de Cable y Selector de Cable (Lineales lado a lado) */}
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider truncate">
                  Pies (Drop ft)
                </label>
                {footageBonus > 0 && (
                  <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                    +${footageBonus}
                  </span>
                )}
              </div>
              <div className="relative">
                <Ruler className="h-3 w-3 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
                <input
                  type="number"
                  step="0.1"
                  placeholder="ej. 120"
                  value={formData.drop_footage}
                  onChange={(e) => setFormData({ ...formData, drop_footage: e.target.value })}
                  className="w-full min-w-0 box-border bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700/80 rounded-xl pl-7 pr-2 py-1.5 text-amber-700 dark:text-amber-300 font-mono font-bold focus:outline-none focus:border-cyan-500 text-xs"
                />
              </div>
            </div>

            <div className="min-w-0">
              <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-0.5 truncate">
                Tipo de Cable
              </label>
              <div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-slate-950 p-0.5 rounded-xl border border-slate-200 dark:border-slate-800 h-[31px] items-center">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, cable_type: 'RG-6' })}
                  className={`h-full rounded-lg font-bold text-xs flex items-center justify-center transition ${
                    formData.cable_type === 'RG-6'
                      ? 'bg-cyan-500 text-slate-950 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  RG-6
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, cable_type: 'RG-11' })}
                  className={`h-full rounded-lg font-bold text-xs flex items-center justify-center transition ${
                    formData.cable_type === 'RG-11'
                      ? 'bg-cyan-500 text-slate-950 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  RG-11
                </button>
              </div>
            </div>
          </div>

          {/* Fila 5: Cruce de Entrada (Driveway Bore) Lineal lado a lado */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider truncate">
                Cruce de Entrada (Driveway Bore)
              </label>
              {boreBonus > 0 && (
                <span className="text-[9px] font-bold text-cyan-600 dark:text-cyan-400">
                  +$30 DW
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, bore_type: 'N' })}
                className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition text-center flex items-center justify-center gap-1 ${
                  formData.bore_type === 'N'
                    ? 'bg-white text-slate-900 border-cyan-500 dark:bg-slate-800 dark:text-white dark:border-cyan-500 shadow-xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-950 dark:text-slate-400 dark:border-slate-800'
                }`}
              >
                <span>Sin Cruce</span>
                <span className="font-mono text-[10px] text-slate-400">($100)</span>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, bore_type: 'DW:1' })}
                className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition text-center flex items-center justify-center gap-1 ${
                  formData.bore_type === 'DW:1'
                    ? 'bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border-cyan-500 shadow-xs font-black'
                    : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-950 dark:text-slate-400 dark:border-slate-800'
                }`}
              >
                <span>Con Driveway DW</span>
                <span className="font-mono text-[10px] text-cyan-600 dark:text-cyan-400">(+$30)</span>
              </button>
            </div>
          </div>

          {/* Fila 6: Checkbox Call First & Remarks */}
          <div className="space-y-1 pt-0.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Remarks / Obstáculos Extras
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.call_first}
                  onChange={(e) => setFormData({ ...formData, call_first: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-cyan-500 focus:ring-0"
                />
                <span className="text-slate-600 dark:text-slate-400 font-semibold text-[10px]">
                  Call First
                </span>
              </label>
            </div>
            <textarea
              rows={1}
              placeholder="Notas, portón, perro, zanja..."
              value={formData.raw_notes}
              onChange={(e) => setFormData({ ...formData, raw_notes: e.target.value })}
              className="w-full min-w-0 box-border bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700/80 rounded-xl px-2.5 py-1 text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Botones de acción compactos */}
          <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 px-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20 active:scale-95 transition"
            >
              <Check className="h-4 w-4 stroke-[3]" />
              <span>{saving ? 'Guardando...' : `Añadir Trabajo ($${currentTotal})`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
