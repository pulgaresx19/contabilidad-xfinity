import React, { useState, useRef } from 'react';
import { Camera, Upload, Check, AlertCircle, Trash2, Plus, Sparkles, X, Eye, Image as ImageIcon, Calendar } from 'lucide-react';
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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  // Paste state
  const [pasteText, setPasteText] = useState('');

  if (!isOpen) return null;

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
            text: 'Foto guardada. No se reconocieron números de orden automáticamente. Puedes ingresar los datos manualmente o tocar "Agregar Fila".'
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
          // If sheet date was detected in the sheet, update sheetDate state
          const detectedDate = (data.parsedOrders && data.parsedOrders[0] && data.parsedOrders[0].work_date) || sheetDate;
          if (detectedDate && detectedDate !== sheetDate) {
            setSheetDate(detectedDate);
          }
          setExtractedOrders(
            (data.parsedOrders || []).map((o) => ({
              ...o,
              work_date: o.work_date || detectedDate,
              status: 'Pendiente',
              payment_status: 'Pendiente'
            }))
          );
          setMessage({
            type: 'success',
            text: `¡Foto guardada y ${data.parsedOrders.length} orden(es) detectada(s)! Revisa o edita los datos abajo.`
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
      next[index] = { ...next[index], [field]: value };
      // Recalculate price if bore changes
      if (field === 'bore_type') {
        next[index].rate_calculated = value.includes('DW') ? 130 : 100;
      }
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
        payment_status: 'Pendiente'
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
        setMessage({ type: 'success', text: `¡Éxito! Se guardaron ${count} órdenes en tu contabilidad.` });
        setTimeout(() => {
          if (onOrdersSaved) onOrdersSaved();
          onClose();
        }, 1000);
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
        setExtractedOrders(data.parsed);
        setMessage({ type: 'success', text: `¡${data.parsed.length} orden(es) interpretada(s) del texto!` });
      } else {
        setMessage({ type: 'warning', text: 'No se reconocieron órdenes válidas en el texto.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setScanning(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-[#101722] border border-white/10 rounded-3xl max-w-sm sm:max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl text-white transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Header (Misma estructura idéntica de Travesía del Día y PhotoModal) */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-slate-900/70 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shrink-0 shadow-md shadow-cyan-500/20">
              <Camera className="h-4 w-4 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-white truncate">
                Escanear Hoja de Despacho
              </h3>
              <p className="text-[10.5px] text-slate-400 font-medium truncate">
                OCR automático y registro de órdenes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Switch (Foto / Texto) */}
            <div className="flex bg-[#16202c] p-0.5 rounded-lg border border-white/10 text-[10px]">
              <button
                type="button"
                onClick={() => setMode('photo')}
                className={`px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                  mode === 'photo' 
                    ? 'bg-cyan-500 text-slate-950 shadow-xs' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Foto
              </button>
              <button
                type="button"
                onClick={() => setMode('paste')}
                className={`px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                  mode === 'paste' 
                    ? 'bg-cyan-500 text-slate-950 shadow-xs' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Texto
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
              title="Cerrar ventana"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 2. Quick KPI / Info Bar (Idéntico a Travesía del Día) */}
        <div className="grid grid-cols-3 gap-2 px-4 py-2.5 bg-[#0d141e] border-b border-white/5 shrink-0 text-center">
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
              className="bg-transparent text-cyan-400 text-xs font-mono font-black text-center focus:outline-none cursor-pointer w-full"
            />
          </div>
          <div className="bg-[#16202c] p-2 rounded-xl border border-white/5 flex flex-col justify-center">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
              Modo Activo
            </span>
            <span className="text-xs font-black text-white uppercase tracking-tight block">
              {mode === 'photo' ? 'Cámara OCR' : 'Texto / Chat'}
            </span>
          </div>
          <div className="bg-[#16202c] p-2 rounded-xl border border-white/5 flex flex-col justify-center">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
              Detectadas
            </span>
            <span className="text-sm font-black text-emerald-400 font-mono">
              {extractedOrders.length} {extractedOrders.length === 1 ? 'orden' : 'órdenes'}
            </span>
          </div>
        </div>

        {/* 3. Action Bar para Fotos */}
        {mode === 'photo' && !previewUrl && (
          <div className="px-4 py-2.5 bg-[#0e1622] border-b border-white/5 shrink-0">
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
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current && cameraInputRef.current.click()}
                className="py-2 px-3 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 hover:from-blue-500 text-white font-black text-xs shadow-md shadow-cyan-600/20 flex items-center justify-center gap-2 active:scale-95 transition cursor-pointer"
              >
                <Camera className="h-3.5 w-3.5 stroke-[2.2]" />
                <span>Tomar con Cámara</span>
              </button>

              <button
                type="button"
                onClick={() => galleryInputRef.current && galleryInputRef.current.click()}
                className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 hover:text-white border border-white/10 font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition cursor-pointer shadow-sm"
              >
                <ImageIcon className="h-3.5 w-3.5 stroke-[2] text-slate-400" />
                <span>Elegir de Galería</span>
              </button>
            </div>
          </div>
        )}

        {/* 4. Cuerpo Scrollable */}
        <div className="p-4 overflow-y-auto space-y-3.5 flex-1 scrollbar-none bg-[#101722]">
          {/* Feedback message */}
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
              <span>{message.text}</span>
            </div>
          )}

          {/* Mode 1: Photo Preview & OCR Progress */}
          {mode === 'photo' && previewUrl && (
            <div className="space-y-2">
              <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#0d141e] max-h-36 aspect-video shadow-md">
                <img src={previewUrl} alt="Hoja de Despacho" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent flex items-end justify-between p-2">
                  <span className="text-[10px] bg-black/80 text-cyan-300 border border-cyan-400/20 px-2 py-0.5 rounded-lg font-mono font-bold">
                    Foto Cargada
                  </span>
                </div>
              </div>

              {/* Botones para cambiar foto */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current && cameraInputRef.current.click()}
                  className="flex-1 py-1.5 px-2 bg-[#16202c] hover:bg-[#1e2b3b] text-slate-300 hover:text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 border border-white/10"
                >
                  <Camera className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Otra con Cámara</span>
                </button>

                <button
                  type="button"
                  onClick={() => galleryInputRef.current && galleryInputRef.current.click()}
                  className="flex-1 py-1.5 px-2 bg-[#16202c] hover:bg-[#1e2b3b] text-slate-300 hover:text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 border border-white/10"
                >
                  <ImageIcon className="h-3.5 w-3.5 text-slate-400" />
                  <span>De Galería</span>
                </button>
              </div>

              {scanning && (
                <div className="p-2.5 bg-cyan-500/15 border border-cyan-500/30 rounded-xl flex items-center gap-2 text-cyan-300 text-xs">
                  <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                  <span className="font-semibold">Reconociendo datos con OCR de Google...</span>
                </div>
              )}

              {rawOcrText && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowRawText(!showRawText)}
                    className="text-[10px] text-slate-400 hover:text-cyan-300 flex items-center gap-1 font-medium cursor-pointer"
                  >
                    <Eye className="h-3 w-3" />
                    <span>{showRawText ? 'Ocultar texto OCR' : 'Ver texto OCR leído'}</span>
                  </button>
                  {showRawText && (
                    <pre className="mt-1.5 p-2 bg-[#0d141e] border border-white/10 rounded-xl text-[9px] font-mono text-slate-300 max-h-24 overflow-x-auto scrollbar-none">
                      {rawOcrText}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Mode 2: Paste text fallback */}
          {mode === 'paste' && (
            <div className="space-y-2">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={3}
                placeholder="Pega las filas aquí (de WhatsApp o Excel)..."
                className="w-full bg-[#0d141e] border border-white/10 rounded-2xl p-2.5 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 shadow-inner resize-none"
              />
              <button
                type="button"
                onClick={handleParsePaste}
                disabled={scanning || !pasteText.trim()}
                className="w-full py-2 bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 hover:from-blue-500 text-white font-black text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Interpretar Texto</span>
              </button>
            </div>
          )}

          {/* Review candidate orders list */}
          {extractedOrders.length > 0 && (
            <div className="space-y-2 pt-1 border-t border-white/5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Órdenes Detectadas ({extractedOrders.length})
                </span>
                <button
                  type="button"
                  onClick={addBlankOrder}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="h-3 w-3" />
                  <span>Agregar Fila</span>
                </button>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1 scrollbar-none">
                {extractedOrders.map((o, idx) => (
                  <div key={idx} className="bg-[#16202c] border border-white/10 hover:border-cyan-500/30 rounded-2xl p-2.5 space-y-1.5 text-xs shadow-xs transition">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-mono font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          placeholder="Job ID"
                          value={o.job_id}
                          onChange={(e) => updateOrderField(idx, 'job_id', e.target.value)}
                          className="bg-[#0d141e] border border-white/10 rounded-lg px-2 py-0.5 text-xs font-mono text-cyan-300 font-bold w-24 focus:outline-none focus:border-cyan-400"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400 font-mono font-black text-xs">${o.rate_calculated}</span>
                        <button
                          type="button"
                          onClick={() => removeOrder(idx)}
                          className="text-slate-400 hover:text-rose-400 p-1 rounded-lg transition active:scale-90"
                          title="Eliminar orden"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <input
                      type="text"
                      placeholder="Dirección completa"
                      value={o.address}
                      onChange={(e) => updateOrderField(idx, 'address', e.target.value)}
                      className="w-full bg-[#0d141e] border border-white/10 rounded-xl px-2.5 py-1 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                    />

                    <div className="flex items-center gap-2 text-[10px]">
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400">Pies:</span>
                        <input
                          type="number"
                          value={o.drop_footage}
                          onChange={(e) => updateOrderField(idx, 'drop_footage', parseFloat(e.target.value) || 0)}
                          className="w-14 bg-[#0d141e] border border-white/10 rounded-lg px-1.5 py-0.5 text-cyan-300 font-mono font-bold focus:outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400">Bore:</span>
                        <select
                          value={o.bore_type}
                          onChange={(e) => updateOrderField(idx, 'bore_type', e.target.value)}
                          className="bg-[#0d141e] border border-white/10 rounded-lg px-1.5 py-0.5 text-slate-200 focus:outline-none"
                        >
                          <option value="N">No (+$0)</option>
                          <option value="DW:1">Driveway (+$30)</option>
                          <option value="SW:1">Sidewalk (+$0)</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <input
                          type="text"
                          placeholder="Notas..."
                          value={o.raw_notes && o.raw_notes !== o.address ? o.raw_notes : ''}
                          onChange={(e) => updateOrderField(idx, 'raw_notes', e.target.value)}
                          className="w-full bg-[#0d141e] border border-white/10 rounded-lg px-2 py-0.5 text-[10px] text-amber-300 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                          title="Notas o llamadas"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 5. Footer con botones estilizados idénticos a Travesía del Día */}
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
              <span>{saving ? 'Guardando...' : `Confirmar ${extractedOrders.length} Órdenes`}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
