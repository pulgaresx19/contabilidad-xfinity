import React from 'react';
import { 
  MapPin, Sparkles, AlertTriangle, Camera, Copy, Pencil, Maximize2, Check, Share2, CheckCheck
} from 'lucide-react';
import { getOrderRemark, getOrderFieldBadges, getBoreInfo, formatCableType } from '../utils/remarkUtils';
import { formatAdjustmentReason } from '../utils/adjustmentUtils';
import { calcOrderRate, normalizeRateCard, DEFAULT_RATE_CARD } from '../utils/rateUtils';

export default function HistoricalOrderCard({
  order,
  idx = 0,
  onOpenPhotos,
  onEditOrder,
  onCopyClaim,
  onShareReport,
  onSelectPhoto,
  isCopied = false
}) {
  if (!order) return null;

  const isCompleted = order.status === 'Completado';
  const isCancelled = order.status === 'No Realizado' || order.status === 'Cancelado';
  const hasDrivewayBore = Boolean(
    order.bore_type && (
      order.bore_type.includes('DW') || 
      order.bore_type.toLowerCase().includes('driveway') || 
      order.bore_type === 'Y'
    )
  );

  const photos = order.photos || [];
  const workPhotos = photos.filter((p) => p.category !== 'Constancia No Realizado');
  const displayPhotos = workPhotos.length > 0 ? workPhotos : photos;
  const cancelCount = Number(order.cancel_photos_count) || 0;
  const workCount = Number(order.work_photos_count) || 0;
  const totalCount = Number(order.photos_count) || (photos ? photos.length : 0);

  // Contar con precisión según el estado (en No Realizado se toma cancelCount o totalCount)
  const photosCount = isCancelled
    ? (cancelCount > 0 ? cancelCount : totalCount)
    : (workCount > 0 ? workCount : totalCount);

  const orderRemark = getOrderRemark(order);

  return (
    <div className="bg-[#131b26] border border-white/10 hover:border-cyan-500/35 rounded-2xl p-3.5 space-y-2.5 text-xs shadow-md transition group select-none">
      {/* FILA 1: ENCABEZADO (Número de Parada/Check + Job ID + Fecha | Medallón de Tarifa) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={`w-6 h-6 rounded-full font-black text-xs flex items-center justify-center font-mono shrink-0 shadow-sm ${
            isCancelled
              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
              : isCompleted
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
              : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
          }`}>
            {isCompleted ? '✓' : isCancelled ? '✕' : (idx + 1)}
          </span>

          <span className="text-sm font-black text-cyan-400 font-mono tracking-wide shrink-0">
            #{order.job_id}
          </span>

          {order.work_date && (
            <span className="text-[10px] text-slate-400 font-mono truncate">
              • {order.work_date}
            </span>
          )}
        </div>

        {/* Medallón de Tarifa Profesional */}
        <div 
          onClick={(e) => {
            e.stopPropagation();
            if (onEditOrder) onEditOrder(order);
          }}
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border shadow-sm select-none shrink-0 cursor-pointer hover:scale-105 active:scale-95 transition ${
            isCancelled
              ? 'bg-slate-900/60 text-slate-500 border-white/5 line-through'
              : isCompleted
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-emerald-500/10'
              : 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-amber-500/10'
          }`}
          title={`Tarifa del trabajo: $${order.rate_calculated ?? 100} USD (Toca para editar)`}
        >
          <span className={`h-3.5 w-3.5 rounded-full flex items-center justify-center text-[9px] font-black ${
            isCancelled ? 'bg-slate-800 text-slate-500' : 'bg-emerald-500 text-slate-950'
          }`}>
            $
          </span>
          <span className="text-xs sm:text-sm font-black font-mono tracking-tight leading-none">
            {order.rate_calculated ?? 100}
          </span>
          <span className="text-[8.5px] font-extrabold uppercase tracking-wider opacity-60">
            USD
          </span>
        </div>
      </div>

      {/* FILA 2: DIRECCIÓN A LA IZQUIERDA Y ESTADO DEL TRABAJO A LA DERECHA */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5 min-w-0 flex-1">
          <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-bold text-white text-xs truncate leading-snug">{order.address}</p>
            <p className="text-[10.5px] text-slate-400 truncate font-mono">
              {order.city || 'Skokie'} {order.zip_code || ''}
            </p>
          </div>
        </div>

        {/* Estado del Trabajo ocupando el espacio de la derecha */}
        <div className="shrink-0 flex items-center gap-1.5 pt-0.5">
          <span className={`text-[9.5px] font-extrabold px-2.5 py-1 rounded-full border uppercase tracking-wider shrink-0 flex items-center gap-1 shadow-xs ${
            isCompleted
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
              : isCancelled
              ? 'bg-rose-500/15 text-rose-300 border-rose-500/35'
              : 'bg-amber-500/15 text-amber-300 border-amber-500/35'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              isCompleted ? 'bg-emerald-400' : isCancelled ? 'bg-rose-400' : 'bg-amber-400'
            }`} />
            <span>{order.status || 'Pendiente'}</span>
          </span>
        </div>
      </div>

      {/* FILA 3: ESPECIFICACIONES TÉCNICAS (Drop, Cable, Bore, Bonos, luego Reman / Alertas por Prioridad) */}
      <div className="flex items-center gap-1.5 text-[10px] overflow-x-auto scrollbar-none py-0.5 whitespace-nowrap">
        {/* 1. Metraje del Drop (Siempre Primero) */}
        <span className="shrink-0 bg-slate-800/70 px-2 py-0.5 rounded-md border border-slate-700/60 text-slate-300 font-mono flex items-center gap-1">
          <span className="text-slate-400 font-sans text-[9px] uppercase tracking-wider font-semibold">Drop</span>
          <span className="font-bold text-slate-100">{order.drop_footage || 0} ft</span>
        </span>

        {/* 2. Tipo de Cable (Segundo) */}
        <span className="shrink-0 bg-slate-800/70 px-2 py-0.5 rounded-md border border-slate-700/60 text-slate-300 font-mono flex items-center gap-1">
          <span className="text-slate-400 font-sans text-[9px] uppercase tracking-wider font-semibold">Cable</span>
          <span className={order.cable_type === 'EPON' ? 'font-bold text-amber-300' : 'font-semibold text-slate-200'}>
            {formatCableType(order.cable_type)}
          </span>
        </span>

        {/* 3. Perforación / Bore & Metraje Largo (>300 ft) según Tarifario Oficial */}
        {(() => {
          let card = DEFAULT_RATE_CARD;
          try {
            const cached = JSON.parse(localStorage.getItem('xfinity_cached_settings') || '{}');
            if (cached.rate_card) card = normalizeRateCard(cached.rate_card);
          } catch (_) {}
          const rateRes = calcOrderRate(order, card);
          const dwCode = rateRes.matchedCodes.find(c => c.code === 'D20');
          const rdCode = rateRes.matchedCodes.find(c => c.code === 'B002');
          const b = getBoreInfo(order.bore_type);
          return (
            <>
              {b && (
                <span className="shrink-0 bg-slate-800/70 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700/60 text-[10px] font-mono flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${b.dotColor}`} />
                  <span className="font-semibold text-slate-200">{b.label}</span>
                  {rdCode && <span className="text-emerald-400 font-mono text-[9px]">(+${rdCode.price.toFixed(2)})</span>}
                </span>
              )}
            </>
          );
        })()}

        {/* 5. Ajuste Manual de Tarifa */}
        {order.manual_adjustment !== undefined && Number(order.manual_adjustment) !== 0 && (
          <span 
            className="shrink-0 bg-slate-800/70 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700/60 font-mono text-[10px] font-medium flex items-center gap-1"
            title={`Ajuste: ${order.manual_adjustment > 0 ? `+$${order.manual_adjustment}` : `-$${Math.abs(order.manual_adjustment)}`}${order.adjustment_reason ? ` • ${formatAdjustmentReason(order.adjustment_reason)}` : ''}`}
          >
            <Sparkles className="h-2.5 w-2.5 text-cyan-400 opacity-90" />
            <span className="text-slate-200">{order.manual_adjustment > 0 ? `+$${order.manual_adjustment}` : `-$${Math.abs(order.manual_adjustment)}`}</span>
            {order.adjustment_reason && (
              <span className="font-normal opacity-75 text-[9px] max-w-[85px] truncate font-sans">
                ({formatAdjustmentReason(order.adjustment_reason)})
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

      {/* FILA 4: ESPACIO VISUAL UNIFICADO (Mismo alto exacto h-12 sm:h-14 en todos los estados) */}
      {isCancelled ? (
        /* Trabajo No Realizado: Caja del Motivo con el icono y contador de fotos estampado a la derecha */
        <div 
          onClick={(e) => {
            e.stopPropagation();
            onOpenPhotos && onOpenPhotos(order);
          }}
          className="h-12 sm:h-14 w-full bg-rose-950/20 border border-rose-500/25 hover:border-rose-500/40 px-3 rounded-xl text-xs text-rose-200 flex items-center justify-between gap-2.5 transition cursor-pointer active:scale-[0.99] select-none shrink-0"
          title="Toca para ver la constancia y fotos del obstáculo"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="text-[9.5px] uppercase font-black text-rose-400 block tracking-wider leading-none">
                Motivo No Realizado
              </span>
              <p className="font-semibold text-xs text-rose-100 truncate mt-0.5">
                {order.cancel_reason || 'Inconveniente en la propiedad'}
              </p>
            </div>
          </div>

          {photosCount > 0 && (
            <div 
              className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-rose-500/20 border border-rose-500/35 text-rose-300 shadow-xs"
              title={`${photosCount} foto(s) de la constancia`}
            >
              <Camera className="h-3.5 w-3.5 text-rose-400 shrink-0" />
              <span className="font-mono font-bold text-[11px] leading-none">{photosCount}</span>
            </div>
          )}
        </div>
      ) : displayPhotos.length > 0 ? (
        /* Trabajo Realizado: Tira horizontal de fotos con ícono circular estampado con el número de ítem */
        <div className="h-12 sm:h-14 w-full flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none shrink-0">
          {displayPhotos.map((p, pIdx) => {
            const src = p.photo_data || (p.filename ? `/uploads/${p.filename}` : '');
            return (
              <div
                key={p.id || pIdx}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectPhoto ? onSelectPhoto(src) : null;
                }}
                className="h-full aspect-[4/3] rounded-xl overflow-hidden bg-black/40 border border-white/10 shrink-0 cursor-pointer relative group hover:border-cyan-400 transition"
                title={`Foto ${pIdx + 1} - Toca para ampliar`}
              >
                <img 
                  src={src} 
                  alt={p.category || `Foto ${pIdx + 1}`} 
                  className="w-full h-full object-cover group-hover:scale-105 transition" 
                />
                {/* Ícono circular estampado con el número de ítem de la foto */}
                <div className="absolute top-1 left-1 h-4 w-4 rounded-full bg-black/80 backdrop-blur-xs text-white border border-white/20 text-[9px] font-black font-mono flex items-center justify-center shadow-md select-none pointer-events-none">
                  {pIdx + 1}
                </div>
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                  <Maximize2 className="h-3.5 w-3.5 text-white" />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Trabajo Realizado sin fotos archivadas: Mismo alto exacto con placeholder sutil */
        <div 
          onClick={(e) => {
            e.stopPropagation();
            onOpenPhotos && onOpenPhotos(order);
          }}
          className="h-12 sm:h-14 w-full bg-[#16202c]/40 border border-dashed border-white/10 hover:border-cyan-500/30 rounded-xl px-3 flex items-center gap-2 text-slate-400 cursor-pointer transition active:scale-[0.99] shrink-0"
          title="Sin fotos de evidencia archivadas. Toca para gestionar o agregar."
        >
          <Camera className="h-4 w-4 text-slate-500 shrink-0" />
          <span className="text-xs text-slate-400 font-medium truncate">Sin fotos de evidencia archivadas</span>
        </div>
      )}

      {/* FILA 6: ACCIONES RÁPIDAS (Copiar Comprobante | Editar | Recompartir Reporte) */}
      <div className="pt-2 border-t border-white/8 grid grid-cols-3 gap-1.5 sm:gap-2" onClick={(e) => e.stopPropagation()}>
        {/* 1. Copiar Comprobante */}
        <button
          type="button"
          onClick={() => onCopyClaim && onCopyClaim(order)}
          className="w-full py-1.5 px-1.5 sm:px-2 text-[10.5px] font-semibold text-slate-300 hover:text-white bg-[#182332] hover:bg-[#223042] border border-white/10 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs"
          title="Copiar comprobante de trabajo para WhatsApp"
        >
          {isCopied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span className="text-emerald-400 font-bold truncate">¡Copiado!</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
              <span className="truncate">Copiar</span>
            </>
          )}
        </button>

        {/* 2. Editar Trabajo */}
        <button
          type="button"
          onClick={() => onEditOrder && onEditOrder(order)}
          className="w-full py-1.5 px-1.5 sm:px-2 text-[10.5px] font-semibold text-slate-300 hover:text-white bg-[#182332] hover:bg-[#223042] border border-white/10 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs"
          title="Editar datos de la orden"
        >
          <Pencil className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
          <span className="truncate">Editar</span>
        </button>

        {/* 3. Recompartir / Reportar Reporte Completo */}
        <button
          type="button"
          onClick={() => onShareReport && onShareReport(order)}
          className={`w-full py-1.5 px-1.5 sm:px-2 text-[10.5px] font-semibold border rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs ${
            order.whatsapp_shared
              ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30 hover:bg-emerald-500/25'
              : 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30 hover:bg-cyan-500/25'
          }`}
          title="Recompartir o enviar reporte completo por WhatsApp"
        >
          {order.whatsapp_shared ? (
            <>
              <CheckCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">Recompartir</span>
            </>
          ) : (
            <>
              <Share2 className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
              <span className="truncate">Reportar</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
