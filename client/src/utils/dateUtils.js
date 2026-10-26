// Returns local date in YYYY-MM-DD format using the device's local timezone
// Never uses UTC to avoid jumping to tomorrow in late evening hours
export function getLocalDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Normalizes date string to YYYY-MM-DD (handling MM-DD-YYYY or YYYY-MM-DD)
export function normalizeDateStr(str) {
  if (!str) return '';
  const clean = String(str).trim().split('T')[0];
  if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) return clean; // YYYY-MM-DD
      if (parts[2].length === 4) {
        // MM-DD-YYYY -> YYYY-MM-DD
        return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
      }
    }
  }
  return clean;
}

// Formats a date string (YYYY-MM-DD) into friendly Spanish display e.g. "Lun, 26 de Oct 2026"
// Parses components locally to prevent any timezone shift
export function formatDateFriendly(dateStr) {
  if (!dateStr) return '';
  const norm = normalizeDateStr(dateStr);
  const parts = norm.split('-');
  if (parts.length !== 3) return dateStr;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  // Noon avoids daylight saving time edges
  const date = new Date(y, m - 1, d, 12, 0, 0);
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${days[date.getDay()]}, ${d} de ${months[date.getMonth()]} ${y}`;
}
