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

  for (const line of lines) {
    const jobMatch = line.match(/\b([67]\d{5}|\d{6})\b/);
    if (!jobMatch) continue;

    const jobId = jobMatch[1];

    let dropFootage = 0;
    const dropMatch = line.match(/DROP[:\s]*([0-9]{1,4}(?:[.,\s][0-9]{1,2})?)/i);
    if (dropMatch) {
      let rawNum = dropMatch[1].replace(/\s+/g, '.').replace(',', '.');
      dropFootage = parseFloat(rawNum) || 0;
    }

    let cableType = 'RG-6';
    if (/RG-?11/i.test(line)) cableType = 'RG-11';

    let boreType = 'N';
    if (/BORE[:\s]*DW[-:\s]?1/i.test(line) || /DW[-:\s]?1/i.test(line)) boreType = 'DW:1';
    else if (/BORE[:\s]*SW[-:\s]?1/i.test(line) || /SW[-:\s]?1/i.test(line)) boreType = 'SW:1';

    const isTemp = /TEMP[:\s]*Y/i.test(line);

    let obstacles = 'N';
    const obstMatch = line.match(/Obstacl(?:es|ias)[:\s]*([A-Z,]+)/i);
    if (obstMatch) obstacles = obstMatch[1];

    let phone = '';
    const phoneMatch = line.match(/P#[:\s]*(\d{10})/i);
    if (phoneMatch) phone = phoneMatch[1];

    let address = 'Dirección por verificar';
    const addrMatch = line.match(/(\d{1,5}\s+[A-Za-z0-9\s]+(?:AVE|DR|ST|RD|CIR|BLVD|WAY|LN|CT)[.,]?)/i);
    if (addrMatch) {
      address = addrMatch[1].replace(/,\s*$/, '').trim();
    }

    let city = 'ELKHART';
    const cityMatch = line.match(/(ELKHART|GOSHEN|MISHAWAKA|SOUTH BEND|BRISTOL)/i);
    if (cityMatch) {
      city = cityMatch[1].toUpperCase();
    }

    let rate = 100;
    if (boreType === 'DW:1' || boreType.includes('DW')) rate += 30;
    if (dropFootage > 300) {
      const extraBlocks = Math.floor((dropFootage - 300) / 100);
      if (extraBlocks > 0) rate += extraBlocks * 25;
    }

    candidates.push({
      work_date: defaultDate || new Date().toISOString().split('T')[0],
      tech_id: defaultTech || 'Javier (P0G1)',
      job_id: jobId,
      address,
      city,
      zip_code: '46516',
      phone,
      call_first: /CALLFIRST/i.test(line) ? 1 : 0,
      drop_footage: dropFootage,
      cable_type: cableType,
      bore_type: boreType,
      is_temp: isTemp ? 1 : 0,
      obstacles,
      premise_access: /RQHM/i.test(line) ? 'RQHM' : 'N',
      neighbor_notice: /NBR[:\s]*2/i.test(line) ? '2' : 'N',
      raw_notes: line,
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

export async function recognizeDispatchSheet(imageSource, onProgress = null) {
  try {
    const result = await Tesseract.recognize(imageSource, 'eng', {
      logger: (m) => {
        if (onProgress && m.status === 'recognizing text' && m.progress !== undefined) {
          onProgress(Math.round(m.progress * 100));
        }
      }
    });

    const text = result.data.text || '';
    const parsedOrders = extractOrdersFromOcrText(text);

    return {
      text,
      parsedOrders
    };
  } catch (err) {
    console.error('Tesseract OCR error:', err);
    throw err;
  }
}
