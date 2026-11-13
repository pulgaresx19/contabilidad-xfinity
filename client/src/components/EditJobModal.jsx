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
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in modal-overlay-safe"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px) + 16px, 1.25rem)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 1.25rem)'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-[#101722] border border-white/10 rounded-3xl max-w-sm sm:max-w-md w-full max-h-[78dvh] sm:max-h-[82dvh] modal-sheet-compact flex flex-col overflow-hidden shadow-2xl text-white my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Cockpit */}
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-white dark:bg-slate-900/70 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-bold shrink-0">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider font-mono truncate">
                  Editar Job #{order.job_id}
                </h3>
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                  formData.status === 'Completado' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : formData.status === 'No Realizado' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                }`}>
                  {formData.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 font-mono font-semibold truncate">
                Modificar tarifa, metraje o dirección
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition shrink-0 ml-2"
            title="Cerrar ventana"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3-box KPI bar */}
        <div className="grid grid-cols-3 gap-2 px-4 py-2.5 bg-[#0d141e] border-b border-white/5 shrink-0 text-center">
          <div className="bg-[#16202c] border border-white/5 rounded-xl py-1.5 px-1">
            <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold">Valor Total</span>
            <span className="text-xs sm:text-sm font-black font-mono text-emerald-400 leading-none">
              ${formData.rate_calculated}
            </span>
          </div>
          <div className="bg-[#16202c] border border-white/5 rounded-xl py-1.5 px-1">
            <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold">Metraje</span>
            <span className="text-xs sm:text-sm font-black text-amber-300 font-mono leading-none">
              {formData.drop_footage || 0} ft
            </span>
          </div>
          <div className="bg-[#16202c] border border-white/5 rounded-xl py-1.5 px-1">
            <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold">Cable</span>
            <span className="text-xs sm:text-sm font-black text-cyan-400 font-mono leading-none">
              {formData.cable_type || 'RG-6'}
            </span>
          </div>
        </div>

        {/* Formulario con Scroll */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-4 overflow-y-auto space-y-3.5 flex-1 min-h-0 text-xs">
            
            {/* Mensaje de Error */}
            {error && (
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            {/* Desglose de Tarifa */}
            <div className="bg-[#16202c] border border-white/5 rounded-2xl p-2.5 flex items-center justify-between shadow-xs">
              <div>
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block">
                  Desglose de Tarifa
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Base $100 {(formData.bore_type || '').includes('DW') ? '+ $30 Bore' : ''} {formData.drop_footage > 300 ? `+ $${Math.floor((formData.drop_footage - 300) / 100) * 25} Metraje` : ''} {formData.manual_adjustment > 0 ? `+ $${formData.manual_adjustment} Bono` : formData.manual_adjustment < 0 ? `- $${Math.abs(formData.manual_adjustment)} Descuento` : ''}
                </span>
              </div>

              <div className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-xl font-mono font-black shadow-xs shrink-0">
                <span className="text-xs">$</span>
                <span className="text-base font-bold leading-none">{formData.rate_calculated}</span>
              </div>
            </div>

            {/* Job ID y Fecha Asignada */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="min-w-0">
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider truncate">
                  Job ID *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. 734521"
                  value={formData.job_id}
                  onChange={(e) => setFormData({ ...formData, job_id: e.target.value })}
                  className="w-full bg-[#16202c] border border-white/10 rounded-xl px-3 py-2 text-white font-mono font-bold focus:outline-none focus:border-cyan-500 text-xs transition"
                />
              </div>

              <div className="min-w-0">
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider truncate">
                  Fecha Asignada *
                </label>
                <input
                  type="date"
                  required
                  value={formData.work_date}
                  onChange={(e) => setFormData({ ...formData, work_date: e.target.value })}
                  className="w-full bg-[#16202c] border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500 font-mono font-bold text-xs transition dark:[color-scheme:dark] [color-scheme:light]"
                />
              </div>
            </div>

            {/* Dirección de la Vivienda */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                Dirección de la Vivienda *
              </label>
              <div className="relative">
                <MapPin className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  required
                  placeholder="ej. 23322 Ironwood Dr"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full bg-[#16202c] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-white font-semibold focus:outline-none focus:border-cyan-500 text-xs transition"
                />
              </div>
            </div>

            {/* Ciudad y Teléfono */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="min-w-0">
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider truncate">
                  Ciudad
                </label>
                <input
                  type="text"
                  placeholder="Escribe la ciudad..."
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full bg-[#16202c] border border-white/10 rounded-xl px-3 py-2 text-white font-semibold focus:outline-none focus:border-cyan-500 uppercase text-xs transition"
                />
              </div>

              <div className="min-w-0">
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider truncate">
                  Teléfono
                </label>
                <div className="relative">
                  <Phone className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="tel"
                    placeholder="ej. 5742094475"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-[#16202c] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-500 text-xs transition"
                  />
                </div>
              </div>
            </div>

            {/* Metraje y Cable */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider truncate">
                  Metraje Drop (Pies)
                </label>
                <div className="relative">
                  <Ruler className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    value={formData.drop_footage}
                    onChange={(e) => handleFootageChange(e.target.value)}
                    className="w-full bg-[#16202c] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-white font-mono font-bold focus:outline-none focus:border-cyan-500 text-xs transition"
                  />
                </div>
                {formData.drop_footage > 300 && (
                  <span className="text-[9px] text-emerald-400 block mt-1 font-bold font-mono">
                    +{Math.floor((formData.drop_footage - 300) / 100) * 25} bono metraje (&gt;300 ft)
                  </span>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider truncate">
                  Tipo de Cable
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {['RG-6', 'RG-11'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormData({ ...formData, cable_type: c })}
                      className={`py-2 rounded-xl text-xs font-bold border transition ${
                        formData.cable_type === c
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm font-black'
                          : 'bg-[#16202c] border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Tipo de Perforación / Bore */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                Tipo de Perforación / Bore
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'N', label: 'Sin Bore' },
                  { id: 'SW:1', label: 'Sidewalk' },
                  { id: 'DW:1', label: 'Driveway (+$30)' }
                ].map((b) => {
                  const active = formData.bore_type === b.id || (b.id === 'DW:1' && (formData.bore_type || '').includes('DW'));
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => handleBoreChange(b.id)}
                      className={`py-2 px-1 rounded-xl text-[11px] font-bold border text-center transition ${
                        active
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm font-black'
                          : 'bg-[#16202c] border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {b.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Remarks / Obstáculos */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                Remarks / Obstáculos Extras
              </label>
              <input
                type="text"
                placeholder="Notas, portón, perro, zanja..."
                value={formData.raw_notes}
                onChange={(e) => setFormData({ ...formData, raw_notes: e.target.value })}
                className="w-full bg-[#16202c] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
              />
            </div>

            {/* Ajuste Especial de Supervisor */}
            <div className="bg-[#16202c] border border-white/10 rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                  Ajuste Especial de Supervisor
                </span>
                <span className="text-[9px] text-slate-400 font-mono">
                  {formData.manual_adjustment !== 0 ? (
                    formData.manual_adjustment > 0 ? (
                      <span className="text-emerald-400 font-bold">+${formData.manual_adjustment}</span>
                    ) : (
                      <span className="text-amber-400 font-bold">-${Math.abs(formData.manual_adjustment)}</span>
                    )
                  ) : (
                    'Opcional'
                  )}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'none', label: 'Sin Ajuste' },
                  { id: 'add', label: '+ Bono' },
                  { id: 'sub', label: '- Descuento' }
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleAdjustChange(t.id, t.id === 'none' ? '' : adjustVal)}
                    className={`py-1.5 rounded-xl text-xs font-bold border transition ${
                      adjustType === t.id
                        ? t.id === 'add'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm font-black'
                          : t.id === 'sub'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm font-black'
                          : 'bg-white/10 text-white border-white/20'
                        : 'bg-[#0d141e] border-white/5 text-slate-400 hover:text-white'
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
                      <label className="text-[9px] text-slate-400 block mb-0.5 font-bold uppercase tracking-wider">
                        {adjustType === 'add' ? 'Monto a Sumar ($)' : 'Monto a Descontar ($)'}:
                      </label>
                      <div className="relative">
                        <span className={`absolute left-2.5 top-2 text-xs font-mono font-bold ${
                          adjustType === 'add' ? 'text-emerald-400' : 'text-amber-400'
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
                          className="w-full bg-[#0d141e] border border-white/10 rounded-xl pl-8 pr-2.5 py-1.5 text-xs text-white font-mono font-bold focus:outline-none focus:border-cyan-500 transition"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] text-slate-400 block mb-0.5 font-bold uppercase tracking-wider">
                        Motivo del ajuste:
                      </label>
                      <input
                        type="text"
                        placeholder="ej. Suelo rocoso / Descuento DW"
                        value={formData.adjustment_reason}
                        onChange={(e) => setFormData({ ...formData, adjustment_reason: e.target.value })}
                        className="w-full bg-[#0d141e] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition"
                      />
                    </div>
                  </div>

                  {/* Botones rápidos */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[9px] text-slate-500 uppercase font-bold">Rápidos:</span>
                    {adjustType === 'sub' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            handleAdjustChange('sub', '30');
                            setFormData(prev => ({ ...prev, adjustment_reason: 'Supervisor descontó DW (no se perforó)' }));
                          }}
                          className="px-2 py-0.5 bg-[#0d141e] hover:bg-[#182332] border border-white/5 text-amber-300 text-[10px] font-bold rounded-lg transition"
                        >
                          -$30 (Sin DW)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleAdjustChange('sub', '25');
                            setFormData(prev => ({ ...prev, adjustment_reason: 'Deducción / Descuento parcial' }));
                          }}
                          className="px-2 py-0.5 bg-[#0d141e] hover:bg-[#182332] border border-white/5 text-amber-300 text-[10px] font-bold rounded-lg transition"
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
                          className="px-2 py-0.5 bg-[#0d141e] hover:bg-[#182332] border border-white/5 text-emerald-300 text-[10px] font-bold rounded-lg transition"
                        >
                          +$25 (Bono)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleAdjustChange('add', '30');
                            setFormData(prev => ({ ...prev, adjustment_reason: 'Driveway Bore autorizado' }));
                          }}
                          className="px-2 py-0.5 bg-[#0d141e] hover:bg-[#182332] border border-white/5 text-emerald-300 text-[10px] font-bold rounded-lg transition"
                        >
                          +$30 (DW)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleAdjustChange('add', '50');
                            setFormData(prev => ({ ...prev, adjustment_reason: 'Trabajo complejo / rocoso' }));
                          }}
                          className="px-2 py-0.5 bg-[#0d141e] hover:bg-[#182332] border border-white/5 text-emerald-300 text-[10px] font-bold rounded-lg transition"
                        >
                          +$50 (Extra)
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer Estandarizado Cockpit */}
          <div className="px-4 py-3 border-t border-white/10 bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-xl transition active:scale-95 border border-white/10"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={saving}
              className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
            >
              {saving ? (
                <span>Guardando...</span>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 stroke-[2.5]" />
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
