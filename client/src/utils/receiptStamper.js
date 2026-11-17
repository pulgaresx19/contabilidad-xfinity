/**
 * receiptStamper.js
 * Utilidad para estampar la fecha del cobro, período de la semana y monto
 * directamente sobre la foto del comprobante o cheque.
 */

export async function stampReceiptPhoto(fileOrDataUrl, { week, date = new Date() } = {}) {
  if (!fileOrDataUrl) return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const handleImageLoaded = () => {
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // Limitar dimensión máxima a 1600px para mantener nitidez de texto y peso liviano (~200-350 KB)
        const maxDim = 1600;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // 1. Dibujar imagen base del comprobante
        ctx.drawImage(img, 0, 0, width, height);

        // 2. Parámetros de la banda de estampado inferior
        const bannerHeight = Math.max(68, Math.round(height * 0.088));
        const bannerY = height - bannerHeight;

        // Fondo oscuro cockpit con borde superior esmeralda
        ctx.fillStyle = 'rgba(10, 17, 26, 0.93)';
        ctx.fillRect(0, bannerY, width, bannerHeight);

        // Línea acento esmeralda
        const accentHeight = Math.max(3, Math.round(bannerHeight * 0.05));
        const gradient = ctx.createLinearGradient(0, bannerY, width, bannerY);
        gradient.addColorStop(0, '#06b6d4'); // Cyan
        gradient.addColorStop(0.5, '#10b981'); // Emerald
        gradient.addColorStop(1, '#3b82f6'); // Blue
        ctx.fillStyle = gradient;
        ctx.fillRect(0, bannerY, width, accentHeight);

        // 3. Textos formateados
        const weekLabel = week ? (week.displayLabel || week.key || 'Semanal') : 'Semanal';
        const periodStr = week && week.startDate && week.endDate 
          ? `${week.startDate} al ${week.endDate}` 
          : '';
        const earningsStr = week && week.totalEarnings !== undefined
          ? `$${Number(week.totalEarnings).toFixed(2)} USD`
          : '';

        const now = date instanceof Date ? date : new Date(date || Date.now());
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const dateStampStr = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()} • ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        // Configuración de fuentes responsive según resolución
        const paddingX = Math.max(16, Math.round(width * 0.025));
        const titleFontSize = Math.max(13, Math.round(bannerHeight * 0.28));
        const subFontSize = Math.max(10, Math.round(bannerHeight * 0.22));

        // LADO IZQUIERDO: Título y Período
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${titleFontSize}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const line1Y = bannerY + accentHeight + Math.round(bannerHeight * 0.16);
        ctx.fillText(`🧾 CONSTANCIA DE COBRO • SEMANA ${weekLabel}`, paddingX, line1Y);

        ctx.fillStyle = '#94a3b8'; // Slate 400
        ctx.font = `500 ${subFontSize}px system-ui, -apple-system, sans-serif`;
        const line2Y = line1Y + titleFontSize + 4;
        ctx.fillText(`📅 Período: ${periodStr || 'Cierre de Pago'}  •  🕒 Registro: ${dateStampStr}`, paddingX, line2Y);

        // LADO DERECHO: Monto del Cobro
        if (earningsStr) {
          ctx.fillStyle = '#34d399'; // Emerald 400
          ctx.font = `900 ${titleFontSize + 2}px monospace, system-ui`;
          ctx.textAlign = 'right';
          ctx.fillText(earningsStr, width - paddingX, line1Y);

          ctx.fillStyle = '#38bdf8'; // Sky 400
          ctx.font = `bold ${subFontSize}px system-ui, -apple-system, sans-serif`;
          ctx.fillText(`✓ PAGO CONFIRMADO`, width - paddingX, line2Y);
        }

        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        resolve(dataUrl);
      } catch (err) {
        console.warn('Error al estampar recibo:', err);
        if (typeof fileOrDataUrl === 'string') {
          resolve(fileOrDataUrl);
        } else {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(fileOrDataUrl);
        }
      }
    };

    img.onload = handleImageLoaded;
    img.onerror = () => {
      resolve(typeof fileOrDataUrl === 'string' ? fileOrDataUrl : null);
    };

    if (typeof fileOrDataUrl === 'string') {
      img.src = fileOrDataUrl;
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        img.src = reader.result;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(fileOrDataUrl);
    }
  });
}
