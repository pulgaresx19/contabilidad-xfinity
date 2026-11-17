/**
 * Utilidades para manejo de teléfono y mensajería SMS con clientes Comcast / Xfinity.
 */

/**
 * Limpia un número telefónico extrayendo solo dígitos útiles.
 * Si tiene 11 dígitos y empieza con 1 (código de país USA), retira el 1 inicial.
 */
export function cleanPhoneNumber(phone) {
  if (!phone) return '';
  const str = String(phone).trim();
  const digits = str.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits || str;
}

/**
 * Formatea un número de 10 dígitos al formato estándar (XXX) XXX-XXXX para visualización.
 */
export function formatPhoneDisplay(phone) {
  const cleaned = cleanPhoneNumber(phone);
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone || '';
}

/**
 * Plantilla predeterminada del mensaje SMS para el cliente.
 * Soporta marcadores dinámicos (Dirección) y (Operador).
 */
export const DEFAULT_SMS_TEMPLATE =
  "Xfinity / Comcast Notice for (Dirección): Hi, this is (Operador), your Drop Bury technician. I'll be working outside shortly to bury your exterior cable line. You do not need to be home or come outside—this is just a courtesy notice. Please text back ONLY if you have a locked gate, pets in the yard, or private sprinklers/invisible dog fences. Thank you!";

/**
 * Obtiene el nombre del técnico configurado en los ajustes locales si no se proporciona explícitamente.
 */
export function getStoredTechName() {
  try {
    if (typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem('xfinity_cached_settings');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.tech_default) return parsed.tech_default;
      }
    }
  } catch (e) {}
  return null;
}

/**
 * Obtiene la plantilla SMS configurada en Ajustes o devuelve la predeterminada.
 */
export function getStoredSmsTemplate() {
  try {
    if (typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem('xfinity_cached_settings');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.sms_template && String(parsed.sms_template).trim()) {
          return String(parsed.sms_template).trim();
        }
      }
    }
  } catch (e) {}
  return DEFAULT_SMS_TEMPLATE;
}

/**
 * Normaliza y formatea el nombre del técnico para presentación al cliente.
 * Prioridad:
 * 1. El nombre configurado actualmente en Ajustes / Perfil (el técnico que está operando el teléfono).
 * 2. El nombre asignado en la orden/reporte de trabajo.
 * 3. Fallback general.
 * 
 * Además, remueve sufijos de sistema entre paréntesis como "Carlos (P0G1)" -> "Carlos",
 * dejando un nombre humano, limpio y profesional para el cliente en el SMS.
 */
export function formatTechDisplayName(rawName) {
  // Prioridad 1: Ajustes / Perfil activo del teléfono
  const stored = getStoredTechName();
  let name = stored || rawName;
  if (!name) return 'Javier';

  // Remover sufijos de sistema entre paréntesis como (P0G1) o (1234)
  const cleaned = name.replace(/\s*\([^)]*\)/g, '').trim();
  return cleaned || name.trim() || 'Javier';
}

/**
 * Redacta el mensaje formal en inglés para el cliente antes de enterrar el cable,
 * reemplazando dinámicamente (Dirección) y (Operador) según la plantilla de Ajustes.
 */
export function getCustomerSmsText(address = '', techName = '', customTemplate = null) {
  const finalTechName = formatTechDisplayName(techName);
  const cleanAddr = address && String(address).trim() ? String(address).trim() : 'your property';
  const rawTemplate =
    customTemplate !== null && customTemplate !== undefined && String(customTemplate).trim()
      ? String(customTemplate).trim()
      : getStoredSmsTemplate();

  return rawTemplate
    .replace(/(\(Direcci[oó]n\)|\[Direcci[oó]n\]|\{Direcci[oó]n\})/gi, cleanAddr)
    .replace(/(\(Operador\)|\[Operador\]|\{Operador\})/gi, finalTechName);
}

/**
 * Genera el enlace de protocolo nativo `sms:` compatible tanto con iOS (iPhone) como con Android.
 * iOS usa `&body=` mientras que Android y el estándar RFC usan `?body=`.
 */
export function getCustomerSmsUrl(phone, address = '', techName = '') {
  const cleaned = cleanPhoneNumber(phone);
  if (!cleaned) return '';

  // Formato internacional para llamadas/SMS en USA (+1XXXXXXXXXX)
  const targetPhone = cleaned.length === 10 ? `+1${cleaned}` : cleaned;
  const message = getCustomerSmsText(address, techName);

  // Detección de iOS (iPhone / iPad) para compatibilidad del separador de parámetros
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent || '');
  const separator = isIOS ? '&' : '?';

  return `sms:${targetPhone}${separator}body=${encodeURIComponent(message)}`;
}
