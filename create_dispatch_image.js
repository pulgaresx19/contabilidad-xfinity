const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function createDispatchSheetImage() {
  const width = 1200;
  const height = 900;

  const orders = [
    {
      num: 1,
      date: '10/22/2026',
      tech: 'P0G2',
      jobId: '626746',
      addr: '23322 IRONWOOD DR',
      city: 'ELKHART',
      zip: '46514',
      phone: '574-264-5512',
      notes: 'DROP:103.73 / TYPE:RG-11 / BORE:DW:1 / TEMP:Y'
    },
    {
      num: 2,
      date: '10/22/2026',
      tech: 'P0G2',
      jobId: '713702',
      addr: '712 W WOLF AVE',
      city: 'ELKHART',
      zip: '46516',
      phone: '574-522-8891',
      notes: 'DROP:140.20 / TYPE:RG-11 / BORE:DW:1 / TEMP:Y'
    },
    {
      num: 3,
      date: '10/22/2026',
      tech: 'P0G2',
      jobId: '717040',
      addr: '50612 HUNTERS EDGE',
      city: 'ELKHART',
      zip: '46514',
      phone: '574-293-4401',
      notes: 'DROP:132.49 / TYPE:RG-6 / BORE:N / TEMP:Y'
    },
    {
      num: 4,
      date: '10/22/2026',
      tech: 'P0G2',
      jobId: '716278',
      addr: '1027 W WOLF AVE',
      city: 'ELKHART',
      zip: '46516',
      phone: '574-389-1122',
      notes: 'DROP:118.14 / TYPE:RG-6 / BORE:N / TEMP:Y'
    },
    {
      num: 5,
      date: '10/22/2026',
      tech: 'P0G2',
      jobId: '726666',
      addr: '2821 MALLOW ST',
      city: 'ELKHART',
      zip: '46514',
      phone: '574-522-7744',
      notes: 'DROP:42.08 / TYPE:RG-6 / BORE:N / TEMP:Y'
    },
    {
      num: 6,
      date: '10/22/2026',
      tech: 'P0G2',
      jobId: '729079',
      addr: '708 W MISHAWAKA RD',
      city: 'ELKHART',
      zip: '46517',
      phone: '574-742-5587',
      notes: 'DROP:60.22 / TYPE:RG-6 / BORE:SW:1 / TEMP:Y / OBSTACLES:LANDSC'
    },
    {
      num: 7,
      date: '10/22/2026',
      tech: 'P0G2',
      jobId: '720612',
      addr: '23608 CEDAR KNOLL CIR',
      city: 'ELKHART',
      zip: '46516',
      phone: '574-214-9465',
      notes: 'DROP:108.37 / TYPE:RG-6 / BORE:N / TEMP:Y'
    }
  ];

  let rowsSvg = '';
  let y = 230;
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    rowsSvg += `
      <rect x="40" y="${y - 25}" width="1120" height="42" fill="${bg}" stroke="#cbd5e1" stroke-width="1"/>
      <text x="55" y="${y}" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#0f172a">${o.num}</text>
      <text x="85" y="${y}" font-family="Arial, sans-serif" font-size="13" fill="#334155">${o.date}</text>
      <text x="175" y="${y}" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#0369a1">${o.tech}</text>
      <text x="245" y="${y}" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#0f172a">${o.jobId}</text>
      <text x="330" y="${y}" font-family="Arial, sans-serif" font-size="13.5" font-weight="bold" fill="#0f172a">${o.addr}</text>
      <text x="560" y="${y}" font-family="Arial, sans-serif" font-size="13" fill="#334155">${o.city}</text>
      <text x="640" y="${y}" font-family="Arial, sans-serif" font-size="13" fill="#334155">${o.zip}</text>
      <text x="705" y="${y}" font-family="Arial, sans-serif" font-size="12.5" fill="#475569">${o.phone}</text>
      <text x="820" y="${y}" font-family="monospace, sans-serif" font-size="12" fill="#0284c7">${o.notes}</text>
    `;
    y += 42;
  }

  const svgContent = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="100%" stop-color="#1e293b"/>
        </linearGradient>
      </defs>

      <!-- Background -->
      <rect width="${width}" height="${height}" fill="#f1f5f9"/>

      <!-- Document Sheet Container -->
      <rect x="25" y="25" width="1150" height="850" rx="12" fill="#ffffff" stroke="#94a3b8" stroke-width="2"/>

      <!-- Header Banner -->
      <rect x="25" y="25" width="1150" height="95" rx="12" fill="url(#headerGrad)"/>
      <rect x="25" y="95" width="1150" height="25" fill="#0f172a"/>

      <text x="50" y="65" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#38bdf8">XFINITY / COMCAST - DROP BURY DISPATCH SHEET</text>
      <text x="50" y="95" font-family="Arial, sans-serif" font-size="13" fill="#94a3b8">EMPIRE CABLE - HEARTLAND DIVISION | DISPATCH ROUTE &amp; WORK ORDERS</text>
      <text x="960" y="65" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#ffffff">DATE: 10/22/2026</text>
      <text x="960" y="90" font-family="Arial, sans-serif" font-size="13" fill="#38bdf8">TECH: P0G2 (Osdeiny)</text>

      <!-- Info Box -->
      <rect x="40" y="135" width="1120" height="42" rx="6" fill="#e0f2fe" stroke="#7dd3fc" stroke-width="1.5"/>
      <text x="55" y="161" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#0369a1">HUB: ELKHART / SOUTH BEND</text>
      <text x="340" y="161" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#0369a1">TOTAL JOBS: 7</text>
      <text x="550" y="161" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#0369a1">PRODUCTION TARGET: $760.00</text>
      <text x="860" y="161" font-family="Arial, sans-serif" font-size="12" fill="#075985">DISPATCH CUTOFF: 6:00 PM</text>

      <!-- Table Header -->
      <rect x="40" y="190" width="1120" height="35" fill="#0284c7"/>
      <text x="50" y="213" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#ffffff">#</text>
      <text x="85" y="213" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#ffffff">FECHA</text>
      <text x="175" y="213" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#ffffff">TECH</text>
      <text x="245" y="213" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#ffffff">JOB ID</text>
      <text x="330" y="213" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#ffffff">DIRECCIÓN (ADDRESS)</text>
      <text x="560" y="213" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#ffffff">CIUDAD</text>
      <text x="640" y="213" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#ffffff">ZIP</text>
      <text x="705" y="213" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#ffffff">TELÉFONO</text>
      <text x="820" y="213" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#ffffff">ESPECIFICACIONES / NOTAS DE TRABAJO</text>

      <!-- Rows -->
      ${rowsSvg}

      <!-- Bottom Summary Box -->
      <rect x="40" y="${y + 20}" width="1120" height="150" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>
      <text x="60" y="${y + 50}" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#0f172a">RESUMEN DE PRODUCCIÓN DEL DÍA:</text>
      <text x="60" y="${y + 75}" font-family="Arial, sans-serif" font-size="12.5" fill="#334155">• 7 Drops de Cableado Subterráneo (Código B003 a $100.00 c/u) = $700.00</text>
      <text x="60" y="${y + 98}" font-family="Arial, sans-serif" font-size="12.5" fill="#334155">• 2 Driveways con Perforación / Bore (Código D20 a $30.00 c/u) = $60.00 [Job #626746 y #713702]</text>
      <text x="60" y="${y + 120}" font-family="Arial, sans-serif" font-size="12.5" fill="#334155">• Metraje Total Proyectado: 705.23 ft | Cable: RG-6 (5 trabajos) y RG-11 (2 trabajos)</text>
      <text x="60" y="${y + 145}" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="#059669">TOTAL ESTIMADO A COBRAR EN NÓMINA: $760.00</text>

      <rect x="800" y="${y + 35}" width="340" height="115" rx="6" fill="#eff6ff" stroke="#93c5fd" stroke-width="1"/>
      <text x="815" y="${y + 60}" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#1e40af">VERIFICACIÓN Y ESCANEO OCR / IA:</text>
      <text x="815" y="${y + 80}" font-family="Arial, sans-serif" font-size="11" fill="#1e3a8a">Esta imagen está optimizada para ser escaneada</text>
      <text x="815" y="${y + 98}" font-family="Arial, sans-serif" font-size="11" fill="#1e3a8a">desde la app (botón de Cámara / Galería).</text>
      <text x="815" y="${y + 122}" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#059669">✓ 100% Compatible con el Escáner AuraCore</text>
    </svg>
  `;

  const outJpg1 = path.resolve(__dirname, 'PDFs_Prueba_Liquidacion', 'Hoja_Dispatch_Semana_10-22-26.jpg');
  const outJpg2 = path.resolve(__dirname, 'uploads', 'sheets', 'Hoja_Dispatch_Semana_10-22-26.jpg');

  await sharp(Buffer.from(svgContent)).jpeg({ quality: 95 }).toFile(outJpg1);
  await sharp(Buffer.from(svgContent)).jpeg({ quality: 95 }).toFile(outJpg2);

  console.log('✓ Successfully created Dispatch Sheet JPG in:');
  console.log('  1.', outJpg1);
  console.log('  2.', outJpg2);
}

createDispatchSheetImage().catch(console.error);
