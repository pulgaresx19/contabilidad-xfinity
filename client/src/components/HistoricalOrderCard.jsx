import React from 'react';
import { 
  MapPin, Sparkles, AlertTriangle, Camera, Copy, Pencil, Maximize2, Check
} from 'lucide-react';
import { getOrderRemark } from '../utils/remarkUtils';

export default function HistoricalOrderCard({
  order,
  idx = 0,
  onOpenPhotos,
  onEditOrder,
  onCopyClaim,
  onSelectPhoto,
  isCopied = false
}) {
  if (!order) return null;

  const isCompleted = order.status === 'Completado';
  const isCancelled = order.status === 'No Realizado';
  const hasDrivewayBore = Boolean(
    order.bore_type && (
      order.bore_type.includes('DW') || 
      order.bore_type.toLowerCase().includes('driveway') || 
      order.bore_type === 'Y'
    )
  );

  const photos = order.photos || [];
  const photosCount = order.work_photos_count !== undefined 
    ? order.work_photos_count 
    : (order.photos_count !== undefined ? order.photos_count : photos.length);

  const orderRemark = getOrderRemark(order);

  return (
    <div className="bg-[#131b26] border border-white/10 hover:border-cyan-500/35 rounded-2xl p-3.5 space-y-2 text-xs shadow-md transition group select-none">
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

        {/* Medallón de Dinero Profesional / Tarifa (Idéntico a Cierre Diario) */}
        <div 
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border shadow-sm select-none shrink-0 ${
            isCancelled
              ? 'bg-slate-900/60 text-slate-500 border-white/5 line-through'
              : isCompleted
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-emerald-500/10'
              : 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-amber-500/10'
          }`}
          title={`Tarifa del trabajo: $${order.rate_calculated || 100} USD`}
        >
          <span className={`h-3.5 w-3.5 rounded-full flex items-center justify-center text-[9px] font-black ${
            isCancelled ? 'bg-slate-800 text-slate-500' : 'bg-emerald-500 text-slate-950'
          }`}>
            $
          </span>
          <span className="text-xs sm:text-sm font-black font-mono tracking-tight leading-none">
            {order.rate_calculated || 100}
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

      {/* FILA 3: ESPECIFICACIONES TÉCNICAS Y NOTA DE ACCESO (Idéntico a Cierre Diario) */}
      <div className="flex items-center gap-1.5 text-[10px] overflow-x-auto scrollbar-none py-0.5 whitespace-nowrap">
        {/* Drop */}
        <span className="shrink-0 bg-slate-800/70 px-2 py-0.5 rounded-md border border-slate-700/60 text-slate-300 font-mono flex items-center gap-1">
          <span className="text-slate-400 font-sans text-[9px] uppercase tracking-wider font-semibold">Drop</span>
          <span className="font-bold text-slate-100">{order.drop_footage || 0} ft</span>
        </span>

        {/* Cable */}
        <span className="shrink-0 bg-slate-800/70 px-2 py-0.5 rounded-md border border-slate-700/60 text-slate-300 font-mono flex items-center gap-1">
          <span className="text-slate-400 font-sans text-[9px] uppercase tracking-wider font-semibold">Cable</span>
          <span className="font-semibold text-slate-200">{order.cable_type || 'RG-6'}</span>
        </span>

        {/* Bore DW */}
        {hasDrivewayBore ? (
          <span className="shrink-0 bg-cyan-950/30 text-cyan-300 px-2 py-0.5 rounded-md border border-cyan-500/25 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
            <span>DW Bore</span>
            <span className="text-cyan-400/80 font-mono text-[9px]">(+$30)</span>
          </span>
        ) : order.bore_type && order.bore_type !== 'N' ? (
          <span className="shrink-0 bg-slate-800/70 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700/60 font-mono flex items-center gap-1">
            <span className="text-slate-400 font-sans text-[9px] uppercase tracking-wider font-semibold">Bore</span>
            <span className="font-semibold text-slate-200">{order.bore_type}</span>
          </span>
        ) : null}

        {/* Extra Footage Bonus */}
        {order.drop_footage > 300 && Math.floor((order.drop_footage - 300) / 100) > 0 && (
          <span className="shrink-0 bg-emerald-950/30 text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-500/25 font-mono font-medium flex items-center gap-1">
            <span className="text-emerald-400/80 font-sans text-[9px] font-bold">+Drop</span>
            <span className="font-bold">${Math.floor((order.drop_footage - 300) / 100) * 25}</span>
          </span>
        )}

        {/* Manual Adjustment */}
        {order.manual_adjustment !== undefined && Number(order.manual_adjustment) !== 0 && (
          <span className={`shrink-0 px-2 py-0.5 rounded-md font-mono text-[10px] font-medium border flex items-center gap-1 ${
            order.manual_adjustment > 0 ? 'bg-cyan-950/30 text-cyan-300 border-cyan-500/25' : 'bg-amber-950/30 text-amber-300 border-amber-500/25'
          }`}>
            <Sparkles className="h-2.5 w-2.5 opacity-80" />
            <span>{order.manual_adjustment > 0 ? `+$${order.manual_adjustment}` : `-$${Math.abs(order.manual_adjustment)}`}</span>
          </span>
        )}

        {/* Nota / Condición de Acceso */}
        {orderRemark && (
          <span 
            className="shrink-0 bg-slate-800/80 text-slate-300 px-2.5 py-0.5 rounded-md border border-slate-700/60 font-medium flex items-center gap-1.5 max-w-sm sm:max-w-md"
            title={`Nota / Acceso: ${orderRemark}`}
          >
            <span className="text-amber-400 text-[9px] uppercase tracking-wider font-semibold">Nota</span>
            <span className="text-slate-200">{orderRemark}</span>
          </span>
        )}
      </div>

      {/* FILA 4: MOTIVO DE CANCELACIÓN (Si aplica) */}
      {isCancelled && (
        <div className="bg-rose-950/25 border border-rose-500/25 p-2 rounded-xl text-xs text-rose-200 flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <span className="text-[9px] uppercase font-bold text-rose-400 block tracking-wider">
              Motivo No Realizado:
            </span>
            <p className="font-semibold text-xs leading-tight">
              {order.cancel_reason || 'Sin motivo detallado'}
            </p>
          </div>
        </div>
      )}

      {/* FILA 5: TIRA INFERIOR DE FOTOS DE EVIDENCIA + ACCIONES DE HISTORIAL */}
      <div className="pt-2 border-t border-white/8 flex items-center justify-between gap-2">
        {/* Tira de fotos */}
        {photos.length > 0 ? (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none flex-1 min-w-0">
            {photos.map((p, pIdx) => {
              const src = p.photo_data || (p.filename ? `/uploads/${p.filename}` : '');
              return (
                <div
                  key={p.id || pIdx}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectPhoto ? onSelectPhoto(src) : null;
                  }}
                  className="h-10 w-12 sm:h-11 sm:w-14 rounded-lg overflow-hidden bg-black/40 border border-white/10 flex-shrink-0 cursor-pointer relative group hover:border-cyan-400 transition"
                  title="Toca para ampliar foto de evidencia"
                >
                  <img 
                    src={src} 
                    alt={p.category || `Foto ${pIdx + 1}`} 
                    className="w-full h-full object-cover group-hover:scale-105 transition" 
                  />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                    <Maximize2 className="h-3 w-3 text-white" />
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenPhotos && onOpenPhotos(order);
              }}
              className="h-10 sm:h-11 px-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-cyan-300 border border-white/10 flex items-center gap-1 text-[10.5px] font-semibold shrink-0 cursor-pointer transition active:scale-95"
              title="Ver o gestionar todas las fotos"
            >
              <Camera className="w-3.5 h-3.5 text-cyan-400" />
              <span>{photosCount}</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenPhotos && onOpenPhotos(order);
            }}
            className="text-[10px] text-slate-400 hover:text-cyan-300 font-medium flex items-center gap-1 bg-[#182332] px-2.5 py-1.5 rounded-lg border border-white/5 transition active:scale-95 cursor-pointer"
            title="Sin fotos. Toca para agregar."
          >
            <Camera className="h-3 w-3 text-slate-500" />
            <span>Sin fotos archivadas</span>
          </button>
        )}

        {/* Acciones de la derecha: Copiar Comprobante y Editar */}
        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {onCopyClaim && (
            <button
              type="button"
              onClick={() => onCopyClaim(order)}
              className="p-1.5 sm:px-2.5 sm:py-1 text-[10.5px] text-slate-300 hover:text-white bg-[#182332] hover:bg-[#243140] border border-white/10 rounded-lg flex items-center gap-1 transition active:scale-95 cursor-pointer shadow-xs"
              title="Copiar comprobante de trabajo para WhatsApp"
            >
              {isCopied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-400 font-bold hidden sm:inline">¡Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 text-cyan-400" />
                  <span className="hidden sm:inline">Copiar</span>
                </>
              )}
            </button>
          )}

          {onEditOrder && (
            <button
              type="button"
              onClick={() => onEditOrder(order)}
              className="p-1.5 sm:px-2.5 sm:py-1 text-[10.5px] text-slate-300 hover:text-white bg-[#182332] hover:bg-[#243140] border border-white/10 rounded-lg flex items-center gap-1 transition active:scale-95 cursor-pointer shadow-xs"
              title="Editar trabajo"
            >
              <Pencil className="h-3 w-3 text-cyan-400" />
              <span className="hidden sm:inline">Editar</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
