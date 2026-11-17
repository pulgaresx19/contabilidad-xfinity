import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Camera, Check, CheckCheck, X, Phone, MessageSquare, MapPin, Share2, Clock, Copy,
  CheckCircle2, AlertCircle, Plus, Sparkles, AlertTriangle, Shield,
  SlidersHorizontal, Edit3, Minus, DollarSign, Calendar, ChevronLeft, ChevronRight, Pencil, Info,
  Image as ImageIcon, Map, List, Navigation, Trash2, ExternalLink, RotateCcw,
  FileText, FilePlus
} from 'lucide-react';
import AddJobModal from './AddJobModal';
import EditJobModal from './EditJobModal';
import ShareReportModal from './ShareReportModal';
import DayMapView from './DayMapView';
import UberDriverView from './UberDriverView';
import LiveCameraModal from './LiveCameraModal';
import { stampPhotoWithWatermark } from '../utils/watermark';
import { getLocalDateStr, normalizeDateStr, formatDateFriendly } from '../utils/dateUtils';
import { getCustomerSmsUrl, formatPhoneDisplay } from '../utils/smsUtils';
import { getOrderRemark, getOrderFieldBadges } from '../utils/remarkUtils';
import ZoomableImageViewer from './ZoomableImageViewer';

export default function TodayView({ 
  orders, 
  summaryData, 
  onOpenScan, 
  onOpenPhotos, 
  onOrderUpdated, 
  onUpdateOrders,
  viewMode: propViewMode,
  hideModeToggle = false,
  focusDateRequest = null,
  techName = ''
}) {
  // Uses local device time (ET/CT/MT/PT) - never jumps to tomorrow in late evening hours
  const todayReal = getLocalDateStr();
  
  // Find which date to display by default:
  // If today has orders, start on today.
  // If not, find the most recent order's date, or default to today.
  const [activeDate, setActiveDate] = useState(() => {
    const hasToday = orders.some(o => normalizeDateStr(o.work_date) === todayReal);
    if (hasToday) return todayReal;
    if (orders.length > 0) {
      // Return the most recent order's date
      const sorted = [...orders].sort((a, b) => normalizeDateStr(b.work_date).localeCompare(normalizeDateStr(a.work_date)));
      return normalizeDateStr(sorted[0].work_date) || todayReal;
    }
    return todayReal;
  });

  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'Pendiente' | 'Completado' | 'No Realizado'

  // Honor initial-load intent once async IndexedDB orders finish loading
  const hasAutoFocusedInitialRef = useRef(orders.length > 0);
  useEffect(() => {
    if (!hasAutoFocusedInitialRef.current && orders.length > 0 && !focusDateRequest?.date) {
      hasAutoFocusedInitialRef.current = true;
      const hasToday = orders.some(o => normalizeDateStr(o.work_date) === todayReal);
      if (!hasToday) {
        const sorted = [...orders].sort((a, b) =>
          normalizeDateStr(b.work_date).localeCompare(normalizeDateStr(a.work_date))
        );
        const recent = normalizeDateStr(sorted[0]?.work_date);
        if (recent) setActiveDate(recent);
      }
    }
  }, [orders, todayReal, focusDateRequest]);

  // Auto-switch to the scanned sheet date when confirming scanned orders
  useEffect(() => {
    if (focusDateRequest?.date) {
      hasAutoFocusedInitialRef.current = true;
      const target = normalizeDateStr(focusDateRequest.date);
      if (target) {
        setActiveDate(target);
        setStatusFilter('ALL');
      }
    }
  }, [focusDateRequest]);
  const [internalViewMode, setInternalViewMode] = useState(() => {
    return propViewMode || localStorage.getItem('xfinity_view_mode') || 'classic';
  });
  const viewMode = propViewMode || internalViewMode;
  const setViewMode = (mode) => {
    setInternalViewMode(mode);
    try {
      localStorage.setItem('xfinity_view_mode', mode);
    } catch (e) {}
  };
  const [sharingId, setSharingId] = useState(null);
  const [localSharedMap, setLocalSharedMap] = useState({});
  const [cancelModalOrder, setCancelModalOrder] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelPhotoFiles, setCancelPhotoFiles] = useState([]);
  const [cancelPhotoPreviews, setCancelPhotoPreviews] = useState([]);
  const [savingCancel, setSavingCancel] = useState(false);
  const [cancelDetailOrder, setCancelDetailOrder] = useState(null);
  const [confirmingReopen, setConfirmingReopen] = useState(false);
  const [cancelDetailPhotos, setCancelDetailPhotos] = useState([]);
  const [loadingCancelPhotos, setLoadingCancelPhotos] = useState(false);
  const [isLiveCameraOpenForCancel, setIsLiveCameraOpenForCancel] = useState(false);
  const [isAddJobOpen, setIsAddJobOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [editModalInitialMode, setEditModalInitialMode] = useState('view');
  const [targetFocusOrderId, setTargetFocusOrderId] = useState(null);

  // WhatsApp Share Modal State (Texto Editable + Fotos Todo en Uno)
  const [shareModalOrder, setShareModalOrder] = useState(null);
  const [shareOrderPhotos, setShareOrderPhotos] = useState([]);
  const [loadingSharePhotos, setLoadingSharePhotos] = useState(false);
  const [shareReportText, setShareReportText] = useState('');
  const [sharingReport, setSharingReport] = useState(false);
  const [copiedShareText, setCopiedShareText] = useState(false);
  const [previewFullPhoto, setPreviewFullPhoto] = useState(null);

  // Manual Price Adjustment Modal State
  const [adjustModalOrder, setAdjustModalOrder] = useState(null);
  const [adjustType, setAdjustType] = useState('add'); // 'add' | 'sub'
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [savingAdjust, setSavingAdjust] = useState(false);

  // Dispatch Sheet Photo State for the active day
  const [daySheetPhoto, setDaySheetPhoto] = useState(null);
  const [selectedSheetModal, setSelectedSheetModal] = useState(null);
  const [uploadingSheet, setUploadingSheet] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetch(`/api/dispatch-sheets/by-date/${encodeURIComponent(activeDate)}`)
      .then(r => r.ok ? r.json() : null)
      .then(sheet => {
        if (isMounted) setDaySheetPhoto(sheet);
      })
      .catch(() => {
        if (isMounted) setDaySheetPhoto(null);
      });
    return () => { isMounted = false; };
  }, [activeDate]);

  const handleUploadDaySheet = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingSheet(true);
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result;
        const res = await fetch('/api/dispatch-sheets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sheet_date: activeDate,
            filename: `sheet-${Date.now()}.jpg`,
            original_name: file.name || 'sheet.jpg',
            photo_data: base64,
            orders_count: dayOrders.length
          })
        });
        if (res.ok) {
          const updated = await fetch(`/api/dispatch-sheets/by-date/${encodeURIComponent(activeDate)}`).then(r => r.json());
          setDaySheetPhoto(updated);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      alert('Error subiendo hoja: ' + err.message);
    } finally {
      setUploadingSheet(false);
      e.target.value = '';
    }
  };

  // 1. FILTER ORDERS EXCLUSIVELY FOR THE ACTIVE DAY & SORT BY ROUTE_ORDER
  const dayOrders = useMemo(() => {
    return orders
      .filter(o => normalizeDateStr(o.work_date) === activeDate)
      .sort((a, b) => {
        const orderA = Number(a.route_order) > 0 ? Number(a.route_order) : 9999;
        const orderB = Number(b.route_order) > 0 ? Number(b.route_order) : 9999;
        if (orderA !== orderB) return orderA - orderB;
        return (Number(a.id) || 0) - (Number(b.id) || 0);
      });
  }, [orders, activeDate]);
  const dayPending = dayOrders.filter(o => o.status === 'Pendiente');
  const dayCompleted = dayOrders.filter(o => o.status === 'Completado');
  const dayCancelled = dayOrders.filter(o => o.status === 'No Realizado');
  const dayEarnings = dayCompleted.reduce((sum, o) => sum + (o.rate_calculated || 0), 0);
  const dayFeet = dayCompleted.reduce((sum, o) => sum + (o.drop_footage || 0), 0);

  // Filtered by status chip
  const visibleOrders = dayOrders.filter(o => {
    if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
    return true;
  });

  // Base calculation without manual adjustment
  const getOrderBaseCalculation = (order) => {
    if (!order) return { base: 100, dwBonus: 0, footageBonus: 0, autoSubtotal: 100 };
    let base = 100;
    let dwBonus = (order.bore_type && order.bore_type.includes('DW')) ? 30 : 0;
    let footageBonus = 0;
    if (order.drop_footage > 300) {
      const extraBlocks = Math.floor((order.drop_footage - 300) / 100);
      if (extraBlocks > 0) footageBonus = extraBlocks * 25;
    }
    const autoSubtotal = base + dwBonus + footageBonus;
    return { base, dwBonus, footageBonus, autoSubtotal };
  };

  const openAdjustModal = (order) => {
    setAdjustModalOrder(order);
    const currentAdj = order.manual_adjustment || 0;
    if (currentAdj < 0) {
      setAdjustType('sub');
      setAdjustAmount(String(Math.abs(currentAdj)));
    } else if (currentAdj > 0) {
      setAdjustType('add');
      setAdjustAmount(String(currentAdj));
    } else {
      setAdjustType('add');
      setAdjustAmount('');
    }
    setAdjustReason(order.adjustment_reason || '');
  };

  const handleSaveAdjustment = async () => {
    if (!adjustModalOrder) return;
    setSavingAdjust(true);

    const { autoSubtotal } = getOrderBaseCalculation(adjustModalOrder);
    const rawAmt = parseFloat(adjustAmount) || 0;
    const finalAdjustment = adjustType === 'sub' ? -Math.abs(rawAmt) : Math.abs(rawAmt);
    const finalRate = Math.max(0, autoSubtotal + finalAdjustment);

    try {
      const res = await fetch(`/api/orders/${adjustModalOrder.id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rate_calculated: finalRate,
          manual_adjustment: finalAdjustment,
          adjustment_reason: adjustReason.trim()
        })
      });

      if (res.ok) {
        onOrderUpdated();
        setAdjustModalOrder(null);
      } else {
        const err = await res.json();
        alert('Error: ' + err.error);
      }
    } catch (err) {
      alert('Error guardando ajuste: ' + err.message);
    } finally {
      setSavingAdjust(false);
    }
  };

  const handleResetAdjustment = async () => {
    if (!adjustModalOrder) return;
    const { autoSubtotal } = getOrderBaseCalculation(adjustModalOrder);
    setSavingAdjust(true);

    try {
      const res = await fetch(`/api/orders/${adjustModalOrder.id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rate_calculated: autoSubtotal,
          manual_adjustment: 0,
          adjustment_reason: ''
        })
      });

      if (res.ok) {
        onOrderUpdated();
        setAdjustModalOrder(null);
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSavingAdjust(false);
    }
  };

  // Date navigation helpers
  const shiftDay = (days) => {
    const [y, m, d] = activeDate.split('-');
    // Noon avoids daylight saving time boundary skips
    const current = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), 12, 0, 0);
    current.setDate(current.getDate() + days);
    const newY = current.getFullYear();
    const newM = String(current.getMonth() + 1).padStart(2, '0');
    const newD = String(current.getDate()).padStart(2, '0');
    setActiveDate(`${newY}-${newM}-${newD}`);
  };

  // Mark order as completed (requires at least 1 work photo evidence)
  const handleMarkCompleted = async (order) => {
    const photosCount = (order.work_photos_count !== undefined ? order.work_photos_count : order.photos_count) || 0;
    if (photosCount === 0) {
      onOpenPhotos(order);
      return;
    }

    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...order, status: 'Completado', cancel_reason: '' })
      });
      if (res.ok) {
        onOrderUpdated();
        // Siguiente paso automático: abrir compartir por WhatsApp
        openShareModal({ ...order, status: 'Completado' });
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // Open modal to mark as No Realizado
  const openCancelModal = (order) => {
    setCancelModalOrder(order);
    setCancelReason('');
    setCancelPhotoFiles([]);
    setCancelPhotoPreviews([]);
  };

  const handleCancelPhotoSelect = async (e) => {
    const rawFiles = Array.from(e.target.files || []);
    if (rawFiles.length === 0) return;
    const files = await Promise.all(
      rawFiles.map(f => stampPhotoWithWatermark(f, {
        fallbackAddress: cancelModalOrder?.address,
        fallbackCity: cancelModalOrder?.city,
        fallbackZip: cancelModalOrder?.zip_code,
        fallbackLat: cancelModalOrder?.latitude,
        fallbackLng: cancelModalOrder?.longitude
      }))
    );
    const newPreviews = files.map(f => URL.createObjectURL(f));
    setCancelPhotoFiles(prev => [...prev, ...files]);
    setCancelPhotoPreviews(prev => [...prev, ...newPreviews]);
    e.target.value = '';
  };

  const handleRemoveCancelPhoto = (index) => {
    setCancelPhotoFiles(prev => prev.filter((_, i) => i !== index));
    setCancelPhotoPreviews(prev => {
      if (prev[index]) URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Confirm No Realizado
  const handleConfirmCancelled = async (andShareWhatsApp = false) => {
    if (!cancelModalOrder) return;
    setSavingCancel(true);
    try {
      const res = await fetch(`/api/orders/${cancelModalOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...cancelModalOrder, 
          status: 'No Realizado', 
          cancel_reason: cancelReason.trim() || 'No realizado por inconveniente en la propiedad' 
        })
      });

      if (res.ok) {
        let uploadedPhotos = [];
        if (cancelPhotoFiles.length > 0) {
          const formData = new FormData();
          formData.append('category', 'Constancia No Realizado');
          cancelPhotoFiles.forEach(f => formData.append('photos', f));
          const photoRes = await fetch(`/api/orders/${cancelModalOrder.id}/photos`, {
            method: 'POST',
            body: formData
          });
          if (photoRes.ok) {
            const photoData = await photoRes.json();
            uploadedPhotos = photoData.photos || [];
          }
        }

        const targetOrder = {
          ...cancelModalOrder,
          status: 'No Realizado',
          cancel_reason: cancelReason.trim() || 'No realizado por inconveniente en la propiedad',
          photos: uploadedPhotos.length > 0 ? uploadedPhotos : cancelModalOrder.photos
        };

        onOrderUpdated();
        setCancelModalOrder(null);
        setCancelPhotoFiles([]);
        setCancelPhotoPreviews([]);

        if (andShareWhatsApp) {
          setShareModalOrder(targetOrder);
        }
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSavingCancel(false);
    }
  };

  // Open detail modal for cancelled order
  const filterCancelPhotos = (photos) => {
    if (!Array.isArray(photos)) return [];
    const specific = photos.filter(p => p.category === 'Constancia No Realizado' || p.category === 'Motivo' || p.category === 'Obstáculo');
    return specific.length > 0 ? specific : photos;
  };

  const openCancelDetail = async (order) => {
    setCancelDetailOrder(order);
    setCancelDetailPhotos([]);
    setLoadingCancelPhotos(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`);
      if (res.ok) {
        const full = await res.json();
        setCancelDetailPhotos(filterCancelPhotos(full.photos));
      }
    } catch (err) {
      console.error('Error fetching cancel detail photos:', err);
    } finally {
      setLoadingCancelPhotos(false);
    }
  };

  const handleLivePhotoSavedForCancel = async (file) => {
    if (!cancelDetailOrder) return;
    try {
      const formData = new FormData();
      formData.append('category', 'Constancia No Realizado');
      formData.append('photos', file);
      const res = await fetch(`/api/orders/${cancelDetailOrder.id}/photos`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const updatedRes = await fetch(`/api/orders/${cancelDetailOrder.id}`);
        if (updatedRes.ok) {
          const updated = await updatedRes.json();
          setCancelDetailPhotos(filterCancelPhotos(updated.photos));
          onOrderUpdated();
        }
      }
    } catch (err) {
      alert('Error al guardar foto de obstáculo: ' + err.message);
    }
  };

  const handleDeleteCancelDetailPhoto = async (photoId) => {
    if (!confirm('¿Eliminar esta foto de constancia?')) return;
    try {
      const res = await fetch(`/api/photos/${photoId}`, { method: 'DELETE' });
      if (res.ok) {
        const updatedRes = await fetch(`/api/orders/${cancelDetailOrder.id}`);
        if (updatedRes.ok) {
          const updated = await updatedRes.json();
          setCancelDetailPhotos(filterCancelPhotos(updated.photos));
          onOrderUpdated();
        }
      }
    } catch (err) {
      alert('Error eliminando foto: ' + err.message);
    }
  };

  const handleAddPhotoToCancelled = async (e) => {
    const rawFiles = Array.from(e.target.files || []);
    if (rawFiles.length === 0 || !cancelDetailOrder) return;
    try {
      const stampedFiles = await Promise.all(
        rawFiles.map(f => stampPhotoWithWatermark(f, {
          fallbackAddress: cancelDetailOrder?.address,
          fallbackCity: cancelDetailOrder?.city,
          fallbackZip: cancelDetailOrder?.zip_code,
          fallbackLat: cancelDetailOrder?.latitude,
          fallbackLng: cancelDetailOrder?.longitude
        }))
      );
      const formData = new FormData();
      formData.append('category', 'Constancia No Realizado');
      stampedFiles.forEach(f => formData.append('photos', f));
      const res = await fetch(`/api/orders/${cancelDetailOrder.id}/photos`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const updatedRes = await fetch(`/api/orders/${cancelDetailOrder.id}`);
        if (updatedRes.ok) {
          const updated = await updatedRes.json();
          setCancelDetailPhotos(filterCancelPhotos(updated.photos));
          onOrderUpdated();
        }
      }
    } catch (err) {
      alert('Error al subir foto: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  // Re-open cancelled order desde cero (eliminando fotos y reporte)
  const handleReopenOrder = async (order) => {
    try {
      const res = await fetch(`/api/orders/${order.id}/reactivate`, {
        method: 'POST'
      });
      if (res.ok) {
        setLocalSharedMap((prev) => {
          const next = { ...prev };
          delete next[order.id];
          return next;
        });
        setCancelDetailOrder(null);
        setConfirmingReopen(false);
        if (onOrderUpdated) await onOrderUpdated();
      } else {
        const err = await res.json().catch(() => ({}));
        alert('Error al reactivar orden: ' + (err.error || res.statusText));
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // Funciones para Reporte WhatsApp (Texto Editable + Fotos Todo en Uno)
  const markOrderAsShared = (order) => {
    order.whatsapp_shared = 1;
    order.whatsapp_shared_at = new Date().toISOString();
    setLocalSharedMap((prev) => ({ ...prev, [order.id]: true }));

    fetch(`/api/orders/${order.id}/whatsapp-shared`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shared: true })
    }).then(() => {
      if (onOrderUpdated) onOrderUpdated();
    }).catch((err) => {
      console.error('Error marking as shared:', err);
    });
  };

  const getReportText = (order) => {
    const isCancelled = order.status === 'No Realizado' || order.status === 'Cancelado';
    if (isCancelled) {
      return `🚫 *CONSTANCIA DE TRABAJO NO REALIZADO*
📅 *Fecha:* ${order.work_date}
🔢 *Orden #:* ${order.job_id}
📍 *Dirección:* ${order.address}${order.city ? `, ${order.city}` : ''}${order.phone ? `\n📞 *Teléfono:* ${order.phone}` : ''}
❌ *Estado:* NO REALIZADO
⚠️ *Motivo / Inconveniente:* ${order.cancel_reason || 'Inconveniente en la propiedad'}
👷 *Técnico:* Javier (P0G1)
${order.drop_footage ? `📏 *Drop Previsto:* ${order.drop_footage} ft (${order.cable_type || 'RG-6'})\n` : ''}📸 *Evidencia:* Constancia fotográfica adjunta`;
    }

    const hasDriveway = Boolean(
      order.bore_type && (
        order.bore_type.includes('DW') || 
        order.bore_type.toLowerCase().includes('driveway') || 
        order.bore_type === 'Y'
      )
    );

    return `📋 *REPORTE DE TRABAJO*
📅 *Fecha:* ${order.work_date}
🔢 *Orden #:* ${order.job_id}
📍 *Dirección:* ${order.address}${order.city ? `, ${order.city}` : ''}
📏 *Pies / Drop:* ${order.drop_footage} ft (${order.cable_type || 'RG-6'})
🚗 *Driveway:* ${hasDriveway ? 'Sí' : 'No'}
✅ *Estado:* Completado y Verificado`;
  };

  const openShareModal = async (order) => {
    setShareModalOrder(order);
    const initialText = getReportText(order);
    setShareReportText(initialText);
    setCopiedShareText(false);
    setLoadingSharePhotos(true);

    try {
      const res = await fetch(`/api/orders/${order.id}`);
      const fullOrder = await res.json();
      const isCancelled = order.status === 'No Realizado' || order.status === 'Cancelado';
      const photos = (fullOrder.photos || []).filter((p) => 
        isCancelled ? p.category === 'Constancia No Realizado' : p.category !== 'Constancia No Realizado'
      );
      setShareOrderPhotos(photos.length > 0 ? photos : (isCancelled ? (fullOrder.photos || []) : []));
    } catch (e) {
      setShareOrderPhotos([]);
    } finally {
      setLoadingSharePhotos(false);
    }
  };

  const dataUrlToBlob = (dataUrl) => {
    try {
      const parts = dataUrl.split(',');
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
    } catch (e) {
      console.error('Error in dataUrlToBlob:', e);
      return null;
    }
  };

  // Enviar Reporte Unificado (Texto Editado + Todas las Fotos de una)
  const handleSendReportAndPhotos = async () => {
    if (!shareModalOrder) return;
    setSharingReport(true);

    const orderToShare = shareModalOrder;
    const textToSend = (shareReportText || '').trim() || getReportText(orderToShare);

    // 1. Marcar inmediatamente como reportado en estado y base de datos
    markOrderAsShared(orderToShare);

    // 2. Guardar texto en el portapapeles como respaldo de seguridad
    try {
      await navigator.clipboard.writeText(textToSend);
      setCopiedShareText(true);
    } catch (e) {}

    try {
      // 3. Preparar archivos de fotos (tanto offline dataURL como fetch)
      const filesToShare = [];
      if (shareOrderPhotos.length > 0) {
        for (let i = 0; i < shareOrderPhotos.length; i++) {
          const p = shareOrderPhotos[i];
          try {
            let blob = null;
            if (p.photo_data && typeof p.photo_data === 'string' && p.photo_data.startsWith('data:')) {
              blob = dataUrlToBlob(p.photo_data);
            }
            if (!blob && p.filename) {
              const imgRes = await fetch(`/uploads/${p.filename}`);
              if (imgRes.ok) {
                blob = await imgRes.blob();
              }
            }
            if (blob) {
              const cleanCat = (p.category || 'evidencia').replace(/[^a-zA-Z0-9]/g, '_');
              const file = new File(
                [blob], 
                `Job_${orderToShare.job_id}_${i + 1}_${cleanCat}.jpg`, 
                { type: blob.type || 'image/jpeg' }
              );
              filesToShare.push(file);
            }
          } catch (errPhoto) {
            console.error('Error preparing photo file for share:', errPhoto);
          }
        }
      }

      // 4. Compartir nativamente con Web Share (archivos + texto juntos)
      if (filesToShare.length > 0 && navigator.canShare && navigator.canShare({ files: filesToShare })) {
        await navigator.share({
          title: `Reporte #${orderToShare.job_id}`,
          text: textToSend,
          files: filesToShare
        });
        setShareModalOrder(null);
        return;
      }

      // 5. Compartir nativamente solo texto si no hay fotos
      if (filesToShare.length === 0 && navigator.share && navigator.canShare && navigator.canShare({ text: textToSend })) {
        await navigator.share({
          title: `Reporte #${orderToShare.job_id}`,
          text: textToSend
        });
        setShareModalOrder(null);
        return;
      }

      // 6. Si Web Share no está disponible (ej. navegador de escritorio): abrir WhatsApp
      const waUrl = `https://wa.me/?text=${encodeURIComponent(textToSend)}`;
      window.open(waUrl, '_blank');
      setShareModalOrder(null);
    } catch (err) {
      if (err.name !== 'AbortError') {
        const waUrl = `https://wa.me/?text=${encodeURIComponent(textToSend)}`;
        window.open(waUrl, '_blank');
        setShareModalOrder(null);
      }
    } finally {
      setSharingReport(false);
    }
  };

  const isViewingToday = activeDate === todayReal;

  return (
    <div className={`w-full ${viewMode === 'uber' ? 'h-full flex flex-col min-h-0' : ''}`}>
      {viewMode === 'uber' ? (
        <UberDriverView
          orders={dayOrders}
          activeDate={activeDate}
          isViewingToday={isViewingToday}
          targetFocusOrderId={targetFocusOrderId}
          onClearTargetFocus={() => setTargetFocusOrderId(null)}
          onShiftDay={shiftDay}
          onGoToToday={() => setActiveDate(todayReal)}
          onSelectDate={(newDate) => setActiveDate(newDate)}
          onOpenScan={onOpenScan}
          onOpenAddJob={() => setIsAddJobOpen(true)}
          onOpenPhotos={onOpenPhotos}
          onMarkCompleted={handleMarkCompleted}
          onOpenCancelModal={(ord) => onOpenPhotos ? onOpenPhotos(ord, { initialCancel: true }) : openCancelModal(ord)}
          onOpenCancelDetail={(ord) => onOpenPhotos ? onOpenPhotos(ord) : openCancelDetail(ord)}
          onOpenEditModal={(ord, mode = 'view') => {
            setEditModalInitialMode(mode);
            setEditingOrder(ord);
          }}
          onOpenAdjustModal={openAdjustModal}
          onOpenShareModal={openShareModal}
          localSharedMap={localSharedMap}
          onOrderUpdated={onOrderUpdated}
          onUpdateOrders={onUpdateOrders}
          onSwitchToClassic={() => setViewMode('classic')}
          techName={techName}
        />
      ) : (
        <div className="space-y-3.5 w-full">
          {/* Botón flotante para regresar al Modo Uber */}
          {!hideModeToggle && (
            <button
              type="button"
              onClick={() => setViewMode('uber')}
              className="w-full py-2.5 px-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs rounded-2xl shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 transition active:scale-[0.98]"
            >
              <Map className="h-4 w-4 stroke-[2.5]" />
              <span>Volver al Modo Mapa Uber (Interactivo)</span>
            </button>
          )}

          {/* 1. NAVEGADOR DE FECHA & HERO CARD DE LA JORNADA (COCKPIT HUD) */}
          <div className="bg-[#0f1722]/95 border border-white/10 rounded-3xl p-4 shadow-xl space-y-3">
            {/* Barra superior de Fecha de la Jornada */}
            <div className="flex items-center justify-between bg-[#131b26] px-3 py-2 rounded-2xl border border-white/8">
              <button
                type="button"
                onClick={() => shiftDay(-1)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition"
                title="Día anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-cyan-400" />
                <span className="text-xs font-black text-white font-mono">
                  {isViewingToday ? `Hoy (${formatDateFriendly(activeDate)})` : formatDateFriendly(activeDate)}
                </span>
                {!isViewingToday && (
                  <button
                    type="button"
                    onClick={() => setActiveDate(todayReal)}
                    className="text-[9px] bg-cyan-950 text-cyan-300 border border-cyan-800 px-1.5 py-0.2 rounded-md font-bold hover:bg-cyan-900 cursor-pointer"
                  >
                    Ir a Hoy
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => shiftDay(1)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition"
                title="Día siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Métricas de la Jornada de ese día */}
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block">
                    {isViewingToday ? 'Jornada de Hoy' : 'Producción del Día'}
                  </span>
                  {/* Micro-icono hoja de despacho del día (exactamente del mismo tamaño) */}
                  {daySheetPhoto ? (
                    <button
                      type="button"
                      onClick={() => setSelectedSheetModal(daySheetPhoto)}
                      className="h-4.5 w-4.5 rounded-md bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/35 flex items-center justify-center transition active:scale-95 shadow-2xs cursor-pointer shrink-0"
                      title="Ver hoja de despacho original del día"
                    >
                      <FileText className="h-2.5 w-2.5 stroke-[2.2]" />
                    </button>
                  ) : (
                    <label
                      className="h-4.5 w-4.5 rounded-md bg-slate-800/60 hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 border border-white/10 flex items-center justify-center transition cursor-pointer active:scale-95 shrink-0"
                      title="Adjuntar foto de la hoja de despacho del día (opcional)"
                    >
                      <FilePlus className="h-2.5 w-2.5 stroke-[2]" />
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={handleUploadDaySheet}
                        disabled={uploadingSheet}
                      />
                    </label>
                  )}
                </div>
                <h2 className="text-3xl font-black text-white font-mono mt-0.5 drop-shadow-[0_0_10px_rgba(52,211,153,0.3)]">
                  ${dayEarnings.toFixed(2)}
                </h2>
                <span className="text-[11px] font-bold text-amber-300 font-mono block mt-0.5">
                  {Math.round(dayFeet)} ft instalados
                </span>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-400 block font-semibold">Progreso del Día</span>
                <span className="text-xs font-bold text-slate-200 block">
                  <strong className="text-emerald-400 text-sm font-black">{dayCompleted.length}</strong> de {dayOrders.length} hechos
                </span>
                {dayPending.length > 0 && (
                  <span className="text-[10px] text-amber-400 block font-bold mt-0.5">
                    {dayPending.length} pendientes
                  </span>
                )}
              </div>
            </div>

            {/* Barra de Progreso del Día */}
            <div className="w-full bg-[#0a0f18] h-2 rounded-full overflow-hidden border border-white/8">
              <div 
                className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full rounded-full transition-all duration-500 shadow-sm shadow-emerald-500/20"
                style={{ width: `${dayOrders.length > 0 ? (dayCompleted.length / dayOrders.length) * 100 : 0}%` }}
              />
            </div>

            {/* Botones de Acción: Escanear Foto & Añadir Trabajo */}
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <button
                onClick={onOpenScan}
                className="py-2.5 px-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-extrabold text-xs rounded-2xl shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
              >
                <Camera className="h-4 w-4 stroke-[2.5]" />
                <span>Escanear Foto</span>
              </button>

              <button
                onClick={() => setIsAddJobOpen(true)}
                className="py-2.5 px-3 bg-[#182332] hover:bg-[#243140] text-slate-100 border border-white/10 font-extrabold text-xs rounded-2xl flex items-center justify-center gap-1.5 transition active:scale-[0.98] shadow-sm"
              >
                <Plus className="h-4 w-4 stroke-[3] text-cyan-400" />
                <span>Añadir Trabajo</span>
              </button>
            </div>
          </div>

      {/* 2. CHIPS DE FILTRO DE ESTADO (COCKPIT SEGMENTS) */}
      <div className="grid grid-cols-4 gap-1 bg-[#0f1722]/90 p-1 rounded-2xl border border-white/10 text-[10px] font-bold text-center shadow-md">
        <button
          onClick={() => setStatusFilter('ALL')}
          className={`py-1.5 rounded-xl transition ${statusFilter === 'ALL' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm font-black' : 'text-slate-400 hover:text-white'}`}
        >
          Todos ({dayOrders.length})
        </button>
        <button
          onClick={() => setStatusFilter('Pendiente')}
          className={`py-1.5 rounded-xl transition ${statusFilter === 'Pendiente' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm font-black' : 'text-slate-400 hover:text-white'}`}
        >
          Pendientes ({dayPending.length})
        </button>
        <button
          onClick={() => setStatusFilter('Completado')}
          className={`py-1.5 rounded-xl transition ${statusFilter === 'Completado' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm font-black' : 'text-slate-400 hover:text-white'}`}
        >
          Hechos ({dayCompleted.length})
        </button>
        <button
          onClick={() => setStatusFilter('No Realizado')}
          className={`py-1.5 rounded-xl transition ${statusFilter === 'No Realizado' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm font-black' : 'text-slate-400 hover:text-white'}`}
        >
          Cancelados ({dayCancelled.length})
        </button>
      </div>

      {/* 3. LISTA DE TRABAJOS DEL DÍA CON NÚMEROS EN CÍRCULO */}
      {visibleOrders.length === 0 ? (
        <div className="bg-[#131b26] border border-white/10 rounded-3xl p-8 text-center space-y-3 shadow-md">
          <div className="h-12 w-12 rounded-2xl bg-slate-800/80 text-slate-400 flex items-center justify-center mx-auto border border-white/5">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-white">
              Sin trabajos en esta fecha
            </h4>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              {isViewingToday 
                ? 'No tienes trabajos registrados para hoy aún. Escanea tu hoja de despacho o añade el primer trabajo.'
                : `No hay órdenes registradas para el día ${formatDateFriendly(activeDate)}.`
              }
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibleOrders.map((order, idx) => {
            const isCompleted = order.status === 'Completado';
            const isCancelled = order.status === 'No Realizado';
            const isPending = order.status === 'Pendiente';
            const hasDrivewayBore = order.bore_type && order.bore_type.includes('DW');

            return (
              <div
                key={order.id}
                className={`bg-[#131b26] border rounded-2xl p-3.5 space-y-2.5 shadow-md select-none transition-all ${
                  isCompleted
                    ? 'border-emerald-500/35 shadow-emerald-500/5'
                    : isCancelled
                    ? 'border-rose-500/35 shadow-rose-500/5'
                    : 'border-amber-500/35 shadow-amber-500/5'
                }`}
              >
                {/* Header de la Tarjeta con Número en Círculo */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {/* Número de ítem en círculo - Tocar aquí abre directamente la edición del trabajo */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditModalInitialMode('edit');
                        setEditingOrder(order);
                      }}
                      className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-black font-mono shadow-sm flex-shrink-0 transition-transform active:scale-90 hover:scale-105 cursor-pointer select-none ${
                        isCompleted
                          ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-500/40 shadow-emerald-500/20'
                          : isCancelled
                          ? 'bg-rose-500/25 text-rose-300 border border-rose-500/50 hover:bg-rose-500/40 shadow-rose-500/20'
                          : 'bg-amber-500/25 text-amber-300 border border-amber-500/50 hover:bg-amber-500/40 shadow-amber-500/20'
                      }`}
                      title={`Ítem #${idx + 1} • Toca para editar trabajo`}
                    >
                      {idx + 1}
                    </button>

                    <span className="text-sm font-black text-cyan-400 font-mono">
                      #{order.job_id}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Medallón de Dinero Profesional / Saldo en la esquina */}
                    <div 
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border shadow-sm select-none transition-all ${
                        isCancelled
                          ? 'bg-slate-900/60 text-slate-500 border-white/5 line-through'
                          : isCompleted
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-emerald-500/10'
                          : 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-amber-500/10'
                      }`}
                      title={`Tarifa del trabajo: $${order.rate_calculated} USD`}
                    >
                      <span className={`h-4 w-4 rounded-full flex items-center justify-center text-[9.5px] font-black shadow-inner flex-shrink-0 ${
                        isCancelled
                          ? 'bg-slate-800 text-slate-500'
                          : 'bg-emerald-500 text-slate-950'
                      }`}>
                        $
                      </span>
                      <span className="text-sm sm:text-base font-black font-mono tracking-tight leading-none">
                        {order.rate_calculated}
                      </span>
                      <span className="text-[9px] font-extrabold uppercase tracking-wider opacity-60">
                        USD
                      </span>
                    </div>
                  </div>
                </div>

                {/* Dirección, Acciones (GPS, Llamar, Mensaje) y Teléfono */}
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-1.5 text-xs text-white">
                    <div className="flex items-start gap-1.5 min-w-0">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="font-bold text-white truncate">{order.address}</p>
                        <p className="text-[10px] text-slate-400">{order.city} {order.zip_code}</p>
                      </div>
                    </div>

                    {/* Grupo de Acciones: GPS, Llamar y Mensaje circulares */}
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${order.address}, ${order.city || 'Elkhart'}, IN ${order.zip_code || ''}`)}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="w-7 h-7 rounded-full bg-slate-800/80 hover:bg-slate-700/80 text-cyan-400 hover:text-cyan-300 border border-white/10 flex items-center justify-center active:scale-95 transition shadow-xs"
                        title="Abrir navegación GPS en Google Maps"
                      >
                        <Navigation className="h-3.5 w-3.5" />
                      </a>
                      {order.phone && (
                        <>
                          <a 
                            href={`tel:${order.phone}`} 
                            onClick={(e) => e.stopPropagation()}
                            className="w-7 h-7 rounded-full bg-slate-800/80 hover:bg-slate-700/80 text-cyan-400 hover:text-cyan-300 border border-white/10 flex items-center justify-center transition active:scale-95 shadow-xs"
                            title={`Llamar: ${order.phone}`}
                          >
                            <Phone className="h-3.5 w-3.5" />
                          </a>
                          <a
                            href={getCustomerSmsUrl(order.phone, order.address, techName || order.tech_id)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-7 h-7 rounded-full bg-slate-800/80 hover:bg-slate-700/80 text-cyan-400 hover:text-cyan-300 border border-white/10 flex items-center justify-center transition active:scale-95 shadow-xs"
                            title="Enviar SMS con aviso al cliente"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </a>
                        </>
                      )}
                    </div>
                  </div>

                  {order.phone && (
                    <div className="flex items-center gap-2 pl-5 text-[11px]">
                      <span className="font-mono text-cyan-400/90 font-bold">{formatPhoneDisplay(order.phone)}</span>
                      {order.call_first === 1 && (
                        <span className="text-[9px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded font-bold">
                          CALL FIRST
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Especificaciones Técnicas Profesionales */}
                {(() => {
                  const orderRemark = getOrderRemark(order);
                  const photosCount = (order.work_photos_count !== undefined ? order.work_photos_count : order.photos_count) || (order.photos ? order.photos.filter(p => p.category !== 'Constancia No Realizado').length : 0) || 0;
                  return (
                    <div className="flex items-center gap-1.5 text-[10px] overflow-x-auto scrollbar-none py-0.5 whitespace-nowrap">
                      {/* 1. Metraje del Drop (Siempre Primero) */}
                      <span className="shrink-0 bg-slate-800/70 px-2 py-0.5 rounded-md border border-slate-700/60 text-slate-300 text-[10px] font-mono flex items-center gap-1">
                        <span className="text-slate-400 font-sans text-[9px] uppercase tracking-wider font-semibold">Drop</span>
                        <span className="font-bold text-slate-100">{order.drop_footage || 0} ft</span>
                      </span>

                      {/* 2. Tipo de Cable (Segundo) */}
                      <span className="shrink-0 bg-slate-800/70 px-2 py-0.5 rounded-md border border-slate-700/60 text-slate-300 text-[10px] font-mono flex items-center gap-1">
                        <span className="text-slate-400 font-sans text-[9px] uppercase tracking-wider font-semibold">Cable</span>
                        <span className="font-semibold text-slate-200">{order.cable_type || 'RG-6'}</span>
                      </span>

                      {/* 3. Perforación / Driveway Bore */}
                      {hasDrivewayBore ? (
                        <span className="shrink-0 bg-slate-800/70 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700/60 text-[10px] font-medium flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                          <span>DW Bore</span>
                          <span className="text-slate-400 font-mono text-[9px]">(+$30)</span>
                        </span>
                      ) : order.bore_type && order.bore_type !== 'N' ? (
                        <span className="shrink-0 bg-slate-800/70 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700/60 text-[10px] font-mono flex items-center gap-1">
                          <span className="text-slate-400 font-sans text-[9px] uppercase tracking-wider font-semibold">Bore</span>
                          <span className="font-semibold text-slate-200">{order.bore_type}</span>
                        </span>
                      ) : null}

                      {/* 4. Bono por Metraje Largo (>300 ft) */}
                      {order.drop_footage > 300 && Math.floor((order.drop_footage - 300) / 100) > 0 && (
                        <span className="shrink-0 bg-slate-800/70 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700/60 text-[10px] font-mono font-medium flex items-center gap-1">
                          <span className="text-emerald-400 font-sans text-[9px] font-bold">+Drop</span>
                          <span className="font-bold text-slate-200">${Math.floor((order.drop_footage - 300) / 100) * 25}</span>
                        </span>
                      )}

                      {/* 5. Ajuste Manual de Tarifa */}
                      {order.manual_adjustment !== undefined && Number(order.manual_adjustment) !== 0 && (
                        <span 
                          className="shrink-0 bg-slate-800/70 px-2 py-0.5 rounded-md font-mono text-[10px] font-medium border border-slate-700/60 text-slate-300 flex items-center gap-1 shadow-2xs cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditModalInitialMode('edit');
                            setEditingOrder(order);
                          }}
                          title={`Ajuste Supervisor: ${order.manual_adjustment > 0 ? `+$${order.manual_adjustment}` : `-$${Math.abs(order.manual_adjustment)}`}${order.adjustment_reason ? ` • ${order.adjustment_reason}` : ''} (Toca para editar)`}
                        >
                          <Sparkles className="h-2.5 w-2.5 text-cyan-400 opacity-90" />
                          <span className="text-slate-200">{order.manual_adjustment > 0 ? `+$${order.manual_adjustment}` : `-$${Math.abs(order.manual_adjustment)}`}</span>
                          {order.adjustment_reason && (
                            <span className="font-normal opacity-75 text-[9px] max-w-[85px] truncate font-sans">
                              ({order.adjustment_reason})
                            </span>
                          )}
                        </span>
                      )}

                      {/* 6. Badges de Campo / Reman por Prioridad (Acceso, Cruce de Vecinos, Obstáculos, Notas) */}
                      {getOrderFieldBadges(order).map((b) => (
                        <span 
                          key={b.key}
                          className="shrink-0 bg-slate-800/70 px-2 py-0.5 rounded-md border border-slate-700/60 text-slate-300 text-[10px] font-medium flex items-center gap-1 shadow-2xs"
                          title={b.tooltip}
                        >
                          {b.icon && <span className="shrink-0">{b.icon}</span>}
                          {b.tag && <span className="text-amber-400/90 text-[9px] uppercase tracking-wider font-semibold">{b.tag}</span>}
                          <span>{b.text}</span>
                        </span>
                      ))}
                    </div>
                  );
                })()}

                {/* Barra Inferior Uniforme para TODOS los Trabajos (Pendiente / Compartir / Reportado) */}
                {(() => {
                  const photosCount = (order.work_photos_count !== undefined ? order.work_photos_count : order.photos_count) || (order.photos ? order.photos.filter(p => p.category !== 'Constancia No Realizado').length : 0) || 0;
                  const isShared = Boolean(order.whatsapp_shared || localSharedMap[order.id]);

                  return (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-2">
                      {/* 1. Esquina Izquierda: Estado del Trabajo Uniforme (Pendiente / Compartir / Reportado) */}
                      <div className="flex items-center gap-2">
                        {isCancelled ? (
                          isShared ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openShareModal(order);
                              }}
                              className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-xs cursor-pointer hover:bg-rose-500/30 transition active:scale-95 shrink-0"
                              title={`No Realizado: Reportado por WhatsApp${order.whatsapp_shared_at ? ` (${order.whatsapp_shared_at.slice(11, 16)})` : ''}. Toca para abrir.`}
                            >
                              <CheckCheck className="h-3.5 w-3.5 stroke-[2.5] text-rose-400" />
                              <span>Reportado</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openShareModal(order);
                              }}
                              className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 bg-rose-500/25 text-rose-300 border border-rose-500/60 shadow-md shadow-rose-500/30 animate-pulse cursor-pointer hover:bg-rose-500/35 transition shrink-0 active:scale-95"
                              title="No Realizado: Compartir - Toca para enviar constancia por WhatsApp"
                            >
                              <Share2 className="h-3.5 w-3.5 stroke-[2.2] text-rose-300" />
                              <span>Compartir</span>
                            </button>
                          )
                        ) : isPending ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenPhotos(order);
                            }}
                            className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 bg-amber-500/15 text-amber-300 border border-amber-500/35 shadow-xs cursor-pointer hover:bg-amber-500/25 transition active:scale-95 shrink-0"
                            title="Estado: Pendiente - Toca para abrir evidencias de trabajo"
                          >
                            <Clock className="h-3.5 w-3.5 stroke-[2.5] text-amber-400" />
                            <span>Pendiente</span>
                          </button>
                        ) : isCompleted && isShared ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openShareModal(order);
                            }}
                            className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-xs cursor-pointer hover:bg-cyan-500/30 transition active:scale-95 shrink-0"
                            title="Estado: Reportado y confirmado exitosamente. Toca para ver reporte."
                          >
                            <CheckCheck className="h-3.5 w-3.5 stroke-[2.5] text-cyan-400" />
                            <span>Reportado</span>
                          </button>
                        ) : isCompleted ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openShareModal(order);
                            }}
                            className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 bg-cyan-500/25 text-cyan-300 border border-cyan-400 shadow-md shadow-cyan-500/30 animate-pulse cursor-pointer hover:bg-cyan-500/35 transition shrink-0 active:scale-95"
                            title="Estado: Compartir - Toca para compartir reporte por WhatsApp"
                          >
                            <Share2 className="h-3.5 w-3.5 stroke-[2.2] text-cyan-300" />
                            <span>Compartir</span>
                          </button>
                        ) : null}
                      </div>

                      {/* 2. Esquina Derecha: Cápsula Uniforme de 3 botones */}
                      <div 
                        className="flex items-center gap-1 rounded-full px-2 py-1 shadow-sm shrink-0 border transition-all bg-[#182332] border-white/10"
                      >
                        {isCancelled ? (
                          <>
                            {/* 1. Botón Motivo (Ícono sin texto) */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onOpenPhotos) onOpenPhotos(order);
                                else openCancelDetail(order);
                              }}
                              className="p-1.5 rounded-full transition active:scale-90 cursor-pointer flex items-center justify-center relative text-rose-300 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 shadow-xs"
                              title={`Motivo: ${order.cancel_reason || 'Sin motivo detallado'} - Toca para ver detalle y fotos`}
                            >
                              <AlertTriangle className="h-4 w-4 text-rose-400 stroke-[2.2]" />
                              {(order.cancel_photos_count > 0 || (order.photos_count > 0 && (!order.work_photos_count || order.work_photos_count === 0))) && (
                                <span className="absolute -top-1 -right-1 px-1 min-w-[14px] h-[14px] bg-rose-500 text-slate-950 text-[8.5px] font-black rounded-full flex items-center justify-center leading-none shadow-xs">
                                  {order.cancel_photos_count || 1}
                                </span>
                              )}
                            </button>

                            {/* 2. Paso Compartir por WhatsApp (Cancelado) */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openShareModal(order);
                              }}
                              className={`p-1.5 rounded-full transition active:scale-90 cursor-pointer ${
                                isShared
                                  ? 'text-rose-400 bg-rose-500/15 border border-rose-500/30 shadow-xs'
                                  : 'text-rose-300 bg-rose-500/25 border border-rose-400 shadow-md shadow-rose-500/40 animate-pulse'
                              }`}
                              title={
                                isShared
                                  ? 'Constancia compartida por WhatsApp (Toca para volver a compartir)'
                                  : 'Toca para compartir constancia de no realizado por WhatsApp'
                              }
                            >
                              <Share2 className="h-4 w-4 stroke-[2.2]" />
                            </button>

                            {/* 3. Paso Reportado / Confirmar (Cancelado) */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openShareModal(order);
                              }}
                              className={`p-1.5 rounded-full transition active:scale-90 cursor-pointer ${
                                isShared
                                  ? 'text-rose-400 bg-rose-500/20 border border-rose-500/40 shadow-xs'
                                  : 'text-slate-500/30 border border-transparent cursor-default'
                              }`}
                              title={
                                isShared
                                  ? 'Constancia reportada y confirmada'
                                  : 'Pendiente de reportar constancia'
                              }
                            >
                              <CheckCheck className="h-4 w-4 stroke-[2.5]" />
                            </button>
                          </>
                        ) : (
                          <>
                            {/* 1. Paso Iniciar / Tirar Fotos de Evidencia */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenPhotos(order);
                              }}
                              className={`p-1.5 rounded-full transition active:scale-90 cursor-pointer flex items-center justify-center relative ${
                                isCompleted
                                  ? 'text-emerald-400 bg-emerald-500/20 border border-emerald-500/40 shadow-xs'
                                  : photosCount > 0
                                  ? 'text-emerald-400 bg-emerald-500/15 border border-emerald-500/35 animate-pulse shadow-xs'
                                  : 'text-cyan-300 bg-cyan-500/20 border border-cyan-400/80 shadow-md shadow-cyan-500/30 animate-pulse'
                              }`}
                              title={
                                isCompleted
                                  ? `Paso 1: Fotos listas (${photosCount}) y trabajo completado`
                                  : photosCount > 0
                                  ? `${photosCount} foto(s) tomada(s) - Toca para ver o agregar más`
                                  : 'Paso 1: Solicita fotos de evidencia. Toca para tomar fotos'
                              }
                            >
                              <Camera className="h-4 w-4 stroke-[2.2]" />
                              {photosCount > 0 && (
                                <span className="absolute -top-1 -right-1 px-1 min-w-[14px] h-[14px] bg-emerald-500 text-slate-950 text-[8.5px] font-black rounded-full flex items-center justify-center leading-none shadow-xs">
                                  {photosCount}
                                </span>
                              )}
                            </button>

                            {/* 2. Paso Compartir por WhatsApp */}
                            <button
                              type="button"
                              disabled={!isCompleted}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isCompleted) {
                                  openShareModal(order);
                                }
                              }}
                              className={`p-1.5 rounded-full transition active:scale-90 ${
                                isShared
                                  ? 'text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 shadow-xs cursor-pointer'
                                  : isCompleted
                                  ? 'text-cyan-300 bg-cyan-500/25 border border-cyan-400 shadow-md shadow-cyan-500/40 animate-pulse cursor-pointer'
                                  : 'text-slate-500/30 border border-transparent cursor-not-allowed opacity-40'
                              }`}
                              title={
                                isShared
                                  ? 'Paso 2: Compartido por WhatsApp (Hecho - Toca para volver a compartir)'
                                  : isCompleted
                                  ? 'Paso 2: ¡Trabajo completado! Toca para compartir reporte por WhatsApp'
                                  : 'Paso 2: Compartir reporte (Se habilita al completar el trabajo)'
                              }
                            >
                              <Share2 className="h-4 w-4 stroke-[2.2]" />
                            </button>

                            {/* 3. Paso Reportado / Confirmar Reportado (Dos palomitas) */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isCompleted) {
                                  openShareModal(order);
                                }
                              }}
                              className={`p-1.5 rounded-full transition active:scale-90 ${
                                isShared
                                  ? 'text-cyan-400 bg-cyan-500/20 border border-cyan-500/40 shadow-xs cursor-pointer'
                                  : 'text-slate-500/30 border border-transparent cursor-default'
                              }`}
                              title={
                                isShared
                                  ? 'Paso 3: ¡Reportado y confirmado exitosamente!'
                                  : isCompleted
                                  ? 'Paso 3: Pendiente de reportar por WhatsApp'
                                  : 'Paso 3: Se marca completo automáticamente al compartir el reporte'
                              }
                            >
                              <CheckCheck className="h-4 w-4 stroke-[2.5]" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
        </div>
      )}

      {/* MODAL: Ajustar Tarifa / Inconsistencia de Pago */}
      {adjustModalOrder && (() => {
        const { base, dwBonus, footageBonus, autoSubtotal } = getOrderBaseCalculation(adjustModalOrder);
        const parsedAmt = parseFloat(adjustAmount) || 0;
        const calcAdj = adjustType === 'sub' ? -Math.abs(parsedAmt) : Math.abs(parsedAmt);
        const finalEstRate = Math.max(0, autoSubtotal + calcAdj);

        return (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in modal-overlay-safe"
            style={{
              paddingTop: 'max(env(safe-area-inset-top, 0px) + 16px, 1.25rem)',
              paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 1.25rem)'
            }}
          >
            <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-2xl space-y-3.5 max-h-[78dvh] sm:max-h-[82dvh] modal-sheet-compact overflow-y-auto my-auto">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-xl">
                    <SlidersHorizontal className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Ajustar Precio de la Orden</h3>
                    <p className="text-[10px] text-slate-400 font-mono">Job #{adjustModalOrder.job_id}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setAdjustModalOrder(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 text-xs">
                <p className="font-bold text-slate-200">{adjustModalOrder.address}</p>
                <p className="text-[10px] text-slate-400">{adjustModalOrder.city}</p>
              </div>

              <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-1 text-xs font-mono">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span>Tarifa Base:</span>
                  <span className="text-white font-bold">$100.00</span>
                </div>

                {dwBonus > 0 && (
                  <div className="flex items-center justify-between text-cyan-400 text-[11px]">
                    <span>Driveway Bore (DW):</span>
                    <span className="font-bold">+$30.00</span>
                  </div>
                )}

                {footageBonus > 0 && (
                  <div className="flex items-center justify-between text-amber-300 text-[11px]">
                    <span>Drop Extra ({adjustModalOrder.drop_footage} ft):</span>
                    <span className="font-bold">+${footageBonus.toFixed(2)}</span>
                  </div>
                )}

                <div className="pt-1 border-t border-slate-800 flex items-center justify-between font-bold text-xs">
                  <span className="text-slate-300 font-sans">Subtotal Automático:</span>
                  <span className="text-emerald-400">${autoSubtotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-300 block">
                  Ajuste / Inconsistencia del Supervisor:
                </label>

                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setAdjustType('add')}
                    className={`py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1 ${
                      adjustType === 'add'
                        ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Plus className="h-3 w-3 stroke-[3]" />
                    <span>Sumar (+ Bono)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdjustType('sub')}
                    className={`py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1 ${
                      adjustType === 'sub'
                        ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Minus className="h-3 w-3 stroke-[3]" />
                    <span>Restar (- Descuento)</span>
                  </button>
                </div>

                <div className="relative">
                  <span className={`absolute left-3 top-2.5 text-xs font-mono font-black ${
                    adjustType === 'add' ? 'text-emerald-400' : 'text-amber-400'
                  }`}>
                    {adjustType === 'add' ? '+$' : '-$'}
                  </span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Monto a ajustar (ej. 30 o 25)"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs sm:text-sm text-white font-mono font-bold focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-[10px] text-slate-500">Rápidos:</span>
                  <button
                    type="button"
                    onClick={() => { setAdjustType('sub'); setAdjustAmount('30'); setAdjustReason('Supervisor descontó DW (no se perforó)'); }}
                    className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[10px] rounded-lg hover:bg-slate-700"
                  >
                    -30 (Sin DW)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAdjustType('add'); setAdjustAmount('25'); setAdjustReason('Bono metraje extra autorizado'); }}
                    className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[10px] rounded-lg hover:bg-slate-700"
                  >
                    +25 (Bono)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAdjustType('add'); setAdjustAmount('50'); setAdjustReason('Trabajo complejo / rocoso'); }}
                    className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[10px] rounded-lg hover:bg-slate-700"
                  >
                    +50 (Extra)
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300 block">
                  Motivo / Constancia del Ajuste:
                </label>
                <input
                  type="text"
                  placeholder="ej. Supervisor descontó DW / Terreno rocoso aprobado"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="p-3 bg-gradient-to-r from-slate-950 to-slate-900 border border-cyan-500/30 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold uppercase">
                    Tarifa Final Cobrable
                  </span>
                  {calcAdj !== 0 ? (
                    <span className="text-[11px] text-cyan-300 font-mono">
                      ${autoSubtotal} {calcAdj > 0 ? `+ $${Math.abs(calcAdj)}` : `- $${Math.abs(calcAdj)}`}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500 font-mono">Sin ajuste manual</span>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-xl font-black text-emerald-400 font-mono">
                    ${finalEstRate.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                {adjustModalOrder.manual_adjustment !== 0 && (
                  <button
                    type="button"
                    disabled={savingAdjust}
                    onClick={handleResetAdjustment}
                    className="py-2.5 px-3 bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 text-xs font-bold rounded-xl transition"
                    title="Eliminar ajuste y volver a la tarifa automática"
                  >
                    Restablecer
                  </button>
                )}

                <button
                  type="button"
                  disabled={savingAdjust}
                  onClick={handleSaveAdjustment}
                  className="flex-1 py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20 active:scale-95 transition"
                >
                  <Check className="h-4 w-4 stroke-[3]" />
                  <span>{savingAdjust ? 'Guardando...' : 'Guardar Ajuste'}</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL: Marcar como No Realizado */}
      {cancelModalOrder && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in modal-overlay-safe"
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 0px) + 16px, 1.25rem)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 1.25rem)'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setCancelModalOrder(null);
          }}
        >
          <div 
            className="bg-[#101722] border border-white/10 rounded-3xl w-full max-w-sm sm:max-w-md h-[80dvh] sm:h-[82dvh] modal-sheet-compact flex flex-col overflow-hidden shadow-2xl text-white transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 sm:px-5 py-3 border-b border-white/10 flex items-center justify-between bg-slate-900/70 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-rose-500/20">
                  <AlertTriangle className="h-4 w-4 stroke-[2.5]" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-white truncate">
                    Trabajo No Realizado
                  </h3>
                  <p className="text-[10.5px] text-slate-400 font-semibold truncate">
                    Registrar motivo de cancelación
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCancelModalOrder(null)}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
                title="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Sub-bar con detalles del trabajo */}
            <div className="px-4 py-2 bg-[#0d141e] border-b border-white/5 flex items-center justify-between text-[11px] text-slate-300 shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-mono font-bold text-cyan-400">
                  #{cancelModalOrder.job_id}
                </span>
                <span className="truncate max-w-[190px] text-[10.5px]">
                  • {cancelModalOrder.address}
                </span>
              </div>
              <span className="text-[9.5px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-lg font-bold shrink-0">
                No Realizado
              </span>
            </div>

            {/* Body */}
            <div className="p-3.5 sm:p-4 overflow-y-auto space-y-3.5 flex-1 min-h-0 scrollbar-none bg-[#101722]">
              {/* Sugerencias Rápidas de Motivos */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block">
                    Opciones rápidas (Opcional):
                  </label>
                  {cancelReason && (
                    <button
                      type="button"
                      onClick={() => setCancelReason('')}
                      className="text-[10px] text-slate-400 hover:text-rose-400 flex items-center gap-0.5 transition font-semibold"
                    >
                      <X className="h-3 w-3" />
                      <span>Deseleccionar</span>
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Sin acceso: cliente ausente o reja cerrada',
                    'Perro suelto en patio / Sin acceso seguro',
                    'Cancelado por el cliente en el sitio',
                    'Conflicto de servicios públicos (Gas/Agua)',
                    'Terreno inundado / Imposible perforar'
                  ].map((reason) => {
                    const isSelected = cancelReason === reason;
                    return (
                      <button
                        type="button"
                        key={reason}
                        onClick={() => setCancelReason(isSelected ? '' : reason)}
                        className={`text-[10.5px] px-2.5 py-1.5 rounded-xl border text-left transition flex items-center gap-1 cursor-pointer ${
                          isSelected
                            ? 'bg-rose-600 text-white border-rose-500 font-bold shadow-sm'
                            : 'bg-[#16202c] text-slate-300 border-white/10 hover:border-rose-400/50'
                        }`}
                      >
                        <span>{reason}</span>
                        {isSelected && <X className="h-2.5 w-2.5 opacity-70" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Campo de Texto Personalizado con botón de Limpiar X */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block">
                    Escribir motivo manualmente:
                  </label>
                  {cancelReason && (
                    <button
                      type="button"
                      onClick={() => setCancelReason('')}
                      className="text-[10px] text-rose-400 hover:underline flex items-center gap-1 font-bold"
                    >
                      <X className="h-3 w-3" />
                      <span>Limpiar texto</span>
                    </button>
                  )}
                </div>

                <div className="relative">
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    rows={2}
                    placeholder="Escribe la razón aquí manualmente..."
                    className="w-full bg-[#0d141e] border border-white/10 rounded-xl p-2.5 pr-8 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                  />
                  {cancelReason && (
                    <button
                      type="button"
                      onClick={() => setCancelReason('')}
                      className="absolute top-2.5 right-2.5 p-1 rounded-full bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white transition"
                      title="Borrar texto"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Fotos de Constancia del Obstáculo */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block">
                    Fotos del Obstáculo (Sello GPS & Hora):
                  </label>
                  {cancelPhotoPreviews.length > 0 && (
                    <span className="text-[10px] font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 rounded-lg">
                      {cancelPhotoPreviews.length} {cancelPhotoPreviews.length === 1 ? 'foto lista' : 'fotos listas'}
                    </span>
                  )}
                </div>

                {/* Botones de Cámara y Galería */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Botón Cámara */}
                  <label className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl border border-dashed border-rose-500/40 hover:border-rose-400 bg-rose-950/20 text-rose-300 text-xs font-bold cursor-pointer transition active:scale-95 text-center">
                    <Camera className="h-4 w-4 shrink-0 text-rose-400" />
                    <span>Cámara GPS</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleCancelPhotoSelect}
                      className="hidden"
                    />
                  </label>

                  {/* Botón Galería */}
                  <label className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl border border-dashed border-white/10 hover:border-rose-400 bg-[#16202c] hover:bg-[#1e2b3b] text-slate-200 text-xs font-bold cursor-pointer transition active:scale-95 text-center">
                    <ImageIcon className="h-4 w-4 shrink-0 text-rose-400" />
                    <span>Galería / Fotos</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/heic,image/heif,image/webp,.jpg,.jpeg,.png,.heic"
                      multiple
                      onChange={handleCancelPhotoSelect}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Tira de Fotos Añadidas Abajo */}
                {cancelPhotoPreviews.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {cancelPhotoPreviews.map((src, idx) => (
                      <div
                        key={idx}
                        className="relative rounded-xl overflow-hidden border border-rose-500/30 aspect-video bg-black/40 shadow-xs"
                      >
                        <img src={src} alt={`Preview ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemoveCancelPhoto(idx)}
                          className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/70 hover:bg-rose-600 text-white shadow active:scale-90 transition cursor-pointer"
                          title="Quitar foto"
                        >
                          <X className="h-3 w-3 stroke-[2.5]" />
                        </button>
                        <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/75 text-[9px] font-mono text-rose-300 border border-rose-500/30">
                          Obstáculo #{idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10.5px] text-slate-400 italic text-center py-2 bg-black/20 rounded-xl border border-white/5">
                    📸 Fotos con sello de coordenadas GPS y fecha/hora exacta.
                  </p>
                )}
              </div>
            </div>

            {/* Footer con Botones de Acción */}
            <div className="px-4 py-3 border-t border-white/10 bg-slate-900/80 flex items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setCancelModalOrder(null)}
                className="px-3.5 py-2 bg-white/10 hover:bg-white/15 text-slate-300 text-xs font-bold rounded-xl transition text-center cursor-pointer"
              >
                Volver
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={savingCancel}
                  onClick={() => handleConfirmCancelled(false)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition active:scale-95 text-center cursor-pointer border border-white/10"
                  title="Solo guardar constancia sin abrir WhatsApp"
                >
                  Solo Guardar
                </button>
                <button
                  type="button"
                  disabled={savingCancel}
                  onClick={() => handleConfirmCancelled(true)}
                  className="py-2 px-3.5 bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-black text-xs rounded-xl shadow-md shadow-rose-600/25 active:scale-95 transition flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Guardar constancia y abrir de inmediato para enviar por WhatsApp"
                >
                  <Share2 className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>{savingCancel ? 'Guardando...' : 'Confirmar y WhatsApp'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Ver Constancia y Foto del Motivo Cancelado */}
      {cancelDetailOrder && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in modal-overlay-safe"
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 0px) + 16px, 1.25rem)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 1.25rem)'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setCancelDetailOrder(null);
          }}
        >
          <div 
            className="bg-[#101722] border border-white/10 rounded-3xl w-full max-w-sm sm:max-w-md h-[80dvh] sm:h-[82dvh] modal-sheet-compact flex flex-col overflow-hidden shadow-2xl text-white transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 sm:px-5 py-3 border-b border-white/10 flex items-center justify-between bg-slate-900/70 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-rose-500/20">
                  <AlertTriangle className="h-4 w-4 stroke-[2.5]" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-white truncate">
                    Constancia de trabajo no realizado
                  </h3>
                  <p className="text-[10.5px] text-slate-400 font-semibold truncate">
                    #{cancelDetailOrder.job_id} • {cancelDetailOrder.address}{cancelDetailOrder.city ? `, ${cancelDetailOrder.city}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCancelDetailOrder(null)}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
                title="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* GPS & Hora Status Sub-bar */}
            <div className="px-4 py-2 bg-[#0d141e] border-b border-white/5 flex items-center justify-between text-[11px] text-slate-300 shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <MapPin className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                <span className="truncate max-w-[210px] text-[10.5px]">
                  {cancelDetailOrder.address}{cancelDetailOrder.city ? `, ${cancelDetailOrder.city}` : ''}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-cyan-400 shrink-0 font-mono text-[10px] bg-cyan-950/40 border border-cyan-500/30 px-2 py-0.5 rounded-lg">
                <Clock className="h-3 w-3" />
                <span>GPS + Hora Activos</span>
              </div>
            </div>

            {/* Body */}
            <div className="p-3.5 sm:p-4 overflow-y-auto space-y-3.5 flex-1 min-h-0 scrollbar-none bg-[#101722] flex flex-col">
              {/* Motivo Registrado con botón de Reactivar en esquina superior derecha */}
              <div className="relative p-3.5 rounded-2xl bg-rose-950/25 border border-rose-500/30 space-y-1 overflow-hidden shrink-0">
                {confirmingReopen ? (
                  <div className="absolute inset-0 bg-[#160c14]/95 backdrop-blur-xs rounded-2xl p-3 flex flex-col items-center justify-center text-center z-20 animate-fade-in border border-rose-500/40">
                    <p className="text-xs font-black text-white leading-snug">
                      ¿Reactivar este trabajo desde cero?
                    </p>
                    <p className="text-[10px] text-rose-200/90 mt-1 mb-2 max-w-[92%] leading-tight">
                      Se pasará a Pendiente, se eliminarán las fotos de constancia y se limpiará el reporte para iniciar el trámite normal.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmingReopen(false)}
                        className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-slate-300 text-xs font-semibold transition active:scale-95 cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReopenOrder(cancelDetailOrder)}
                        className="px-3 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition active:scale-95 cursor-pointer shadow-sm"
                      >
                        Sí, Reactivar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingReopen(true)}
                    className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/35 text-[11px] font-bold transition active:scale-95 cursor-pointer shadow-xs z-10"
                    title="Reactivar trabajo para continuar con la instalación"
                  >
                    <RotateCcw className="h-3 w-3 stroke-[2.5]" />
                    <span>Reactivar</span>
                  </button>
                )}
                <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">
                  Motivo Registrado:
                </span>
                <p className="text-xs font-semibold text-rose-100 leading-relaxed max-w-[85%]">
                  "{cancelDetailOrder.cancel_reason || 'Inconveniente en la propiedad'}"
                </p>
              </div>

              {/* Sección de Fotos de Constancia / Obstáculo (Ocupa el espacio restante completo) */}
              <div className="space-y-2 flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between shrink-0">
                  <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block">
                    Fotos del Obstáculo ({cancelDetailPhotos.length}):
                  </span>
                  {cancelDetailPhotos.length > 0 && (
                    <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-lg">
                      ✓ {cancelDetailPhotos.length} {cancelDetailPhotos.length === 1 ? 'foto con sello GPS' : 'fotos con sello GPS'}
                    </span>
                  )}
                </div>

                {/* Botones de Captura (Cámara en Vivo con GPS & Hora + Galería) */}
                <div className="grid grid-cols-2 gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsLiveCameraOpenForCancel(true)}
                    className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-black text-xs shadow-md shadow-rose-600/20 flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer"
                    title="Tomar foto de obstáculo con visor de cámara en vivo y sello GPS"
                  >
                    <Camera className="h-4 w-4 stroke-[2.2]" />
                    <span>Cámara GPS</span>
                  </button>

                  <label className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-dashed border-rose-500/40 hover:border-rose-400 bg-[#16202c] hover:bg-[#1e2b3b] text-slate-200 text-xs font-bold cursor-pointer transition active:scale-95 text-center">
                    <ImageIcon className="h-4 w-4 text-rose-400" />
                    <span>Galería</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleAddPhotoToCancelled}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Galería de Fotos del Obstáculo (expande para ocupar todo el espacio libre) */}
                {loadingCancelPhotos ? (
                  <div className="flex-1 min-h-[160px] rounded-2xl border border-white/5 bg-[#0d141e]/50 flex flex-col items-center justify-center p-3 text-center">
                    <span className="text-xs text-slate-400 font-medium">Cargando constancia...</span>
                  </div>
                ) : cancelDetailPhotos.length > 0 ? (
                  <div className="flex-1 min-h-[160px] p-2 bg-[#0d141e]/50 rounded-2xl border border-rose-500/25 overflow-y-auto sleek-scroll">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {cancelDetailPhotos.map((photo, idx) => (
                        <div
                          key={photo.id || idx}
                          onClick={() => setPreviewFullPhoto(photo.photo_data || `/uploads/${photo.filename}`)}
                          className="group relative bg-[#16202c] border border-rose-500/30 hover:border-rose-400 rounded-xl overflow-hidden aspect-video shadow-xs transition cursor-pointer"
                          title="Toca para ver la foto completa"
                        >
                          <img
                            src={photo.photo_data || `/uploads/${photo.filename}`}
                            alt={`Motivo ${idx + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent flex flex-col justify-between p-1">
                            <div className="flex justify-between items-center" onClick={(e) => e.stopPropagation()}>
                              <span className="text-[8.5px] bg-black/85 backdrop-blur-xs text-rose-300 border border-rose-400/30 px-1 py-0.2 rounded font-bold truncate max-w-[70%]">
                                Motivo
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteCancelDetailPhoto(photo.id)}
                                title="Eliminar foto"
                                className="p-1 bg-black/70 hover:bg-rose-600 text-slate-300 hover:text-white rounded transition shadow active:scale-90 cursor-pointer"
                              >
                                <Trash2 className="h-2.5 w-2.5" />
                              </button>
                            </div>
                            <span className="text-[9px] text-slate-300 flex items-center gap-0.5 font-medium truncate group-hover:text-rose-300">
                              <span>Ver</span>
                              <ExternalLink className="h-2 w-2" />
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 min-h-[160px] rounded-2xl border border-dashed border-rose-500/35 bg-[#0d141e]/40 flex flex-col items-center justify-center p-4 text-center space-y-1">
                    <Camera className="h-7 w-7 text-rose-400/50 mb-0.5" />
                    <p className="text-xs font-bold text-rose-200">
                      Espacio para fotos del obstáculo
                    </p>
                    <p className="text-[10.5px] text-slate-400 max-w-xs leading-relaxed">
                      Toca "Cámara GPS" para registrar la evidencia con sello de coordenadas y hora.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer con 2 Botones Limpios y Elegantes */}
            <div className="px-4 py-3 border-t border-white/10 bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
              {(() => {
                const isCancelReported = Boolean(cancelDetailOrder.whatsapp_shared || localSharedMap[cancelDetailOrder.id]);
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setCancelDetailOrder(null);
                        setConfirmingReopen(false);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white text-xs font-bold transition active:scale-95 cursor-pointer border border-white/10 shadow-sm"
                    >
                      <span>Cerrar</span>
                    </button>

                    {isCancelReported ? (
                      <div 
                        className="px-3.5 py-2 text-xs font-black rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm flex items-center gap-1.5 select-none"
                        title="Constancia de trabajo no realizado reportada exitosamente"
                      >
                        <span>Reportado</span>
                        <CheckCheck className="h-4 w-4 stroke-[2.5] text-rose-400" />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const ord = cancelDetailOrder;
                          setCancelDetailOrder(null);
                          openShareModal(ord);
                        }}
                        className="px-4 py-2 bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-black text-xs rounded-xl shadow-md shadow-rose-600/20 active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
                        title="Abrir reporte con motivo y fotos de constancia para WhatsApp"
                      >
                        <Share2 className="h-3.5 w-3.5 stroke-[2.5]" />
                        <span>Enviar Constancia</span>
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Visor de Cámara en Vivo para Constancia de No Realizado */}
      {isLiveCameraOpenForCancel && cancelDetailOrder && (
        <LiveCameraModal
          isOpen={isLiveCameraOpenForCancel}
          onClose={() => setIsLiveCameraOpenForCancel(false)}
          order={cancelDetailOrder}
          initialCategory="Constancia No Realizado"
          onPhotoSaved={handleLivePhotoSavedForCancel}
          autoAdvance={false}
        />
      )}

      {/* MODAL: Enviar Reporte a WhatsApp (Texto Editable + Todas las Fotos Juntas) */}
      <ShareReportModal
        isOpen={Boolean(shareModalOrder)}
        order={shareModalOrder}
        onClose={() => setShareModalOrder(null)}
        onOrderUpdated={onOrderUpdated}
        onShared={(orderId) => setLocalSharedMap(prev => ({ ...prev, [orderId]: true }))}
      />

      {/* Modal para Añadir Trabajo Manualmente */}
      <AddJobModal
        isOpen={isAddJobOpen}
        onClose={() => setIsAddJobOpen(false)}
        initialDate={activeDate}
        onJobAdded={async (createdOrder) => {
          if (createdOrder) {
            if (createdOrder.work_date) {
              setActiveDate(normalizeDateStr(createdOrder.work_date));
            }
            if (createdOrder.id) {
              setTargetFocusOrderId(createdOrder.id);
            }
          }
          if (onOrderUpdated) {
            await onOrderUpdated();
          }
        }}
        defaultTech="Javier (P0G1)"
      />

      {/* Modal para Edición Completa / Ficha Técnica de Trabajo */}
      <EditJobModal
        order={editingOrder}
        isOpen={Boolean(editingOrder)}
        initialMode={editModalInitialMode}
        onClose={() => setEditingOrder(null)}
        onJobUpdated={() => {
          setEditingOrder(null);
          if (onOrderUpdated) onOrderUpdated();
        }}
        onJobDeleted={() => {
          setEditingOrder(null);
          if (onOrderUpdated) onOrderUpdated();
        }}
      />

      {/* FULLSCREEN PHOTO PREVIEW MODAL (IN-APP - FOTO CENTRADA Y BOTONES DESPEGADOS) */}
      {previewFullPhoto && (
        <div
          onClick={() => setPreviewFullPhoto(null)}
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
              onClick={() => setPreviewFullPhoto(null)}
              className="p-2.5 rounded-full bg-slate-900/90 text-white hover:text-cyan-400 border border-white/20 shadow-2xl transition active:scale-90 cursor-pointer"
              title="Cerrar foto"
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
              src={previewFullPhoto}
              alt="Constancia Completa"
              className="max-h-[62dvh] sm:max-h-[68dvh] max-w-[92vw] sm:max-w-lg w-auto h-auto rounded-2xl object-contain border border-white/10 shadow-2xl"
            />
          </div>

          {/* Botón inferior despegado abajo con margen prudente */}
          <div className="shrink-0 pt-3 pb-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewFullPhoto(null)}
              className="px-6 py-2.5 bg-[#16202c] hover:bg-[#1e2b3b] text-white border border-white/15 rounded-xl text-xs font-bold transition shadow-xl active:scale-95 cursor-pointer flex items-center gap-2"
            >
              <X className="h-4 w-4" />
              <span>Cerrar Foto</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL FULLSCREEN: HOJA DE DESPACHO DEL DÍA (CON ZOOM INTERACTIVO Y DESPLAZAMIENTO) */}
      {selectedSheetModal && (
        <ZoomableImageViewer
          src={selectedSheetModal.photo_data || (selectedSheetModal.filename?.startsWith('/') ? selectedSheetModal.filename : `/uploads/${selectedSheetModal.filename}`)}
          alt="Hoja de Despacho del Día"
          title={`Hoja de Despacho • ${formatDateFriendly(activeDate)}`}
          onClose={() => setSelectedSheetModal(null)}
          extraFooterActions={
            <>
              <label className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/15 rounded-xl text-xs font-bold transition shadow-xl active:scale-95 cursor-pointer flex items-center gap-1.5">
                <FilePlus className="h-3.5 w-3.5" />
                <span>Cambiar Hoja</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleUploadDaySheet}
                  disabled={uploadingSheet}
                />
              </label>
              <button
                type="button"
                onClick={() => setSelectedSheetModal(null)}
                className="px-6 py-2 bg-[#16202c] hover:bg-[#1e2b3b] text-white border border-white/15 rounded-xl text-xs font-bold transition shadow-xl active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <X className="h-3.5 w-3.5" />
                <span>Cerrar</span>
              </button>
            </>
          }
        />
      )}
    </div>
  );
}
