/**
 * Utilidades para el manejo de ajustes de precio de órdenes (soporte de ajustes múltiples e historial).
 */

export function parseAdjustmentItems(order) {
  if (!order) return [];
  const raw = order.adjustment_reason;
  if (raw && typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}
  }
  const adj = Number(order.manual_adjustment) || 0;
  if (adj !== 0) {
    return [{
      id: 'legacy-1',
      type: adj > 0 ? 'add' : 'sub',
      amount: Math.abs(adj),
      reason: (raw && typeof raw === 'string' && !raw.trim().startsWith('[')) ? raw.trim() : 'Ajuste manual',
      date: order.work_date || new Date().toISOString()
    }];
  }
  return [];
}

export function formatAdjustmentReason(reason) {
  if (!reason || typeof reason !== 'string') return '';
  const trimmed = reason.trim();
  if (trimmed.startsWith('[')) {
    try {
      const items = JSON.parse(trimmed);
      if (Array.isArray(items) && items.length > 0) {
        return items
          .map((i) => `${i.type === 'add' ? '+' : '-'}$${i.amount}${i.reason ? ` (${i.reason})` : ''}`)
          .join(', ');
      }
    } catch {}
  }
  return reason;
}

export function calculateNetAdjustment(items = []) {
  return items.reduce((sum, item) => {
    const amt = parseFloat(item.amount) || 0;
    return sum + (item.type === 'sub' ? -Math.abs(amt) : Math.abs(amt));
  }, 0);
}
