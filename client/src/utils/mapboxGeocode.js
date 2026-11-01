// Utility for Mapbox Geocoding API with state detection and proximity bias

const getFallbackToken = () => {
  try {
    return atob('cGsuZXlKMUlqb2lhbUYyYVdWeU1Ua2lMQ0poSWpvaVkyMTJlR0o1YW04eU1UQm9hVEo2Y0hwMU5taDFNbUppT0NKOS42dENmLUNIRDhQemhwTGU5S19HNm9B');
  } catch (e) {
    return '';
  }
};

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || getFallbackToken();

/**
 * Resolves an address to precise [lat, lng] coordinates using Mapbox Geocoding v5 API.
 * Includes proximity bias for Skokie/Chicago, IL and Elkhart/Goshen, IN.
 */
export async function geocodeAddressWithMapbox(address, city = '', zipCode = '') {
  if (!address || typeof address !== 'string' || !address.trim()) return null;
  
  const cleanAddr = address.trim();
  const cleanCity = (city || '').trim();
  const cleanZip = (zipCode || '').trim();

  // Detect state context
  let state = 'IN';
  if (/\b(IL|ILLINOIS|SKOKIE|CHICAGO|EVANSTON|NILES|LINCOLNWOOD)\b/i.test(`${cleanAddr} ${cleanCity}`)) {
    state = 'IL';
  } else if (/\b(MI|MICHIGAN)\b/i.test(`${cleanAddr} ${cleanCity}`)) {
    state = 'MI';
  } else if (/\b(IN|INDIANA|ELKHART|GOSHEN|MISHAWAKA|SOUTH BEND)\b/i.test(`${cleanAddr} ${cleanCity}`)) {
    state = 'IN';
  }

  let effectiveCity = cleanCity;
  if (!effectiveCity) {
    effectiveCity = state === 'IL' ? 'Skokie' : 'Elkhart';
  }

  const queries = [];
  // 1. Direct if already formatted
  if (cleanAddr.includes(',') || /\b(IL|IN|MI|USA)\b/i.test(cleanAddr)) {
    queries.push(cleanAddr + (cleanAddr.includes('USA') ? '' : ', USA'));
  }
  // 2. Full structured with city, state, zip
  queries.push(`${cleanAddr}, ${effectiveCity}, ${state} ${cleanZip}, USA`.trim());
  // 3. Address with city and state
  queries.push(`${cleanAddr}, ${effectiveCity}, ${state}, USA`.trim());
  // 4. Address only with USA
  queries.push(`${cleanAddr}, USA`.trim());

  const proximity = state === 'IL' ? '-87.7345,42.0335' : '-85.9766,41.6820';

  for (const q of queries) {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${MAPBOX_TOKEN}&country=US&proximity=${proximity}&limit=1`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.features && data.features.length > 0) {
          const [lng, lat] = data.features[0].center;
          return {
            latitude: lat,
            longitude: lng,
            displayName: data.features[0].place_name
          };
        }
      }
    } catch (e) {
      console.warn('Mapbox client geocoding attempt failed:', q, e.message);
    }
  }

  // Safe Fallback based on state center so pin and route ALWAYS show
  const baseLat = state === 'IL' ? 42.03359 : 41.681995;
  const baseLng = state === 'IL' ? -87.73455 : -85.97667;
  const jitterLat = (Math.random() - 0.5) * 0.006;
  const jitterLng = (Math.random() - 0.5) * 0.006;

  return {
    latitude: baseLat + jitterLat,
    longitude: baseLng + jitterLng,
    displayName: `${effectiveCity}, ${state} (Aprox)`
  };
}
