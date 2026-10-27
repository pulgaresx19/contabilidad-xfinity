import Tesseract from 'tesseract.js';

export function parseDispatchLine(line) {
  let parts = line.split('\t');
  if (parts.length < 4) {
    parts = line.split(/\s{2,}|\t/);
  }
  parts = parts.map((p) => p.trim()).filter(Boolean);
  if (parts.length < 4) return null;

  const work_date = parts[0] || new Date().toISOString().split('T')[0];
  const tech_id = parts[1] || 'Javier (P0G1)';
  const job_id = parts[2] || '';
  const address = (parts[3] || '').replace(/,\s*$/, '');
  const city = parts[4] || '';
  const zip_code = parts[5] || '';
  const notes = parts.slice(6).join(' ');

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
    for (const t of tokens) {
      const up = t.toUpperCase().trim();
      if (up === 'CALLFIRST') {
        call_first = true;
      } else if (up.startsWith('P#:')) {
        phone = t.substring(3).trim();
      } else if (up.startsWith('DROP:')) {
        const numStr = t.substring(5).trim().replace(',', '.');
        drop_footage = parseFloat(numStr) || 0;
      } else if (up.startsWith('TYPE:')) {
        cable_type = t.substring(5).trim().toUpperCase();
      } else if (up.startsWith('BORE:')) {
        bore_type = t.substring(5).trim().toUpperCase();
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
  if (bore_type.toUpperCase().includes('DW')) {
    rate += 30;
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

export function extractOrdersFromOcrText(text, defaultDate, defaultTech) {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 8);
  const candidates = [];

  for (let line of lines) {
    // Normalize common OCR artifacts
    line = line.replace(/V\/OLF/gi, 'WOLF')
               .replace(/\bVi\s+WOLF\b/gi, 'W WOLF')
               .replace(/\\W\s+/gi, 'W ')
               .replace(/['"]OSD/gi, 'OSD');

    // Look for Job ID (typically 6-digit number starting with 6 or 7, or general 6 digits)
    const jobMatch = line.match(/\b([67]\d{5}|\d{6})\b/);
    if (!jobMatch) continue;

    const jobId = jobMatch[1];
    const postJobText = line.substring(line.indexOf(jobId) + jobId.length).trim();

    // Work Date: check if date is in line (e.g. 10-22-2026 or 2026-10-22)
    let workDate = defaultDate || new Date().toISOString().split('T')[0];
    const dateMatch = line.match(/\b(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})\b/);
    if (dateMatch) {
      const m = dateMatch[1].padStart(2, '0');
      const d = dateMatch[2].padStart(2, '0');
      const y = dateMatch[3].length === 2 ? '20' + dateMatch[3] : dateMatch[3];
      workDate = `${y}-${m}-${d}`;
    }

    // Drop footage
    let dropFootage = 100;
    const dropMatch = line.match(/DROP[:\s-]*([0-9]{1,4}(?:[.,\s][0-9]{1,2})?)/i);
    if (dropMatch) {
      const rawNum = dropMatch[1].replace(/\s+/g, '.').replace(',', '.');
      dropFootage = parseFloat(rawNum) || 100;
    }

    // Cable type
    let cableType = 'RG-6';
    if (/RG-?11/i.test(line)) cableType = 'RG-11';

    // Bore: DW:1 (+30) or SW:1 (+$0)
    let boreType = 'N';
    if (/BORE[:\s]*(?:DW|DV)[-:\s/]*1/i.test(line) || /\b(?:DW|DV)[-:\s/]*1\b/i.test(line)) {
      boreType = 'DW:1';
    } else if (/BORE[:\s]*(?:SW|SV)[-:\s/]*1/i.test(line) || /\b(?:SW|SV)[-:\s/]*1\b/i.test(line) || /BORE[:\s]*(?:SW|SV)\b/i.test(line)) {
      boreType = 'SW:1';
    }

    // Temp
    const isTemp = /TEMP[:\s-]*Y/i.test(line);

    // Obstacles
    let obstacles = 'N';
    const obstMatch = line.match(/Obstacl(?:es|ias)[:\s]*([A-Za-z, ]+?)(?:\/|Premise|NBR|$)/i);
    if (obstMatch) obstacles = obstMatch[1].trim();

    // Phone
    let phone = '';
    const phoneMatch = line.match(/P#[:\s]*(\d{10})/i) || line.match(/\b(\d{10})\b/);
    if (phoneMatch) phone = phoneMatch[1];

    // Zip code
    let zipCode = '46516';
    const zipMatch = line.match(/\b(46\d{3}(?:-\d{4})?)\b/);
    if (zipMatch) zipCode = zipMatch[1];

    // City detection
    let city = 'ELKHART';
    const cityMatch = line.match(/\b(ELKHART|GOSHEN|MISHAWAKA|SOUTH\s+BEND|GRANGER|OSCEOLA|NAPPANEE|BRISTOL|MIDDLEBURY|WAKARUSA|PLYMOUTH|WARSAW)\s+46\d{3}/i) ||
                      line.match(/\b(ELKHART|GOSHEN|MISHAWAKA|SOUTH\s+BEND|GRANGER|OSCEOLA|NAPPANEE|BRISTOL|MIDDLEBURY|WAKARUSA|PLYMOUTH|WARSAW)\b/i);
    if (cityMatch) {
      city = cityMatch[1].toUpperCase();
    }

    // Address: search in postJobText
    let address = 'Dirección por verificar';
    const streetTypes = 'AVE|DR|ST|RD|CIR|BLVD|WAY|LN|CT|LANE|COURT|CIRCLE|BOULEVARD|ROAD|STREET|DRIVE|EDGE|TER|TERRACE|LOOP|TRL|TRAIL|PL|PLACE|RUN|PATH';
    const addrRegex = new RegExp(`(\\d{1,5}\\s+.*?\\b(?:${streetTypes})\\b[.,]?)`, 'i');
    const addrMatch = postJobText.match(addrRegex) || line.match(addrRegex);
    if (addrMatch) {
      address = addrMatch[1].replace(/,\s*$/, '').replace(/^[:\s,]+/, '').replace(/\\W\s+/i, 'W ').trim();
    }

    // Rate calculation: $100 base + $30 for Driveway Bore (DW) + $25 por cada 100 ft > 300 ft
    let rate = 100;
    if (boreType === 'DW:1' || boreType.includes('DW')) rate += 30;
    if (dropFootage > 300) {
      const extraBlocks = Math.floor((dropFootage - 300) / 100);
      if (extraBlocks > 0) rate += extraBlocks * 25;
    }

    let detectedNotes = '';
    if (/urgent[e]?/i.test(line)) {
      detectedNotes = 'URGENTE';
    } else if (obstacles && obstacles !== 'N') {
      detectedNotes = obstacles;
    }

    candidates.push({
      work_date: workDate,
      tech_id: defaultTech || 'Javier (P0G1)',
      job_id: jobId,
      address,
      city,
      zip_code: zipCode,
      phone,
      call_first: /CALLFIRST/i.test(line) ? 1 : 0,
      drop_footage: dropFootage,
      cable_type: cableType,
      bore_type: boreType,
      is_temp: isTemp ? 1 : 0,
      obstacles,
      premise_access: /RQHM/i.test(line) ? 'RQHM' : 'N',
      neighbor_notice: /NBR[:\s]*2/i.test(line) ? '2' : 'N',
      raw_notes: detectedNotes,
      rate_calculated: rate,
      manual_adjustment: 0,
      adjustment_reason: '',
      status: 'Completado',
      payment_status: 'Pendiente',
      cancel_reason: ''
    });
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
