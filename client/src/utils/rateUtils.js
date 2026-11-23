/**
 * rateUtils.js
 * Motor Determinista de Tarifas y Códigos de Pago oficiales de Empire Cable / Comcast Xfinity.
 * Replica fielmente el tarifario del "Daily Tech Summary" (Liquidación Oficial):
 * - B003: Drop Bury In Conduit up to 300' Sidewalk and Drive Included ($100.00)
 * - 873: Drop Bury Direct Bury Coax or Fiber ($45.00)
 * - D20: Extra Driveways up to two ($30.00)
 * - B002: Road Bore Conduit ($2.50 / pie lineal)
 * - B005: Asphalt Cut 50ft max ($10.00)
 * - B006: Concrete Cut 50ft max ($11.00)
 * - B003.1 a B003.9: Escala escalonada de metrajes largos EPON / Conduit (301' a 1200')
 */

export const DEFAULT_RATE_CARD = {
  B003: {
    code: 'B003',
    name: "Drop Bury In Conduit up to 300' (Sidewalk and Drive Included)",
    price: 100.00,
    category: 'base',
    unit: 'orden'
  },
  '873': {
    code: '873',
    name: 'Drop Bury Direct Bury Coax or Fiber (Entierro directo sin conduit)',
    price: 45.00,
    category: 'base',
    unit: 'orden'
  },
  D20: {
    code: 'D20',
    name: 'Extra Driveways up to two (Bono cruce adicional de entrada)',
    price: 30.00,
    category: 'extra',
    unit: 'cruce'
  },
  B002: {
    code: 'B002',
    name: 'Road Bore Conduit (Perforación bajo carretera)',
    price: 2.50,
    unit: 'pie',
    category: 'extra'
  },
  B005: {
    code: 'B005',
    name: 'Asphalt Cut 50ft max (Corte en asfalto)',
    price: 10.00,
    category: 'corte',
    unit: 'corte'
  },
  B006: {
    code: 'B006',
    name: 'Concrete Cut 50ft max (Corte en concreto)',
    price: 11.00,
    category: 'corte',
    unit: 'corte'
  },
  tiers: [
    { code: 'B003',   minFt: 0,    maxFt: 300,  price: 100.00, label: "Hasta 300' (Base)", fullDesc: "Drop Bury In Conduit up to 300' (Sidewalk and Drive Included)" },
    { code: 'B003.1', minFt: 301,  maxFt: 400,  price: 125.00, label: "301' – 400' (+$25)", fullDesc: "601-874 EPON FIBER Drop Bury with Conduit (301' – 400')" },
    { code: 'B003.2', minFt: 401,  maxFt: 500,  price: 150.00, label: "401' – 500' (+$25)", fullDesc: "601-875 EPON FIBER Drop Bury with Conduit (401' – 500')" },
    { code: 'B003.3', minFt: 501,  maxFt: 600,  price: 180.00, label: "501' – 600' (+$30)", fullDesc: "601-876 EPON FIBER Drop Bury with Conduit (501' – 600')" },
    { code: 'B003.4', minFt: 601,  maxFt: 700,  price: 220.00, label: "601' – 700' (+$40)", fullDesc: "601-877 EPON FIBER Drop Bury with Conduit (601' – 700')" },
    { code: 'B003.5', minFt: 701,  maxFt: 800,  price: 250.00, label: "701' – 800' (+$30)", fullDesc: "601-878 EPON FIBER Drop Bury with Conduit (701' – 800')" },
    { code: 'B003.6', minFt: 801,  maxFt: 900,  price: 280.00, label: "801' – 900' (+$30)", fullDesc: "601-879 EPON FIBER Drop Bury with Conduit (801' – 900')" },
    { code: 'B003.7', minFt: 901,  maxFt: 1000, price: 310.00, label: "901' – 1000' (+$30)", fullDesc: "601-D10 EPON FIBER Drop Bury with Conduit (901' – 1000')" },
    { code: 'B003.8', minFt: 1001, maxFt: 1100, price: 340.00, label: "1001' – 1100' (+$30)", fullDesc: "601-D15 EPON FIBER Drop Bury with Conduit (1001' – 1100')" },
    { code: 'B003.9', minFt: 1101, maxFt: 1200, price: 400.00, label: "1101' – 1200' (+$60)", fullDesc: "601-D20 EPON FIBER Drop Bury with Conduit (1101' – 1200')" }
  ]
};

/**
 * Valida si un objeto tiene la estructura mínima de un rateCard.
 */
function isValidRateCard(obj) {
  return obj && typeof obj === 'object' && obj.B003 && obj.D20 && Array.isArray(obj.tiers);
}

/**
 * Deserializa de forma segura un rateCard desde string JSON o objeto.
 */
export function normalizeRateCard(input) {
  if (!input) return DEFAULT_RATE_CARD;
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      if (isValidRateCard(parsed)) return parsed;
    } catch (e) {
      return DEFAULT_RATE_CARD;
    }
  }
  if (isValidRateCard(input)) return input;
  return DEFAULT_RATE_CARD;
}

/**
 * Calcula de manera 100% determinista la tarifa de una orden según el tarifario vigente.
 * Desglosa siempre primero el trabajo base (B003 o 873) y a continuación cada código adicional
 * detectado (metraje extra B003.1-B003.9, D20 cruce de driveway, road bore, etc.).
 * Retorna { total, baseAmount, matchedCodes, breakdown }
 */
export function calcOrderRate(order = {}, rateCard = DEFAULT_RATE_CARD) {
  const card = normalizeRateCard(rateCard);
  const footage = parseFloat(order.drop_footage ?? order.footage ?? 0) || 0;
  const bore = String(order.bore_type ?? order.bore ?? '').toUpperCase();
  const isDirectBury = Boolean(order.is_direct_bury || order.isDirectBury);
  const matchedCodes = [];
  const basePrice = parseFloat(card.B003?.price) || 100.00;
  let footageExtra = 0;

  if (isDirectBury) {
    const directPrice = parseFloat(card['873']?.price) || 45.00;
    matchedCodes.push({
      code: '873',
      price: directPrice,
      label: 'Drop Direct Bury (Entierro directo sin conduit)'
    });
  } else {
    // 1. Primera línea: Trabajo Base en Conduit (B003)
    matchedCodes.push({
      code: 'B003',
      price: basePrice,
      label: "Drop Bury en Conduit (Base hasta 300')"
    });

    // 2. Si excede los 300 pies: se desglosa el código de tramo de metraje extra correspondiente
    // Usamos Math.ceil para evitar huecos decimales (ej. 300.5 ft entra en 301' – 400')
    if (footage > 300) {
      const tiers = Array.isArray(card.tiers) && card.tiers.length > 0 ? card.tiers : DEFAULT_RATE_CARD.tiers;
      const effectiveFootage = Math.ceil(footage);
      let matchedTier = null;
      for (const t of tiers) {
        if (effectiveFootage >= t.minFt && effectiveFootage <= t.maxFt) {
          matchedTier = t;
          break;
        }
      }

      if (!matchedTier) {
        if (footage > 1200) {
          const lastTier = tiers[tiers.length - 1];
          const extraHundreds = Math.ceil((footage - 1200) / 100);
          const fullTierPrice = (parseFloat(lastTier?.price) || 400.00) + extraHundreds * 30;
          footageExtra = Math.max(0, fullTierPrice - basePrice);
          matchedCodes.push({
            code: lastTier?.code || 'B003.9',
            price: footageExtra,
            label: `Metraje Extra (>${lastTier?.maxFt || 1200}')`
          });
        }
      } else if (matchedTier.code !== 'B003') {
        const fullTierPrice = parseFloat(matchedTier.price) || basePrice;
        footageExtra = Math.max(0, fullTierPrice - basePrice);
        matchedCodes.push({
          code: matchedTier.code,
          price: footageExtra,
          label: `Metraje Extra (${matchedTier.label || `${matchedTier.minFt}' – ${matchedTier.maxFt}'`})`
        });
      }
    }
  }

  // Extra Driveway Bore (D20)
  if (/DW/i.test(bore)) {
    const dwMatch = bore.match(/DW[:\s]*(\d+)/i);
    const dwQty = dwMatch ? parseInt(dwMatch[1], 10) : 1;
    const dwUnitPrice = parseFloat(card.D20?.price) || 30.00;
    const dwPrice = dwUnitPrice * (dwQty > 0 ? dwQty : 1);
    matchedCodes.push({
      code: 'D20',
      price: dwPrice,
      label: dwQty > 1 ? `Extra Driveways x${dwQty} (Cruces de entrada vehicular)` : 'Extra Driveways (Cruce de entrada vehicular)'
    });
  }

  // Road Bore (B002) - Si se especifica metraje de perforación bajo calle
  const rdFt = parseFloat(order.road_bore_ft) || 0;
  if (rdFt > 0) {
    const rdUnitPrice = parseFloat(card.B002?.price) || 2.50;
    const rdTotal = rdFt * rdUnitPrice;
    matchedCodes.push({
      code: 'B002',
      price: rdTotal,
      label: `Road Bore (${rdFt} ft @ $${rdUnitPrice}/ft)`
    });
  }

  const total = matchedCodes.reduce((sum, c) => sum + c.price, 0);
  const breakdown = matchedCodes.map(c => `${c.code} ($${c.price.toFixed(2)})`).join(' + ');

  return {
    total: parseFloat(total.toFixed(2)),
    baseAmount: isDirectBury ? (parseFloat(card['873']?.price) || 45) : parseFloat((basePrice + footageExtra).toFixed(2)),
    footageExtra: parseFloat(footageExtra.toFixed(2)),
    matchedCodes,
    breakdown
  };
}
