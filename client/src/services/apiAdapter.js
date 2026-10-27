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

        // --- SINGLE ORDER & ACTIONS ---
        const orderMatch = cleanUrl.match(/^\/api\/orders\/(\d+)(\/.*)?$/);
        if (orderMatch) {
          const orderId = orderMatch[1];
          const subAction = orderMatch[2] || '';

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
              return jsonResponse({ success: true });
            }
          }
        }

        // --- DELETE PHOTO ---
        const photoMatch = cleanUrl.match(/^\/api\/photos\/(\d+)$/);
        if (photoMatch && method === 'DELETE') {
          const photoId = photoMatch[1];
          await localDb.deletePhoto(photoId);
          return jsonResponse({ success: true });
        }

        // --- WEEKLY SUMMARY ---
        if (cleanUrl === '/api/weekly-summary') {
          const summary = await localDb.getWeeklySummary();
          return jsonResponse(summary);
        }

        // --- WEEK STATUS UPDATE ---
        const weekStatusMatch = cleanUrl.match(/^\/api\/weeks\/(.+)\/status$/);
        if (weekStatusMatch && method === 'POST') {
          const weekKey = decodeURIComponent(weekStatusMatch[1]);
          const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
          const result = await localDb.updateWeekStatus(weekKey, body.payment_status);
          return jsonResponse(result);
        }

        // --- MONTHLY SUMMARY ---
        if (cleanUrl === '/api/monthly-summary') {
          const monthParam = searchParams.get('month');
          const summary = await localDb.getMonthlySummary(monthParam);
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

              const receiptFile = formData.get('receipt_photo');
              if (receiptFile && receiptFile.size > 0) {
                const { dataUrl } = await compressImage(receiptFile, 1280, 1280, 0.75);
                const ext = (receiptFile.name || 'receipt.jpg').split('.').pop();
                expenseData.receipt_photo = `expense-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
                expenseData.receipt_data = dataUrl;
              }
            } else {
              expenseData = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
            }

            const created = await localDb.createExpense(expenseData);
            return jsonResponse(created, 201);
          }
        }

        const expDeleteMatch = cleanUrl.match(/^\/api\/expenses\/(\d+)$/);
        if (expDeleteMatch && method === 'DELETE') {
          const expId = expDeleteMatch[1];
          await localDb.deleteExpense(expId);
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

            // 2. Client-side OCR with Tesseract fallback
            if (!serverSuccess) {
              try {
                const ocrResult = await recognizeDispatchSheet(sheetFile, sheetDate, techId);
                text = ocrResult.text || '';
                parsedOrders = ocrResult.parsedOrders || [];
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
          const text = body.text || '';
          const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
          const parsedOrders = [];
          for (const line of lines) {
            const p = parseDispatchLine(line);
            if (p) parsedOrders.push(p);
          }
          return jsonResponse({
            count: parsedOrders.length,
            parsedOrders
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
          }
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
