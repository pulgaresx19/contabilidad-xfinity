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
    // Eliminar tipo de cable (Type: RG-6, Type: RG-11, RG-6, RG11)
    .replace(/(?:Type|Cable)[:\s]*(?:RG[- ]?(?:6|11|M|II))/gi, ' ')
    .replace(/\bRG[- ]?(?:6|11)\b/gi, ' ')
    // Eliminar tipo de perforación (BORE:DW:1, BORE:SW:1, BORE:N)
    .replace(/BORE[:\s]*(?:DW[:\s]*1?|SW[:\s]*1?|DV[:\s]*1?|SV[:\s]*1?|N\b)/gi, ' ')
    .replace(/\b(?:DW|SW)[:\s]*1\b/gi, ' ')
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

  // 1. CONDICIÓN DE ACCESO A LA PROPIEDAD
  const pa = String(order.premise_access || 'N').trim().toUpperCase();
  if (pa === 'RQHM' || rawNotesStr.includes('RQHM')) {
    badges.push({
      key: 'access-rqhm',
      type: 'access',
      icon: '🏠',
      text: 'Req. Cliente',
      tooltip: 'Cliente en casa requerido para realizar el trabajo (RQHM)',
      className: 'bg-slate-800/70 text-slate-300 border-slate-700/60'
    });
  } else if (pa === 'DOG' || /\bDOGS?\b/i.test(rawNotesStr)) {
    badges.push({
      key: 'access-dog',
      type: 'access',
      icon: '🐕',
      text: 'Perro',
      tooltip: 'Perro en la propiedad: Precaución al ingresar',
      className: 'bg-slate-800/70 text-slate-300 border-slate-700/60'
    });
  } else if (pa.includes('GATE') || pa.includes('LOCK') || /(?:PORT[OÓ]N|CANDADO|LOCKED\s*GATE)/i.test(rawNotesStr)) {
    badges.push({
      key: 'access-gate',
      type: 'access',
      icon: '🔒',
      text: 'Portón',
      tooltip: 'Portón cerrado o con candado / reja trasera',
      className: 'bg-slate-800/70 text-slate-300 border-slate-700/60'
    });
  } else if (pa === 'CALL' || /\bCALLFIRST\b/i.test(rawNotesStr) || order.call_first === 1 || order.call_first === true) {
    badges.push({
      key: 'access-call',
      type: 'access',
      icon: '📞',
      text: 'Llamar 1ro',
      tooltip: 'Llamar al cliente antes de entrar a la propiedad',
      className: 'bg-slate-800/70 text-slate-300 border-slate-700/60'
    });
  } else {
    // Acceso completamente libre (predeterminado)
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
        if (tok.includes('LANDSC') || tok.includes('LANS')) {
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

  // 1. CONDICIÓN DE ACCESO A LA PROPIEDAD (SIEMPRE DE PRIMERO)
  if (pa === 'RQHM' || rawNotesStr.includes('RQHM')) {
    parts.push('🏠 Req. Cliente');
  } else if (pa === 'DOG' || /\bDOGS?\b/i.test(rawNotesStr)) {
    parts.push('🐕 Perro');
  } else if (pa.includes('GATE') || pa.includes('LOCK') || /(?:PORT[OÓ]N|CANDADO|LOCKED\s*GATE)/i.test(rawNotesStr)) {
    parts.push('🔒 Portón');
  } else if (pa === 'CALL' || /\bCALLFIRST\b/i.test(rawNotesStr) || order.call_first === 1 || order.call_first === true) {
    parts.push('📞 Llamar 1ro');
  } else if (pa !== 'N' && pa !== 'NONE' && pa !== '') {
    parts.push(pa);
  } else {
    // Si no tiene restricciones de acceso, ES ACCESO LIBRE Y VA DE PRIMERO
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
        if (tok.includes('LANDSC') || tok.includes('LANS')) {
          if (!parts.some(p => /jardiner[ií]a/i.test(p))) parts.push('🌿 Jardinería');
        } else if (tok.includes('SPRKLR') || tok.includes('SPRKL')) {
          if (!parts.some(p => /aspersor/i.test(p))) parts.push('💦 Aspersores');
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
