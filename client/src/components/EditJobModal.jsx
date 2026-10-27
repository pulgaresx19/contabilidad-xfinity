import React, { useState, useEffect } from 'react';
import { X, Check, DollarSign, MapPin, Phone, Ruler, SlidersHorizontal, AlertCircle, Save } from 'lucide-react';

export default function EditJobModal({ order, isOpen, onClose, onJobUpdated }) {
  const [formData, setFormData] = useState({
    job_id: '',
    work_date: '',
    address: '',
    city: '',
    zip_code: '',
    phone: '',
    call_first: false,
    drop_footage: 0,
    cable_type: 'RG-6',
    bore_type: 'N',
    manual_adjustment: 0,
    adjustment_reason: '',
    rate_calculated: 100,
    status: 'Pendiente',
    cancel_reason: '',
    raw_notes: ''
  });

  const [adjustType, setAdjustType] = useState('none'); // 'none' | 'add' | 'sub'
  const [adjustVal, setAdjustVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (order) {
      const adj = order.manual_adjustment || 0;
      let type = 'none';
      let val = '';
      if (adj > 0) {
        type = 'add';
        val = String(adj);
      } else if (adj < 0) {
        type = 'sub';
        val = String(Math.abs(adj));
      }

      setFormData({
        job_id: order.job_id || '',
        work_date: order.work_date || '',
        address: order.address || '',
        city: order.city || '',
        zip_code: order.zip_code || '',
        phone: order.phone || '',
        call_first: Boolean(order.call_first),
        drop_footage: order.drop_footage || 0,
        cable_type: order.cable_type || 'RG-6',
        bore_type: order.bore_type || 'N',
        manual_adjustment: adj,
        adjustment_reason: order.adjustment_reason || '',
        rate_calculated: order.rate_calculated || 100,
        status: order.status || 'Pendiente',
        cancel_reason: order.cancel_reason || '',
        raw_notes: order.raw_notes || ''
      });
      setAdjustType(type);
      setAdjustVal(val);
      setError(null);
    }
  }, [order, isOpen]);

  if (!isOpen || !order) return null;

  // Auto-recalculate rate whenever footage, bore or manual adjustment changes
  const calculateRate = (footage, bore, adjType, adjAmount) => {
    let rate = 100; // Base pay
    if (bore && typeof bore === 'string' && bore.includes('DW')) {
      rate += 30; // Driveway bore bonus
    }
    const numFootage = parseFloat(footage) || 0;
    if (numFootage > 300) {
      const extraBlocks = Math.floor((numFootage - 300) / 100);
      if (extraBlocks > 0) rate += extraBlocks * 25;
    }

    const numAdj = parseFloat(String(adjAmount).replace(/[^0-9.]/g, '')) || 0;
    let finalAdj = 0;
    if (adjType === 'add') finalAdj = Math.abs(numAdj);
    else if (adjType === 'sub') finalAdj = -Math.abs(numAdj);

    return {
      rate_calculated: Math.max(0, rate + finalAdj),
      manual_adjustment: finalAdj
    };
  };

  const handleFootageChange = (val) => {
    const calc = calculateRate(val, formData.bore_type, adjustType, adjustVal);
    setFormData(prev => ({
      ...prev,
      drop_footage: val,
      ...calc
    }));
  };

  const handleBoreChange = (bore) => {
    const calc = calculateRate(formData.drop_footage, bore, adjustType, adjustVal);
    setFormData(prev => ({
      ...prev,
      bore_type: bore,
      ...calc
    }));
  };

  const handleAdjustChange = (type, val) => {
    setAdjustType(type);
    const cleanVal = type === 'none' ? '' : String(val).replace(/[^0-9.]/g, '');
    setAdjustVal(cleanVal);
    const calc = calculateRate(formData.drop_footage, formData.bore_type, type, cleanVal);
    setFormData(prev => ({
      ...prev,
      ...calc,
      ...(type === 'none' ? { adjustment_reason: '' } : {})
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.address.trim()) {
      setError('La dirección es obligatoria.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...order,
          ...formData,
          drop_footage: parseFloat(formData.drop_footage) || 0,
          rate_calculated: parseFloat(formData.rate_calculated) || 100,
          manual_adjustment: parseFloat(formData.manual_adjustment) || 0,
          call_first: formData.call_first ? 1 : 0
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al actualizar el trabajo');
      }

      if (onJobUpdated) onJobUpdated();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-lg rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-400 rounded-xl">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Editar Trabajo #{order.job_id}
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Modificar datos, dirección, metraje o tarifa
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl bg-slate-100 dark:bg-slate-800 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1 text-xs">
          {error && (
            <div className="p-2.5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-400 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Saldo Final Destacado (Medallón de Dinero) */}
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 rounded-2xl p-3 flex items-center justify-between shadow-xs">
            <div>
              <span className="text-[10px] text-emerald-800 dark:text-emerald-400 font-bold uppercase tracking-wider block">
                Valor Total del Trabajo
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Base $100 {(formData.bore_type || '').includes('DW') ? '+ $30 Bore' : ''} {formData.drop_footage > 300 ? '+ Metraje extra' : ''} {formData.manual_adjustment > 0 ? `+ $${formData.manual_adjustment} Bono` : formData.manual_adjustment < 0 ? `- $${Math.abs(formData.manual_adjustment)} Descuento` : ''}
              </span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500 text-slate-950 rounded-xl font-mono font-black shadow-xs shrink-0">
              <span className="text-xs">$</span>
              <span className="text-lg sm:text-xl leading-none">{formData.rate_calculated}</span>
            </div>
          </div>

          {/* Job ID y Fecha Asignada (50% y 50% exactamente simétricos) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider truncate">
                Work Order # (Job ID) *
              </label>
              <input
                type="text"
                required
                placeholder="ej. 734521"
                value={formData.job_id}
                onChange={(e) => setFormData({ ...formData, job_id: e.target.value })}
                className="w-full h-10 min-w-0 box-border bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono font-bold focus:outline-none focus:border-cyan-500 text-xs shadow-2xs"
              />
            </div>

            <div className="min-w-0">
              <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider truncate">
                Fecha Asignada *
              </label>
              <input
                type="date"
                required
                value={formData.work_date}
                onChange={(e) => setFormData({ ...formData, work_date: e.target.value })}
                className="w-full h-10 min-w-0 box-border bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 font-mono text-xs [color-scheme:light] dark:[color-scheme:dark] shadow-2xs"
              />
            </div>
          </div>

          {/* Dirección de la Vivienda */}
          <div>
            <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">
              Dirección de la Vivienda *
            </label>
            <div className="relative">
              <MapPin className="h-4 w-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                required
                placeholder="ej. 23322 Ironwood Dr"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full h-10 min-w-0 box-border bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2 text-slate-900 dark:text-white font-semibold focus:outline-none focus:border-cyan-500 text-xs shadow-2xs"
              />
            </div>
          </div>

          {/* Ciudad y Teléfono (Lineales 50% / 50%) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider truncate">
                Ciudad (Manual)
              </label>
              <input
                type="text"
                placeholder="Escribe la ciudad..."
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full h-10 min-w-0 box-border bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-semibold focus:outline-none focus:border-cyan-500 uppercase text-xs shadow-2xs"
              />
            </div>

            <div className="min-w-0">
              <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider truncate">
                Teléfono del Cliente
              </label>
              <div className="relative">
                <Phone className="h-4 w-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="tel"
                  placeholder="ej. 5742094475"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full h-10 min-w-0 box-border bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-cyan-500 text-xs shadow-2xs"
                />
              </div>
            </div>
          </div>

          {/* Metraje y Cable (Lineales 50% / 50%) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider truncate">
                Metraje de Drop (Pies)
              </label>
              <div className="relative">
                <Ruler className="h-4 w-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="number"
                  step="0.1"
                  placeholder="0.0"
                  value={formData.drop_footage}
                  onChange={(e) => handleFootageChange(e.target.value)}
                  className="w-full h-10 box-border bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2 text-slate-900 dark:text-white font-mono font-bold focus:outline-none focus:border-cyan-500 text-xs shadow-2xs"
                />
              </div>
              {formData.drop_footage > 300 && (
                <span className="text-[9px] text-emerald-600 dark:text-emerald-400 block mt-1 font-bold">
                  +{Math.floor((formData.drop_footage - 300) / 100) * 25} bono metraje (&gt;300 ft)
                </span>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider truncate">
                Tipo de Cable
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {['RG-6', 'RG-11'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFormData({ ...formData, cable_type: c })}
                    className={`h-10 rounded-xl text-xs font-bold border transition ${
                      formData.cable_type === c
                        ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tipo de Bore */}
          <div>
            <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-1 uppercase">
              Tipo de Perforación / Bore
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'N', label: 'Sin Bore' },
                { id: 'SW:1', label: 'Sidewalk' },
                { id: 'DW:1', label: 'Driveway (+$30)' }
              ].map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleBoreChange(b.id)}
                  className={`py-2 px-1 rounded-xl text-[11px] font-bold border text-center transition ${
                    formData.bore_type === b.id || (b.id === 'DW:1' && (formData.bore_type || '').includes('DW'))
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm font-black'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Remarks / Obstáculos Extras */}
          <div>
            <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-1 uppercase">
              Remarks / Obstáculos Extras
            </label>
            <input
              type="text"
              placeholder="Notas, portón, perro, zanja..."
              value={formData.raw_notes}
              onChange={(e) => setFormData({ ...formData, raw_notes: e.target.value })}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Ajuste Manual de Supervisor */}
          <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase">
                Ajuste Especial de Supervisor
              </span>
              <span className="text-[9px] text-slate-500 dark:text-slate-400 font-mono">
                {formData.manual_adjustment !== 0 ? (
                  formData.manual_adjustment > 0 ? (
                    <span className="text-emerald-500 font-bold">+${formData.manual_adjustment}</span>
                  ) : (
                    <span className="text-amber-500 font-bold">-${Math.abs(formData.manual_adjustment)}</span>
                  )
                ) : (
                  'Opcional'
                )}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1">
              {[
                { id: 'none', label: 'Sin Ajuste' },
                { id: 'add', label: '+ Bono' },
                { id: 'sub', label: '- Descuento' }
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleAdjustChange(t.id, t.id === 'none' ? '' : adjustVal)}
                  className={`py-1.5 rounded-lg text-xs font-bold border transition ${
                    adjustType === t.id
                      ? t.id === 'add'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm'
                        : t.id === 'sub'
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white border-slate-300'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {adjustType !== 'none' && (
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-slate-500 dark:text-slate-400 block mb-0.5 font-bold uppercase">
                      {adjustType === 'add' ? 'Monto a Sumar ($)' : 'Monto a Descontar ($)'}:
                    </label>
                    <div className="relative">
                      <span className={`absolute left-2.5 top-1.5 text-xs font-mono font-bold ${
                        adjustType === 'add' ? 'text-emerald-500' : 'text-amber-500'
                      }`}>
                        {adjustType === 'add' ? '+$' : '-$'}
                      </span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="ej. 25 o 30"
                        value={adjustVal}
                        onChange={(e) => handleAdjustChange(adjustType, e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-slate-900 dark:text-white font-mono font-bold focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-500 dark:text-slate-400 block mb-0.5 font-bold uppercase">
                      Motivo del ajuste:
                    </label>
                    <input
                      type="text"
                      placeholder="ej. Suelo rocoso / Descuento DW"
                      value={formData.adjustment_reason}
                      onChange={(e) => setFormData({ ...formData, adjustment_reason: e.target.value })}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                {/* Botones rápidos */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-[9px] text-slate-400">Rápidos:</span>
                  {adjustType === 'sub' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          handleAdjustChange('sub', '30');
                          setFormData(prev => ({ ...prev, adjustment_reason: 'Supervisor descontó DW (no se perforó)' }));
                        }}
                        className="px-2 py-0.5 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-300 text-[10px] font-bold rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition"
                      >
                        -$30 (Sin DW)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleAdjustChange('sub', '25');
                          setFormData(prev => ({ ...prev, adjustment_reason: 'Deducción / Descuento parcial' }));
                        }}
                        className="px-2 py-0.5 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-300 text-[10px] font-bold rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition"
                      >
                        -$25
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          handleAdjustChange('add', '25');
                          setFormData(prev => ({ ...prev, adjustment_reason: 'Bono metraje extra autorizado' }));
                        }}
                        className="px-2 py-0.5 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-300 text-[10px] font-bold rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition"
                      >
                        +$25 (Bono)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleAdjustChange('add', '30');
                          setFormData(prev => ({ ...prev, adjustment_reason: 'Driveway Bore autorizado' }));
                        }}
                        className="px-2 py-0.5 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-300 text-[10px] font-bold rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition"
                      >
                        +$30 (DW)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleAdjustChange('add', '50');
                          setFormData(prev => ({ ...prev, adjustment_reason: 'Trabajo complejo / rocoso' }));
                        }}
                        className="px-2 py-0.5 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-300 text-[10px] font-bold rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition"
                      >
                        +$50 (Extra)
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Botones de Acción */}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-2xl transition"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-95 transition"
            >
              {saving ? (
                <span>Guardando...</span>
              ) : (
                <>
                  <Save className="h-4 w-4 stroke-[2.5]" />
                  <span>Guardar Cambios</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
