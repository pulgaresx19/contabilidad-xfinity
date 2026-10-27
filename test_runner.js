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

// Test extractOrdersFromOcrText logic
const { extractOrdersFromOcrText } = require('./client/src/services/ocrService.js');
const multiLineOcr = `
10-22-2026 OSDENINY 626746 23322 IRONWOOD DR, ELKHART 46516 CALLFIRST/P#:2094475840/DROP:103.73/Type:RG-11/BORE:DW:1
10-22-2026 OSDENINY 713702 1109 E BEARDSLEY AVE, ELKHART 46514 DROP:115.82/Type:RG-6/BORE:SW:1
10-22-2026 OSDENINY 717040 28747 V/OLF AVE, ELKHART 46514 DROP:450.00/BORE:DW:1
`;
const extracted = extractOrdersFromOcrText(multiLineOcr);
assert.strictEqual(extracted.length, 3, 'Should extract 3 orders');
assert.strictEqual(extracted[0].job_id, '626746');
assert.strictEqual(extracted[0].address, '23322 IRONWOOD DR');
assert.strictEqual(extracted[0].city, 'ELKHART');
assert.strictEqual(extracted[0].cable_type, 'RG-11');
assert.strictEqual(extracted[0].bore_type, 'DW:1');
assert.strictEqual(extracted[0].rate_calculated, 130);
assert.strictEqual(extracted[0].status, 'Pendiente');

assert.strictEqual(extracted[1].job_id, '713702');
assert.strictEqual(extracted[1].address, '1109 E BEARDSLEY AVE');
assert.strictEqual(extracted[1].bore_type, 'SW:1');
assert.strictEqual(extracted[1].rate_calculated, 100);
assert.strictEqual(extracted[1].status, 'Pendiente');

assert.strictEqual(extracted[2].job_id, '717040');
assert.strictEqual(extracted[2].address, '28747 WOLF AVE');
assert.strictEqual(extracted[2].drop_footage, 450);
assert.strictEqual(extracted[2].rate_calculated, 155);
assert.strictEqual(extracted[2].status, 'Pendiente');

// Test real-world noisy dispatch sheet from user upload (verifying 7 of 7 orders & both Wolf Ave lines)
const realWorldOcrSheet = `
CZ2.005 ORISVAYOUIGE 626745 23322 IRONWOOD DR = KART 6576-6254 CALLFIRST/P#2094475840:DROP 103.73 Type RG-11/BORE DV 1:TEMP:Y/Obstacles SPRKLR. LANDS C Premise ACS RQHM/NE
0.222025 OHIINAVUIGIL 713762 712 W WOLF AVE. = (ART 6576-2346 # 44:1114444/DROP:140 2/Type RG-11/BORE DV 1:TEMP.N/Obstacles LANDS C:Premise ACS N/NBR 2
Y0.22.2025 ORISA AVOIGZ. 717040 50612 HUNTERS EDGE. = KART LB526-0000 2# 57:6126697/DR0 132 49/Type RG-5:BORE N/TEMP-N; Obstacles N:Premise ACS:N/NBR'N
0.222025 OHIINAVOIGIL 716278 1027 WW WOLF AVE = (ART 6576-2239 CALLFIRST:P#5746067749/DROP 118.14 Type RG-6/BORE NTEMP Obstacles N:Premise ACS: /NBR N
0.222025 ORISA AVOGY 726666 2821 MALLOW ST, = KART 6574-9119 # 57:3037147/DR0 2 42 08/Type RG-6/BORE N'TEMP YiObstacles:N:Premise ACS N/:NBR N
Y0.22.20@5 OHIIVAVOIGI 729079 708 W MISHAWAKA RD. = (ART 5577-1912 # 57.7425587/DR0 2 6¢ 22/Type RG-6/BORE SV 1:TEMP Y/Obstacles LANDSC/Premise ACS N/NBR N
©02005  OBIZV AVG 720612 23608 CEDAR KNOLL CIR, ERS 66576-5384 2% 57:2149465/JR0 > 108 37/Type RG-6:BORE:NTEMP:YiObstacles NiPremise ACS N/NBRN
`;
const sheetExtracted = extractOrdersFromOcrText(realWorldOcrSheet, '2026-10-27');
assert.strictEqual(sheetExtracted.length, 7, 'Must extract all 7 orders without dropping duplicates');
assert.strictEqual(sheetExtracted[0].job_id, '626745');
assert.strictEqual(sheetExtracted[0].status, 'Pendiente');
assert.strictEqual(sheetExtracted[1].job_id, '713762');
assert.strictEqual(sheetExtracted[1].address, '712 W WOLF AVE.');
assert.strictEqual(sheetExtracted[1].bore_type, 'DW:1');
assert.strictEqual(sheetExtracted[1].drop_footage, 140.2);
assert.strictEqual(sheetExtracted[2].job_id, '717040');
assert.strictEqual(sheetExtracted[3].job_id, '716278');
assert.strictEqual(sheetExtracted[3].address, '1027 W WOLF AVE');
assert.strictEqual(sheetExtracted[4].job_id, '726666');
assert.strictEqual(sheetExtracted[4].drop_footage, 42.08);
assert.strictEqual(sheetExtracted[5].job_id, '729079');
assert.strictEqual(sheetExtracted[5].bore_type, 'SW:1');
assert.strictEqual(sheetExtracted[5].drop_footage, 60.22);
assert.strictEqual(sheetExtracted[6].job_id, '720612');
assert.strictEqual(sheetExtracted[6].drop_footage, 108.37);

console.log('✓ OCR Dispatch Line Parser & Multi-line OCR Extractor Passed (All 7 orders verified)!');

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

// 4. TEST MONTHLY SUMMARY TOTALS & MARGINS
console.log('--- TEST 4: Monthly Financial Summary & Totals ---');
function simulateMonthlySummary(allWeeks, expenses, selectedMonth) {
  const monthWeeks = allWeeks.filter((w) => {
    return w.startDate.startsWith(selectedMonth) || w.endDate.startsWith(selectedMonth);
  });

  let totalMonthEarnings = 0;
  let totalMonthPaid = 0;
  let totalMonthPending = 0;
  let totalMonthCompletedJobs = 0;
  let totalMonthFootage = 0;

  for (const w of monthWeeks) {
    totalMonthEarnings += w.totalEarnings || 0;
    totalMonthPaid += w.paidEarnings || 0;
    totalMonthPending += w.pendingEarnings || 0;
    totalMonthCompletedJobs += w.completedCount || 0;
    totalMonthFootage += w.totalFootage || 0;
  }

  let totalExpenses = 0;
  const expensesByCategory = {};
  for (const exp of expenses) {
    const amt = parseFloat(exp.amount) || 0;
    totalExpenses += amt;
    expensesByCategory[exp.category] = (expensesByCategory[exp.category] || 0) + amt;
  }

  const netPaidBalance = totalMonthPaid - totalExpenses;
  const netProjectedBalance = totalMonthEarnings - totalExpenses;
  const marginPercent = totalMonthPaid > 0 ? Math.round((netPaidBalance / totalMonthPaid) * 100) : 0;

  const totals = {
    totalWeeksCount: monthWeeks.length,
    completedWeeksCount: monthWeeks.filter((w) => w.isPaid).length,
    totalJobs: totalMonthCompletedJobs,
    totalFootage: Math.round(totalMonthFootage),
    totalEarnings: Math.round(totalMonthEarnings * 100) / 100,
    totalPaid: Math.round(totalMonthPaid * 100) / 100,
    totalPending: Math.round(totalMonthPending * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netPaidBalance: Math.round(netPaidBalance * 100) / 100,
    netProjectedBalance: Math.round(netProjectedBalance * 100) / 100,
    marginPercent
  };

  return { targetMonth: selectedMonth, weeks: monthWeeks, expenses, expensesByCategory, totals };
}

const mockWeeks = [
  { key: 'w1', startDate: '2026-10-19', endDate: '2026-10-25', isPaid: true, completedCount: 7, totalFootage: 820, totalEarnings: 820, paidEarnings: 820, pendingEarnings: 0 },
  { key: 'w2', startDate: '2026-10-26', endDate: '2026-11-01', isPaid: false, completedCount: 4, totalFootage: 450, totalEarnings: 490, paidEarnings: 0, pendingEarnings: 490 }
];

const mockExpenses = [
  { category: 'Vehículo', amount: 50 },
  { category: 'Combustible', amount: 35 },
  { category: 'Alimentación', amount: 100 }
];

const res = simulateMonthlySummary(mockWeeks, mockExpenses, '2026-10');
assert.strictEqual(res.totals.totalEarnings, 1310);
assert.strictEqual(res.totals.totalPaid, 820);
assert.strictEqual(res.totals.totalPending, 490);
assert.strictEqual(res.totals.totalExpenses, 185);
assert.strictEqual(res.totals.netPaidBalance, 635);
assert.strictEqual(res.totals.marginPercent, 77);
assert.strictEqual(res.totals.completedWeeksCount, 1);
assert.strictEqual(res.totals.totalWeeksCount, 2);
assert.strictEqual(res.expensesByCategory['Vehículo'], 50);
assert.strictEqual(res.expensesByCategory['Combustible'], 35);
assert.strictEqual(res.expensesByCategory['Alimentación'], 100);

console.log('✓ Monthly Totals & Expenses Calculations Passed!');

// 5. TEST EXCEL EXPORT WORKBOOK STRUCTURE
console.log('--- TEST 5: Excel Export Structure ---');
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

console.log('\n========================================');
console.log('🎉 ALL AUTOMATED TESTS COMPLETED WITH 100% SUCCESS!');
console.log('========================================');
