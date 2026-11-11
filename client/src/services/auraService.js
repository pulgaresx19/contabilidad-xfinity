import { compressImage, fileToDataUrl } from './imageUtils';

const STORAGE_KEY_URL = 'XFINITY_AURACORE_URL';

function resolveDefaultAuraUrl() {
  const envUrl =
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_AURACORE_URL;
  if (envUrl && String(envUrl).trim()) {
    return String(envUrl).trim().replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname } = window.location;
    if (protocol === 'http:' && hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `http://${hostname}:3100`;
    }
  }
  return 'http://localhost:3100';
}

export const DEFAULT_AURACORE_URL = resolveDefaultAuraUrl();

export function getAuraCoreUrl() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_URL);
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/+$/, '');
    }
  } catch {
    // Ignore storage access errors
  }
  return DEFAULT_AURACORE_URL;
}

export function setAuraCoreUrl(nextUrl) {
  const cleaned = String(nextUrl || '').trim().replace(/\/+$/, '');
  try {
    if (!cleaned || cleaned === DEFAULT_AURACORE_URL) {
      localStorage.removeItem(STORAGE_KEY_URL);
      return DEFAULT_AURACORE_URL;
    }
    const normalized = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
    localStorage.setItem(STORAGE_KEY_URL, normalized);
    return normalized;
  } catch {
    return cleaned || DEFAULT_AURACORE_URL;
  }
}

function splitDataUrl(dataUrl, fallbackMime = 'image/jpeg') {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;
  return {
    mimeType: (match[1] || fallbackMime).split(';')[0].trim(),
    data: match[2]
  };
}

export async function fileToInlineImage(fileOrBlob) {
  if (!fileOrBlob) return null;
  try {
    const compressed = await compressImage(fileOrBlob, 1400, 1400, 0.82);
    const dataUrl = compressed?.dataUrl || (await fileToDataUrl(fileOrBlob));
    return splitDataUrl(dataUrl, fileOrBlob.type || 'image/jpeg');
  } catch {
    const rawUrl = await fileToDataUrl(fileOrBlob);
    return splitDataUrl(rawUrl, fileOrBlob.type || 'image/jpeg');
  }
}

export async function blobToInlineAudio(blob) {
  if (!blob) return null;
  const dataUrl = await fileToDataUrl(blob);
  return splitDataUrl(dataUrl, blob.type || 'audio/webm');
}

export async function checkAuraCoreHealth() {
  const baseUrl = getAuraCoreUrl();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3500);
  try {
    const res = await fetch(`${baseUrl}/api/health`, { signal: ctrl.signal });
    const json = await res.json().catch(() => ({}));
    return {
      ok: Boolean(res.ok && json.ok),
      configured: Boolean(json.gemini?.configured ?? json.configured),
      model: json.gemini?.model || json.model || '',
      url: baseUrl
    };
  } catch (err) {
    return { ok: false, configured: false, model: '', url: baseUrl, error: err?.message || 'Sin conexión' };
  } finally {
    clearTimeout(timer);
  }
}

export function buildLocalOrdersSummary(orders = [], summaryData = null) {
  const list = Array.isArray(orders) ? orders : [];
  const totalRate = list.reduce((s, o) => s + (Number(o.rate_calculated) || 0), 0);
  const completedCount = list.filter((o) => o.status === 'Completada').length;
  const pendingCount = list.filter((o) => o.status !== 'Completada').length;

  return {
    stats: {
      totalOrdersLoaded: list.length,
      completedCount,
      pendingCount,
      totalEarningsLoaded: Math.round(totalRate * 100) / 100,
      summary: summaryData || null
    },
    recentOrders: list.slice(0, 20).map((o) => ({
      job_id: o.job_id || '',
      work_date: o.work_date || '',
      address: o.address || '',
      city: o.city || '',
      zip_code: o.zip_code || '',
      phone: o.phone || '',
      drop_footage: o.drop_footage || 0,
      cable_type: o.cable_type || 'RG-6',
      bore_type: o.bore_type || 'N',
      rate_calculated: o.rate_calculated || 100,
      status: o.status || 'Pendiente',
      payment_status: o.payment_status || 'Pendiente'
    }))
  };
}

export async function interactWithAuraCore({
  text = '',
  imageFile = null,
  audioBlob = null,
  defaultTech = '',
  defaultDate = '',
  orders = [],
  summaryData = null
} = {}) {
  const baseUrl = getAuraCoreUrl();
  const image = imageFile ? await fileToInlineImage(imageFile) : null;
  const audio = audioBlob ? await blobToInlineAudio(audioBlob) : null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), image ? 38000 : 22000);

  try {
    const res = await fetch(`${baseUrl}/api/interact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        appId: 'contabilidad',
        text: String(text || '').trim(),
        image,
        audio,
        context: {
          defaultTech,
          defaultDate,
          localSummary: buildLocalOrdersSummary(orders, summaryData)
        }
      })
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      throw new Error(json.error || `Error de AuraCore (${res.status})`);
    }
    return json;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`Tiempo agotado esperando respuesta de AuraCore (${baseUrl}).`);
    }
    if (err?.message?.includes('Failed to fetch')) {
      throw new Error(`No se pudo conectar con AuraCore en ${baseUrl}.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
