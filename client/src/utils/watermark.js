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

// Get device GPS location with safe timeout fallback
export function getDeviceLocation(timeoutMs = 2500) {
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
            accuracy: pos.coords.accuracy
          });
        }
      },
      (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(null);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 60000
      }
    );
  });
}

// Format local date with time zone (e.g. "oct 31, 2026, 10:20:15 p.m. EDT")
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

  // Timezone abbreviation (EDT / EST or local)
  let tzStr = 'EDT';
  try {
    const tzMatch = date.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ');
    if (tzMatch.length > 2) tzStr = tzMatch[2];
  } catch (e) {}

  return `${m} ${d}, ${y}, ${hours}:${minutes}:${seconds} ${ampm} ${tzStr}`;
}

/**
 * Applies a high-contrast watermark to an image file.
 * Returns a new File object with the stamped image.
 */
export async function stampPhotoWithWatermark(file, meta = {}) {
  // If not an image file, return as is
  if (!file || !file.type.startsWith('image/')) {
    return file;
  }

  try {
    // 1. Try to get device GPS in parallel with image loading
    const gpsPromise = (meta.lat && meta.lng) 
      ? Promise.resolve({ lat: meta.lat, lng: meta.lng }) 
      : getDeviceLocation(2500);

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

    const gps = await gpsPromise;

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

    // 4. Build text lines
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
    const addrLine2 = `${meta.city || 'Elkhart'} IN ${meta.zipCode || meta.zip_code || ''}`.trim();
    if (addrLine1) lines.push(addrLine1);
    if (addrLine2) lines.push(addrLine2);
    lines.push('Estados Unidos');

    // Job and Tech ID line
    const techTag = meta.techName || meta.tech_id || 'Javier (P0G1)';
    const jobTag = meta.jobId || meta.job_id ? `Job #${meta.jobId || meta.job_id}` : '';
    const footerLine = [jobTag, techTag].filter(Boolean).join(' • ');
    if (footerLine) {
      lines.push(footerLine);
    }

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
    ctx.fillStyle = 'rgba(10, 15, 29, 0.72)';
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

    // 6. Draw text lines with subtle crisp shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    lines.forEach((line, idx) => {
      const y = boxY + paddingY + (idx * lineHeight) + (baseFontSize * 0.85);

      // Color coding: primary lines white, footer slightly highlighted in cyan/amber
      if (idx === lines.length - 1 && footerLine) {
        ctx.fillStyle = '#38bdf8'; // Cyan for Tech & Job ID
        ctx.font = `bold ${Math.round(baseFontSize * 0.95)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      } else if (idx === 0) {
        ctx.fillStyle = '#f8fafc';
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
