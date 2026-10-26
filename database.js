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
function parseDispatchLine(line) {
  // Can be tab-separated, semicolon, or multi-space separated
  // Example: 10-22-2026 \t OSDENINY (P0G2) \t 626746 \t 23322 IRONWOOD DR, \t ELKHART \t 46516-6254 \t CALLFIRST/P#:2094475840/...
  let parts = line.split('\t');
  if (parts.length < 4) {
    // Try splitting by 2 or more spaces or commas
    parts = line.split(/\s{2,}|\t/);
  }

  // Clean strings
  parts = parts.map(p => p.trim()).filter(Boolean);

  if (parts.length < 4) {
    return null;
  }

  const work_date = parts[0] || new Date().toISOString().split('T')[0];
  const tech_id = parts[1] || 'Javier (P0G1)';
  const job_id = parts[2] || '';
  const address = (parts[3] || '').replace(/,\s*$/, '');
  const city = parts[4] || '';
  const zip_code = parts[5] || '';
  const notes = parts.slice(6).join(' ');

  // Parse notes sub-tokens (separated by /)
  let call_first = false;
  let phone = '';
  let drop_footage = 0;
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

      if (t.toUpperCase() === 'CALLFIRST') {
        call_first = true;
      } else if (t.toUpperCase().startsWith('P#:')) {
        phone = t.substring(3).trim();
      } else if (t.toUpperCase().startsWith('DROP:')) {
        drop_footage = parseFloat(t.substring(5).trim()) || 0;
      } else if (t.toUpperCase().startsWith('TYPE:')) {
        cable_type = t.substring(5).trim();
      } else if (t.toUpperCase().startsWith('BORE:')) {
        bore_type = t.substring(5).trim();
      } else if (t.toUpperCase().startsWith('TEMP:')) {
        is_temp = t.substring(5).trim().toUpperCase() === 'Y';
      } else if (t.toUpperCase().startsWith('OBSTACLES:')) {
        obstacles = t.substring(10).trim();
      } else if (t.toUpperCase().startsWith('PREMISE ACS:')) {
        premise_access = t.substring(12).trim() || 'N';
      } else if (t.toUpperCase().startsWith('NBR:')) {
        neighbor_notice = t.substring(4).trim();
      }
    }
  }

  // Calculate rate based on technician rules: $100 base + $30 for Driveway Bore (DW) + $25 por cada 100 ft > 300 ft
  let rate = 100;
  if (bore_type.toUpperCase().includes('DW')) {
    rate += 30; // Driveway bore: $30
  }
  if (drop_footage > 300) {
    const extraBlocks = Math.floor((drop_footage - 300) / 100);
    if (extraBlocks > 0) {
      rate += extraBlocks * 25;
    }
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

function seedInitialData() {
  const sampleLines = [
    `10-22-2026\tOSDENINY (P0G2)\t626746\t23322 IRONWOOD DR,\tELKHART\t46516-6254\tCALLFIRST/P#:2094475840/DROP:103.73/Type:RG-11/BORE:DW:1/TEMP:Y/Obstacles:SPRKLR,LANDSC/Premise ACS:RQHM/NBR:2`,
    `10-22-2026\tOSDENINY (P0G2)\t713702\t712 W WOLF AVE,\tELKHART\t46516-2346\tP#:4441114444/DROP:140.2/Type:RG-11/BORE:DW:1/TEMP:N/Obstacles:LANDSC/Premise ACS:N/NBR:2`,
    `10-22-2026\tOSDENINY (P0G2)\t717040\t50612 HUNTERS EDGE,\tELKHART\t46526-0000\tP#:5746126697/DROP:132.49/Type:RG-6/BORE:N/TEMP:N/Obstacles:N/Premise ACS:N/NBR:N`,
    `10-22-2026\tOSDENINY (P0G2)\t716278\t1027 W WOLF AVE,\tELKHART\t46516-2239\tCALLFIRST/P#:5746067749/DROP:118.14/Type:RG-6/BORE:N/TEMP:Y/Obstacles:N/Premise ACS:/NBR:N`,
    `10-22-2026\tOSDENINY (P0G2)\t726666\t2821 MALLOW ST,\tELKHART\t46514-9119\tP#:5743037147/DROP:42.08/Type:RG-6/BORE:N/TEMP:Y/Obstacles:N/Premise ACS:N/NBR:N`,
    `10-22-2026\tOSDENINY (P0G2)\t729079\t708 W MISHAWAKA RD,\tELKHART\t46517-1912\tP#:5747425587/DROP:60.22/Type:RG-6/BORE:SW:1/TEMP:Y/Obstacles:LANDSC/Premise ACS:N/NBR:N`,
    `10-22-2026\tOSDENINY (P0G2)\t720612\t23608 CEDAR KNOLL CIR,\tELKHART\t46516-5884\tP#:5742149465/DROP:108.37/Type:RG-6/BORE:N/TEMP:Y/Obstacles:N/Premise ACS:N/NBR:N`
  ];

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

  for (const line of sampleLines) {
    const parsed = parseDispatchLine(line);
    if (parsed) {
      try {
        stmt.run(parsed);
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
