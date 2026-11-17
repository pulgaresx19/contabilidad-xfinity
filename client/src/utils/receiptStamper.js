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

        // 2. Parámetros de la banda de estampado inferior (delgada y discreta, ~36-44px)
        const bannerHeight = Math.max(36, Math.round(height * 0.042));
        const bannerY = height - bannerHeight;

        // Fondo oscuro cockpit sutil con borde superior esmeralda
        ctx.fillStyle = 'rgba(10, 17, 26, 0.88)';
        ctx.fillRect(0, bannerY, width, bannerHeight);

        // Línea acento esmeralda sutil de 2px
        const accentHeight = Math.max(2, Math.round(bannerHeight * 0.05));
        const gradient = ctx.createLinearGradient(0, bannerY, width, bannerY);
        gradient.addColorStop(0, '#06b6d4'); // Cyan
        gradient.addColorStop(0.5, '#10b981'); // Emerald
        gradient.addColorStop(1, '#3b82f6'); // Blue
        ctx.fillStyle = gradient;
        ctx.fillRect(0, bannerY, width, accentHeight);

        // 3. Textos limpios en una sola línea horizontal (CERO colisiones o textos sobrepuestos)
        const earningsStr = week && week.totalEarnings !== undefined
          ? `$${Number(week.totalEarnings).toFixed(2)} USD`
          : '';

        const now = date instanceof Date ? date : new Date(date || Date.now());
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const dateStampStr = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()} • ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        // Configuración de fuentes responsive y centrado vertical
        const paddingX = Math.max(14, Math.round(width * 0.025));
        const fontSize = Math.max(12, Math.round(bannerHeight * 0.36));
        const centerY = bannerY + accentHeight + Math.round((bannerHeight - accentHeight) / 2);

        // LADO IZQUIERDO: Estado y Fecha exacta del cobro
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#38bdf8'; // Sky cyan
        ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
        ctx.fillText(`✓ Cobrado • ${dateStampStr}`, paddingX, centerY);

        // LADO DERECHO: Monto de la semana
        if (earningsStr) {
          ctx.textAlign = 'right';
          ctx.fillStyle = '#34d399'; // Emerald 400
          ctx.font = `900 ${fontSize + 1}px monospace, system-ui`;
          ctx.fillText(earningsStr, width - paddingX, centerY);
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
