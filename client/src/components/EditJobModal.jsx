import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Check, DollarSign, MapPin, Phone, Ruler, SlidersHorizontal, 
  AlertCircle, Save, Pencil, Sparkles, Camera, ZoomIn, Loader2, 
  CheckCircle2, Trash2, Plus, ChevronDown, ChevronRight
} from 'lucide-react';
import { cleanPhoneNumber } from '../utils/smsUtils';
import { geocodeAddressWithMapbox, searchAddressSuggestions } from '../utils/mapboxGeocode';
import { calcOrderRate, normalizeRateCard, DEFAULT_RATE_CARD } from '../utils/rateUtils';
import CompactSelect from './CompactSelect';

const CABLE_TYPE_OPTIONS = [
  { value: 'RG-6', label: 'RG-6 (Coaxial Estándar)', shortLabel: 'RG-6 (Coaxial)' },
  { value: 'RG-11', label: 'RG-11 (Larga Distancia)', shortLabel: 'RG-11 (Largo)' },
  { value: 'EPON', label: 'Fibra', shortLabel: 'Fibra' }
];

const BORE_TYPE_OPTIONS = [
  { value: 'N', label: 'Sin cruce', sublabel: '$0', shortLabel: 'Sin cruce ($0)' },
  { value: 'DW:1', label: 'Driveway (DW)', sublabel: '+$30', shortLabel: 'Driveway (DW)' },
  { value: 'DW:2', label: '2 Driveways (DW:2)', sublabel: '+$60', shortLabel: '2 Driveways (DW:2)' },
  { value: 'SW:1', label: 'Acera / Sidewalk (SW)', sublabel: '$0', shortLabel: 'Acera (SW)' },
  { value: 'SW:2', label: '2 Aceras (SW:2)', sublabel: '$0', shortLabel: '2 Aceras (SW:2)' },
  { value: 'SW:1,DW:1', label: 'Acera + Driveway (SW + DW)', sublabel: '+$30', shortLabel: 'SW + DW' },
  { value: 'DW:1,RD:1', label: 'Driveway + Calle (DW + RD)', sublabel: '+$30', shortLabel: 'DW + RD' },
  { value: 'SW:1,RD:1', label: 'Acera + Calle (SW + RD)', sublabel: '$0', shortLabel: 'SW + RD' },
  { value: 'SW:1,DW:1,RD:1', label: 'Acera + Driveway + Calle (SW + DW + RD)', sublabel: '+$30', shortLabel: 'SW + DW + RD' },
  { value: 'RD:1', label: 'Road Bore / Calle (RD)', sublabel: '$2.50/ft (si se hace)', shortLabel: 'Road Bore (RD)' },
  { value: 'RD:2', label: 'Road Bore 2 / Doble vía (RD:2)', sublabel: '$2.50/ft (si se hace)', shortLabel: 'Road Bore 2 (RD:2)' }
];

const hasAccessCode = (pa, code) => {
  if (!pa || pa === 'N') return false;
  return pa.split(',').map(s => s.trim().toUpperCase()).includes(code);
};

const toggleAccessCode = (pa, code) => {
  const current = (pa || '').split(',').map(s => s.trim().toUpperCase()).filter(x => x && x !== 'N');
  let next;
  if (current.includes(code)) {
    next = current.filter(x => x !== code);
  } else {
    next = [...current, code];
  }
  return next.length > 0 ? next.join(',') : 'N';
};

const REMARK_CHIPS = [
  {
    id: 'access_free',
    label: 'Acceso Libre',
    icon: '🟢',
    isActive: (fd) => hasAccessCode(fd.premise_access, 'FREE'),
    toggle: (fd) => ({ ...fd, premise_access: toggleAccessCode(fd.premise_access, 'FREE') }),
    activeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-xs'
  },
  {
    id: 'access_rqhm',
    label: 'Req. Cliente (RQHM)',
    icon: '🏠',
    isActive: (fd) => hasAccessCode(fd.premise_access, 'RQHM'),
    toggle: (fd) => ({ ...fd, premise_access: toggleAccessCode(fd.premise_access, 'RQHM') }),
    activeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/50 shadow-xs'
  },
  {
    id: 'access_dog',
    label: 'Perro',
    icon: '🐕',
    isActive: (fd) => hasAccessCode(fd.premise_access, 'DOG'),
    toggle: (fd) => ({ ...fd, premise_access: toggleAccessCode(fd.premise_access, 'DOG') }),
    activeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-xs'
  },
  {
    id: 'access_gate',
    label: 'Portón / Candado',
    icon: '🔒',
    isActive: (fd) => hasAccessCode(fd.premise_access, 'GATE'),
    toggle: (fd) => ({ ...fd, premise_access: toggleAccessCode(fd.premise_access, 'GATE') }),
    activeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-xs'
  },
  {
    id: 'priority',
    label: 'Prioritario',
    icon: '🔴',
    isActive: (fd) => Boolean(fd.is_priority),
    toggle: (fd) => ({ ...fd, is_priority: !fd.is_priority }),
    activeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-xs'
  },
  {
    id: 'call_first',
    label: 'Call First',
    icon: '📞',
    isActive: (fd) => Boolean(fd.call_first),
    toggle: (fd) => ({ ...fd, call_first: !fd.call_first }),
    activeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-xs'
  },
  {
    id: 'temp_cable',
    label: 'Cable Temp',
    icon: '⚡',
    isActive: (fd) => Boolean(fd.is_temp),
    toggle: (fd) => ({ ...fd, is_temp: !fd.is_temp }),
    activeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-xs'
  },
  {
    id: 'obs_landsc',
    label: 'Jardinería (LANDSC)',
    icon: '🌿',
    isActive: (fd) => (fd.obstacles || '').includes('LANDSC'),
    toggle: (fd) => {
      const list = (fd.obstacles || '').split(',').filter(x => x && x !== 'N' && x !== 'LANDSC');
      if (!(fd.obstacles || '').includes('LANDSC')) list.push('LANDSC');
      return { ...fd, obstacles: list.length > 0 ? list.join(',') : 'N' };
    },
    activeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-xs'
  },
  {
    id: 'obs_sprklr',
    label: 'Aspersores (SPRKLR)',
    icon: '💦',
    isActive: (fd) => (fd.obstacles || '').includes('SPRKLR') || (fd.obstacles || '').includes('SPRKL'),
    toggle: (fd) => {
      const list = (fd.obstacles || '').split(',').filter(x => x && x !== 'N' && !x.startsWith('SPRKL'));
      if (!(fd.obstacles || '').includes('SPRKLR') && !(fd.obstacles || '').includes('SPRKL')) list.push('SPRKLR');
      return { ...fd, obstacles: list.length > 0 ? list.join(',') : 'N' };
    },
    activeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-xs'
  },
  {
    id: 'neighbor_crossing',
    label: 'Cruce Vecino (NBR)',
    icon: '👥',
    isActive: (fd) => fd.neighbor_notice === '1' || fd.neighbor_notice === '2' || fd.neighbor_notice === 'Y',
    toggle: (fd) => ({ ...fd, neighbor_notice: (fd.neighbor_notice === '1' || fd.neighbor_notice === 'Y') ? 'N' : '1' }),
    activeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-xs'
  }
];

export default function EditJobModal({ order, isOpen, onClose, onJobUpdated, onJobDeleted }) {
  const [formData, setFormData] = useState({
    job_id: '',
    work_date: '',
    tech_id: 'Javier (P0G1)',
    address: '',
    city: '',
    zip_code: '',
    phone: '',
    call_first: false,
    is_priority: false,
    drop_footage: '',
    cable_type: 'RG-6',
    bore_type: 'N',
    road_bore_ft: '',
    is_temp: false,
    premise_access: 'N',
    obstacles: 'N',
    neighbor_notice: 'N',
    status: 'Pendiente',
    cancel_reason: '',
    raw_notes: '',
    latitude: null,
    longitude: null
  });

  const [showBreakdown, setShowBreakdown] = useState(false);

  const [adjustType, setAdjustType] = useState('none'); // 'none' | 'add' | 'sub'
  const [adjustVal, setAdjustVal] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');

  const [photos, setPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [rateCard, setRateCard] = useState(DEFAULT_RATE_CARD);

  // Address Autocomplete state
  const [suggestions, setSuggestions] = useState([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceTimerRef = useRef(null);

  useEffect(() => {
    if (order && isOpen) {
      fetch('/api/settings')
        .then(r => r.ok ? r.json() : null)
        .then(s => {
          if (s?.rate_card) setRateCard(normalizeRateCard(s.rate_card));
        })
        .catch(() => {});

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
        tech_id: order.tech_id || 'Javier (P0G1)',
        address: order.address || '',
        city: order.city || '',
        zip_code: order.zip_code || '',
        phone: order.phone || '',
        call_first: Boolean(order.call_first),
        is_priority: Boolean(order.is_priority),
        drop_footage: order.drop_footage !== undefined && order.drop_footage !== null ? String(order.drop_footage) : '',
        cable_type: order.cable_type || 'RG-6',
        bore_type: order.bore_type || 'N',
        road_bore_ft: order.road_bore_ft !== undefined && order.road_bore_ft !== null ? String(order.road_bore_ft) : '',
        is_temp: Boolean(order.is_temp),
        premise_access: order.premise_access || 'N',
        obstacles: order.obstacles || 'N',
        neighbor_notice: order.neighbor_notice || 'N',
        status: order.status || 'Pendiente',
        cancel_reason: order.cancel_reason || '',
        raw_notes: order.raw_notes || '',
        latitude: order.latitude || null,
        longitude: order.longitude || null
      });
      setShowBreakdown(false);

      setAdjustType(type);
      setAdjustVal(val);
      setAdjustmentReason(order.adjustment_reason || '');
      setError(null);
      setSaving(false);
      setSuggestions([]);
      setShowSuggestions(false);

      // Cargar fotos de evidencia asociadas al trabajo
      const initialPhotos = Array.isArray(order.photos) ? order.photos : [];
      setPhotos(initialPhotos);

      const targetId = order.id || order.job_id;
      if (targetId) {
        let isMounted = true;
        setLoadingPhotos(true);
        fetch(`/api/orders/${targetId}/photos`)
          .then(res => res.json())
          .then(data => {
            if (isMounted && data && Array.isArray(data.photos)) {
              if (data.photos.length > 0 || initialPhotos.length === 0) {
                setPhotos(data.photos);
              }
            }
          })
          .catch(err => console.warn('No se pudieron recargar las fotos:', err))
          .finally(() => {
            if (isMounted) setLoadingPhotos(false);
          });
        return () => { isMounted = false; };
      }
    }
  }, [order, isOpen]);

  // Debounced search for address suggestions
  const handleAddressChange = (val) => {
    setFormData(prev => ({ ...prev, address: val }));
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (!val || val.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setSearchingAddress(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchAddressSuggestions(val);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch (e) {
        setSuggestions([]);
      } finally {
        setSearchingAddress(false);
      }
    }, 280);
  };

  const handleSelectSuggestion = (sug) => {
    setFormData(prev => ({
      ...prev,
      address: sug.streetAddress,
      city: sug.city || prev.city,
      zip_code: sug.zipCode || prev.zip_code,
      latitude: sug.latitude,
      longitude: sug.longitude
    }));
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleUploadPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const targetId = order.id || order.job_id;
    if (!targetId) return;

    const isCancelledOrder = order?.status === 'No Realizado' || order?.status === 'Cancelado';
    const data = new FormData();
    data.append('category', isCancelledOrder ? 'Constancia No Realizado' : 'Trabajo Terminado');
    files.forEach(f => data.append('photos', f));

    try {
      setLoadingPhotos(true);
      const res = await fetch(`/api/orders/${targetId}/photos`, {
        method: 'POST',
        body: data
      });
      if (res.ok) {
        const photoRes = await fetch(`/api/orders/${targetId}/photos`);
        if (photoRes.ok) {
          const fresh = await photoRes.json();
          if (Array.isArray(fresh.photos)) setPhotos(fresh.photos);
        }
        if (onJobUpdated) onJobUpdated();
      }
    } catch (err) {
      console.error('Error subiendo fotos:', err);
    } finally {
      setLoadingPhotos(false);
    }
  };

  const handleDeletePhoto = async (photoId, e) => {
    e.stopPropagation();
    if (!window.confirm('¿Eliminar esta foto de evidencia?')) return;
    try {
      const res = await fetch(`/api/photos/${photoId}`, { method: 'DELETE' });
      if (res.ok) {
        setPhotos(prev => prev.filter(p => p.id !== photoId));
        if (onJobUpdated) onJobUpdated();
      }
    } catch (err) {
      console.error('Error eliminando foto:', err);
    }
  };

  if (!isOpen || !order) return null;

  // Cálculo Dinámico de Tarifa idéntico a AddJobModal
  const numFootage = parseFloat(formData.drop_footage) || 0;
  const numAdj = parseFloat(String(adjustVal).replace(/[^0-9.]/g, '')) || 0;
  let finalAdj = 0;
  if (adjustType === 'add') finalAdj = Math.abs(numAdj);
  else if (adjustType === 'sub') finalAdj = -Math.abs(numAdj);

  const numRoadBoreFt = parseFloat(formData.road_bore_ft) || 0;
  const isRoadBore = String(formData.bore_type || '').includes('RD');
  const rateResult = calcOrderRate({
    drop_footage: numFootage,
    bore_type: formData.bore_type,
    cable_type: formData.cable_type,
    road_bore_ft: isRoadBore ? numRoadBoreFt : 0
  }, rateCard);

  const footageBonus = Math.max(0, rateResult.baseAmount - (rateCard?.B003?.price || 100));
  const dwItem = rateResult.matchedCodes?.find(c => c.code === 'D20');
  const boreBonus = dwItem ? dwItem.price : 0;
  const rdItem = rateResult.matchedCodes?.find(c => c.code === 'B002');
  const roadBoreBonus = rdItem ? rdItem.price : 0;

  const currentTotal = Math.max(0, rateResult.total + finalAdj);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanJobId = (formData.job_id || '').trim();
    const cleanAddress = (formData.address || '').trim();

    if (!cleanJobId || !cleanAddress) {
      setError('Por favor ingresa el número de trabajo (Job ID) y la dirección.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let lat = formData.latitude;
      let lng = formData.longitude;

      // Geocodificar dirección si cambió respecto a la original o si faltan coordenadas
      if (cleanAddress !== order.address || !lat || !lng) {
        try {
          const geo = await geocodeAddressWithMapbox(cleanAddress, formData.city, formData.zip_code);
          if (geo && geo.latitude && geo.longitude) {
            lat = geo.latitude;
            lng = geo.longitude;
          }
        } catch (geoErr) {
          console.warn('Aviso de geocodificación:', geoErr.message);
        }
      }

      const payload = {
        ...order,
        ...formData,
        premise_access: formData.premise_access === 'FREE' ? 'N' : (formData.premise_access || 'N'),
        job_id: cleanJobId,
        address: cleanAddress,
        city: (formData.city || '').trim().toUpperCase(),
        phone: cleanPhoneNumber(formData.phone),
        drop_footage: numFootage,
        road_bore_ft: isRoadBore ? numRoadBoreFt : 0,
        rate_calculated: currentTotal,
        manual_adjustment: finalAdj,
        adjustment_reason: adjustType === 'none' ? '' : (adjustmentReason || '').trim(),
        call_first: formData.call_first ? 1 : 0,
        is_priority: formData.is_priority ? 1 : 0,
        latitude: lat,
        longitude: lng
      };

      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al actualizar el trabajo');
      }

      if (onJobUpdated) await onJobUpdated();
      onClose();
    } catch (err) {
      setError(err.message || 'Error al actualizar el trabajo');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteJob = async () => {
    const targetId = order?.id || order?.job_id;
    if (!targetId) return;

    const jobIdentifier = (formData.job_id || order?.job_id || '').trim();
    const confirmMsg = `¿Estás seguro de que deseas eliminar este trabajo${jobIdentifier ? ` (Job #${jobIdentifier})` : ''}?\n\nEsta acción eliminará permanentemente la orden y todo su historial.`;

    if (!window.confirm(confirmMsg)) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/orders/${targetId}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al eliminar el trabajo');
      }

      if (onJobDeleted) {
        await onJobDeleted(targetId);
      } else if (onJobUpdated) {
        await onJobUpdated();
      }
      onClose();
    } catch (err) {
      console.error('Error al eliminar trabajo:', err);
      setError(err.message || 'Error al eliminar el trabajo');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-md p-3.5 sm:p-5 animate-fade-in modal-overlay-safe"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px) + 24px, 1.75rem)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 24px, 1.75rem)'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form 
        onSubmit={handleSubmit}
        className="bg-[#101722] border border-white/10 w-full max-w-sm sm:max-w-md rounded-3xl shadow-2xl flex flex-col max-h-[82dvh] sm:max-h-[85dvh] overflow-hidden transition-all mx-auto text-white my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header Elegante y Compacto (Idéntico a Añadir Trabajo) */}
        <div className="px-3.5 py-2.5 bg-white dark:bg-[#131d2b] border-b border-slate-200 dark:border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 flex items-center justify-center shadow-xs">
              <Pencil className="h-3.5 w-3.5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-900 dark:text-white leading-tight">
                Editar Trabajo
              </h3>
              <p className="text-[9.5px] text-slate-500 dark:text-slate-400 font-semibold font-mono">
                Job #{formData.job_id || order.job_id} • Modificar orden
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleDeleteJob}
              disabled={deleting || saving}
              className="w-7 h-7 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 flex items-center justify-center transition active:scale-90 cursor-pointer disabled:opacity-50"
              title="Eliminar este trabajo"
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition active:scale-90 cursor-pointer"
              title="Cerrar ventana"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Formulario Principal con Scroll */}
        <div className="p-3 space-y-2.5 flex-1 min-h-0 text-xs overflow-y-auto scrollbar-none">
          {error && (
            <div className="p-2 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Tarifa Estimada Banner Limpio con Contador y Desglose Plegable */}
          <div className="bg-[#131d2b] border border-emerald-500/30 rounded-2xl p-2.5 space-y-2 shadow-xs shrink-0">
            <div 
              onClick={() => setShowBreakdown(!showBreakdown)}
              className="flex items-center justify-between gap-2 cursor-pointer select-none group"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-200">
                  Tarifa Estimada:
                </span>
              </div>

              {/* Medallón Contador de Dinero + Flechita al lado en la misma esquina */}
              <div className="flex items-center gap-1.5 shrink-0">
                <div
                  className="flex items-center gap-0.5 px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-mono font-black shadow-xs text-sm transition"
                  title="Tarifa calculada"
                >
                  <span className="text-xs font-bold">$</span>
                  <span>{currentTotal.toFixed(2)}</span>
                </div>
                <div 
                  className={`p-1 rounded-lg border transition ${
                    showBreakdown 
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' 
                      : 'bg-white/5 text-slate-400 border-white/10 group-hover:text-white'
                  }`}
                  title={showBreakdown ? "Ocultar desglose" : "Ver desglose de tarifa"}
                >
                  <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showBreakdown ? 'rotate-180' : ''}`} />
                </div>
              </div>
            </div>

            {/* Panel Desplegable: Desglose Lineal Detallado por Códigos */}
            {showBreakdown && (
              <div className="bg-[#0b1017] border border-cyan-500/30 rounded-xl p-2.5 space-y-1.5 animate-fade-in text-xs shadow-inner">
                <div className="flex items-center justify-between gap-2 pb-1 border-b border-white/10">
                  <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap shrink-0">
                    <Sparkles className="h-3 w-3 shrink-0" />
                    <span>Desglose de Tarifa</span>
                  </span>
                  <span className="text-[9.5px] font-mono text-slate-400 whitespace-nowrap shrink-0">
                    {formData.cable_type === 'EPON' ? 'Fibra' : (formData.cable_type || 'RG-6')} • {numFootage} ft
                  </span>
                </div>

                <div className="space-y-1">
                  {rateResult.matchedCodes.map((codeItem, cIdx) => (
                    <div key={`${codeItem.code}-${cIdx}`} className="flex items-center justify-between py-1 px-2 rounded-lg bg-[#141d29]/80 border border-white/5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`px-1.5 py-0.5 rounded font-mono font-black text-[9.5px] border ${
                          cIdx === 0
                            ? 'bg-blue-950 text-blue-300 border-blue-800'
                            : codeItem.code === 'D20'
                            ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                            : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                        }`}>
                          {codeItem.code}
                        </span>
                        <span className="text-slate-200 text-[10.5px] font-medium truncate">
                          {codeItem.label}
                        </span>
                      </div>
                      <span className="font-mono font-black text-emerald-400 text-xs shrink-0 ml-2">
                        {cIdx > 0 ? `+$${codeItem.price.toFixed(2)}` : `$${codeItem.price.toFixed(2)}`}
                      </span>
                    </div>
                  ))}

                  {finalAdj !== 0 && (
                    <div className="flex items-center justify-between py-1 px-2 rounded-lg bg-[#141d29]/80 border border-white/5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`px-1.5 py-0.5 rounded font-mono font-black text-[9.5px] border ${
                          finalAdj > 0 ? 'bg-cyan-950 text-cyan-300 border-cyan-800' : 'bg-amber-950 text-amber-300 border-amber-800'
                        }`}>
                          AJUSTE
                        </span>
                        <span className="text-slate-200 text-[10.5px] font-medium truncate">
                          Ajuste Supervisor {adjustmentReason ? `(${adjustmentReason})` : ''}
                        </span>
                      </div>
                      <span className={`font-mono font-black text-xs shrink-0 ml-2 ${finalAdj > 0 ? 'text-cyan-400' : 'text-amber-400'}`}>
                        {finalAdj > 0 ? `+$${finalAdj.toFixed(2)}` : `-$${Math.abs(finalAdj).toFixed(2)}`}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-white/10 font-bold px-1">
                  <span className="text-slate-300 text-[10.5px]">Total Compensación:</span>
                  <span className="font-mono text-emerald-400 font-black text-xs">
                    ${currentTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Fila 1: Job ID y Fecha */}
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <label className="block text-[9.5px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 truncate">
                Job ID (Orden #) *
              </label>
              <input
                type="text"
                required
                placeholder="ej. 734521"
                value={formData.job_id}
                onChange={(e) => setFormData({ ...formData, job_id: e.target.value })}
                className="w-full h-8.5 bg-[#16202c] border border-white/10 rounded-xl px-2.5 text-cyan-400 font-mono font-bold focus:outline-none focus:border-cyan-400 text-xs shadow-xs"
              />
            </div>

            <div className="min-w-0">
              <label className="block text-[9.5px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 truncate">
                Fecha Asignada
              </label>
              <input
                type="date"
                required
                value={formData.work_date}
                onChange={(e) => setFormData({ ...formData, work_date: e.target.value })}
                className="w-full h-8.5 bg-[#16202c] border border-white/10 rounded-xl px-2.5 text-slate-200 font-mono font-bold focus:outline-none focus:border-cyan-400 text-xs shadow-xs dark:[color-scheme:dark] [color-scheme:light]"
              />
            </div>
          </div>

          {/* Fila 2: Dirección con Buscador y Autocompletado Mapbox (SIN ubicación GPS abajo) */}
          <div className="relative">
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[9.5px] font-bold text-slate-300 uppercase tracking-wider">
                Dirección de la Vivienda *
              </label>
              {searchingAddress && (
                <span className="flex items-center gap-1 text-[9.5px] text-cyan-400 font-bold animate-pulse">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" /> Buscando...
                </span>
              )}
            </div>

            <div className="relative">
              <MapPin className="h-3.5 w-3.5 text-cyan-400 absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                type="text"
                required
                placeholder="Dirección (ej. 1308 Mintcrest, 23322 Ironwood...)"
                value={formData.address}
                onChange={(e) => handleAddressChange(e.target.value)}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                className="w-full h-8.5 bg-[#16202c] border border-white/10 focus:border-cyan-400 rounded-xl pl-8 pr-2.5 text-white font-semibold focus:outline-none text-xs placeholder-slate-500 shadow-xs"
              />
            </div>

            {/* Dropdown de Sugerencias de Mapbox */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-[#192433] border border-cyan-500/40 rounded-xl shadow-2xl z-40 overflow-hidden divide-y divide-white/5 animate-fade-in max-h-48 overflow-y-auto">
                <div className="p-1 bg-cyan-950/40 text-[9.5px] font-bold text-cyan-400 uppercase tracking-wider px-2.5">
                  Direcciones encontradas:
                </div>
                {suggestions.map((sug) => (
                  <button
                    key={sug.id}
                    type="button"
                    onClick={() => handleSelectSuggestion(sug)}
                    className="w-full text-left p-2 hover:bg-cyan-500/15 flex items-start gap-2 transition cursor-pointer"
                  >
                    <MapPin className="h-3.5 w-3.5 text-cyan-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-white leading-tight truncate">
                        {sug.streetAddress}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {sug.city ? `${sug.city}, ` : ''}{sug.state} {sug.zipCode}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fila: Ciudad y Código Postal */}
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <label className="block text-[9.5px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 truncate">
                Ciudad
              </label>
              <input
                type="text"
                placeholder="Ciudad (ej. Goshen)"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value.toUpperCase() })}
                className="w-full h-8.5 bg-[#16202c] border border-white/10 rounded-xl px-2.5 text-white uppercase font-bold focus:outline-none focus:border-cyan-400 text-xs shadow-xs"
              />
            </div>

            <div className="min-w-0">
              <label className="block text-[9.5px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 truncate">
                Código Postal (ZIP)
              </label>
              <input
                type="text"
                placeholder="ej. 46526"
                value={formData.zip_code}
                onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
                className="w-full h-8.5 bg-[#16202c] border border-white/10 rounded-xl px-2.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-400 shadow-xs"
              />
            </div>
          </div>

          {/* Fila 3: Teléfono del Cliente & Pies de Cable */}
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <label className="block text-[9.5px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 truncate">
                Teléfono del Cliente
              </label>
              <div className="relative">
                <Phone className="h-3 w-3 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  type="tel"
                  placeholder="ej. 5741234567"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full h-8.5 bg-[#16202c] border border-white/10 rounded-xl pl-7 pr-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div className="min-w-0">
              <label className="block text-[9.5px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 truncate">
                Pies (Drop ft)
              </label>
              <div className="relative">
                <Ruler className="h-3 w-3 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  type="number"
                  step="0.1"
                  placeholder="ej. 120"
                  value={formData.drop_footage}
                  onChange={(e) => setFormData({ ...formData, drop_footage: e.target.value })}
                  className="w-full h-8.5 bg-[#16202c] border border-white/10 rounded-xl pl-7 pr-2 text-amber-300 font-mono font-bold text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          </div>

          {/* Fila 4: Tipo de Cable & Cruce / Bore */}
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <label className="block text-[9.5px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 truncate">
                Tipo de Cable
              </label>
              <CompactSelect
                value={formData.cable_type || 'RG-6'}
                onChange={(val) => setFormData({ ...formData, cable_type: val })}
                options={CABLE_TYPE_OPTIONS}
              />
            </div>

            <div className="min-w-0">
              <label className="block text-[9.5px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 truncate">
                Cruce / Bore
              </label>
              <CompactSelect
                value={formData.bore_type || 'N'}
                onChange={(val) => setFormData({ ...formData, bore_type: val })}
                options={BORE_TYPE_OPTIONS}
              />
            </div>
          </div>

          {/* Campo adicional cuando se selecciona Road Bore (RD) */}
          {isRoadBore && (
            <div className="bg-[#0b1017] border border-cyan-500/30 rounded-xl p-2.5 space-y-1 animate-fade-in shadow-inner">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-cyan-300 flex items-center gap-1.5">
                  <Ruler className="h-3 w-3 text-cyan-400" />
                  <span>Pies Bajo Calle (Road Bore - Código B002)</span>
                </label>
                <span className="text-[10px] font-mono text-emerald-400 font-bold">
                  ${(rateCard?.B002?.price || 2.50).toFixed(2)} / pie
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="ej. 25 ft bajo calle"
                  value={formData.road_bore_ft}
                  onChange={(e) => setFormData({ ...formData, road_bore_ft: e.target.value })}
                  className="flex-1 h-8 bg-[#16202c] border border-white/10 focus:border-cyan-400 rounded-lg px-2.5 text-xs text-amber-300 font-mono font-bold focus:outline-none"
                />
                <div className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 font-mono text-xs font-black text-emerald-400 shrink-0">
                  +${roadBoreBonus.toFixed(2)}
                </div>
              </div>
            </div>
          )}

          {/* Fila 5: Selector de Chips de Observaciones / Remarks */}
          <div className="space-y-2 pt-1 border-t border-white/5">
            <div className="flex items-center justify-between">
              <label className="text-[9.5px] font-bold text-slate-300 uppercase tracking-wider">
                Observaciones / Condiciones del Terreno
              </label>
              <span className="text-[9.5px] font-medium text-slate-500">
                Toca para seleccionar
              </span>
            </div>

            {/* Chips interactivos estructurados */}
            <div className="flex flex-wrap gap-1.5">
              {REMARK_CHIPS.map((chip) => {
                const active = chip.isActive(formData);
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setFormData((prev) => chip.toggle(prev))}
                    className={`px-2.5 py-1 rounded-xl text-[10.5px] font-semibold border transition active:scale-95 cursor-pointer flex items-center gap-1.5 ${
                      active
                        ? chip.activeClass
                        : 'bg-[#141d29] text-slate-400 border-white/10 hover:border-white/20 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-[11px]">{chip.icon}</span>
                    <span>{chip.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Notas Adicionales Escritas */}
            <div className="pt-0.5">
              <input
                type="text"
                placeholder="Otras observaciones específicas (ej. portón código 4421, tocar timbre...)"
                value={formData.raw_notes}
                onChange={(e) => setFormData({ ...formData, raw_notes: e.target.value })}
                className="w-full h-8.5 bg-[#16202c] border border-white/10 focus:border-cyan-400 rounded-xl px-2.5 text-xs text-white placeholder-slate-500 focus:outline-none shadow-xs"
              />
            </div>
          </div>

          {/* Fila 7: Ajuste Manual de Supervisor (ABAJO de Remarks) */}
          <div className="bg-[#16202c] border border-white/5 rounded-xl p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9.5px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-cyan-400" />
                <span>Ajuste de Supervisor</span>
              </span>
              {finalAdj !== 0 && (
                <span className={`text-[10px] font-mono font-bold ${finalAdj > 0 ? 'text-cyan-400' : 'text-amber-400'}`}>
                  {finalAdj > 0 ? `+$${finalAdj}` : `-$${Math.abs(finalAdj)}`}
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => { setAdjustType('none'); setAdjustVal(''); setAdjustmentReason(''); }}
                className={`py-1 rounded-lg text-[10.5px] font-bold transition cursor-pointer ${
                  adjustType === 'none'
                    ? 'bg-white/15 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Sin Ajuste
              </button>
              <button
                type="button"
                onClick={() => setAdjustType('add')}
                className={`py-1 rounded-lg text-[10.5px] font-bold transition cursor-pointer ${
                  adjustType === 'add'
                    ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                + Bono
              </button>
              <button
                type="button"
                onClick={() => setAdjustType('sub')}
                className={`py-1 rounded-lg text-[10.5px] font-bold transition cursor-pointer ${
                  adjustType === 'sub'
                    ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                - Descuento
              </button>
            </div>

            {adjustType !== 'none' && (
              <div className="grid grid-cols-2 gap-1.5 pt-1 animate-fade-in">
                <div>
                  <label className="block text-[8.5px] font-bold text-slate-400 uppercase mb-0.5">
                    Monto ($)
                  </label>
                  <input
                    type="number"
                    placeholder="ej. 20"
                    value={adjustVal}
                    onChange={(e) => setAdjustVal(e.target.value)}
                    className="w-full h-7 bg-[#101722] border border-white/10 rounded-lg px-2 text-xs font-mono font-bold text-cyan-400 focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-[8.5px] font-bold text-slate-400 uppercase mb-0.5">
                    Motivo
                  </label>
                  <input
                    type="text"
                    placeholder="ej. Apoyo especial"
                    value={adjustmentReason}
                    onChange={(e) => setAdjustmentReason(e.target.value)}
                    className="w-full h-7 bg-[#101722] border border-white/10 rounded-lg px-2 text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Sección: Fotos de Evidencia (Al Final) */}
          <div className="bg-[#16202c] border border-white/5 rounded-xl p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9.5px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-cyan-400" />
                <span>Fotos de Evidencia ({photos.length})</span>
              </span>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer px-2 py-0.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/35 hover:bg-cyan-500/30 text-[9.5px] font-bold flex items-center gap-1 transition active:scale-95 shadow-xs">
                  <Plus className="w-2.5 h-2.5 stroke-[3]" />
                  <span>Foto</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleUploadPhotos}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {loadingPhotos ? (
              <div className="py-3 text-center text-slate-400 text-[10px] flex items-center justify-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                <span>Cargando fotos de evidencia...</span>
              </div>
            ) : photos.length > 0 ? (
              <div className="grid grid-cols-3 gap-1.5">
                {photos.map((photo, pIdx) => {
                  const photoSrc = photo.photo_data || (photo.filename ? `/uploads/${photo.filename}` : photo.url || photo.src);
                  return (
                    <div
                      key={photo.id || pIdx}
                      onClick={() => setPreviewPhoto(photoSrc)}
                      className="group relative aspect-square bg-[#0b1118] rounded-lg overflow-hidden border border-white/10 hover:border-cyan-400/60 transition cursor-pointer shadow-xs"
                    >
                      <img
                        src={photoSrc}
                        alt={photo.category || `Foto ${pIdx + 1}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-between p-1">
                        <div className="flex items-center justify-between w-full">
                          <span className="text-[7.5px] font-bold bg-black/70 text-cyan-300 px-1 py-0.2 rounded border border-white/10 truncate max-w-[70%]">
                            {photo.category === 'Constancia No Realizado' ? 'Motivo' : (photo.category || `#${pIdx + 1}`)}
                          </span>
                          {photo.id && (
                            <button
                              type="button"
                              onClick={(e) => handleDeletePhoto(photo.id, e)}
                              className="p-0.5 rounded bg-black/60 text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 transition cursor-pointer"
                              title="Eliminar foto"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
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
              <p className="text-[10px] text-slate-500 italic py-1">
                Sin fotos de evidencia adjuntas
              </p>
            )}
          </div>
        </div>

        {/* Footer Fijo con Botones de Acción */}
        <div className="p-3 bg-slate-900/90 flex items-center justify-between gap-2 border-t border-white/10 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 bg-[#16202c] hover:bg-white/10 text-slate-300 hover:text-white text-xs font-bold rounded-xl transition border border-white/5 active:scale-95 cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="submit"
            disabled={saving}
            className="py-2 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-500/25 active:scale-95 transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <Check className="h-4 w-4 stroke-[3]" />
            <span>{saving ? 'Guardando...' : 'Guardar cambios'}</span>
          </button>
        </div>
      </form>

      {/* Lightbox / Visor de Fotos en Pantalla Completa (FOTO CENTRADA Y BOTONES DESPEGADOS) */}
      {previewPhoto && (
        <div
          onClick={() => setPreviewPhoto(null)}
          className="fixed inset-0 z-[80] bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-4 animate-fade-in select-none"
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 0px) + 12px, 1rem)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 1.25rem)'
          }}
        >
          {/* Barra superior con botón X despejado en la esquina superior derecha sin tapar la foto */}
          <div className="w-full flex items-center justify-end px-2 py-1 shrink-0 z-50">
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="p-2.5 rounded-full bg-slate-900/90 text-white hover:text-cyan-400 border border-white/20 shadow-2xl transition active:scale-90 cursor-pointer"
              title="Cerrar visor de foto"
            >
              <X className="h-5 w-5 stroke-[2.5]" />
            </button>
          </div>

          {/* Contenedor central: foto perfectamente centrada en el medio */}
          <div 
            className="flex-1 min-h-0 w-full flex items-center justify-center p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewPhoto}
              alt="Evidencia Ampliada"
              className="max-h-[62dvh] sm:max-h-[68dvh] max-w-[92vw] sm:max-w-lg w-auto h-auto rounded-2xl object-contain border border-white/10 shadow-2xl"
            />
          </div>

          {/* Botón inferior despegado abajo con margen prudente */}
          <div className="shrink-0 pt-3 pb-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="px-6 py-2.5 bg-[#16202c] hover:bg-[#1e2b3b] text-white border border-white/15 rounded-xl text-xs font-bold transition shadow-xl active:scale-95 cursor-pointer flex items-center gap-2"
            >
              <X className="h-4 w-4" />
              <span>Cerrar Foto</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
