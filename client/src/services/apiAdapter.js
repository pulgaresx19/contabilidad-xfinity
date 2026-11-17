import * as localDb from './localDb';
import { compressImage, dataUrlToBlob } from './imageUtils';
import { recognizeDispatchSheet, parseDispatchLine } from './ocrService';

// Save reference to native fetch
const originalFetch = window.fetch;

// Create standard JSON Response
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Global fetch interceptor for /api/ and /uploads/
export function initApiAdapter() {
  window.fetch = async function (input, init = {}) {
    let url = typeof input === 'string' ? input : input.url;
    const method = (init.method || 'GET').toUpperCase();

    // 1. Intercept /uploads/ files
    if (url.startsWith('/uploads/')) {
      const filename = url.replace('/uploads/', '').split('?')[0];
      try {
        const db = await localDb.getDb();
        const tx = db.transaction(['job_photos', 'monthly_expenses', 'dispatch_sheets'], 'readonly');

        // Check job_photos
        const photos = await new Promise((res) => {
          const req = tx.objectStore('job_photos').getAll();
          req.onsuccess = () => res(req.result || []);
          req.onerror = () => res([]);
        });

        const match = photos.find((p) => p.filename === filename || p.filename.endsWith(filename));
        if (match && match.photo_data) {
          const blob = dataUrlToBlob(match.photo_data);
          return new Response(blob, {
            status: 200,
            headers: { 'Content-Type': blob.type || 'image/jpeg' }
          });
        }

        // Check monthly_expenses (tickets y comprobantes de gastos)
        const expenses = await new Promise((res) => {
          const req = tx.objectStore('monthly_expenses').getAll();
          req.onsuccess = () => res(req.result || []);
          req.onerror = () => res([]);
        });

        const cleanTarget = filename.replace(/^expenses\//, '');
        for (const exp of expenses) {
          if (!exp.receipt_photo || !exp.receipt_data) continue;
          let photoNames = [];
          let photoDataList = [];

          try {
            if (typeof exp.receipt_photo === 'string' && exp.receipt_photo.startsWith('[')) {
              photoNames = JSON.parse(exp.receipt_photo);
              photoDataList = typeof exp.receipt_data === 'string' && exp.receipt_data.startsWith('[')
                ? JSON.parse(exp.receipt_data)
                : [exp.receipt_data];
            } else {
              photoNames = [exp.receipt_photo];
              photoDataList = [exp.receipt_data];
            }
          } catch (e) {
            photoNames = [exp.receipt_photo];
            photoDataList = [exp.receipt_data];
          }

          const idx = photoNames.findIndex((name) => {
            if (!name) return false;
            const cleanName = String(name).replace(/^expenses\//, '');
            return cleanName === cleanTarget || name === filename || name.endsWith(cleanTarget);
          });

          if (idx !== -1 && photoDataList[idx]) {
            const blob = dataUrlToBlob(photoDataList[idx]);
            return new Response(blob, {
              status: 200,
              headers: { 'Content-Type': blob.type || 'image/jpeg' }
            });
          }
        }
      } catch (err) {
        console.warn('Local uploads fallback to network:', err);
      }
      return originalFetch(input, init);
    }

    // 2. Intercept /api/ routes
    if (url.startsWith('/api/')) {
      try {
        const cleanUrl = url.split('?')[0];
        const searchParams = new URL(url, window.location.origin).searchParams;

        // --- SETTINGS ---
        if (cleanUrl === '/api/settings') {
          if (method === 'GET') {
            const settings = await localDb.getSettings();
            return jsonResponse(settings);
          } else if (method === 'POST') {
            const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
            const updated = await localDb.updateSettings(body);
            try {
              if (window.originalFetch) {
                await window.originalFetch('/api/settings', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body)
                });
              }
            } catch (netErr) {}
            return jsonResponse({ success: true, settings: updated });
          }
        }

        // --- ORDERS LIST & CREATION ---
        if (cleanUrl === '/api/orders') {
          if (method === 'GET') {
            const filters = {
              search: searchParams.get('search'),
              cable_type: searchParams.get('cable_type'),
              status: searchParams.get('status'),
              payment_status: searchParams.get('payment_status'),
              date: searchParams.get('date')
            };
            const orders = await localDb.getOrders(filters);
            return jsonResponse(orders);
          } else if (method === 'POST') {
            const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
            const created = await localDb.createOrder(body);
            return jsonResponse(created, 201);
          }
        }

        // --- REORDER ROUTE (Persist live order in IndexedDB & forward to Express SQLite) ---
        if (cleanUrl === '/api/orders/reorder-route' && method === 'POST') {
          const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
          const items = body.orders || body.orderedIds || [];
          await localDb.reorderRoute(items);
          try {
            await originalFetch(input, init);
          } catch (e) {}
          return jsonResponse({ success: true });
        }

        // --- SINGLE ORDER & ACTIONS ---
        const orderMatch = cleanUrl.match(/^\/api\/orders\/(\d+)(\/.*)?$/);
        if (orderMatch) {
          const orderId = orderMatch[1];
          const subAction = orderMatch[2] || '';

          // /api/orders/:id/coords
          if (subAction === '/coords' && method === 'PATCH') {
            const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
            await localDb.updateOrder(orderId, { latitude: body.latitude, longitude: body.longitude });
            try { await originalFetch(input, init); } catch (e) {}
            return jsonResponse({ success: true });
          }

          // /api/orders/:id/adjust
          if (subAction === '/adjust' && method === 'POST') {
            const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
            const updated = await localDb.adjustOrder(orderId, body.manual_adjustment, body.adjustment_reason);
            return jsonResponse({ success: true, order: updated });
          }

          // /api/orders/:id/whatsapp-shared
          if (subAction === '/whatsapp-shared') {
            const body = init.body ? (typeof init.body === 'string' ? JSON.parse(init.body) : init.body) : {};
            const updated = await localDb.setWhatsappShared(orderId, body.shared !== undefined ? body.shared : true);
            return jsonResponse({ success: true, order: updated });
          }

          // /api/orders/:id/reactivate (Reset a Pendiente desde cero: borrar fotos y reporte)
          if (subAction === '/reactivate' && method === 'POST') {
            const updated = await localDb.reactivateOrder(orderId);
            try {
              if (originalFetch) {
                await originalFetch(input, init);
              }
            } catch (netErr) {
              console.warn('Network sync for reactivate failed (offline mode):', netErr);
            }
            return jsonResponse({ success: true, order: updated });
          }

          // /api/orders/:id/photos
          if (subAction === '/photos' && method === 'POST') {
            const formData = init.body; // FormData
            let category = 'General';
            const uploadedPhotos = [];

            if (formData instanceof FormData) {
              category = formData.get('category') || 'General';
              const fileList = formData.getAll('photos');
              const singleFile = formData.get('photo');
              const allFiles = [...fileList, ...(singleFile ? [singleFile] : [])];

              for (const file of allFiles) {
                if (file && file.size > 0) {
                  // Compress photo in client
                  const { dataUrl } = await compressImage(file, 1280, 1280, 0.75);
                  const ext = (file.name || 'photo.jpg').split('.').pop();
                  const filename = `job-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;

                  const photoRecord = await localDb.addOrderPhoto(orderId, {
                    filename,
                    original_name: file.name || 'photo.jpg',
                    category,
                    photo_data: dataUrl
                  });
                  uploadedPhotos.push(photoRecord);
                }
              }
            }

            return jsonResponse({ success: true, photos: uploadedPhotos });
          }

          // /api/orders/:id (GET, PUT, DELETE)
          if (subAction === '') {
            if (method === 'GET') {
              const order = await localDb.getOrderById(orderId);
              if (!order) return jsonResponse({ error: 'Order not found' }, 404);
              return jsonResponse(order);
            } else if (method === 'PUT') {
              const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
              const updated = await localDb.updateOrder(orderId, body);
              return jsonResponse(updated);
            } else if (method === 'DELETE') {
              await localDb.deleteOrder(orderId);
              try {
                if (originalFetch) {
                  await originalFetch(input, init);
                }
              } catch (netErr) {}
              return jsonResponse({ success: true });
            }
          }
        }

        // --- DELETE PHOTO ---
        const photoMatch = cleanUrl.match(/^\/api\/photos\/(\d+)$/);
        if (photoMatch && method === 'DELETE') {
          const photoId = photoMatch[1];
          await localDb.deletePhoto(photoId);
          try {
            if (originalFetch) {
              await originalFetch(input, init);
            }
          } catch (netErr) {}
          return jsonResponse({ success: true });
        }

        // --- WEEKLY SUMMARY ---
        // --- WEEKLY SUMMARY (Sincroniza comprobantes con backend y localStorage) ---
        if (cleanUrl === '/api/weekly-summary') {
          let backendReceipts = {};
          try {
            const netRes = await originalFetch(input, init);
            if (netRes && netRes.ok) {
              const netData = await netRes.json();
              if (netData?.weeks) {
                netData.weeks.forEach((w) => {
                  if (w.key && w.receipt_photo) {
                    backendReceipts[w.key] = w.receipt_photo;
                    try { localStorage.setItem('receipt_' + w.key, w.receipt_photo); } catch (e) {}
                  }
                });
              }
            }
          } catch (e) {}

          const summary = await localDb.getWeeklySummary(backendReceipts);
          return jsonResponse(summary);
        }

        // --- WEEK STATUS UPDATE ---
        const weekStatusMatch = cleanUrl.match(/^\/api\/weeks\/(.+)\/status$/);
        if (weekStatusMatch && method === 'POST') {
          const weekKey = decodeURIComponent(weekStatusMatch[1]);
          const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
          if (body.receipt_photo) {
            try { localStorage.setItem('receipt_' + weekKey, body.receipt_photo); } catch (e) {}
          }
          const result = await localDb.updateWeekStatus(weekKey, body.payment_status, body.receipt_photo);
          try {
            await originalFetch(input, init);
          } catch (e) {}
          return jsonResponse(result);
        }

        // --- WEEK RECEIPT UPDATE ---
        const weekReceiptMatch = cleanUrl.match(/^\/api\/weeks\/(.+)\/receipt$/);
        if (weekReceiptMatch && method === 'POST') {
          const weekKey = decodeURIComponent(weekReceiptMatch[1]);
          const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
          const photoToSave = body.receipt_photo || body.photo;
          if (photoToSave) {
            try { localStorage.setItem('receipt_' + weekKey, photoToSave); } catch (e) {}
          }
          const result = await localDb.saveWeekReceipt(weekKey, body);
          try {
            await originalFetch(input, init);
          } catch (e) {}
          return jsonResponse(result);
        }

        // --- MONTHLY SUMMARY ---
        if (cleanUrl === '/api/monthly-summary') {
          const monthParam = searchParams.get('month');
          let backendReceipts = {};
          try {
            const rawRes = await nativeFetch(url, options);
            if (rawRes.ok) {
              const bData = await rawRes.clone().json();
              if (bData && bData.weeks) {
                bData.weeks.forEach(w => {
                  if (w.key && w.receipt_photo) {
                    backendReceipts[w.key] = w.receipt_photo;
                    try { localStorage.setItem('receipt_' + w.key, w.receipt_photo); } catch (e) {}
                  }
                });
              }
            }
          } catch (e) {}

          const summary = await localDb.getMonthlySummary(monthParam);
          if (summary && summary.weeks) {
            summary.weeks.forEach(w => {
              if (!w.receipt_photo && backendReceipts[w.key]) {
                w.receipt_photo = backendReceipts[w.key];
              }
              if (!w.receipt_photo && typeof window !== 'undefined') {
                const lsPhoto = localStorage.getItem('receipt_' + w.key);
                if (lsPhoto) w.receipt_photo = lsPhoto;
              }
            });
          }
          return jsonResponse(summary);
        }

        // --- EXPENSES ---
        if (cleanUrl === '/api/expenses') {
          if (method === 'GET') {
            const monthParam = searchParams.get('month');
            const list = await localDb.getExpenses(monthParam);
            return jsonResponse(list);
          } else if (method === 'POST') {
            const formData = init.body;
            let expenseData = {};

            if (formData instanceof FormData) {
              const dateVal = formData.get('expense_date') || new Date().toISOString().split('T')[0];
              expenseData = {
                month_key: formData.get('month_key') || dateVal.substring(0, 7),
                expense_date: dateVal,
                category: formData.get('category') || 'Combustible',
                description: formData.get('description') || '',
                amount: parseFloat(formData.get('amount')) || 0
              };

              // Collect files from 'receipt_photos' (or fallback 'receipt_photo')
              const photosArr = formData.getAll('receipt_photos');
              const allFiles = (photosArr.length > 0 ? photosArr : formData.getAll('receipt_photo')).filter(
                (f) => f && f.size > 0
              );

              const photosList = [];
              if (allFiles.length > 0) {
                for (const rf of allFiles) {
                  const { dataUrl } = await compressImage(rf, 1280, 1280, 0.75);
                  const ext = (rf.name || 'receipt.jpg').split('.').pop() || 'jpg';
                  const storedFilename = `expenses/expense-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
                  photosList.push({
                    filename: storedFilename,
                    dataUrl
                  });
                }
                expenseData.receipt_photo = photosList.length === 1 
                  ? photosList[0].filename 
                  : JSON.stringify(photosList.map(p => p.filename));
                expenseData.receipt_data = photosList.length === 1
                  ? photosList[0].dataUrl
                  : JSON.stringify(photosList.map(p => p.dataUrl));
              }
            } else {
              expenseData = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
            }

            // Forward to Express SQLite backend first so the real server filename is synchronized
            let serverCreated = null;
            try {
              if (originalFetch) {
                const sRes = await originalFetch('/api/expenses', {
                  method: 'POST',
                  body: init.body
                });
                if (sRes.ok) {
                  serverCreated = await sRes.json();
                }
              }
            } catch (netErr) {
              console.warn('Network sync for expense failed (offline mode):', netErr);
            }

            if (serverCreated && serverCreated.receipt_photo) {
              expenseData.receipt_photo = serverCreated.receipt_photo;
            }

            const created = await localDb.createExpense(expenseData);
            return jsonResponse(created, 201);
          }
        }

        const expDeleteMatch = cleanUrl.match(/^\/api\/expenses\/(\d+)$/);
        if (expDeleteMatch && method === 'DELETE') {
          const expId = expDeleteMatch[1];
          await localDb.deleteExpense(expId);
          try {
            if (originalFetch) {
              await originalFetch(`/api/expenses/${expId}`, { method: 'DELETE' });
            }
          } catch (netErr) {}
          return jsonResponse({ success: true });
        }

        // --- DISPATCH SHEETS OCR & PARSING ---
        if (cleanUrl === '/api/dispatch-sheets/scan' && method === 'POST') {
          const formData = init.body;
          if (formData instanceof FormData) {
            const sheetFile = formData.get('sheetPhoto') || formData.get('sheet_photo');
            const sheetDate = formData.get('sheetDate') || formData.get('sheet_date') || new Date().toISOString().split('T')[0];
            const techId = formData.get('techId') || formData.get('tech_id') || 'Javier (P0G1)';

            if (!sheetFile) {
              return jsonResponse({ error: 'No se subió ninguna imagen de la hoja de despacho' }, 400);
            }

            let text = '';
            let parsedOrders = [];
            let serverSuccess = false;

            // 1. Try server OCR first if available
            try {
              const serverRes = await originalFetch(input, init);
              if (serverRes.ok) {
                const serverData = await serverRes.json();
                text = serverData.extractedText || '';
                parsedOrders = serverData.parsedOrders || [];
                serverSuccess = true;
              }
            } catch (netErr) {
              console.warn('Servidor no disponible para OCR, ejecutando OCR local en cliente:', netErr);
            }

            const ocrInputFile = formData.get('ocrPhoto') || sheetFile;

            // 2. Client-side OCR with Tesseract fallback if server failed or detected 0 orders
            if (!serverSuccess || parsedOrders.length === 0) {
              try {
                const ocrResult = await recognizeDispatchSheet(ocrInputFile, sheetDate, techId);
                if (ocrResult.parsedOrders && ocrResult.parsedOrders.length > 0) {
                  text = ocrResult.text || text;
                  parsedOrders = ocrResult.parsedOrders;
                } else if (!serverSuccess) {
                  text = ocrResult.text || '';
                  parsedOrders = [];
                }
              } catch (ocrErr) {
                console.error('Error en OCR local del cliente:', ocrErr);
              }
            }

            // Compress image for local IndexedDB storage
            const { dataUrl } = await compressImage(sheetFile, 1280, 1280, 0.75);
            const ext = (sheetFile.name || 'sheet.jpg').split('.').pop();
            const filename = `sheet-${Date.now()}.${ext}`;

            const sheetRecord = await localDb.createDispatchSheet({
              sheet_date: sheetDate,
              filename,
              original_name: sheetFile.name || 'sheet.jpg',
              extracted_text: text,
              orders_count: parsedOrders.length,
              photo_data: dataUrl
            });

            return jsonResponse({
              sheetId: sheetRecord.id,
              filename,
              extractedText: text,
              ordersCount: parsedOrders.length,
              parsedOrders
            });
          }
        }

        if (cleanUrl === '/api/parse-dispatch' && method === 'POST') {
          const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
          const text = body.rawText || body.text || '';
          const defaultDate = body.defaultDate || null;
          const defaultTech = body.defaultTech || null;
          const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
          const parsed = [];
          const seenJobs = new Set();
          const seenAddrs = new Set();
          for (const line of lines) {
            const p = parseDispatchLine(line, defaultDate, defaultTech);
            if (p) {
              const addrKey = (p.address || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
              if (addrKey && addrKey !== 'DIRECCIONPORVERIFICAR') {
                if (seenAddrs.has(addrKey)) continue;
                seenAddrs.add(addrKey);
              }
              if (seenJobs.has(p.job_id)) continue;
              seenJobs.add(p.job_id);
              parsed.push(p);
            }
          }
          return jsonResponse({
            count: parsed.length,
            parsed,
            parsedOrders: parsed
          });
        }

        if (cleanUrl === '/api/batch-import' && method === 'POST') {
          const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
          const ordersList = body.orders || [];
          const results = await localDb.batchImportOrders(ordersList);
          return jsonResponse({
            success: true,
            ...results
          });
        }

        if (cleanUrl === '/api/dispatch-sheets') {
          if (method === 'GET') {
            const sheets = await localDb.getDispatchSheets();
            return jsonResponse(sheets);
          } else if (method === 'POST') {
            const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
            const result = await localDb.createDispatchSheet(body);
            return jsonResponse({ success: true, ...result });
          }
        }

        const sheetByDateMatch = cleanUrl.match(/^\/api\/dispatch-sheets\/by-date\/(.+)$/);
        if (sheetByDateMatch && method === 'GET') {
          const sDate = decodeURIComponent(sheetByDateMatch[1]);
          const sheet = await localDb.getSheetByDate(sDate);
          return jsonResponse(sheet || null);
        }

        const sheetDeleteMatch = cleanUrl.match(/^\/api\/dispatch-sheets\/(\d+)$/);
        if (sheetDeleteMatch && method === 'DELETE') {
          const sheetId = sheetDeleteMatch[1];
          await localDb.deleteDispatchSheet(sheetId);
          return jsonResponse({ success: true });
        }

      } catch (err) {
        console.error('API Adapter error handling ' + url + ':', err);
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // Default fallback to native fetch
    return originalFetch(input, init);
  };

  console.log('⚡ Contabilidad Xfinity API Adapter initialized in Local-First Mode');
}
