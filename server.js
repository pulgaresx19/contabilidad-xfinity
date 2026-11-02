const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const { db, parseDispatchLine } = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS & JSON parsing
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Anti-cache header for all API responses so mobile devices always get fresh, real-time data
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Helper for caching and geocoding addresses via OpenStreetMap Nominatim
function getMapboxToken() {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('mapbox_token');
    if (row && row.value) return row.value;
  } catch (e) {}
  return Buffer.from('cGsuZXlKMUlqb2lhbUYyYVdWeU1Ua2lMQ0poSWpvaVkyMTJlR0o1YW04eU1UQm9hVEo2Y0hwMU5taDFNbUppT0NKOS42dENmLUNIRDhQemhwTGU5S19HNm9B', 'base64').toString();
}

async function geocodeAddress(address, city = '', zipCode = '') {
  if (!address || typeof address !== 'string') return null;
  const cleanAddr = address.trim();
  const cleanCity = (city || '').trim();
  const cleanZip = (zipCode || '').trim();

  // Detect state from address or city (Skokie -> IL, Elkhart/Goshen -> IN)
  let state = 'IN';
  if (/\b(IL|ILLINOIS|SKOKIE|CHICAGO|EVANSTON|NILES)\b/i.test(`${cleanAddr} ${cleanCity}`)) {
    state = 'IL';
  } else if (/\b(MI|MICHIGAN)\b/i.test(`${cleanAddr} ${cleanCity}`)) {
    state = 'MI';
  } else if (/\b(IN|INDIANA|ELKHART|GOSHEN|MISHAWAKA|SOUTH BEND)\b/i.test(`${cleanAddr} ${cleanCity}`)) {
    state = 'IN';
  }

  let effectiveCity = cleanCity;
  if (!effectiveCity) {
    effectiveCity = state === 'IL' ? 'Skokie' : 'Elkhart';
  }

  const queries = [];
  if (cleanAddr.includes(',') || /\b(IL|IN|MI|USA)\b/i.test(cleanAddr)) {
    queries.push(cleanAddr + (cleanAddr.includes('USA') ? '' : ', USA'));
  }
  queries.push(`${cleanAddr}, ${effectiveCity}, ${state} ${cleanZip}, USA`.trim());
  queries.push(`${cleanAddr}, ${effectiveCity}, ${state}, USA`.trim());
  queries.push(`${cleanAddr}, USA`.trim());

  const cacheKey = `${cleanAddr}_${effectiveCity}_${state}_${cleanZip}`.toLowerCase().replace(/[^a-z0-9]/g, '');

  try {
    const cached = db.prepare('SELECT lat, lng FROM geocache WHERE address_key = ?').get(cacheKey);
    if (cached) {
      return { lat: cached.lat, lng: cached.lng };
    }

    // 1. Primary: Mapbox Geocoding API v5 (Super fast & accurate for US addresses)
    const mbToken = getMapboxToken();
    if (mbToken) {
      const proximity = state === 'IL' ? '-87.7345,42.0335' : '-85.9766,41.6820';
      for (const q of queries) {
        try {
          const mbUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${mbToken}&country=US&proximity=${proximity}&limit=1`;
          const mbResp = await fetch(mbUrl);
          if (mbResp.ok) {
            const mbData = await mbResp.json();
            if (mbData.features && mbData.features.length > 0) {
              const [lng, lat] = mbData.features[0].center;
              db.prepare('INSERT OR REPLACE INTO geocache (address_key, lat, lng, display_name) VALUES (?, ?, ?, ?)').run(
                cacheKey, lat, lng, mbData.features[0].place_name
              );
              return { lat, lng };
            }
          }
        } catch (mbErr) {
          console.warn('Mapbox geocoding attempt failed:', mbErr.message);
        }
      }
    }

    for (const q of queries) {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'ContabilidadXFinityApp/1.0 (Comcast Cable Tech Javier)' }
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);
          db.prepare('INSERT OR REPLACE INTO geocache (address_key, lat, lng, display_name) VALUES (?, ?, ?, ?)').run(
            cacheKey, lat, lng, data[0].display_name
          );
          return { lat, lng };
        }
      }
    }

    // Fallback to City center with small jitter
    const fallbackTarget = `${effectiveCity}, ${state}, USA`;
    const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fallbackTarget)}&limit=1`;
    const fallbackResp = await fetch(fallbackUrl, {
      headers: { 'User-Agent': 'ContabilidadXFinityApp/1.0 (Comcast Cable Tech Javier)' }
    });

    if (fallbackResp.ok) {
      const fallbackData = await fallbackResp.json();
      if (fallbackData && fallbackData.length > 0) {
        const jitterLat = (Math.random() - 0.5) * 0.015;
        const jitterLng = (Math.random() - 0.5) * 0.015;
        const lat = parseFloat(fallbackData[0].lat) + jitterLat;
        const lng = parseFloat(fallbackData[0].lon) + jitterLng;
        db.prepare('INSERT OR REPLACE INTO geocache (address_key, lat, lng, display_name) VALUES (?, ?, ?, ?)').run(
          cacheKey, lat, lng, fallbackData[0].display_name + ' (Aprox)'
        );
        return { lat, lng };
      }
    }

    // Default Tech base area fallback (Skokie if IL, Elkhart if IN)
    const baseLat = (state === 'IL' ? 42.03359 : 41.681995) + (Math.random() - 0.5) * 0.01;
    const baseLng = (state === 'IL' ? -87.73455 : -85.97667) + (Math.random() - 0.5) * 0.01;
    db.prepare('INSERT OR REPLACE INTO geocache (address_key, lat, lng, display_name) VALUES (?, ?, ?, ?)').run(
      cacheKey, baseLat, baseLng, `${effectiveCity}, ${state} (Base)`
    );
    return { lat: baseLat, lng: baseLng };
  } catch (err) {
    console.warn('[Geocoding] Error resolving address:', address, err.message);
  }
  return null;
}

// Map of US state names to 2-letter postal abbreviations
const US_STATE_ABBRS = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY'
};

// Helper for reverse geocoding real-time GPS coordinates into physical street address, city, state, zip & country
async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return null;
  const numLat = parseFloat(lat);
  const numLng = parseFloat(lng);

  // Cache key: rounded to 4 decimals (~11m precision)
  const cacheKey = `${numLat.toFixed(4)}_${numLng.toFixed(4)}`;

  try {
    const cached = db.prepare('SELECT result_json FROM reverse_geocache WHERE coord_key = ?').get(cacheKey);
    if (cached && cached.result_json) {
      return JSON.parse(cached.result_json);
    }
  } catch (e) {}

  // 1. Primary: Nominatim Reverse Geocoding with Spanish language support
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${numLat}&lon=${numLng}&zoom=18&addressdetails=1&accept-language=es`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'ContabilidadXFinityApp/1.0 (Comcast Cable Tech Javier)' }
    });

    if (resp.ok) {
      const data = await resp.json();
      const addr = data.address || {};

      let houseNum = addr.house_number || '';
      let road = addr.road || addr.pedestrian || addr.street || addr.footway || addr.path || '';

      // Translate Spanish highway/route if needed (e.g., 'US 33' -> 'Carretera 33')
      if (/^US(?:\s+Highway)?\s*(\d+)\s*([NSEW])?/i.test(road)) {
        road = road.replace(/^US(?:\s+Highway)?\s*(\d+)\s*([NSEW])?/i, (_, n, d) => `Carretera ${n}${d ? ' ' + d : ''}`);
      }

      let street = [houseNum, road].filter(Boolean).join(' ').trim();
      if (!street && data.display_name) {
        street = data.display_name.split(',')[0].trim();
      }

      let city = addr.city || addr.town || addr.village || addr.municipality || '';
      if (!city && addr.county) {
        city = addr.county.replace(/\s+County/i, '').trim();
      }
      if (!city && addr.hamlet) {
        city = addr.hamlet.trim();
      }

      let state = '';
      if (addr['ISO3166-2-lvl4']) {
        const parts = addr['ISO3166-2-lvl4'].split('-');
        if (parts.length > 1) state = parts[1].toUpperCase();
      }
      if (!state && addr.state) {
        const stLower = addr.state.toLowerCase();
        state = US_STATE_ABBRS[stLower] || addr.state;
      }

      const postcode = addr.postcode || '';
      let country = (addr.country || 'Estados Unidos').replace(/\s+de América/i, '').trim();
      if (/United States/i.test(country)) country = 'Estados Unidos';

      const cityStateZip = [city, state, postcode].filter(Boolean).join(' ').trim();

      const result = {
        street: street || 'Ubicación actual',
        cityStateZip: cityStateZip || 'Área de servicio',
        city,
        state,
        postcode,
        country: country || 'Estados Unidos',
        fullAddress: [street, cityStateZip, country].filter(Boolean).join(', ')
      };

      try {
        db.prepare('INSERT OR REPLACE INTO reverse_geocache (coord_key, result_json) VALUES (?, ?)').run(
          cacheKey, JSON.stringify(result)
        );
      } catch (saveErr) {}

      return result;
    }
  } catch (err) {
    console.warn('[ReverseGeocode] Nominatim request failed:', err.message);
  }

  // 2. Fallback: BigDataCloud Reverse Geocoding
  try {
    const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${numLat}&longitude=${numLng}&localityLanguage=es`;
    const bdcResp = await fetch(bdcUrl);
    if (bdcResp.ok) {
      const bdcData = await bdcResp.json();
      const city = bdcData.locality || (bdcData.city ? bdcData.city.replace(/Municipio de\s*/i, '').replace(/\s*\(.*\)/, '').trim() : '');
      const state = bdcData.principalSubdivisionCode ? bdcData.principalSubdivisionCode.split('-')[1] : (bdcData.principalSubdivision || '');
      const postcode = bdcData.postcode || '';
      const country = bdcData.countryName || 'Estados Unidos';
      const cityStateZip = [city, state, postcode].filter(Boolean).join(' ').trim();

      const result = {
        street: 'Ubicación actual',
        cityStateZip,
        city,
        state,
        postcode,
        country,
        fullAddress: [cityStateZip, country].filter(Boolean).join(', ')
      };
      return result;
    }
  } catch (err) {
    console.warn('[ReverseGeocode] BigDataCloud fallback failed:', err.message);
  }

  return null;
}

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Subdirectory for dispatch sheet scans
const sheetsDir = path.join(uploadsDir, 'sheets');
if (!fs.existsSync(sheetsDir)) {
  fs.mkdirSync(sheetsDir, { recursive: true });
}

// Subdirectory for expense receipts
const expensesDir = path.join(uploadsDir, 'expenses');
if (!fs.existsSync(expensesDir)) {
  fs.mkdirSync(expensesDir, { recursive: true });
}

// Multer storage configs
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

const sheetStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, sheetsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'sheet-' + uniqueSuffix + ext);
  }
});
const uploadSheet = multer({ storage: sheetStorage });

const expenseStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, expensesDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'expense-' + uniqueSuffix + ext);
  }
});
const uploadExpense = multer({ storage: expenseStorage });

// Helper to extract candidate orders from OCR text
function extractOrdersFromOcrText(text, defaultDate, defaultTech) {
  if (!text) return [];
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 8);
  const candidates = [];
  const seenJobs = new Set();
  const seenAddrs = new Set();

  for (const line of lines) {
    const parsed = parseDispatchLine(line, defaultDate, defaultTech);
    if (parsed) {
      const addrKey = (parsed.address || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (addrKey && addrKey !== 'DIRECCIONPORVERIFICAR') {
        if (seenAddrs.has(addrKey)) continue;
        seenAddrs.add(addrKey);
      }
      if (seenJobs.has(parsed.job_id)) continue;
      seenJobs.add(parsed.job_id);
      candidates.push(parsed);
    }
  }
  return candidates;
}

// Helper to normalize address for deduplication
function normalizeAddrKey(addr) {
  return (addr || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// High-accuracy Smart Scanner with Sharp image preprocessing and row-level Tesseract OCR
async function smartScanDispatchSheet(imagePath, defaultDate, defaultTech) {
  const meta = await sharp(imagePath).metadata();
  const worker = await Tesseract.createWorker('eng');

  const ordersList = [];
  const allLines = [];

  // Pass 1: Row-Sliced Pass for table strips or low height images (< 450px)
  if (meta.height < 450) {
    const estRows = Math.round(meta.height / 15.1);
    const rowCount = Math.max(1, estRows);
    const rowH = meta.height / rowCount;

    await worker.setParameters({ tessedit_pageseg_mode: 7 }); // Single text line mode

    for (let r = 0; r < rowCount; r++) {
      const top = Math.round(r * rowH);
      const h = Math.round(rowH);

      const rowBuf = await sharp(imagePath)
        .extract({ left: 0, top, width: meta.width, height: h })
        .resize({ width: meta.width * 4, height: h * 4, kernel: 'lanczos3' })
        .grayscale()
        .threshold(180)
        .toBuffer();

      const rowRes = await worker.recognize(rowBuf);
      const rowLine = rowRes.data.text.trim();
      if (rowLine) allLines.push(rowLine);
      const parsed = parseDispatchLine(rowLine, defaultDate, defaultTech);
      if (parsed) ordersList.push(parsed);
    }
  }

  // Pass 2: Whole-image High-Resolution Pass (for general camera photos or fallback)
  if (ordersList.length === 0 || meta.height >= 400) {
    const fullBuf = await sharp(imagePath)
      .resize({ width: Math.max(2500, meta.width * 2.5), kernel: 'lanczos3' })
      .grayscale()
      .threshold(175)
      .toBuffer();

    await worker.setParameters({ tessedit_pageseg_mode: 6 }); // Single uniform block of text
    const fullRes = await worker.recognize(fullBuf);
    const fullLines = (fullRes.data.text || '').split('\n').map(l => l.trim()).filter(Boolean);
    allLines.push(...fullLines);

    for (const l of fullLines) {
      const parsed = parseDispatchLine(l, defaultDate, defaultTech);
      if (parsed) ordersList.push(parsed);
    }
  }

  await worker.terminate();

  // Deduplicate orders by normalized address or job_id
  const finalOrders = [];
  const seenAddresses = new Set();
  const seenJobs = new Set();

  for (const o of ordersList) {
    const addrKey = normalizeAddrKey(o.address);
    if (addrKey && addrKey !== 'DIRECCIONPORVERIFICAR') {
      if (seenAddresses.has(addrKey)) continue;
      seenAddresses.add(addrKey);
    }
    if (seenJobs.has(o.job_id)) continue;
    seenJobs.add(o.job_id);
    finalOrders.push(o);
  }

  return {
    rawText: allLines.join('\n'),
    orders: finalOrders
  };
}

// -----------------------------------------------------------------------------
// HELPER: Calculate Week Number and Dates based on configurable closing day
// -----------------------------------------------------------------------------
function parseCutoffDay(val) {
  if (val === undefined || val === null || val === '') return 0; // 0 = Sunday (Mon-Sun)
  const map = {
    'sunday': 0, 'sun': 0, 'domingo': 0, '0': 0,
    'monday': 1, 'mon': 1, 'lunes': 1, '1': 1,
    'tuesday': 2, 'tue': 2, 'martes': 2, '2': 2,
    'wednesday': 3, 'wed': 3, 'miercoles': 3, 'miércoles': 3, '3': 3,
    'thursday': 4, 'thu': 4, 'jueves': 4, '4': 4,
    'friday': 5, 'fri': 5, 'viernes': 5, '5': 5,
    'saturday': 6, 'sat': 6, 'sabado': 6, 'sábado': 6, '6': 6
  };
  const key = String(val).toLowerCase().trim();
  return map[key] !== undefined ? map[key] : 0;
}

function getCutoffDaySetting() {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'cutoff_day'").get();
    return row ? parseCutoffDay(row.value) : 0;
  } catch (e) {
    return 0;
  }
}

function parseDateParts(dateStr) {
  if (!dateStr) return new Date();
  const clean = String(dateStr).trim().split('T')[0];
  if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD - parse with noon (12:00:00) to avoid any timezone/DST shift
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
      } else if (parts[2].length === 4) {
        // MM-DD-YYYY
        return new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10), 12, 0, 0);
      }
    }
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
}

function getWeekInfo(dateStr, cutoffSetting = null) {
  // Format: YYYY-MM-DD or MM-DD-YYYY parsed cleanly with noon to prevent UTC shifting
  const d = parseDateParts(dateStr);

  const cutoffDay = cutoffSetting !== null ? parseCutoffDay(cutoffSetting) : getCutoffDaySetting();
  const currentDay = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  // Days remaining from currentDay to reach cutoffDay
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

  // Friendly short display e.g. "10/20 al 10/26"
  const startShort = `${start.getMonth() + 1}/${start.getDate()}`;
  const endShort = `${end.getMonth() + 1}/${end.getDate()}`;
  const displayLabel = `${startShort} al ${endShort}`;

  // Unique chronological key
  const key = `${startDate}_al_${endDate}`;

  return {
    key,
    displayLabel,
    startDate,
    endDate,
    year: end.getFullYear(),
    cutoffDay
  };
}

// -----------------------------------------------------------------------------
// API ENDPOINTS
// -----------------------------------------------------------------------------

// Reverse geocode real-time GPS coordinates to physical address
app.get('/api/reverse-geocode', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng parameters are required' });
    }
    const result = await reverseGeocode(lat, lng);
    if (result) {
      return res.json(result);
    }
    return res.status(404).json({ error: 'Address could not be determined for these coordinates' });
  } catch (err) {
    console.error('Error in /api/reverse-geocode:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 1. Get all work orders with filters
app.get('/api/orders', (req, res) => {
  try {
    const { search, cable_type, status, payment_status, date } = req.query;
    let query = `
      SELECT o.*, 
        (SELECT COUNT(*) FROM job_photos WHERE work_order_id = o.id) as photos_count,
        (SELECT COUNT(*) FROM job_photos WHERE work_order_id = o.id AND category != 'Constancia No Realizado') as work_photos_count,
        (SELECT COUNT(*) FROM job_photos WHERE work_order_id = o.id AND category = 'Constancia No Realizado') as cancel_photos_count
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

    query += ` ORDER BY o.work_date DESC, (CASE WHEN o.route_order > 0 THEN o.route_order ELSE 999 END) ASC, o.id ASC`;

    const orders = db.prepare(query).all(...params);
    const photosStmt = db.prepare('SELECT id, work_order_id, filename, original_name, category, created_at FROM job_photos WHERE work_order_id = ? ORDER BY id DESC');
    for (const ord of orders) {
      ord.photos = photosStmt.all(ord.id);
    }
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

// 2b. Get just photos for an order (lightweight)
app.get('/api/orders/:id/photos', (req, res) => {
  try {
    const photos = db.prepare('SELECT * FROM job_photos WHERE work_order_id = ? ORDER BY id DESC').all(req.params.id);
    res.json({ photos });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Create single work order with auto-geocoding
app.post('/api/orders', async (req, res) => {
  try {
    const data = req.body;
    let lat = data.latitude ? parseFloat(data.latitude) : null;
    let lng = data.longitude ? parseFloat(data.longitude) : null;

    if (!lat || !lng) {
      const geo = await geocodeAddress(data.address, data.city, data.zip_code);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
      }
    }

    const cleanJobId = String(data.job_id || '').trim();
    if (!cleanJobId) {
      return res.status(400).json({ error: 'El número de trabajo (Job ID) es obligatorio.' });
    }
    if (!data.address || !data.address.trim()) {
      return res.status(400).json({ error: 'La dirección es obligatoria.' });
    }

    const orderPayload = {
      work_date: data.work_date || new Date().toISOString().split('T')[0],
      tech_id: data.tech_id || 'Javier (P0G1)',
      job_id: cleanJobId,
      address: data.address.trim(),
      city: data.city ? data.city.trim().toUpperCase() : 'ELKHART',
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
      rate_calculated: parseFloat(data.rate_calculated) || (data.bore_type && data.bore_type.includes('DW') ? 130 : 100),
      manual_adjustment: parseFloat(data.manual_adjustment) || 0,
      adjustment_reason: data.adjustment_reason || '',
      status: data.status || 'Pendiente',
      payment_status: data.payment_status || 'Pendiente',
      latitude: lat,
      longitude: lng,
      route_order: parseInt(data.route_order, 10) || 0
    };

    // If job_id already exists in database, update it instead of throwing UNIQUE constraint crash
    const existing = db.prepare('SELECT id FROM work_orders WHERE job_id = ?').get(cleanJobId);
    if (existing) {
      const updateStmt = db.prepare(`
        UPDATE work_orders SET
          work_date = @work_date,
          tech_id = @tech_id,
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
          raw_notes = @raw_notes,
          rate_calculated = @rate_calculated,
          manual_adjustment = @manual_adjustment,
          adjustment_reason = @adjustment_reason,
          status = @status,
          payment_status = @payment_status,
          latitude = @latitude,
          longitude = @longitude,
          route_order = @route_order,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
      `);
      updateStmt.run({ ...orderPayload, id: existing.id });
      const updatedOrder = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(existing.id);
      return res.status(200).json(updatedOrder);
    }

    const stmt = db.prepare(`
      INSERT INTO work_orders (
        work_date, tech_id, job_id, address, city, zip_code, phone,
        call_first, drop_footage, cable_type, bore_type, is_temp,
        obstacles, premise_access, neighbor_notice, raw_notes, rate_calculated,
        manual_adjustment, adjustment_reason,
        status, payment_status, latitude, longitude, route_order
      ) VALUES (
        @work_date, @tech_id, @job_id, @address, @city, @zip_code, @phone,
        @call_first, @drop_footage, @cable_type, @bore_type, @is_temp,
        @obstacles, @premise_access, @neighbor_notice, @raw_notes, @rate_calculated,
        @manual_adjustment, @adjustment_reason,
        @status, @payment_status, @latitude, @longitude, @route_order
      )
    `);

    const result = stmt.run(orderPayload);
    const newOrder = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newOrder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Update order with lat/lng
app.put('/api/orders/:id', async (req, res) => {
  try {
    const data = req.body;
    let lat = data.latitude !== undefined && data.latitude !== null ? parseFloat(data.latitude) : null;
    let lng = data.longitude !== undefined && data.longitude !== null ? parseFloat(data.longitude) : null;

    if (!lat || !lng) {
      const geo = await geocodeAddress(data.address, data.city, data.zip_code);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
      }
    }

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
        raw_notes = @raw_notes,
        rate_calculated = @rate_calculated,
        manual_adjustment = @manual_adjustment,
        adjustment_reason = @adjustment_reason,
        status = @status,
        cancel_reason = @cancel_reason,
        payment_status = @payment_status,
        latitude = COALESCE(@latitude, latitude),
        longitude = COALESCE(@longitude, longitude),
        route_order = COALESCE(@route_order, route_order),
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
      raw_notes: data.raw_notes !== undefined ? data.raw_notes : '',
      rate_calculated: parseFloat(data.rate_calculated) || 0,
      manual_adjustment: parseFloat(data.manual_adjustment) || 0,
      adjustment_reason: data.adjustment_reason || '',
      status: data.status || 'Completado',
      cancel_reason: data.cancel_reason || '',
      payment_status: data.payment_status || 'Pendiente',
      latitude: lat,
      longitude: lng,
      route_order: data.route_order !== undefined ? parseInt(data.route_order, 10) : null
    });

    const updated = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4.1 Update note quickly (Apple Maps card style note)
app.patch('/api/orders/:id/coords', (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude } = req.body;
    if (latitude && longitude) {
      db.prepare('UPDATE work_orders SET latitude = ?, longitude = ? WHERE id = ?').run(latitude, longitude, id);
      return res.json({ success: true, id, latitude, longitude });
    }
    res.status(400).json({ error: 'Missing coordinates' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/orders/:id/note', (req, res) => {
  try {
    const { note } = req.body;
    db.prepare('UPDATE work_orders SET raw_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(note || '', req.params.id);
    const updated = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4c. Reorder route order for the day
app.post('/api/orders/reorder-route', (req, res) => {
  try {
    const { orderedIds } = req.body;
    console.log('⚡ [reorder-route] Received orderedIds:', orderedIds);
    if (Array.isArray(orderedIds) && orderedIds.length > 0) {
      const updateStmt = db.prepare('UPDATE work_orders SET route_order = ? WHERE id = ?');
      const tx = db.transaction(() => {
        orderedIds.forEach((id, idx) => {
          updateStmt.run(idx + 1, Number(id));
        });
      });
      tx();
      console.log('✅ [reorder-route] Updated DB route_order for', orderedIds.length, 'orders');
    }
    res.json({ success: true });
  } catch (err) {
    console.error('❌ [reorder-route] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4d. Geocode on demand or backfill missing coordinates
app.post('/api/orders/geocode-all', async (req, res) => {
  try {
    const missing = db.prepare('SELECT id, address, city, zip_code FROM work_orders WHERE latitude IS NULL OR longitude IS NULL').all();
    let updatedCount = 0;
    const updateStmt = db.prepare('UPDATE work_orders SET latitude = ?, longitude = ? WHERE id = ?');

    for (const ord of missing) {
      const geo = await geocodeAddress(ord.address, ord.city, ord.zip_code);
      if (geo) {
        updateStmt.run(geo.lat, geo.lng, ord.id);
        updatedCount++;
      }
    }
    res.json({ success: true, updatedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4b. Adjust order price and reason directly
app.post('/api/orders/:id/adjust', (req, res) => {
  try {
    const { rate_calculated, manual_adjustment, adjustment_reason } = req.body;
    const stmt = db.prepare(`
      UPDATE work_orders SET
        rate_calculated = ?,
        manual_adjustment = ?,
        adjustment_reason = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(
      parseFloat(rate_calculated) || 0,
      parseFloat(manual_adjustment) || 0,
      adjustment_reason || '',
      req.params.id
    );
    const updated = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id);
    res.json({ success: true, order: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4c. Toggle WhatsApp shared status
app.patch('/api/orders/:id/whatsapp-shared', (req, res) => {
  try {
    const { shared } = req.body;
    const isShared = shared !== undefined ? (shared ? 1 : 0) : 1;
    const now = isShared ? new Date().toISOString() : null;
    db.prepare('UPDATE work_orders SET whatsapp_shared = ?, whatsapp_shared_at = ? WHERE id = ?')
      .run(isShared, now, req.params.id);
    const updated = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id);
    res.json({ success: true, order: updated });
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
    const { rawText, defaultDate, defaultTech } = req.body;
    if (!rawText) return res.json({ parsed: [] });

    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    const parsed = [];
    const seenJobs = new Set();
    const seenAddrs = new Set();

    for (const line of lines) {
      const item = parseDispatchLine(line, defaultDate, defaultTech);
      if (item) {
        const addrKey = normalizeAddrKey(item.address);
        if (addrKey && addrKey !== 'DIRECCIONPORVERIFICAR') {
          if (seenAddrs.has(addrKey)) continue;
          seenAddrs.add(addrKey);
        }
        if (seenJobs.has(item.job_id)) continue;
        seenJobs.add(item.job_id);
        parsed.push(item);
      }
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
        manual_adjustment, adjustment_reason,
        status, payment_status
      ) VALUES (
        @work_date, @tech_id, @job_id, @address, @city, @zip_code, @phone,
        @call_first, @drop_footage, @cable_type, @bore_type, @is_temp,
        @obstacles, @premise_access, @neighbor_notice, @raw_notes, @rate_calculated,
        @manual_adjustment, @adjustment_reason,
        @status, @payment_status
      )
      ON CONFLICT(job_id) DO UPDATE SET
        work_date = excluded.work_date,
        address = excluded.address,
        city = excluded.city,
        phone = excluded.phone,
        call_first = excluded.call_first,
        drop_footage = excluded.drop_footage,
        cable_type = excluded.cable_type,
        bore_type = excluded.bore_type,
        is_temp = excluded.is_temp,
        obstacles = excluded.obstacles,
        rate_calculated = excluded.rate_calculated,
        manual_adjustment = excluded.manual_adjustment,
        adjustment_reason = excluded.adjustment_reason,
        raw_notes = excluded.raw_notes,
        status = excluded.status,
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

    // Background geocode newly imported orders without blocking client response
    setTimeout(async () => {
      try {
        const updateStmt = db.prepare('UPDATE work_orders SET latitude = ?, longitude = ? WHERE id = ?');
        for (const ord of orders) {
          const row = db.prepare('SELECT id, address, city, zip_code, latitude, longitude FROM work_orders WHERE job_id = ?').get(ord.job_id);
          if (row && (!row.latitude || !row.longitude)) {
            const geo = await geocodeAddress(row.address, row.city, row.zip_code);
            if (geo) {
              updateStmt.run(geo.lat, geo.lng, row.id);
            }
          }
        }
      } catch (e) {
        console.warn('Background batch geocoding error:', e.message);
      }
    }, 100);

    res.json({ success: true, count: insertedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 10. Weekly Summary & Financial Accounting
app.get('/api/weekly-summary', (req, res) => {
  try {
    const allOrders = db.prepare('SELECT * FROM work_orders ORDER BY work_date DESC, (CASE WHEN route_order > 0 THEN route_order ELSE 999 END) ASC, id ASC').all();
    const photosStmt = db.prepare('SELECT id, filename, original_name, category, created_at FROM job_photos WHERE work_order_id = ? ORDER BY id DESC');

    // Group orders by week based on configured closing day
    const cutoffSetting = getCutoffDaySetting();
    const weeksMap = {};

    for (const order of allOrders) {
      order.photos = photosStmt.all(order.id);
      order.photos_count = order.photos.length;
      order.work_photos_count = order.photos.filter(p => p.category !== 'Constancia No Realizado').length;
      order.cancel_photos_count = order.photos.filter(p => p.category === 'Constancia No Realizado').length;

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
        w.totalFootage += (order.drop_footage || 0);
      }
      if (order.cable_type === 'RG-11') w.rg11Count++;
      if (order.cable_type === 'RG-6') w.rg6Count++;
      if (order.bore_type && order.bore_type !== 'N') w.boresCount++;

      w.orders.push(order);
    }

    // Determine week payment status and sort chronologically descending
    const weeks = Object.values(weeksMap).map(w => {
      const completedList = w.orders.filter(o => o.status === 'Completado');
      const isPaid = completedList.length > 0 && completedList.every(o => o.payment_status === 'Cobrado');
      return {
        ...w,
        isPaid,
        payment_status: isPaid ? 'Cobrado' : 'Pendiente'
      };
    }).sort((a, b) => b.startDate.localeCompare(a.startDate));

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

    res.json({
      summary: {
        totalAllEarnings,
        totalPending,
        totalPaid,
        totalFeetAll: Math.round(totalFeetAll),
        totalOrdersCount: allOrders.length,
        totalCompletedCount,
        cutoffDay: cutoffSetting
      },
      weeks
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 10b. Update payment status for an entire week (Cobrado vs Pendiente)
app.post('/api/weeks/:key/status', (req, res) => {
  try {
    const { key } = req.params;
    const { payment_status } = req.body; // 'Cobrado' | 'Pendiente'
    const newStatus = payment_status === 'Cobrado' ? 'Cobrado' : 'Pendiente';

    const cutoffSetting = getCutoffDaySetting();
    const allOrders = db.prepare('SELECT id, work_date, status, payment_status FROM work_orders').all();
    const orderIds = [];

    for (const o of allOrders) {
      const weekInfo = getWeekInfo(o.work_date, cutoffSetting);
      if (weekInfo.key === key && o.status === 'Completado') {
        orderIds.push(o.id);
      }
    }

    if (orderIds.length > 0) {
      const stmt = db.prepare('UPDATE work_orders SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      const updateMany = db.transaction((ids, st) => {
        for (const id of ids) {
          stmt.run(st, id);
        }
      });
      updateMany(orderIds, newStatus);
    }

    res.json({ success: true, updated: orderIds.length, payment_status: newStatus });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 10c. Monthly Summary & Expense Accounting
app.get('/api/monthly-summary', (req, res) => {
  try {
    const allOrders = db.prepare('SELECT * FROM work_orders ORDER BY work_date DESC, (CASE WHEN route_order > 0 THEN route_order ELSE 999 END) ASC, id ASC').all();
    const photosStmt = db.prepare('SELECT id, filename, original_name, category, created_at FROM job_photos WHERE work_order_id = ? ORDER BY id DESC');
    const cutoffSetting = getCutoffDaySetting();

    // Group orders into weeks
    const weeksMap = {};
    const monthsSet = new Set();

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    monthsSet.add(currentMonthKey);

    for (const order of allOrders) {
      order.photos = photosStmt.all(order.id);
      order.photos_count = order.photos.length;
      order.work_photos_count = order.photos.filter(p => p.category !== 'Constancia No Realizado').length;
      order.cancel_photos_count = order.photos.filter(p => p.category === 'Constancia No Realizado').length;

      const od = parseDateParts(order.work_date);
      const oMonth = `${od.getFullYear()}-${String(od.getMonth() + 1).padStart(2, '0')}`;
      monthsSet.add(oMonth);

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
        w.totalFootage += (order.drop_footage || 0);
      }
      if (order.cable_type === 'RG-11') w.rg11Count++;
      if (order.cable_type === 'RG-6') w.rg6Count++;
      if (order.bore_type && order.bore_type !== 'N') w.boresCount++;

      w.orders.push(order);
    }

    const allWeeks = Object.values(weeksMap).map(w => {
      const completedList = w.orders.filter(o => o.status === 'Completado');
      const isPaid = completedList.length > 0 && completedList.every(o => o.payment_status === 'Cobrado');
      return {
        ...w,
        isPaid,
        payment_status: isPaid ? 'Cobrado' : 'Pendiente'
      };
    }).sort((a, b) => b.startDate.localeCompare(a.startDate));

    // Get months from expenses
    const expenseMonths = db.prepare('SELECT DISTINCT month_key FROM monthly_expenses').all();
    for (const em of expenseMonths) {
      if (em.month_key) monthsSet.add(em.month_key);
    }

    const availableMonths = Array.from(monthsSet).sort().reverse();

    let targetMonth = req.query.month;
    if (!targetMonth || !/^\d{4}-\d{2}$/.test(targetMonth)) {
      targetMonth = currentMonthKey;
    }

    // Filter weeks that completed in this month (endDate in targetMonth) OR has orders in targetMonth
    const monthWeeks = allWeeks.filter(w => {
      const endMonth = w.endDate.substring(0, 7);
      if (endMonth === targetMonth) return true;
      const startMonth = w.startDate.substring(0, 7);
      if (startMonth === targetMonth) {
        return w.orders.some(o => {
          const od = parseDateParts(o.work_date);
          const om = `${od.getFullYear()}-${String(od.getMonth() + 1).padStart(2, '0')}`;
          return om === targetMonth;
        });
      }
      return false;
    });

    let totalMonthEarnings = 0;
    let totalMonthPaid = 0;
    let totalMonthPending = 0;
    let totalMonthCompletedJobs = 0;
    let totalMonthFootage = 0;

    for (const w of monthWeeks) {
      totalMonthEarnings += w.totalEarnings;
      totalMonthPaid += w.paidEarnings;
      totalMonthPending += w.pendingEarnings;
      totalMonthCompletedJobs += w.completedCount;
      totalMonthFootage += w.totalFootage;
    }

    // Expenses for targetMonth
    const expenses = db.prepare('SELECT * FROM monthly_expenses WHERE month_key = ? ORDER BY expense_date DESC, id DESC').all(targetMonth);

    let totalExpenses = 0;
    const expensesByCategory = {};
    for (const exp of expenses) {
      const amt = Number(exp.amount) || 0;
      totalExpenses += amt;
      expensesByCategory[exp.category] = (expensesByCategory[exp.category] || 0) + amt;
    }

    const netPaidBalance = totalMonthPaid - totalExpenses;
    const netProjectedBalance = totalMonthEarnings - totalExpenses;

    res.json({
      targetMonth,
      availableMonths,
      weeks: monthWeeks,
      expenses,
      expensesByCategory,
      totals: {
        totalWeeksCount: monthWeeks.length,
        completedWeeksCount: monthWeeks.filter(w => w.isPaid).length,
        totalJobs: totalMonthCompletedJobs,
        totalFootage: Math.round(totalMonthFootage),
        totalEarnings: totalMonthEarnings,
        totalPaid: totalMonthPaid,
        totalPending: totalMonthPending,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        netPaidBalance: Math.round(netPaidBalance * 100) / 100,
        netProjectedBalance: Math.round(netProjectedBalance * 100) / 100,
        marginPercent: totalMonthPaid > 0 ? Math.round((netPaidBalance / totalMonthPaid) * 100) : 0
      }
    });
  } catch (error) {
    console.error('Error fetching monthly summary:', error);
    res.status(500).json({ error: error.message });
  }
});

// 10d. Expense Endpoints
app.get('/api/expenses', (req, res) => {
  try {
    const { month } = req.query;
    let query = 'SELECT * FROM monthly_expenses';
    const params = [];
    if (month) {
      query += ' WHERE month_key = ?';
      params.push(month);
    }
    query += ' ORDER BY expense_date DESC, id DESC';
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/expenses', uploadExpense.any(), (req, res) => {
  try {
    const { expense_date, category, description, amount } = req.body;
    const finalDesc = (description && description.trim()) || category || 'Gasto General';
    if (!amount) {
      return res.status(400).json({ error: 'El monto es requerido' });
    }

    const dateStr = expense_date || new Date().toISOString().split('T')[0];
    const parsedDate = parseDateParts(dateStr);
    const month_key = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}`;

    let receiptPath = null;
    const uploadedFiles = req.files || (req.file ? [req.file] : []);
    if (uploadedFiles.length > 0) {
      const paths = uploadedFiles.map(f => path.join('expenses', f.filename).replace(/\\/g, '/'));
      receiptPath = paths.length === 1 ? paths[0] : JSON.stringify(paths);
    }

    const stmt = db.prepare(`
      INSERT INTO monthly_expenses (month_key, expense_date, category, description, amount, receipt_photo)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      month_key,
      dateStr,
      category || 'Combustible',
      finalDesc,
      parseFloat(amount) || 0,
      receiptPath
    );

    const newExpense = db.prepare('SELECT * FROM monthly_expenses WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newExpense);
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/expenses/:id', (req, res) => {
  try {
    const expense = db.prepare('SELECT * FROM monthly_expenses WHERE id = ?').get(req.params.id);
    if (expense) {
      if (expense.receipt_photo) {
        let photos = [];
        try {
          if (expense.receipt_photo.startsWith('[')) {
            photos = JSON.parse(expense.receipt_photo);
          } else {
            photos = [expense.receipt_photo];
          }
        } catch (e) {
          photos = [expense.receipt_photo];
        }
        for (const p of photos) {
          const fullPath = path.join(uploadsDir, p);
          if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        }
      }
      db.prepare('DELETE FROM monthly_expenses WHERE id = ?').run(req.params.id);
    }
    res.json({ success: true });
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

// 12. Dispatch Sheet Photo Scanner & OCR
app.post('/api/dispatch-sheets/scan', (req, res, next) => {
  uploadSheet.any()(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const files = req.files || [];
    const mainFile = files.find(f => f.fieldname === 'sheetPhoto' || f.fieldname === 'sheet_photo') || 
                     files.find(f => f.fieldname !== 'ocrPhoto') || 
                     files[0];

    if (!mainFile) return res.status(400).json({ error: 'No se subió ninguna foto de hoja de despacho' });

    const ocrFile = files.find(f => f.fieldname === 'ocrPhoto');
    const ocrPath = ocrFile ? ocrFile.path : mainFile.path;

    const sheetDate = req.body.sheetDate || req.body.sheet_date || new Date().toISOString().split('T')[0];
    const techId = req.body.techId || req.body.tech_id || 'Javier (P0G1)';

    // Run smart preprocessed OCR
    const { rawText, orders: parsedOrders } = await smartScanDispatchSheet(ocrPath, sheetDate, techId);

    // Clean up temporary OCR file if distinct from main file
    if (ocrFile && ocrFile.path !== mainFile.path) {
      try {
        if (fs.existsSync(ocrFile.path)) fs.unlinkSync(ocrFile.path);
      } catch (cleanErr) {
        console.warn('Could not remove temporary OCR file:', cleanErr);
      }
    }

    // Save record to dispatch_sheets table
    const relPath = path.join('sheets', mainFile.filename).replace(/\\/g, '/');
    const stmt = db.prepare(`
      INSERT INTO dispatch_sheets (sheet_date, filename, original_name, extracted_text, orders_count)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(sheetDate, relPath, mainFile.originalname, rawText, parsedOrders.length);

    res.json({
      sheetId: result.lastInsertRowid,
      filename: relPath,
      extractedText: rawText,
      ordersCount: parsedOrders.length,
      parsedOrders
    });
  } catch (err) {
    console.error('OCR scan error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 13. Get all dispatch sheets history
app.get('/api/dispatch-sheets', (req, res) => {
  try {
    const sheets = db.prepare('SELECT * FROM dispatch_sheets ORDER BY sheet_date DESC, id DESC').all();
    res.json(sheets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 14. Delete dispatch sheet
app.delete('/api/dispatch-sheets/:id', (req, res) => {
  try {
    const sheet = db.prepare('SELECT * FROM dispatch_sheets WHERE id = ?').get(req.params.id);
    if (sheet) {
      const fullPath = path.join(uploadsDir, sheet.filename);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      db.prepare('DELETE FROM dispatch_sheets WHERE id = ?').run(req.params.id);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend build if present
const clientDist = path.join(__dirname, 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use((req, res, next) => {
    if (req.path === '/' || req.path === '/index.html') {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    }
    next();
  });
  app.use(express.static(clientDist));
  app.use((req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor de Contabilidad Xfinity corriendo en http://localhost:${PORT}`);
});
