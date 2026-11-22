import * as XLSX from 'xlsx';
import { getOrders, getWeeklySummary, getSettings, getExpenses } from './localDb';
import { formatAdjustmentReason } from '../utils/adjustmentUtils';
import { normalizeRateCard } from '../utils/rateUtils';

export async function exportOrdersToExcel(filename = null) {
  let orders = [];
  let summary = null;
  let settings = {};
  let expenses = [];

  try {
    const [ordRes, sumRes, setRes, expRes] = await Promise.all([
      fetch('/api/orders'),
      fetch('/api/weekly-summary'),
      fetch('/api/settings'),
      fetch('/api/expenses')
    ]);
    if (ordRes.ok) orders = await ordRes.json();
    if (sumRes.ok) summary = await sumRes.json();
    if (setRes.ok) settings = await setRes.json();
    if (expRes.ok) expenses = await expRes.json();
  } catch (err) {
    console.warn('Backend fetch for Excel export failed, falling back to localDb:', err);
  }

  // Offline fallback if server not reachable
  if (!orders || orders.length === 0) {
    orders = await getOrders();
  }
  if (!summary || !summary.summary) {
    summary = await getWeeklySummary();
  }
  if (!settings || Object.keys(settings).length === 0) {
    settings = await getSettings();
  }
  if (!expenses || expenses.length === 0) {
    expenses = await getExpenses();
  }

  // 1. Prepare Orders Sheet Data
  const rows = orders.map((o) => {
    return {
      'Job ID': o.job_id,
      'Fecha': o.work_date,
      'Técnico': o.tech_id || settings.tech_default || 'Javier (P0G1)',
      'Prioritario': o.is_priority ? 'SÍ' : 'NO',
      'Dirección': o.address,
      'Ciudad': o.city || '',
      'Código Postal': o.zip_code || '',
      'Teléfono': o.phone || '',
      'Call First': o.call_first ? 'SÍ' : 'NO',
      'Metraje (ft)': Number(o.drop_footage) || 0,
      'Tipo de Cable': o.cable_type || 'RG-6',
      'Perforación (Bore)': o.bore_type || 'N',
      'Road Bore (ft)': Number(o.road_bore_ft) || 0,
      'Línea Temporal (Temp)': o.is_temp ? 'SÍ' : 'NO',
      'Acceso Predio': o.premise_access || 'N',
      'Obstáculos': o.obstacles || 'N',
      'Aviso Vecino': o.neighbor_notice || 'N',
      'Tarifa Calculada ($)': Number((Number(o.rate_calculated) || 0).toFixed(2)),
      'Ajuste Supervisor ($)': Number((Number(o.manual_adjustment) || 0).toFixed(2)),
      'Motivo Ajuste': formatAdjustmentReason(o.adjustment_reason) || '',
      'Estado del Trabajo': o.status || 'Pendiente',
      'Motivo Cancelación': o.cancel_reason || '',
      'Estado de Cobro': o.payment_status || 'Pendiente',
      'Reportado WhatsApp': o.whatsapp_shared ? 'SÍ' : 'NO',
      'Notas / Despacho': o.raw_notes || ''
    };
  });

  // 2. Prepare Weekly Closures Sheet Data
  const weeksList = Array.isArray(summary?.weeks) ? summary.weeks : [];
  const weekRows = weeksList.map((w) => ({
    'Semana': w.displayLabel || w.key,
    'Fecha Inicio': w.startDate,
    'Fecha Cierre': w.endDate,
    'Órdenes Totales': w.totalJobs || 0,
    'Completados': w.completedCount || 0,
    'Pendientes': w.pendingJobsCount || 0,
    'No Realizados': w.cancelledCount || 0,
    'Metraje Instalado (ft)': Math.round(w.totalFootage || 0),
    'Total Producido ($)': Number((Number(w.totalEarnings) || 0).toFixed(2)),
    'Estado de Cobro': w.isPaid ? 'COBRADO' : 'PENDIENTE',
    'Comprobante Adjunto': (w.receipt_photo || w.receipt_filename) ? 'SÍ' : 'NO'
  }));

  // 3. Prepare Monthly Expenses Sheet Data
  const totalExpensesAll = (expenses || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const expenseRows = (expenses || []).map((e) => ({
    'Fecha Gasto': e.expense_date || '',
    'Mes Contable': e.month_key || (e.expense_date ? e.expense_date.slice(0, 7) : ''),
    'Categoría': e.category || 'Combustible',
    'Descripción': e.description || '',
    'Monto ($ USD)': Number((Number(e.amount) || 0).toFixed(2)),
    'Ticket Adjunto': (e.receipt_photo || e.receipt_data) ? 'SÍ' : 'NO'
  }));

  // 4. Prepare Summary Sheet Data
  const kpis = summary?.summary || {};
  const rateCard = normalizeRateCard(settings?.rate_card);
  const totalPaid = Number(kpis.totalPaid) || 0;
  const netAfterExpenses = totalPaid - totalExpensesAll;
  const safeBasePrice = Number(rateCard?.B003?.price) || Number(settings.base_rate) || 100;
  const safeDwBonus = Number(rateCard?.D20?.price) || Number(settings.bore_dw_bonus) || 30;
  const safeRoadPrice = Number(rateCard?.B002?.price) || 2.5;

  const summaryRows = [
    { 'Métrica Contable': 'Técnico Responsable', 'Valor': settings.tech_default || 'Javier (P0G1)' },
    { 'Métrica Contable': 'Fecha de Exportación', 'Valor': new Date().toLocaleDateString() },
    { 'Métrica Contable': 'Tarifa Base Conduit (B003)', 'Valor': `$${safeBasePrice.toFixed(2)}` },
    { 'Métrica Contable': 'Bono Driveway Bore (D20)', 'Valor': `+$${safeDwBonus.toFixed(2)}` },
    { 'Métrica Contable': 'Tarifa Road Bore (B002)', 'Valor': `$${safeRoadPrice.toFixed(2)} / ft` },
    { 'Métrica Contable': 'Metrajes Especiales (>300 ft)', 'Valor': 'Escalones Oficiales B003.1 – B003.9' },
    { 'Métrica Contable': 'Trabajos Totales Registrados', 'Valor': kpis.totalOrdersCount || 0 },
    { 'Métrica Contable': 'Trabajos Completados', 'Valor': kpis.totalCompletedCount || 0 },
    { 'Métrica Contable': 'Metraje Total Instalado', 'Valor': `${(Number(kpis.totalFeetAll) || 0).toLocaleString()} ft` },
    { 'Métrica Contable': 'Producción Total ($)', 'Valor': `$${(Number(kpis.totalAllEarnings) || 0).toFixed(2)}` },
    { 'Métrica Contable': 'Total Cobrado ($)', 'Valor': `$${totalPaid.toFixed(2)}` },
    { 'Métrica Contable': 'Total Pendiente por Cobrar ($)', 'Valor': `$${(Number(kpis.totalPending) || 0).toFixed(2)}` },
    { 'Métrica Contable': 'Total Gastos Registrados ($)', 'Valor': `-$${totalExpensesAll.toFixed(2)}` },
    { 'Métrica Contable': 'Ganancia Neta Real (Cobrado - Gastos)', 'Valor': `$${netAfterExpenses.toFixed(2)}` }
  ];

  // 5. Create Workbook
  const wb = XLSX.utils.book_new();

  // Create Works Sheet
  const wsOrders = XLSX.utils.json_to_sheet(rows);
  wsOrders['!cols'] = [
    { wch: 10 }, // Job ID
    { wch: 12 }, // Fecha
    { wch: 16 }, // Técnico
    { wch: 28 }, // Dirección
    { wch: 14 }, // Ciudad
    { wch: 12 }, // Código Postal
    { wch: 14 }, // Teléfono
    { wch: 12 }, // Metraje
    { wch: 12 }, // Tipo Cable
    { wch: 16 }, // Bore
    { wch: 10 }, // Temp
    { wch: 14 }, // Obstáculos
    { wch: 16 }, // Tarifa
    { wch: 16 }, // Ajuste
    { wch: 26 }, // Motivo Ajuste
    { wch: 16 }, // Estado Trabajo
    { wch: 22 }, // Motivo Cancelación
    { wch: 16 }, // Estado Cobro
    { wch: 16 }, // Reportado WhatsApp
    { wch: 30 }  // Notas
  ];

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 36 }, { wch: 24 }];

  XLSX.utils.book_append_sheet(wb, wsOrders, 'Trabajos');
  if (weekRows.length > 0) {
    const wsWeeks = XLSX.utils.json_to_sheet(weekRows);
    wsWeeks['!cols'] = [
      { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 15 }, { wch: 14 },
      { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(wb, wsWeeks, 'Cierres Semanales');
  }
  if (expenseRows.length > 0) {
    const wsExpenses = XLSX.utils.json_to_sheet(expenseRows);
    wsExpenses['!cols'] = [
      { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 28 }, { wch: 16 }, { wch: 16 }
    ];
    XLSX.utils.book_append_sheet(wb, wsExpenses, 'Gastos Mensuales');
  }
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen Contable');

  // 6. Trigger download
  const dateStr = new Date().toISOString().split('T')[0];
  const finalName = filename || `Contabilidad_Xfinity_${dateStr}.xlsx`;
  XLSX.writeFile(wb, finalName);

  return { success: true, count: rows.length };
}
