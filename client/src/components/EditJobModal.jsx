import React, { useState, useEffect } from 'react';
import { 
  X, Check, DollarSign, MapPin, Phone, Ruler, SlidersHorizontal, 
  AlertCircle, Save, Pencil, MessageSquare, FileText, Sparkles, 
  CheckCheck, Camera, ZoomIn, Navigation, ExternalLink, Image as ImageIcon 
} from 'lucide-react';
import { cleanPhoneNumber, getCustomerSmsUrl, formatPhoneDisplay } from '../utils/smsUtils';

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

      // Cargar o refrescar fotos de evidencia de la orden
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
        className="bg-[#101722] border border-white/10 rounded-3xl max-w-md sm:max-w-xl w-full max-h-[86dvh] sm:max-h-[90dvh] modal-sheet-compact flex flex-col overflow-hidden shadow-2xl text-white my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Cockpit */}
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-white dark:bg-slate-900/70 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-bold shrink-0">
              {isEditing ? <SlidersHorizontal className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider font-mono truncate">
                  {isEditing ? `Editar Job #${order.job_id}` : `Ficha Técnica del Trabajo`}
                </h3>
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                  formData.status === 'Completado' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : formData.status === 'No Realizado' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                }`}>
                  {formData.status}
                </span>
                {order.whatsapp_shared && (
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-bold shrink-0 bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 flex items-center gap-1">
                    <CheckCheck className="w-3 h-3 stroke-[2.5]" />
                    <span>Reportado</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 font-mono font-semibold truncate">
                {isEditing ? 'Modificar tarifa, metraje o especificaciones' : `Job #${order.job_id} • Resumen Informativo y Fotos`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 font-bold text-xs transition active:scale-95 cursor-pointer shadow-xs"
                title="Ver ficha de información"
              >
                Ver Ficha
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="px-2.5 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 font-bold text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs"
                title="Editar datos del trabajo"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Editar</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition shrink-0 cursor-pointer"
              title="Cerrar ventana"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
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

        {/* CONTENIDO PRINCIPAL: MODO VISTA (FICHA) O MODO EDICIÓN */}
        {!isEditing ? (
          /* MODO VISTA / DETALLES DE TRABAJO COMPLETO (FICHA INFORMATIVA) */
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="p-4 overflow-y-auto sleek-scroll space-y-3.5 flex-1 min-h-0 text-xs">
              {/* 1. Enunciado y Localización del Trabajo */}
              <div className="bg-[#131c27] border border-white/8 rounded-2xl p-3.5 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Enunciado & Ubicación</span>
                  </span>
                  <span className="text-[10.5px] font-mono text-slate-400 font-bold">
                    Job #{formData.job_id || order.id}
                  </span>
                </div>

                <div>
                  <h4 className="text-sm sm:text-base font-extrabold text-white leading-tight">
                    {formData.address || 'Sin dirección asignada'}
                  </h4>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    {formData.city || 'Skokie'}, IN {formData.zip_code || ''}
                  </p>
                </div>

                {/* Acciones de Navegación y Contacto */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${formData.address}, ${formData.city || 'Skokie'}, IN`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 rounded-xl font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-xs"
                    title="Abrir ruta en Google Maps"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>GPS Google Maps</span>
                    <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                  </a>

                  {formData.phone && (
                    <>
                      <a
                        href={`tel:${cleanPhoneNumber(formData.phone)}`}
                        className="px-3 py-1.5 bg-[#1f2b3a] hover:bg-[#28374a] text-slate-200 border border-white/10 rounded-xl font-bold text-xs flex items-center gap-1.5 transition active:scale-95"
                        title="Llamar al cliente"
                      >
                        <Phone className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{formatPhoneDisplay(formData.phone)}</span>
                      </a>

                      <a
                        href={getCustomerSmsUrl(formData.phone, formData.address)}
                        className="px-3 py-1.5 bg-[#1f2b3a] hover:bg-[#28374a] text-slate-200 border border-white/10 rounded-xl font-bold text-xs flex items-center gap-1.5 transition active:scale-95"
                        title="Enviar mensaje SMS"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
                        <span>SMS</span>
                      </a>
                    </>
                  )}

                  {formData.call_first && (
                    <span className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-1 rounded-xl font-bold">
                      CALL FIRST
                    </span>
                  )}
                </div>
              </div>

              {/* 2. Desglose Financiero & Saldo Total */}
              <div className="bg-[#131c27] border border-white/8 rounded-2xl p-3.5 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>Desglose de Tarifa & Saldo</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Moneda USD</span>
                </div>

                <div className="space-y-1.5 bg-[#0b1118] p-3 rounded-xl border border-white/5">
                  <div className="flex justify-between items-center text-slate-300 text-xs">
                    <span>Tarifa Base Estándar</span>
                    <span className="font-mono font-semibold text-white">$100.00</span>
                  </div>

                  <div className="flex justify-between items-center text-slate-300 text-xs">
                    <span>
                      Perforación (Bore):
                      <span className="text-slate-400 ml-1 text-[11px]">
                        {(formData.bore_type || '').includes('DW') ? 'Driveway Bore' : 'Sin Bore / Estándar'}
                      </span>
                    </span>
                    <span className={`font-mono font-semibold ${(formData.bore_type || '').includes('DW') ? 'text-cyan-300' : 'text-slate-500'}`}>
                      {(formData.bore_type || '').includes('DW') ? '+$30.00' : '$0.00'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-slate-300 text-xs">
                    <span>
                      Excedente Drop:
                      <span className="text-slate-400 ml-1 text-[11px]">
                        {formData.drop_footage > 300 ? `${formData.drop_footage} ft (>300 ft)` : `${formData.drop_footage || 0} ft (<=300 ft)`}
                      </span>
                    </span>
                    <span className={`font-mono font-semibold ${formData.drop_footage > 300 ? 'text-amber-300' : 'text-slate-500'}`}>
                      {formData.drop_footage > 300 ? `+$${Math.floor((formData.drop_footage - 300) / 100) * 25}.00` : '$0.00'}
                    </span>
                  </div>

                  {formData.manual_adjustment !== 0 && (
                    <div className="flex justify-between items-center text-slate-300 text-xs pt-1 border-t border-white/5">
                      <span>
                        Ajuste Supervisor:
                        {formData.adjustment_reason && (
                          <span className="text-slate-400 ml-1 text-[11px]">({formData.adjustment_reason})</span>
                        )}
                      </span>
                      <span className={`font-mono font-bold ${formData.manual_adjustment > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formData.manual_adjustment > 0 ? `+$${formData.manual_adjustment}.00` : `-$${Math.abs(formData.manual_adjustment)}.00`}
                      </span>
                    </div>
                  )}

                  {/* Total Final Destacado */}
                  <div className="flex justify-between items-center pt-2 mt-1 border-t border-white/10">
                    <span className="font-bold text-white text-xs uppercase tracking-wider">Total a Cobrar</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-base sm:text-lg font-black font-mono text-emerald-400">
                        ${formData.rate_calculated}
                      </span>
                      <span className="text-[10px] text-emerald-400/80 font-sans font-bold">USD</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Galería de Fotos de Evidencia */}
              <div className="bg-[#131c27] border border-white/8 rounded-2xl p-3.5 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Fotos de Evidencia ({photos.length})</span>
                  </span>
                  {photos.length > 0 && (
                    <span className="text-[10px] text-slate-400">Toca para ampliar</span>
                  )}
                </div>

                {loadingPhotos ? (
                  <div className="p-4 text-center bg-[#0b1118] rounded-xl border border-white/5 text-slate-400 text-xs">
                    Cargando fotos de evidencia...
                  </div>
                ) : photos.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {photos.map((photo, idx) => {
                      const photoSrc = photo.photo_data || `/uploads/${photo.filename}`;
                      return (
                        <div
                          key={photo.id || idx}
                          onClick={() => setPreviewPhoto(photoSrc)}
                          className="group relative aspect-square bg-[#0b1118] rounded-xl overflow-hidden border border-white/10 hover:border-cyan-400/60 transition cursor-pointer shadow-sm"
                        >
                          <img
                            src={photoSrc}
                            alt={photo.category || `Foto ${idx + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                          />
                          {/* Overlay con categoría e icono de zoom */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-between p-1.5">
                            <span className="self-start text-[9px] font-bold bg-black/70 text-cyan-300 px-1.5 py-0.5 rounded backdrop-blur-xs border border-white/10">
                              {photo.category || `#${idx + 1}`}
                            </span>
                            <div className="flex justify-end opacity-80 group-hover:opacity-100 transition">
                              <span className="p-1 bg-black/60 rounded-full text-white">
                                <ZoomIn className="w-3 h-3" />
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 text-center bg-[#0b1118] rounded-xl border border-white/5 space-y-1">
                    <ImageIcon className="w-6 h-6 text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-400 font-medium">Sin fotos de evidencia adjuntas</p>
                    <p className="text-[10px] text-slate-500">Puedes tomar o adjuntar fotos desde la pantalla principal</p>
                  </div>
                )}
              </div>

              {/* 4. Ficha Técnica y Especificaciones */}
              <div className="bg-[#131c27] border border-white/8 rounded-2xl p-3.5 space-y-2.5 shadow-sm">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Especificaciones Técnicas
                </span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-[#0b1118] p-2.5 rounded-xl border border-white/5">
                    <span className="text-slate-400 text-[10px] block">Longitud Drop</span>
                    <span className="font-mono font-bold text-white text-xs">{formData.drop_footage || 0} ft</span>
                  </div>
                  <div className="bg-[#0b1118] p-2.5 rounded-xl border border-white/5">
                    <span className="text-slate-400 text-[10px] block">Tipo de Cable</span>
                    <span className="font-mono font-bold text-cyan-300 text-xs">{formData.cable_type || 'RG-6'}</span>
                  </div>
                  <div className="bg-[#0b1118] p-2.5 rounded-xl border border-white/5">
                    <span className="text-slate-400 text-[10px] block">Perforación (Bore)</span>
                    <span className="font-semibold text-slate-200">
                      {(formData.bore_type || '').includes('DW') ? 'Driveway (+$30)' : formData.bore_type === 'SW:1' ? 'Sidewalk' : 'Sin Bore'}
                    </span>
                  </div>
                  <div className="bg-[#0b1118] p-2.5 rounded-xl border border-white/5">
                    <span className="text-slate-400 text-[10px] block">Fecha de Asignación</span>
                    <span className="font-mono font-semibold text-slate-200">{formData.work_date || 'No asignada'}</span>
                  </div>
                </div>
              </div>

              {/* 5. Observaciones & Obstáculos */}
              <div className="bg-[#131c27] border border-white/8 rounded-2xl p-3.5 space-y-1 shadow-sm">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Observaciones & Obstáculos
                </span>
                <p className="text-xs text-slate-300 font-medium leading-relaxed">
                  {formData.raw_notes || 'Sin observaciones ni obstáculos registrados.'}
                </p>
              </div>

              {/* 6. Motivo de No Realizado (si cancelado) */}
              {formData.status === 'No Realizado' && (
                <div className="bg-rose-950/25 border border-rose-500/30 rounded-2xl p-3.5 space-y-1 shadow-sm">
                  <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider block">
                    Motivo No Realizado
                  </span>
                  <p className="text-xs text-rose-200 font-semibold">{formData.cancel_reason || 'Sin motivo detallado'}</p>
                </div>
              )}
            </div>

            {/* Footer Ficha de Información */}
            <div className="px-4 py-3 border-t border-white/10 bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
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
            </div>
          </div>
        ) : (
          /* MODO EDICIÓN COMPLETA (FORMULARIO) */
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="p-4 overflow-y-auto sleek-scroll space-y-3.5 flex-1 min-h-0 text-xs">
              
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
                        className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
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
                        className={`py-2 px-1 rounded-xl text-[11px] font-bold border text-center transition cursor-pointer ${
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
                      className={`py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
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
                            className="px-2 py-0.5 bg-[#0d141e] hover:bg-[#182332] border border-white/5 text-amber-300 text-[10px] font-bold rounded-lg transition cursor-pointer"
                          >
                            -$30 (Sin DW)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleAdjustChange('sub', '25');
                              setFormData(prev => ({ ...prev, adjustment_reason: 'Deducción / Descuento parcial' }));
                            }}
                            className="px-2 py-0.5 bg-[#0d141e] hover:bg-[#182332] border border-white/5 text-amber-300 text-[10px] font-bold rounded-lg transition cursor-pointer"
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
                            className="px-2 py-0.5 bg-[#0d141e] hover:bg-[#182332] border border-white/5 text-emerald-300 text-[10px] font-bold rounded-lg transition cursor-pointer"
                          >
                            +$25 (Bono)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleAdjustChange('add', '30');
                              setFormData(prev => ({ ...prev, adjustment_reason: 'Driveway Bore autorizado' }));
                            }}
                            className="px-2 py-0.5 bg-[#0d141e] hover:bg-[#182332] border border-white/5 text-emerald-300 text-[10px] font-bold rounded-lg transition cursor-pointer"
                          >
                            +$30 (DW)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleAdjustChange('add', '50');
                              setFormData(prev => ({ ...prev, adjustment_reason: 'Trabajo complejo / rocoso' }));
                            }}
                            className="px-2 py-0.5 bg-[#0d141e] hover:bg-[#182332] border border-white/5 text-emerald-300 text-[10px] font-bold rounded-lg transition cursor-pointer"
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

            {/* Footer Formulario Edición */}
            <div className="px-4 py-3 border-t border-white/10 bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
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
            </div>
          </form>
        )}
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
