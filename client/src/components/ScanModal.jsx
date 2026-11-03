import React, { useState, useRef } from 'react';
import { 
  Camera, Check, AlertCircle, Trash2, Plus, Sparkles, X, Eye, 
  Image as ImageIcon, Calendar, MapPin, Phone, Ruler, Maximize2, 
  HelpCircle, FileText
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

    // Reset input value so re-selecting the same file works smoothly
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
            text: `¡Foto analizada! Se detectaron ${data.parsedOrders.length} orden(es). Revisa y ajusta los datos en el recuadro abajo.`
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
        setMessage({ type: 'success', text: `¡Excelente! Se guardaron ${count} órdenes en tu contabilidad.` });
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
      const list = data.parsed || data.parsedOrders || [];
      if (res.ok && list.length > 0) {
        const detectedDate = list[0]?.work_date || sheetDate;
        if (detectedDate && detectedDate !== sheetDate) {
          setSheetDate(detectedDate);
        }
        setExtractedOrders(
          list.map(o => ({
            ...o,
            rate_calculated: calcOrderRate(o.drop_footage, o.bore_type)
          }))
        );
        setMessage({ type: 'success', text: `¡${list.length} orden(es) interpretada(s) del texto correctamente!` });
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in modal-overlay-safe"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px) + 16px, 1.25rem)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 1.25rem)'
      }}
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
              <h3 className="text-sm font-black text-slate-900 dark:text-white truncate tracking-wide">
                Escanear Hoja de Despacho
              </h3>
              <p className="text-[10.5px] text-slate-600 dark:text-slate-400 font-mono font-semibold truncate">
                OCR automático y lectura de órdenes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Switch (Foto / Texto) */}
            <div className="flex bg-[#16202c] p-0.5 rounded-lg border border-white/10 text-[10px]">
              <button
                type="button"
                onClick={() => setMode('photo')}
                className={`px-2 py-0.5 rounded font-bold transition cursor-pointer flex items-center gap-1 ${
                  mode === 'photo' 
                    ? 'bg-cyan-500 text-slate-950 shadow-xs' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Camera className="w-3 h-3" />
                <span>Foto</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('paste')}
                className={`px-2 py-0.5 rounded font-bold transition cursor-pointer flex items-center gap-1 ${
                  mode === 'paste' 
                    ? 'bg-cyan-500 text-slate-950 shadow-xs' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileText className="w-3 h-3" />
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
        <div className="grid grid-cols-3 gap-2 px-4 py-2.5 bg-[#0d141e] border-b border-white/5 shrink-0 text-center">
          <div className="bg-[#16202c] py-1.5 px-1 rounded-xl border border-white/5 flex flex-col justify-center">
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
              className="bg-transparent text-cyan-400 text-xs font-mono font-black text-center focus:outline-none cursor-pointer w-full dark:[color-scheme:dark] [color-scheme:light]"
            />
          </div>
          <div className="bg-[#16202c] py-1.5 px-1 rounded-xl border border-white/5 flex flex-col justify-center">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
              Modo Activo
            </span>
            <span className="text-xs font-black text-white uppercase tracking-tight block">
              {mode === 'photo' ? 'Cámara OCR' : 'Texto / Tabla'}
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

        {/* 3. Botones de Captura (Cuando aún no hay foto cargada en modo Foto) */}
        {mode === 'photo' && !previewUrl && (
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

        {/* 4. Cuerpo Scrollable Vertical (Aprovecha la altura del modal) */}
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

          {/* Spinner de procesamiento OCR */}
          {scanning && (
            <div className="p-3 bg-cyan-500/15 border border-cyan-500/30 rounded-xl flex items-center justify-center gap-2.5 text-cyan-300 text-xs">
              <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin shrink-0"></div>
              <span className="font-bold">Analizando hoja con OCR y reconociendo órdenes...</span>
            </div>
          )}

          {/* MODO FOTO */}
          {mode === 'photo' && (
            <div className="space-y-3">
              {/* Tarjeta compacta de foto cargada (para no robar altura vertical al recuadro) */}
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

                  {rawOcrText && (
                    <div className="pt-0.5">
                      <button
                        type="button"
                        onClick={() => setShowRawText(!showRawText)}
                        className="text-[10px] text-slate-400 hover:text-cyan-300 flex items-center gap-1 font-medium cursor-pointer"
                      >
                        <Eye className="h-3 w-3" />
                        <span>{showRawText ? 'Ocultar texto OCR' : 'Ver texto OCR leído'}</span>
                      </button>
                      {showRawText && (
                        <pre className="mt-1 p-2 bg-[#080d14] border border-white/10 rounded-xl text-[9px] font-mono text-slate-300 max-h-20 overflow-x-auto">
                          {rawOcrText}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* RECUADRO DE RESULTADOS: Ocupa todo el espacio vertical disponible */}
              {renderResultsBox()}
            </div>
          )}

          {/* MODO TEXTO */}
          {mode === 'paste' && (
            <div className="space-y-3">
              <div className="bg-[#0e1622] border border-white/10 rounded-2xl p-3 space-y-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Pegar Datos de Despacho</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowTextHelp(!showTextHelp)}
                      className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer"
                    >
                      {showTextHelp ? 'Ocultar' : '¿Qué poner?'}
                    </button>
                    <button
                      type="button"
                      onClick={handleInsertSampleText}
                      className="text-[9.5px] bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-lg font-bold transition cursor-pointer"
                    >
                      Ejemplo Real
                    </button>
                  </div>
                </div>

                {showTextHelp && (
                  <div className="p-2.5 bg-[#080d14] border border-cyan-500/20 rounded-xl text-[10.5px] text-slate-300 space-y-1.5 leading-relaxed">
                    <p className="font-bold text-white">Formatos admitidos:</p>
                    <ul className="space-y-1 list-disc list-inside text-slate-400">
                      <li><strong className="text-cyan-300">Excel / Portal:</strong> Copia y pega las filas completas separadas por tabuladores.</li>
                      <li><strong className="text-cyan-300">WhatsApp / Notas:</strong> <code>748966 1308 MINTCREST DR, GOSHEN DROP:71.37 Type:RG-6</code></li>
                      <li><strong className="text-cyan-300">Mínimo:</strong> <code>833906 21935 KIMBERLY DR GOSHEN</code></li>
                    </ul>
                  </div>
                )}

                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={3}
                  placeholder="Pega aquí las filas de despacho (de Excel o WhatsApp)..."
                  className="w-full bg-[#080d14] border border-white/10 rounded-xl p-2.5 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 shadow-inner resize-none"
                />

                <button
                  type="button"
                  onClick={handleParsePaste}
                  disabled={scanning || !pasteText.trim()}
                  className="w-full py-2 bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 hover:from-blue-500 text-white font-black text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Interpretar y Cargar al Recuadro</span>
                </button>
              </div>

              {/* RECUADRO DE RESULTADOS */}
              {renderResultsBox()}
            </div>
          )}
        </div>

        {/* 5. Footer Cockpit */}
        <div className="px-4 py-3 border-t border-white/10 bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white text-xs font-bold transition active:scale-95 cursor-pointer border border-white/10 shadow-sm"
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

  // Renderizador del Recuadro de Resultados (Con buen alto vertical y visualización cómoda)
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
              {mode === 'photo'
                ? 'Toma o sube una foto de tu hoja de despacho para que el OCR detecte automáticamente todas las órdenes.'
                : 'Pega las líneas de despacho o presiona "Ejemplo Real" para cargarlas.'}
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

        {/* Lista de Filas en el Recuadro con altura cómoda */}
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
                  <option value="DW:1">Driveway (+$30)</option>
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
