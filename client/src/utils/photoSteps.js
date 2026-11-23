// Utilidades y definición de pasos para toma de evidencias fotográficas

export const PHOTO_STEPS = [
  { id: 'Casa', label: 'Casa / Entrada', short: 'Casa', icon: '🏠' },
  { id: 'Terreno', label: 'Terreno / Ruta', short: 'Terreno', icon: '🌱' },
  { id: 'Profundidad 1', label: 'Comprobante Profundidad 1', short: 'Profundidad 1', icon: '📏' },
  { id: 'Profundidad 2', label: 'Comprobante Profundidad 2', short: 'Profundidad 2', icon: '📏' },
  { id: 'Conector Central', label: 'Conector Central / Tap', short: 'Conector Central', icon: '⚡' },
  { id: 'Pedestal Casa', label: 'Pedestal de la Casa', short: 'Pedestal Casa', icon: '🔌' },
  { id: 'Finalizado', label: 'Terreno Cerrado / Finalizado', short: 'Finalizado', icon: '✨' },
  { id: 'Extra', label: 'Foto Extra', short: 'Extra', icon: '📷' }
];

/**
 * Normaliza y compara si una categoría de foto coincide con el paso dado
 */
export function matchesStep(category, stepId) {
  if (!category || !stepId) return false;
  if (category === stepId) return true;

  const catNorm = category.toLowerCase().trim();
  const stepNorm = stepId.toLowerCase().trim();

  if (stepNorm === 'casa') {
    return catNorm === 'casa' || catNorm.includes('ground block') || catNorm.includes('entrada');
  }
  if (stepNorm === 'terreno') {
    return catNorm === 'terreno' || catNorm.includes('ruta') || catNorm === 'terreno/ruta';
  }
  if (stepNorm === 'profundidad 1') {
    return catNorm === 'profundidad 1' || catNorm === 'profundidad' || catNorm === 'profundidad de zanja';
  }
  if (stepNorm === 'profundidad 2') {
    return catNorm === 'profundidad 2';
  }
  if (stepNorm === 'conector central') {
    return catNorm === 'conector central' || catNorm === 'pedestal' || catNorm === 'pedestal/tap' || catNorm.includes('tap');
  }
  if (stepNorm === 'pedestal casa') {
    return catNorm === 'pedestal casa' || catNorm === 'pedestal de la casa';
  }
  if (stepNorm === 'finalizado') {
    return catNorm === 'finalizado' || catNorm === 'trabajo terminado' || catNorm.includes('cerrado');
  }
  if (stepNorm === 'extra') {
    return catNorm === 'extra' || catNorm === 'general' || catNorm === 'general / extra';
  }

  return false;
}

/**
 * Comprueba si ya existe al menos una foto tomada para este paso
 */
export function isStepCompleted(stepId, photos = []) {
  if (!photos || photos.length === 0) return false;
  return photos.some((p) => matchesStep(p.category, stepId));
}

/**
 * Encuentra el primer paso en la secuencia que aún no tiene foto tomada.
 * Si todos los pasos requeridos ya tienen foto, devuelve 'Finalizado' o 'Extra'.
 */
export function getNextPendingStep(photos = [], currentCategory = null) {
  const requiredSteps = PHOTO_STEPS.filter((s) => s.id !== 'Extra');

  for (const step of requiredSteps) {
    if (!isStepCompleted(step.id, photos)) {
      return step.id;
    }
  }

  return currentCategory === 'Extra' ? 'Extra' : 'Finalizado';
}
