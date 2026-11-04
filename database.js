const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'contabilidad.db');
const db = new Database(dbPath);

// Enable WAL mode for high performance
db.pragma('journal_mode = WAL');

// Ensure tables exist
function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS work_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_date TEXT NOT NULL,
      tech_id TEXT NOT NULL,
      job_id TEXT NOT NULL UNIQUE,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      zip_code TEXT,
      phone TEXT,
      call_first INTEGER DEFAULT 0,
      drop_footage REAL DEFAULT 0,
      cable_type TEXT DEFAULT 'RG-6',
      bore_type TEXT DEFAULT 'N',
      is_temp INTEGER DEFAULT 0,
      obstacles TEXT DEFAULT 'N',
      premise_access TEXT DEFAULT 'N',
      neighbor_notice TEXT DEFAULT 'N',
      raw_notes TEXT,
      rate_calculated REAL DEFAULT 0,
      manual_adjustment REAL DEFAULT 0,
      adjustment_reason TEXT DEFAULT '',
      cancel_reason TEXT DEFAULT '',
      status TEXT DEFAULT 'Pendiente',
      payment_status TEXT DEFAULT 'Pendiente',
      whatsapp_shared INTEGER DEFAULT 0,
      whatsapp_shared_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS job_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_order_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT,
      category TEXT DEFAULT 'General',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dispatch_sheets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sheet_date TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT,
      extracted_text TEXT,
      orders_count INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS monthly_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month_key TEXT NOT NULL,
      expense_date TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Combustible',
      description TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      receipt_photo TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_monthly_expenses_month ON monthly_expenses(month_key);

  `);

  // Ensure extra columns exist
  try {
    db.exec("ALTER TABLE work_orders ADD COLUMN cancel_reason TEXT");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE work_orders ADD COLUMN manual_adjustment REAL DEFAULT 0");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE work_orders ADD COLUMN adjustment_reason TEXT DEFAULT ''");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE work_orders ADD COLUMN whatsapp_shared INTEGER DEFAULT 0");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE work_orders ADD COLUMN whatsapp_shared_at TEXT");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE work_orders ADD COLUMN latitude REAL");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE work_orders ADD COLUMN longitude REAL");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE work_orders ADD COLUMN route_order INTEGER DEFAULT 0");
  } catch (e) {}

  // Cache for geocoding coordinates so we never re-request the same address
  db.exec(`
    CREATE TABLE IF NOT EXISTS reverse_geocache (
      coord_key TEXT PRIMARY KEY,
      result_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS geocache (
      address_key TEXT PRIMARY KEY,
      lat REAL,
      lng REAL,
      display_name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Default settings if not already set
  const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  
  if (!getSetting.get('tech_default')) {
    insertSetting.run('tech_default', 'Javier (P0G1)');
  }
  insertSetting.run('base_rate', '100.00'); // Base pay: $100 por trabajo
  insertSetting.run('bore_dw_bonus', '30.00'); // Driveway bore: $30
  if (!getSetting.get('cutoff_day')) {
    insertSetting.run('cutoff_day', '0'); // 0 = Domingo (Lunes a Domingo por defecto)
  }
  if (!getSetting.get('footage_base')) {
    insertSetting.run('footage_base', '300'); // Metraje base sin cargo extra: 300 ft
  }
  if (!getSetting.get('footage_extra_rate')) {
    insertSetting.run('footage_extra_rate', '25.00'); // +$25 por cada 100 ft extra
  }
  // Clean up obsolete settings
  try {
    db.exec("DELETE FROM settings WHERE key IN ('holdback_weeks', 'rg11_bonus', 'bore_sw_bonus', 'rate_per_foot')");
  } catch (e) {}

  // Check if we should seed with the sample orders from user's dispatch sheet
  const count = db.prepare('SELECT COUNT(*) as count FROM work_orders').get().count;
  if (count === 0) {
    seedInitialData();
  }
}

// Smart parser for Xfinity dispatch format lines
function parseDispatchLine(line, defaultDate = null, defaultTech = null) {
  if (!line || typeof line !== 'string') return null;
  const rawLine = line.trim();
  if (rawLine.length < 8) return null;

  // 1. Try Tab-Separated Structure first (e.g. copied directly from Excel / dispatch grid)
  let parts = rawLine.split('\t').map(p => p.trim()).filter(Boolean);
  if (parts.length >= 5 && /^\d{1,2}[-./]\d{1,2}[-./]\d{2,4}/.test(parts[0])) {
    let rawDate = parts[0];
    let work_date = defaultDate;
    const dateMatch = rawDate.match(/^(\d{1,2})[-./](\d{1,2})[-./](20\d{2}|\d{2})$/);
    if (dateMatch) {
      const m = dateMatch[1].padStart(2, '0');
      const d = dateMatch[2].padStart(2, '0');
      const y = dateMatch[3].length === 2 ? '20' + dateMatch[3] : dateMatch[3];
      work_date = `${y}-${m}-${d}`;
    }
    if (!work_date) work_date = defaultDate || new Date().toISOString().split('T')[0];

    const tech_id = parts[1] || defaultTech || 'Javier (P0G1)';
    const job_id = (parts[2] || '').replace(/[^0-9]/g, '');
    const address = (parts[3] || '').replace(/,\s*$/, '').trim();
    const city = (parts[4] || '').toUpperCase().trim();
    const zip_code = parts[5] || '';
    const notes = parts.slice(6).join(' ');

    let call_first = false;
    let phone = '';
    let drop_footage = 100;
    let cable_type = 'RG-6';
    let bore_type = 'N';
    let is_temp = false;
    let obstacles = 'N';
    let premise_access = 'N';
    let neighbor_notice = 'N';

    if (notes) {
      const tokens = notes.split('/');
      for (const token of tokens) {
        const t = token.trim();
        if (!t) continue;
        const up = t.toUpperCase();
        if (up === 'CALLFIRST') {
          call_first = true;
        } else if (up.startsWith('P#:')) {
          phone = t.substring(3).trim();
        } else if (up.startsWith('DROP:')) {
          const numStr = t.substring(5).trim().replace(',', '.');
          const val = parseFloat(numStr);
          if (!isNaN(val) && val > 0) drop_footage = val;
        } else if (up.startsWith('TYPE:')) {
          const typeStr = t.substring(5).trim().toUpperCase();
          cable_type = typeStr.includes('11') ? 'RG-11' : 'RG-6';
        } else if (up.startsWith('BORE:')) {
          const bStr = t.substring(5).trim().toUpperCase();
          bore_type = bStr.includes('DW') ? 'DW:1' : bStr.includes('SW') ? 'SW:1' : 'N';
        } else if (up.startsWith('TEMP:')) {
          is_temp = t.substring(5).trim().toUpperCase() === 'Y';
        } else if (up.startsWith('OBSTACLES:')) {
          obstacles = t.substring(10).trim();
        } else if (up.startsWith('PREMISE ACS:')) {
          premise_access = t.substring(12).trim() || 'N';
        } else if (up.startsWith('NBR:')) {
          neighbor_notice = t.substring(4).trim();
        }
      }
    }

    let rate = 100;
    if (bore_type.includes('DW')) rate += 30;
    if (drop_footage > 300) {
      const extraBlocks = Math.floor((drop_footage - 300) / 100);
      if (extraBlocks > 0) rate += extraBlocks * 25;
    }

    return {
      work_date,
      tech_id,
      job_id,
      address,
      city,
      zip_code,
      phone,
      call_first: call_first ? 1 : 0,
      drop_footage,
      cable_type,
      bore_type,
      is_temp: is_temp ? 1 : 0,
      obstacles,
      premise_access,
      neighbor_notice,
      raw_notes: notes,
      rate_calculated: rate,
      manual_adjustment: 0,
      adjustment_reason: '',
      status: 'Pendiente',
      payment_status: 'Pendiente',
      cancel_reason: ''
    };
  }

  // 2. Smart Regex-Based Parser (for unstructured, pipe-separated, or OCR text)
  let cleanLine = rawLine
    .replace(/V\/OLF/gi, 'WOLF')
    .replace(/\bVi\s+WOLF\b/gi, 'W WOLF')
    .replace(/\\W\s+/gi, 'W ')
    .replace(/\bWW\s+WOLF\b/gi, 'W WOLF')
    .replace(/MISHAV\/AKA/gi, 'MISHAWAKA')
    .replace(/MISHAVAKA/gi, 'MISHAWAKA')
    .replace(/\b(?:0ROP|OROP|DR0P|DR0|JR0)\b/gi, 'DROP')
    .replace(/0ROP[:\s]/gi, 'DROP ');

  // Clean pipes and noise from OCR table cells
  cleanLine = cleanLine.replace(/[|~_\[\]]+/g, ' ');
  // Normalize OCR symbols misread as leading digit for 6-digit job ID:
  cleanLine = cleanLine.replace(/£(\d{5})\b/g, (m, p) => '8' + p);
  cleanLine = cleanLine.replace(/&(\d{5})\b/g, (m, p) => '8' + p);
  cleanLine = cleanLine.replace(/\bB(\d{5})\b/g, (m, p) => '8' + p);
  cleanLine = cleanLine.replace(/\bS(\d{5})\b/g, (m, p) => '5' + p);
  // Split merged 6-digit Job ID and street house number (e.g. 72061223608 -> 720612 23608)
  cleanLine = cleanLine.replace(/\b([5-9]\d{5})[1|]?(\d{1,5})\s+([A-Za-z])/g, '$1 $2 $3');
  // Handle Mype: or Nype: -> Type:
  cleanLine = cleanLine.replace(/([0-9.]+)[A-Za-z]{1,2}ype:/gi, '$1 / Type:');
  // If OCR read table border | before job ID as 1 (e.g. 1833906 121935 -> 833906 21935)
  cleanLine = cleanLine.replace(/\b1([5-9]\d{5})\s+1?(\d{1,5})\s+/g, '$1 $2 ');
  // Fix OCR artifacts like 4A0 -> 40
  cleanLine = cleanLine.replace(/\b4A0\s*/gi, '40 ');
  // Protect tech code like P0G2
  cleanLine = cleanLine.replace(/(\d{1,5})([a-zA-Z])/g, (m, p1, p2) => (m.toUpperCase().includes('P0G') ? m : p1 + ' ' + p2));
  // Separate street types stuck to street names (when followed by period, comma or space)
  cleanLine = cleanLine.replace(/\b([A-Za-z]{3,})(DR|AVE|ST|RD|LN|CT|WAY|CIR|TRL|BLVD|PKWY|TER|LOOP)[.,]/gi, '$1 $2.');
  cleanLine = cleanLine.replace(/\b([A-Za-z]{3,})(TRL|BLVD|CIR|PKWY)\b/gi, '$1 $2');
  // Fix WOLF & MISHAWAKA & HUNTERS
  cleanLine = cleanLine.replace(/\bW\s*OLF\b/gi, 'W WOLF');
  cleanLine = cleanLine.replace(/\bWW\s*WOLF\b/gi, 'W WOLF');
  cleanLine = cleanLine.replace(/\bWW\s*/gi, 'W ');
  cleanLine = cleanLine.replace(/\bHUN\s+TERS\b/gi, 'HUNTERS');

  // Detect Date
  let workDate = defaultDate;
  const dateMatch = cleanLine.match(/\b(\d{1,2})[-./](\d{1,2})[-./](20\d{2})\b/);
  if (dateMatch) {
    const m = dateMatch[1].padStart(2, '0');
    const d = dateMatch[2].padStart(2, '0');
    const y = dateMatch[3];
    workDate = `${y}-${m}-${d}`;
  }
  if (!workDate) workDate = new Date().toISOString().split('T')[0];

  // Detect Tech ID
  let techId = defaultTech || 'Javier (P0G1)';
  const techMatch = cleanLine.match(/([A-Za-z\s-]+?\([A-Za-z0-9]+\))/i) || cleanLine.match(/(OSDENINY\s*\([^)]+\))/i);
  if (techMatch) techId = techMatch[1].trim();

  // Detect Job ID (6 digits, range 500000 - 999999)
  let jobMatch = cleanLine.match(/\b([5-9]\d{5})\b/);
  if (!jobMatch) {
    const all6 = [...cleanLine.matchAll(/\b(\d{6})\b/g)];
    for (const m of all6) {
      if (!/202[4-7]/.test(m[1])) {
        jobMatch = m;
        break;
      }
    }
  }
  if (!jobMatch) return null;

  const jobId = jobMatch[1];
  const postJobText = cleanLine.substring(cleanLine.indexOf(jobId) + jobId.length).trim();

  // Street Address: search immediately after Job ID
  let address = 'Dirección por verificar';
  const streetTypes = 'AVE|DR|ST|RD|CIR|BLVD|WAY|LN|CT|LANE|COURT|CIRCLE|BOULEVARD|ROAD|STREET|DRIVE|EDGE|TER|TERRACE|LOOP|TRL|TRAIL|PL|PLACE|RUN|PATH|COUNTY\\s+ROAD(?:\\s+\\d+)?|CR\\s*\\d+';
  const addrRegex = new RegExp(`(\\d{1,5}\\s+.*?\\b(?:${streetTypes})\\b[.,]?)`, 'i');
  const addrMatch = postJobText.match(addrRegex);
  let textAfterAddr = postJobText;
  if (addrMatch) {
    address = addrMatch[1]
      .replace(/,\s*$/, '')
      .replace(/^[:\s,\[\]()|/]+/, '')
      .replace(/\bWW\s+/i, 'W ')
      .replace(/\bVi\s+/i, 'W ')
      .replace(/\\W\s+/i, 'W ')
      .trim();

    const addrEndIndex = postJobText.indexOf(addrMatch[1]) + addrMatch[1].length;
    textAfterAddr = postJobText.substring(addrEndIndex).replace(/[|\[\]~_]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // City detection: extract directly from OCR text after address (no hardcoded fallback)
  let city = '';
  // 1. Try to extract city from between address and zip code or remarks
  const cityBetweenMatch = textAfterAddr.match(/^([A-Za-z\s]+?)(?:,\s*|\s+)(?:4\d{4}|\d{5}|P#|CALLFIRST|DROP|Type|BORE|$)/i);
  if (cityBetweenMatch && cityBetweenMatch[1].trim().length >= 3) {
    const cand = cityBetweenMatch[1].trim().toUpperCase();
    if (!/\b(INDIANA|ILLINOIS|MICHIGAN|OHIO|USA|IN|IL|MI)\b/i.test(cand)) {
      city = cand;
    }
  }

  // 2. Known city lookup in remaining text
  if (!city) {
    const cityRegex = /\b(ELKHART|GOSHEN|MISHAWAKA|SOUTH\s+BEND|GRANGER|OSCEOLA|NAPPANEE|BRISTOL|MIDDLEBURY|WAKARUSA|PLYMOUTH|WARSAW|SKOKIE|CHICAGO|EVANSTON|NILES|LINCOLNWOOD)\b/i;
    const cityMatch = textAfterAddr.match(cityRegex) || postJobText.match(cityRegex);
    if (cityMatch) city = cityMatch[1].toUpperCase();
  }

  // Zip Code: extract from OCR text, do not force a default
  let zipCode = '';
  const zipMatch = textAfterAddr.match(/\b(\d{5}(?:-\d{4})?)\b/) || postJobText.match(/\b(\d{5}(?:-\d{4})?)\b/);
  if (zipMatch) zipCode = zipMatch[1];

  // Drop Footage
  let dropFootage = 100;
  const dropMatch = postJobText.match(/(?:DR[O0]{1,2}P|DR[0O]|JR[0O]|[0O]R[0O]P|DROP)[:\s->.]*([0-9]+(?:[.,\s]\d+)?)/i);
  if (dropMatch) {
    let clean = dropMatch[1].trim()
      .replace(/¢/g, '0')
      .replace(/^[->\s:.]+/g, '')
      .replace(/,/g, '.');

    if (/\d+\s+\d+/.test(clean)) {
      clean = clean.replace(/\s+/g, '.');
    }

    const parts = clean.split('.');
    if (parts.length > 2) {
      clean = parts[0] + '.' + parts.slice(1).join('');
    }
    const val = parseFloat(clean);
    if (!isNaN(val) && val > 0 && val < 2000) dropFootage = val;
  }

  // Cable Type
  let cableType = 'RG-6';
  if (/RG[- ]?(?:11|M\b|II\b|1[1lI])/i.test(postJobText)) {
    cableType = 'RG-11';
  }

  // Bore Type
  let boreType = 'N';
  if (/(?:BORE[:\s]*)?(?:DW|DV)[-:\s/.]*1/i.test(postJobText) || /\b(?:DW|DV)[-:\s/.]*1\b/i.test(postJobText)) {
    boreType = 'DW:1';
  } else if (/(?:BORE[:\s]*)?(?:SW|SV)[-:\s/.]*1/i.test(postJobText) || /\b(?:SW|SV)[-:\s/.]*1\b/i.test(postJobText) || /BORE[:\s]*(?:SW|SV)\b/i.test(postJobText)) {
    boreType = 'SW:1';
  }

  // Phone
  let phone = '';
  const pMatch = postJobText.match(/P#?[:\s]*(\d{10})/i) || postJobText.match(/\b(\d{10})\b/);
  if (pMatch) phone = pMatch[1];

  // Rate calculation
  let rate = 100;
  if (boreType === 'DW:1' || boreType.includes('DW')) rate += 30;
  if (dropFootage > 300) {
    const extraBlocks = Math.floor((dropFootage - 300) / 100);
    if (extraBlocks > 0) rate += extraBlocks * 25;
  }

  // Obstacles
  let obstacles = 'N';
  const obsMatch = postJobText.match(/Obstacl(?:es|ias)?[:\s]*([A-Za-z, ]+?)(?:\/|Premise|NBR|$)/i);
  if (obsMatch) {
    const obsVal = obsMatch[1].trim().toUpperCase();
    if (obsVal !== 'N' && obsVal.length > 0) {
      obstacles = obsVal.includes('LANDSC') ? 'LANDSC' : (obsVal.includes('SPRKR') || obsVal.includes('SPRKLR') ? 'SPRKL' : obsVal);
    }
  }

  return {
    work_date: workDate,
    tech_id: techId,
    job_id: jobId,
    address,
    city,
    zip_code: zipCode,
    phone,
    call_first: /CALLFIRST/i.test(postJobText) ? 1 : 0,
    drop_footage: dropFootage,
    cable_type: cableType,
    bore_type: boreType,
    is_temp: /TEMP[:\s.\-_]*Y/i.test(postJobText) ? 1 : 0,
    obstacles,
    premise_access: /RQHM/i.test(postJobText) ? 'RQHM' : /DOG/i.test(postJobText) ? 'DOG' : 'N',
    neighbor_notice: /NBR[:\s]*2/i.test(postJobText) ? '2' : 'N',
    raw_notes: '',
    rate_calculated: rate,
    manual_adjustment: 0,
    adjustment_reason: '',
    status: 'Pendiente',
    payment_status: 'Pendiente',
    cancel_reason: ''
  };
}

// Seed initial orders if empty
function seedInitialData() {
  const count = db.prepare('SELECT count(*) as total FROM work_orders').get().total;
  if (count > 0) return;

  const insertOrder = db.prepare(`
    INSERT INTO work_orders (
      work_date, tech_id, job_id, address, city, zip_code, phone,
      call_first, drop_footage, cable_type, bore_type, is_temp,
      obstacles, premise_access, neighbor_notice, raw_notes, rate_calculated
    ) VALUES (
      @work_date, @tech_id, @job_id, @address, @city, @zip_code, @phone,
      @call_first, @drop_footage, @cable_type, @bore_type, @is_temp,
      @obstacles, @premise_access, @neighbor_notice, @raw_notes, @rate_calculated
    )
  `);

  const sampleLines = [
    '10-22-2026\tOSDENINY (P0G2)\t626746\t23322 IRONWOOD DR,\tELKHART\t46516-6254\tCALLFIRST/P#:2094475840/DROP:103.73/Type:RG-11/BORE:DW:1/TEMP:Y/Obstacles:SPRKLR,LANDSC/Premise ACS:RQHM/NB',
    '10-22-2026\tOSDENINY (P0G2)\t713702\t712 W WOLF AVE,\tELKHART\t46516-2346\tP#:4441114444/DROP:140.2/Type:RG-11/BORE:DW:1/TEMP:N/Obstacles:LANDSC/Premise ACS:N/NBR:2',
    '10-22-2026\tOSDENINY (P0G2)\t717040\t50612 HUNTERS EDGE,\tELKHART\t46526-0000\tP#:5746126697/DROP:132.49/Type:RG-6/BORE:N/TEMP:N/Obstacles:N/Premise ACS:N/NBR:N',
    '10-22-2026\tOSDENINY (P0G2)\t716278\t1027 W WOLF AVE,\tELKHART\t46516-2239\tCALLFIRST/P#:5746067749/DROP:118.14/Type:RG-6/BORE:N/TEMP:Y/Obstacles:N/Premise ACS:/NBR:N',
    '10-22-2026\tOSDENINY (P0G2)\t726666\t2821 MALLOW ST,\tELKHART\t46514-9119\tP#:5743037147/DROP:42.08/Type:RG-6/BORE:N/TEMP:Y/Obstacles:N/Premise ACS:N/NBR:N',
    '10-22-2026\tOSDENINY (P0G2)\t729079\t708 W MISHAWAKA RD,\tELKHART\t46517-1912\tP#:5747425587/DROP:60.22/Type:RG-6/BORE:SW:1/TEMP:Y/Obstacles:LANDSC/Premise ACS:N/NBR:N',
    '10-22-2026\tOSDENINY (P0G2)\t720612\t23608 CEDAR KNOLL CIR,\tELKHART\t46516-5884\tP#:5742149465/DROP:108.37/Type:RG-6/BORE:N/TEMP:Y/Obstacles:N/Premise ACS:N/NBR:N'
  ];

  for (const line of sampleLines) {
    const parsed = parseDispatchLine(line);
    if (parsed) {
      try {
        insertOrder.run(parsed);
      } catch (err) {
        console.error('Error seeding order:', err.message);
      }
    }
  }
}

initDb();

module.exports = {
  db,
  parseDispatchLine
};
