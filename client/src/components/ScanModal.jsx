import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera, Check, AlertCircle, Trash2, Plus, X, Eye,
  Image as ImageIcon, MapPin, Ruler, Maximize2
} from 'lucide-react';
import { getLocalDateStr, normalizeDateStr } from '../utils/dateUtils';
import { interactWithAuraCore } from '../services/auraService';

export default function ScanModal({ isOpen, onClose, onOrdersSaved, defaultTech }) {
  const [sheetDate, setSheetDate] = useState(() => getLocalDateStr());
  const [techId, setTechId] = useState(defaultTech || 'Javier (P0G1)');
  const [rateConfig, setRateConfig] = useState({
    base_rate: 100,
    bore_dw_bonus: 30,
    footage_base: 300,
    footage_extra_rate: 25
  });

  // Photo & AuraCore IA state
  const [previewUrl, setPreviewUrl] = useState(null);
  const previewUrlRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [extractedOrders, setExtractedOrders] = useState([]);
  const [rawAiText, setRawAiText] = useState('');
  const [showRawText, setShowRawText] = useState(false);
  const [showFullPhoto, setShowFullPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // File input refs
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const replacePreviewUrl = useCallback((nextUrl) => {
    if (previewUrlRef.current && previewUrlRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
  }, []);

  const resetScanState = useCallback(() => {
    replacePreviewUrl(null);
    setScanning(false);
    setSaving(false);
    setExtractedOrders([]);
    setRawAiText('');
    setShowRawText(false);
    setShowFullPhoto(false);
    setMessage(null);
    setSheetDate(getLocalDateStr());
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  }, [replacePreviewUrl]);

  useEffect(() => {
    if (isOpen) {
      setTechId(defaultTech || 'Javier (P0G1)');
      fetch('/api/settings')
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => {
          if (s) {
            setRateConfig({
              base_rate: parseFloat(s.base_rate) || 100,
              bore_dw_bonus: parseFloat(s.bore_dw_bonus) || 30,
              footage_base: parseFloat(s.footage_base) || 300,
              footage_extra_rate: parseFloat(s.footage_extra_rate) || 25
            });
          }
        })
        .catch(() => {});
    } else {
      resetScanState();
    }
  }, [isOpen, defaultTech, resetScanState]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current && previewUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  // Rate calculator helper (synced with Ajustes)
  const calcOrderRate = (footage, bore) => {
    let rate = rateConfig.base_rate;
    if (bore && typeof bore === 'string' && /DW/i.test(bore)) {
      rate += rateConfig.bore_dw_bonus;
    }
    const num = parseFloat(footage) || 0;
    if (num > rateConfig.footage_base) {
      const extraBlocks = Math.floor((num - rateConfig.footage_base) / 100);
      if (extraBlocks > 0) rate += extraBlocks * rateConfig.footage_extra_rate;
    }
    return rate;
  };

  const handleOpenCamera = () => {
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
      cameraInputRef.current.click();
    }
  };

  const handleOpenGallery = () => {
    if (galleryInputRef.current) {
      galleryInputRef.current.value = '';
      galleryInputRef.current.click();
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    e.target.value = '';

    replacePreviewUrl(URL.createObjectURL(file));
    setScanning(true);
    setMessage(null);
    setExtractedOrders([]);
    setRawAiText('');
    setShowRawText(false);

    let ordersFound = [];
    let extractedText = '';
    let auraModel = '';
    let aiErrorMsg = '';
    let aiNote = '';
    let aiNeedsConfirmation = false;

    // Lectura directa 100% por IA multimodal (AuraCore -> Gemini Vision)
    try {
      const auraRes = await interactWithAuraCore({
        imageFile: file,
        text: 'Lee esta foto de hoja de despacho o lista de trabajos Xfinity y extrae TODAS las filas en el arreglo orders.',
        defaultTech: techId,
        defaultDate: sheetDate
      });
      ordersFound = auraRes?.data?.orders || [];
      extractedText = auraRes?.data?.transcript || auraRes?.data?.replyText || '';
      auraModel = auraRes?.modelUsed || 'Gemini';
      aiNote = auraRes?.data?.ambiguityNote || '';
      aiNeedsConfirmation = Boolean(auraRes?.data?.needsConfirmation);
    } catch (auraErr) {
      aiErrorMsg = auraErr.message || 'No se pudo conectar con AuraCore IA.';
    }

    setScanning(false);

    if (aiErrorMsg) {
      setMessage({
        type: 'error',
        text: `Error de AuraCore IA: ${aiErrorMsg} Revisa la URL del servidor en Ajustes (⚙️).`
      });
      return;
    }

    if (!ordersFound || ordersFound.length === 0) {
      setRawAiText(extractedText);
      setMessage({
        type: 'warning',
        text: 'AuraCore IA analizó la foto pero no encontró órdenes válidas. Intenta con una foto más clara o usa "Agregar Fila".'
      });
      setExtractedOrders([
        {
          work_date: sheetDate,
          tech_id: techId,
          job_id: '',
          address: '',
          city: '',
          zip_code: '',
          phone: '',
          drop_footage: 100,
          cable_type: 'RG-6',
          bore_type: 'N',
          obstacles: 'N',
          rate_calculated: 100,
          status: 'Pendiente',
          payment_status: 'Pendiente',
          raw_notes: ''
        }
      ]);
    } else {
      const detectedDate = normalizeDateStr(ordersFound[0]?.work_date || sheetDate) || getLocalDateStr();
      if (detectedDate && detectedDate !== sheetDate) {
        setSheetDate(detectedDate);
      }
      setRawAiText(extractedText);
      setExtractedOrders(
        ordersFound.map((o) => ({
          ...o,
          work_date: normalizeDateStr(o.work_date || detectedDate) || detectedDate,
          tech_id: String(o.tech_id || techId || 'Javier (P0G1)').trim(),
          job_id: String(o.job_id || '').trim(),
          address: String(o.address || '').trim(),
          city: String(o.city || '').trim(),
          zip_code: String(o.zip_code || '').trim(),
          phone: String(o.phone || '').trim(),
          drop_footage: parseFloat(o.drop_footage) || 0,
          cable_type: o.cable_type === 'RG-11' ? 'RG-11' : 'RG-6',
          bore_type: o.bore_type || 'N',
          obstacles: o.obstacles || 'N',
          rate_calculated: calcOrderRate(o.drop_footage, o.bore_type),
          status: 'Pendiente',
          payment_status: 'Pendiente',
          raw_notes: o.raw_notes || ''
        }))
      );
      setMessage({
        type: aiNeedsConfirmation ? 'warning' : 'success',
        text: `¡Foto analizada con AuraCore IA (${auraModel})! Se detectaron ${ordersFound.length} orden(es).${aiNote ? ' Revisar: ' + aiNote : ' Revisa y confirma abajo.'}`
      });
    }
  };

  const updateOrderField = (index, field, value) => {
    setExtractedOrders((prev) => {
      const next = [...prev];
      const updated = { ...next[index], [field]: value };
      if (field === 'drop_footage' || field === 'bore_type') {
        updated.rate_calculated = calcOrderRate(
          field === 'drop_footage' ? value : updated.drop_footage,
          field === 'bore_type' ? value : updated.bore_type
        );
      }
      next[index] = updated;
      return next;
    });
  };

  const removeOrder = (index) => {
    setExtractedOrders((prev) => prev.filter((_, i) => i !== index));
  };

  const addBlankOrder = () => {
    setExtractedOrders((prev) => [
      ...prev,
      {
        work_date: sheetDate,
        tech_id: techId,
        job_id: '',
        address: '',
        city: '',
        zip_code: '',
        phone: '',
        drop_footage: 100,
        cable_type: 'RG-6',
        bore_type: 'N',
        obstacles: 'N',
        rate_calculated: 100,
        status: 'Pendiente',
        payment_status: 'Pendiente',
        raw_notes: ''
      }
    ]);
  };

  const handleSaveOrders = async () => {
    if (extractedOrders.length === 0 || saving) return;
    setSaving(true);
    setMessage(null);

    try {
      const ordersToSave = extractedOrders.map((o) => ({
        ...o,
        work_date: normalizeDateStr(o.work_date || sheetDate) || sheetDate,
        tech_id: String(o.tech_id || techId || defaultTech || 'Javier (P0G1)').trim(),
        job_id: String(o.job_id || '').trim(),
        drop_footage: parseFloat(o.drop_footage) || 0,
        rate_calculated: calcOrderRate(o.drop_footage, o.bore_type),
        status: 'Pendiente',
        payment_status: 'Pendiente'
      }));

      const res = await fetch('/api/batch-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: ordersToSave })
      });
      const data = await res.json();
      const savedCount = (data.imported || 0) + (data.updated || 0);

      if (res.ok && savedCount > 0) {
        const targetDate = normalizeDateStr(ordersToSave[0]?.work_date || sheetDate) || sheetDate;
        if (onOrdersSaved) {
          await onOrdersSaved(targetDate);
        }
        resetScanState();
        onClose();
        return;
      }

      const errorDetail = data.error || (Array.isArray(data.errors) && data.errors.length > 0 ? data.errors.join(', ') : null);
      setMessage({ type: 'error', text: errorDetail || 'No se pudieron guardar las órdenes en tu lista.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const totalEarnings = extractedOrders.reduce((sum, o) => sum + (parseFloat(o.rate_calculated) || 100), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in modal-overlay-safe"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px) + 16px, 1.25rem)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 1.25rem)'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      {/* Hidden inputs para Camara y Galería DIRECTAS */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,.jpg,.jpeg,.png,.webp,.heic"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Modal Container: Tamaño Estándar idéntico a EditJobModal y PhotoModal */}
      <div
        className="bg-[#101722] border border-white/10 rounded-3xl max-w-sm sm:max-w-md w-full max-h-[78dvh] sm:max-h-[82dvh] modal-sheet-compact flex flex-col overflow-hidden shadow-2xl text-white transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Header Cockpit */}
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-white dark:bg-slate-900/70 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shrink-0 shadow-md shadow-cyan-500/20">
              <Camera className="h-4 w-4 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate tracking-wide">
                Escanear Hoja
              </h3>
              <p className="text-[10px] text-slate-600 dark:text-slate-400 font-mono font-semibold truncate">
                Lectura de Foto con IA
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer border border-white/5 disabled:opacity-50"
            title="Cerrar ventana"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 2. Quick KPI / Info Bar */}
        <div className="grid grid-cols-3 gap-2 px-4 py-2.5 bg-[#0d141e] border-b border-white/5 shrink-0 text-center">
          <div className="bg-[#16202c] py-1.5 px-1 rounded-xl border border-white/5 flex flex-col justify-center">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
              Fecha Hoja
            </span>
            <input
              type="date"
              value={sheetDate}
              onChange={(e) => {
                const newDate = normalizeDateStr(e.target.value);
                setSheetDate(newDate);
                setExtractedOrders((prev) => prev.map((o) => ({ ...o, work_date: newDate })));
              }}
              className="bg-transparent text-cyan-400 text-xs font-mono font-black text-center focus:outline-none cursor-pointer w-full dark:[color-scheme:dark] [color-scheme:light]"
            />
          </div>
          <div className="bg-[#16202c] py-1.5 px-1 rounded-xl border border-white/5 flex flex-col justify-center">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
              Escáner
            </span>
            <span className="text-xs font-black text-white uppercase tracking-tight block">
              AuraCore IA
            </span>
          </div>
          <div className="bg-[#16202c] py-1.5 px-1 rounded-xl border border-white/5 flex flex-col justify-center">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
              Detectadas
            </span>
            <span className="text-xs font-black text-emerald-400 font-mono">
              {extractedOrders.length} {extractedOrders.length === 1 ? 'orden' : 'órdenes'}
            </span>
          </div>
        </div>

        {/* 3. Botones de Captura (Cuando aún no hay foto cargada) */}
        {!previewUrl && (
          <div className="px-4 py-2.5 bg-[#0e1622] border-b border-white/5 shrink-0">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleOpenCamera}
                className="py-2 px-3 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 hover:from-blue-500 text-white font-black text-xs shadow-md shadow-cyan-600/20 flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer"
              >
                <Camera className="h-3.5 w-3.5 stroke-[2.2]" />
                <span>Abrir Cámara</span>
              </button>

              <button
                type="button"
                onClick={handleOpenGallery}
                className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 hover:text-white border border-white/10 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer shadow-sm"
              >
                <ImageIcon className="h-3.5 w-3.5 stroke-[2] text-slate-400" />
                <span>Elegir de Galería</span>
              </button>
            </div>
          </div>
        )}

        {/* 4. Cuerpo Scrollable Vertical */}
        <div className="p-3.5 sm:p-4 overflow-y-auto space-y-3 flex-1 min-h-0 scrollbar-none bg-[#101722]">
          {/* Mensajes de Estado */}
          {message && (
            <div className={`p-2.5 rounded-xl border flex items-start gap-2 text-xs animate-in fade-in ${
              message.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : message.type === 'warning'
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
            }`}>
              {message.type === 'success' ? (
                <Check className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-400" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" />
              )}
              <span className="font-medium">{message.text}</span>
            </div>
          )}

          {/* Spinner de procesamiento AuraCore IA */}
          {scanning && (
            <div className="p-3 bg-cyan-500/15 border border-cyan-500/30 rounded-xl flex items-center justify-center gap-2.5 text-cyan-300 text-xs">
              <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin shrink-0"></div>
              <span className="font-bold">Analizando foto con AuraCore IA...</span>
            </div>
          )}

          <div className="space-y-3">
            {/* Tarjeta compacta de foto cargada */}
            {previewUrl && (
              <div className="bg-[#0e1622] border border-white/10 rounded-2xl p-2.5 space-y-2 shrink-0 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      onClick={() => setShowFullPhoto(true)}
                      className="w-11 h-11 rounded-xl overflow-hidden border border-white/15 bg-black cursor-pointer shrink-0 relative group"
                      title="Toca para ampliar imagen"
                    >
                      <img src={previewUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                        <Maximize2 className="w-3.5 h-3.5 text-white" />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-white block truncate">Hoja de Despacho</span>
                      <span className="text-[10px] text-cyan-400 font-mono">
                        {extractedOrders.length} {extractedOrders.length === 1 ? 'orden detectada' : 'órdenes detectadas'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowFullPhoto(true)}
                    className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] text-cyan-300 flex items-center gap-1 font-bold transition"
                  >
                    <Eye className="w-3 h-3" />
                    <span>Ver Hoja</span>
                  </button>
                </div>

                {/* Botones rápidos para cambiar de foto */}
                <div className="grid grid-cols-2 gap-1.5 pt-0.5 border-t border-white/5">
                  <button
                    type="button"
                    onClick={handleOpenCamera}
                    className="py-1 px-2 bg-[#16202c] hover:bg-[#1e2b3b] text-slate-300 hover:text-white text-[11px] font-bold rounded-lg flex items-center justify-center gap-1 transition active:scale-95 border border-white/5 cursor-pointer"
                  >
                    <Camera className="h-3 w-3 text-cyan-400" />
                    <span>Otra Foto</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenGallery}
                    className="py-1 px-2 bg-[#16202c] hover:bg-[#1e2b3b] text-slate-300 hover:text-white text-[11px] font-bold rounded-lg flex items-center justify-center gap-1 transition active:scale-95 border border-white/5 cursor-pointer"
                  >
                    <ImageIcon className="h-3 w-3 text-slate-400" />
                    <span>De Galería</span>
                  </button>
                </div>

                {rawAiText && (
                  <div className="pt-0.5">
                    <button
                      type="button"
                      onClick={() => setShowRawText(!showRawText)}
                      className="text-[10px] text-slate-400 hover:text-cyan-300 flex items-center gap-1 font-medium cursor-pointer"
                    >
                      <Eye className="h-3 w-3" />
                      <span>{showRawText ? 'Ocultar lectura de IA' : 'Ver lectura de AuraCore IA'}</span>
                    </button>
                    {showRawText && (
                      <pre className="mt-1 p-2 bg-[#080d14] border border-white/10 rounded-xl text-[9px] font-mono text-slate-300 max-h-20 overflow-x-auto whitespace-pre-wrap">
                        {rawAiText}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* RECUADRO DE RESULTADOS */}
            {renderResultsBox()}
          </div>
        </div>

        {/* 5. Footer Cockpit */}
        <div className="px-4 py-3 border-t border-white/10 bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white text-xs font-bold transition active:scale-95 cursor-pointer border border-white/10 shadow-sm disabled:opacity-50"
          >
            Cancelar
          </button>

          {extractedOrders.length > 0 && (
            <button
              type="button"
              onClick={handleSaveOrders}
              disabled={saving}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 hover:from-blue-500 text-white font-black text-xs rounded-xl shadow-lg shadow-cyan-600/25 ring-2 ring-cyan-400/30 transition active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Check className="h-4 w-4 stroke-[3]" />
              <span>{saving ? 'Guardando...' : `Confirmar (${extractedOrders.length}) - $${totalEarnings}`}</span>
            </button>
          )}
        </div>
      </div>

      {/* Modal Pantalla Completa para la Hoja de Despacho */}
      {showFullPhoto && previewUrl && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 flex flex-col items-center justify-center p-3 animate-fade-in"
          onClick={() => setShowFullPhoto(false)}
        >
          <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
            <button
              type="button"
              onClick={() => setShowFullPhoto(false)}
              className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 flex items-center gap-1.5 shadow-lg"
            >
              <X className="w-4 h-4" />
              <span>Cerrar</span>
            </button>
          </div>
          <img
            src={previewUrl}
            alt="Hoja Completa"
            className="max-w-full max-h-[88vh] object-contain rounded-xl border border-white/10 shadow-2xl"
          />
        </div>
      )}
    </div>
  );

  // Renderizador del Recuadro de Resultados
  function renderResultsBox() {
    if (extractedOrders.length === 0) {
      return (
        <div className="bg-[#0e1622] border border-dashed border-white/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-2.5">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Camera className="w-5 h-5 stroke-[1.5]" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">Recuadro de Órdenes Vacío</h4>
            <p className="text-[11px] text-slate-400 max-w-xs mt-0.5 leading-snug">
              Toma o sube una foto de tu hoja de despacho o lista de trabajos para que AuraCore IA la lea automáticamente.
            </p>
          </div>
          <button
            type="button"
            onClick={addBlankOrder}
            className="px-3 py-1.5 bg-[#16202c] hover:bg-[#1e2b3b] border border-white/10 rounded-xl text-cyan-400 hover:text-white text-[11px] font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Agregar Orden Manualmente</span>
          </button>
        </div>
      );
    }

    return (
      <div className="bg-[#0e1622] border border-cyan-500/30 rounded-2xl p-3 flex flex-col flex-1 min-h-0 shadow-lg shadow-cyan-950/20">
        {/* Cabecera del Recuadro de Resultados */}
        <div className="flex items-center justify-between pb-2.5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <h4 className="text-xs font-black text-white uppercase tracking-wider">
              Órdenes Reconocidas ({extractedOrders.length})
            </h4>
            {totalEarnings > 0 && (
              <span className="text-[10px] font-black font-mono px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                ${totalEarnings}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={addBlankOrder}
            className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 px-2 py-0.5 rounded-lg transition cursor-pointer"
          >
            <Plus className="h-3 w-3" />
            <span>Agregar Fila</span>
          </button>
        </div>

        {/* Lista de Filas en el Recuadro */}
        <div className="space-y-2 py-2 flex-1 min-h-0">
          {extractedOrders.map((o, idx) => (
            <div
              key={idx}
              className="bg-[#141d28] border border-white/10 hover:border-cyan-500/40 rounded-xl p-2.5 space-y-1.5 transition shadow-xs"
            >
              {/* Fila 1: Número, Job ID y Tarifa */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-md bg-cyan-500/20 text-cyan-300 text-[10px] font-mono font-bold flex items-center justify-center shrink-0 border border-cyan-500/30">
                    {idx + 1}
                  </span>
                  <div className="flex items-center gap-1 bg-[#0b1017] px-2 py-0.5 rounded-lg border border-white/10">
                    <span className="text-[10px] text-slate-500 font-mono font-bold">#</span>
                    <input
                      type="text"
                      placeholder="Job ID"
                      value={o.job_id}
                      onChange={(e) => updateOrderField(idx, 'job_id', e.target.value)}
                      className="bg-transparent text-xs font-mono text-cyan-300 font-black w-24 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-0.5 px-2 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 font-mono font-black text-emerald-400 text-xs">
                    <span>$</span>
                    <span>{o.rate_calculated || 100}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeOrder(idx)}
                    className="w-6 h-6 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 flex items-center justify-center transition border border-white/5 cursor-pointer"
                    title="Eliminar fila"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Fila 2: Dirección */}
              <div className="relative">
                <MapPin className="w-3 h-3 text-slate-500 absolute left-2 top-2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Dirección completa"
                  value={o.address}
                  onChange={(e) => updateOrderField(idx, 'address', e.target.value)}
                  className="w-full bg-[#0b1017] border border-white/10 rounded-lg pl-6 pr-2 py-1 text-xs text-white placeholder-slate-500 font-semibold focus:outline-none focus:border-cyan-500 transition"
                />
              </div>

              {/* Fila 3: Ciudad */}
              <div>
                <input
                  type="text"
                  placeholder="Ciudad (ej. GOSHEN)"
                  value={o.city}
                  onChange={(e) => updateOrderField(idx, 'city', e.target.value)}
                  className="w-full bg-[#0b1017] border border-white/10 rounded-lg px-2 py-0.5 text-[11px] text-white uppercase placeholder-slate-500 font-bold focus:outline-none focus:border-cyan-500 transition"
                />
              </div>

              {/* Fila 4: Metraje, Cable, Bore y Notas */}
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] pt-0.5">
                {/* Metraje Drop */}
                <div className="flex items-center gap-1 bg-[#0b1017] border border-white/10 rounded-lg px-1.5 py-0.5">
                  <Ruler className="w-3 h-3 text-amber-400 shrink-0" />
                  <input
                    type="number"
                    step="0.1"
                    value={o.drop_footage}
                    onChange={(e) => updateOrderField(idx, 'drop_footage', e.target.value)}
                    className="w-12 bg-transparent text-amber-300 font-mono font-bold focus:outline-none text-[10.5px]"
                  />
                  <span className="text-slate-500 font-mono">ft</span>
                  {o.drop_footage > rateConfig.footage_base && (
                    <span className="text-[9px] text-emerald-400 font-bold font-mono">
                      (+${Math.floor((o.drop_footage - rateConfig.footage_base) / 100) * rateConfig.footage_extra_rate})
                    </span>
                  )}
                </div>

                {/* Cable Selector */}
                <div className="flex bg-[#0b1017] p-0.5 rounded-lg border border-white/10">
                  {['RG-6', 'RG-11'].map((cab) => (
                    <button
                      key={cab}
                      type="button"
                      onClick={() => updateOrderField(idx, 'cable_type', cab)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                        o.cable_type === cab
                          ? 'bg-cyan-500 text-slate-950 font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {cab}
                    </button>
                  ))}
                </div>

                {/* Bore Selector */}
                <select
                  value={o.bore_type || 'N'}
                  onChange={(e) => updateOrderField(idx, 'bore_type', e.target.value)}
                  className="bg-[#0b1017] border border-white/10 rounded-lg px-1.5 py-0.5 text-[10px] text-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value="N">Sin Bore ($0)</option>
                  <option value="DW:1">Driveway (+${rateConfig.bore_dw_bonus})</option>
                  <option value="SW:1">Sidewalk ($0)</option>
                </select>

                {/* Notas / Teléfono */}
                {(o.phone || (o.raw_notes && o.raw_notes !== o.address)) && (
                  <span className="text-[9.5px] text-slate-400 truncate max-w-[120px] font-mono bg-[#0b1017] px-1.5 py-0.5 rounded-lg border border-white/5">
                    {o.phone ? `P#:${o.phone}` : o.raw_notes}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
}
