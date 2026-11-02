import Tesseract from 'tesseract.js';

export function parseDispatchLine(line, defaultDate = null, defaultTech = null) {
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
    const city = (parts[4] || 'ELKHART').toUpperCase().trim();
    const zip_code = parts[5] || (city === 'GOSHEN' ? '46526' : city === 'BRISTOL' ? '46507' : '46516');
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

  cleanLine = cleanLine.replace(/(\d{1,5})([a-zA-Z])/g, '$1 $2');
  cleanLine = cleanLine.replace(/\b([A-Z]{3,})(TRL|BLVD|CIR|PKWY)\b/gi, '$1 $2');

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
  const techMatch = cleanLine.match(/([A-Z0-9_\s-]+\(P[0-9A-Z]{3}\))/i) || cleanLine.match(/(OSDENINY\s*\([^)]+\))/i);
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
    textAfterAddr = postJobText.substring(addrEndIndex).trim();
  }

  // City detection: check text after address first
  let city = 'ELKHART';
  const cityRegex = /\b(ELKHART|GOSHEN|MISHAWAKA|SOUTH\s+BEND|GRANGER|OSCEOLA|NAPPANEE|BRISTOL|MIDDLEBURY|WAKARUSA|PLYMOUTH|WARSAW)\b/i;
  const cityMatch = textAfterAddr.match(cityRegex) || postJobText.match(cityRegex);
  if (cityMatch) city = cityMatch[1].toUpperCase();

  // Zip Code
  let zipCode = city === 'GOSHEN' ? '46526' : city === 'BRISTOL' ? '46507' : '46516';
  const zipMatch = textAfterAddr.match(/\b(46\d{3}(?:-\d{4})?)\b/) || postJobText.match(/\b(46\d{3}(?:-\d{4})?)\b/);
  if (zipMatch) zipCode = zipMatch[1];

  // Drop Footage
  let dropFootage = 100;
  const dropMatch = postJobText.match(/(?:DROP|DR0P|DR0|JR0|0ROP|OROP)[:\s->.]*([0-9\s.,¢]+?)(?:\/|Type|BORE|TEMP|$)/i);
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
  if (/RG[- ]?11|RG[- ]?M\b|RG[- ]?II\b/i.test(postJobText)) {
    cableType = 'RG-11';
  }

  // Bore Type
  let boreType = 'N';
  if (/BORE[:\s]*(?:DW|DV)[-:\s/]*1/i.test(postJobText) || /\b(?:DW|DV)[-:\s/]*1\b/i.test(postJobText)) {
    boreType = 'DW:1';
  } else if (/BORE[:\s]*(?:SW|SV)[-:\s/]*1/i.test(postJobText) || /\b(?:SW|SV)[-:\s/]*1\b/i.test(postJobText) || /BORE[:\s]*(?:SW|SV)\b/i.test(postJobText)) {
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
    is_temp: /TEMP[:\s-]*Y/i.test(postJobText) ? 1 : 0,
    obstacles: /Obstacl(?:es|ias)?[:\s]*([A-Za-z, ]+?)(?:\/|Premise|NBR|$)/i.test(postJobText) ? 'LANDSC' : 'N',
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

export function extractOrdersFromOcrText(text, defaultDate, defaultTech) {
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

export async function recognizeDispatchSheet(imageSource, defaultDate = null, defaultTech = null, onProgress = null) {
  try {
    const result = await Tesseract.recognize(imageSource, 'eng', {
      logger: (m) => {
        if (onProgress && m.status === 'recognizing text' && m.progress !== undefined) {
          onProgress(Math.round(m.progress * 100));
        }
      }
    });

    const text = result.data.text || '';
    const parsedOrders = extractOrdersFromOcrText(text, defaultDate, defaultTech);

    return {
      text,
      parsedOrders
    };
  } catch (err) {
    console.error('Tesseract OCR error:', err);
    throw err;
  }
}
