import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera, Check, AlertCircle, Trash2, Plus, X, Eye,
  Image as ImageIcon, MapPin, Ruler, Maximize2, Phone, CheckCircle2, Sparkles,
  ChevronDown, ChevronRight
} from 'lucide-react';
import { getLocalDateStr, normalizeDateStr } from '../utils/dateUtils';
import { interactWithAuraCore } from '../services/auraService';
import { cleanRawNotes, getOrderFieldBadges, formatCableType } from '../utils/remarkUtils';
import { compressImage, detectPriorityRowIndices } from '../services/imageUtils';
import ZoomableImageViewer from './ZoomableImageViewer';
import BadgeDetailModal from './BadgeDetailModal';
import AiDeductionGuideModal from './AiDeductionGuideModal';
import { calcOrderRate as computeOrderRate, normalizeRateCard, DEFAULT_RATE_CARD } from '../utils/rateUtils';

export default function ScanModal({ isOpen, onClose, onOrdersSaved, defaultTech }) {
  const [sheetDate, setSheetDate] = useState(() => getLocalDateStr());
  const [techId, setTechId] = useState(defaultTech || 'Javier (P0G1)');
  const [rateCard, setRateCard] = useState(DEFAULT_RATE_CARD);
  const [rateConfig, setRateConfig] = useState({
    base_rate: 100,
    bore_dw_bonus: 30,
    footage_base: 300,
    footage_extra_rate: 25
  });

  // Photo & scan state
  const [previewUrl, setPreviewUrl] = useState(null);
  const previewUrlRef = useRef(null);
  const [scannedFile, setScannedFile] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('idle'); // 'idle' | 'scanning' | 'success' | 'error'
  const [extractedOrders, setExtractedOrders] = useState([]);
  const [rawAiText, setRawAiText] = useState('');
  const [showRawText, setShowRawText] = useState(false);
  const [showFullPhoto, setShowFullPhoto] = useState(false);
  const [badgeModalData, setBadgeModalData] = useState(null);
  const [showAiGuideModal, setShowAiGuideModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [expandedRateMap, setExpandedRateMap] = useState({});

  const toggleExpandRate = (idx) => {
    setExpandedRateMap((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

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
    setScannedFile(null);
    setScanning(false);
    setScanStatus('idle');
    setSaving(false);
    setExtractedOrders([]);
    setExpandedRateMap({});
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
            if (s.rate_card) setRateCard(normalizeRateCard(s.rate_card));
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

  // Rate calculator helper (synced with Tarifario de Ajustes)
  const calcOrderRate = (footage, bore, isDirectBury = false, roadFt = 0) => {
    return computeOrderRate({
      drop_footage: footage,
      bore_type: bore,
      is_direct_bury: isDirectBury,
      road_bore_ft: roadFt
    }, rateCard).total;
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

    setScannedFile(file);
    replacePreviewUrl(URL.createObjectURL(file));
    setScanning(true);
    setScanStatus('scanning');
    setMessage(null);
    setExtractedOrders([]);
    setExpandedRateMap({});
    setRawAiText('');
    setShowRawText(false);

    let ordersFound = [];
    let extractedText = '';
    let auraModel = '';
    let aiErrorMsg = '';
    let aiNote = '';
    let aiNeedsConfirmation = false;
    let priorityRowIndices = [];

    // Lectura directa por IA multimodal + detección determinística de filas resaltadas en rojo
    try {
      const [auraRes, detectedRedRows] = await Promise.all([
        interactWithAuraCore({
          imageFile: file,
          text: 'Lee esta foto de hoja de despacho o lista de trabajos Xfinity y extrae TODAS las filas en el arreglo orders.',
          defaultTech: techId,
          defaultDate: sheetDate
        }),
        detectPriorityRowIndices(file).catch(() => [])
      ]);
      priorityRowIndices = Array.isArray(detectedRedRows) ? detectedRedRows : [];
      ordersFound = auraRes?.data?.orders || [];
      if (ordersFound.length === 0 && auraRes?.data?.record?.direccion) {
        const rec = auraRes.data.record;
        ordersFound = [{
          work_date: rec.fecha || sheetDate,
          tech_id: techId,
          job_id: '',
          address: rec.direccion,
          city: '',
          zip_code: '',
          phone: rec.telefono || '',
          drop_footage: 100,
          cable_type: 'RG-6',
          bore_type: 'N',
          obstacles: 'N',
          rate_calculated: Number(rec.monto) || 100,
          status: 'Pendiente',
          payment_status: 'Pendiente',
          raw_notes: rec.descripcionTrabajo || ''
        }];
      }
      extractedText = auraRes?.data?.transcript || auraRes?.data?.replyText || '';
      auraModel = auraRes?.modelUsed || 'Gemini';
      aiNote = auraRes?.data?.ambiguityNote || '';
      aiNeedsConfirmation = Boolean(auraRes?.data?.needsConfirmation);
    } catch (auraErr) {
      aiErrorMsg = auraErr.message || 'No se pudo conectar con el servidor de análisis.';
    }

    setScanning(false);

    if (aiErrorMsg) {
      setScanStatus('error');
      setMessage({
        type: 'error',
        text: `Error al escanear: ${aiErrorMsg} Revisa la conexión en Ajustes (⚙️).`
      });
      return;
    }

    if (!ordersFound || ordersFound.length === 0) {
      setScanStatus('error');
      setRawAiText(extractedText);
      const detailNote = extractedText ? ` (${extractedText.slice(0, 100)}...)` : '';
      setMessage({
        type: 'warning',
        text: `No se detectaron órdenes válidas en la foto${detailNote}. Intenta con una toma más cercana o añade una fila manual.`
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
      setScanStatus('success');
      const detectedDate = normalizeDateStr(ordersFound[0]?.work_date || sheetDate) || getLocalDateStr();
      if (detectedDate && detectedDate !== sheetDate) {
        setSheetDate(detectedDate);
      }
      setRawAiText(extractedText);
      setExtractedOrders(
        ordersFound.map((o, idx) => {
          const rawNotesStr = String(o.raw_notes || '');
          const detectedNeighbor = (() => {
            if (o.neighbor_notice && o.neighbor_notice !== 'N') return String(o.neighbor_notice).toUpperCase();
            const m = rawNotesStr.match(/\b(?:NBR|NB)[:\s]*([A-Za-z0-9]+)\b/i);
            if (m) return m[1].toUpperCase();
            if (/\bNB\b/i.test(rawNotesStr)) return 'N';
            return o.neighbor_notice || 'N';
          })();

          const detectedPremise = (() => {
            if (o.premise_access && o.premise_access !== 'N') return String(o.premise_access).toUpperCase();
            const paNotes = rawNotesStr.replace(/CALL\s*FIRST/ig, '');
            if (/RQHM/i.test(paNotes)) return 'RQHM';
            if (/DOG/i.test(paNotes)) return 'DOG';
            if (/(?:GATE|LOCK)/i.test(paNotes)) return 'GATE';
            if (/\bCALL\b/i.test(paNotes)) return 'CALL';
            return o.premise_access || 'N';
          })();

          const isPriorityRow = Boolean(o.is_priority || priorityRowIndices.includes(idx));
          const parsedRoadFt = parseFloat(o.road_bore_ft) || 0;

          const normalizedBore = (() => {
            const rawBoreSrc = (o.bore_type && o.bore_type !== 'N') ? String(o.bore_type) : (rawNotesStr.match(/B[O0]RE[:\s.\-_]*([^/\n\r]+?)(?=\/|\bTEMP|\bObst|\bPrem|\bNBR|$)/i)?.[1] || String(o.bore_type || 'N'));
            const s = rawBoreSrc.toUpperCase();
            const parts = [];
            const swM = s.match(/(?:SW|SV|SIDEWALK)[:\s.\-_]*(\d+)?/);
            if (swM) {
              const qty = swM[1] ? parseInt(swM[1], 10) : 1;
              if (qty > 0) parts.push(`SW:${qty}`);
            }
            const dwM = s.match(/(?:DW|DV|DRIVEWAY)[:\s.\-_]*(\d+)?/);
            if (dwM) {
              const qty = dwM[1] ? parseInt(dwM[1], 10) : 1;
              if (qty > 0) parts.push(`DW:${qty}`);
            }
            const rdM = s.match(/(?:RD|ROAD)[:\s.\-_]*(\d+)?/);
            if (rdM) {
              const qty = rdM[1] ? parseInt(rdM[1], 10) : 1;
              if (qty > 0) parts.push(`RD:${qty}`);
            }
            return parts.length > 0 ? parts.join(',') : 'N';
          })();

          const cableSource = `${o.cable_type || ''} ${rawNotesStr}`;
          const normalizedCable = /EP[O0]N|FIBER|FIBRA|FTTH|OPTIC/i.test(cableSource)
            ? 'EPON'
            : /11|RG[- ]?M|RG[- ]?II/i.test(String(o.cable_type || ''))
            ? 'RG-11'
            : 'RG-6';

          return {
            ...o,
            work_date: normalizeDateStr(o.work_date || detectedDate) || detectedDate,
            tech_id: String(o.tech_id || techId || 'Javier (P0G1)').trim(),
            job_id: String(o.job_id || '').trim(),
            address: String(o.address || '').trim(),
            is_priority: isPriorityRow ? 1 : 0,
            city: String(o.city || '').trim(),
            zip_code: String(o.zip_code || '').trim(),
            phone: String(o.phone || '').trim(),
            drop_footage: parseFloat(o.drop_footage) || 0,
            cable_type: normalizedCable,
            bore_type: normalizedBore,
            road_bore_ft: parsedRoadFt,
            obstacles: (() => {
              const rawObs = String(o.obstacles || '').toUpperCase();
              const obsList = [];
              if (/LANDSC|LANS|LANDS|\bLA\b|\bL\b/i.test(rawObs) || /LANDSC|LANDS|LANS/i.test(rawNotesStr)) obsList.push('LANDSC');
              if (/SPRKLR|SPRKL|SPRKR/i.test(rawObs) || /SPRKLR|SPRKL/i.test(rawNotesStr)) obsList.push('SPRKL');
              if (/DGFEN|\bDG\b/i.test(rawObs) || /DGFEN/i.test(rawNotesStr)) obsList.push('DGFEN');
              if (/PRIVLITE|PRIV/i.test(rawObs) || /PRIVLITE/i.test(rawNotesStr)) obsList.push('PRIVLITE');
              return obsList.length > 0 ? obsList.join(',') : (o.obstacles || 'N');
            })(),
            is_temp: o.is_temp ? 1 : (/TEMP[:\s.\-_]*Y/i.test(rawNotesStr) ? 1 : 0),
            premise_access: detectedPremise,
            neighbor_notice: detectedNeighbor,
            rate_calculated: calcOrderRate(o.drop_footage, normalizedBore, false, parsedRoadFt),
            status: 'Pendiente',
            payment_status: 'Pendiente',
            raw_notes: cleanRawNotes(rawNotesStr) || (rawNotesStr && !/^(?:N|NO|NONE|NULL)$/i.test(rawNotesStr.trim()) ? rawNotesStr.trim() : '')
          };
        })
      );
      if (aiNeedsConfirmation && aiNote) {
        setMessage({
          type: 'warning',
          text: `Revisar: ${aiNote}`
        });
      } else {
        setMessage(null);
      }
    }
  };

  const updateOrderField = (index, field, value) => {
    setExtractedOrders((prev) => {
      const next = [...prev];
      const updated = { ...next[index], [field]: value };
      if (field === 'drop_footage' || field === 'bore_type' || field === 'road_bore_ft') {
        const nextBore = field === 'bore_type' ? value : updated.bore_type;
        const isRd = String(nextBore || '').includes('RD');
        const nextRoadFt = isRd ? (parseFloat(field === 'road_bore_ft' ? value : updated.road_bore_ft) || 0) : 0;
        if (!isRd) updated.road_bore_ft = 0;
        updated.rate_calculated = calcOrderRate(
          field === 'drop_footage' ? value : updated.drop_footage,
          nextBore,
          false,
          nextRoadFt
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
        is_priority: 0,
        premise_access: 'N',
        neighbor_notice: 'N',
        is_temp: 0,
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
      const ordersToSave = extractedOrders.map((o) => {
        const isRd = String(o.bore_type || '').includes('RD');
        const rdFt = isRd ? (parseFloat(o.road_bore_ft) || 0) : 0;
        return {
          ...o,
          work_date: normalizeDateStr(o.work_date || sheetDate) || sheetDate,
          tech_id: String(o.tech_id || techId || defaultTech || 'Javier (P0G1)').trim(),
          job_id: String(o.job_id || '').trim(),
          drop_footage: parseFloat(o.drop_footage) || 0,
          road_bore_ft: rdFt,
          rate_calculated: calcOrderRate(o.drop_footage, o.bore_type, false, rdFt),
          status: 'Pendiente',
          payment_status: 'Pendiente'
        };
      });

      const res = await fetch('/api/batch-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: ordersToSave })
      });
      const data = await res.json();
      const savedCount = (data.imported || 0) + (data.updated || 0);

      if (res.ok && savedCount > 0) {
        const targetDate = normalizeDateStr(ordersToSave[0]?.work_date || sheetDate) || sheetDate;

        // Auto-guardar la foto de la hoja de despacho vinculada a este día (optimizada al estándar de la IA 2048px / 85%)
        if (scannedFile) {
          try {
            const compressed = await compressImage(scannedFile, 2048, 2048, 0.85).catch(() => null);
            const photoData = compressed?.dataUrl;
            if (photoData) {
              await fetch('/api/dispatch-sheets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sheet_date: targetDate,
                  filename: `sheet-${Date.now()}.jpg`,
                  original_name: scannedFile.name || 'sheet.jpg',
                  photo_data: photoData,
                  orders_count: savedCount,
                  extracted_text: rawAiText || ''
                })
              }).catch(() => {});
            } else {
              const reader = new FileReader();
              reader.onload = async () => {
                await fetch('/api/dispatch-sheets', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    sheet_date: targetDate,
                    filename: `sheet-${Date.now()}.jpg`,
                    original_name: scannedFile.name || 'sheet.jpg',
                    photo_data: reader.result,
                    orders_count: savedCount,
                    extracted_text: rawAiText || ''
                  })
                }).catch(() => {});
              };
              reader.readAsDataURL(scannedFile);
            }
          } catch (e) {}
        }

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
        <div className="grid grid-cols-3 gap-2 px-4 py-2 bg-[#0d141e] border-b border-white/5 shrink-0 text-center">
          {/* Columna 1: Fecha Hoja */}
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

          {/* Columna 2: Órdenes Detectadas con Icono de Reconocimiento / Error */}
          <div className="bg-[#16202c] py-1.5 px-1 rounded-xl border border-white/5 flex flex-col justify-center items-center">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
              Órdenes
            </span>
            <div className="flex items-center justify-center gap-1 min-w-0">
              {scanning ? (
                <>
                  <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span className="text-xs font-black text-cyan-300 font-mono">Leyendo...</span>
                </>
              ) : scanStatus === 'success' || (extractedOrders.length > 0 && previewUrl) ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span className="text-xs font-black text-emerald-400 font-mono">
                    {extractedOrders.length} {extractedOrders.length === 1 ? 'orden' : 'órdenes'}
                  </span>
                </>
              ) : scanStatus === 'error' ? (
                <>
                  <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                  <span className="text-xs font-black text-rose-400 font-mono">
                    0 órdenes
                  </span>
                </>
              ) : (
                <span className="text-xs font-black text-slate-400 font-mono">
                  {extractedOrders.length} {extractedOrders.length === 1 ? 'orden' : 'órdenes'}
                </span>
              )}
            </div>
          </div>

          {/* Columna 3: Total del Precio en la Esquina */}
          <div className="bg-[#16202c] py-1.5 px-1 rounded-xl border border-white/5 flex flex-col justify-center items-center">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
              Total
            </span>
            <span className="text-xs font-black text-emerald-400 font-mono tracking-tight block">
              ${totalEarnings}
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

          {/* Spinner de procesamiento */}
          {scanning && (
            <div className="p-3 bg-cyan-500/15 border border-cyan-500/30 rounded-xl flex items-center justify-center gap-2.5 text-cyan-300 text-xs">
              <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin shrink-0"></div>
              <span className="font-bold">Analizando foto de la hoja...</span>
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
                      <span>{showRawText ? 'Ocultar lectura de texto' : 'Ver texto detectado'}</span>
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

      {/* Modal Pantalla Completa para la Hoja de Despacho (con zoom y desplazamiento interactivo) */}
      {showFullPhoto && previewUrl && (
        <ZoomableImageViewer
          src={previewUrl}
          alt="Hoja de Despacho Completa"
          title={`Hoja de Despacho • ${sheetDate}`}
          onClose={() => setShowFullPhoto(false)}
        />
      )}

      {/* Modal Sobrepuesto: Explicación y Deducción de la IA de cada Badge */}
      {badgeModalData && (
        <BadgeDetailModal
          isOpen={Boolean(badgeModalData)}
          badgeKey={badgeModalData.badgeKey}
          order={badgeModalData.order}
          onClose={() => setBadgeModalData(null)}
          onTogglePriority={(ord) => {
            if (badgeModalData.orderIndex !== undefined && badgeModalData.orderIndex !== null) {
              updateOrderField(
                badgeModalData.orderIndex,
                'is_priority',
                ord.is_priority ? 0 : 1
              );
            }
          }}
        />
      )}

      {/* Modal Sobrepuesto: Guía Completa de Deducción IA y Códigos de Despacho */}
      {showAiGuideModal && (
        <AiDeductionGuideModal
          isOpen={showAiGuideModal}
          onClose={() => setShowAiGuideModal(false)}
        />
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
              Toma o sube una foto de tu hoja de despacho para detectar las órdenes automáticamente.
            </p>
          </div>
          <button
            type="button"
            onClick={addBlankOrder}
            className="px-3 py-1.5 bg-[#16202c] hover:bg-[#1e2b3b] border border-white/10 rounded-xl text-cyan-400 hover:text-white text-[11px] font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Agregar Fila Manual</span>
          </button>
        </div>
      );
    }

    return (
      <div className="bg-[#0e1622] border border-cyan-500/30 rounded-2xl p-3 flex flex-col flex-1 min-h-0 shadow-lg shadow-cyan-950/20">
        {/* Cabecera del Recuadro de Resultados */}
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
            <h4 className="text-xs font-black text-white uppercase tracking-wider whitespace-nowrap">
              Órdenes ({extractedOrders.length})
            </h4>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Botón Icono para ver toda la Guía de Deducción IA y Códigos en una sola ventana */}
            <button
              type="button"
              onClick={() => setShowAiGuideModal(true)}
              className="text-[10.5px] text-amber-300 hover:text-amber-200 font-bold flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2.5 py-1 rounded-lg transition active:scale-95 cursor-pointer shadow-xs"
              title="Ver Guía Completa de Deducción IA y Códigos de Despacho"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>Guía IA</span>
            </button>

            <button
              type="button"
              onClick={addBlankOrder}
              className="whitespace-nowrap shrink-0 text-[10.5px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 px-2.5 py-1 rounded-lg transition active:scale-95 cursor-pointer shadow-xs"
            >
              <Plus className="h-3 w-3" />
              <span>Agregar Fila</span>
            </button>
          </div>
        </div>

        {/* Lista de Filas en el Recuadro */}
        <div className="space-y-2 py-2 flex-1 min-h-0">
          {extractedOrders.map((o, idx) => {
            const orderRateInfo = computeOrderRate(o, rateCard);
            const isExpanded = Boolean(expandedRateMap[idx]);

            return (
            <div
              key={idx}
              className="border rounded-xl p-2.5 space-y-1.5 transition shadow-xs bg-[#141d28] border-white/10 hover:border-cyan-500/40"
            >
              {/* Fila 1: Número, Job ID, Desglose y Tarifa */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-md text-[10px] font-mono font-bold flex items-center justify-center shrink-0 border bg-cyan-500/20 text-cyan-300 border-cyan-500/30">
                    {idx + 1}
                  </span>
                  <div className="flex items-center gap-1 bg-[#0b1017] px-2 py-0.5 rounded-lg border border-white/10">
                    <span className="text-[10px] text-slate-500 font-mono font-bold">#</span>
                    <input
                      type="text"
                      placeholder="Job ID"
                      value={o.job_id}
                      onChange={(e) => updateOrderField(idx, 'job_id', e.target.value)}
                      className="bg-transparent text-xs font-mono text-cyan-300 font-black w-20 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Botón para expandir/ver desglose detallado de deducción */}
                  <button
                    type="button"
                    onClick={() => toggleExpandRate(idx)}
                    className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold flex items-center gap-1 transition cursor-pointer active:scale-95 ${
                      isExpanded
                        ? 'bg-cyan-500/25 text-cyan-300 border-cyan-500/50 shadow-xs'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
                    }`}
                    title="Ver desglose detallado de la deducción de la IA"
                  >
                    <span className="font-mono text-[9px] uppercase tracking-wider">Desglose</span>
                    {isExpanded ? <ChevronDown className="h-3 w-3 text-cyan-400" /> : <ChevronRight className="h-3 w-3 text-slate-400" />}
                  </button>

                  <div className="flex items-center gap-0.5 px-2 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 font-mono font-black text-emerald-400 text-xs shadow-xs">
                    <span>$</span>
                    <span>{o.rate_calculated || orderRateInfo.total}</span>
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

              {/* Panel Desplegable: Desglose Lineal Detallado de la IA */}
              {isExpanded && (
                <div className="bg-[#0b1017] border border-cyan-500/30 rounded-xl p-2.5 space-y-1.5 animate-fade-in text-xs shadow-inner">
                  <div className="flex items-center justify-between pb-1 border-b border-white/10">
                    <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      <span>Desglose Oficial de Tarifa (IA)</span>
                    </span>
                    <span className="text-[9.5px] font-mono text-slate-400">
                      {formatCableType(o.cable_type)} • {o.drop_footage || 0} ft
                    </span>
                  </div>

                  <div className="space-y-1">
                    {orderRateInfo.matchedCodes.map((codeItem, cIdx) => (
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
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-white/10 font-bold px-1">
                    <span className="text-slate-300 text-[10.5px]">Total Compensación:</span>
                    <span className="font-mono text-emerald-400 font-black text-xs">
                      ${orderRateInfo.total.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* Fila 2: Ubicación Lineal (Dirección, Ciudad con diseño ejecutivo y ZIP) */}
              <div className="flex items-center gap-1.5 bg-[#0b1017] border border-white/10 rounded-xl p-1 text-xs transition focus-within:border-cyan-500/40">
                {/* Dirección Postal */}
                <div className="flex items-center gap-1.5 flex-1 min-w-[110px] px-1.5 py-0.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Dirección completa"
                    value={o.address}
                    onChange={(e) => updateOrderField(idx, 'address', e.target.value)}
                    className="bg-transparent text-slate-100 hover:text-white focus:text-white text-[11.5px] font-semibold focus:outline-none w-full placeholder-slate-600 truncate"
                    title="Dirección completa"
                  />
                </div>

                {/* Separador vertical fino */}
                <div className="h-4 w-px bg-white/10 shrink-0" />

                {/* Cápsula de Ciudad y ZIP (Estilo Ejecutivo / Despacho) */}
                <div className="flex items-center justify-center gap-1.5 bg-[#141d29] px-2.5 py-0.5 rounded-lg border border-white/5 shrink-0 shadow-inner">
                  {/* Ciudad */}
                  <input
                    type="text"
                    placeholder="CIUDAD"
                    value={o.city}
                    onChange={(e) => updateOrderField(idx, 'city', e.target.value)}
                    className="bg-transparent text-slate-200 hover:text-white focus:text-white font-bold uppercase text-[10px] tracking-wider font-mono focus:outline-none w-[64px] sm:w-[80px] text-center placeholder-slate-600 truncate"
                    title="Ciudad (detectada por IA)"
                  />

                  <span className="text-slate-500 font-mono text-[9px] select-none shrink-0">•</span>

                  {/* Código Postal (ZIP) - Con ancho optimizado para visualizar los 5 dígitos sin cortes */}
                  <input
                    type="text"
                    placeholder="ZIP"
                    value={o.zip_code}
                    onChange={(e) => updateOrderField(idx, 'zip_code', e.target.value)}
                    className="bg-transparent text-slate-300 hover:text-white focus:text-white font-mono text-[10.5px] focus:outline-none w-14 sm:w-16 text-center placeholder-slate-600 shrink-0 pr-1 tracking-tight"
                    title="Código Postal (ZIP)"
                  />
                </div>
              </div>

              {/* Fila 3: Metraje (Pies), Tipo de Cable y Perforación (Bore) — Repartido en 3 partes iguales */}
              <div className="grid grid-cols-3 gap-1.5 pt-0.5 items-center">
                {/* 1. Metraje Drop (Pies) */}
                <div className="flex items-center justify-between gap-1 bg-[#0b1017] border border-white/10 rounded-lg px-2 py-0.5 min-w-0 h-full" title="Metraje (pies)">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <Ruler className="w-3 h-3 text-amber-400 shrink-0" />
                    <input
                      type="number"
                      step="0.1"
                      value={o.drop_footage}
                      onChange={(e) => updateOrderField(idx, 'drop_footage', e.target.value)}
                      className="w-full min-w-0 bg-transparent text-amber-300 font-mono font-bold focus:outline-none text-[10.5px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                  <span className="text-slate-500 font-mono text-[10px] shrink-0">ft</span>
                </div>

                {/* 2. Selector de Tipo de Cable */}
                <div className="grid grid-cols-3 bg-[#0b1017] p-0.5 rounded-lg border border-white/10 min-w-0">
                  {['RG-6', 'RG-11', 'EPON'].map((cab) => (
                    <button
                      key={cab}
                      type="button"
                      onClick={() => updateOrderField(idx, 'cable_type', cab)}
                      className={`px-1 py-0.5 rounded text-[9.5px] sm:text-[10px] font-bold transition cursor-pointer text-center truncate ${
                        o.cable_type === cab
                          ? cab === 'EPON'
                            ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                            : 'bg-cyan-500 text-slate-950 font-black shadow-xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                      title={cab === 'EPON' ? 'Fibra Óptica (EPON)' : cab}
                    >
                      {cab === 'EPON' ? 'Fibra' : cab}
                    </button>
                  ))}
                </div>

                {/* 3. Selector de Perforación (Bore) */}
                <select
                  value={o.bore_type || 'N'}
                  onChange={(e) => updateOrderField(idx, 'bore_type', e.target.value)}
                  className="bg-[#0b1017] border border-white/10 hover:border-cyan-500/40 rounded-lg px-1.5 py-0.5 text-[10px] text-slate-200 focus:outline-none cursor-pointer w-full min-w-0 h-full font-medium truncate"
                  title="Tipo de Perforación (Bore)"
                >
                  <option value="N">Sin Bore</option>
                  <option value="DW:1">Driveway (DW)</option>
                  <option value="DW:2">2 Driveways (DW:2)</option>
                  <option value="SW:1">Acera (SW)</option>
                  <option value="SW:2">2 Aceras (SW:2)</option>
                  <option value="SW:1,DW:1">SW + DW</option>
                  <option value="DW:1,RD:1">DW + RD (Calle)</option>
                  <option value="SW:1,RD:1">SW + RD (Calle)</option>
                  <option value="SW:1,DW:1,RD:1">SW + DW + RD</option>
                  <option value="RD:1">Road Bore (RD)</option>
                  <option value="RD:2">Road Bore 2 (RD:2)</option>
                  {o.bore_type && !['N', 'DW:1', 'DW:2', 'SW:1', 'SW:2', 'SW:1,DW:1', 'DW:1,RD:1', 'SW:1,RD:1', 'SW:1,DW:1,RD:1', 'RD:1', 'RD:2'].includes(o.bore_type) && (
                    <option value={o.bore_type}>{o.bore_type}</option>
                  )}
                </select>
              </div>

              {/* Fila 4: Teléfono del Cliente (formato (XXX) XXX-XXXX y color neutro) e Iconos de Notas / Remarks */}
              <div className="flex items-center gap-1.5 text-[10px] pt-0.5">
                {/* Teléfono del Cliente */}
                <div className="flex items-center gap-1.5 bg-[#0b1017] border border-white/10 rounded-lg px-2 py-0.5 shrink-0 w-[130px]" title="Teléfono del cliente">
                  <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="(000) 000-0000"
                    value={(() => {
                      const raw = String(o.phone || '').replace(/\D/g, '');
                      const d = (raw.length === 11 && raw.startsWith('1') ? raw.slice(1) : raw).slice(0, 10);
                      if (!d) return '';
                      if (d.length <= 3) return d;
                      if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
                      return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
                    })()}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '');
                      const clean = (digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits).slice(0, 10);
                      updateOrderField(idx, 'phone', clean);
                    }}
                    className="w-full bg-transparent text-slate-200 font-mono text-[10.5px] font-semibold focus:outline-none placeholder-slate-600"
                  />
                </div>

                {/* Badges de Campo: Solo Iconos de lo detectado con Modal Informativo al pulsar */}
                <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
                  {getOrderFieldBadges(o).map((badge) => {
                    if (badge.type === 'priority') {
                      return (
                        <button
                          key={badge.key}
                          type="button"
                          onClick={() => setBadgeModalData({ badgeKey: badge.key, badge, order: o, orderIndex: idx })}
                          className="h-6 w-6 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/50 flex items-center justify-center text-[12px] cursor-pointer transition active:scale-90 shadow-xs shrink-0"
                          title="🔴 Trabajo Prioritario (Toca para ver deducción o alternar)"
                        >
                          <span>🔴</span>
                        </button>
                      );
                    }
                    if (badge.type === 'note') {
                      return (
                        <button
                          key={badge.key}
                          type="button"
                          onClick={() => setBadgeModalData({ badgeKey: badge.key, badge, order: o, orderIndex: idx })}
                          className="h-6 px-1.5 rounded-lg bg-[#0b1017] hover:bg-white/10 border border-white/10 text-slate-300 text-[10px] flex items-center gap-1 max-w-[130px] sm:max-w-[160px] truncate shadow-xs shrink-0 cursor-pointer transition active:scale-95"
                          title={`📝 Observaciones de Despacho: ${badge.text} (Toca para ver detalle)`}
                        >
                          <span className="shrink-0 text-[11px]">📝</span>
                          <span className="truncate font-mono text-[9px] text-slate-300">{badge.text}</span>
                        </button>
                      );
                    }
                    return (
                      <button
                        key={badge.key}
                        type="button"
                        onClick={() => setBadgeModalData({ badgeKey: badge.key, badge, order: o, orderIndex: idx })}
                        className={`h-6 w-6 rounded-lg border flex items-center justify-center text-[12px] select-none shadow-xs shrink-0 cursor-pointer hover:scale-110 active:scale-90 transition ${
                          badge.key === 'access-free'
                            ? 'bg-emerald-500/15 border-emerald-500/30 hover:bg-emerald-500/25'
                            : badge.key === 'access-call'
                            ? 'bg-cyan-500/15 border-cyan-500/30 hover:bg-cyan-500/25'
                            : badge.key === 'access-dog'
                            ? 'bg-rose-500/15 border-rose-500/30 hover:bg-rose-500/25'
                            : badge.key === 'access-gate'
                            ? 'bg-amber-500/15 border-amber-500/30 hover:bg-amber-500/25'
                            : badge.key === 'access-rqhm'
                            ? 'bg-blue-500/15 border-blue-500/30 hover:bg-blue-500/25'
                            : badge.key === 'neighbor-crossing'
                            ? 'bg-purple-500/15 border-purple-500/30 hover:bg-purple-500/25'
                            : badge.key === 'obs-landsc'
                            ? 'bg-emerald-600/15 border-emerald-600/30 hover:bg-emerald-600/25'
                            : badge.key === 'obs-sprklr'
                            ? 'bg-sky-500/15 border-sky-500/30 hover:bg-sky-500/25'
                            : badge.key === 'temp-cable'
                            ? 'bg-amber-600/15 border-amber-600/30 hover:bg-amber-600/25'
                            : badge.key === 'obs-privlite'
                            ? 'bg-indigo-500/15 border-indigo-500/30 hover:bg-indigo-500/25'
                            : 'bg-white/5 border-white/10 hover:bg-white/10'
                        }`}
                        title={`${badge.icon} ${badge.text} (Toca para ver detalles y deducción de IA)`}
                      >
                        <span>{badge.icon}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
        </div>
      </div>
    );
  }
}
