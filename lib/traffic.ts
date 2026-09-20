export type Point = [number, number]; // longitude, latitude

export type Place = { label: string; point: Point; county?: string };
export type CountSample = {
  road: string;
  point: Point;
  year: number;
  countDate: string;
  countPointId: number;
  distanceKm: number;
  hours: { hour: number; vehicles: number }[];
};
export type Greggs = { id: string; name: string; address: string; point: Point; distanceMetres: number; routeKm?: number };
export type Stop = Pick<Greggs, 'id' | 'name' | 'address' | 'point'>;
export type LiveSample = { currentSpeed: number; freeFlowSpeed: number; confidence: number; closure: boolean; point: Point };
export type Plan = {
  mode: 'journey' | 'area';
  from: Place;
  to?: Place;
  stop?: Stop;
  distanceKm?: number;
  baseMinutes?: number;
  geometry: Point[];
  roads: string[];
  samples: CountSample[];
  hourly: { hour: number; index: number; vehicles?: number }[];
  windows: { start: number; end: number; index: number; vehicles?: number }[];
  daySupported: boolean;
  requestedDate: string;
  live: LiveSample[];
  liveStatus: 'available' | 'not-connected' | 'unavailable';
  greggs: Greggs[];
  greggsStatus: 'available' | 'unavailable' | 'not-requested';
  notes: string[];
};

const cache = new Map<string, { value: unknown; expires: number }>();
export async function getJson<T>(url: string, ttlMs = 0, timeoutMs = 14000): Promise<T> {
  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'QuietRoad/1.0 (personal UK travel planner)' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error('Source returned ' + response.status);
  const data = (await response.json()) as T;
  if (ttlMs) {
    if (cache.size > 250) cache.clear();
    cache.set(url, { value: data, expires: Date.now() + ttlMs });
  }
  return data;
}

const UK = (p: Point) => p[0] >= -11 && p[0] <= 3 && p[1] >= 49 && p[1] <= 61;
const postcode = /^(GIR\s?0AA|(?:[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}))$/i;
const roadCode = /\b([AMB]\d{1,4}(?:\(M\))?)(?!\w)/i;
const km = (a: Point, b: Point) => {
  const r = Math.PI / 180;
  const x = (b[0] - a[0]) * Math.cos((a[1] + b[1]) * r / 2) * 111.2;
  const y = (b[1] - a[1]) * 111.2;
  return Math.hypot(x, y);
};

export async function findPlace(input: string): Promise<Place> {
  const q = input.trim();
  if (!q || q.length > 120) throw new Error('Enter a road, postcode or place.');
  const explicitRoad = q.match(/^([AMB]\d{1,4}(?:\(M\))?)(?:\s+(?:near|at|in)\s+(.+)|\s*,\s*(.+))?$/i);
  if (explicitRoad) {
    const road = explicitRoad[1].toUpperCase();
    const vicinity = (explicitRoad[2] || explicitRoad[3] || 'Blyth, Northumberland').trim();
    const place = await findPlace(vicinity);
    const authority = await nearbyAuthority(place.point);
    let points = await countPointsForRoad(road, authority);
    if (!points.length) points = await countPointsForRoad(road);
    const matches = points.map(p => ({ p, d: km(place.point, [Number(p.longitude), Number(p.latitude)]) })).sort((a, b) => a.d - b.d);
    if (matches[0] && matches[0].d < 30) {
      const p = matches[0].p;
      return { label: road + ' near ' + place.label, point: [Number(p.longitude), Number(p.latitude)], county: place.county };
    }
    return { label: road + ' near ' + place.label, point: place.point, county: place.county };
  }
  if (postcode.test(q)) {
    const clean = q.replace(/\s/g, '').toUpperCase();
    const result = await getJson<{ status: number; result?: { latitude: number; longitude: number; postcode: string; admin_district: string } }>(
      'https://api.postcodes.io/postcodes/' + encodeURIComponent(clean), 86400000
    );
    if (result.result) return { label: result.result.postcode + ', ' + result.result.admin_district, point: [result.result.longitude, result.result.latitude], county: result.result.admin_district };
  }
  const hint = roadCode.test(q) && !q.includes(',') ? '&lat=55.12&lon=-1.54' : '';
  const data = await getJson<{ features: { properties: Record<string, string>; geometry: { coordinates: number[] } }[] }>(
    'https://photon.komoot.io/api/?q=' + encodeURIComponent(q) + '&limit=10&lang=en' + hint,
    86400000
  );
  const matches = data.features.filter(f => f.properties.countrycode?.toUpperCase() === 'GB' && UK(f.geometry.coordinates as Point));
  if (!matches.length) throw new Error('Could not find that UK location. Try adding a town or full postcode.');
  const wantedRoad = q.match(roadCode)?.[1]?.toUpperCase();
  const ordered = wantedRoad ? [...matches].sort((a, b) => Number((b.properties.name || '').toUpperCase().includes(wantedRoad)) - Number((a.properties.name || '').toUpperCase().includes(wantedRoad))) : matches;
  const feature = ordered[0];
  const p = feature.properties;
  const label = [p.name, p.city || p.county || p.state].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
  return { label, point: feature.geometry.coordinates as Point, county: p.county || p.city };
}

type RouteResponse = { code: string; routes?: { distance: number; duration: number; geometry: { coordinates: Point[] }; legs: { steps: { ref?: string; name?: string; distance: number }[] }[] }[] };
export async function findRoute(a: Point, b: Point, via?: Point) {
  const pair = (p: Point) => p[0].toFixed(6) + ',' + p[1].toFixed(6);
  const data = await getJson<RouteResponse>('https://router.project-osrm.org/route/v1/driving/' + [a, ...(via ? [via] : []), b].map(pair).join(';') + '?overview=full&geometries=geojson&steps=true', 3600000, 18000);
  if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error('No drivable route was found between those places.');
  const route = data.routes[0];
  const sums = new Map<string, number>();
  for (const step of route.legs.flatMap(leg => leg.steps)) {
    const road = (step.ref || step.name || '').match(roadCode)?.[1]?.toUpperCase();
    if (road) sums.set(road, (sums.get(road) || 0) + step.distance);
  }
  const roads = [...sums.entries()].sort((a, b) => b[1] - a[1]).map(row => row[0]).slice(0, 3);
  return { geometry: route.geometry.coordinates, roads, distanceKm: route.distance / 1000, baseMinutes: route.duration / 60 };
}

type CountPoint = { count_point_id: number; road_name: string; aadf_year: number; latitude: string; longitude: string; local_authority_id: number };
type Count = { year: number; count_date: string; hour: number; direction_of_travel: string; all_motor_vehicles: number };
type Paginated<T> = { data: T[]; total: number; last_page: number };
type Authority = { id: number; ons_code: string; name: string };

async function nearbyAuthority(point: Point): Promise<number | undefined> {
  try {
    const near = await getJson<{ result?: { codes?: { admin_district?: string } }[] }>(
      'https://api.postcodes.io/postcodes?lon=' + point[0].toFixed(5) + '&lat=' + point[1].toFixed(5) + '&limit=1', 86400000
    );
    const code = near.result?.[0]?.codes?.admin_district;
    if (!code) return;
    const auth = await getJson<{ data?: Authority[] } | Authority[]>('https://roadtraffic.dft.gov.uk/api/local-authorities', 86400000);
    const rows = Array.isArray(auth) ? auth : auth.data || [];
    return rows.find(item => item.ons_code === code)?.id;
  } catch { return; }
}

export function distanceToRoute(point: Point, line: Point[]) {
  if (!line.length) return Infinity;
  let best = Infinity;
  for (let i = 0; i < line.length; i++) {
    const d = km(point, line[i]);
    if (d < best) best = d;
  }
  return best;
}

async function countPointsForRoad(road: string, authority?: number) {
  const params = new URLSearchParams({ 'filter[road_name]': road, 'page[size]': '500', fields: 'count_point_id,road_name,aadf_year,latitude,longitude,local_authority_id' });
  if (authority) params.set('filter[local_authority_id]', String(authority));
  const result = await getJson<Paginated<CountPoint>>('https://roadtraffic.dft.gov.uk/api/count-points?' + params.toString(), 86400000, 17000);
  return result.data;
}

async function sampleForPoint(point: CountPoint, route: Point[]): Promise<CountSample | null> {
  const url = 'https://roadtraffic.dft.gov.uk/api/raw-counts?' + new URLSearchParams({
    'filter[count_point_id]': String(point.count_point_id), 'page[size]': '500',
    fields: 'year,hour,count_date,direction_of_travel,all_motor_vehicles'
  }).toString();
  const response = await getJson<Paginated<Count>>(url, 86400000, 17000);
  if (!response.data.length) return null;
  const year = Math.max(...response.data.map(c => c.year));
  const rows = response.data.filter(c => c.year === year && c.hour >= 7 && c.hour <= 18);
  const byHour = new Map<number, number>();
  for (const row of rows) byHour.set(row.hour, (byHour.get(row.hour) || 0) + Number(row.all_motor_vehicles || 0));
  if (byHour.size < 6) return null;
  const location: Point = [Number(point.longitude), Number(point.latitude)];
  return {
    road: point.road_name, point: location, year, countDate: rows[0]?.count_date || '',
    countPointId: point.count_point_id, distanceKm: distanceToRoute(location, route),
    hours: [...byHour.entries()].sort((a, b) => a[0] - b[0]).map(([hour, vehicles]) => ({ hour, vehicles }))
  };
}

export async function getSamples(roads: string[], line: Point[]): Promise<CountSample[]> {
  if (!roads.length) {
    const midpoint = line[Math.floor(line.length / 2)];
    const authority = await nearbyAuthority(midpoint);
    if (!authority) return [];
    const params = new URLSearchParams({ 'filter[local_authority_id]': String(authority), 'filter[aadf_year]': '2025', 'page[size]': '500', fields: 'count_point_id,road_name,aadf_year,latitude,longitude,local_authority_id' });
    try {
      const data = await getJson<Paginated<CountPoint>>('https://roadtraffic.dft.gov.uk/api/count-points?' + params.toString(), 86400000, 17000);
      const nearest = data.data.map(cp => ({ cp, d: distanceToRoute([Number(cp.longitude), Number(cp.latitude)], line) })).filter(v => v.d < 8).sort((a, b) => a.d - b.d).slice(0, 4);
      const checked = await Promise.allSettled(nearest.map(item => sampleForPoint(item.cp, line)));
      const samples = checked.flatMap(v => v.status === 'fulfilled' && v.value ? [v.value] : []);
      samples.sort((a, b) => (a.distanceKm + Math.max(0, 2024 - a.year) * .35) - (b.distanceKm + Math.max(0, 2024 - b.year) * .35));
      if (samples.length) return [samples[0]];
    } catch { /* no usable local count point */ }
    return [];
  }
  const authority = await nearbyAuthority(line[Math.floor(line.length / 2)]);
  const found = await Promise.allSettled(roads.slice(0, 3).map(async road => {
    let points = await countPointsForRoad(road, authority);
    if (!points.length && authority) points = await countPointsForRoad(road);
    const nearest = points
      .map(cp => ({ cp, d: distanceToRoute([Number(cp.longitude), Number(cp.latitude)], line) }))
      .filter(({ d }) => d < 18)
      .sort((a, b) => (a.d + Math.max(0, 2024 - a.cp.aadf_year) * .25) - (b.d + Math.max(0, 2024 - b.cp.aadf_year) * .25))
      .slice(0, 4);
    // Some count points have estimates but no raw hourly counts; try the next nearest.
    for (const item of nearest) {
      try {
        const sample = await sampleForPoint(item.cp, line);
        if (sample && sample.distanceKm < 12) return sample;
      } catch { /* use another count point */ }
    }
    return null;
  }));
  return found.flatMap(v => v.status === 'fulfilled' && v.value ? [v.value] : []);
}

export function makeProfile(samples: CountSample[], date: string) {
  const dateValue = new Date(date + 'T12:00:00Z');
  const daySupported = !Number.isNaN(dateValue.getTime()) && ![0, 6].includes(dateValue.getUTCDay());
  if (!samples.length) return { daySupported, hourly: [], windows: [] };
  const hours = Array.from({ length: 12 }, (_, i) => i + 7);
  const hourly = hours.map(hour => {
    const values = samples.map(sample => {
      const count = sample.hours.find(h => h.hour === hour)?.vehicles;
      const mean = sample.hours.reduce((sum, h) => sum + h.vehicles, 0) / sample.hours.length;
      return count && mean ? { count, ratio: count / mean } : null;
    }).filter((v): v is { count: number; ratio: number } => Boolean(v));
    if (!values.length) return null;
    const ratio = values.reduce((sum, v) => sum + v.ratio, 0) / values.length;
    return { hour, ratio, vehicles: samples.length === 1 ? values[0].count : undefined };
  }).filter((v): v is { hour: number; ratio: number; vehicles: number | undefined } => v !== null);
  const peak = Math.max(...hourly.map(h => h.ratio));
  const profile = hourly.map(h => ({ hour: h.hour, index: Math.round(100 * h.ratio / peak), vehicles: h.vehicles }));
  const windows = daySupported ? [...profile].sort((a, b) => a.index - b.index || a.hour - b.hour).slice(0, 4).map(h => ({ start: h.hour, end: h.hour + 1, index: h.index, vehicles: h.vehicles })) : [];
  return { daySupported, hourly: profile, windows };
}

function reduceLine(line: Point[], maxPoints: number): Point[] {
  if (line.length <= maxPoints) return line;
  return Array.from({ length: maxPoints }, (_, i) => line[Math.round(i * (line.length - 1) / (maxPoints - 1))]);
}

async function findGreggsFromOverpass(line: Point[], journey: boolean): Promise<Greggs[]> {
  const points = journey ? reduceLine(line, 42) : [line[0]];
  const location = points.map(p => p[1].toFixed(5) + ',' + p[0].toFixed(5)).join(',');
  const around = journey ? '(around:800,' + location + ')' : '(around:2500,' + location + ')';
  const q = '[out:json][timeout:20];(nwr["brand"~"^Greggs$",i]' + around + ';nwr["name"~"^Greggs($| )",i]' + around + ';);out center tags;';
  type OverpassResults = { elements: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[]; remark?: string };
  // POST avoids URL length limits for journeys. Public Overpass instances can be busy.
  // Try a separate operator if the first instance is unavailable.
  let data: OverpassResults | undefined;
  let lastError: unknown;
  for (const endpoint of ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'QuietRoad/1.0 (personal UK travel planner)' },
        body: new URLSearchParams({ data: q }),
        signal: AbortSignal.timeout(16000),
      });
      if (!response.ok) throw new Error('Map service returned ' + response.status);
      const result = (await response.json()) as OverpassResults;
      if (!Array.isArray(result.elements) || result.remark) throw new Error('Map service could not complete the query');
      data = result;
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!data) throw lastError || new Error('Map service unavailable');
  const seen = new Set<string>();
  const values: Greggs[] = [];
  const path = reduceLine(line, 240);
  for (const el of data.elements || []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const p: Point = [lon!, lat!];
    const distance = distanceToRoute(p, path) * 1000;
    if (distance > (journey ? 950 : 2700)) continue;
    const id = el.type + '/' + el.id;
    if (seen.has(id)) continue;
    seen.add(id);
    const tags = el.tags || {};
    const addr = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']].filter(Boolean).join(' ');
    let nearestIndex = 0; let min = Infinity;
    path.forEach((pt, i) => { const d = km(pt, p); if (d < min) { min = d; nearestIndex = i; } });
    values.push({ id, name: tags.name || 'Greggs', address: addr || tags['addr:postcode'] || 'Address not mapped', point: p, distanceMetres: Math.round(distance), routeKm: journey ? Math.round(nearestIndex / Math.max(1, path.length - 1) * 100) : undefined });
  }
  return values.sort((a, b) => journey ? (a.routeKm || 0) - (b.routeKm || 0) : a.distanceMetres - b.distanceMetres).slice(0, 18);
}

type FoodEstablishment = {
  FHRSID: number;
  BusinessName: string;
  AddressLine1?: string;
  AddressLine2?: string;
  AddressLine3?: string;
  AddressLine4?: string;
  PostCode?: string;
  geocode?: { latitude?: string | number; longitude?: string | number };
};

async function findGreggsFromFoodStandards(line: Point[], journey: boolean): Promise<Greggs[]> {
  const path = reduceLine(line, 240);
  const distanceKm = line.reduce((total, point, i) => i ? total + km(line[i - 1], point) : total, 0);
  const points = journey ? reduceLine(line, Math.min(20, Math.max(2, Math.ceil(distanceKm / 3) + 1))) : [line[0]];
  const responses = await Promise.allSettled(points.map(async point => {
    const params = new URLSearchParams({
      name: 'Greggs',
      latitude: point[1].toFixed(5),
      longitude: point[0].toFixed(5),
      maxDistanceLimit: journey ? '3' : '2',
      pageSize: '100',
      sortOptionKey: 'distance',
    });
    const response = await fetch('https://api.ratings.food.gov.uk/Establishments?' + params, {
      headers: { Accept: 'application/json', 'x-api-version': '2' },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error('Food Standards Agency returned ' + response.status);
    const body = await response.json() as { establishments?: FoodEstablishment[] };
    if (!Array.isArray(body.establishments)) throw new Error('Food Standards Agency returned no records');
    return body.establishments;
  }));
  const successes = responses.filter((r): r is PromiseFulfilledResult<FoodEstablishment[]> => r.status === 'fulfilled');
  if (!successes.length) throw new Error('Food Standards Agency unavailable');
  const seen = new Set<number>();
  const values: Greggs[] = [];
  for (const { value: shops } of successes) for (const shop of shops) {
    if (!/^Greggs\b/i.test(shop.BusinessName || '') || seen.has(shop.FHRSID)) continue;
    seen.add(shop.FHRSID);
    const lon = Number(shop.geocode?.longitude);
    const lat = Number(shop.geocode?.latitude);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || !UK([lon, lat])) continue;
    const point: Point = [lon, lat];
    const distance = distanceToRoute(point, path) * 1000;
    if (distance > (journey ? 950 : 2700)) continue;
    let nearestIndex = 0; let nearestDistance = Infinity;
    path.forEach((position, i) => {
      const value = km(position, point);
      if (value < nearestDistance) { nearestDistance = value; nearestIndex = i; }
    });
    const address = [shop.AddressLine1, shop.AddressLine2, shop.AddressLine3, shop.AddressLine4, shop.PostCode].filter(Boolean).join(', ');
    values.push({
      id: 'fsa/' + shop.FHRSID,
      name: shop.BusinessName,
      address: address || 'Address not listed',
      point,
      distanceMetres: Math.round(distance),
      routeKm: journey ? Math.round(nearestIndex / Math.max(1, path.length - 1) * 100) : undefined,
    });
  }
  return values.sort((a, b) => journey ? (a.routeKm || 0) - (b.routeKm || 0) : a.distanceMetres - b.distanceMetres).slice(0, 18);
}

export async function findGreggs(line: Point[], journey: boolean): Promise<Greggs[]> {
  try {
    return await findGreggsFromFoodStandards(line, journey);
  } catch {
    return findGreggsFromOverpass(line, journey);
  }
}

export async function getLive(line: Point[], key: string): Promise<LiveSample[]> {
  if (!key || key.length > 120) return [];
  const samples = reduceLine(line, Math.min(4, line.length));
  const answers = await Promise.allSettled(samples.map(async point => {
    const params = new URLSearchParams({ key, point: point[1].toFixed(5) + ',' + point[0].toFixed(5), unit: 'mph' });
    const body = await getJson<{ flowSegmentData?: { currentSpeed: number; freeFlowSpeed: number; confidence: number; roadClosure: boolean } }>(
      'https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/15/json?' + params.toString(), 0, 9000
    );
    const flow = body.flowSegmentData;
    if (!flow) throw new Error('No live speed for that road');
    return { currentSpeed: flow.currentSpeed, freeFlowSpeed: flow.freeFlowSpeed, confidence: flow.confidence, closure: Boolean(flow.roadClosure), point };
  }));
  return answers.flatMap(v => v.status === 'fulfilled' ? [v.value] : []);
}
