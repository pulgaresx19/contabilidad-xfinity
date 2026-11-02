import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, X, Check, AlertCircle, Phone, MapPin, Ruler, DollarSign, 
  Calendar, Sparkles, Navigation, Search, Loader2, CheckCircle2
} from 'lucide-react';
import { getLocalDateStr } from '../utils/dateUtils';
import { geocodeAddressWithMapbox, searchAddressSuggestions } from '../utils/mapboxGeocode';

export default function AddJobModal({ isOpen, onClose, onJobAdded, defaultTech, initialDate }) {
  const [formData, setFormData] = useState({
    work_date: initialDate || getLocalDateStr(),
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
    payment_status: 'Pendiente',
    latitude: null,
    longitude: null
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Address Autocomplete state
  const [suggestions, setSuggestions] = useState([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showManualCity, setShowManualCity] = useState(false);
  const debounceTimerRef = useRef(null);

  // Sync with initialDate and reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        work_date: initialDate || getLocalDateStr(),
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
        payment_status: 'Pendiente',
        latitude: null,
        longitude: null
      });
      setError(null);
      setSaving(false);
      setSuggestions([]);
      setShowSuggestions(false);
      setShowManualCity(false);
    }
  }, [isOpen, initialDate, defaultTech]);

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
      city: sug.city || '',
      zip_code: sug.zipCode || prev.zip_code,
      latitude: sug.latitude,
      longitude: sug.longitude
    }));
    setSuggestions([]);
    setShowSuggestions(false);
  };

  // Add quick tag to remarks
  const handleAddRemarkTag = (tag) => {
    setFormData(prev => {
      const current = (prev.raw_notes || '').trim();
      if (current.includes(tag)) return prev;
      const updated = current ? `${current}, ${tag}` : tag;
      return { ...prev, raw_notes: updated };
    });
  };

  if (!isOpen) return null;

  const numFootage = parseFloat(formData.drop_footage) || 0;
  const isDW = formData.bore_type && formData.bore_type.includes('DW');
  const boreBonus = isDW ? 30 : 0;
  const extraBlocks = numFootage > 300 ? Math.floor((numFootage - 300) / 100) : 0;
  const footageBonus = extraBlocks > 0 ? extraBlocks * 25 : 0;
  const currentTotal = 100 + boreBonus + footageBonus;

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

      // If coordinates weren't already resolved by autocomplete, geocode now
      if (!lat || !lng) {
        try {
          const geo = await geocodeAddressWithMapbox(cleanAddress, formData.city, formData.zip_code);
          if (geo && geo.latitude && geo.longitude) {
            lat = geo.latitude;
            lng = geo.longitude;
          }
        } catch (geoErr) {
          console.warn('Geocoding notice:', geoErr.message);
        }
      }

      const payload = {
        ...formData,
        job_id: cleanJobId,
        address: cleanAddress,
        city: (formData.city || '').trim().toUpperCase(),
        drop_footage: numFootage,
        rate_calculated: currentTotal,
        latitude: lat,
        longitude: lng
      };

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        if (onJobAdded) await onJobAdded(data);
        onClose();
        return;
      } else {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Error del servidor (${res.status}) al guardar la orden.`);
      }
    } catch (err) {
      console.error('Error saving job:', err);
      setError(err.message || 'Error al guardar el trabajo. Verifica los datos.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 animate-fade-in">
      <div className="bg-[#101722] border border-white/10 w-full max-w-sm sm:max-w-md rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden transition-all mx-auto text-white">
        
        {/* Header Elegante y Centrado */}
        <div className="px-4 py-3 bg-[#131d2b] border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center shadow-xs">
              <Plus className="h-4 w-4 stroke-[3]" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white leading-tight">
                Añadir Trabajo
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">
                Ingreso rápido de orden de trabajo
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition active:scale-90"
            title="Cerrar ventana"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Formulario Principal */}
        <form onSubmit={handleSubmit} className="p-3.5 sm:p-4 overflow-y-auto space-y-3 flex-1 text-xs scrollbar-none">
          {error && (
            <div className="p-2.5 bg-rose-500/15 border border-rose-500/30 rounded-2xl text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Tarifa Estimada Banner */}
          <div className="bg-gradient-to-r from-emerald-950/40 via-emerald-900/30 to-emerald-950/40 border border-emerald-500/30 rounded-2xl p-2.5 flex items-center justify-between gap-2 shadow-xs shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                  Tarifa Estimada:
                </span>
                <span className="text-xs font-mono text-slate-200 font-semibold">
                  Base $100
                  {boreBonus > 0 && <strong className="text-cyan-400 font-bold"> +$30 DW</strong>}
                  {footageBonus > 0 && <strong className="text-emerald-400 font-bold"> +${footageBonus} Drop</strong>}
                </span>
              </div>
              {footageBonus > 0 ? (
                <p className="text-[10px] text-emerald-400 font-bold truncate mt-0.5">
                  ✓ Bono metraje: {extraBlocks} tramo(s) sobre 300 ft
                </p>
              ) : null}
            </div>

            {/* Medallón Dinero */}
            <div className="flex items-center gap-0.5 px-3 py-1 bg-emerald-500 text-slate-950 rounded-xl font-mono font-black shadow-xs shrink-0">
              <span className="text-xs">$</span>
              <span className="text-lg leading-none">{currentTotal}</span>
            </div>
          </div>

          {/* Fila 1: Job ID y Fecha */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="min-w-0">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 truncate">
                Job ID (Orden #) *
              </label>
              <input
                type="text"
                required
                placeholder="ej. 734521"
                value={formData.job_id}
                onChange={(e) => setFormData({ ...formData, job_id: e.target.value })}
                className="w-full h-10 bg-[#16202c] border border-white/10 rounded-xl px-3 text-cyan-400 font-mono font-bold focus:outline-none focus:border-cyan-400 text-xs shadow-xs"
              />
            </div>

            <div className="min-w-0">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 truncate">
                Fecha Asignada
              </label>
              <input
                type="date"
                required
                value={formData.work_date}
                onChange={(e) => setFormData({ ...formData, work_date: e.target.value })}
                className="w-full h-10 bg-[#16202c] border border-white/10 rounded-xl px-3 text-slate-200 font-mono font-bold focus:outline-none focus:border-cyan-400 text-xs shadow-xs [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Fila 2: Dirección con Buscador y Autocompletado */}
          <div className="relative">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                Dirección de la Vivienda *
              </label>
              {searchingAddress && (
                <span className="flex items-center gap-1 text-[10px] text-cyan-400 font-bold animate-pulse">
                  <Loader2 className="h-3 w-3 animate-spin" /> Buscando sugerencias...
                </span>
              )}
            </div>

            <div className="relative">
              <MapPin className="h-4 w-4 text-cyan-400 absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                required
                placeholder="Escribe la dirección (ej. 1308 Mintcrest, 23322 Ironwood...)"
                value={formData.address}
                onChange={(e) => handleAddressChange(e.target.value)}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                className="w-full h-10 bg-[#16202c] border border-white/10 focus:border-cyan-400 rounded-xl pl-9 pr-3 text-white font-semibold focus:outline-none text-xs placeholder-slate-500 shadow-xs"
              />
            </div>

            {/* Dropdown de Sugerencias de Mapbox */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-[#192433] border border-cyan-500/40 rounded-2xl shadow-2xl z-40 overflow-hidden divide-y divide-white/5 animate-fade-in max-h-52 overflow-y-auto">
                <div className="p-1.5 bg-cyan-950/40 text-[10px] font-bold text-cyan-400 uppercase tracking-wider px-3">
                  Direcciones encontradas:
                </div>
                {suggestions.map((sug) => (
                  <button
                    key={sug.id}
                    type="button"
                    onClick={() => handleSelectSuggestion(sug)}
                    className="w-full text-left p-2.5 hover:bg-cyan-500/15 flex items-start gap-2.5 transition cursor-pointer"
                  >
                    <MapPin className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-white leading-tight truncate">
                        {sug.streetAddress}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {sug.city ? `${sug.city}, ` : ''}{sug.state} {sug.zipCode}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Indicador de ciudad detectada (solo cuando existe ciudad seleccionada) */}
            {formData.city && (
              <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-emerald-400 font-semibold animate-fade-in">
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                <span>Ubicación: <strong className="text-white font-bold">{formData.city}</strong>{formData.latitude ? ' (GPS activo)' : ''}</span>
              </div>
            )}
          </div>

          {/* Fila Ciudad y Código Postal (Inputs directos sin valores por defecto forzados) */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="min-w-0">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 truncate">
                Ciudad
              </label>
              <input
                type="text"
                placeholder="Ciudad (ej. Goshen)"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value.toUpperCase() })}
                className="w-full h-10 bg-[#16202c] border border-white/10 rounded-xl px-3 text-white uppercase font-bold focus:outline-none focus:border-cyan-400 text-xs shadow-xs"
              />
            </div>

            <div className="min-w-0">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 truncate">
                Código Postal (ZIP)
              </label>
              <input
                type="text"
                placeholder="ej. 46526"
                value={formData.zip_code}
                onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
                className="w-full h-10 bg-[#16202c] border border-white/10 rounded-xl px-3 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-400 shadow-xs"
              />
            </div>
          </div>

          {/* Fila 3: Teléfono del Cliente & Pies de Cable */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="min-w-0">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 truncate">
                Teléfono del Cliente
              </label>
              <div className="relative">
                <Phone className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-3 pointer-events-none" />
                <input
                  type="tel"
                  placeholder="ej. 5741234567"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full h-10 bg-[#16202c] border border-white/10 rounded-xl pl-8 pr-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">
                  Pies (Drop ft)
                </label>
                {footageBonus > 0 && (
                  <span className="text-[9px] font-bold text-emerald-400 font-mono">
                    +${footageBonus}
                  </span>
                )}
              </div>
              <div className="relative">
                <Ruler className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-3 pointer-events-none" />
                <input
                  type="number"
                  step="0.1"
                  placeholder="ej. 120"
                  value={formData.drop_footage}
                  onChange={(e) => setFormData({ ...formData, drop_footage: e.target.value })}
                  className="w-full h-10 bg-[#16202c] border border-white/10 rounded-xl pl-8 pr-2 text-amber-300 font-mono font-bold text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          </div>

          {/* Fila 4: Tipo de Cable & Cruce de Entrada (Driveway Bore) */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="min-w-0">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 truncate">
                Tipo de Cable
              </label>
              <div className="grid grid-cols-2 gap-1 bg-[#16202c] p-1 rounded-xl border border-white/10 h-10 items-center">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, cable_type: 'RG-6' })}
                  className={`h-full rounded-lg font-bold text-xs flex items-center justify-center transition ${
                    formData.cable_type === 'RG-6'
                      ? 'bg-cyan-500 text-slate-950 font-black shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  RG-6
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, cable_type: 'RG-11' })}
                  className={`h-full rounded-lg font-bold text-xs flex items-center justify-center transition ${
                    formData.cable_type === 'RG-11'
                      ? 'bg-cyan-500 text-slate-950 font-black shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  RG-11
                </button>
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">
                  Driveway Bore
                </label>
                {boreBonus > 0 && (
                  <span className="text-[9px] font-bold text-cyan-400 font-mono">
                    +$30 DW
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1 bg-[#16202c] p-1 rounded-xl border border-white/10 h-10 items-center">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, bore_type: 'N' })}
                  className={`h-full rounded-lg font-bold text-xs flex items-center justify-center transition ${
                    formData.bore_type === 'N'
                      ? 'bg-white/15 text-white font-black shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, bore_type: 'DW:1' })}
                  className={`h-full rounded-lg font-bold text-xs flex items-center justify-center transition ${
                    formData.bore_type === 'DW:1'
                      ? 'bg-cyan-500 text-slate-950 font-black shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Sí (DW)
                </button>
              </div>
            </div>
          </div>

          {/* Fila 5: Remarks / Notas - AMPLIO, CÓMODO Y CON ETIQUETAS RÁPIDAS */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                Remarks / Notas del Trabajo
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.call_first}
                  onChange={(e) => setFormData({ ...formData, call_first: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-white/20 bg-[#16202c] text-cyan-500 focus:ring-0"
                />
                <span className="text-cyan-300 font-bold text-xs">
                  Call First
                </span>
              </label>
            </div>

            {/* Chips Rápidos de un toque para no tener que teclear tanto en el carro */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                'Call First',
                'Portón / Gate',
                'Perro / Dog',
                'Zanja / Trench',
                'Traspatio',
                'Cruce difícil'
              ].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleAddRemarkTag(tag)}
                  className="px-2 py-0.5 rounded-lg bg-[#16202c] hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-white/10 text-[10px] font-semibold active:scale-95 transition"
                >
                  + {tag}
                </button>
              ))}
            </div>

            {/* Textarea Cómodo y Amplio para Móvil */}
            <textarea
              rows={3}
              placeholder="Escribe notas adicionales, advertencias, detalles del cliente..."
              value={formData.raw_notes}
              onChange={(e) => setFormData({ ...formData, raw_notes: e.target.value })}
              className="w-full bg-[#16202c] border border-white/10 focus:border-cyan-400 rounded-2xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none min-h-[64px] shadow-xs"
            />
          </div>

          {/* Botones de Acción */}
          <div className="pt-2 flex items-center justify-between gap-2.5 border-t border-white/10 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-[#16202c] hover:bg-white/10 text-slate-300 hover:text-white text-xs font-bold rounded-2xl transition border border-white/5 active:scale-95"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25 active:scale-95 transition cursor-pointer"
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
