/**
 * remarkUtils.js
 * Utilidades para limpiar y formatear las observaciones (remarks) y notas de trabajo.
 * Elimina la duplicación de datos técnicos ya mostrados en tarjetas dedicadas
 * (teléfono, metraje/pies, tipo de cable, bore) e interpreta automáticamente
 * todas las siglas y patrones de despacho de Comcast/Xfinity a español claro:
 * - NBR:N / NB / NB:N -> 🟢 Sin cruce de vecinos
 * - NBR:1 / NB:1      -> 👥 Cruce de vecino (1 vecino)
 * - NBR:2 / NB:2      -> 👥 Cruce de vecinos (2 vecinos)
 * - NBR:Y             -> 👥 Cruce de vecinos requerido
 * - Premise ACS:RQHM  -> 🏠 Cliente en casa requerido
 * - Premise ACS:DOG   -> 🐕 Perro en propiedad
 * - Premise ACS:GATE  -> 🔒 Portón / Candado
 * - Premise ACS:CALL  -> 📞 Llamar antes de entrar
 * - Obstacles:LANDSC  -> 🌿 Jardinería delicada
 * - Obstacles:SPRKLR  -> 💦 Aspersores de riego
 * - TEMP:Y            -> ⚡ Cable Temporal
 * - Sin restricciones -> 🟢 Acceso libre • Sin cruce de vecinos
 */

export function cleanRawNotes(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  const text = rawText.trim();
  if (!text) return '';

  // 1. Si existe etiqueta explícita REMARK: o REMARKS:, priorizamos el contenido humano posterior
  const remarkMatch = text.match(/\bREMARKS?[:\s-]+(.*)$/i);
  if (remarkMatch && remarkMatch[1].trim()) {
    let afterRemark = remarkMatch[1].trim();
    afterRemark = afterRemark.replace(/^[\s/|,;:-]+|[\s/|,;:-]+$/g, '').trim();
    if (afterRemark && !/^(?:N|NO|NONE|NULL)$/i.test(afterRemark)) return afterRemark;
  }

  // 2. Limpiar tokens técnicos de despacho que ya tienen su propio badge/campo
  let cleaned = text
    // Eliminar CALLFIRST (ya se maneja en call_first)
    .replace(/\bCALLFIRST\b/gi, ' ')
    // Eliminar teléfonos (P#:..., TEL:..., PHONE:..., CELL:...)
    .replace(/(?:P#?|TEL|PHONE|CELL)[:\s]*[0-9\s().-]{7,15}/gi, ' ')
    // Eliminar metraje de caída (DROP:..., 0ROP:..., etc.)
    .replace(/(?:DR[O0]{1,2}P|DROP)[:\s->.]*[0-9]+(?:[.,]\d+)?(?:\s*FT)?/gi, ' ')
    // Eliminar tipo de cable (Type: RG-6, Type: RG-11, Type: EPON, RG-6, RG11, EPON)
    .replace(/(?:Type|Cable)[:\s]*(?:RG[- ]?(?:6|11|M|II)|EPON)\b/gi, ' ')
    .replace(/\b(?:RG[- ]?(?:6|11)|EPON)\b/gi, ' ')
    // Eliminar tipo de perforación (BORE:DW:1, BORE:SW:1, BORE:RD:2, BORE:SW:1,DW:1, BORE:N,CND:NU)
    .replace(/BORE[:\s]*(?:[A-Z]{2}[:\s]*\d+(?:,\s*[A-Z]{2,3}[:\s]*[A-Z0-9]+)*|N(?:,\s*CND[:\s]*[A-Z0-9]+)?\b)/gi, ' ')
    .replace(/\b(?:DW|SW|DV|SV|RD)[:\s]*\d+(?:,\s*(?:DW|SW|DV|SV|RD)[:\s]*\d+)*\b/gi, ' ')
    .replace(/\bCND[:\s]*[A-Z0-9]+\b/gi, ' ')
    // Eliminar indicador de cable temporal (TEMP:Y, TEMP:N)
    .replace(/\bTEMP[:\s]*[YN]\b/gi, ' ')
    // Eliminar etiquetas de obstáculos y premisa estándar
    .replace(/Obstacl(?:es|ias)?[:\s]*[A-Za-z0-9, ]*(?=\/|$|\b(?:Premise|NBR|NB|REMARKS?)\b)/gi, ' ')
    .replace(/Premise\s*(?:ACS)?[:\s]*[A-Za-z0-9, ]*(?=\/|$|\b(?:NBR|NB|REMARKS?)\b)/gi, ' ')
    // Eliminar aviso de vecino (NBR:2, NBR:N, NBR:1, NB:N, NB:2, NB)
    .replace(/\b(?:NBR|NB)[:\s]*[A-Za-z0-9]+\b/gi, ' ')
    .replace(/\bNB\b/gi, ' ')
    // Eliminar prefijo REMARK residual
    .replace(/\bREMARKS?[:\s-]*/gi, ' ')
    // Limpiar separadores, diagonales y tuberías repetidas
    .replace(/[/|~_\[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Eliminar signos de puntuación iniciales o finales
  cleaned = cleaned.replace(/^[\s/|,;:-]+|[\s/|,;:-]+$/g, '').trim();

  // Si lo que quedó es solo "N", "NO", "NONE" o vacío, descartarlo
  if (!cleaned || /^(?:N|NO|NONE|NULL)$/i.test(cleaned)) {
    return '';
  }

  return cleaned;
}

/**
 * Devuelve un resumen limpio, compacto y directo de las notas y alertas de campo.
 * Traduce términos técnicos a español conciso para no saturar el espacio visual.
 * Muestra '🟢 Acceso libre • Sin cruce de vecinos' cuando el predio no tiene restricciones.
 * @param {Object} order - Objeto con datos de la orden de trabajo
 * @returns {string} - Cadena formateada
 */
/**
 * Devuelve una lista de badges estructurados listos para renderizar como micro-chips
 * interactivos e independientes en las tarjetas del trabajo:
 * - Acceso: '🟢 Acceso libre' o '🐕 Perro' o '🔒 Portón' o '🏠 Req. Cliente' o '📞 Llamar 1ro'
 * - Cruce de Vecinos: '👥 Cruce: 1 vecino' o '👥 Cruce: 2 vecinos' (SOLO si hay cruce; si NBR:N no se muestra nada para evitar redundancia)
 * - Obstáculos: '🌿 Jardinería' o '💦 Aspersores'
 * - Cable Temporal: '⚡ Temp'
 * - Nota humana: 'Nota: ...'
 * @param {Object} order - Objeto con datos de la orden de trabajo
 * @returns {Array<Object>}
 */
export function getOrderFieldBadges(order) {
  if (!order) return [];
  const badges = [];
  const rawNotesStr = String(order.raw_notes || '').toUpperCase();

  // 0. TRABAJO PRIORITARIO (Resaltado en rojo en hoja de despacho)
  if (order.is_priority === 1 || order.is_priority === true) {
    badges.push({
      key: 'priority-red',
      type: 'priority',
      icon: '🔴',
      text: 'Prioritario',
      tooltip: 'Trabajo marcado en rojo en la hoja de despacho: necesario realizar',
      className: 'bg-rose-500/20 text-rose-300 border-rose-500/50 font-bold'
    });
  }

  // 1. CONDICIÓN DE ACCESO A LA PROPIEDAD (Soporta múltiples simultáneas)
  const pa = String(order.premise_access || 'N').trim().toUpperCase();
  const paList = pa.split(',').map(s => s.trim());
  let hasSpecificAccess = false;

  if (paList.includes('RQHM') || pa.includes('RQHM') || rawNotesStr.includes('RQHM')) {
    hasSpecificAccess = true;
    badges.push({
      key: 'access-rqhm',
      type: 'access',
      icon: '🏠',
      text: 'Req. Cliente',
      tooltip: 'Cliente en casa requerido para realizar el trabajo (RQHM)',
      className: 'bg-slate-800/70 text-slate-300 border-slate-700/60'
    });
  }

  if (paList.includes('DOG') || pa.includes('DOG') || /\bDOGS?\b/i.test(rawNotesStr)) {
    hasSpecificAccess = true;
    badges.push({
      key: 'access-dog',
      type: 'access',
      icon: '🐕',
      text: 'Perro',
      tooltip: 'Perro en la propiedad: Precaución al ingresar',
      className: 'bg-slate-800/70 text-slate-300 border-slate-700/60'
    });
  }

  if (paList.includes('GATE') || pa.includes('GATE') || pa.includes('LOCK') || /(?:PORT[OÓ]N|CANDADO|LOCKED\s*GATE)/i.test(rawNotesStr)) {
    hasSpecificAccess = true;
    badges.push({
      key: 'access-gate',
      type: 'access',
      icon: '🔒',
      text: 'Portón',
      tooltip: 'Portón cerrado o con candado / reja trasera',
      className: 'bg-slate-800/70 text-slate-300 border-slate-700/60'
    });
  }

  if (paList.includes('CALL') || pa.includes('CALL') || /\bCALLFIRST\b/i.test(rawNotesStr) || order.call_first === 1 || order.call_first === true) {
    hasSpecificAccess = true;
    badges.push({
      key: 'access-call',
      type: 'access',
      icon: '📞',
      text: 'Llamar 1ro',
      tooltip: 'Llamar al cliente antes de entrar a la propiedad',
      className: 'bg-slate-800/70 text-slate-300 border-slate-700/60'
    });
  }

  if (paList.includes('FREE') || (!hasSpecificAccess && (pa === 'N' || pa === 'FREE' || pa === ''))) {
    badges.push({
      key: 'access-free',
      type: 'access',
      icon: '🟢',
      text: 'Acceso libre',
      tooltip: 'Acceso libre a la propiedad sin restricciones reportadas',
      className: 'bg-slate-800/70 text-slate-300 border-slate-700/60'
    });
  }

  // 2. AVISO DE VECINOS (NBR) - SOLO si hay cruce real
  let neighborVal = String(order.neighbor_notice || '').trim().toUpperCase();
  if (!neighborVal || neighborVal === 'UNDEFINED' || neighborVal === 'NULL') {
    const m = rawNotesStr.match(/\b(?:NBR|NB)[:\s]*([A-Za-z0-9]+)\b/i);
    if (m) {
      neighborVal = m[1].toUpperCase();
    } else if (/\bNB\b/i.test(rawNotesStr)) {
      neighborVal = 'N';
    }
  }

  const requiresNeighborCrossing = neighborVal && neighborVal !== 'N' && neighborVal !== 'NO' && neighborVal !== 'NONE' && neighborVal !== '0';

  if (requiresNeighborCrossing) {
    const countText = neighborVal === '1' ? '1 vecino' : neighborVal === '2' ? '2 vecinos' : /^\d+$/.test(neighborVal) ? `${neighborVal} vecinos` : 'vecinos';
    badges.push({
      key: 'neighbor-crossing',
      type: 'neighbor',
      icon: '👥',
      text: `Cruce: ${countText}`,
      tooltip: `Cruce de servidumbre requerido: pasa por la propiedad de ${countText}`,
      className: 'bg-slate-800/70 text-slate-300 border-slate-700/60 font-semibold shadow-2xs'
    });
  }

  // 3. OBSTÁCULOS DE TERRENO (Jardinería, Aspersores)
  if (order.obstacles && order.obstacles !== 'N') {
    const rawObs = String(order.obstacles).trim().toUpperCase();
    if (rawObs && rawObs !== 'N' && rawObs !== 'NONE') {
      const tokens = rawObs.split(/[,/]/).map(t => t.trim()).filter(Boolean);
      for (const tok of tokens) {
        if (tok.includes('LANDSC') || tok.includes('LANS') || tok === 'LA' || tok === 'L') {
          if (!badges.some(b => b.key === 'obs-landsc')) {
            badges.push({
              key: 'obs-landsc',
              type: 'obstacle',
              icon: '🌿',
              text: 'Jardinería',
              tooltip: 'Jardinería delicada: Cuidar plantas y canteros',
              className: 'bg-slate-800/70 text-slate-300 border-slate-700/60'
            });
          }
        } else if (tok.includes('SPRKLR') || tok.includes('SPRKL')) {
          if (!badges.some(b => b.key === 'obs-sprklr')) {
            badges.push({
              key: 'obs-sprklr',
              type: 'obstacle',
              icon: '💦',
              text: 'Aspersores',
              tooltip: 'Sistema de aspersores de riego enterrados en el césped',
              className: 'bg-slate-800/70 text-slate-300 border-slate-700/60'
            });
          }
        } else if (tok.includes('DGFEN') || tok === 'DG') {
          if (!badges.some(b => b.key === 'obs-dgfen')) {
            badges.push({
              key: 'obs-dgfen',
              type: 'obstacle',
              icon: '🐕',
              text: 'Cerca Perro',
              tooltip: 'Cerca para perros (invisible o física) en el terreno (DGFEN)',
              className: 'bg-slate-800/70 text-slate-300 border-slate-700/60'
            });
          }
        } else if (tok.includes('PRIVLITE') || tok.includes('PRIV')) {
          if (!badges.some(b => b.key === 'obs-privlite')) {
            badges.push({
              key: 'obs-privlite',
              type: 'obstacle',
              icon: '💡',
              text: 'Luz Privada',
              tooltip: 'Línea o iluminación privada enterrada en el jardín (PRIVLITE)',
              className: 'bg-slate-800/70 text-slate-300 border-slate-700/60'
            });
          }
        }
      }
    }
  }

  // 4. CABLE TEMPORAL
  const hasTemp =
    order.is_temp === 1 ||
    order.is_temp === true ||
    /\bTEMP[:\s]*Y\b/i.test(rawNotesStr);
  if (hasTemp) {
    badges.push({
      key: 'temp-cable',
      type: 'temp',
      icon: '⚡',
      text: 'Línea Temp',
      tooltip: 'Cable temporal superficial ya tendido en el terreno',
      className: 'bg-slate-800/70 text-slate-300 border-slate-700/60'
    });
  }

  // 5. NOTA HUMANA REAL (Limpia)
  if (order.raw_notes && typeof order.raw_notes === 'string') {
    const cleanedNotes = cleanRawNotes(order.raw_notes);
    if (
      cleanedNotes &&
      cleanedNotes.toUpperCase() !== String(order.address || '').toUpperCase() &&
      !/^(?:N|NO|NONE|NULL)$/i.test(cleanedNotes)
    ) {
      badges.push({
        key: 'human-note',
        type: 'note',
        tag: 'Nota',
        tagClassName: 'text-amber-400 text-[9px] uppercase tracking-wider font-semibold',
        text: cleanedNotes,
        tooltip: `Nota del despacho: ${cleanedNotes}`,
        className: 'bg-slate-800/70 text-slate-300 border-slate-700/60 max-w-xs sm:max-w-sm truncate'
      });
    }
  }

  return badges;
}

/**
 * Devuelve un resumen limpio, compacto y directo de las notas y alertas de campo.
 * Traduce términos técnicos a español conciso para no saturar el espacio visual.
 * Muestra la condición de acceso (🟢 Acceso libre, 🐕 Perro, etc.) SIEMPRE DE PRIMERO.
 * @param {Object} order - Objeto con datos de la orden de trabajo
 * @returns {string} - Cadena formateada
 */
export function getOrderRemark(order) {
  if (!order) return '🟢 Acceso libre';
  const parts = [];
  const rawNotesStr = String(order.raw_notes || '').toUpperCase();
  const pa = String(order.premise_access || 'N').trim().toUpperCase();

  // 0. TRABAJO PRIORITARIO (Resaltado en rojo en hoja de despacho)
  if (order.is_priority === 1 || order.is_priority === true) {
    parts.push('🔴 Prioritario');
  }

  // 1. TIPO DE PERFORACIÓN / CRUCE (Bore: DW, SW, RD)
  const boreInfo = getBoreInfo(order.bore_type);
  if (boreInfo && boreInfo.label) {
    parts.push(`🚗 ${boreInfo.label}`);
  }

  // 2. CONDICIONES DE ACCESO A LA PROPIEDAD (Soporta múltiples combinadas)
  let addedAccessPart = false;
  const paList = pa.split(',').map(s => s.trim());

  if (paList.includes('RQHM') || pa.includes('RQHM') || rawNotesStr.includes('RQHM')) {
    parts.push('🏠 Req. Cliente');
    addedAccessPart = true;
  }
  if (paList.includes('DOG') || pa.includes('DOG') || /\bDOGS?\b/i.test(rawNotesStr)) {
    parts.push('🐕 Perro');
    addedAccessPart = true;
  }
  if (paList.includes('GATE') || pa.includes('GATE') || pa.includes('LOCK') || /(?:PORT[OÓ]N|CANDADO|LOCKED\s*GATE)/i.test(rawNotesStr)) {
    parts.push('🔒 Portón');
    addedAccessPart = true;
  }
  if (paList.includes('CALL') || pa.includes('CALL') || /\bCALLFIRST\b/i.test(rawNotesStr) || order.call_first === 1 || order.call_first === true) {
    parts.push('📞 Llamar 1ro');
    addedAccessPart = true;
  }
  if (paList.includes('FREE') || (!addedAccessPart && (pa === 'N' || pa === 'FREE' || pa === ''))) {
    parts.push('🟢 Acceso libre');
  }

  // 2. AVISO DE VECINOS (NBR / NB) - Interpretación automática en español (SOLO si hay cruce real)
  let neighborVal = String(order.neighbor_notice || '').trim().toUpperCase();
  if (!neighborVal || neighborVal === 'UNDEFINED' || neighborVal === 'NULL') {
    const m = rawNotesStr.match(/\b(?:NBR|NB)[:\s]*([A-Za-z0-9]+)\b/i);
    if (m) {
      neighborVal = m[1].toUpperCase();
    } else if (/\bNB\b/i.test(rawNotesStr)) {
      neighborVal = 'N';
    }
  }

  const requiresNeighborCrossing = neighborVal && neighborVal !== 'N' && neighborVal !== 'NO' && neighborVal !== 'NONE' && neighborVal !== '0';
  if (requiresNeighborCrossing) {
    const countText = neighborVal === '1' ? '1 vecino' : neighborVal === '2' ? '2 vecinos' : /^\d+$/.test(neighborVal) ? `${neighborVal} vecinos` : 'vecinos';
    parts.push(`👥 Cruce: ${countText}`);
  }

  // 3. OBSTÁCULOS DE TERRENO (Jardinería, Aspersores)
  if (order.obstacles && order.obstacles !== 'N') {
    const rawObs = String(order.obstacles).trim().toUpperCase();
    if (rawObs && rawObs !== 'N' && rawObs !== 'NONE') {
      const tokens = rawObs.split(/[,/]/).map(t => t.trim()).filter(Boolean);
      for (const tok of tokens) {
        if (tok.includes('LANDSC') || tok.includes('LANS') || tok === 'LA' || tok === 'L') {
          if (!parts.some(p => /jardiner[ií]a/i.test(p))) parts.push('🌿 Jardinería');
        } else if (tok.includes('SPRKLR') || tok.includes('SPRKL')) {
          if (!parts.some(p => /aspersor/i.test(p))) parts.push('💦 Aspersores');
        } else if (tok.includes('DGFEN') || tok === 'DG') {
          if (!parts.some(p => /cerca perro/i.test(p))) parts.push('🐕 Cerca Perro');
        } else if (tok.includes('PRIVLITE') || tok.includes('PRIV')) {
          if (!parts.some(p => /luz privada/i.test(p))) parts.push('💡 Luz Privada');
        } else {
          const cleanObs = tok.replace(/^remark[:\s-]*/i, '').trim();
          if (cleanObs && cleanObs !== 'N' && !parts.some(p => p.toUpperCase().includes(cleanObs))) {
            parts.push(cleanObs);
          }
        }
      }
    }
  }

  // 4. INDICADOR DE CABLE TEMPORAL
  const hasTemp =
    order.is_temp === 1 ||
    order.is_temp === true ||
    /\bTEMP[:\s]*Y\b/i.test(rawNotesStr);
  if (hasTemp && !parts.some(p => /temporal/i.test(p))) {
    parts.push('⚡ Cable Temporal');
  }

  // 5. OBSERVACIÓN HUMANA LIMPIA (Al final de las especificaciones)
  if (order.raw_notes && typeof order.raw_notes === 'string') {
    const cleanedNotes = cleanRawNotes(order.raw_notes);
    if (
      cleanedNotes &&
      cleanedNotes.toUpperCase() !== String(order.address || '').toUpperCase() &&
      !/^(?:N|NO|NONE|NULL)$/i.test(cleanedNotes)
    ) {
      parts.push(`Nota: ${cleanedNotes}`);
    }
  }

  return parts.join(' • ');
}

/**
 * Diccionario maestro con las definiciones, códigos de despacho de Comcast/Xfinity,
 * patrones de deducción de la IA y recomendaciones operativas de campo para cada badge.
 */
export const BADGE_DEFINITIONS = {
  'priority-red': {
    key: 'priority-red',
    icon: '🔴',
    title: 'Trabajo Prioritario',
    dispatchCode: 'Fila / Celda en Color Rojo',
    category: 'Prioridad y Despacho',
    colorClasses: {
      badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      glow: 'shadow-rose-500/20',
      accent: 'text-rose-400'
    },
    aiPattern: 'Fila o celda con fondo rojo/rosado o parámetro is_priority = true',
    description: 'Trabajo crítico o prioritario asignado por el supervisor o la mesa de despacho de Comcast. Es de realización obligatoria en la jornada.',
    fieldTips: 'Atiende esta orden con máxima prioridad en tu ruta diaria. Si existe algún impedimento de fuerza mayor, notifícalo de inmediato al supervisor.'
  },
  'access-free': {
    key: 'access-free',
    icon: '🟢',
    title: 'Acceso Libre al Predio',
    dispatchCode: 'Premise ACS: N / Sin Restricciones',
    category: 'Condición de Acceso',
    colorClasses: {
      badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      glow: 'shadow-emerald-500/20',
      accent: 'text-emerald-400'
    },
    aiPattern: 'Premise ACS = N o ausencia de restricciones de premisa (RQHM, DOG, GATE, CALL)',
    description: 'El predio o patio no tiene portones cerrados, candados, perros ni requisitos de presencia del cliente reportados.',
    fieldTips: 'Puedes ingresar de manera directa al patio para tender y enterrar la línea sin necesidad de esperar al cliente.'
  },
  'access-call': {
    key: 'access-call',
    icon: '📞',
    title: 'Llamar Antes de Entrar',
    dispatchCode: 'CALLFIRST / Premise ACS: CALL',
    category: 'Condición de Acceso',
    colorClasses: {
      badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
      glow: 'shadow-cyan-500/20',
      accent: 'text-cyan-400'
    },
    aiPattern: 'Token CALLFIRST, CALL: o campo call_first = true con número telefónico',
    description: 'El cliente o despacho exige una llamada telefónica previa antes de que el técnico ingrese a la propiedad.',
    fieldTips: 'Llama al cliente unos 10-15 minutos antes de llegar para avisarle que vas a acceder al patio a realizar el drop bury.'
  },
  'access-rqhm': {
    key: 'access-rqhm',
    icon: '🏠',
    title: 'Cliente en Casa Requerido',
    dispatchCode: 'Premise ACS: RQHM (Require Homeowner)',
    category: 'Condición de Acceso',
    colorClasses: {
      badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
      glow: 'shadow-blue-500/20',
      accent: 'text-blue-400'
    },
    aiPattern: 'Sigla RQHM en columna Premise ACS o en las notas de despacho',
    description: 'El cliente debe estar físicamente en la casa para autorizar el paso, abrir accesos interiores o firmar la orden.',
    fieldTips: 'Toca el timbre o llama al cliente apenas llegues. Si nadie responde, no ingreses al patio trasero sin autorización expresa.'
  },
  'access-dog': {
    key: 'access-dog',
    icon: '🐕',
    title: 'Perro en la Propiedad',
    dispatchCode: 'Premise ACS: DOG / DOGS',
    category: 'Condición de Acceso',
    colorClasses: {
      badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      glow: 'shadow-rose-500/20',
      accent: 'text-rose-400'
    },
    aiPattern: 'Palabra DOG o DOGS en Premise ACS o en notas de terreno',
    description: 'Se reportó la presencia de perro(s) en el patio o terreno donde debe enterrarse la línea.',
    fieldTips: 'Verifica visualmente desde afuera de la cerca antes de abrir el portón. Si el perro está suelto, solicita al cliente que lo guarde.'
  },
  'access-gate': {
    key: 'access-gate',
    icon: '🔒',
    title: 'Portón Cerrado / Candado',
    dispatchCode: 'Premise ACS: GATE / LOCK',
    category: 'Condición de Acceso',
    colorClasses: {
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      glow: 'shadow-amber-500/20',
      accent: 'text-amber-400'
    },
    aiPattern: 'Términos GATE, LOCK, PORTÓN o CANDADO en Premise ACS o notas',
    description: 'El patio trasero cuenta con portón con candado, pestillo cerrado o reja de seguridad.',
    fieldTips: 'Revisa las notas del trabajo por si el cliente dejó un código de candado numérico (ej. 4421). Si está cerrado, contacta al cliente.'
  },
  'neighbor-crossing': {
    key: 'neighbor-crossing',
    icon: '👥',
    title: 'Cruce de Servidumbre Vecinal',
    dispatchCode: 'NBR: 1 / NBR: 2 / NBR: Y / NB: 1',
    category: 'Servidumbre y Vecinos',
    colorClasses: {
      badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      glow: 'shadow-purple-500/20',
      accent: 'text-purple-400'
    },
    aiPattern: 'Token NBR o NB con número de vecinos (ej. NBR:1 = 1 vecino)',
    description: 'La trayectoria de la acometida/cable pasa obligatoriamente por la propiedad de uno o más vecinos contiguos.',
    fieldTips: 'Respeta la servidumbre de servicios públicos (easement). Cuida el césped del vecino y deja el terreno limpio e intacto.'
  },
  'obs-landsc': {
    key: 'obs-landsc',
    icon: '🌿',
    title: 'Jardinería Delicada',
    dispatchCode: 'Obstacles: LANDSC / LANS / LA',
    category: 'Obstáculos de Terreno',
    colorClasses: {
      badge: 'bg-emerald-600/20 text-emerald-300 border-emerald-600/40',
      glow: 'shadow-emerald-600/20',
      accent: 'text-emerald-400'
    },
    aiPattern: 'Token LANDSC o LANS en la columna Obstacles o notas',
    description: 'El terreno tiene canteros de flores, arbustos decorativos, mulch o plantas delicadas en la trayectoria del cable.',
    fieldTips: 'Evita meter la máquina sobre canteros ornamentales; abre la zanja a mano con pala plana y recoloca el mulch o la tierra.'
  },
  'obs-sprklr': {
    key: 'obs-sprklr',
    icon: '💦',
    title: 'Aspersores de Riego',
    dispatchCode: 'Obstacles: SPRKLR / SPRKL',
    category: 'Obstáculos de Terreno',
    colorClasses: {
      badge: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
      glow: 'shadow-sky-500/20',
      accent: 'text-sky-400'
    },
    aiPattern: 'Token SPRKLR o SPRKL en la columna de Obstacles',
    description: 'Sistema de tuberías plásticas y cabezales de riego subterráneo enterrados en el césped a baja profundidad.',
    fieldTips: 'Extrema precaución al enterrar el drop. Si ves cabezales de aspersor, traza una ruta que mantenga distancia para no romper tuberías.'
  },
  'temp-cable': {
    key: 'temp-cable',
    icon: '⚡',
    title: 'Cable Temporal Superficial',
    dispatchCode: 'TEMP: Y',
    category: 'Estado de la Línea',
    colorClasses: {
      badge: 'bg-amber-600/20 text-amber-300 border-amber-600/40',
      glow: 'shadow-amber-600/20',
      accent: 'text-amber-400'
    },
    aiPattern: 'Token TEMP:Y en especificaciones técnicas de la orden',
    description: 'El técnico instalador previo ya dejó un cable temporal RG-6 o RG-11 tendido sobre la hierba para dar servicio provisional.',
    fieldTips: 'Verifica la ruta del cable temporal antes de empezar. El trabajo consiste en enterrar permanentemente esa línea o reemplazarla si está dañada.'
  },
  'obs-privlite': {
    key: 'obs-privlite',
    icon: '💡',
    title: 'Luces Privadas Subterráneas',
    dispatchCode: 'Obstacles: PRIVLITE / PRIV',
    category: 'Obstáculos de Terreno',
    colorClasses: {
      badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
      glow: 'shadow-indigo-500/20',
      accent: 'text-indigo-400'
    },
    aiPattern: 'Token PRIVLITE en Obstacles (Private Lighting)',
    description: 'El cliente instaló cables de iluminación privada, faroles de entrada o reflectores enterrados por su cuenta.',
    fieldTips: 'Recuerda que el 811 NO marca cables privados. Cava con cuidado en zonas cercanas a faroles, senderos o entradas de vehículos.'
  },
  'human-note': {
    key: 'human-note',
    icon: '📝',
    title: 'Observaciones de Despacho',
    dispatchCode: 'REMARK: / REMARKS: / Notas Libres',
    category: 'Indicaciones Especiales',
    colorClasses: {
      badge: 'bg-slate-700/30 text-slate-200 border-slate-600/50',
      glow: 'shadow-slate-500/10',
      accent: 'text-slate-300'
    },
    aiPattern: 'Texto redactado por despachadores o clientes filtrado por IA',
    description: 'Instrucciones específicas escritas por despacho (código de candado, ubicación del pedestal, advertencias especiales).',
    fieldTips: 'Lee atentamente el texto completo para seguir las indicaciones precisas del cliente o de la empresa.'
  },
  'bore-dw': {
    key: 'bore-dw',
    icon: '🚗',
    title: 'Driveway Bore (+$30)',
    dispatchCode: 'BORE: DW:1 / BORE: DW',
    category: 'Perforaciones y Cruces',
    colorClasses: {
      badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
      glow: 'shadow-cyan-500/20',
      accent: 'text-cyan-400'
    },
    aiPattern: 'Sigla DW o BORE:DW:1 en especificaciones de despacho',
    description: 'Cruce subterráneo bajo entrada vehicular de concreto o asfalto. Es la perforación remunerada con bono directo.',
    fieldTips: 'Perfora con la máquina o tuneladora por debajo de la losa de concreto. Este cruce devenga un bono extra de +$30 en tu tarifa.'
  },
  'bore-sw': {
    key: 'bore-sw',
    icon: '🚶',
    title: 'Sidewalk Bore (Acera)',
    dispatchCode: 'BORE: SW:1 / BORE: SW',
    category: 'Perforaciones y Cruces',
    colorClasses: {
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      glow: 'shadow-amber-500/20',
      accent: 'text-amber-400'
    },
    aiPattern: 'Sigla SW o BORE:SW:1 en columna BORE',
    description: 'Perforación o cruce bajo acera/vereda peatonal. Requiere pasar el cable por debajo del concreto a tarifa base sin bono.',
    fieldTips: 'Pasa el cable por debajo de la acera con barra o pala de tiro. Se liquida a la tarifa base ($100).'
  },
  'bore-both': {
    key: 'bore-both',
    icon: '🛣️',
    title: 'Driveway + Acera (+$30)',
    dispatchCode: 'BORE: SW:1,DW:1',
    category: 'Perforaciones y Cruces',
    colorClasses: {
      badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
      glow: 'shadow-cyan-500/20',
      accent: 'text-cyan-400'
    },
    aiPattern: 'Combinación de DW y SW en el mismo trabajo',
    description: 'La orden requiere cruzar tanto la entrada vehicular (driveway) como la acera peatonal (sidewalk).',
    fieldTips: 'Realiza ambas perforaciones. Devenga el bono completo de +$30 por el cruce vehicular.'
  },
  'obs-dgfen': {
    key: 'obs-dgfen',
    icon: '🚧',
    title: 'Cerca Invisible / Dog Fence (DGFEN)',
    dispatchCode: 'Obstacles: DGFEN',
    category: 'Obstáculos Subterráneos',
    colorClasses: {
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      glow: 'shadow-amber-500/20',
      accent: 'text-amber-400'
    },
    aiPattern: 'Código DGFEN / DG en columna Obstacles',
    description: 'El cliente tiene una cerca invisible eléctrica subterránea para mascotas. Puede cortarse accidentalmente al abrir zanja.',
    fieldTips: 'Avisa al cliente antes de zanjear, pregunta dónde corre el lazo perimetral y excava manualmente con cuidado en los cruces.'
  },
  'bore-rd': {
    key: 'bore-rd',
    icon: '🛣️',
    title: 'Road Bore / Cruce de Calle (B002)',
    dispatchCode: 'BORE: RD:1 / RD:2',
    category: 'Perforaciones y Cruces',
    colorClasses: {
      badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      glow: 'shadow-emerald-500/20',
      accent: 'text-emerald-400'
    },
    aiPattern: 'Código RD:1 o RD:2 en columna BORE',
    description: 'Perforación direccional bajo calle/calzada (Road Bore). Se liquida por pie lineal perforado bajo el código B002 ($2.50/ft por defecto).',
    fieldTips: 'Registra los pies exactos perforados bajo calle en el campo Road Bore (ft) para reflejar la compensación oficial B002.'
  },
  'cable-epon': {
    key: 'cable-epon',
    icon: '⚡',
    title: 'Fibra Óptica (EPON)',
    dispatchCode: 'Type: EPON / Type: E PON',
    category: 'Tipo de Acometida',
    colorClasses: {
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      glow: 'shadow-amber-500/20',
      accent: 'text-amber-400'
    },
    aiPattern: 'Texto Type:EPON en columna de cable',
    description: 'Acometida de fibra óptica FTTH de alta velocidad de Comcast Xfinity (EPON). Requiere manejo cuidadoso del radio de curvatura.',
    fieldTips: 'Maneja el cable de fibra con cuidado especial: evita quiebres pronunciados o tensión excesiva en las esquinas del predio.'
  }
};

/**
 * Obtiene la información detallada, técnica y operacional de un badge,
 * contextualizada opcionalmente con los datos de una orden específica.
 */
export function getBadgeDetailedInfo(badgeKeyOrType, order = null) {
  let key = badgeKeyOrType;
  if (typeof badgeKeyOrType === 'object' && badgeKeyOrType !== null) {
    key = badgeKeyOrType.key || badgeKeyOrType.type;
  }
  const def = BADGE_DEFINITIONS[key] || {
    key: key || 'unknown',
    icon: 'ℹ️',
    title: 'Detalle de Alerta',
    dispatchCode: 'Código Xfinity',
    category: 'Información de Campo',
    colorClasses: {
      badge: 'bg-slate-800 text-slate-300 border-slate-700',
      glow: 'shadow-slate-500/20',
      accent: 'text-slate-300'
    },
    aiPattern: 'Detección automática por AuraCore-AI',
    description: 'Indicador de terreno o condición técnica detectada en la hoja de despacho.',
    fieldTips: 'Consulta con tu supervisor si tienes dudas sobre esta especificación.'
  };

  let orderContext = null;
  if (order) {
    const rawNotesStr = String(order.raw_notes || '');
    let matchedRaw = '';
    if (key === 'priority-red') {
      matchedRaw = order.is_priority ? 'is_priority: 1 (Fila/celda en color rojo)' : 'Sin prioridad marcada';
    } else if (key === 'access-free') {
      matchedRaw = `premise_access: ${order.premise_access || 'N'} (Sin restricciones reportadas)`;
    } else if (key === 'access-call') {
      matchedRaw = `call_first: ${Boolean(order.call_first)} • Tel: ${order.phone || 'No reportado'}`;
    } else if (key === 'access-rqhm') {
      matchedRaw = `premise_access: RQHM (Cliente en casa requerido)`;
    } else if (key === 'access-dog') {
      matchedRaw = `premise_access: DOG (Perro reportado en predio)`;
    } else if (key === 'access-gate') {
      matchedRaw = `premise_access: GATE (Portón/candado reportado)`;
    } else if (key === 'neighbor-crossing') {
      matchedRaw = `neighbor_notice: ${order.neighbor_notice || 'N'} (${order.neighbor_notice === '1' ? '1 vecino' : order.neighbor_notice === '2' ? '2 vecinos' : 'Cruce requerido'})`;
    } else if (key.startsWith('obs-')) {
      matchedRaw = `obstacles: ${order.obstacles || 'N'}`;
    } else if (key === 'temp-cable') {
      matchedRaw = `is_temp: ${Boolean(order.is_temp)} (Cable temporal superficial)`;
    } else if (key === 'human-note') {
      matchedRaw = rawNotesStr || 'Sin notas adicionales';
    }

    orderContext = {
      jobId: order.job_id || 'Sin Job ID',
      address: order.address || 'Sin dirección',
      city: order.city || '',
      phone: order.phone || '',
      cableType: order.cable_type || 'RG-6',
      footage: order.drop_footage || 0,
      isPriority: Boolean(order.is_priority),
      matchedRaw,
      rawNotes: rawNotesStr
    };
  }

  return {
    ...def,
    orderContext
  };
}

/**
 * getBoreInfo
 * Normaliza y clasifica cualquier tipo de perforación/cruce (DW, SW, RD, etc.)
 * Proporciona etiquetas limpias, bonificaciones y estilos consistentes para toda la app.
 */
/**
 * getBoreInfo
 * Normaliza y clasifica cualquier tipo de perforación/cruce (DW, SW, RD, etc.)
 * Proporciona etiquetas limpias combinadas (SW + DW + RD), bonificaciones y estilos
 * consistentes para toda la app sin textos redundantes.
 */
export function getBoreInfo(boreType) {
  if (!boreType || boreType === 'N' || boreType === 'NONE') return null;
  const s = String(boreType).toUpperCase().trim();
  if (s === 'N' || s === '' || s.startsWith('N/') || s.startsWith('N,')) return null;

  const labels = [];
  const types = [];

  // 1. Sidewalk / Acera
  const swMatch = s.match(/\b(?:SW|SV)[:\s]*(\d+)/i);
  const hasSW = Boolean(swMatch) || /\b(?:SW|SV)\b/i.test(s) || s.includes('SIDEWALK');
  const swQty = swMatch ? (parseInt(swMatch[1], 10) || 1) : (hasSW ? 1 : 0);
  if (hasSW) {
    labels.push(swQty > 1 ? `SW:${swQty}` : 'SW');
    types.push('SW');
  }

  // 2. Driveway / Entrada vehicular
  const dwMatch = s.match(/\b(?:DW|DV|DOW)[:\s]*(\d+)/i);
  const hasDW = Boolean(dwMatch) || /\b(?:DW|DV|DOW)\b/i.test(s) || s.includes('DRIVEWAY');
  const dwQty = dwMatch ? (parseInt(dwMatch[1], 10) || 1) : (hasDW ? 1 : 0);
  if (hasDW) {
    labels.push(dwQty > 1 ? `DW:${dwQty}` : 'DW');
    types.push('DW');
  }

  // 3. Road Bore / Cruce de calle
  const rdMatch = s.match(/\bRD[:\s]*(\d+)/i);
  const hasRD = Boolean(rdMatch) || /\bRD\b/i.test(s) || s.includes('ROAD');
  const rdQty = rdMatch ? (parseInt(rdMatch[1], 10) || 1) : (hasRD ? 1 : 0);
  if (hasRD) {
    labels.push(rdQty > 1 ? `RD:${rdQty}` : 'RD');
    types.push('RD');
  }

  if (labels.length === 0) {
    return {
      type: 'OTHER',
      label: s,
      fullLabel: `Bore: ${s}`,
      bonus: 0,
      hasBonus: false,
      hasDriveway: false,
      hasRoadBore: false,
      hasSidewalk: false,
      dotColor: 'bg-slate-400',
      badgeTextClass: 'text-slate-200 font-semibold',
      badgeClass: 'bg-slate-800/70 text-slate-300 border-slate-700/60'
    };
  }

  const combinedLabel = labels.join(' + ');
  const dwBonus = dwQty * 30; // $30 por cada driveway

  // Color de punto indicador según complejidad
  let dotColor = 'bg-cyan-400';
  if (hasRD) {
    dotColor = 'bg-purple-400'; // Destacar calle / road bore
  } else if (hasDW) {
    dotColor = 'bg-cyan-400'; // Driveway con bono
  } else {
    dotColor = 'bg-amber-400/90'; // Solo acera
  }

  return {
    type: types.join('+'),
    label: combinedLabel,
    fullLabel: `Bore: ${combinedLabel}`,
    bonus: dwBonus,
    hasBonus: dwBonus > 0,
    hasDriveway: hasDW,
    drivewayCount: dwQty,
    hasRoadBore: hasRD,
    roadBoreCount: rdQty,
    hasSidewalk: hasSW,
    sidewalkCount: swQty,
    dotColor,
    badgeTextClass: 'text-slate-200 font-semibold',
    badgeClass: 'bg-slate-800/70 text-slate-300 border-slate-700/60'
  };
}

/**
 * formatCableType
 * Muestra 'Fibra' para cables tipo EPON o fibra óptica, y 'RG-6'/'RG-11' para coaxiales.
 */
export function formatCableType(cableType) {
  if (!cableType) return 'RG-6';
  const s = String(cableType).toUpperCase().trim();
  if (s === 'EPON' || s.includes('FIBER') || s.includes('FIBRA') || s.includes('FTTH') || s.includes('OPTIC')) {
    return 'Fibra';
  }
  return cableType;
}
