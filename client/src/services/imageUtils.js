// Utility for client-side image compression and conversion

export async function compressImage(fileOrBlob, maxWidth = 1280, maxHeight = 1280, quality = 0.75) {
  return new Promise((resolve, reject) => {
    // If it's not an image file (e.g. application/pdf), preserve its dataUrl for IndexedDB
    if (fileOrBlob.type && !fileOrBlob.type.startsWith('image/')) {
      fileToDataUrl(fileOrBlob)
        .then((dataUrl) => resolve({ blob: fileOrBlob, dataUrl }))
        .catch(() => resolve({ blob: fileOrBlob, dataUrl: null }));
      return;
    }

    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Upscale compact horizontal table strips (e.g. dispatch screenshots < 450px tall) so AI/OCR reads tiny 6px text crisply
        if (height > 0 && height < 450 && width < 1600) {
          width = width * 2;
          height = height * 2;
          quality = Math.max(quality, 0.92);
        } else if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, quality);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({ blob, dataUrl });
            } else {
              resolve({ blob: fileOrBlob, dataUrl });
            }
          },
          mimeType,
          quality
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(fileOrBlob);
  });
}

export function fileToDataUrl(fileOrBlob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(fileOrBlob);
  });
}

export function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);

  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }

  return new Blob([uInt8Array], { type: contentType });
}

// Advanced OCR Image Preprocessing:
// 1. Scales up low-resolution snippets (so character height is optimal for Tesseract)
// 2. Erases colored backgrounds (cyan columns, yellow/green highlighters) turning them to clean white
// 3. Removes vertical table grid lines that break Tesseract word segmentation
export async function preprocessImageForOcr(fileOrBlob) {
  // Pass the authentic original image to the backend Sharp pipeline
  // to avoid client-side canvas degradation, digit erasure, and distortion.
  return { blob: fileOrBlob, dataUrl: null };
}

/**
 * Deterministically detects 0-based row indices in a dispatch sheet screenshot
 * where the address cell is highlighted in red/pink/salmon (priority/necessary job).
 */
export async function detectPriorityRowIndices(fileOrBlob) {
  return new Promise((resolve) => {
    try {
      if (!fileOrBlob || (fileOrBlob.type && !fileOrBlob.type.startsWith('image/'))) {
        return resolve([]);
      }
      const reader = new FileReader();
      reader.onerror = () => resolve([]);
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => resolve([]);
        img.onload = () => {
          try {
            const w = img.naturalWidth || img.width;
            const h = img.naturalHeight || img.height;
            if (!w || !h) return resolve([]);

            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);
            const data = ctx.getImageData(0, 0, w, h).data;

            // 1. Detect horizontal gridlines (>78% dark/gray across width)
            const gridCandidates = [];
            for (let y = 0; y < h; y++) {
              let darkPixels = 0;
              for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                if (lum < 212) darkPixels++;
              }
              if (darkPixels / w > 0.78) {
                if (gridCandidates.length === 0 || y - gridCandidates[gridCandidates.length - 1] > 10) {
                  gridCandidates.push(y);
                }
              }
            }

            let borders = [...gridCandidates];
            if (borders.length >= 2) {
              if (borders[0] > 10) borders.unshift(0);
              if (h - borders[borders.length - 1] > 10) borders.push(h);
            } else {
              return resolve([]);
            }

            const priorityIndices = [];
            const xStart = Math.floor(w * 0.22);
            const xEnd = Math.floor(w * 0.50);
            let rowIdx = 0;

            for (let i = 0; i < borders.length - 1; i++) {
              const top = borders[i];
              const sliceH = borders[i + 1] - top;
              if (sliceH < 10) continue;

              let redPixels = 0;
              let sampled = 0;
              for (let sy = top; sy < top + sliceH; sy++) {
                for (let sx = xStart; sx < xEnd; sx++) {
                  const idx = (sy * w + sx) * 4;
                  const r = data[idx];
                  const g = data[idx + 1];
                  const b = data[idx + 2];
                  sampled++;
                  if (r > 140 && (r - g) >= 22 && r >= b) redPixels++;
                }
              }
              if (sampled > 0 && redPixels / sampled > 0.08) {
                priorityIndices.push(rowIdx);
              }
              rowIdx++;
            }

            resolve(priorityIndices);
          } catch {
            resolve([]);
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(fileOrBlob);
    } catch {
      resolve([]);
    }
  });
}
