import React, { useState, useEffect } from 'react';
import { 
  X, Check, DollarSign, MapPin, Phone, Ruler, SlidersHorizontal, 
  AlertCircle, Save, Pencil, MessageSquare, FileText, Sparkles, 
  CheckCheck, Camera, ZoomIn, Navigation, ExternalLink, Image as ImageIcon 
} from 'lucide-react';
import { cleanPhoneNumber, getCustomerSmsUrl, formatPhoneDisplay } from '../utils/smsUtils';

const formatCoordinates = (lat, lng) => {
  if (!lat || !lng) return 'No disponibles';
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (isNaN(numLat) || isNaN(numLng)) return 'No disponibles';
  return `${numLat.toFixed(5)}, ${numLng.toFixed(5)}`;
};

export default function EditJobModal({ order, isOpen, onClose, onJobUpdated, initialMode = 'view' }) {
  const [isEditing, setIsEditing] = useState(initialMode === 'edit');
  const [photos, setPhotos] = useState(order?.photos || []);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);
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
      setIsEditing(initialMode === 'edit');

      // Cargar fotos de evidencia asociadas al trabajo
      if (Array.isArray(order.photos) && order.photos.length > 0) {
        setPhotos(order.photos);
      }
      if (order.id) {
        let isMounted = true;
        setLoadingPhotos(true);
        fetch(`/api/orders/${order.id}/photos`)
          .then(res => res.json())
          .then(data => {
            if (isMounted && data && Array.isArray(data.photos)) {
              setPhotos(data.photos);
            }
          })
          .catch(err => console.warn('No se pudieron recargar las fotos:', err))
          .finally(() => {
            if (isMounted) setLoadingPhotos(false);
          });
        return () => { isMounted = false; };
      }
    }
  }, [order, isOpen, initialMode]);

  if (!isOpen || !order) return null;

  // Auto-recalcular tarifa cuando cambia metraje, bore o ajuste
  const calculateRate = (footage, bore, adjType, adjAmount) => {
    let rate = 100; // Tarifa base
    if (bore && typeof bore === 'string' && bore.includes('DW')) {
      rate += 30; // Bono de Driveway Bore
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

  const handleCancelEdit = () => {
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
    }
    setIsEditing(false);
    setError(null);
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
          phone: cleanPhoneNumber(formData.phone),
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
      setIsEditing(false);
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
        className="bg-[#101722] border border-white/10 rounded-3xl w-full max-w-sm sm:max-w-md h-[80dvh] sm:h-[82dvh] modal-sheet-compact flex flex-col overflow-hidden shadow-2xl text-white transition-all my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Header Unificado Estándar (Sin badges de estado ni botón de editar arriba) */}
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-white dark:bg-slate-900/70 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-bold shrink-0">
              <FileText className="h-4 w-4 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-slate-900 dark:text-white truncate">
                {isEditing ? 'Editar Trabajo' : 'Ficha de Trabajo'}
              </h3>
              <p className="text-[10.5px] text-slate-600 dark:text-slate-400 font-semibold truncate font-mono">
                Job #{formData.job_id || order?.job_id} • Información del trabajo
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition cursor-pointer"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 2. Cuerpo del Modal: Información General Arriba + Fotos Abajo */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-4 overflow-y-auto sleek-scroll space-y-3 flex-1 min-h-0 text-xs">
            
            {/* Mensaje de Error */}
            {error && (
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            {/* CONTENEDOR UNIFICADO: DETALLES DEL TRABAJO (Estilo exacto de Jornada) */}
            <div className="bg-[#131c27] border border-white/8 rounded-2xl p-3.5 space-y-2.5 shadow-xs">
              {!isEditing ? (
                <>
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <h4 className="text-xs font-black text-white uppercase tracking-wider">
                      Detalles del Trabajo
                    </h4>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${
                        formData.status === 'Completado' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : formData.status === 'No Realizado' ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      }`}>
                        {formData.status}
                      </span>
                      {order?.whatsapp_shared ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                          <CheckCheck className="w-3 h-3 stroke-[2.5]" />
                          <span>WhatsApp</span>
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Dirección */}
                  <div className="flex justify-between items-start text-xs border-b border-white/5 pb-2">
                    <span className="text-slate-400 font-medium">Dirección</span>
                    <div className="text-right text-slate-100 font-semibold leading-tight">
                      <div>{formData.address || 'Sin dirección asignada'}</div>
                      <div className="text-[11px] text-slate-400">
                        {formData.city || 'Skokie'}, IN {formData.zip_code || ''}
                      </div>
                      <div className="mt-1 flex justify-end">
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${formData.address}, ${formData.city || 'Skokie'}, IN`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-0.5 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 rounded-md font-bold text-[10px] inline-flex items-center gap-1 transition"
                        >
                          <Navigation className="w-2.5 h-2.5" />
                          <span>GPS Maps</span>
                          <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Coordenadas */}
                  <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                    <span className="text-slate-400 font-medium">Coordenadas</span>
                    <span className="text-slate-200 font-mono text-[11px]">
                      {formatCoordinates(order?.latitude, order?.longitude)}
                    </span>
                  </div>

                  {/* Metraje */}
                  <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                    <span className="text-slate-400 font-medium">Metraje</span>
                    <span className="text-amber-300 font-mono font-bold text-[11px]">
                      {formData.drop_footage || 0} ft {(formData.bore_type || '').includes('DW') ? '• Bore DW' : ''}
                    </span>
                  </div>

                  {/* Tipo de Cable */}
                  <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                    <span className="text-slate-400 font-medium">Tipo de Cable</span>
                    <span className="text-cyan-300 font-mono font-bold text-[11px]">
                      {formData.cable_type || 'RG-6'}
                    </span>
                  </div>

                  {/* Perforación (Bore) */}
                  <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                    <span className="text-slate-400 font-medium">Perforación (Bore)</span>
                    <span className="text-slate-200 font-semibold text-[11px]">
                      {(formData.bore_type || '').includes('DW') ? 'Driveway (+$30)' : formData.bore_type === 'SW:1' ? 'Sidewalk' : 'Sin Bore'}
                    </span>
                  </div>

                  {/* Tarifa / Total */}
                  <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                    <span className="text-slate-400 font-medium">Tarifa Total</span>
                    <span className="text-emerald-400 font-mono font-black text-xs">
                      ${formData.rate_calculated || 100} USD
                    </span>
                  </div>

                  {/* Fecha Asignada */}
                  <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                    <span className="text-slate-400 font-medium">Fecha</span>
                    <span className="text-slate-200 font-mono text-[11px]">
                      {formData.work_date || 'No asignada'}
                    </span>
                  </div>

                  {/* Teléfono Cliente */}
                  {formData.phone ? (
                    <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                      <span className="text-slate-400 font-medium">Teléfono Cliente</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-cyan-400 font-mono font-bold text-[11px]">
                          {formatPhoneDisplay(formData.phone)}
                        </span>
                        <a
                          href={`tel:${cleanPhoneNumber(formData.phone)}`}
                          className="p-1 bg-[#1f2b3a] hover:bg-[#28374a] text-cyan-400 rounded-md border border-white/10"
                          title="Llamar"
                        >
                          <Phone className="w-3 h-3" />
                        </a>
                        <a
                          href={getCustomerSmsUrl(formData.phone, formData.address)}
                          className="p-1 bg-[#1f2b3a] hover:bg-[#28374a] text-cyan-400 rounded-md border border-white/10"
                          title="SMS"
                        >
                          <MessageSquare className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ) : null}

                  {/* Call First */}
                  {formData.call_first ? (
                    <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                      <span className="text-slate-400 font-medium">Aviso Previo</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        CALL FIRST (Llamar al cliente)
                      </span>
                    </div>
                  ) : null}

                  {/* Observaciones */}
                  {formData.raw_notes ? (
                    <div className="flex justify-between items-start text-xs border-b border-white/5 pb-2">
                      <span className="text-slate-400 font-medium">Observaciones</span>
                      <span className="text-slate-300 font-medium text-right max-w-[65%] text-[11px]">
                        {formData.raw_notes}
                      </span>
                    </div>
                  ) : null}

                  {/* Ajuste Supervisor (si tiene) */}
                  {formData.manual_adjustment !== 0 ? (
                    <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                      <span className="text-slate-400 font-medium">Ajuste Supervisor</span>
                      <span className={`font-mono font-bold text-[11px] ${formData.manual_adjustment > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {formData.manual_adjustment > 0 ? `+$${formData.manual_adjustment}` : `-$${Math.abs(formData.manual_adjustment)}`} ({formData.adjustment_reason || 'Manual'})
                      </span>
                    </div>
                  ) : null}

                  {/* Motivo de Cancelación (si no realizado) */}
                  {formData.status === 'No Realizado' && formData.cancel_reason ? (
                    <div className="flex justify-between items-start text-xs">
                      <span className="text-rose-400 font-medium">Motivo Cancelación</span>
                      <span className="text-rose-300 font-semibold text-right max-w-[65%] text-[11px]">
                        {formData.cancel_reason}
                      </span>
                    </div>
                  ) : null}
                </>
              ) : (
                /* FORMULARIO DE EDICIÓN FLUIDO */
                <div className="space-y-2.5">
                  <div className="border-b border-white/5 pb-2">
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                      Estado del Trabajo *
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {['Pendiente', 'Completado', 'No Realizado'].map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setFormData({ ...formData, status: st })}
                          className={`py-1.5 px-1 rounded-xl text-xs font-bold border transition cursor-pointer text-center ${
                            formData.status === st
                              ? st === 'Completado'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-xs'
                                : st === 'No Realizado'
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-xs'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs'
                              : 'bg-[#0b1118] border-white/5 text-slate-400 hover:text-white'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>

                    {formData.status === 'No Realizado' && (
                      <div className="pt-2">
                        <label className="block text-[9px] font-bold text-rose-300 mb-1 uppercase tracking-wider">
                          Motivo de Cancelación / No Realizado *
                        </label>
                        <input
                          type="text"
                          placeholder="ej. Sin acceso al patio, perro suelto..."
                          value={formData.cancel_reason}
                          onChange={(e) => setFormData({ ...formData, cancel_reason: e.target.value })}
                          className="w-full bg-[#0b1118] border border-rose-500/30 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-rose-400 transition"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                      Dirección de la Vivienda *
                    </label>
                    <div className="relative">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                      <input
                        type="text"
                        required
                        placeholder="ej. 23322 Ironwood Dr"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        className="w-full bg-[#0b1118] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-white font-semibold focus:outline-none focus:border-cyan-500 text-xs transition"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider truncate">
                        Ciudad
                      </label>
                      <input
                        type="text"
                        placeholder="Ciudad..."
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        className="w-full bg-[#0b1118] border border-white/10 rounded-xl px-2.5 py-2 text-white font-semibold focus:outline-none focus:border-cyan-500 uppercase text-xs transition"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider truncate">
                        Teléfono
                      </label>
                      <div className="relative">
                        <Phone className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                        <input
                          type="tel"
                          placeholder="ej. 5742094475"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className="w-full bg-[#0b1118] border border-white/10 rounded-xl pl-8 pr-2.5 py-2 text-white font-mono focus:outline-none focus:border-cyan-500 text-xs transition"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider truncate">
                        Job ID *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="ej. 734521"
                        value={formData.job_id}
                        onChange={(e) => setFormData({ ...formData, job_id: e.target.value })}
                        className="w-full bg-[#0b1118] border border-white/10 rounded-xl px-2.5 py-1.5 text-white font-mono font-bold focus:outline-none focus:border-cyan-500 text-xs transition"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider truncate">
                        Fecha Asignada *
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.work_date}
                        onChange={(e) => setFormData({ ...formData, work_date: e.target.value })}
                        className="w-full bg-[#0b1118] border border-white/10 rounded-xl px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-500 font-mono font-bold text-xs transition dark:[color-scheme:dark] [color-scheme:light]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider truncate">
                        Metraje Drop (ft)
                      </label>
                      <div className="relative">
                        <Ruler className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
                        <input
                          type="number"
                          step="0.1"
                          placeholder="0.0"
                          value={formData.drop_footage}
                          onChange={(e) => handleFootageChange(e.target.value)}
                          className="w-full bg-[#0b1118] border border-white/10 rounded-xl pl-8 pr-2.5 py-1.5 text-white font-mono font-bold focus:outline-none focus:border-cyan-500 text-xs transition"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider truncate">
                        Tipo de Cable
                      </label>
                      <div className="grid grid-cols-2 gap-1">
                        {['RG-6', 'RG-11'].map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setFormData({ ...formData, cable_type: c })}
                            className={`py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer text-center ${
                              formData.cable_type === c
                                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-xs font-black'
                                : 'bg-[#0b1118] border-white/10 text-slate-400 hover:text-white'
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                      Perforación / Bore
                    </label>
                    <div className="grid grid-cols-3 gap-1">
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
                            className={`py-1.5 px-0.5 rounded-xl text-[10.5px] font-bold border text-center transition cursor-pointer ${
                              active
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-xs font-black'
                                : 'bg-[#0b1118] border-white/10 text-slate-400 hover:text-white'
                            }`}
                          >
                            {b.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Selector de Ajuste Supervisor en Edición */}
                  <div className="bg-[#0b1118] p-2.5 rounded-xl border border-white/5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Ajuste Supervisor:
                      </span>
                      <span className="text-[9px] text-slate-400 font-mono">
                        {formData.manual_adjustment !== 0 ? (
                          formData.manual_adjustment > 0 ? (
                            <span className="text-emerald-400 font-bold">+${formData.manual_adjustment}</span>
                          ) : (
                            <span className="text-amber-400 font-bold">-${Math.abs(formData.manual_adjustment)}</span>
                          )
                        ) : 'Opcional'}
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
                          className={`py-1 rounded-lg text-[10.5px] font-bold border transition cursor-pointer ${
                            adjustType === t.id
                              ? t.id === 'add'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-xs'
                                : t.id === 'sub'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs'
                                : 'bg-white/10 text-white border-white/20'
                              : 'bg-[#131c27] border-white/5 text-slate-400 hover:text-white'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {adjustType !== 'none' && (
                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        <div>
                          <label className="text-[9px] text-slate-400 block mb-0.5 font-bold uppercase">
                            {adjustType === 'add' ? 'Monto ($):' : 'Descuento ($):'}
                          </label>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="ej. 25"
                            value={adjustVal}
                            onChange={(e) => handleAdjustChange(adjustType, e.target.value)}
                            className="w-full bg-[#131c27] border border-white/10 rounded-lg px-2 py-1 text-xs text-white font-mono font-bold focus:outline-none focus:border-cyan-500"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-slate-400 block mb-0.5 font-bold uppercase">
                            Motivo:
                          </label>
                          <input
                            type="text"
                            placeholder="ej. Rocoso / Autorizado"
                            value={formData.adjustment_reason}
                            onChange={(e) => setFormData({ ...formData, adjustment_reason: e.target.value })}
                            className="w-full bg-[#131c27] border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                      Observaciones & Notas
                    </label>
                    <input
                      type="text"
                      placeholder="Notas, portón, perro, zanja..."
                      value={formData.raw_notes}
                      onChange={(e) => setFormData({ ...formData, raw_notes: e.target.value })}
                      className="w-full bg-[#0b1118] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition"
                    />
                  </div>

                  <label className="flex items-center gap-2 pt-1 text-[11px] text-slate-300 font-semibold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formData.call_first}
                      onChange={(e) => setFormData({ ...formData, call_first: e.target.checked })}
                      className="rounded border-white/20 bg-slate-800 text-cyan-500 focus:ring-0 w-3.5 h-3.5"
                    />
                    <span>Llamar al cliente primero (Call First)</span>
                  </label>
                </div>
              )}
            </div>

            {/* SECCIÓN 5: FOTOS DE EVIDENCIA (Abajo de la información general) */}
            <div className="bg-[#131c27] border border-white/8 rounded-2xl p-3 space-y-2 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Fotos de Evidencia ({photos.length})</span>
                </span>
                {photos.length > 0 && (
                  <span className="text-[9.5px] text-slate-400">Toca para ampliar</span>
                )}
              </div>

              {loadingPhotos ? (
                <div className="p-3 text-center bg-[#0b1118] rounded-xl border border-white/5 text-slate-400 text-xs">
                  Cargando fotos de evidencia...
                </div>
              ) : photos.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((photo, idx) => {
                    const photoSrc = photo.photo_data || `/uploads/${photo.filename}`;
                    return (
                      <div
                        key={photo.id || idx}
                        onClick={() => setPreviewPhoto(photoSrc)}
                        className="group relative aspect-square bg-[#0b1118] rounded-xl overflow-hidden border border-white/10 hover:border-cyan-400/60 transition cursor-pointer shadow-xs"
                      >
                        <img
                          src={photoSrc}
                          alt={photo.category || `Foto ${idx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-between p-1">
                          <span className="self-start text-[8px] font-bold bg-black/70 text-cyan-300 px-1 py-0.2 rounded border border-white/10 truncate max-w-full">
                            {photo.category || `#${idx + 1}`}
                          </span>
                          <div className="flex justify-end opacity-75 group-hover:opacity-100 transition">
                            <span className="p-0.5 bg-black/60 rounded-full text-white">
                              <ZoomIn className="w-2.5 h-2.5" />
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-3 text-center bg-[#0b1118] rounded-xl border border-white/5 text-slate-400 text-xs">
                  Sin fotos de evidencia adjuntas
                </div>
              )}
            </div>
          </div>

          {/* 3. Footer del Modal (Botones abajo) */}
          <div className="px-4 py-3 border-t border-white/10 bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
            {!isEditing ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-xl transition active:scale-95 border border-white/10 cursor-pointer"
                >
                  Cerrar
                </button>

                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Editar Trabajo</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={saving}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-xl transition active:scale-95 border border-white/10 cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50 cursor-pointer"
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
              </>
            )}
          </div>
        </form>
      </div>

      {/* Lightbox / Visor de Fotos en Pantalla Completa */}
      {previewPhoto && (
        <div
          onClick={() => setPreviewPhoto(null)}
          className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-md flex items-center justify-center p-3 animate-fade-in"
        >
          <div 
            className="relative max-w-lg w-full flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="absolute -top-12 right-0 p-2 text-white hover:text-cyan-400 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full transition shadow-lg cursor-pointer"
              title="Cerrar visor de foto"
            >
              <X className="h-5 w-5" />
            </button>

            <img
              src={previewPhoto}
              alt="Evidencia Ampliada"
              className="max-h-[80vh] w-auto max-w-full rounded-2xl object-contain border border-white/10 shadow-2xl"
            />

            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="mt-3 px-5 py-2 bg-[#16202c] hover:bg-[#1e2b3b] text-white border border-white/10 rounded-xl text-xs font-bold transition shadow cursor-pointer active:scale-95"
            >
              Cerrar Foto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
