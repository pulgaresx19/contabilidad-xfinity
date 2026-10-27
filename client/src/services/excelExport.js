import * as XLSX from 'xlsx';
import { getOrders, getWeeklySummary, getSettings } from './localDb';

export async function exportOrdersToExcel(filename = null) {
  const orders = await getOrders();
  const summary = await getWeeklySummary();
  const settings = await getSettings();

  // 1. Prepare Orders Sheet Data
  const rows = orders.map((o) => {
    return {
      'Job ID': o.job_id,
      'Fecha': o.work_date,
      'Técnico': o.tech_id || settings.tech_default || 'Javier (P0G1)',
      'Dirección': o.address,
      'Ciudad': o.city || '',
      'Teléfono': o.phone || '',
      'Metraje (ft)': o.drop_footage || 0,
      'Tipo de Cable': o.cable_type || 'RG-6',
      'Perforación (Bore)': o.bore_type || 'N',
      'Línea Temporal (Temp)': o.is_temp ? 'SÍ' : 'NO',
      'Obstáculos': o.obstacles || 'N',
      'Tarifa Calculada ($)': (o.rate_calculated || 0).toFixed(2),
      'Ajuste Supervisor ($)': (o.manual_adjustment || 0).toFixed(2),
      'Motivo Ajuste': o.adjustment_reason || '',
      'Estado del Trabajo': o.status || 'Pendiente',
      'Motivo Cancelación': o.cancel_reason || '',
      'Estado de Cobro': o.payment_status || 'Pendiente',
      'Reportado WhatsApp': o.whatsapp_shared ? 'SÍ' : 'NO',
      'Notas / Despacho': o.raw_notes || ''
    };
  });

  // 2. Prepare Summary Sheet Data
  const kpis = summary.summary;
  const summaryRows = [
    { 'Métrica Contable': 'Técnico Responsable', 'Valor': settings.tech_default || 'Javier (P0G1)' },
    { 'Métrica Contable': 'Fecha de Exportación', 'Valor': new Date().toLocaleDateString() },
    { 'Métrica Contable': 'Tarifa Base Configurada', 'Valor': `$${settings.base_rate || '100.00'}` },
    { 'Métrica Contable': 'Bono Driveway Bore (DW)', 'Valor': `+$${settings.bore_dw_bonus || '30.00'}` },
    { 'Métrica Contable': 'Trabajos Totales Registrados', 'Valor': kpis.totalOrdersCount },
    { 'Métrica Contable': 'Trabajos Completados', 'Valor': kpis.totalCompletedCount },
    { 'Métrica Contable': 'Metraje Total Instalado', 'Valor': `${kpis.totalFeetAll.toLocaleString()} ft` },
    { 'Métrica Contable': 'Producción Total ($)', 'Valor': `$${(kpis.totalAllEarnings || 0).toFixed(2)}` },
    { 'Métrica Contable': 'Total Cobrado ($)', 'Valor': `$${(kpis.totalPaid || 0).toFixed(2)}` },
    { 'Métrica Contable': 'Total Pendiente por Cobrar ($)', 'Valor': `$${(kpis.totalPending || 0).toFixed(2)}` }
  ];

  // 3. Create Workbook
  const wb = XLSX.utils.book_new();

  // Create Works Sheet
  const wsOrders = XLSX.utils.json_to_sheet(rows);
  // Auto-fit column widths
  const colWidths = [
    { wch: 10 }, // Job ID
    { wch: 12 }, // Fecha
    { wch: 16 }, // Técnico
    { wch: 28 }, // Dirección
    { wch: 14 }, // Ciudad
    { wch: 14 }, // Teléfono
    { wch: 12 }, // Metraje
    { wch: 12 }, // Tipo Cable
    { wch: 16 }, // Bore
    { wch: 10 }, // Temp
    { wch: 14 }, // Obstáculos
    { wch: 16 }, // Tarifa
    { wch: 16 }, // Ajuste
    { wch: 20 }, // Motivo Ajuste
    { wch: 16 }, // Estado Trabajo
    { wch: 20 }, // Motivo Cancelación
    { wch: 16 }, // Estado Cobro
    { wch: 16 }, // Reportado WhatsApp
    { wch: 30 }  // Notas
  ];
  wsOrders['!cols'] = colWidths;

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 30 }, { wch: 24 }];

  XLSX.utils.book_append_sheet(wb, wsOrders, 'Trabajos');
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen Contable');

  // 4. Trigger download
  const dateStr = new Date().toISOString().split('T')[0];
  const finalName = filename || `Contabilidad_Xfinity_${dateStr}.xlsx`;
  XLSX.writeFile(wb, finalName);

  return { success: true, count: rows.length };
}
