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
export function getOrderRemark(order) {
  if (!order) return '🟢 Acceso libre • Sin cruce de vecinos';
  const parts = [];

  // 1. Observación humana limpia (sin repetir teléfono, pies, cable, bore, ni NBR)
  if (order.raw_notes && typeof order.raw_notes === 'string') {
    const cleanedNotes = cleanRawNotes(order.raw_notes);
    if (
      cleanedNotes &&
      cleanedNotes.toUpperCase() !== String(order.address || '').toUpperCase() &&
      !/^(?:N|NO|NONE|NULL)$/i.test(cleanedNotes)
    ) {
      parts.push(cleanedNotes);
    }
  }

  // 2. Alertas de jardinería y obstáculos especiales (conciso y directo)
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

  // 3. Indicador de Cable Temporal (conciso y directo)
  const hasTemp =
    order.is_temp === 1 ||
    order.is_temp === true ||
    /\bTEMP[:\s]*Y\b/i.test(String(order.raw_notes || ''));
  if (hasTemp && !parts.some(p => /temporal/i.test(p))) {
    parts.push('⚡ Cable Temporal');
  }

  // 4. Acceso y condiciones de premisa (RQHM, DOG, GATE, LOCK, CALL)
  const pa = String(order.premise_access || 'N').trim().toUpperCase();
  const rawNotesStr = String(order.raw_notes || '').toUpperCase();

  if (pa === 'RQHM' || rawNotesStr.includes('RQHM')) {
    if (!parts.some(p => /casa/i.test(p))) parts.push('🏠 Cliente en casa');
  } else if (pa === 'DOG' || /\bDOGS?\b/i.test(rawNotesStr)) {
    if (!parts.some(p => /perro/i.test(p))) parts.push('🐕 Perro');
  } else if (pa.includes('GATE') || pa.includes('LOCK') || /(?:PORT[OÓ]N|CANDADO|LOCKED\s*GATE)/i.test(rawNotesStr)) {
    if (!parts.some(p => /port[oó]n|candado/i.test(p))) parts.push('🔒 Portón');
  } else if (pa === 'CALL' || /\bCALLFIRST\b/i.test(rawNotesStr)) {
    if (!parts.some(p => /llamar/i.test(p))) parts.push('📞 Llamar antes');
  } else if (pa !== 'N' && pa !== 'NONE' && pa !== '') {
    if (!parts.some(p => p.toUpperCase().includes(pa))) parts.push(pa);
  }

  // 5. Aviso de Vecinos (NBR / NB) - Interpretación automática en español
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
    if (neighborVal === '1') {
      parts.push('👥 Cruce de 1 vecino');
    } else if (neighborVal === '2') {
      parts.push('👥 Cruce de 2 vecinos');
    } else if (neighborVal === 'Y' || neighborVal === 'YES') {
      parts.push('👥 Cruce de vecinos');
    } else if (/^\d+$/.test(neighborVal)) {
      parts.push(`👥 Cruce de ${neighborVal} vecinos`);
    } else {
      parts.push(`👥 Vecino: ${neighborVal}`);
    }
  }

  // 6. Si no hay ninguna restricción de premisa ni obstáculos ni cruce de vecinos:
  if (parts.length === 0) {
    return '🟢 Acceso libre • Sin cruce de vecinos';
  }

  // 7. Si hay detalles pero se confirma sin cruce de vecinos y no requiere vecino:
  if (!requiresNeighborCrossing && (neighborVal === 'N' || neighborVal === 'NO' || /\b(?:NBR|NB)[:\s]*N\b/i.test(rawNotesStr) || /\bNB\b/i.test(rawNotesStr))) {
    if (!parts.some(p => /vecino/i.test(p))) {
      parts.push('🟢 Sin cruce de vecinos');
    }
  }

  return parts.join(' • ');
}
