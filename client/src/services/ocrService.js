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
               .replace(/\bWW\s+WOLF\b/gi, 'W WOLF')
               .replace(/['"]OSD/gi, 'OSD');

    // Look for Job ID (specifically 6 digits starting with 6 or 7)
    let jobMatch = line.match(/\b([67]\d{5})\b/);
    if (!jobMatch) {
      // Fallback: look for 6-digit number that isn't a date (doesn't contain year 2024-2027)
      const all6 = [...line.matchAll(/\b(\d{6})\b/g)];
      for (const m of all6) {
        if (!/202[4-7]/.test(m[1])) {
          jobMatch = m;
          break;
        }
      }
    }
    if (!jobMatch) continue;

    const jobId = jobMatch[1];
    const postJobText = line.substring(line.indexOf(jobId) + jobId.length).trim();

    // Work Date: always respect defaultDate selected by user, with fallback
    const workDate = defaultDate || new Date().toISOString().split('T')[0];

    // Drop footage: handles DROP, DR0P, DR0, JR0, etc.
    let dropFootage = 100;
    const dropMatch = postJobText.match(/(?:DROP|DR0P|DR0|JR0)[:\s->]*([0-9\s.,¢]+?)(?:\/|Type|BORE|TEMP|$)/i);
    if (dropMatch) {
      let clean = dropMatch[1].trim()
        .replace(/¢/g, '0')
        .replace(/^[->\s:]+/, '')
        .replace(/\s+/g, '.');
      const parts = clean.split('.');
      if (parts.length === 3 && parts[0].length <= 2 && parts[1].length >= 2) {
        clean = parts[1] + '.' + parts[2];
      } else if (parts.length > 2) {
        clean = parts[0] + '.' + parts.slice(1).join('');
      }
      const val = parseFloat(clean);
      if (!isNaN(val) && val > 0 && val < 2000) dropFootage = val;
    }

    // Cable type
    let cableType = 'RG-6';
    if (/RG-?11/i.test(postJobText)) cableType = 'RG-11';

    // Bore: DW:1 (+30) or SW:1 (+$0)
    let boreType = 'N';
    if (/BORE[:\s]*(?:DW|DV)[-:\s/]*1/i.test(postJobText) || /\b(?:DW|DV)[-:\s/]*1\b/i.test(postJobText)) {
      boreType = 'DW:1';
    } else if (/BORE[:\s]*(?:SW|SV)[-:\s/]*1/i.test(postJobText) || /\b(?:SW|SV)[-:\s/]*1\b/i.test(postJobText) || /BORE[:\s]*(?:SW|SV)\b/i.test(postJobText)) {
      boreType = 'SW:1';
    }

    // Temp
    const isTemp = /TEMP[:\s-]*Y/i.test(postJobText);

    // Obstacles
    let obstacles = 'N';
    const obstMatch = postJobText.match(/Obstacl(?:es|ias)?[:\s]*([A-Za-z, ]+?)(?:\/|Premise|NBR|$)/i);
    if (obstMatch) obstacles = obstMatch[1].trim();

    // Phone
    let phone = '';
    const p10 = postJobText.match(/P#[:\s]*(\d{10})/i) || postJobText.match(/\b(\d{10})\b/);
    if (p10) {
      phone = p10[1];
    } else {
      const pIndiana = postJobText.match(/(?:#|P#|2#|2%)\s*57[:. -]?(\d{7})/i);
      if (pIndiana) {
        phone = '574' + pIndiana[1];
      } else {
        const pGen = postJobText.match(/(?:#|P#)[:\s]*(\d{2,3})[:. -]?(\d{7})/i);
        if (pGen) {
          const area = pGen[1].length === 2 ? pGen[1] + pGen[1].slice(-1) : pGen[1];
          phone = (area + pGen[2]).padStart(10, '0');
        }
      }
    }

    // Zip code
    let zipCode = '46516';
    const zipMatch = postJobText.match(/\b(46\d{3}(?:-\d{4})?)\b/);
    if (zipMatch) zipCode = zipMatch[1];

    // City detection
    let city = 'ELKHART';
    const cityMatch = postJobText.match(/\b(ELKHART|GOSHEN|MISHAWAKA|SOUTH\s+BEND|GRANGER|OSCEOLA|NAPPANEE|BRISTOL|MIDDLEBURY|WAKARUSA|PLYMOUTH|WARSAW)\b/i);
    if (cityMatch) {
      city = cityMatch[1].toUpperCase();
    }

    // Address: search in postJobText
    let address = 'Dirección por verificar';
    const streetTypes = 'AVE|DR|ST|RD|CIR|BLVD|WAY|LN|CT|LANE|COURT|CIRCLE|BOULEVARD|ROAD|STREET|DRIVE|EDGE|TER|TERRACE|LOOP|TRL|TRAIL|PL|PLACE|RUN|PATH';
    const addrRegex = new RegExp(`(\\d{1,5}\\s+.*?\\b(?:${streetTypes})\\b[.,]?)`, 'i');
    const addrMatch = postJobText.match(addrRegex);
    if (addrMatch) {
      address = addrMatch[1]
        .replace(/,\s*$/, '')
        .replace(/^[:\s,]+/, '')
        .replace(/\bWW\s+/i, 'W ')
        .replace(/\bVi\s+/i, 'W ')
        .replace(/\\W\s+/i, 'W ')
        .trim();
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
      call_first: /CALLFIRST/i.test(postJobText) ? 1 : 0,
      drop_footage: dropFootage,
      cable_type: cableType,
      bore_type: boreType,
      is_temp: isTemp ? 1 : 0,
      obstacles,
      premise_access: /RQHM/i.test(postJobText) ? 'RQHM' : 'N',
      neighbor_notice: /NBR[:\s]*2/i.test(postJobText) ? '2' : 'N',
      raw_notes: detectedNotes,
      rate_calculated: rate,
      manual_adjustment: 0,
      adjustment_reason: '',
      status: 'Pendiente',
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
