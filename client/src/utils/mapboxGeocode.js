const US_STATES = new Set([
  'ALABAMA','ALASKA','ARIZONA','ARKANSAS','CALIFORNIA','COLORADO','CONNECTICUT','DELAWARE','FLORIDA','GEORGIA',
  'HAWAII','IDAHO','ILLINOIS','INDIANA','IOWA','KANSAS','KENTUCKY','LOUISIANA','MAINE','MARYLAND',
  'MASSACHUSETTS','MICHIGAN','MINNESOTA','MISSISSIPPI','MISSOURI','MONTANA','NEBRASKA','NEVADA','NEW HAMPSHIRE',
  'NEW JERSEY','NEW MEXICO','NEW YORK','NORTH CAROLINA','NORTH DAKOTA','OHIO','OKLAHOMA','OREGON','PENNSYLVANIA',
  'RHODE ISLAND','SOUTH CAROLINA','SOUTH DAKOTA','TENNESSEE','TEXAS','UTAH','VERMONT','VIRGINIA','WASHINGTON',
  'WEST VIRGINIA','WISCONSIN','WYOMING',
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
]);

function isUsState(val) {
  if (!val) return false;
  const clean = val.trim().toUpperCase().replace(/\s+\d{5}.*$/, '');
  return US_STATES.has(clean);
}

// Utility for Mapbox Geocoding API with state detection and proximity bias

const getFallbackToken = () => {
  try {
    return atob('cGsuZXlKMUlqb2lhbUYyYVdWeU1Ua2lMQ0poSWpvaVkyMTJlR0o1YW04eU1UQm9hVEo2Y0hwMU5taDFNbUppT0NKOS42dENmLUNIRDhQemhwTGU5S19HNm9B');
  } catch (e) {
    return '';
  }
};

export const MAPBOX_TOKEN = import.meta?.env?.VITE_MAPBOX_TOKEN || getFallbackToken();

/**
 * Detects the US state abbreviation (IL, IN, MI) from address, city, and zip code.
 */
export function detectOrderState(address = '', city = '', zipCode = '') {
  const cleanAddr = String(address || '').trim();
  const cleanCity = String(city || '').trim();
  const cleanZip = String(zipCode || '').trim();
  const combined = `${cleanAddr} ${cleanCity}`;

  // 1. Check ZIP code prefix first (60-62 = IL, 46-47 = IN, 48-49 = MI)
  if (/^6[012]\d{3}/.test(cleanZip)) return 'IL';
  if (/^4[67]\d{3}/.test(cleanZip)) return 'IN';
  if (/^4[89]\d{3}/.test(cleanZip)) return 'MI';

  // 2. Check city / state keywords
  if (/\b(IL|ILLINOIS|SKOKIE|CHICAGO|EVANSTON|NILES|LINCOLNWOOD|MORTON GROVE|DES PLAINES|PARK RIDGE|GLENVIEW|WILMETTE|WINNETKA|NORTHBROOK|OAK PARK|CICERO|BERWYN|SCHAUMBURG|ARLINGTON HEIGHTS|MOUNT PROSPECT|PALATINE|WAUKEGAN|ELGIN|AURORA|JOLIET|NAPERVILLE|WHEATON)\b/i.test(combined)) {
    return 'IL';
  }
  if (/\b(MI|MICHIGAN|EDWARDSBURG|STURGIS|THREE RIVERS|BENTON HARBOR|ST JOSEPH|KALAMAZOO|CONSTANTINE|WHITE PIGEON|CASSOPOLIS|DOWAGIAC|BUCHANAN)\b/i.test(combined)) {
    return 'MI';
  }
  if (/\b(IN|INDIANA|ELKHART|GOSHEN|MISHAWAKA|SOUTH BEND|GRANGER|OSCEOLA|BRISTOL|MIDDLEBURY|WAKARUSA|NAPPANEE|SYRACUSE|WARSAW|PLYMOUTH|LAPORTE|MICHIGAN CITY|BREMEN|LIGONIER|SHIPSHEWANA|TOPEKA|NEW PARIS|MILFORD)\b/i.test(combined)) {
    return 'IN';
  }

  // Default to IL when city is empty (default Skokie area) or IN otherwise
  return cleanCity ? 'IN' : 'IL';
}

/**
 * Builds an external Turn-by-Turn GPS navigation URL (Google Maps or Waze)
 * with the dynamically detected state (IL, IN, MI) instead of hardcoded IN.
 */
export function buildNavigationUrl(order, appType = 'google') {
  if (!order) return '#';
  const state = detectOrderState(order.address, order.city, order.zip_code);
  const defaultCity = state === 'IL' ? 'Skokie' : 'Elkhart';
  const city = (order.city || defaultCity).trim();
  const zip = (order.zip_code || '').trim();
  const fullAddr = `${order.address || ''}, ${city}, ${state}${zip ? ' ' + zip : ''}`.trim();
  const enc = encodeURIComponent(fullAddr);

  if (appType === 'waze') {
    return `https://waze.com/ul?q=${enc}&navigate=yes`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${enc}`;
}

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
  const state = detectOrderState(cleanAddr, cleanCity, cleanZip);

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
  let cityLevelFallback = null;

  for (const q of queries) {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${MAPBOX_TOKEN}&country=US&proximity=${proximity}&limit=1`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.features && data.features.length > 0) {
          const feat = data.features[0];
          const [lng, lat] = feat.center;
          const placeTypes = Array.isArray(feat.place_type) ? feat.place_type : [];
          const isExactStreet = placeTypes.includes('address') || placeTypes.includes('poi') || Boolean(feat.address);

          if (isExactStreet) {
            return {
              latitude: lat,
              longitude: lng,
              displayName: feat.place_name,
              isApproximate: false
            };
          } else if (!cityLevelFallback) {
            cityLevelFallback = {
              latitude: lat,
              longitude: lng,
              displayName: `${feat.place_name} (Aprox)`,
              isApproximate: true
            };
          }
        }
      }
    } catch (e) {
      console.warn('Mapbox client geocoding attempt failed:', q, e.message);
    }
  }

  // Open Geocoder fallback (Photon / OSM) - 100% free, zero token required
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(`${cleanAddr} ${effectiveCity} ${state}`)}&limit=1`;
    const pRes = await fetch(photonUrl);
    if (pRes.ok) {
      const pData = await pRes.json();
      if (pData.features && pData.features.length > 0) {
        const feat = pData.features[0];
        const [lng, lat] = feat.geometry.coordinates;
        const hasStreet = Boolean(feat.properties?.street || feat.properties?.housenumber);
        return {
          latitude: lat,
          longitude: lng,
          displayName: [feat.properties?.housenumber, feat.properties?.street, feat.properties?.city, feat.properties?.state].filter(Boolean).join(', ') || feat.properties?.name || `${effectiveCity}, ${state}`,
          isApproximate: !hasStreet
        };
      }
    }
  } catch (e) {
    console.warn('Photon open geocoding fallback note:', e.message);
  }

  if (cityLevelFallback) {
    return cityLevelFallback;
  }

  // Safe Fallback based on state center so pin and route ALWAYS show
  const baseLat = state === 'IL' ? 42.03359 : 41.681995;
  const baseLng = state === 'IL' ? -87.73455 : -85.97667;
  const jitterLat = (Math.random() - 0.5) * 0.006;
  const jitterLng = (Math.random() - 0.5) * 0.006;

  return {
    latitude: baseLat + jitterLat,
    longitude: baseLng + jitterLng,
    displayName: `${effectiveCity}, ${state} (Aprox)`,
    isApproximate: true
  };
}

/**
 * Searches real-time address suggestions using Mapbox Places API
 * Auto-detects street address, city, state, zip code and precise GPS coordinates.
 */
export async function searchAddressSuggestions(query) {
  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    return [];
  }

  const cleanQ = query.trim();

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleanQ)}.json?access_token=${MAPBOX_TOKEN}&country=US&types=address&autocomplete=true&limit=5`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.features && Array.isArray(data.features) && data.features.length > 0) {
        return data.features.map(f => {
          let city = '';
          let state = '';
          let zipCode = '';

          if (Array.isArray(f.context)) {
            for (const item of f.context) {
              if (item.id.startsWith('place') || item.id.startsWith('locality')) {
                const cand = item.text ? item.text.trim() : '';
                if (!isUsState(cand)) {
                  city = cand;
                }
              } else if (item.id.startsWith('region')) {
                state = item.short_code ? item.short_code.replace('US-', '') : item.text;
              } else if (item.id.startsWith('postcode')) {
                zipCode = item.text;
              }
            }
          }

          if (!city && f.place_name) {
            const parts = f.place_name.split(',').map(p => p.trim());
            for (let i = 1; i < parts.length - 1; i++) {
              const cand = parts[i].replace(/\s+\d{5}.*$/, '').trim();
              if (cand && !isUsState(cand) && cand.toLowerCase() !== 'united states') {
                city = cand;
                break;
              }
            }
          }

          const street = f.address ? `${f.address} ${f.text}` : (f.text || (f.place_name ? f.place_name.split(',')[0] : cleanQ));

          return {
            id: f.id,
            streetAddress: street,
            fullAddress: f.place_name || street,
            city: city ? city.toUpperCase() : '',
            state: state || '',
            zipCode: zipCode || '',
            latitude: f.center ? f.center[1] : null,
            longitude: f.center ? f.center[0] : null
          };
        });
      }
    }
  } catch (err) {
    console.warn('Mapbox address autocomplete search failed:', err.message);
  }

  // Open Photon Autocomplete Fallback (100% token-free)
  try {
    const pUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQ)}&limit=5`;
    const pRes = await fetch(pUrl);
    if (pRes.ok) {
      const pData = await pRes.json();
      if (pData.features && Array.isArray(pData.features) && pData.features.length > 0) {
        return pData.features.map((f, idx) => {
          const p = f.properties || {};
          const street = [p.housenumber, p.street].filter(Boolean).join(' ') || p.name || cleanQ;
          const fullAddress = [street, p.city, p.state, p.postcode].filter(Boolean).join(', ');
          return {
            id: `osm-${p.osm_id || idx}`,
            streetAddress: street,
            fullAddress: fullAddress || street,
            city: (p.city || '').toUpperCase(),
            state: p.state || '',
            zipCode: p.postcode || '',
            latitude: f.geometry?.coordinates ? f.geometry.coordinates[1] : null,
            longitude: f.geometry?.coordinates ? f.geometry.coordinates[0] : null
          };
        });
      }
    }
  } catch (e) {
    console.warn('Photon autocomplete fallback note:', e.message);
  }

  return [];
}
