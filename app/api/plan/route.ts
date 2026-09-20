import { NextRequest, NextResponse } from 'next/server';
import { findGreggs, findPlace, findRoute, getLive, getSamples, makeProfile, type Plan, type Point } from '@/lib/traffic';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const mode = body.mode === 'area' ? 'area' : 'journey';
    const first = String(mode === 'area' ? body.road || '' : body.from || '').trim();
    const second = String(body.to || '').trim();
    const date = String(body.date || '');
    const parsedDate = new Date(date + 'T12:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) throw new Error('Choose a valid travel date.');
    if (!first || (mode === 'journey' && !second)) throw new Error(mode === 'area' ? 'Enter a road or postcode.' : 'Enter both ends of the journey.');
    if (first.length > 120 || second.length > 120) throw new Error('Keep each location under 120 characters.');
    const [from, to] = await Promise.all([findPlace(first), mode === 'journey' ? findPlace(second) : Promise.resolve(undefined)]);
    if (to && Math.abs(from.point[0] - to.point[0]) + Math.abs(from.point[1] - to.point[1]) < 0.0001) throw new Error('Choose different start and end points.');
    const route = to ? await findRoute(from.point, to.point) : null;
    const geometry: Point[] = route?.geometry || [from.point];
    const userRoad = first.match(/\b[AMB]\d{1,4}(?:\(M\))?(?!\w)/i)?.[0]?.toUpperCase();
    const roads = route?.roads.length ? route.roads : userRoad ? [userRoad] : [];
    const key = typeof body.trafficKey === 'string' ? body.trafficKey.trim() : '';
    const includeGreggs = body.showGreggs !== false;
    const [history, bakeries, live] = await Promise.allSettled([
      getSamples(roads, geometry),
      includeGreggs ? findGreggs(geometry, Boolean(to)) : Promise.resolve([]),
      key ? getLive(geometry, key) : Promise.resolve([]),
    ]);
    const samples = history.status === 'fulfilled' ? history.value : [];
    const profile = makeProfile(samples, date);
    const greggs = bakeries.status === 'fulfilled' ? bakeries.value : [];
    const liveSamples = live.status === 'fulfilled' ? live.value : [];
    const notes: string[] = [];
    if (!roads.length && samples.length) notes.push('This is the nearest sampled numbered road, ' + samples[0].distanceKm.toFixed(1) + ' km from the chosen location. Your exact street may differ.');
    if (!roads.length && !samples.length) notes.push('No sampled road was found nearby. Try a numbered road and nearby town.');
    if (roads.length && !samples.length) notes.push('No nearby hourly count point was available for this road. Try a road number or add a nearby town.');
    if (samples.length && !profile.daySupported) notes.push('The available hourly count samples are for weekdays. Choose a weekday for four comparable times.');
    if (samples.some(s => s.year < 2021)) notes.push('Some nearby counts are older; use these patterns with caution.');
    if (bakeries.status === 'rejected' && includeGreggs) notes.push('Greggs locations could not be checked right now.');
    if (key && !liveSamples.length) notes.push('Live traffic could not be retrieved. Check the traffic key or try later.');
    const plan: Plan = {
      mode, from, to, geometry, distanceKm: route?.distanceKm, baseMinutes: route?.baseMinutes,
      roads: roads.length ? roads : samples.map(s => s.road), samples, hourly: profile.hourly, windows: profile.windows, daySupported: profile.daySupported,
      requestedDate: date, greggs, greggsStatus: !includeGreggs ? 'not-requested' : bakeries.status === 'fulfilled' ? 'available' : 'unavailable',
      live: liveSamples, liveStatus: !key ? 'not-connected' : liveSamples.length ? 'available' : 'unavailable', notes,
    };
    return NextResponse.json(plan, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not plan this journey.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
