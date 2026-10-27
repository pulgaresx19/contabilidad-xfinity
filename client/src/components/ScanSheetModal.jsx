import React, { useState, useRef } from 'react';
import { Camera, Upload, Sparkles, Check, AlertCircle, Trash2, Plus, FileText, ArrowRight, Eye } from 'lucide-react';

export default function ScanSheetModal({ onOrdersSaved, defaultTech }) {
  const [mode, setMode] = useState('photo'); // 'photo' | 'paste'
  const [sheetDate, setSheetDate] = useState(new Date().toISOString().split('T')[0]);
  const [techId, setTechId] = useState(defaultTech || 'Javier (P0G1)');

  // File & OCR state
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [extractedOrders, setExtractedOrders] = useState([]);
  const [rawOcrText, setRawOcrText] = useState('');
  const [showRawText, setShowRawText] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const fileInputRef = useRef(null);

  // Manual Paste State
  const [pasteText, setPasteText] = useState('');

  // Handle Photo Selection and OCR Scan
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setScanning(true);
    setMessage(null);
    setExtractedOrders([]);

    const formData = new FormData();
    formData.append('sheetPhoto', file);
    formData.append('sheet_photo', file);
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
        if (data.parsedOrders.length === 0) {
          setMessage({ type: 'warning', text: 'Se guardó la foto en el historial. El lector extrajo texto pero no identificó órdenes automáticas con certeza. Revisa el texto abajo o agrega las filas manualmente.' });
        } else {
          setMessage({ type: 'success', text: `¡Foto guardada en el historial y ${data.parsedOrders.length} orden(es) detectada(s)! Revisa los datos abajo.` });
        }
      } else {
        setMessage({ type: 'error', text: data.error || 'Error al procesar la imagen' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setScanning(false);
    }
  };

  // Update a single field in extracted orders
  const updateOrderField = (index, field, value) => {
    setExtractedOrders((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // Remove candidate row
  const removeOrder = (index) => {
    setExtractedOrders((prev) => prev.filter((_, i) => i !== index));
  };

  // Add a blank candidate row
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
        rate_calculated: 65,
        status: 'Completado',
        payment_status: 'En Fondo (3 Sem)'
      }
    ]);
  };

  // Save all confirmed orders to database
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
        setMessage({ type: 'success', text: `¡Éxito! Se guardaron ${data.count} órdenes en tu contabilidad.` });
        setTimeout(() => {
          onOrdersSaved();
        }, 1200);
      } else {
        setMessage({ type: 'error', text: data.error || 'Error al guardar órdenes' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  // Parse text paste
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
        setMessage({ type: 'success', text: `¡Se interpretaron ${data.parsed.length} órdenes del texto!` });
      } else {
        setMessage({ type: 'warning', text: 'No se reconocieron órdenes en el texto pegado.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-4 max-w-lg mx-auto pb-6">
      {/* Header card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-xl">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Lector de Hoja de Ruta Diaria</h2>
              <p className="text-[11px] text-slate-400">Guarda la foto en el historial e ingresa los trabajos</p>
            </div>
          </div>

          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px]">
            <button
              onClick={() => setMode('photo')}
              className={`px-2.5 py-1 rounded-lg font-bold transition ${mode === 'photo' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'}`}
            >
              Foto
            </button>
            <button
              onClick={() => setMode('paste')}
              className={`px-2.5 py-1 rounded-lg font-bold transition ${mode === 'paste' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'}`}
            >
              Texto
            </button>
          </div>
        </div>

        {/* Date and Tech Config for the sheet */}
        <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 text-xs">
          <div>
            <label className="text-[10px] text-slate-400 block font-semibold">Fecha de la Hoja</label>
            <input
              type="date"
              value={sheetDate}
              onChange={(e) => setSheetDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block font-semibold">Técnico</label>
            <input
              type="text"
              value={techId}
              onChange={(e) => setTechId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div className={`p-3 rounded-xl border flex items-start gap-2 text-xs ${
          message.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : message.type === 'warning'
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          {message.type === 'success' ? (
            <Check className="h-4 w-4 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* MODE PHOTO: Camera Capture & OCR */}
      {mode === 'photo' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />

          {!previewUrl ? (
            <button
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              className="w-full py-12 px-4 border-2 border-dashed border-cyan-500/40 hover:border-cyan-400 bg-cyan-950/20 hover:bg-cyan-950/30 rounded-2xl flex flex-col items-center justify-center gap-3 transition group active:scale-[0.98]"
            >
              <div className="h-16 w-16 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center shadow-lg group-hover:scale-105 transition">
                <Camera className="h-8 w-8" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-white">Tomar Foto con Cámara o Elegir Imagen</p>
                <p className="text-xs text-slate-400 mt-0.5">Captura la hoja de ruta con la tabla de trabajos del día</p>
              </div>
            </button>
          ) : (
            <div className="space-y-3">
              {/* Photo preview with retake button */}
              <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-950 max-h-48 aspect-video">
                <img src={previewUrl} alt="Hoja de ruta" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent flex items-end justify-between p-2">
                  <span className="text-[10px] bg-slate-900/90 text-cyan-300 border border-slate-700 px-2 py-0.5 rounded">
                    Hoja capturada
                  </span>
                  <button
                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                    className="px-2 py-1 bg-slate-800/90 hover:bg-slate-700 text-white text-[11px] font-bold rounded-lg transition"
                  >
                    Tomar Otra Foto
                  </button>
                </div>
              </div>

              {scanning && (
                <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl flex items-center gap-3 text-cyan-400 text-xs">
                  <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
                  <span>Escaneando y reconociendo datos de la imagen...</span>
                </div>
              )}
            </div>
          )}

          {rawOcrText && (
            <div className="pt-2">
              <button
                onClick={() => setShowRawText(!showRawText)}
                className="text-[11px] text-slate-400 hover:text-cyan-400 flex items-center gap-1"
              >
                <Eye className="h-3 w-3" />
                <span>{showRawText ? 'Ocultar texto leído por el OCR' : 'Ver texto leído por el OCR'}</span>
              </button>
              {showRawText && (
                <pre className="mt-2 p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-[10px] font-mono text-slate-300 overflow-x-auto max-h-36">
                  {rawOcrText}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODE PASTE: Manual text box fallback */}
      {mode === 'paste' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={4}
            placeholder="Pega las líneas de la orden aquí (ej. copiadas de WhatsApp o Excel)..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
          />
          <button
            onClick={handleParsePaste}
            disabled={scanning || !pasteText.trim()}
            className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2"
          >
            <Sparkles className="h-4 w-4" />
            <span>Interpretar Texto Pegado</span>
          </button>
        </div>
      )}

      {/* REVIEW EXTRACTED ORDERS */}
      {extractedOrders.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Órdenes Extraídas ({extractedOrders.length})
            </h3>
            <button
              onClick={addBlankOrder}
              className="text-xs text-cyan-400 font-semibold flex items-center gap-1 hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Agregar Otra Fila</span>
            </button>
          </div>

          <div className="space-y-2">
            {extractedOrders.map((order, idx) => (
              <div
                key={idx}
                className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2 relative"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-500">#{idx + 1}</span>
                    <input
                      type="text"
                      placeholder="Job ID (ej. 626746)"
                      value={order.job_id}
                      onChange={(e) => updateOrderField(idx, 'job_id', e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-xs font-mono text-cyan-400 font-bold w-28 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">$</span>
                    <input
                      type="number"
                      step="0.5"
                      value={order.rate_calculated}
                      onChange={(e) => updateOrderField(idx, 'rate_calculated', parseFloat(e.target.value) || 0)}
                      className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-xs font-mono text-emerald-400 font-bold w-16 text-right focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      onClick={() => removeOrder(idx)}
                      className="p-1 text-slate-500 hover:text-rose-400 transition"
                      title="Quitar esta fila"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Address */}
                <div>
                  <input
                    type="text"
                    placeholder="Dirección del cliente"
                    value={order.address}
                    onChange={(e) => updateOrderField(idx, 'address', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Drop footage, Cable type, Bore */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="text-[9px] text-slate-400 block">Pies (Drop)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={order.drop_footage}
                      onChange={(e) => updateOrderField(idx, 'drop_footage', parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-amber-300 font-mono font-bold focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-400 block">Cable</label>
                    <select
                      value={order.cable_type}
                      onChange={(e) => updateOrderField(idx, 'cable_type', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                    >
                      <option value="RG-6">RG-6</option>
                      <option value="RG-11">RG-11</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-400 block">Bore</label>
                    <select
                      value={order.bore_type}
                      onChange={(e) => updateOrderField(idx, 'bore_type', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                    >
                      <option value="N">Ninguno</option>
                      <option value="DW:1">Driveway (DW:1)</option>
                      <option value="SW:1">Sidewalk (SW:1)</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Confirm & Save Button */}
          <button
            onClick={handleSaveOrders}
            disabled={saving}
            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-sm rounded-xl transition shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <Check className="h-5 w-5" />
            <span>{saving ? 'Guardando en Contabilidad...' : `Confirmar e Ingresar ${extractedOrders.length} Órdenes`}</span>
          </button>
        </div>
      )}
    </div>
  );
}
