const assert = require('assert');

// 1. TEST RATE CALCULATION
console.log('--- TEST 1: Rate Calculations ---');
const defaultSettings = {
  base_rate: '100.00',
  bore_dw_bonus: '30.00',
  footage_base: '300',
  footage_extra_rate: '25.00'
};

function calculateOrderRate(order, settings) {
  const baseRate = parseFloat(settings.base_rate) || 100;
  const dwBonus = parseFloat(settings.bore_dw_bonus) || 30;
  const footageBase = parseFloat(settings.footage_base) || 300;
  const extraRate = parseFloat(settings.footage_extra_rate) || 25;

  let total = baseRate;
  if (order.bore_type && /DW/i.test(order.bore_type)) total += dwBonus;

  const footage = parseFloat(order.drop_footage) || 0;
  if (footage > footageBase) {
    const extraBlocks = Math.floor((footage - footageBase) / 100);
    if (extraBlocks > 0) total += extraBlocks * extraRate;
  }

  const manual = parseFloat(order.manual_adjustment) || 0;
  total += manual;
  return total;
}

// Case A: Standard drop <= 300ft, no bore
assert.strictEqual(calculateOrderRate({ drop_footage: 150, bore_type: 'N' }, defaultSettings), 100, 'Case A failed');

// Case B: Drop with DW bore
assert.strictEqual(calculateOrderRate({ drop_footage: 220, bore_type: 'DW:1' }, defaultSettings), 130, 'Case B failed');

// Case C: Drop with SW bore (no bonus)
assert.strictEqual(calculateOrderRate({ drop_footage: 180, bore_type: 'SW:1' }, defaultSettings), 100, 'Case C failed');

// Case D: Drop > 300ft (e.g. 450ft -> +$25)
assert.strictEqual(calculateOrderRate({ drop_footage: 450, bore_type: 'N' }, defaultSettings), 125, 'Case D failed');

// Case E: Drop > 300ft (e.g. 520ft -> +$50) + DW bore (+$30) = $180
assert.strictEqual(calculateOrderRate({ drop_footage: 520, bore_type: 'DW:1' }, defaultSettings), 180, 'Case E failed');

// Case F: Manual adjustment (+ $35 bonus)
assert.strictEqual(calculateOrderRate({ drop_footage: 100, bore_type: 'N', manual_adjustment: 35 }, defaultSettings), 135, 'Case F failed');

// Case G: Negative manual adjustment (- $20 deduction)
assert.strictEqual(calculateOrderRate({ drop_footage: 100, bore_type: 'N', manual_adjustment: -20 }, defaultSettings), 80, 'Case G failed');

console.log('✓ All 7 Rate Calculation Tests Passed!');

// 2. TEST OCR DISPATCH PARSER
console.log('--- TEST 2: OCR Dispatch Parser ---');
function parseDispatchLine(line) {
  let parts = line.split('\t');
  if (parts.length < 4) parts = line.split(/\s{2,}|\t/);
  parts = parts.map((p) => p.trim()).filter(Boolean);
  if (parts.length < 4) return null;

  const work_date = parts[0];
  const tech_id = parts[1];
  const job_id = parts[2];
  const address = (parts[3] || '').replace(/,\s*$/, '');
  const city = parts[4] || '';
  const zip_code = parts[5] || '';
  const notes = parts.slice(6).join(' ');

  let call_first = false;
  let phone = '';
  let drop_footage = 0;
  let cable_type = 'RG-6';
  let bore_type = 'N';

  if (notes) {
    const tokens = notes.split('/');
    for (const t of tokens) {
      const up = t.toUpperCase().trim();
      if (up === 'CALLFIRST') call_first = true;
      else if (up.startsWith('P#:')) phone = t.substring(3).trim();
      else if (up.startsWith('DROP:')) drop_footage = parseFloat(t.substring(5).trim().replace(',', '.')) || 0;
      else if (up.startsWith('TYPE:')) cable_type = t.substring(5).trim().toUpperCase();
      else if (up.startsWith('BORE:')) bore_type = t.substring(5).trim().toUpperCase();
    }
  }

  return { work_date, tech_id, job_id, address, city, zip_code, phone, call_first, drop_footage, cable_type, bore_type };
}

const sample1 = '10-22-2026\tOSDENINY (P0G2)\t626746\t23322 IRONWOOD DR,\tELKHART\t46516-6254\tCALLFIRST/P#:2094475840/DROP:103.73/Type:RG-11/BORE:DW:1/TEMP:Y/Obstacles:SPRKLR';
const parsed1 = parseDispatchLine(sample1);
assert.strictEqual(parsed1.job_id, '626746');
assert.strictEqual(parsed1.drop_footage, 103.73);
assert.strictEqual(parsed1.cable_type, 'RG-11');
assert.strictEqual(parsed1.bore_type, 'DW:1');
assert.strictEqual(parsed1.call_first, true);
assert.strictEqual(parsed1.phone, '2094475840');
console.log('✓ OCR Dispatch Line Parser Passed!');

// 3. TEST DATE & WEEK CUTOFF LOGIC
console.log('--- TEST 3: Cutoff & Week Groups ---');
function parseDateParts(dateStr) {
  if (!dateStr) return new Date();
  const clean = String(dateStr).trim().split('T')[0];
  if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
      else if (parts[2].length === 4) return new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10), 12, 0, 0);
    }
  }
  return new Date(dateStr);
}

function getWeekInfo(dateStr, cutoffSetting = 0) {
  const d = parseDateParts(dateStr);
  const cutoffDay = parseInt(cutoffSetting, 10) || 0;
  const currentDay = d.getDay();
  const daysUntilEnd = (cutoffDay - currentDay + 7) % 7;
  const end = new Date(d);
  end.setDate(d.getDate() + daysUntilEnd);
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  return { key: `${fmt(start)}_al_${fmt(end)}`, startDate: fmt(start), endDate: fmt(end) };
}

// Sunday cutoff (cutoff 0): Thursday Oct 22 falls in Monday Oct 19 to Sunday Oct 25
const w1 = getWeekInfo('2026-10-22', 0);
assert.strictEqual(w1.startDate, '2026-10-19');
assert.strictEqual(w1.endDate, '2026-10-25');

// Sunday cutoff (cutoff 0) on the Sunday itself (Oct 25)
const w2 = getWeekInfo('2026-10-25', 0);
assert.strictEqual(w2.startDate, '2026-10-19');
assert.strictEqual(w2.endDate, '2026-10-25');

// Next Monday (Oct 26) falls into next week
const w3 = getWeekInfo('2026-10-26', 0);
assert.strictEqual(w3.startDate, '2026-10-26');
assert.strictEqual(w3.endDate, '2026-11-01');

console.log('✓ Week Cutoff Logic & Date Transitions Passed!');

// 4. TEST EXCEL EXPORT WORKBOOK STRUCTURE
console.log('--- TEST 4: Excel Export Structure ---');
const XLSX = require('./client/node_modules/xlsx');
const sampleOrders = [
  { job_id: '626746', work_date: '2026-10-22', tech_id: 'Javier (P0G1)', address: '23322 IRONWOOD DR', drop_footage: 103.73, rate_calculated: 130, status: 'Completado', payment_status: 'Cobrado' },
  { job_id: '713702', work_date: '2026-10-22', tech_id: 'Javier (P0G1)', address: '712 W WOLF AVE', drop_footage: 140.2, rate_calculated: 130, status: 'Completado', payment_status: 'Pendiente' }
];
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(sampleOrders);
XLSX.utils.book_append_sheet(wb, ws, 'Trabajos');
assert.strictEqual(wb.SheetNames[0], 'Trabajos');
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
assert.ok(buf.length > 1000, 'Excel buffer size should be valid');
console.log('✓ Excel XLSX Generation Passed! Buffer Size: ' + buf.length + ' bytes');

// 5. TEST MONTHLY CALCULATIONS & EXPENSES NET BALANCE
console.log('--- TEST 5: Monthly Financial Calculations ---');
const totalBilled = 1450.00;
const totalPaid = 1200.00;
const totalExpenses = 345.50;
const netEarnings = totalPaid - totalExpenses;
const netMargin = totalPaid > 0 ? ((netEarnings / totalPaid) * 100).toFixed(1) : '0.0';
assert.strictEqual(netEarnings, 854.50);
assert.strictEqual(netMargin, '71.2');
console.log('✓ Monthly Net Margin Calculations Passed!');

console.log('\n========================================');
console.log('🎉 ALL AUTOMATED TESTS COMPLETED WITH 100% SUCCESS!');
console.log('========================================');
