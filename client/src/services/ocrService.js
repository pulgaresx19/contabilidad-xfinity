import Tesseract from 'tesseract.js';
import { cleanRawNotes } from '../utils/remarkUtils.js';
import { calcOrderRate } from '../utils/rateUtils.js';

// Normalizer for address keys (for deduplication)
function normalizeAddrKey(addr) {
  return (addr || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Extract and normalize all bore types and quantities (SW, DW, RD) from text
export function extractBoreType(str) {
  if (!str) return 'N';
  const s = String(str).toUpperCase().trim();
  if (s === 'N' || s === 'NONE' || s === 'NO' || s.startsWith('N,') || s.startsWith('N/')) return 'N';

  const parts = [];

  // 1. Sidewalk / Acera (SW o SV)
  const swMatch = s.match(/\b(?:SW|SV)[:\s]*(\d+)/i);
  if (swMatch) {
    const qty = parseInt(swMatch[1], 10) || 1;
    parts.push(qty > 1 ? `SW:${qty}` : 'SW:1');
  } else if (/\b(?:SW|SV)\b/i.test(s)) {
    parts.push('SW:1');
  }

  // 2. Driveway / Entrada vehicular (DW o DV)
  const dwMatch = s.match(/\b(?:DW|DV|DOW)[:\s]*(\d+)/i);
  if (dwMatch) {
    const qty = parseInt(dwMatch[1], 10) || 1;
    parts.push(qty > 1 ? `DW:${qty}` : 'DW:1');
  } else if (/\b(?:DW|DV|DOW)\b/i.test(s) || /DRIVEWAY/i.test(s)) {
    parts.push('DW:1');
  }

  // 3. Road Bore / Calle (RD)
  const rdMatch = s.match(/\bRD[:\s]*(\d+)/i);
  if (rdMatch) {
    const qty = parseInt(rdMatch[1], 10) || 1;
    parts.push(qty > 1 ? `RD:${qty}` : 'RD:1');
  } else if (/\bRD\b/i.test(s) || /ROAD/i.test(s)) {
    parts.push('RD:1');
  }

  return parts.length > 0 ? parts.join(',') : 'N';
}

// Smart parser for Xfinity dispatch format lines
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
        } else if (/^(?:P#?[:\s]|P#\b|TEL[:\s]|PHONE[:\s]|CELL[:\s])/i.test(t)) {
          const rawP = t.replace(/^(?:P#?[:\s]|P#\b|TEL[:\s]|PHONE[:\s]|CELL[:\s])\s*/i, '').trim();
          const digits = rawP.replace(/\D/g, '');
          phone = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : (digits || rawP);
        } else if (up.startsWith('DROP:')) {
          const numStr = t.substring(5).trim().replace(',', '.');
          const val = parseFloat(numStr);
          if (!isNaN(val) && val > 0) drop_footage = val;
        } else if (up.startsWith('TYPE:')) {
          const typeStr = t.substring(5).trim().toUpperCase();
          if (/EP[O0]N|FIBER|FIBRA|FTTH|OPTIC/i.test(typeStr)) cable_type = 'EPON';
          else if (typeStr.includes('11')) cable_type = 'RG-11';
          else cable_type = 'RG-6';
        } else if (up.startsWith('BORE:')) {
          bore_type = extractBoreType(t.substring(5));
        } else if (up.startsWith('TEMP:')) {
          is_temp = t.substring(5).trim().toUpperCase() === 'Y';
        } else if (up.startsWith('OBSTACLES:')) {
          const obsRaw = t.substring(10).trim().toUpperCase();
          const obsList = [];
          if (/LANDSC|LANS|LANDS|^LA$|^L$/i.test(obsRaw)) obsList.push('LANDSC');
          if (/SPRKLR|SPRKL|SPRKR/i.test(obsRaw)) obsList.push('SPRKL');
          if (/DGFEN|\bDG\b|^DG$/i.test(obsRaw)) obsList.push('DGFEN');
          if (/PRIVLITE|PRIV/i.test(obsRaw)) obsList.push('PRIVLITE');
          obstacles = obsList.length > 0 ? obsList.join(',') : (obsRaw || 'N');
        } else if (up.startsWith('PREMISE ACS:') || up.startsWith('PREMISE:')) {
          premise_access = t.replace(/^(?:PREMISE\s*ACS|PREMISE)[:\s]*/i, '').trim() || 'N';
        } else if (up.startsWith('NBR:') || up.startsWith('NB:')) {
          neighbor_notice = t.replace(/^(?:NBR|NB)[:\s]*/i, '').trim().toUpperCase();
        } else if (up === 'NB') {
          neighbor_notice = 'N';
        }
      }
    }

    const rate = calcOrderRate({ drop_footage, bore_type }).total;

    return {
      work_date,
      tech_id,
      job_id,
      address,
      is_priority: /\[PRIORIDAD\]|PRIORITY|URGENTE|ROJO/i.test(rawLine) ? 1 : 0,
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
      raw_notes: cleanRawNotes(notes),
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
    .replace(/POR\s+IER/gi, 'PORTER')
    .replace(/VAI\s+PARAISO/gi, 'VALPARAISO')
    .replace(/MERRN\s*IVIIIF|MERRE\s*VAL/gi, 'MERRILLVILLE')
    .replace(/WES\s+VILLD/gi, 'WESTVILLE')
    .replace(/\beORTAGE\b/gi, 'PORTAGE')
    .replace(/\bObslacles\b/gi, 'Obstacles')
    .replace(/(\d)¢/g, '$10')
    .replace(/\bDR[0O]\s+2\s+(?=[0-9¢])/gi, 'DROP: ')
    .replace(/\b(?:DR0\s*OP|DRO\s*OP|DR0OP|DROOP|0ROP|OROP|DR0P|DROF|DR0|JR0)\b/gi, 'DROP')
    .replace(/0ROP[:\s]/gi, 'DROP ')
    .replace(/\b(?:RNRF|RORF|EORE)\b/gi, 'BORE')
    .replace(/\bDOW[:\s]*[1A]\b/gi, 'DW:1')
    .replace(/\bRG[- ]?(?:I1|TV)\b/gi, 'RG-11');

  // Clean pipes and noise from OCR table cells
  cleanLine = cleanLine.replace(/[|~_\[\]]+/g, ' ');
  // Normalize OCR symbols misread as leading digit for 6-digit job ID:
  cleanLine = cleanLine.replace(/£(\d{5})\b/g, (m, p) => '8' + p);
  cleanLine = cleanLine.replace(/&(\d{5})\b/g, (m, p) => '8' + p);
  cleanLine = cleanLine.replace(/\bB(\d{5})\b/g, (m, p) => '8' + p);
  cleanLine = cleanLine.replace(/\bS(\d{5})\b/g, (m, p) => '5' + p);
  // Split merged 6-digit Job ID and street house number (e.g. 72061223608 -> 720612 23608)
  cleanLine = cleanLine.replace(/\b([5-9]\d{5})[1|]?(\d{1,5})\s+([A-Za-z])/g, '$1 $2 $3');
  // If OCR read table border | before job ID as 1 (e.g. 1833906 121935 -> 833906 21935)
  cleanLine = cleanLine.replace(/\b1([5-9]\d{5})\s+1?(\d{1,5})\s+/g, '$1 $2 ');
  // Fix OCR artifacts like 4A0 -> 40
  cleanLine = cleanLine.replace(/\b4A0\s*/gi, '40 ');
  // Handle Mype: or Nype: -> Type:
  cleanLine = cleanLine.replace(/([0-9.]+)[A-Za-z]{1,2}ype:/gi, '$1 / Type:');
  // Protect tech code like P0G2
  cleanLine = cleanLine.replace(/(\d{1,5})([a-zA-Z])/g, (m, p1, p2) => (m.toUpperCase().includes('P0G') ? m : p1 + ' ' + p2));
  // Separate street types stuck to street names (when followed by period, comma or space)
  cleanLine = cleanLine.replace(/\b([A-Za-z]{3,})(DR|AVE|ST|RD|LN|CT|WAY|CIR|TRL|BLVD|PKWY|TER|LOOP)[.,]/gi, '$1 $2.');
  cleanLine = cleanLine.replace(/\b([A-Za-z]{3,})(TRL|BLVD|CIR|PKWY)\b/gi, '$1 $2');
  // Fix WOLF & MISHAWAKA & HUNTERS
  cleanLine = cleanLine.replace(/\bW\s*OLF\b/gi, 'W WOLF');
  cleanLine = cleanLine.replace(/\bW\s+W\s+WOLF\b/gi, 'W WOLF');
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
  const streetTypes = 'AVE|DR|ST|RD|CIR|BLVD|WAY|LN|CT|CV|COVE|LANE|COURT|CIRCLE|BOULEVARD|ROAD|STREET|DRIVE|EDGE|TER|TERRACE|LOOP|TRL|TRAIL|PL|PLACE|RUN|PATH|PKWY|PARKWAY|HWY|HIGHWAY|COUNTY\\s+ROAD(?:\\s+\\d+)?|CR\\s*\\d+';
  const addrRegex = new RegExp(`(\\d{1,5}\\s+[NSEW]\\s+\\d{1,4}\\s+[NSEW]\\b[.,]?|\\d{1,5}\\s+.*?\\b(?:${streetTypes})\\b[.,]?)`, 'i');
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
  const cityBetweenMatch = textAfterAddr.match(/^([A-Za-z\s]+?)(?:,\s*|\s+)(?:4\d{4}|\d{5}|P#|CALLFIRST|DROP|Type|BORE|$)/i);
  if (cityBetweenMatch && cityBetweenMatch[1].trim().length >= 3) {
    const cand = cityBetweenMatch[1].trim().toUpperCase();
    if (!/\b(INDIANA|ILLINOIS|MICHIGAN|OHIO|USA|IN|IL|MI)\b/i.test(cand)) {
      city = cand;
    }
  }

  // Known city lookup in remaining text
  if (!city) {
    const cityRegex = /\b(ELKHART|GOSHEN|MISHAWAKA|SOUTH\s+BEND|GRANGER|OSCEOLA|NAPPANEE|BRISTOL|MIDDLEBURY|WAKARUSA|PLYMOUTH|WARSAW|MERRILLVILLE|VALPARAISO|CHESTERTON|HOBART|PORTER|WESTVILLE|PORTAGE|CROWN\s+POINT|SCHERERVILLE|DYER|ST\s+JOHN|HIGHLAND|MUNSTER|GRIFFITH|HAMMOND|GARY|EAST\s+CHICAGO|LAKE\s+STATION|LOWELL|CEDAR\s+LAKE|WINFIELD|HEBRON|KOUTS|BURNS\s+HARBOR|LAPORTE|MICHIGAN\s+CITY|SKOKIE|CHICAGO|EVANSTON|NILES|LINCOLNWOOD)\b/i;
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

  // Cable Type (EPON / Fibra, RG-11 or RG-6)
  let cableType = 'RG-6';
  if (/EP[O0]N|FIBER|FIBRA|FTTH|OPTIC/i.test(postJobText)) {
    cableType = 'EPON';
  } else if (/RG[- ]?(?:11|M\b|II\b|1[1lI])/i.test(postJobText)) {
    cableType = 'RG-11';
  }

  // Bore Type: aislar el segmento de BORE antes de la siguiente diagonal o token
  let boreType = 'N';
  const boreSegmentMatch = postJobText.match(/\bBORE[:\s]*([^/]+?)(?=\s*\/|\s*(?:TEMP|OBSTACLES|PREMISE|NBR|REMARKS?)\b|$)/i);
  if (boreSegmentMatch) {
    boreType = extractBoreType(boreSegmentMatch[1]);
  } else {
    boreType = extractBoreType(postJobText);
  }

  // Phone
  let phone = '';
  const pMatch = postJobText.match(/(?:P#?|TEL|PHONE|CELL)[:\s]*([0-9\s().-]{10,15})/i) || postJobText.match(/\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/) || postJobText.match(/\b(\d{10})\b/);
  if (pMatch) {
    const rawDigits = (pMatch[1] || pMatch[0]).replace(/\D/g, '');
    phone = rawDigits.length === 11 && rawDigits.startsWith('1') ? rawDigits.slice(1) : rawDigits;
  }

  // Rate calculation (usa el motor oficial de tramos B003 - B003.9 y D20)
  const rate = calcOrderRate({ drop_footage: dropFootage, bore_type: boreType }).total;

  // Obstacles
  let obstacles = 'N';
  const obsMatch = postJobText.match(/Obstacl(?:es|ias)?[:\s-]*([A-Za-z, ]+?)(?:\/|Premise|NBR|$)/i);
  if (obsMatch) {
    const obsVal = obsMatch[1].trim().toUpperCase();
    if (obsVal !== 'N' && obsVal.length > 0 && !/^N\s*PREMIS/i.test(obsVal)) {
      const obsList = [];
      if (/LANDSC|LANS|LANDS|LANDY|\bLA\b|\bL\b/i.test(obsVal)) obsList.push('LANDSC');
      if (/SPRKLR|SPRKL|SPRKR/i.test(obsVal)) obsList.push('SPRKL');
      if (/DGFEN|\bDG\b/i.test(obsVal)) obsList.push('DGFEN');
      if (/PRIVLITE|PRIV/i.test(obsVal)) obsList.push('PRIVLITE');
      obstacles = obsList.length > 0 ? obsList.join(',') : obsVal;
    }
  }

  return {
    work_date: workDate,
    tech_id: techId,
    job_id: jobId,
    address,
    is_priority: /\[PRIORIDAD\]|PRIORITY|URGENTE|ROJO/i.test(rawLine) ? 1 : 0,
    city,
    zip_code: zipCode,
    phone,
    call_first: /CALLFIRST/i.test(postJobText) ? 1 : 0,
    drop_footage: dropFootage,
    cable_type: cableType,
    bore_type: boreType,
    is_temp: /TEMP[:\s.\-_]*Y/i.test(postJobText) ? 1 : 0,
    obstacles,
    premise_access: (() => {
      const paText = postJobText.replace(/CALL\s*FIRST/ig, '');
      if (/RQHM/i.test(paText)) return 'RQHM';
      if (/DOG/i.test(paText)) return 'DOG';
      if (/(?:GATE|LOCK)/i.test(paText)) return 'GATE';
      if (/\bCALL\b/i.test(paText)) return 'CALL';
      return 'N';
    })(),
    neighbor_notice: (() => {
      const m = postJobText.match(/\b(?:NBR|NB)[:\s]*([A-Za-z0-9]+)\b/i);
      if (m) return m[1].toUpperCase();
      if (/\bNB\b/i.test(postJobText)) return 'N';
      return 'N';
    })(),
    raw_notes: cleanRawNotes(postJobText),
    rate_calculated: rate,
    manual_adjustment: 0,
    adjustment_reason: '',
    status: 'Pendiente',
    payment_status: 'Pendiente',
    cancel_reason: ''
  };
}

// Client-side HTML Image Loader
function loadImage(source) {
  return new Promise((resolve, reject) => {
    if (source instanceof HTMLImageElement) return resolve(source);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;

    if (source instanceof Blob || source instanceof File) {
      img.src = URL.createObjectURL(source);
    } else if (typeof source === 'string') {
      img.src = source;
    } else {
      reject(new Error('Formato de imagen no soportado'));
    }
  });
}

export function extractOrdersFromOcrText(text, defaultDate = null, defaultTech = null) {
  if (!text) return [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const ordersList = [];
  for (const line of lines) {
    const parsed = parseDispatchLine(line, defaultDate, defaultTech);
    if (parsed) ordersList.push(parsed);
  }
  const finalOrders = [];
  const seenAddresses = new Set();
  const seenJobs = new Set();
  for (const o of ordersList) {
    const addrKey = normalizeAddrKey(o.address);
    if (addrKey && addrKey !== 'DIRECCIONPORVERIFICAR') {
      if (seenAddresses.has(addrKey)) continue;
      seenAddresses.add(addrKey);
    }
    if (o.job_id && seenJobs.has(o.job_id)) continue;
    if (o.job_id) seenJobs.add(o.job_id);
    finalOrders.push(o);
  }
  return finalOrders;
}

// High-Precision Client-Side OCR Engine with Dynamic Canvas Row-Slicing
export async function recognizeDispatchSheet(imageSource, defaultDate = null, defaultTech = null, onProgress = null) {
  try {
    const img = await loadImage(imageSource);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    // 1. Draw full image to canvas for pixel analysis
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = w;
    fullCanvas.height = h;
    const fullCtx = fullCanvas.getContext('2d', { willReadFrequently: true });
    fullCtx.drawImage(img, 0, 0);

    const imgData = fullCtx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // 2. Scanline horizontal darkness & full-width gridline analysis
    const rowDarkness = new Float32Array(h);
    const rowGridRatio = new Float32Array(h);
    for (let y = 0; y < h; y++) {
      let sum = 0;
      let darkPixels = 0;
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        sum += lum;
        if (lum < 212) darkPixels++;
      }
      rowDarkness[y] = sum / w;
      rowGridRatio[y] = darkPixels / w;
    }

    // 3. Find horizontal divider borders (prefer true full-width table gridlines)
    const gridCandidates = [];
    for (let y = 0; y < h; y++) {
      if (rowGridRatio[y] > 0.78) {
        if (gridCandidates.length === 0 || y - gridCandidates[gridCandidates.length - 1] > 10) {
          gridCandidates.push(y);
        }
      }
    }

    let borders = [];
    if (gridCandidates.length >= 3) {
      borders = [...gridCandidates];
      if (borders[0] > 10) borders.unshift(0);
      if (h - borders[borders.length - 1] > 10) borders.push(h);
    } else {
      const lineCandidates = [];
      for (let y = 1; y < h - 1; y++) {
        if (rowDarkness[y] < rowDarkness[y - 1] && rowDarkness[y] <= rowDarkness[y + 1] && rowDarkness[y] < 225) {
          lineCandidates.push(y);
        }
      }
      const filtered = [];
      for (const y of lineCandidates) {
        if (filtered.length === 0 || y - filtered[filtered.length - 1] > 12) filtered.push(y);
      }

      borders = [0, ...filtered];
      if (h - borders[borders.length - 1] > 10) borders.push(h);
      if (borders.length > 2 && borders[1] - borders[0] < 10) borders.shift();
      if (borders.length > 2 && borders[borders.length - 1] - borders[borders.length - 2] < 10) borders.pop();
    }

    const ordersList = [];
    const allLines = [];

    const worker = await Tesseract.createWorker('eng');

    // Case A: Table strip with detected rows (< 800px)
    if (h < 800 && borders.length >= 2) {
      await worker.setParameters({ tessedit_pageseg_mode: 7 }); // Single text line mode
      const totalSlices = borders.length - 1;

      for (let i = 0; i < totalSlices; i++) {
        const top = borders[i];
        const sliceH = borders[i + 1] - top;
        if (sliceH < 10) continue;

        // Detect red/pink priority highlight in the address cell region [0.22*w .. 0.50*w]
        let redPixels = 0;
        let sampledPixels = 0;
        const xStart = Math.floor(w * 0.22);
        const xEnd = Math.floor(w * 0.50);
        for (let sy = top; sy < top + sliceH; sy++) {
          for (let sx = xStart; sx < xEnd; sx++) {
            const idx = (sy * w + sx) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            sampledPixels++;
            if (r > 140 && (r - g) >= 22 && r >= b) redPixels++;
          }
        }
        const isRowPriority = sampledPixels > 0 && (redPixels / sampledPixels) > 0.08;

        const scale = 4;
        const pad = 10;
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = w * scale + pad * 2;
        sliceCanvas.height = sliceH * scale + pad * 2;
        const sCtx = sliceCanvas.getContext('2d');

        sCtx.fillStyle = '#FFFFFF';
        sCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        sCtx.imageSmoothingEnabled = true;
        sCtx.imageSmoothingQuality = 'high';
        sCtx.drawImage(fullCanvas, 0, top, w, sliceH, pad, pad, w * scale, sliceH * scale);

        // Normalize contrast & grayscale
        const sData = sCtx.getImageData(0, 0, sliceCanvas.width, sliceCanvas.height);
        const sd = sData.data;
        for (let j = 0; j < sd.length; j += 4) {
          const lum = 0.299 * sd[j] + 0.587 * sd[j + 1] + 0.114 * sd[j + 2];
          const enhanced = lum > 175 ? 255 : (lum < 95 ? 0 : lum);
          sd[j] = enhanced;
          sd[j + 1] = enhanced;
          sd[j + 2] = enhanced;
        }
        sCtx.putImageData(sData, 0, 0);

        if (onProgress) onProgress(Math.round(((i + 1) / totalSlices) * 90));

        const res = await worker.recognize(sliceCanvas);
        let line = (res.data.text || '').trim();
        if (line) {
          allLines.push(line);
          const parsed = parseDispatchLine(line, defaultDate, defaultTech);
          if (parsed) {
            if (isRowPriority) parsed.is_priority = 1;
            ordersList.push(parsed);
          }
        }
      }
    }

    // Case B: Full camera photo or fallback if slice pass found no orders
    if (ordersList.length === 0) {
      await worker.setParameters({ tessedit_pageseg_mode: 6 }); // Uniform block of text
      const scaledCanvas = document.createElement('canvas');
      const targetWidth = Math.min(2400, Math.max(1600, w * 2));
      const targetHeight = Math.round((h * targetWidth) / w);
      scaledCanvas.width = targetWidth;
      scaledCanvas.height = targetHeight;
      const scCtx = scaledCanvas.getContext('2d');
      scCtx.imageSmoothingEnabled = true;
      scCtx.imageSmoothingQuality = 'high';
      scCtx.drawImage(fullCanvas, 0, 0, targetWidth, targetHeight);

      if (onProgress) onProgress(60);
      const res = await worker.recognize(scaledCanvas);
      const lines = (res.data.text || '').split('\n').map(l => l.trim()).filter(Boolean);
      allLines.push(...lines);

      for (const line of lines) {
        const parsed = parseDispatchLine(line, defaultDate, defaultTech);
        if (parsed) ordersList.push(parsed);
      }
    }

    await worker.terminate();

    // Deduplicate
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

    if (onProgress) onProgress(100);

    return {
      text: allLines.join('\n'),
      parsedOrders: finalOrders
    };
  } catch (err) {
    console.error('Tesseract client OCR error:', err);
    throw err;
  }
}
