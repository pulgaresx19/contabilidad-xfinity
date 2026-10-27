// Utility for client-side image compression and conversion

export async function compressImage(fileOrBlob, maxWidth = 1280, maxHeight = 1280, quality = 0.75) {
  return new Promise((resolve, reject) => {
    // If it's not an image file (e.g. text/pdf), return as is
    if (fileOrBlob.type && !fileOrBlob.type.startsWith('image/')) {
      return resolve({ blob: fileOrBlob, dataUrl: null });
    }

    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Resize proportionally if exceeds maxWidth or maxHeight
        if (width > height) {
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
  return new Promise((resolve, reject) => {
    // If not an image, pass through
    if (fileOrBlob.type && !fileOrBlob.type.startsWith('image/')) {
      return resolve({ blob: fileOrBlob, dataUrl: null });
    }

    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let scale = 1;
        if (img.height < 300) {
          scale = 3;
        } else if (img.height < 600) {
          scale = 2;
        } else if (img.width > 3000) {
          scale = 2200 / img.width;
        }

        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        try {
          const imgData = ctx.getImageData(0, 0, width, height);
          const data = imgData.data;

          // 1. Color removal and contrast thresholding
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // If any channel is bright or lightness is high, it's background/highlight -> pure white
            if (r > 115 || g > 115 || b > 115) {
              data[i] = 255;
              data[i + 1] = 255;
              data[i + 2] = 255;
            } else {
              data[i] = 0;
              data[i + 1] = 0;
              data[i + 2] = 0;
            }
          }

          // 2. Erase continuous vertical black table grid lines
          for (let x = 0; x < width; x++) {
            let blackCount = 0;
            for (let y = 0; y < height; y++) {
              const idx = (y * width + x) * 4;
              if (data[idx] === 0) blackCount++;
            }
            if (blackCount > height * 0.35) {
              for (let y = 0; y < height; y++) {
                for (let dx = -2; dx <= 2; dx++) {
                  const nx = x + dx;
                  if (nx >= 0 && nx < width) {
                    const idx = (y * width + nx) * 4;
                    data[idx] = 255;
                    data[idx + 1] = 255;
                    data[idx + 2] = 255;
                  }
                }
              }
            }
          }

          ctx.putImageData(imgData, 0, 0);
        } catch (procErr) {
          console.warn('Canvas image processing fallback:', procErr);
        }

        const dataUrl = canvas.toDataURL('image/png');
        canvas.toBlob((blob) => {
          resolve({ blob: blob || fileOrBlob, dataUrl });
        }, 'image/png');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(fileOrBlob);
  });
}
