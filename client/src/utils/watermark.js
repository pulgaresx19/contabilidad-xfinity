/**
 * Utility to stamp GPS, Date/Time, and Address Watermark directly on job evidence photos
 * Styled to match official Timestamp Camera / Comcast evidence standards.
 */

// Format decimal degrees to standard GPS DMS format: N 41° 38' 7.607", W 85° 55' 14.220"
export function formatDMS(deg, isLat) {
  if (deg === undefined || deg === null || isNaN(deg)) return null;
  const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const minFloat = (abs - d) * 60;
  const m = Math.floor(minFloat);
  const s = ((minFloat - m) * 60).toFixed(3);
  return `${dir} ${d}° ${m}' ${s}"`;
}

// Get device GPS location in real time with high accuracy (maximumAge: 0 forces fresh sensor fix)
export function getDeviceLocation(timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp || Date.now()
          });
        }
      },
      () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(null);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0 // Garantiza lectura fresca del GPS del teléfono en este instante exacto
      }
    );
  });
}

// Format local date with time zone (e.g. "nov 2, 2026, 12:49:15 a. m. EDT")
export function formatTimestampText(date = new Date()) {
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const m = months[date.getMonth()];
  const d = date.getDate();
  const y = date.getFullYear();

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'p.m.' : 'a.m.';
  hours = hours % 12 || 12;

  // Timezone abbreviation (EDT / EST / CDT / CST or local)
  let tzStr = '';
  try {
    const tzMatch = date.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ');
    if (tzMatch.length > 2) tzStr = ` ${tzMatch[2]}`;
  } catch (e) {}

  return `${m} ${d}, ${y}, ${hours}:${minutes}:${seconds} ${ampm}${tzStr}`;
}

/**
 * Applies a high-contrast watermark to an image file.
 * Returns a new File object with the stamped image.
 * 
 * Rules:
 * - Real-time GPS coordinates captured directly from phone hardware at the instant photo is taken
 * - Real-time local date and time
 * - Verified job site address
 * - NO job ID, NO user name
 */
export async function stampPhotoWithWatermark(file, meta = {}) {
  // If not an image file, return as is
  if (!file || !file.type.startsWith('image/')) {
    return file;
  }

  try {
    // 1. Obtener coordenadas GPS del teléfono en tiempo real en paralelo a la carga de la imagen
    const gpsPromise = getDeviceLocation(4000).catch(() => null);

    // 2. Load file into HTML Image
    const img = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    let gps = await gpsPromise;
    // Si el GPS del móvil no respondió (ej. sin cobertura/sótano), usar respaldo si existe
    if (!gps && meta.lat && meta.lng) {
      gps = { lat: meta.lat, lng: meta.lng };
    }

    // 3. Create canvas preserving high resolution
    const canvas = document.createElement('canvas');
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;

    // Cap max dimension to 2400px to maintain speed while keeping crisp detail
    const maxDim = 2400;
    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Draw base photo
    ctx.drawImage(img, 0, 0, width, height);

    // 4. Build text lines: SOLAMENTE Fecha y Hora actual, Coordenadas GPS y Dirección
    const now = new Date();
    const timeFormatted = formatTimestampText(now);

    const lines = [];
    lines.push(`Local: ${timeFormatted}`);

    if (gps && gps.lat && gps.lng) {
      const latDMS = formatDMS(gps.lat, true);
      const lngDMS = formatDMS(gps.lng, false);
      lines.push(`${latDMS}, ${lngDMS}`);
    } else if (meta.coordinates) {
      lines.push(meta.coordinates);
    }

    const addrLine1 = (meta.address || '').trim();
    const addrLine2 = [
      meta.city || '',
      meta.state || (meta.city ? 'IN' : ''),
      meta.zipCode || meta.zip_code || ''
    ].filter(Boolean).join(' ').trim();

    if (addrLine1) lines.push(addrLine1);
    if (addrLine2) lines.push(addrLine2);

    // 5. Calculate font size & badge proportions
    const baseFontSize = Math.max(16, Math.round(width * 0.024));
    const lineHeight = Math.round(baseFontSize * 1.35);
    const paddingX = Math.round(baseFontSize * 0.9);
    const paddingY = Math.round(baseFontSize * 0.7);

    ctx.font = `600 ${baseFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;

    // Measure maximum line width
    let maxTextWidth = 0;
    for (const line of lines) {
      const m = ctx.measureText(line);
      if (m.width > maxTextWidth) maxTextWidth = m.width;
    }

    const boxWidth = maxTextWidth + (paddingX * 2);
    const boxHeight = (lines.length * lineHeight) + (paddingY * 2);

    // Place badge in the bottom-right corner (or bottom-center on vertical photos)
    const margin = Math.round(baseFontSize * 1.0);
    const boxX = Math.max(margin, width - boxWidth - margin);
    const boxY = Math.max(margin, height - boxHeight - margin);

    // Draw dark translucent backdrop box with rounded corners
    ctx.save();
    ctx.fillStyle = 'rgba(10, 15, 29, 0.75)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = Math.max(1, Math.round(baseFontSize * 0.06));

    const radius = Math.round(baseFontSize * 0.4);
    ctx.beginPath();
    ctx.moveTo(boxX + radius, boxY);
    ctx.lineTo(boxX + boxWidth - radius, boxY);
    ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + radius);
    ctx.lineTo(boxX + boxWidth, boxY + boxHeight - radius);
    ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - radius, boxY + boxHeight);
    ctx.lineTo(boxX + radius, boxY + boxHeight);
    ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - radius);
    ctx.lineTo(boxX, boxY + radius);
    ctx.quadraticCurveTo(boxX, boxY, boxX + radius, boxY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 6. Draw text lines with subtle crisp shadow for maximum clarity
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    lines.forEach((line, idx) => {
      const y = boxY + paddingY + (idx * lineHeight) + (baseFontSize * 0.85);

      if (idx === 0) {
        ctx.fillStyle = '#f8fafc';
        ctx.font = `600 ${baseFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      } else if (idx === 1 && (line.includes('°') || line.includes('N ') || line.includes('S '))) {
        ctx.fillStyle = '#38bdf8'; // Coordenadas en cian de alta visibilidad
        ctx.font = `600 ${baseFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      } else {
        ctx.fillStyle = '#f1f5f9';
        ctx.font = `500 ${baseFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      }

      ctx.fillText(line, boxX + paddingX, y);
    });
    ctx.restore();

    // 7. Output stamped blob as File
    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.92);
    });

    if (!blob) return file;

    const stampedFileName = file.name ? file.name.replace(/\.[^/.]+$/, "") + "-stamped.jpg" : "evidence-stamped.jpg";
    return new File([blob], stampedFileName, { type: 'image/jpeg', lastModified: Date.now() });

  } catch (err) {
    console.warn('Failed to apply watermark, using original image:', err);
    return file;
  }
}
