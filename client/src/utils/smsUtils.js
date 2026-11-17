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
 * Normaliza y formatea el nombre del técnico para presentación al cliente.
 * Remueve códigos técnicos entre paréntesis como "Carlos (P0G1)" -> "Carlos",
 * dejando un nombre humano y profesional para el cliente en el SMS.
 */
export function formatTechDisplayName(rawName) {
  let name = rawName;
  if (!name || name === 'Javier') {
    const stored = getStoredTechName();
    if (stored) name = stored;
  }
  if (!name) return 'Javier';
  // Remover sufijos de técnico como (P0G1) o (1234)
  const cleaned = name.replace(/\s*\([^)]*\)/g, '').trim();
  return cleaned || name.trim() || 'Javier';
}

/**
 * Redacta el mensaje formal en inglés para el cliente antes de enterrar el cable.
 */
export function getCustomerSmsText(address = '', techName = '') {
  const finalTechName = formatTechDisplayName(techName);
  const cleanAddr = address ? ` at ${address.trim()}` : '';
  return `Hello! This is ${finalTechName}, your Xfinity / Comcast Drop Bury technician. I am in the area and preparing to bury your temporary cable line${cleanAddr}. If you have any locked gates, pets in the yard, or private underground systems (like sprinklers or invisible dog fences), please let me know. Thank you!`;
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
