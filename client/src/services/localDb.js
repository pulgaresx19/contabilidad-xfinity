import { initialSeedData } from '../data/seedData';

const DB_NAME = 'ContabilidadXfinityDB';
const DB_VERSION = 1;

let dbPromise = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. work_orders store
        if (!db.objectStoreNames.contains('work_orders')) {
          const ordersStore = db.createObjectStore('work_orders', { keyPath: 'id', autoIncrement: true });
          ordersStore.createIndex('work_date', 'work_date', { unique: false });
          ordersStore.createIndex('job_id', 'job_id', { unique: true });
          ordersStore.createIndex('status', 'status', { unique: false });
        }

        // 2. job_photos store
        if (!db.objectStoreNames.contains('job_photos')) {
          const photosStore = db.createObjectStore('job_photos', { keyPath: 'id', autoIncrement: true });
          photosStore.createIndex('work_order_id', 'work_order_id', { unique: false });
        }

        // 3. monthly_expenses store
        if (!db.objectStoreNames.contains('monthly_expenses')) {
          const expensesStore = db.createObjectStore('monthly_expenses', { keyPath: 'id', autoIncrement: true });
          expensesStore.createIndex('month_key', 'month_key', { unique: false });
          expensesStore.createIndex('expense_date', 'expense_date', { unique: false });
        }

        // 4. dispatch_sheets store
        if (!db.objectStoreNames.contains('dispatch_sheets')) {
          const sheetsStore = db.createObjectStore('dispatch_sheets', { keyPath: 'id', autoIncrement: true });
          sheetsStore.createIndex('sheet_date', 'sheet_date', { unique: false });
        }

        // 5. settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = async (event) => {
        const db = event.target.result;
        await checkAndSeedInitialData(db);
        resolve(db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open error:', event.target.error);
        reject(event.target.error);
      };
    });
  }
  return dbPromise;
}

// Initialize default settings if the database is newly created (starts 100% clean with 0 orders)
async function checkAndSeedInitialData(db) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(['settings'], 'readwrite');
      const settingsStore = tx.objectStore('settings');
      const countReq = settingsStore.count();

      countReq.onsuccess = () => {
        if (countReq.result === 0) {
          console.log('Initializing fresh system settings (clean state)...');
          const defaultSettings = {
            tech_default: 'Javier (P0G1)',
            base_rate: '100.00',
            bore_dw_bonus: '30.00',
            cutoff_day: '0',
            footage_base: '300',
            footage_extra_rate: '25.00'
          };
          for (const [key, value] of Object.entries(defaultSettings)) {
            settingsStore.put({ key, value: String(value) });
          }
        }
        resolve();
      };

      countReq.onerror = () => resolve();
    } catch (e) {
      console.warn('Error during settings initialization:', e);
      resolve();
    }
  });
}

// Optional helper: Load sample orders if requested by user
export async function loadSampleData() {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(['work_orders', 'settings', 'job_photos', 'monthly_expenses', 'dispatch_sheets'], 'readwrite');
      const ordersStore = tx.objectStore('work_orders');
      const photosStore = tx.objectStore('job_photos');
      const expStore = tx.objectStore('monthly_expenses');
      const sheetsStore = tx.objectStore('dispatch_sheets');

      // Orders
      if (Array.isArray(initialSeedData.orders)) {
        initialSeedData.orders.forEach((o) => {
          ordersStore.put({
            ...o,
            rate_calculated: parseFloat(o.rate_calculated) || 100,
            manual_adjustment: parseFloat(o.manual_adjustment) || 0,
            drop_footage: parseFloat(o.drop_footage) || 0
          });
        });
      }

      // Photos
      if (Array.isArray(initialSeedData.photos)) {
        initialSeedData.photos.forEach((p) => {
          photosStore.put(p);
        });
      }

      // Expenses
      if (Array.isArray(initialSeedData.expenses)) {
        initialSeedData.expenses.forEach((e) => {
          expStore.put({
            ...e,
            amount: parseFloat(e.amount) || 0
          });
        });
      }

      // Sheets
      if (Array.isArray(initialSeedData.sheets)) {
        initialSeedData.sheets.forEach((s) => {
          sheetsStore.put(s);
        });
      }

      tx.oncomplete = () => resolve({ success: true, count: initialSeedData.orders?.length || 0 });
      tx.onerror = () => reject(tx.error);
    } catch (e) {
      reject(e);
    }
  });
}

// -------------------------------------------------------------
// HELPER: Date and Week Calculations (Mirrors server logic exactly)
// -------------------------------------------------------------
export function parseDateParts(dateStr) {
  if (!dateStr) return new Date();
  const clean = String(dateStr).trim().split('T')[0];
  if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
      } else if (parts[2].length === 4) {
        return new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10), 12, 0, 0);
      }
    }
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
}

export function getWeekInfo(dateStr, cutoffSetting = 0) {
  const d = parseDateParts(dateStr);
  const cutoffDay = parseInt(cutoffSetting, 10) || 0;
  const currentDay = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  const daysUntilEnd = (cutoffDay - currentDay + 7) % 7;
  const end = new Date(d);
  end.setDate(d.getDate() + daysUntilEnd);

  const start = new Date(end);
  start.setDate(end.getDate() - 6);

  const fmt = (dt) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const startDate = fmt(start);
  const endDate = fmt(end);
  const startShort = `${start.getMonth() + 1}/${start.getDate()}`;
  const endShort = `${end.getMonth() + 1}/${end.getDate()}`;
  const displayLabel = `${startShort} al ${endShort}`;
  const key = `${startDate}_al_${endDate}`;

  return {
    key,
    displayLabel,
    year: end.getFullYear(),
    startDate,
    endDate
  };
}

// -------------------------------------------------------------
// SETTINGS
// -------------------------------------------------------------
export async function getSettings() {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readonly');
    const store = tx.objectStore('settings');
    const req = store.getAll();

    req.onsuccess = () => {
      const result = {
        tech_default: 'Javier (P0G1)',
        base_rate: '100.00',
        bore_dw_bonus: '30.00',
        cutoff_day: '0',
        footage_base: '300',
        footage_extra_rate: '25.00'
      };
      if (req.result) {
        req.result.forEach((item) => {
          result[item.key] = item.value;
        });
      }
      resolve(result);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function updateSettings(newSettings) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    for (const [key, value] of Object.entries(newSettings)) {
      store.put({ key, value: String(value) });
    }
    tx.oncomplete = async () => {
      const updated = await getSettings();
      resolve(updated);
    };
    tx.onerror = () => reject(tx.error);
  });
}

// -------------------------------------------------------------
// ORDERS & RATE CALCULATION
// -------------------------------------------------------------
export function calculateOrderRate(order, settings) {
  const baseRate = parseFloat(settings.base_rate) || 100;
  const dwBonus = parseFloat(settings.bore_dw_bonus) || 30;
  const footageBase = parseFloat(settings.footage_base) || 300;
  const extraRate = parseFloat(settings.footage_extra_rate) || 25;

  let total = baseRate;

  // Driveway Bore Bonus
  if (order.bore_type && /DW/i.test(order.bore_type)) {
    total += dwBonus;
  }

  // Extra Footage Bonus (> 300 ft)
  const footage = parseFloat(order.drop_footage) || 0;
  if (footage > footageBase) {
    const extraBlocks = Math.floor((footage - footageBase) / 100);
    if (extraBlocks > 0) {
      total += extraBlocks * extraRate;
    }
  }

  // Manual Adjustment
  const manual = parseFloat(order.manual_adjustment) || 0;
  total += manual;

  return total;
}

export async function getOrders(filters = {}) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(['work_orders', 'job_photos'], 'readonly');
      const ordersStore = tx.objectStore('work_orders');
      const photosStore = tx.objectStore('job_photos');

      const ordersReq = ordersStore.getAll();
      const photosReq = photosStore.getAll();

      tx.oncomplete = () => {
        const allPhotos = photosReq.result || [];
        const photosByOrder = {};
        allPhotos.forEach((p) => {
          if (!photosByOrder[p.work_order_id]) photosByOrder[p.work_order_id] = [];
          photosByOrder[p.work_order_id].push(p);
        });

        let orders = (ordersReq.result || []).map((o) => {
          const photos = photosByOrder[o.id] || [];
          return {
            ...o,
            photos,
            photos_count: photos.length,
            work_photos_count: photos.filter((p) => p.category !== 'Constancia No Realizado').length,
            cancel_photos_count: photos.filter((p) => p.category === 'Constancia No Realizado').length
          };
        });

        // Filter: Date
        if (filters.date) {
          orders = orders.filter((o) => o.work_date === filters.date);
        }

        // Filter: Cable Type
        if (filters.cable_type) {
          orders = orders.filter((o) => o.cable_type === filters.cable_type);
        }

        // Filter: Status
        if (filters.status && filters.status !== 'Todos') {
          orders = orders.filter((o) => o.status === filters.status);
        }

        // Filter: Payment Status
        if (filters.payment_status) {
          orders = orders.filter((o) => o.payment_status === filters.payment_status);
        }

        // Filter: Search
        if (filters.search) {
          const s = filters.search.toLowerCase().trim();
          orders = orders.filter(
            (o) =>
              (o.job_id && o.job_id.toLowerCase().includes(s)) ||
              (o.address && o.address.toLowerCase().includes(s)) ||
              (o.city && o.city.toLowerCase().includes(s)) ||
              (o.phone && o.phone.toLowerCase().includes(s)) ||
              (o.cable_type && o.cable_type.toLowerCase().includes(s))
          );
        }

        // Sort: work_date DESC, id DESC
        orders.sort((a, b) => {
          if (b.work_date !== a.work_date) return b.work_date.localeCompare(a.work_date);
          return (b.id || 0) - (a.id || 0);
        });

        resolve(orders);
      };

      tx.onerror = () => reject(tx.error);
    } catch (e) {
      reject(e);
    }
  });
}

export async function getOrderById(id) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['work_orders', 'job_photos'], 'readonly');
    const orderReq = tx.objectStore('work_orders').get(Number(id));
    const photosReq = tx.objectStore('job_photos').getAll();

    tx.oncomplete = () => {
      const order = orderReq.result;
      if (!order) return resolve(null);

      const photos = (photosReq.result || []).filter((p) => Number(p.work_order_id) === Number(id));
      photos.sort((a, b) => (b.id || 0) - (a.id || 0));

      resolve({
        ...order,
        photos,
        photos_count: photos.length,
        work_photos_count: photos.filter((p) => p.category !== 'Constancia No Realizado').length,
        cancel_photos_count: photos.filter((p) => p.category === 'Constancia No Realizado').length
      });
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function createOrder(data) {
  const db = await getDb();
  const settings = await getSettings();

  const calculatedRate = calculateOrderRate(data, settings);

  const orderRecord = {
    work_date: data.work_date || new Date().toISOString().split('T')[0],
    tech_id: data.tech_id || settings.tech_default || 'Javier (P0G1)',
    job_id: String(data.job_id || '').trim(),
    address: data.address || '',
    city: data.city || '',
    zip_code: data.zip_code || '',
    phone: data.phone || '',
    call_first: data.call_first ? 1 : 0,
    drop_footage: parseFloat(data.drop_footage) || 0,
    cable_type: data.cable_type || 'RG-6',
    bore_type: data.bore_type || 'N',
    is_temp: data.is_temp ? 1 : 0,
    obstacles: data.obstacles || 'N',
    premise_access: data.premise_access || 'N',
    neighbor_notice: data.neighbor_notice || 'N',
    raw_notes: data.raw_notes || '',
    rate_calculated: calculatedRate,
    manual_adjustment: parseFloat(data.manual_adjustment) || 0,
    adjustment_reason: data.adjustment_reason || '',
    cancel_reason: data.cancel_reason || '',
    status: data.status || 'Pendiente',
    payment_status: data.payment_status || 'Pendiente',
    whatsapp_shared: 0,
    whatsapp_shared_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('work_orders', 'readwrite');
    const store = tx.objectStore('work_orders');
    const req = store.add(orderRecord);

    req.onsuccess = () => {
      orderRecord.id = req.result;
      orderRecord.photos = [];
      resolve(orderRecord);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function updateOrder(id, data) {
  const db = await getDb();
  const settings = await getSettings();
  const existing = await getOrderById(id);
  if (!existing) throw new Error('Order not found');

  const merged = { ...existing, ...data };
  if (data.rate_calculated === undefined) {
    merged.rate_calculated = calculateOrderRate(merged, settings);
  } else {
    merged.rate_calculated = parseFloat(data.rate_calculated) || 0;
  }
  merged.updated_at = new Date().toISOString();

  // Strip non-column props before saving
  delete merged.photos;
  delete merged.photos_count;
  delete merged.work_photos_count;
  delete merged.cancel_photos_count;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('work_orders', 'readwrite');
    const store = tx.objectStore('work_orders');
    const req = store.put(merged);

    req.onsuccess = async () => {
      const updated = await getOrderById(id);
      resolve(updated);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteOrder(id) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['work_orders', 'job_photos'], 'readwrite');
    const ordersStore = tx.objectStore('work_orders');
    const photosStore = tx.objectStore('job_photos');

    ordersStore.delete(Number(id));

    const photosReq = photosStore.getAll();
    photosReq.onsuccess = () => {
      (photosReq.result || []).forEach((p) => {
        if (Number(p.work_order_id) === Number(id)) {
          photosStore.delete(p.id);
        }
      });
    };

    tx.oncomplete = () => resolve({ success: true });
    tx.onerror = () => reject(tx.error);
  });
}

export async function adjustOrder(id, manual_adjustment, adjustment_reason) {
  const existing = await getOrderById(id);
  if (!existing) throw new Error('Order not found');

  const settings = await getSettings();
  const updatedOrder = {
    ...existing,
    manual_adjustment: parseFloat(manual_adjustment) || 0,
    adjustment_reason: adjustment_reason || ''
  };

  updatedOrder.rate_calculated = calculateOrderRate(updatedOrder, settings);
  return updateOrder(id, updatedOrder);
}

export async function setWhatsappShared(id, shared = true) {
  const existing = await getOrderById(id);
  if (!existing) throw new Error('Order not found');

  const isShared = shared ? 1 : 0;
  const now = isShared ? new Date().toISOString() : null;

  return updateOrder(id, {
    whatsapp_shared: isShared,
    whatsapp_shared_at: now
  });
}

// -------------------------------------------------------------
// PHOTOS (Stored directly as Blobs / Data URLs in IndexedDB)
// -------------------------------------------------------------
export async function addOrderPhoto(orderId, photoRecord) {
  const db = await getDb();
  const newPhoto = {
    work_order_id: Number(orderId),
    filename: photoRecord.filename || `job-${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`,
    original_name: photoRecord.original_name || 'photo.jpg',
    category: photoRecord.category || 'General',
    photo_data: photoRecord.photo_data || photoRecord.dataUrl || null,
    created_at: new Date().toISOString()
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('job_photos', 'readwrite');
    const store = tx.objectStore('job_photos');
    const req = store.add(newPhoto);

    req.onsuccess = () => {
      newPhoto.id = req.result;
      resolve(newPhoto);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deletePhoto(photoId) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('job_photos', 'readwrite');
    const store = tx.objectStore('job_photos');
    const req = store.delete(Number(photoId));

    req.onsuccess = () => resolve({ success: true });
    req.onerror = () => reject(req.error);
  });
}

// -------------------------------------------------------------
// WEEKLY SUMMARY & WEEK CLOSURES
// -------------------------------------------------------------
export async function getWeeklySummary() {
  const allOrders = await getOrders();
  const settings = await getSettings();
  const cutoffSetting = settings.cutoff_day || '0';

  const weeksMap = {};

  for (const order of allOrders) {
    const weekInfo = getWeekInfo(order.work_date, cutoffSetting);
    const key = weekInfo.key;

    if (!weeksMap[key]) {
      weeksMap[key] = {
        key,
        displayLabel: weekInfo.displayLabel,
        year: weekInfo.year,
        startDate: weekInfo.startDate,
        endDate: weekInfo.endDate,
        totalJobs: 0,
        completedCount: 0,
        pendingJobsCount: 0,
        cancelledCount: 0,
        totalFootage: 0,
        totalEarnings: 0,
        pendingEarnings: 0,
        paidEarnings: 0,
        rg6Count: 0,
        rg11Count: 0,
        boresCount: 0,
        orders: []
      };
    }

    const w = weeksMap[key];
    w.totalJobs++;
    if (order.status === 'Completado') {
      w.completedCount++;
      const val = order.rate_calculated || 0;
      w.totalEarnings += val;
      if (order.payment_status === 'Cobrado') {
        w.paidEarnings += val;
      } else {
        w.pendingEarnings += val;
      }
    } else if (order.status === 'No Realizado') {
      w.cancelledCount++;
    } else {
      w.pendingJobsCount++;
    }

    if (order.status !== 'No Realizado') {
      w.totalFootage += order.drop_footage || 0;
    }
    if (order.cable_type === 'RG-11') w.rg11Count++;
    if (order.cable_type === 'RG-6') w.rg6Count++;
    if (order.bore_type && order.bore_type !== 'N') w.boresCount++;

    w.orders.push(order);
  }

  const weeks = Object.values(weeksMap)
    .map((w) => {
      const completedList = w.orders.filter((o) => o.status === 'Completado');
      const isPaid = completedList.length > 0 && completedList.every((o) => o.payment_status === 'Cobrado');
      return {
        ...w,
        isPaid,
        payment_status: isPaid ? 'Cobrado' : 'Pendiente'
      };
    })
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  // Global KPIs
  let totalAllEarnings = 0;
  let totalPending = 0;
  let totalPaid = 0;
  let totalFeetAll = 0;
  let totalCompletedCount = 0;

  for (const o of allOrders) {
    if (o.status === 'Completado') {
      totalCompletedCount++;
      const val = o.rate_calculated || 0;
      totalAllEarnings += val;
      if (o.payment_status === 'Cobrado') {
        totalPaid += val;
      } else {
        totalPending += val;
      }
    }
    if (o.status !== 'No Realizado') {
      totalFeetAll += o.drop_footage || 0;
    }
  }

  return {
    cutoffDay: cutoffSetting,
    weeks,
    summary: {
      totalAllEarnings,
      totalPending,
      totalPaid,
      totalFeetAll,
      totalOrdersCount: allOrders.length,
      totalCompletedCount
    }
  };
}

export async function updateWeekStatus(weekKey, paymentStatus) {
  const db = await getDb();
  const summary = await getWeeklySummary();
  const targetWeek = summary.weeks.find((w) => w.key === weekKey);
  if (!targetWeek) return { success: false, message: 'Week not found' };

  const targetStatus = paymentStatus === 'Cobrado' ? 'Cobrado' : 'Pendiente';
  const completedOrders = targetWeek.orders.filter((o) => o.status === 'Completado');

  const tx = db.transaction('work_orders', 'readwrite');
  const store = tx.objectStore('work_orders');

  for (const order of completedOrders) {
    order.payment_status = targetStatus;
    order.updated_at = new Date().toISOString();
    store.put(order);
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve({ success: true, updatedCount: completedOrders.length });
    tx.onerror = () => reject(tx.error);
  });
}

// -------------------------------------------------------------
// MONTHLY SUMMARY & EXPENSES
// -------------------------------------------------------------
export async function getMonthlySummary(monthParam) {
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const selectedMonth = monthParam || currentMonthKey;

  const weeklySummary = await getWeeklySummary();
  const allWeeks = weeklySummary.weeks;

  // Filter weeks belonging to selectedMonth (where startDate or endDate falls in that month)
  const monthWeeks = allWeeks.filter((w) => {
    return w.startDate.startsWith(selectedMonth) || w.endDate.startsWith(selectedMonth);
  });

  let totalMonthEarnings = 0;
  let totalMonthPaid = 0;
  let totalMonthPending = 0;
  let totalMonthCompletedJobs = 0;
  let totalMonthFootage = 0;

  for (const w of monthWeeks) {
    totalMonthEarnings += w.totalEarnings || 0;
    totalMonthPaid += w.paidEarnings || 0;
    totalMonthPending += w.pendingEarnings || 0;
    totalMonthCompletedJobs += w.completedCount || 0;
    totalMonthFootage += w.totalFootage || 0;
  }

  // Fetch expenses for this month
  const expenses = await getExpenses(selectedMonth);
  let totalExpenses = 0;
  const expensesByCategory = {};
  for (const exp of expenses) {
    const amt = parseFloat(exp.amount) || 0;
    totalExpenses += amt;
    expensesByCategory[exp.category] = (expensesByCategory[exp.category] || 0) + amt;
  }

  const netPaidBalance = totalMonthPaid - totalExpenses;
  const netProjectedBalance = totalMonthEarnings - totalExpenses;
  const marginPercent = totalMonthPaid > 0 ? Math.round((netPaidBalance / totalMonthPaid) * 100) : 0;

  // Available months list
  const monthsSet = new Set();
  monthsSet.add(currentMonthKey);
  allWeeks.forEach((w) => {
    monthsSet.add(w.startDate.substring(0, 7));
    monthsSet.add(w.endDate.substring(0, 7));
  });
  const allExpenses = await getExpenses();
  allExpenses.forEach((e) => {
    if (e.month_key) monthsSet.add(e.month_key);
    else if (e.expense_date) monthsSet.add(e.expense_date.substring(0, 7));
  });

  const availableMonths = Array.from(monthsSet).sort().reverse();

  const totals = {
    totalWeeksCount: monthWeeks.length,
    completedWeeksCount: monthWeeks.filter((w) => w.isPaid).length,
    totalJobs: totalMonthCompletedJobs,
    totalFootage: Math.round(totalMonthFootage),
    totalEarnings: Math.round(totalMonthEarnings * 100) / 100,
    totalPaid: Math.round(totalMonthPaid * 100) / 100,
    totalPending: Math.round(totalMonthPending * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netPaidBalance: Math.round(netPaidBalance * 100) / 100,
    netProjectedBalance: Math.round(netProjectedBalance * 100) / 100,
    marginPercent
  };

  return {
    targetMonth: selectedMonth,
    selectedMonth,
    availableMonths,
    weeks: monthWeeks,
    expenses,
    expensesByCategory,
    totals,
    kpis: {
      totalBilled: totals.totalEarnings,
      totalPaid: totals.totalPaid,
      totalPending: totals.totalPending,
      totalJobs: totals.totalJobs,
      completedJobs: totals.totalJobs,
      totalFootage: totals.totalFootage,
      totalExpenses: totals.totalExpenses,
      netEarnings: totals.netPaidBalance,
      netMarginPercent: totals.marginPercent
    }
  };
}

export async function getExpenses(monthKey = null) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('monthly_expenses', 'readonly');
    const store = tx.objectStore('monthly_expenses');
    const req = store.getAll();

    req.onsuccess = () => {
      let list = req.result || [];
      if (monthKey) {
        list = list.filter((e) => {
          const mKey = e.month_key || (e.expense_date ? e.expense_date.substring(0, 7) : '');
          return mKey === monthKey;
        });
      }
      list.sort((a, b) => {
        if (b.expense_date !== a.expense_date) return b.expense_date.localeCompare(a.expense_date);
        return (b.id || 0) - (a.id || 0);
      });
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function createExpense(data) {
  const db = await getDb();
  const newExp = {
    month_key: data.month_key || data.expense_date.substring(0, 7),
    expense_date: data.expense_date || new Date().toISOString().split('T')[0],
    category: data.category || 'Combustible',
    description: data.description || '',
    amount: parseFloat(data.amount) || 0,
    receipt_photo: data.receipt_photo || null,
    receipt_data: data.receipt_data || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('monthly_expenses', 'readwrite');
    const store = tx.objectStore('monthly_expenses');
    const req = store.add(newExp);

    req.onsuccess = () => {
      newExp.id = req.result;
      resolve(newExp);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteExpense(id) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('monthly_expenses', 'readwrite');
    const store = tx.objectStore('monthly_expenses');
    const req = store.delete(Number(id));

    req.onsuccess = () => resolve({ success: true });
    req.onerror = () => reject(req.error);
  });
}

// -------------------------------------------------------------
// DISPATCH SHEETS
// -------------------------------------------------------------
export async function getDispatchSheets() {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dispatch_sheets', 'readonly');
    const store = tx.objectStore('dispatch_sheets');
    const req = store.getAll();

    req.onsuccess = () => {
      const list = req.result || [];
      list.sort((a, b) => (b.id || 0) - (a.id || 0));
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function createDispatchSheet(data) {
  const db = await getDb();
  const record = {
    sheet_date: data.sheet_date || new Date().toISOString().split('T')[0],
    filename: data.filename || `sheet-${Date.now()}.jpg`,
    original_name: data.original_name || 'sheet.jpg',
    extracted_text: data.extracted_text || '',
    orders_count: data.orders_count || 0,
    photo_data: data.photo_data || null,
    created_at: new Date().toISOString()
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('dispatch_sheets', 'readwrite');
    const store = tx.objectStore('dispatch_sheets');
    const req = store.add(record);

    req.onsuccess = () => {
      record.id = req.result;
      resolve(record);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteDispatchSheet(id) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dispatch_sheets', 'readwrite');
    const store = tx.objectStore('dispatch_sheets');
    const req = store.delete(Number(id));

    req.onsuccess = () => resolve({ success: true });
    req.onerror = () => reject(req.error);
  });
}

// -------------------------------------------------------------
// BATCH IMPORT ORDERS
// -------------------------------------------------------------
export async function batchImportOrders(ordersList) {
  const results = {
    total: ordersList.length,
    imported: 0,
    skipped: 0,
    errors: []
  };

  for (const o of ordersList) {
    try {
      await createOrder(o);
      results.imported++;
    } catch (err) {
      if (err.name === 'ConstraintError') {
        results.skipped++;
      } else {
        results.errors.push(err.message);
      }
    }
  }

  return results;
}

// -------------------------------------------------------------
// BACKUP & RESTORE (Full Local-First independence)
// -------------------------------------------------------------
export async function exportAllData() {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['work_orders', 'job_photos', 'monthly_expenses', 'dispatch_sheets', 'settings'], 'readonly');

    const ordersReq = tx.objectStore('work_orders').getAll();
    const photosReq = tx.objectStore('job_photos').getAll();
    const expReq = tx.objectStore('monthly_expenses').getAll();
    const sheetsReq = tx.objectStore('dispatch_sheets').getAll();
    const settingsReq = tx.objectStore('settings').getAll();

    tx.oncomplete = () => {
      const backup = {
        version: 1,
        exported_at: new Date().toISOString(),
        settings: settingsReq.result || [],
        orders: ordersReq.result || [],
        photos: photosReq.result || [],
        expenses: expReq.result || [],
        sheets: sheetsReq.result || []
      };
      resolve(JSON.stringify(backup, null, 2));
    };

    tx.onerror = () => reject(tx.error);
  });
}

export async function importAllData(jsonString) {
  const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
  const db = await getDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['work_orders', 'job_photos', 'monthly_expenses', 'dispatch_sheets', 'settings'], 'readwrite');

    const ordersStore = tx.objectStore('work_orders');
    const photosStore = tx.objectStore('job_photos');
    const expStore = tx.objectStore('monthly_expenses');
    const sheetsStore = tx.objectStore('dispatch_sheets');
    const settingsStore = tx.objectStore('settings');

    // Clear existing stores
    ordersStore.clear();
    photosStore.clear();
    expStore.clear();
    sheetsStore.clear();
    settingsStore.clear();

    // Restore Settings
    if (Array.isArray(data.settings)) {
      data.settings.forEach((s) => settingsStore.put(s));
    }

    // Restore Orders
    if (Array.isArray(data.orders)) {
      data.orders.forEach((o) => {
        delete o.photos;
        ordersStore.put(o);
      });
    }

    // Restore Photos
    if (Array.isArray(data.photos)) {
      data.photos.forEach((p) => photosStore.put(p));
    }

    // Restore Expenses
    if (Array.isArray(data.expenses)) {
      data.expenses.forEach((e) => expStore.put(e));
    }

    // Restore Sheets
    if (Array.isArray(data.sheets)) {
      data.sheets.forEach((s) => sheetsStore.put(s));
    }

    tx.oncomplete = () => resolve({ success: true, count: data.orders?.length || 0 });
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllData() {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['work_orders', 'job_photos', 'monthly_expenses', 'dispatch_sheets', 'settings'], 'readwrite');
    tx.objectStore('work_orders').clear();
    tx.objectStore('job_photos').clear();
    tx.objectStore('monthly_expenses').clear();
    tx.objectStore('dispatch_sheets').clear();
    tx.objectStore('settings').clear();

    tx.oncomplete = () => resolve({ success: true });
    tx.onerror = () => reject(tx.error);
  });
}
