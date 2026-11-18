const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

async function createSettlementPdf({
  filename,
  titleType, // 'EXACT' | 'EXTRA_CREDIT' | 'MISSING_ORDER'
  techId = 'P0G2',
  techName = 'Osdeiny Pelaez Hernandez',
  weekPeriod = '10-18-26 to 10-24-26',
  issueDate = '11/02/2026',
  contractorName = 'Empire Cable - Chicago Heartland Prince'
}) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // Standard US Letter
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const black = rgb(0.08, 0.1, 0.12);
  const darkGray = rgb(0.25, 0.28, 0.32);
  const lightGray = rgb(0.92, 0.94, 0.96);
  const borderGray = rgb(0.78, 0.82, 0.86);
  const primaryBlue = rgb(0.08, 0.38, 0.74);
  const greenText = rgb(0.05, 0.55, 0.25);
  const redText = rgb(0.75, 0.15, 0.15);

  let y = 745;

  // Header: Contractor & Company Title
  page.drawText(contractorName.toUpperCase(), { x: 40, y, size: 13, font: fontBold, color: primaryBlue });
  page.drawText('XFINITY / COMCAST BROADBAND SERVICES', { x: 370, y, size: 8, font: fontBold, color: darkGray });
  y -= 14;
  page.drawText('DAILY TECH SUMMARY & PAYROLL SETTLEMENT', { x: 40, y, size: 10, font: fontBold, color: black });
  page.drawText('DROP BURY DIVISION', { x: 462, y, size: 8, font: fontRegular, color: darkGray });

  y -= 8;
  page.drawLine({ start: { x: 40, y }, end: { x: 572, y }, thickness: 1.5, color: primaryBlue });
  y -= 16;

  // Tech & Period Info Block
  page.drawRectangle({
    x: 40,
    y: y - 36,
    width: 532,
    height: 44,
    color: lightGray,
    borderColor: borderGray,
    borderWidth: 1
  });

  page.drawText('Technician:', { x: 50, y: y - 10, size: 8.5, font: fontBold, color: darkGray });
  page.drawText(`${techId} - ${techName}`, { x: 105, y: y - 10, size: 9, font: fontBold, color: black });

  page.drawText('Pay Period:', { x: 340, y: y - 10, size: 8.5, font: fontBold, color: darkGray });
  page.drawText(weekPeriod, { x: 395, y: y - 10, size: 9, font: fontBold, color: black });

  page.drawText('Market / Hub:', { x: 50, y: y - 26, size: 8.5, font: fontBold, color: darkGray });
  page.drawText('Elkhart / South Bend IN', { x: 115, y: y - 26, size: 8.5, font: fontRegular, color: black });

  page.drawText('Issue Date:', { x: 340, y: y - 26, size: 8.5, font: fontBold, color: darkGray });
  page.drawText(issueDate, { x: 395, y: y - 26, size: 8.5, font: fontRegular, color: black });

  y -= 55;

  // Section: Itemized Jobs
  page.drawText('ITEMIZED COMPLETED WORK ORDERS (AUDITED)', { x: 40, y, size: 9.5, font: fontBold, color: black });
  y -= 14;

  // Table Headers
  page.drawRectangle({
    x: 40,
    y: y - 14,
    width: 532,
    height: 18,
    color: rgb(0.85, 0.89, 0.94),
    borderColor: borderGray,
    borderWidth: 1
  });

  page.drawText('JOB #', { x: 45, y: y - 10, size: 7.5, font: fontBold, color: black });
  page.drawText('DATE', { x: 92, y: y - 10, size: 7.5, font: fontBold, color: black });
  page.drawText('SERVICE ADDRESS', { x: 145, y: y - 10, size: 7.5, font: fontBold, color: black });
  page.drawText('CITY', { x: 300, y: y - 10, size: 7.5, font: fontBold, color: black });
  page.drawText('CODES / ITEM', { x: 360, y: y - 10, size: 7.5, font: fontBold, color: black });
  page.drawText('FOOTAGE', { x: 450, y: y - 10, size: 7.5, font: fontBold, color: black });
  page.drawText('PAID', { x: 520, y: y - 10, size: 7.5, font: fontBold, color: black });

  y -= 14;

  const allJobs = [
    { job: '626746', date: '10/22/2026', addr: '23322 IRONWOOD DR', city: 'ELKHART', code: 'B003 + D20 (DW)', ft: '103.7 ft', amt: 130 },
    { job: '713702', date: '10/22/2026', addr: '712 W WOLF AVE', city: 'ELKHART', code: 'B003 + D20 (DW)', ft: '140.2 ft', amt: 130 },
    { job: '717040', date: '10/22/2026', addr: '50612 HUNTERS EDGE', city: 'ELKHART', code: 'B003 (Standard)', ft: '132.5 ft', amt: 100 },
    { job: '716278', date: '10/22/2026', addr: '1027 W WOLF AVE', city: 'ELKHART', code: 'B003 (Standard)', ft: '118.1 ft', amt: 100 },
    { job: '726666', date: '10/22/2026', addr: '2821 MALLOW ST', city: 'ELKHART', code: 'B003 (Standard)', ft: '42.1 ft', amt: 100 },
    { job: '729079', date: '10/22/2026', addr: '708 W MISHAWAKA RD', city: 'ELKHART', code: 'B003 + SW:1', ft: '60.2 ft', amt: 100 },
    { job: '720612', date: '10/22/2026', addr: '23608 CEDAR KNOLL CIR', city: 'ELKHART', code: 'B003 (Standard)', ft: '108.4 ft', amt: 100 }
  ];

  let displayJobs = [...allJobs];
  let subtotalAmount = 760;
  let creditsAmount = 0;
  let debitsAmount = 0;
  let totalPay = 760;
  let noteText = '';

  if (titleType === 'EXACT') {
    subtotalAmount = 760;
    creditsAmount = 0;
    debitsAmount = 0;
    totalPay = 760;
    noteText = 'Settlement matches 100% with registered work orders. All 7 drop buries paid in full.';
  } else if (titleType === 'EXTRA_CREDIT') {
    subtotalAmount = 760;
    creditsAmount = 100; // +$100 Bono / Crédito a favor
    debitsAmount = 0;
    totalPay = 860;
    noteText = 'Includes +$100.00 Weekly Production Performance Bonus (Credit line).';
  } else if (titleType === 'MISSING_ORDER') {
    // Omite el primer trabajo (Job 626746 a $130) o lo deja fuera de la liquidación
    displayJobs = allJobs.slice(1);
    subtotalAmount = 630;
    creditsAmount = 0;
    debitsAmount = 0;
    totalPay = 630;
    noteText = 'ALERT: Job #626746 (23322 IRONWOOD DR) pending engineering tap verification. Not included in this cycle (-$130.00).';
  }

  // Draw Job Rows
  for (let i = 0; i < displayJobs.length; i++) {
    const j = displayJobs[i];
    const rowBg = i % 2 === 0 ? rgb(1, 1, 1) : rgb(0.97, 0.98, 0.99);

    page.drawRectangle({
      x: 40,
      y: y - 17,
      width: 532,
      height: 17,
      color: rowBg,
      borderColor: borderGray,
      borderWidth: 0.5
    });

    page.drawText(j.job, { x: 45, y: y - 12, size: 7.5, font: fontBold, color: black });
    page.drawText(j.date, { x: 92, y: y - 12, size: 7.5, font: fontRegular, color: darkGray });
    page.drawText(j.addr, { x: 145, y: y - 12, size: 7.5, font: fontRegular, color: black });
    page.drawText(j.city, { x: 300, y: y - 12, size: 7.5, font: fontRegular, color: darkGray });
    page.drawText(j.code, { x: 360, y: y - 12, size: 7.5, font: fontRegular, color: black });
    page.drawText(j.ft, { x: 450, y: y - 12, size: 7.5, font: fontRegular, color: darkGray });
    page.drawText(`$${j.amt.toFixed(2)}`, { x: 520, y: y - 12, size: 7.5, font: fontBold, color: black });

    y -= 17;
  }

  y -= 18;

  // Code summary table
  page.drawText('PRODUCTION SUMMARY BY RATE CODE', { x: 40, y, size: 9, font: fontBold, color: black });
  y -= 13;

  page.drawRectangle({
    x: 40,
    y: y - 13,
    width: 320,
    height: 15,
    color: rgb(0.85, 0.89, 0.94),
    borderColor: borderGray,
    borderWidth: 1
  });

  page.drawText('CODE', { x: 45, y: y - 10, size: 7, font: fontBold, color: black });
  page.drawText('DESCRIPTION', { x: 85, y: y - 10, size: 7, font: fontBold, color: black });
  page.drawText('PRICE', { x: 235, y: y - 10, size: 7, font: fontBold, color: black });
  page.drawText('QTY', { x: 275, y: y - 10, size: 7, font: fontBold, color: black });
  page.drawText('TOTAL', { x: 305, y: y - 10, size: 7, font: fontBold, color: black });

  y -= 13;

  const codesSummary = titleType === 'MISSING_ORDER' ? [
    { code: 'B003', desc: 'Drop Bury in Conduit <=300ft', price: 100, qty: 6, total: 600 },
    { code: 'D20', desc: 'Extra Driveway Bore Included', price: 30, qty: 1, total: 30 }
  ] : [
    { code: 'B003', desc: 'Drop Bury in Conduit <=300ft', price: 100, qty: 7, total: 700 },
    { code: 'D20', desc: 'Extra Driveway Bore Included', price: 30, qty: 2, total: 60 }
  ];

  for (const c of codesSummary) {
    page.drawRectangle({
      x: 40,
      y: y - 14,
      width: 320,
      height: 14,
      color: rgb(1, 1, 1),
      borderColor: borderGray,
      borderWidth: 0.5
    });

    page.drawText(c.code, { x: 45, y: y - 10, size: 7, font: fontBold, color: black });
    page.drawText(c.desc, { x: 85, y: y - 10, size: 6.8, font: fontRegular, color: darkGray });
    page.drawText(`$${c.price}`, { x: 235, y: y - 10, size: 7, font: fontRegular, color: black });
    page.drawText(String(c.qty), { x: 280, y: y - 10, size: 7, font: fontBold, color: black });
    page.drawText(`$${c.total.toFixed(2)}`, { x: 305, y: y - 10, size: 7, font: fontBold, color: black });
    y -= 14;
  }

  // Financial Settlement Box (Right side aligned with code summary)
  const boxTop = y + (codesSummary.length * 14) + 13;
  page.drawRectangle({
    x: 375,
    y: boxTop - 85,
    width: 197,
    height: 85,
    color: rgb(0.97, 0.98, 1),
    borderColor: primaryBlue,
    borderWidth: 1.2
  });

  page.drawText('PAYROLL TOTALS & DISBURSEMENTS', { x: 382, y: boxTop - 12, size: 7.5, font: fontBold, color: primaryBlue });

  page.drawText('Gross Production:', { x: 385, y: boxTop - 26, size: 8, font: fontRegular, color: darkGray });
  page.drawText(`$${subtotalAmount.toFixed(2)}`, { x: 505, y: boxTop - 26, size: 8.5, font: fontBold, color: black });

  page.drawText('Credits (Bonus/Adj):', { x: 385, y: boxTop - 40, size: 8, font: fontRegular, color: darkGray });
  page.drawText(`+$${creditsAmount.toFixed(2)}`, { x: 505, y: boxTop - 40, size: 8.5, font: fontBold, color: creditsAmount > 0 ? greenText : darkGray });

  page.drawText('Debits (Deductions):', { x: 385, y: boxTop - 54, size: 8, font: fontRegular, color: darkGray });
  page.drawText(`-$${debitsAmount.toFixed(2)}`, { x: 505, y: boxTop - 54, size: 8.5, font: fontBold, color: debitsAmount > 0 ? redText : darkGray });

  page.drawLine({ start: { x: 380, y: boxTop - 60 }, end: { x: 567, y: boxTop - 60 }, thickness: 1, color: borderGray });

  page.drawText('TOTAL PAY (CHECK):', { x: 385, y: boxTop - 74, size: 8.5, font: fontBold, color: black });
  page.drawText(`$${totalPay.toFixed(2)}`, { x: 495, y: boxTop - 75, size: 11, font: fontBold, color: primaryBlue });

  y -= 35;

  // Notes & Audit Disclaimer
  page.drawRectangle({
    x: 40,
    y: y - 40,
    width: 532,
    height: 40,
    color: lightGray,
    borderColor: borderGray,
    borderWidth: 0.8
  });

  page.drawText('AUDIT & PAYROLL NOTES:', { x: 48, y: y - 12, size: 7.5, font: fontBold, color: black });
  page.drawText(noteText, { x: 48, y: y - 24, size: 7.5, font: fontRegular, color: titleType === 'MISSING_ORDER' ? redText : darkGray });
  page.drawText('Official Settlement document issued by Empire Cable Accounting Dept. Retain for tax records.', { x: 48, y: y - 35, size: 6.8, font: fontRegular, color: rgb(0.4, 0.45, 0.5) });

  y -= 60;

  // Signatures
  page.drawLine({ start: { x: 50, y }, end: { x: 230, y }, thickness: 0.8, color: darkGray });
  page.drawText('Authorized Signature (Empire Cable)', { x: 60, y: y - 10, size: 7.5, font: fontRegular, color: darkGray });

  page.drawLine({ start: { x: 370, y }, end: { x: 550, y }, thickness: 0.8, color: darkGray });
  page.drawText('Technician Signature (Acknowledgment)', { x: 385, y: y - 10, size: 7.5, font: fontRegular, color: darkGray });

  const pdfBytes = await doc.save();
  fs.writeFileSync(filename, pdfBytes);
  console.log(`✓ Created PDF: ${filename} (${pdfBytes.length} bytes)`);
}

async function main() {
  const receiptsDir = path.resolve(__dirname, 'uploads', 'receipts');
  const userFolder = path.resolve(__dirname, 'PDFs_Prueba_Liquidacion');

  if (!fs.existsSync(receiptsDir)) fs.mkdirSync(receiptsDir, { recursive: true });
  if (!fs.existsSync(userFolder)) fs.mkdirSync(userFolder, { recursive: true });

  const pdfConfigs = [
    {
      filenameUser: path.join(userFolder, '1_Liquidacion_Semana_10-24-26_CUADRA_EXACTO.pdf'),
      filenameUpload: path.join(receiptsDir, 'Liquidacion_Semana_10-24-26_CUADRA_EXACTO.pdf'),
      titleType: 'EXACT'
    },
    {
      filenameUser: path.join(userFolder, '2_Liquidacion_Semana_10-24-26_DE_MAS_CREDITO_100.pdf'),
      filenameUpload: path.join(receiptsDir, 'Liquidacion_Semana_10-24-26_DE_MAS_CREDITO_100.pdf'),
      titleType: 'EXTRA_CREDIT'
    },
    {
      filenameUser: path.join(userFolder, '3_Liquidacion_Semana_10-24-26_DE_MENOS_FALTANTE_130.pdf'),
      filenameUpload: path.join(receiptsDir, 'Liquidacion_Semana_10-24-26_DE_MENOS_FALTANTE_130.pdf'),
      titleType: 'MISSING_ORDER'
    }
  ];

  for (const cfg of pdfConfigs) {
    await createSettlementPdf({ filename: cfg.filenameUser, titleType: cfg.titleType });
    await createSettlementPdf({ filename: cfg.filenameUpload, titleType: cfg.titleType });
  }

  console.log('\n🎉 ALL 3 TEST PDFS SUCCESSFULLY GENERATED!');
}

main().catch(console.error);
