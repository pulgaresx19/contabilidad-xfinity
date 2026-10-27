import React, { useState, useRef } from 'react';
import { Camera, Upload, Check, AlertCircle, Trash2, Plus, Sparkles, X, Eye, Image as ImageIcon } from 'lucide-react';
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
            text: 'Foto guardada con éxito. No se reconocieron números de orden automáticamente. Se ha creado una fila para que puedas ingresar los datos manualmente o tocar "Agregar Fila".'
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
              status: 'Completado',
              payment_status: 'Pendiente',
              raw_notes: ''
            }
          ]);
        } else {
          setMessage({
            type: 'success',
            text: `¡Foto guardada en el historial y ${data.parsedOrders.length} orden(es) detectada(s)! Revisa o edita los datos abajo.`
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
        status: 'Completado',
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
        body: JSON.stringify({ rawText: pasteText })
      });
      const data = await res.json();
      if (res.ok && data.parsed.length > 0) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-lg rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[92vh] overflow-hidden mx-auto transition-colors">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 rounded-lg">
              <Camera className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Escanear Foto de Despacho</h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Guarda la foto y extrae las órdenes automáticamente</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-slate-200 dark:bg-slate-950 p-0.5 rounded-lg border border-slate-300 dark:border-slate-800 text-[10px]">
              <button
                type="button"
                onClick={() => setMode('photo')}
                className={`px-2 py-0.5 rounded font-bold transition ${mode === 'photo' ? 'bg-cyan-500 text-slate-950 shadow-xs' : 'text-slate-600 dark:text-slate-400'}`}
              >
                Foto
              </button>
              <button
                type="button"
                onClick={() => setMode('paste')}
                className={`px-2 py-0.5 rounded font-bold transition ${mode === 'paste' ? 'bg-cyan-500 text-slate-950 shadow-xs' : 'text-slate-600 dark:text-slate-400'}`}
              >
                Texto
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 transition"
              title="Cerrar ventana"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* Date selector */}
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800/80 text-xs">
            <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">Fecha de la hoja:</span>
            <input
              type="date"
              value={sheetDate}
              onChange={(e) => setSheetDate(e.target.value)}
              className="bg-transparent text-slate-900 dark:text-slate-200 text-xs font-mono focus:outline-none"
            />
          </div>

          {/* Feedback message */}
          {message && (
            <div className={`p-2.5 rounded-xl border flex items-start gap-2 text-xs ${
              message.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                : message.type === 'warning'
                ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/30 text-amber-800 dark:text-amber-300'
                : 'bg-rose-50 dark:bg-rose-500/10 border-rose-300 dark:border-rose-500/30 text-rose-800 dark:text-rose-300'
            }`}>
              {message.type === 'success' ? (
                <Check className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* Mode 1: Photo & Camera */}
          {mode === 'photo' && (
            <div className="space-y-3">
              {/* Input for Camera (forces camera on mobile) */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />

              {/* Input for Gallery / File picker (no capture, opens photo album) */}
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              {!previewUrl ? (
                <div className="space-y-2">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block px-0.5">
                    Elige cómo agregar la foto de despacho:
                  </span>

                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Botón 1: Cámara */}
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current && cameraInputRef.current.click()}
                      className="py-6 px-3 border border-cyan-300 dark:border-cyan-500/40 hover:border-cyan-400 bg-cyan-50/70 dark:bg-cyan-950/25 hover:bg-cyan-100 dark:hover:bg-cyan-950/50 rounded-2xl flex flex-col items-center justify-center gap-2 transition active:scale-95 group shadow-sm text-center"
                    >
                      <div className="h-12 w-12 rounded-2xl bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 group-hover:bg-cyan-500 group-hover:text-slate-950 flex items-center justify-center transition shadow-md">
                        <Camera className="h-6 w-6 stroke-[2.5]" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-900 dark:text-white">Tomar con Cámara</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Foto en vivo ahora</p>
                      </div>
                    </button>

                    {/* Botón 2: Galería de Fotos */}
                    <button
                      type="button"
                      onClick={() => galleryInputRef.current && galleryInputRef.current.click()}
                      className="py-6 px-3 border border-slate-200 dark:border-slate-800 hover:border-blue-400 bg-slate-50 dark:bg-slate-950/80 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-2xl flex flex-col items-center justify-center gap-2 transition active:scale-95 group shadow-sm text-center"
                    >
                      <div className="h-12 w-12 rounded-2xl bg-blue-500/20 text-blue-600 dark:text-blue-400 group-hover:bg-blue-500 group-hover:text-slate-950 flex items-center justify-center transition shadow-md">
                        <ImageIcon className="h-6 w-6 stroke-[2.5]" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-900 dark:text-white">Elegir de Galería</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Foto ya guardada</p>
                      </div>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-950 max-h-40 aspect-video shadow-md">
                    <img src={previewUrl} alt="Hoja" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent flex items-end justify-between p-2.5">
                      <span className="text-[10px] bg-slate-900/90 text-cyan-300 border border-slate-700 px-2 py-0.5 rounded-lg font-mono font-bold">
                        Foto Cargada
                      </span>
                    </div>
                  </div>

                  {/* Botones para cambiar foto: Cámara o Galería */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current && cameraInputRef.current.click()}
                      className="flex-1 py-2 px-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 border border-slate-200 dark:border-slate-700 shadow-2xs"
                    >
                      <Camera className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                      <span>Otra con Cámara</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => galleryInputRef.current && galleryInputRef.current.click()}
                      className="flex-1 py-2 px-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 border border-slate-200 dark:border-slate-700 shadow-2xs"
                    >
                      <ImageIcon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Elegir de Galería</span>
                    </button>
                  </div>

                  {scanning && (
                    <div className="p-3 bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-300 dark:border-cyan-500/30 rounded-xl flex items-center gap-2 text-cyan-700 dark:text-cyan-400 text-xs">
                      <div className="w-4 h-4 border-2 border-cyan-600 dark:border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                      <span className="font-semibold">Reconociendo datos de la imagen con OCR...</span>
                    </div>
                  )}
                </div>
              )}

              {rawOcrText && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowRawText(!showRawText)}
                    className="text-[10px] text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 flex items-center gap-1 font-medium"
                  >
                    <Eye className="h-3 w-3" />
                    <span>{showRawText ? 'Ocultar texto OCR' : 'Ver texto OCR leído'}</span>
                  </button>
                  {showRawText && (
                    <pre className="mt-1.5 p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-[9px] font-mono text-slate-700 dark:text-slate-300 max-h-24 overflow-x-auto">
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
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono text-slate-900 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-cyan-500 shadow-inner"
              />
              <button
                type="button"
                onClick={handleParsePaste}
                disabled={scanning || !pasteText.trim()}
                className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Interpretar Texto</span>
              </button>
            </div>
          )}

          {/* Review candidate orders list */}
          {extractedOrders.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase">
                  Órdenes Detectadas ({extractedOrders.length})
                </span>
                <button
                  type="button"
                  onClick={addBlankOrder}
                  className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline font-bold flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" />
                  <span>Agregar Fila</span>
                </button>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {extractedOrders.map((o, idx) => (
                  <div key={idx} className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 space-y-1.5 text-xs shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-500 font-bold">#{idx + 1}</span>
                        <input
                          type="text"
                          placeholder="Job ID"
                          value={o.job_id}
                          onChange={(e) => updateOrderField(idx, 'job_id', e.target.value)}
                          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono text-cyan-600 dark:text-cyan-400 font-bold w-24 focus:outline-none"
                        />
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">${o.rate_calculated}</span>
                        <button
                          type="button"
                          onClick={() => removeOrder(idx)}
                          className="text-slate-400 hover:text-rose-500 p-0.5"
                          title="Eliminar orden"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <input
                      type="text"
                      placeholder="Dirección"
                      value={o.address}
                      onChange={(e) => updateOrderField(idx, 'address', e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded px-2 py-0.5 text-[11px] text-slate-800 dark:text-slate-200 focus:outline-none"
                    />

                    <div className="flex items-center gap-2 text-[10px]">
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500 dark:text-slate-400">Pies:</span>
                        <input
                          type="number"
                          value={o.drop_footage}
                          onChange={(e) => updateOrderField(idx, 'drop_footage', parseFloat(e.target.value) || 0)}
                          className="w-14 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 text-amber-700 dark:text-amber-300 font-mono font-bold"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500 dark:text-slate-400">Bore:</span>
                        <select
                          value={o.bore_type}
                          onChange={(e) => updateOrderField(idx, 'bore_type', e.target.value)}
                          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 text-slate-800 dark:text-slate-200"
                        >
                          <option value="N">No (+$0)</option>
                          <option value="DW:1">Driveway (+$30)</option>
                          <option value="SW:1">Sidewalk (+$0)</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <input
                          type="text"
                          placeholder="Nota / Urgente..."
                          value={o.raw_notes && o.raw_notes !== o.address ? o.raw_notes : ''}
                          onChange={(e) => updateOrderField(idx, 'raw_notes', e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300 placeholder-slate-400 focus:outline-none focus:border-cyan-500"
                          title="Escribe notas adicionales o Urgente"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer with action button */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition"
          >
            Cancelar
          </button>

          {extractedOrders.length > 0 && (
            <button
              type="button"
              onClick={handleSaveOrders}
              disabled={saving}
              className="flex-1 py-2 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-[0.98] transition"
            >
              <Check className="h-4 w-4 stroke-[2.5]" />
              <span>{saving ? 'Guardando...' : `Confirmar ${extractedOrders.length} Órdenes`}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
