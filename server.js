const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db, parseDispatchLine } = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS & JSON parsing
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'job-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

// -----------------------------------------------------------------------------
// HELPER: Calculate Week Number and Dates
// -----------------------------------------------------------------------------
function getWeekInfo(dateStr) {
  // Format: YYYY-MM-DD or MM-DD-YYYY
  let d = new Date(dateStr);
  if (isNaN(d.getTime()) && dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts[0].length === 2 && parts[2].length === 4) {
      // MM-DD-YYYY
      d = new Date(`${parts[2]}-${parts[0]}-${parts[1]}`);
    }
  }
  if (isNaN(d.getTime())) d = new Date();

  // Target Thursday of the week to calculate ISO week number
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target) / 604800000);
  const year = d.getFullYear();

  // Compute Monday (start) and Sunday (end) of that week
  const monday = new Date(d);
  const currentDay = (d.getDay() + 6) % 7;
  monday.setDate(d.getDate() - currentDay);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  // Estimated payout date: +3 weeks from the end of the worked week
  const payoutDate = new Date(sunday);
  payoutDate.setDate(payoutDate.getDate() + 21);

  return {
    weekNumber,
    year,
    startDate: monday.toISOString().split('T')[0],
    endDate: sunday.toISOString().split('T')[0],
    payoutDueDate: payoutDate.toISOString().split('T')[0]
  };
}

// -----------------------------------------------------------------------------
// API ENDPOINTS
// -----------------------------------------------------------------------------

// 1. Get all work orders with filters
app.get('/api/orders', (req, res) => {
  try {
    const { search, cable_type, status, payment_status, date } = req.query;
    let query = `
      SELECT o.*, 
        (SELECT COUNT(*) FROM job_photos WHERE work_order_id = o.id) as photos_count 
      FROM work_orders o
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ` AND (o.job_id LIKE ? OR o.address LIKE ? OR o.city LIKE ? OR o.phone LIKE ? OR o.tech_id LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }
    if (cable_type) {
      query += ` AND o.cable_type = ?`;
      params.push(cable_type);
    }
    if (status) {
      query += ` AND o.status = ?`;
      params.push(status);
    }
    if (payment_status) {
      query += ` AND o.payment_status = ?`;
      params.push(payment_status);
    }
    if (date) {
      query += ` AND o.work_date = ?`;
      params.push(date);
    }

    query += ` ORDER BY o.work_date DESC, o.id DESC`;

    const orders = db.prepare(query).all(...params);
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Get single work order with all attached photos
app.get('/api/orders/:id', (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const photos = db.prepare('SELECT * FROM job_photos WHERE work_order_id = ? ORDER BY id DESC').all(req.params.id);
    res.json({ ...order, photos });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Create single work order
app.post('/api/orders', (req, res) => {
  try {
    const data = req.body;
    const stmt = db.prepare(`
      INSERT INTO work_orders (
        work_date, tech_id, job_id, address, city, zip_code, phone,
        call_first, drop_footage, cable_type, bore_type, is_temp,
        obstacles, premise_access, neighbor_notice, raw_notes, rate_calculated,
        status, payment_status
      ) VALUES (
        @work_date, @tech_id, @job_id, @address, @city, @zip_code, @phone,
        @call_first, @drop_footage, @cable_type, @bore_type, @is_temp,
        @obstacles, @premise_access, @neighbor_notice, @raw_notes, @rate_calculated,
        @status, @payment_status
      )
    `);

    const result = stmt.run({
      work_date: data.work_date || new Date().toISOString().split('T')[0],
      tech_id: data.tech_id || 'Javier (P0G1)',
      job_id: data.job_id,
      address: data.address,
      city: data.city || 'ELKHART',
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
      rate_calculated: parseFloat(data.rate_calculated) || 65,
      status: data.status || 'Completado',
      payment_status: data.payment_status || 'En Fondo (3 Sem)'
    });

    const newOrder = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newOrder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Update order
app.put('/api/orders/:id', (req, res) => {
  try {
    const data = req.body;
    const stmt = db.prepare(`
      UPDATE work_orders SET
        work_date = @work_date,
        tech_id = @tech_id,
        job_id = @job_id,
        address = @address,
        city = @city,
        zip_code = @zip_code,
        phone = @phone,
        call_first = @call_first,
        drop_footage = @drop_footage,
        cable_type = @cable_type,
        bore_type = @bore_type,
        is_temp = @is_temp,
        obstacles = @obstacles,
        premise_access = @premise_access,
        neighbor_notice = @neighbor_notice,
        rate_calculated = @rate_calculated,
        status = @status,
        payment_status = @payment_status,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `);

    stmt.run({
      id: req.params.id,
      work_date: data.work_date,
      tech_id: data.tech_id,
      job_id: data.job_id,
      address: data.address,
      city: data.city,
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
      rate_calculated: parseFloat(data.rate_calculated) || 0,
      status: data.status || 'Completado',
      payment_status: data.payment_status || 'En Fondo (3 Sem)'
    });

    const updated = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Delete order & related photos
app.delete('/api/orders/:id', (req, res) => {
  try {
    const photos = db.prepare('SELECT filename FROM job_photos WHERE work_order_id = ?').all(req.params.id);
    for (const p of photos) {
      const filePath = path.join(uploadsDir, p.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    db.prepare('DELETE FROM work_orders WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Orden eliminada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Photo upload for an order
app.post('/api/orders/:id/photos', upload.array('photos', 10), (req, res) => {
  try {
    const orderId = req.params.id;
    const category = req.body.category || 'General';
    const inserted = [];

    const stmt = db.prepare(`
      INSERT INTO job_photos (work_order_id, filename, original_name, category)
      VALUES (?, ?, ?, ?)
    `);

    for (const file of req.files) {
      const result = stmt.run(orderId, file.filename, file.originalname, category);
      inserted.push({
        id: result.lastInsertRowid,
        work_order_id: orderId,
        filename: file.filename,
        original_name: file.originalname,
        category
      });
    }

    res.json({ success: true, photos: inserted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Delete single photo
app.delete('/api/photos/:id', (req, res) => {
  try {
    const photo = db.prepare('SELECT * FROM job_photos WHERE id = ?').get(req.params.id);
    if (photo) {
      const filePath = path.join(uploadsDir, photo.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      db.prepare('DELETE FROM job_photos WHERE id = ?').run(req.params.id);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. Smart parser: parse raw dispatch text (multiple lines)
app.post('/api/parse-dispatch', (req, res) => {
  try {
    const { rawText } = req.body;
    if (!rawText) return res.json({ parsed: [] });

    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    const parsed = [];

    for (const line of lines) {
      const item = parseDispatchLine(line);
      if (item) parsed.push(item);
    }

    res.json({ parsed });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 9. Batch import parsed orders
app.post('/api/batch-import', (req, res) => {
  try {
    const { orders } = req.body;
    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ error: 'No se enviaron órdenes' });
    }

    const stmt = db.prepare(`
      INSERT INTO work_orders (
        work_date, tech_id, job_id, address, city, zip_code, phone,
        call_first, drop_footage, cable_type, bore_type, is_temp,
        obstacles, premise_access, neighbor_notice, raw_notes, rate_calculated,
        status, payment_status
      ) VALUES (
        @work_date, @tech_id, @job_id, @address, @city, @zip_code, @phone,
        @call_first, @drop_footage, @cable_type, @bore_type, @is_temp,
        @obstacles, @premise_access, @neighbor_notice, @raw_notes, @rate_calculated,
        @status, @payment_status
      )
      ON CONFLICT(job_id) DO UPDATE SET
        address = excluded.address,
        drop_footage = excluded.drop_footage,
        cable_type = excluded.cable_type,
        bore_type = excluded.bore_type,
        rate_calculated = excluded.rate_calculated,
        raw_notes = excluded.raw_notes,
        updated_at = CURRENT_TIMESTAMP
    `);

    const transaction = db.transaction((items) => {
      let count = 0;
      for (const item of items) {
        stmt.run(item);
        count++;
      }
      return count;
    });

    const insertedCount = transaction(orders);
    res.json({ success: true, count: insertedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 10. Weekly Summary & 3-Week Rolling Holdback
app.get('/api/weekly-summary', (req, res) => {
  try {
    const allOrders = db.prepare('SELECT * FROM work_orders ORDER BY work_date DESC').all();

    // Group orders by week
    const weeksMap = {};

    for (const order of allOrders) {
      const weekInfo = getWeekInfo(order.work_date);
      const key = `${weekInfo.year}-W${String(weekInfo.weekNumber).padStart(2, '0')}`;

      if (!weeksMap[key]) {
        weeksMap[key] = {
          key,
          year: weekInfo.year,
          weekNumber: weekInfo.weekNumber,
          startDate: weekInfo.startDate,
          endDate: weekInfo.endDate,
          payoutDueDate: weekInfo.payoutDueDate,
          totalJobs: 0,
          totalFootage: 0,
          totalEarnings: 0,
          rg6Count: 0,
          rg11Count: 0,
          boresCount: 0,
          orders: [],
          statusCount: {
            'En Fondo (3 Sem)': 0,
            'Listo para Cobro': 0,
            'Cobrado': 0
          }
        };
      }

      const w = weeksMap[key];
      w.totalJobs++;
      w.totalFootage += (order.drop_footage || 0);
      w.totalEarnings += (order.rate_calculated || 0);
      if (order.cable_type === 'RG-11') w.rg11Count++;
      if (order.cable_type === 'RG-6') w.rg6Count++;
      if (order.bore_type && order.bore_type !== 'N') w.boresCount++;

      w.orders.push(order);
      if (w.statusCount[order.payment_status] !== undefined) {
        w.statusCount[order.payment_status]++;
      }
    }

    const weeks = Object.values(weeksMap).sort((a, b) => b.key.localeCompare(a.key));

    // Global KPIs
    let totalAllEarnings = 0;
    let totalInHoldback = 0; // Sum of earnings in holdback
    let totalReadyForPayout = 0;
    let totalPaid = 0;
    let totalFeetAll = 0;

    for (const o of allOrders) {
      totalAllEarnings += o.rate_calculated || 0;
      totalFeetAll += o.drop_footage || 0;
      if (o.payment_status === 'En Fondo (3 Sem)') totalInHoldback += (o.rate_calculated || 0);
      if (o.payment_status === 'Listo para Cobro') totalReadyForPayout += (o.rate_calculated || 0);
      if (o.payment_status === 'Cobrado') totalPaid += (o.rate_calculated || 0);
    }

    res.json({
      summary: {
        totalAllEarnings,
        totalInHoldback,
        totalReadyForPayout,
        totalPaid,
        totalFeetAll: Math.round(totalFeetAll),
        totalOrdersCount: allOrders.length
      },
      weeks
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 11. Settings
app.get('/api/settings', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM settings').all();
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const updates = req.body;
    const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    for (const [k, v] of Object.entries(updates)) {
      stmt.run(k, String(v));
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend build if present
const clientDist = path.join(__dirname, 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor de Contabilidad Xfinity corriendo en http://localhost:${PORT}`);
});
