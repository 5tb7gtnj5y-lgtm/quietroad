'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, Clock3, Coffee, ExternalLink, Info, MapPin, Navigation, Route, Search, ShieldCheck, TrafficCone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Plan, Point } from '@/lib/traffic';

function nextWeekday(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = formatter.formatToParts(new Date());
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), 12));
  if (date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 2);
  if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function hourLabel(hour: number) { return String(hour).padStart(2, '0') + ':00'; }

function MapSketch({ plan }: { plan: Plan }) {
  const points = plan.geometry.length ? plan.geometry : [plan.from.point];
  const all = [...points, ...plan.greggs.map(item => item.point)];
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lon, lat] of all) {
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  }
  const cos = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const spanX = Math.max((maxLon - minLon) * cos, 0.012);
  const spanY = Math.max(maxLat - minLat, 0.012);
  const scale = Math.min(520 / spanX, 288 / spanY);
  const ox = (600 - spanX * scale) / 2;
  const oy = (380 - spanY * scale) / 2;
  const xy = (p: Point) => ({ x: ox + (p[0] - minLon) * cos * scale, y: 380 - oy - (p[1] - minLat) * scale });
  const decimated = points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 240)) === 0);
  if (decimated[decimated.length - 1] !== points[points.length - 1]) decimated.push(points[points.length - 1]);
  const polyline = decimated.map(p => { const c = xy(p); return c.x.toFixed(1) + ',' + c.y.toFixed(1); }).join(' ');
  const start = xy(plan.from.point);
  const end = plan.to ? xy(plan.to.point) : null;
  return <div className="map-frame">
    <div className="map-head"><span><Route size={17} /> {plan.mode === 'journey' ? 'Your route' : 'Road area'}</span><span>OpenStreetMap route</span></div>
    <svg viewBox="0 0 600 380" role="img" aria-label={plan.to ? 'Route shape from ' + plan.from.label + ' to ' + plan.to.label + ', with Greggs markers' : 'Map position for ' + plan.from.label}>
      <defs><pattern id="grid" width="38" height="38" patternUnits="userSpaceOnUse"><path d="M 38 0 L 0 0 0 38" fill="none" stroke="#30465a" strokeWidth="1" /></pattern></defs>
      <rect width="600" height="380" fill="#102a3b" /><rect width="600" height="380" fill="url(#grid)" opacity=".48" />
      {points.length > 1 && <><polyline points={polyline} fill="none" stroke="#203f4f" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" /><polyline points={polyline} fill="none" stroke="#c1ea70" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></>}
      {plan.greggs.map(shop => { const p = xy(shop.point); return <g key={shop.id}><circle cx={p.x} cy={p.y} r="12" fill="#f8b94b" stroke="#102a3b" strokeWidth="3" /><circle cx={p.x} cy={p.y} r="3" fill="#152b3c" /></g>; })}
      {end && <><circle cx={end.x} cy={end.y} r="13" fill="#fff" stroke="#122b3e" strokeWidth="4" /><circle cx={end.x} cy={end.y} r="5" fill="#152b3c" /></>}
      <circle cx={start.x} cy={start.y} r="14" fill="#c1ea70" stroke="#122b3e" strokeWidth="4" /><circle cx={start.x} cy={start.y} r="4" fill="#122b3e" />
    </svg>
    <div className="map-foot"><span><i className="legend-route" />Route</span>{plan.greggs.length > 0 && <span><i className="legend-shop" />Greggs near route</span>}<span>Shape only · not turn-by-turn</span></div>
  </div>;
}

function Profile({ plan }: { plan: Plan }) {
  const recommended = new Set(plan.windows.map(w => w.start));
  return <section className="surface profile-panel" aria-labelledby="profile-heading">
    <div className="section-head"><div><p className="eyebrow">Measured road counts</p><h2 id="profile-heading">How the road changes through the day</h2></div><span className="small-chip">Weekdays · 07:00–19:00</span></div>
    {plan.hourly.length ? <>
      <p className="subtle">Bar height compares each measured hour with the busiest measured hour. {plan.samples.length === 1 ? 'Vehicle counts are from one nearby count point.' : 'Several count points are combined as a relative pattern.'}</p>
      <div className="bar-chart" role="img" aria-label={'Hourly relative traffic: ' + plan.hourly.map(h => hourLabel(h.hour) + ' ' + h.index + ' percent of peak').join(', ')}>
        {plan.hourly.map(h => <div className="bar-column" key={h.hour} title={hourLabel(h.hour) + ': ' + h.index + '% of measured peak'}>
          <div className="bar-track"><div className={'bar-fill ' + (recommended.has(h.hour) ? 'recommended' : '')} style={{ height: Math.max(8, h.index) + '%' }} /></div>
          <span>{String(h.hour).padStart(2, '0')}</span>
        </div>)}
      </div>
      <div className="profile-key"><span><i className="key-best" />Four quieter hours</span><span><i className="key-other" />Other measured hours</span></div>
    </> : <div className="no-profile"><Info size={19} /><span>No local hourly count profile was found. Enter a numbered road and nearby town for a more specific result.</span></div>}
    {plan.samples.length > 0 && <details className="data-details"><summary>Where these figures came from</summary><div>{plan.samples.map(s => <p key={s.countPointId}><strong>{s.road}</strong> · DfT count point {s.countPointId} · {s.year} · {s.distanceKm.toFixed(1)} km from route/spot · {s.hours.length} measured hours</p>)}<p>These are sample-day counts, not a live traffic forecast. Weekend, overnight and special event patterns are not covered.</p></div></details>}
  </section>;
}

export default function Home() {
  const [mode, setMode] = useState<'journey' | 'area'>('journey');
  const [from, setFrom] = useState('Blyth, Northumberland');
  const [to, setTo] = useState('Newcastle upon Tyne');
  const [road, setRoad] = useState('A189 near Blyth');
  const [date, setDate] = useState(nextWeekday);
  const [showGreggs, setShowGreggs] = useState(true);
  const [trafficKey, setTrafficKey] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function search(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true); setError(''); setPlan(null);
    try {
      const res = await fetch('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, from, to, road, date, showGreggs, trafficKey }) });
      const data = await res.json() as Plan & { error?: string };
      if (!res.ok) throw new Error(data.error && !data.error.toLowerCase().startsWith('internal error') ? data.error : 'The road data could not be checked right now. Please try again.');
      setPlan(data as Plan);
    } catch (err) { setError(err instanceof Error ? err.message : 'Please try again.'); }
    finally { setLoading(false); }
  }

  const nowHour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }).format(new Date()));
  const usualNow = plan?.hourly.find(h => h.hour === nowHour);
  const liveAvg = plan?.live.length ? Math.round(plan.live.reduce((s, item) => s + item.currentSpeed, 0) / plan.live.length) : null;
  const freeAvg = plan?.live.length ? Math.round(plan.live.reduce((s, item) => s + item.freeFlowSpeed, 0) / plan.live.length) : null;
  const directions = plan?.to ? 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(plan.from.point[1] + ',' + plan.from.point[0]) + '&destination=' + encodeURIComponent(plan.to.point[1] + ',' + plan.to.point[0]) + '&travelmode=driving' : '';

  return <main className="site-shell">
    <header className="topbar"><div className="brand"><span className="brand-symbol"><Navigation size={18} strokeWidth={2.5} /></span><span>quietroad<span className="brand-period">.</span></span></div><div className="topbar-right"><span>UK road planner</span><span className="topbar-badge">BETA</span></div></header>
    <div className="main-grid">
      <aside className="planner" aria-label="Plan a road journey">
        <p className="eyebrow light">CHOOSE WHEN TO GO</p><h1>Find the <em>quieter</em> way.</h1>
        <p className="intro">Check a road, postcode or journey. See four quieter daytime windows and Greggs nearby.</p>
        <Tabs value={mode} onValueChange={v => { setMode(v as 'journey' | 'area'); setPlan(null); setError(''); }} className="mode-tabs">
          <TabsList className="mode-list"><TabsTrigger value="journey"><Route size={17} />Journey</TabsTrigger><TabsTrigger value="area"><MapPin size={17} />Road / postcode</TabsTrigger></TabsList>
          <form onSubmit={search}>
            <TabsContent value="journey"><div className="form-field"><label htmlFor="from">Starting point</label><div className="input-wrap"><MapPin size={18} /><Input id="from" value={from} onChange={e => setFrom(e.target.value)} placeholder="Place or postcode" required maxLength={120} /></div></div>
              <div className="journey-connector" aria-hidden="true"><span /></div>
              <div className="form-field"><label htmlFor="to">Destination</label><div className="input-wrap"><MapPin size={18} /><Input id="to" value={to} onChange={e => setTo(e.target.value)} placeholder="Place or postcode" required maxLength={120} /></div></div></TabsContent>
            <TabsContent value="area"><div className="form-field"><label htmlFor="road">Road name or postcode</label><div className="input-wrap"><Search size={18} /><Input id="road" value={road} onChange={e => setRoad(e.target.value)} placeholder="e.g. A189 near Blyth or NE24 4SG" required maxLength={120} /></div></div><p className="form-hint">For a long road, add a town to choose the right stretch.</p></TabsContent>
            <div className="form-field date-field"><label htmlFor="date">Day of travel</label><div className="input-wrap"><Clock3 size={18} /><Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} required /></div></div>
            <label className="check-row" htmlFor="greggs"><Checkbox id="greggs" checked={showGreggs} onCheckedChange={v => setShowGreggs(v === true)} /><span><strong>Show Greggs</strong><small>Near this road or journey</small></span></label>
            <Button type="submit" size="lg" className="plan-button" disabled={loading}>{loading ? 'Checking road data…' : 'Find quieter times'}<ArrowRight size={18} /></Button>
          </form>
        </Tabs>
        <details className="live-setup"><summary><TrafficCone size={18} /> Add a live traffic check <span>Optional</span></summary><p>Enter your TomTom Traffic API key to compare sampled speeds with normal free-flow speeds right now. The key is used for this search and is not saved.</p><Input aria-label="TomTom Traffic API key" type="password" autoComplete="off" placeholder="Traffic API key" value={trafficKey} onChange={e => setTrafficKey(e.target.value)} maxLength={120} /><a href="https://developer.tomtom.com/" target="_blank" rel="noreferrer">About TomTom traffic keys <ExternalLink size={13} /></a></details>
        <div className="planner-foot"><ShieldCheck size={18} /><p>Recommendations use actual published hourly road counts where available. Live speeds require a traffic key.</p></div>
      </aside>

      <div className="results" aria-live="polite">
        {!plan && !loading && !error && <div className="welcome"><div className="welcome-copy"><p className="eyebrow">READY WHEN YOU ARE</p><h2>Your best time to leave starts here.</h2><p>The example journey is ready to check. Choose <strong>Find quieter times</strong> to compare measured traffic by hour.</p><span className="example-pill"><MapPin size={16} /> Blyth to Newcastle</span></div></div>}
        {loading && <div className="loading-panel" role="status"><div className="loading-orbit"><Navigation size={25} /></div><h2>Checking the route</h2><p>Finding the right road count points and nearby Greggs. This may take a moment.</p><div className="loading-line" /></div>}
        {error && <div className="error-panel" role="alert"><Info size={22} /><div><h2>That search needs another go</h2><p>{error}</p></div></div>}
        {plan && <>
          <div className="result-heading"><div><p className="eyebrow">YOUR ROAD REPORT</p><h2>{plan.from.label}{plan.to ? <><span className="title-arrow"> → </span>{plan.to.label}</> : ''}</h2><p>{plan.mode === 'journey' ? (plan.distanceKm?.toFixed(1) || '—') + ' km route · about ' + Math.round(plan.baseMinutes || 0) + ' min without live traffic' : 'Area around this location'}{plan.roads.length ? ' · ' + plan.roads.join(' / ') : ''}</p></div>{directions && <a className="maps-link" href={directions} target="_blank" rel="noopener noreferrer">Open directions <ExternalLink size={16} /></a>}</div>
          <div className="result-top">
            <section className="surface times-panel" aria-labelledby="times-heading"><div className="section-head"><div><p className="eyebrow">FOUR TIME WINDOWS</p><h3 id="times-heading">Quieter times to go</h3></div><span className="time-badge">{new Date(plan.requestedDate + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</span></div>
              {plan.windows.length ? <><div className="window-list">{plan.windows.map((w, i) => <div className={'window-card ' + (i === 0 ? 'best' : '')} key={w.start}><span className="window-rank">{String(i + 1).padStart(2, '0')}</span><div><strong>{hourLabel(w.start)}–{hourLabel(w.end)}</strong><small>{i === 0 ? 'Quietest measured hour' : 'Among the four quieter hours'}</small></div><div className="window-meter"><b>{w.index}%</b><span>of peak</span></div></div>)}</div><p className="tiny-note">Based on historical sample counts. Lower % means fewer vehicles than the busiest measured hour, not a predicted journey time.</p></> : <div className="window-empty"><Info size={24} /><p>{!plan.daySupported ? 'Weekend counts are not available in this dataset. Select a weekday to see four comparable windows.' : 'There are no suitable nearby hourly counts for this search. Try a numbered road and town.'}</p></div>}
            </section>
            <div className="side-stack"><MapSketch plan={plan} /><div className="live-card"><div><span className={'status-light ' + (plan.liveStatus === 'available' ? 'active' : '')} /><strong>{plan.liveStatus === 'available' ? 'Live speed samples' : 'Live traffic'}</strong></div>{plan.liveStatus === 'available' ? <p>{liveAvg} mph now vs {freeAvg} mph in free flow, from {plan.live.length} sampled road {plan.live.length === 1 ? 'segment' : 'segments'}.{plan.live.some(s => s.closure) ? ' A sampled segment is reported closed.' : ''}</p> : <p>{plan.liveStatus === 'unavailable' ? 'Live data unavailable. Check the key and try again.' : 'Add a traffic key on the left for current speeds.'}{usualNow ? ' At this hour the historical count is ' + usualNow.index + '% of the measured peak.' : ''}</p>}</div></div>
          </div>
          <Profile plan={plan} />
          {plan.notes.length > 0 && <div className="notes-panel">{plan.notes.map(note => <p key={note}><Info size={17} />{note}</p>)}</div>}
          {plan.greggsStatus !== 'not-requested' && <section className="surface greggs-panel" aria-labelledby="greggs-heading"><div className="section-head"><div><p className="eyebrow">A STOP ON THE WAY</p><h2 id="greggs-heading"><Coffee size={23} />Greggs {plan.to ? 'near your route' : 'near this spot'}</h2></div><span className="small-chip">{plan.greggs.length} found</span></div>{plan.greggsStatus === 'unavailable' ? <p className="subtle">Greggs locations could not be checked right now. Try this search again later.</p> : plan.greggs.length ? <><div className="shop-list">{plan.greggs.map(shop => <div className="shop" key={shop.id}><div className="shop-icon"><Coffee size={18} /></div><div className="shop-copy"><strong>{shop.name}</strong><span>{shop.address}</span><small>{shop.distanceMetres < 1000 ? shop.distanceMetres + ' m' : (shop.distanceMetres / 1000).toFixed(1) + ' km'} from {plan.to ? 'route' : 'spot'} (straight line)</small></div><a href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(shop.point[1] + ',' + shop.point[0])} target="_blank" rel="noopener noreferrer" aria-label={'Open ' + shop.name + ' in maps'}><ExternalLink size={18} /></a></div>)}</div><p className="tiny-note">Mapped locations may be missing or out of date. Check opening hours before travelling.</p></> : <p className="subtle">No mapped Greggs was found within {plan.to ? 'about 800 m of this route' : 'about 2.5 km of this spot'}.</p>}</section>}
          <footer className="result-sources">Traffic counts: <a href="https://roadtraffic.dft.gov.uk/downloads" target="_blank" rel="noreferrer">Department for Transport</a>. Routing and Greggs: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> via OSRM / Photon / Overpass. {plan.liveStatus === 'available' ? 'Live speed: TomTom. ' : ''}<a href="https://nationalhighways.co.uk/roads-and-travel/live-travel-updates/" target="_blank" rel="noreferrer">Check current incidents with National Highways</a>.</footer>
        </>}
      </div>
    </div>
  </main>;
}
