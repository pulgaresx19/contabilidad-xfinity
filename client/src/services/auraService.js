import { compressImage, fileToDataUrl } from './imageUtils';

const STORAGE_KEY_URL = 'XFINITY_AURACORE_URL';

export function resolveDefaultAuraUrl() {
  const envUrl =
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_AURACORE_URL;
  if (envUrl && String(envUrl).trim()) {
    return String(envUrl).trim().replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location) {
    const { origin, protocol, hostname, port } = window.location;
    if (hostname && hostname.endsWith('.trycloudflare.com')) {
      return `${origin}/auracore`;
    }
    if (protocol === 'http:' && hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return port === '5000' ? `${origin}/auracore` : `http://${hostname}:3100`;
    }
    if (protocol === 'https:' && hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `${origin}/auracore`;
    }
    if (port === '5000') {
      return `${origin}/auracore`;
    }
  }
  return 'http://localhost:3100';
}

export function getAuraCoreUrl() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_URL);
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/+$/, '');
    }
  } catch {
    // Ignore storage access errors
  }
  return resolveDefaultAuraUrl();
}

export function setAuraCoreUrl(nextUrl) {
  const cleaned = String(nextUrl || '').trim().replace(/\/+$/, '');
  const fallback = resolveDefaultAuraUrl();
  try {
    if (!cleaned || cleaned === fallback) {
      localStorage.removeItem(STORAGE_KEY_URL);
      return fallback;
    }
    const normalized = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
    localStorage.setItem(STORAGE_KEY_URL, normalized);
    return normalized;
  } catch {
    return cleaned || fallback;
  }
}

export function resetAuraCoreUrl() {
  try {
    localStorage.removeItem(STORAGE_KEY_URL);
  } catch {
    // Ignore storage access errors
  }
  return resolveDefaultAuraUrl();
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
    const compressed = await compressImage(fileOrBlob, 2048, 2048, 0.85);
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
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`${baseUrl}/api/health`, { signal: ctrl.signal });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        configured: false,
        model: '',
        url: baseUrl,
        error: 'La dirección respondió con HTML en vez de AuraCore IA. Verifica la URL en Ajustes.'
      };
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        configured: false,
        model: '',
        url: baseUrl,
        error: json.error || `HTTP ${res.status} (${res.status === 402 || res.status === 403 ? 'Sitio/créditos pausados en Netlify' : 'No respondió /api/health'})`
      };
    }
    return {
      ok: Boolean(json.ok),
      configured: Boolean(json.gemini?.configured ?? json.configured),
      model: json.gemini?.model || json.model || '',
      url: baseUrl
    };
  } catch (err) {
    const msg = String(err?.message || '');
    const friendly = err?.name === 'AbortError'
      ? 'Tiempo agotado (el servidor no respondió a tiempo)'
      : /load failed|failed to fetch/i.test(msg)
      ? 'No se pudo conectar (URL incorrecta, bloqueada o AuraCore apagado)'
      : msg || 'Sin conexión';
    return { ok: false, configured: false, model: '', url: baseUrl, error: friendly };
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
      throw new Error(json.error || `Error de AuraCore (HTTP ${res.status})`);
    }
    return json;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`Tiempo agotado esperando respuesta de AuraCore (${baseUrl}).`);
    }
    if (/failed to fetch|load failed|networkerror/i.test(err?.message || '')) {
      throw new Error(`No se pudo conectar con ${baseUrl}. Si tus créditos de Netlify están vencidos o la URL falló, toca Ajustes (⚙️) → "Auto".`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
