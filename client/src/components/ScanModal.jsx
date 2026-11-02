import React, { useState, useRef } from 'react';
import { 
  Camera, Check, AlertCircle, Trash2, Plus, Sparkles, X, Eye, 
  Image as ImageIcon, Calendar, MapPin, Phone, Ruler, Maximize2, 
  HelpCircle, FileText, ArrowRight
} from 'lucide-react';
import { getLocalDateStr } from '../utils/dateUtils';
import { preprocessImageForOcr } from '../services/imageUtils';

export default function ScanModal({ isOpen, onClose, onOrdersSaved, defaultTech }) {
  const [sheetDate, setSheetDate] = useState(() => getLocalDateStr());
  const [techId, setTechId] = useState(defaultTech || 'Javier (P0G1)');
  const [mode, setMode] = useState('photo'); // 'photo' | 'paste'

  // Photo & OCR state
  const [previewUrl, setPreviewUrl] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [extractedOrders, setExtractedOrders] = useState([]);
  const [rawOcrText, setRawOcrText] = useState('');
  const [showRawText, setShowRawText] = useState(false);
  const [showFullPhoto, setShowFullPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [showTextHelp, setShowTextHelp] = useState(false);

  // File input refs
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  // Paste state
  const [pasteText, setPasteText] = useState('');

  if (!isOpen) return null;

  // Rate calculator helper
  const calcOrderRate = (footage, bore) => {
    let rate = 100;
    if (bore && typeof bore === 'string' && bore.includes('DW')) {
      rate += 30;
    }
    const num = parseFloat(footage) || 0;
    if (num > 300) {
      const extraBlocks = Math.floor((num - 300) / 100);
      if (extraBlocks > 0) rate += extraBlocks * 25;
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

    // Reset input value so selecting the same file works again
    e.target.value = '';

    setPreviewUrl(URL.createObjectURL(file));
    setScanning(true);
    setMessage(null);
    setExtractedOrders([]);

    let ocrBlob = null;
    try {
      const preproc = await preprocessImageForOcr(file);
      if (preproc && preproc.blob) {
        ocrBlob = preproc.blob;
      }
    } catch (procErr) {
      console.warn('Preprocessing error (using original):', procErr);
    }

    const formData = new FormData();
    formData.append('sheetPhoto', file);
    formData.append('sheet_photo', file);
    if (ocrBlob) {
      formData.append('ocrPhoto', ocrBlob, 'ocr.png');
    }
    formData.append('sheetDate', sheetDate);
    formData.append('sheet_date', sheetDate);
    formData.append('techId', techId);

    try {
      const res = await fetch('/api/dispatch-sheets/scan', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setExtractedOrders(data.parsedOrders || []);
        setRawOcrText(data.extractedText || '');
        if (!data.parsedOrders || data.parsedOrders.length === 0) {
          setMessage({
            type: 'warning',
            text: 'Foto guardada. No se reconocieron números de orden automáticamente. Puedes completar los datos en el recuadro o pulsar "Agregar Fila".'
          });
          // Auto add a blank row so the user can easily fill in the info
          setExtractedOrders([
            {
              work_date: sheetDate,
              tech_id: techId,
              job_id: '',
              address: '',
              city: 'ELKHART',
              zip_code: '46516',
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
          const detectedDate = (data.parsedOrders && data.parsedOrders[0] && data.parsedOrders[0].work_date) || sheetDate;
          if (detectedDate && detectedDate !== sheetDate) {
            setSheetDate(detectedDate);
          }
          setExtractedOrders(
            (data.parsedOrders || []).map((o) => ({
              ...o,
              work_date: o.work_date || detectedDate,
              rate_calculated: calcOrderRate(o.drop_footage, o.bore_type),
              status: 'Pendiente',
              payment_status: 'Pendiente'
            }))
          );
          setMessage({
            type: 'success',
            text: `¡Foto analizada con éxito! Se detectaron ${data.parsedOrders.length} orden(es). Revisa y ajusta los datos en el recuadro.`
          });
        }
      } else {
        setMessage({ type: 'error', text: data.error || 'Error procesando imagen' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setScanning(false);
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
        city: 'ELKHART',
        zip_code: '46516',
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
    if (extractedOrders.length === 0) return;
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/batch-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: extractedOrders })
      });
      const data = await res.json();
      if (res.ok) {
        const count = data.count || data.imported || extractedOrders.length;
        setMessage({ type: 'success', text: `¡Excelente! Se registraron ${count} órdenes en tu contabilidad.` });
        setTimeout(() => {
          if (onOrdersSaved) onOrdersSaved();
          onClose();
        }, 800);
      } else {
        setMessage({ type: 'error', text: data.error || 'Error al guardar órdenes' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleParsePaste = async () => {
    if (!pasteText.trim()) return;
    setScanning(true);
    try {
      const res = await fetch('/api/parse-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: pasteText, defaultDate: sheetDate, defaultTech: techId })
      });
      const data = await res.json();
      if (res.ok && data.parsed && data.parsed.length > 0) {
        const detectedDate = data.parsed[0]?.work_date || sheetDate;
        if (detectedDate && detectedDate !== sheetDate) {
          setSheetDate(detectedDate);
        }
        setExtractedOrders(
          data.parsed.map(o => ({
            ...o,
            rate_calculated: calcOrderRate(o.drop_footage, o.bore_type)
          }))
        );
        setMessage({ type: 'success', text: `¡${data.parsed.length} orden(es) interpretada(s) del texto correctamente!` });
      } else {
        setMessage({ type: 'warning', text: 'No se reconocieron órdenes válidas en el texto. Revisa el formato o usa el ejemplo.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setScanning(false);
    }
  };

  const handleInsertSampleText = () => {
    const sample = `10-30-2026\tOSDENINY (P0G2)\t748966\t1308 MINTCREST DR,\tGOSHEN\t46526-6282\tP#:5749038080/DROP:71.37/Type:RG-6/BORE:N/TEMP:Y/Obstacles:N/Premise ACS:N/NBR:N
10-30-2026\tOSDENINY (P0G2)\t833906\t21935 KIMBERLY DR,\tGOSHEN\t46526-8755\tP#:5743500180/DROP:200.57/Type:RG-6/BORE:N/TEMP:Y/Obstacles:N/Premise ACS:N/NBR:N
10-30-2026\tOSDENINY (P0G2)\t832399\t15387 WILLIAM PAUL DR,\tBRISTOL\t46507-8829\tCALLFIRST/P#:5743046235/DROP:101.27/Type:RG-11/BORE:DW:1/TEMP:N/Obstacles:LANDSC/Premise ACS:DOG/NBR:N`;
    setPasteText(sample);
  };

  const totalEarnings = extractedOrders.reduce((sum, o) => sum + (parseFloat(o.rate_calculated) || 100), 0);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
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

      {/* Modal Container: Extenso y Espacioso Cockpit */}
      <div 
        className="bg-[#101722] border border-white/10 rounded-3xl max-w-xl sm:max-w-3xl lg:max-w-5xl xl:max-w-6xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl text-white transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Header Cockpit */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-white/10 flex items-center justify-between bg-slate-900/70 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shrink-0 shadow-md shadow-cyan-500/20">
              <Camera className="h-4 w-4 sm:h-5 sm:w-5 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black text-white truncate tracking-wide">
                Escanear Hoja de Despacho
              </h3>
              <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate">
                OCR inteligente de alta precisión y lectura estructurada
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Switch (Foto / Texto) */}
            <div className="flex bg-[#16202c] p-0.5 rounded-xl border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setMode('photo')}
                className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  mode === 'photo' 
                    ? 'bg-cyan-500 text-slate-950 shadow-xs' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Foto</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('paste')}
                className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  mode === 'paste' 
                    ? 'bg-cyan-500 text-slate-950 shadow-xs' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Texto</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer border border-white/5"
              title="Cerrar ventana"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 2. Quick KPI / Info Bar */}
        <div className="grid grid-cols-3 gap-2 px-4 sm:px-6 py-2.5 bg-[#0d141e] border-b border-white/5 shrink-0 text-center">
          <div className="bg-[#16202c] p-2 rounded-xl border border-white/5 flex flex-col justify-center">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
              Fecha Hoja
            </span>
            <input
              type="date"
              value={sheetDate}
              onChange={(e) => {
                const newDate = e.target.value;
                setSheetDate(newDate);
                setExtractedOrders((prev) => prev.map((o) => ({ ...o, work_date: newDate })));
              }}
              className="bg-transparent text-cyan-400 text-xs sm:text-sm font-mono font-black text-center focus:outline-none cursor-pointer w-full [color-scheme:dark]"
            />
          </div>
          <div className="bg-[#16202c] p-2 rounded-xl border border-white/5 flex flex-col justify-center">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
              Modo Activo
            </span>
            <span className="text-xs sm:text-sm font-black text-white uppercase tracking-tight block">
              {mode === 'photo' ? 'Cámara OCR' : 'Texto / Tabla'}
            </span>
          </div>
          <div className="bg-[#16202c] p-2 rounded-xl border border-white/5 flex flex-col justify-center">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
              Detectadas
            </span>
            <span className="text-xs sm:text-sm font-black text-emerald-400 font-mono">
              {extractedOrders.length} {extractedOrders.length === 1 ? 'orden' : 'órdenes'}
            </span>
          </div>
        </div>

        {/* 3. Botones de Captura (Cuando aún no hay foto cargada en modo Foto) */}
        {mode === 'photo' && !previewUrl && (
          <div className="px-4 sm:px-6 py-3 bg-[#0e1622] border-b border-white/5 shrink-0">
            <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
              <button
                type="button"
                onClick={handleOpenCamera}
                className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 hover:from-blue-500 text-white font-black text-xs sm:text-sm shadow-md shadow-cyan-600/20 flex items-center justify-center gap-2 active:scale-95 transition cursor-pointer"
              >
                <Camera className="h-4 w-4 stroke-[2.2]" />
                <span>Abrir Cámara</span>
              </button>

              <button
                type="button"
                onClick={handleOpenGallery}
                className="py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 hover:text-white border border-white/10 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 active:scale-95 transition cursor-pointer shadow-sm"
              >
                <ImageIcon className="h-4 w-4 stroke-[2] text-slate-400" />
                <span>Elegir de Galería</span>
              </button>
            </div>
          </div>
        )}

        {/* 4. Cuerpo Principal con Layout Extenso */}
        <div className="p-3 sm:p-5 overflow-y-auto space-y-3 flex-1 min-h-0 bg-[#101722]">
          
          {/* Mensajes de Estado */}
          {message && (
            <div className={`p-3 rounded-2xl border flex items-start gap-2.5 text-xs animate-in fade-in ${
              message.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : message.type === 'warning'
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
            }`}>
              {message.type === 'success' ? (
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
              )}
              <span className="font-medium">{message.text}</span>
            </div>
          )}

          {/* Spinner de procesamiento OCR */}
          {scanning && (
            <div className="p-3.5 bg-cyan-500/15 border border-cyan-500/30 rounded-2xl flex items-center justify-center gap-3 text-cyan-300 text-xs sm:text-sm">
              <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin shrink-0"></div>
              <span className="font-bold">Analizando hoja con OCR de Google y reconociendo filas...</span>
            </div>
          )}

          {/* MODO FOTO: Visualización Side-by-Side o Extensa */}
          {mode === 'photo' && (
            <div className="space-y-3">
              {/* Barra móvil compacta cuando hay foto en móvil */}
              {previewUrl && (
                <div className="md:hidden bg-[#0e1622] border border-white/10 rounded-2xl p-2.5 flex items-center justify-between gap-2 shadow-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div 
                      onClick={() => setShowFullPhoto(true)}
                      className="w-10 h-10 rounded-xl overflow-hidden border border-white/15 bg-black cursor-pointer shrink-0"
                    >
                      <img src={previewUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-white block truncate">Hoja de Despacho</span>
                      <span className="text-[10px] text-cyan-400 font-mono">Toca imagen para ampliar</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleOpenCamera}
                      className="p-2 bg-[#16202c] hover:bg-[#1e2b3b] border border-white/10 rounded-xl text-cyan-400 active:scale-95 transition"
                      title="Tomar otra con cámara"
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenGallery}
                      className="p-2 bg-[#16202c] hover:bg-[#1e2b3b] border border-white/10 rounded-xl text-slate-300 active:scale-95 transition"
                      title="Elegir de galería"
                    >
                      <ImageIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Layout Desktop 2 Columnas (Imagen a la izquierda, Recuadro de Resultados a la derecha) */}
              <div className={`grid grid-cols-1 ${previewUrl ? 'md:grid-cols-12 gap-4' : ''} min-h-0`}>
                
                {/* Columna Izquierda: Vista Previa de la Hoja en Pantallas Grandes */}
                {previewUrl && (
                  <div className="hidden md:flex md:col-span-5 flex-col gap-2.5 min-h-0">
                    <div className="bg-[#0e1622] border border-white/10 rounded-2xl p-3 flex flex-col flex-1 min-h-0 shadow-lg">
                      <div className="flex items-center justify-between mb-2 shrink-0">
                        <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                          <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Hoja Original</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowFullPhoto(true)}
                          className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-bold cursor-pointer"
                        >
                          <Maximize2 className="w-3 h-3" />
                          <span>Ampliar</span>
                        </button>
                      </div>

                      <div 
                        onClick={() => setShowFullPhoto(true)}
                        className="relative rounded-xl overflow-hidden bg-black/60 border border-white/5 flex-1 min-h-[220px] max-h-[380px] flex items-center justify-center cursor-zoom-in group"
                        title="Toca para ver la foto en pantalla completa"
                      >
                        <img 
                          src={previewUrl} 
                          alt="Hoja de Despacho" 
                          className="w-full h-full object-contain transition group-hover:scale-[1.02]" 
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center pointer-events-none">
                          <span className="text-xs bg-black/80 text-white px-3 py-1.5 rounded-xl border border-white/20 font-bold flex items-center gap-1.5 shadow-lg">
                            <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Pantalla Completa</span>
                          </span>
                        </div>
                      </div>

                      {/* Botones de cambio de foto */}
                      <div className="grid grid-cols-2 gap-2 mt-2.5 shrink-0">
                        <button
                          type="button"
                          onClick={handleOpenCamera}
                          className="py-1.5 px-2 bg-[#16202c] hover:bg-[#1e2b3b] text-slate-300 hover:text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 border border-white/10 cursor-pointer"
                        >
                          <Camera className="h-3.5 w-3.5 text-cyan-400" />
                          <span>Otra Foto</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleOpenGallery}
                          className="py-1.5 px-2 bg-[#16202c] hover:bg-[#1e2b3b] text-slate-300 hover:text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 border border-white/10 cursor-pointer"
                        >
                          <ImageIcon className="h-3.5 w-3.5 text-slate-400" />
                          <span>De Galería</span>
                        </button>
                      </div>

                      {rawOcrText && (
                        <div className="mt-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setShowRawText(!showRawText)}
                            className="text-[10px] text-slate-400 hover:text-cyan-300 flex items-center gap-1 font-medium cursor-pointer"
                          >
                            <Eye className="h-3 w-3" />
                            <span>{showRawText ? 'Ocultar texto OCR' : 'Ver texto OCR crudo'}</span>
                          </button>
                          {showRawText && (
                            <pre className="mt-1.5 p-2 bg-[#080d14] border border-white/10 rounded-xl text-[9px] font-mono text-slate-300 max-h-24 overflow-x-auto">
                              {rawOcrText}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Columna Derecha: EL RECUADRO DE RESULTADOS DEL ESCÁNER */}
                <div className={`flex flex-col min-h-0 ${previewUrl ? 'md:col-span-7' : 'w-full'}`}>
                  {renderResultsBox()}
                </div>
              </div>
            </div>
          )}

          {/* MODO TEXTO: Entrada de texto + Recuadro de Resultados */}
          {mode === 'paste' && (
            <div className="space-y-3">
              {/* Recuadro de ayuda y guía de formato de texto */}
              <div className="bg-[#0e1622] border border-white/10 rounded-2xl p-3.5 space-y-2 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Pegar Datos de Despacho
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowTextHelp(!showTextHelp)}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>{showTextHelp ? 'Ocultar Formatos' : '¿Qué texto poner?'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleInsertSampleText}
                      className="text-[10px] bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-lg font-bold transition cursor-pointer"
                    >
                      Pegar Ejemplo Real
                    </button>
                  </div>
                </div>

                {/* Explicación de formatos aceptados */}
                {showTextHelp && (
                  <div className="p-3 bg-[#080d14] border border-cyan-500/20 rounded-xl text-[11px] text-slate-300 space-y-2 leading-relaxed animate-fade-in">
                    <p className="font-bold text-white">Puedes pegar cualquier combinación de estos 3 formatos:</p>
                    <ul className="space-y-1.5 list-disc list-inside text-slate-400">
                      <li>
                        <strong className="text-cyan-300">Copia directa de Excel o Portal:</strong> Selecciona las filas de la tabla de despacho con tabuladores y pégalas aquí. Reconoce la fecha, número de Job, dirección, ciudad, ZIP, metraje DROP, cable y perforación automáticamente.
                      </li>
                      <li>
                        <strong className="text-cyan-300">Mensajes de WhatsApp o Notas rápidas:</strong> Ejemplo:<br />
                        <code className="text-[10px] text-amber-300 bg-black/40 px-1 py-0.5 rounded">748966 1308 MINTCREST DR, GOSHEN DROP:71.37 Type:RG-6</code>
                      </li>
                      <li>
                        <strong className="text-cyan-300">Básico (Mínimo):</strong> Basta con el número de Job (6 dígitos) y la dirección: <br />
                        <code className="text-[10px] text-amber-300 bg-black/40 px-1 py-0.5 rounded">833906 21935 KIMBERLY DR GOSHEN</code>
                      </li>
                    </ul>
                  </div>
                )}

                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={4}
                  placeholder="Pega aquí las filas de despacho (de Excel, WhatsApp o el portal)..."
                  className="w-full bg-[#080d14] border border-white/10 rounded-xl p-3 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 shadow-inner resize-y min-h-[90px]"
                />

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handleParsePaste}
                    disabled={scanning || !pasteText.trim()}
                    className="py-2 px-5 bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 hover:from-blue-500 text-white font-black text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Interpretar y Cargar al Recuadro</span>
                  </button>
                </div>
              </div>

              {/* El Recuadro de Resultados */}
              {renderResultsBox()}
            </div>
          )}
        </div>

        {/* 5. Footer Cockpit */}
        <div className="px-4 sm:px-6 py-3 border-t border-white/10 bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white text-xs font-bold transition active:scale-95 cursor-pointer border border-white/10 shadow-sm"
          >
            Cancelar
          </button>

          {extractedOrders.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-xs font-mono text-slate-400">
                Total a Registrar: <strong className="text-emerald-400 font-bold">${totalEarnings}</strong>
              </span>
              <button
                type="button"
                onClick={handleSaveOrders}
                disabled={saving}
                className="px-5 py-2.5 bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 hover:from-blue-500 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-cyan-600/25 ring-2 ring-cyan-400/30 transition active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Check className="h-4 w-4 stroke-[3]" />
                <span>{saving ? 'Guardando...' : `Confirmar e Importar (${extractedOrders.length})`}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal Pantalla Completa para la Hoja */}
      {showFullPhoto && previewUrl && (
        <div 
          className="fixed inset-0 z-[60] bg-black/95 flex flex-col items-center justify-center p-3 animate-fade-in"
          onClick={() => setShowFullPhoto(false)}
        >
          <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
            <button
              type="button"
              onClick={() => setShowFullPhoto(false)}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 flex items-center gap-1.5 shadow-lg"
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
        <div className="bg-[#0e1622] border border-dashed border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Camera className="w-6 h-6 stroke-[1.5]" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Recuadro de Órdenes Vacío</h4>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              {mode === 'photo'
                ? 'Toma o sube una foto de tu hoja de despacho para que el OCR detecte automáticamente todas las órdenes.'
                : 'Pega las líneas de despacho o usa el botón "Pegar Ejemplo Real" para ver las órdenes aquí.'}
            </p>
          </div>
          <button
            type="button"
            onClick={addBlankOrder}
            className="px-3.5 py-1.5 bg-[#16202c] hover:bg-[#1e2b3b] border border-white/10 rounded-xl text-cyan-400 hover:text-white text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Agregar Orden Manualmente</span>
          </button>
        </div>
      );
    }

    return (
      <div className="bg-[#0e1622] border border-cyan-500/30 rounded-2xl p-3 sm:p-4 flex flex-col flex-1 min-h-0 shadow-xl shadow-cyan-950/20">
        {/* Cabecera del Recuadro de Resultados */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <h4 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
              Órdenes Reconocidas ({extractedOrders.length})
            </h4>
            {totalEarnings > 0 && (
              <span className="text-[11px] font-black font-mono px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                ${totalEarnings} Total
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={addBlankOrder}
            className="text-[11px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 px-2.5 py-1 rounded-xl transition cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Agregar Fila</span>
          </button>
        </div>

        {/* Lista de Filas en el Recuadro */}
        <div className="overflow-y-auto space-y-2.5 py-3 flex-1 min-h-0 pr-1">
          {extractedOrders.map((o, idx) => (
            <div
              key={idx}
              className="bg-[#141d28] border border-white/10 hover:border-cyan-500/40 rounded-2xl p-2.5 sm:p-3 space-y-2 transition shadow-xs group"
            >
              {/* Fila 1: Número, Job ID y Tarifa */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-cyan-500/20 text-cyan-300 text-[10px] font-mono font-bold flex items-center justify-center shrink-0 border border-cyan-500/30">
                    {idx + 1}
                  </span>
                  <div className="flex items-center gap-1 bg-[#0b1017] px-2.5 py-1 rounded-lg border border-white/10">
                    <span className="text-[10px] text-slate-500 font-mono font-bold">#</span>
                    <input
                      type="text"
                      placeholder="Job ID"
                      value={o.job_id}
                      onChange={(e) => updateOrderField(idx, 'job_id', e.target.value)}
                      className="bg-transparent text-xs font-mono text-cyan-300 font-black w-24 sm:w-28 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 font-mono font-black text-emerald-400 text-xs">
                    <span>$</span>
                    <span>{o.rate_calculated || 100}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeOrder(idx)}
                    className="w-7 h-7 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 flex items-center justify-center transition border border-white/5 cursor-pointer"
                    title="Eliminar fila"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Fila 2: Dirección y Ciudad */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-1.5">
                <div className="sm:col-span-8 relative">
                  <MapPin className="w-3 h-3 text-slate-500 absolute left-2.5 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Dirección completa"
                    value={o.address}
                    onChange={(e) => updateOrderField(idx, 'address', e.target.value)}
                    className="w-full bg-[#0b1017] border border-white/10 rounded-lg pl-7 pr-2.5 py-1 text-xs text-white placeholder-slate-500 font-semibold focus:outline-none focus:border-cyan-500 transition"
                  />
                </div>
                <div className="sm:col-span-4">
                  <input
                    type="text"
                    placeholder="Ciudad"
                    value={o.city}
                    onChange={(e) => updateOrderField(idx, 'city', e.target.value)}
                    className="w-full bg-[#0b1017] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white uppercase placeholder-slate-500 font-bold focus:outline-none focus:border-cyan-500 transition"
                  />
                </div>
              </div>

              {/* Fila 3: Metraje, Cable, Bore y Notas */}
              <div className="flex flex-wrap items-center gap-2 text-[10px]">
                {/* Metraje Drop */}
                <div className="flex items-center gap-1 bg-[#0b1017] border border-white/10 rounded-lg px-2 py-0.5">
                  <Ruler className="w-3 h-3 text-amber-400 shrink-0" />
                  <input
                    type="number"
                    step="0.1"
                    value={o.drop_footage}
                    onChange={(e) => updateOrderField(idx, 'drop_footage', e.target.value)}
                    className="w-14 bg-transparent text-amber-300 font-mono font-bold focus:outline-none text-[11px]"
                  />
                  <span className="text-slate-500 font-mono">ft</span>
                  {o.drop_footage > 300 && (
                    <span className="text-[9px] text-emerald-400 font-bold font-mono">
                      (+$${Math.floor((o.drop_footage - 300) / 100) * 25})
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
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
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
                  className="bg-[#0b1017] border border-white/10 rounded-lg px-2 py-0.5 text-[10px] text-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value="N">Sin Bore ($0)</option>
                  <option value="DW:1">Driveway (+$30)</option>
                  <option value="SW:1">Sidewalk ($0)</option>
                </select>

                {/* Notas / Teléfono */}
                {(o.phone || (o.raw_notes && o.raw_notes !== o.address)) && (
                  <span className="text-[10px] text-slate-400 truncate max-w-[140px] sm:max-w-[200px] font-mono bg-[#0b1017] px-2 py-0.5 rounded-lg border border-white/5">
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
