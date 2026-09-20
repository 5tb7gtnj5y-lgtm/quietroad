'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Clock3, Coffee, ExternalLink, Info, MapPin, Navigation, Route, Search, ShieldCheck, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Plan, Point, Stop } from '@/lib/traffic';

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

function mercator(point: Point, zoom: number) {
  const size = 256 * 2 ** zoom;
  const latitude = Math.max(-85, Math.min(85, point[1])) * Math.PI / 180;
  return {
    x: (point[0] + 180) / 360 * size,
    y: (1 - Math.log(Math.tan(latitude) + 1 / Math.cos(latitude)) / Math.PI) / 2 * size,
  };
}

function googleDirections(plan: Plan, via?: Point) {
  if (!plan.to) return '';
  const pair = (p: Point) => p[1] + ',' + p[0];
  const params = new URLSearchParams({ api: '1', origin: pair(plan.from.point), destination: pair(plan.to.point), travelmode: 'driving' });
  const waypoint = via || plan.stop?.point;
  if (waypoint) params.set('waypoints', pair(waypoint));
  return 'https://www.google.com/maps/dir/?' + params.toString();
}

function MapSketch({ plan }: { plan: Plan }) {
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [width, setWidth] = useState(600);
  const [zoomDelta, setZoomDelta] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const height = 340;

  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(280, entries[0].contentRect.width)));
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);

  const geometry = plan.geometry.length ? plan.geometry : [plan.from.point];
  const all = [...geometry, ...plan.greggs.map(shop => shop.point)];
  const atZero = all.map(point => mercator(point, 0));
  const xs = atZero.map(p => p.x), ys = atZero.map(p => p.y);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  const fit = Math.floor(Math.log2(Math.min((width - 75) / Math.max(1, right - left), (height - 75) / Math.max(1, bottom - top))));
  const zoom = Math.max(5, Math.min(16, (Number.isFinite(fit) ? fit : 14) + zoomDelta));
  const factor = 2 ** zoom;
  const centre = { x: (left + right) / 2 * factor - pan.x, y: (top + bottom) / 2 * factor - pan.y };
  const position = (point: Point) => {
    const projected = mercator(point, zoom);
    return { x: projected.x - centre.x + width / 2, y: projected.y - centre.y + height / 2 };
  };
  const tileLeft = Math.floor((centre.x - width / 2) / 256);
  const tileRight = Math.floor((centre.x + width / 2) / 256);
  const tileTop = Math.floor((centre.y - height / 2) / 256);
  const tileBottom = Math.floor((centre.y + height / 2) / 256);
  const tiles: { x: number; y: number; screenX: number; screenY: number }[] = [];
  const count = 2 ** zoom;
  for (let x = tileLeft; x <= tileRight; x++) for (let y = tileTop; y <= tileBottom; y++) {
    if (y >= 0 && y < count) tiles.push({
      x: (x + count) % count, y,
      screenX: x * 256 - centre.x + width / 2,
      screenY: y * 256 - centre.y + height / 2,
    });
  }
  const interval = Math.max(1, Math.floor(geometry.length / 240));
  const line = geometry.filter((_, index) => index % interval === 0);
  if (line[line.length - 1] !== geometry[geometry.length - 1]) line.push(geometry[geometry.length - 1]);
  const path = line.map(point => { const p = position(point); return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
  const start = position(plan.from.point);
  const end = plan.to ? position(plan.to.point) : null;

  return <div className="map-frame">
    <div className="map-head"><span><Route size={17} /> {plan.to ? 'Your route' : 'Road area'}</span><span>Street map</span></div>
    <div className="map-canvas" ref={frame}>
      <svg viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label={plan.to ? 'Street map of ' + plan.from.label + (plan.stop ? ' via ' + plan.stop.name : '') + ' to ' + plan.to.label + ', with nearby Greggs' : 'Street map around ' + plan.from.label} onPointerDown={event => {
        if ((event.target as Element).closest('a')) return;
        drag.current = { x: event.clientX, y: event.clientY, left: pan.x, top: pan.y };
        event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={event => {
        if (!drag.current) return;
        const ratio = width / event.currentTarget.getBoundingClientRect().width;
        setPan({ x: drag.current.left + (event.clientX - drag.current.x) * ratio, y: drag.current.top + (event.clientY - drag.current.y) * ratio });
      }} onPointerUp={event => {
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }} onPointerCancel={() => { drag.current = null; }}>
        <rect width={width} height={height} fill="#e4eee7" />
        {tiles.map(tile => <image key={zoom + '-' + tile.x + '-' + tile.y} href={'https://tile.openstreetmap.org/' + zoom + '/' + tile.x + '/' + tile.y + '.png'} x={tile.screenX} y={tile.screenY} width="256" height="256" />)}
        {geometry.length > 1 && <><polyline points={path} fill="none" stroke="#183747" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" opacity=".9" /><polyline points={path} fill="none" stroke="#d2f386" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></>}
        {plan.greggs.map(shop => {
          const p = position(shop.point);
          return <a key={shop.id} href={plan.to ? googleDirections(plan, shop.point) : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(shop.point[1] + ',' + shop.point[0])} target="_blank" rel="noopener noreferrer" aria-label={plan.to ? 'Open full journey via ' + shop.name + ' in Google Maps' : 'Open ' + shop.name + ' in maps'}><circle cx={p.x} cy={p.y} r="12" fill="#ffbc53" stroke="#173548" strokeWidth="3" /><circle cx={p.x} cy={p.y} r="3" fill="#173548" /></a>;
        })}
        {end && <><circle cx={end.x} cy={end.y} r="13" fill="white" stroke="#173548" strokeWidth="4" /><circle cx={end.x} cy={end.y} r="5" fill="#173548" /></>}
        <circle cx={start.x} cy={start.y} r="13" fill="#d2f386" stroke="#173548" strokeWidth="4" /><circle cx={start.x} cy={start.y} r="4" fill="#173548" />
      </svg>
      <div className="map-controls">
        <button type="button" aria-label="Zoom in on map" onClick={() => setZoomDelta(value => Math.min(value + 1, 5))}>+</button>
        <button type="button" aria-label="Zoom out of map" onClick={() => setZoomDelta(value => Math.max(value - 1, -5))}>−</button>
        <button type="button" aria-label="Fit route on map" onClick={() => { setZoomDelta(0); setPan({ x: 0, y: 0 }); }}>⌖</button>
      </div>
      <a className="map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
    </div>
    <div className="map-foot"><span><i className="legend-route" />{plan.to ? 'Route' : 'Search area'}</span>{plan.greggs.length > 0 && <span><i className="legend-shop" />Greggs near {plan.to ? 'route' : 'spot'}</span>}<span>Drag to move · + / − to zoom</span></div>
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
  const [night, setNight] = useState(false);
  useEffect(() => {
    try { setNight(window.localStorage.getItem('quietroad-theme') === 'night'); } catch { /* Private browsing can disable storage. */ }
  }, []);
  const toggleTheme = () => {
    const next = !night;
    setNight(next);
    try { window.localStorage.setItem('quietroad-theme', next ? 'night' : 'day'); } catch { /* Theme still works for this visit. */ }
  };
  const [mode, setMode] = useState<'journey' | 'area'>('journey');
  const [from, setFrom] = useState('Blyth, Northumberland');
  const [to, setTo] = useState('Newcastle upon Tyne');
  const [road, setRoad] = useState('A189 near Blyth');
  const [date, setDate] = useState(nextWeekday);
  const [showGreggs, setShowGreggs] = useState(true);
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function search(event?: FormEvent, stopOverride?: Stop | null) {
    event?.preventDefault();
    const stop = stopOverride === undefined ? selectedStop : stopOverride;
    if (stopOverride !== undefined) setSelectedStop(stopOverride);
    setLoading(true); setError(''); setPlan(null);
    try {
      const res = await fetch('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, from, to, road, date, showGreggs, stop: mode === 'journey' ? stop : null }) });
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
  const directions = plan?.to ? googleDirections(plan) : '';

  return <main className={night ? "site-shell theme-night" : "site-shell"}>
    <header className="topbar"><div className="brand"><span className="brand-symbol"><Navigation size={18} strokeWidth={2.5} /></span><span>quietroad<span className="brand-period">.</span></span></div><div className="topbar-right"><span>UK road planner</span><span className="topbar-badge">BETA</span><button className="theme-toggle" type="button" aria-label={night ? "Switch to day mode" : "Switch to night mode"} aria-pressed={night} onClick={toggleTheme}>{night ? <><Sun size={16} /> Day</> : <><Moon size={16} /> Night</>}</button></div></header>
    <div className="main-grid">
      <aside className="planner" aria-label="Plan a road journey">
        <p className="eyebrow light">CHOOSE WHEN TO GO</p><h1>Find the <em>quieter</em> way.</h1>
        <p className="intro">Check a road, postcode or journey. See four quieter daytime windows and Greggs nearby.</p>
        <Tabs value={mode} onValueChange={v => { setMode(v as 'journey' | 'area'); setPlan(null); setSelectedStop(null); setError(''); }} className="mode-tabs">
          <TabsList className="mode-list"><TabsTrigger value="journey"><Route size={17} />Journey</TabsTrigger><TabsTrigger value="area"><MapPin size={17} />Road / postcode</TabsTrigger></TabsList>
          <form onSubmit={search}>
            <TabsContent value="journey"><div className="form-field"><label htmlFor="from">Starting point</label><div className="input-wrap"><MapPin size={18} /><Input id="from" value={from} onChange={e => setFrom(e.target.value)} placeholder="Place or postcode" required maxLength={120} /></div></div>
              <div className="journey-connector" aria-hidden="true"><span /></div>
              <div className="form-field"><label htmlFor="to">Destination</label><div className="input-wrap"><MapPin size={18} /><Input id="to" value={to} onChange={e => setTo(e.target.value)} placeholder="Place or postcode" required maxLength={120} /></div></div>{selectedStop && <div className="selected-stop"><div><Coffee size={16} /><span>Via {selectedStop.name}<small>{selectedStop.address}</small></span></div><button type="button" onClick={() => void search(undefined, null)} disabled={loading}>Remove stop</button></div>}</TabsContent>
            <TabsContent value="area"><div className="form-field"><label htmlFor="road">Road name or postcode</label><div className="input-wrap"><Search size={18} /><Input id="road" value={road} onChange={e => setRoad(e.target.value)} placeholder="e.g. A189 near Blyth or NE24 4SG" required maxLength={120} /></div></div><p className="form-hint">For a long road, add a town to choose the right stretch.</p></TabsContent>
            <div className="form-field date-field"><label htmlFor="date">Day of travel</label><div className="input-wrap"><Clock3 size={18} /><Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} required /></div></div>
            <label className="check-row" htmlFor="greggs"><Checkbox id="greggs" checked={showGreggs} onCheckedChange={v => setShowGreggs(v === true)} /><span><strong>Show Greggs</strong><small>Near this road or journey</small></span></label>
            <Button type="submit" size="lg" className="plan-button" disabled={loading}>{loading ? 'Checking road data…' : 'Find quieter times'}<ArrowRight size={18} /></Button>
          </form>
        </Tabs>
        <div className="planner-foot"><ShieldCheck size={18} /><p>Recommendations use actual published hourly road counts where available. Live speeds are point samples, not a journey time forecast.</p></div>
      </aside>

      <div className="results" aria-live="polite">
        {!plan && !loading && !error && <div className="welcome"><div className="welcome-copy"><p className="eyebrow">READY WHEN YOU ARE</p><h2>Your best time to leave starts here.</h2><p>The example journey is ready to check. Choose <strong>Find quieter times</strong> to compare measured traffic by hour.</p><span className="example-pill"><MapPin size={16} /> Blyth to Newcastle</span></div></div>}
        {loading && <div className="loading-panel" role="status"><div className="loading-orbit"><Navigation size={25} /></div><h2>Checking the route</h2><p>Finding the right road count points and nearby Greggs. This may take a moment.</p><div className="loading-line" /></div>}
        {error && <div className="error-panel" role="alert"><Info size={22} /><div><h2>That search needs another go</h2><p>{error}</p></div></div>}
        {plan && <>
          <div className="result-heading"><div><p className="eyebrow">YOUR ROAD REPORT</p><h2>{plan.from.label}{plan.stop ? <><span className="title-arrow"> → </span>{plan.stop.name}</> : ''}{plan.to ? <><span className="title-arrow"> → </span>{plan.to.label}</> : ''}</h2><p>{plan.mode === 'journey' ? (plan.distanceKm?.toFixed(1) || '—') + ' km route · about ' + Math.round(plan.baseMinutes || 0) + ' min without live traffic' : 'Area around this location'}{plan.roads.length ? ' · ' + plan.roads.join(' / ') : ''}</p></div>{directions && <a className="maps-link" href={directions} target="_blank" rel="noopener noreferrer">{plan.stop ? 'Open trip via Greggs' : 'Open directions'} <ExternalLink size={16} /></a>}</div>
          <div className="result-top">
            <section className="surface times-panel" aria-labelledby="times-heading"><div className="section-head"><div><p className="eyebrow">FOUR TIME WINDOWS</p><h3 id="times-heading">Quieter times to go</h3></div><span className="time-badge">{new Date(plan.requestedDate + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</span></div>
              {plan.windows.length ? <><div className="window-list">{plan.windows.map((w, i) => <div className={'window-card ' + (i === 0 ? 'best' : '')} key={w.start}><span className="window-rank">{String(i + 1).padStart(2, '0')}</span><div><strong>{hourLabel(w.start)}–{hourLabel(w.end)}</strong><small>{i === 0 ? 'Quietest measured hour' : 'Among the four quieter hours'}</small></div><div className="window-meter"><b>{w.index}%</b><span>of peak</span></div></div>)}</div><p className="tiny-note">Based on historical sample counts. Lower % means fewer vehicles than the busiest measured hour, not a predicted journey time.</p></> : <div className="window-empty"><Info size={24} /><p>{!plan.daySupported ? 'Weekend counts are not available in this dataset. Select a weekday to see four comparable windows.' : 'There are no suitable nearby hourly counts for this search. Try a numbered road and town.'}</p></div>}
            </section>
            <div className="side-stack"><MapSketch key={plan.from.label + '|' + (plan.to?.label || '')} plan={plan} /><div className="live-card"><div><span className={'status-light ' + (plan.liveStatus === 'available' ? 'active' : '')} /><strong>{plan.liveStatus === 'available' ? 'Live speed samples' : 'Live traffic'}</strong></div>{plan.liveStatus === 'available' ? <p>{liveAvg} mph now vs {freeAvg} mph in free flow, from {plan.live.length} sampled road {plan.live.length === 1 ? 'segment' : 'segments'}.{plan.live.some(s => s.closure) ? ' A sampled segment is reported closed.' : ''}</p> : <p>{plan.liveStatus === 'unavailable' ? 'Live traffic unavailable right now. Try again later.' : 'Live traffic is not configured yet.'}{usualNow ? ' At this hour the historical count is ' + usualNow.index + '% of the measured peak.' : ''}</p>}</div></div>
          </div>
          <Profile plan={plan} />
          {plan.notes.length > 0 && <div className="notes-panel">{plan.notes.map(note => <p key={note}><Info size={17} />{note}</p>)}</div>}
          {plan.greggsStatus !== 'not-requested' && <section className="surface greggs-panel" aria-labelledby="greggs-heading"><div className="section-head"><div><p className="eyebrow">A STOP ON THE WAY</p><h2 id="greggs-heading"><Coffee size={23} />Greggs {plan.to ? 'near your route' : 'near this spot'}</h2></div><span className="small-chip">{plan.greggs.length} found</span></div>{plan.greggsStatus === 'unavailable' ? <p className="subtle">Greggs locations could not be checked right now. Try this search again later.</p> : plan.greggs.length ? <><div className="shop-list">{plan.greggs.map(shop => <div className="shop" key={shop.id}><div className="shop-icon"><Coffee size={18} /></div><div className="shop-copy"><strong>{shop.name}</strong><span>{shop.address}</span><small>{shop.distanceMetres < 1000 ? shop.distanceMetres + ' m' : (shop.distanceMetres / 1000).toFixed(1) + ' km'} from {plan.to ? 'route' : 'spot'} (straight line)</small></div>{plan.to && <button className="shop-stop" type="button" onClick={() => void search(undefined, shop)} disabled={loading || plan.stop?.id === shop.id}>{plan.stop?.id === shop.id ? 'Current stop' : 'Use as stop'}</button>}<a href={plan.to ? googleDirections(plan, shop.point) : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(shop.point[1] + ',' + shop.point[0])} target="_blank" rel="noopener noreferrer" aria-label={plan.to ? 'Open full journey via ' + shop.name + ' in Google Maps' : 'Open ' + shop.name + ' in maps'} title={plan.to ? 'Full trip in Google Maps' : 'Open in Google Maps'}><ExternalLink size={18} /></a></div>)}</div><p className="tiny-note">{plan.to ? 'Use as stop updates QuietRoad’s route and sampled traffic; the map link opens the full trip via that Greggs. ' : ''}Mapped locations may be missing or out of date. Check opening hours before travelling.</p></> : <p className="subtle">No mapped Greggs was found within {plan.to ? 'about 800 m of this route' : 'about 2.5 km of this spot'}.</p>}</section>}
          <footer className="result-sources">Traffic counts: <a href="https://roadtraffic.dft.gov.uk/downloads" target="_blank" rel="noreferrer">Department for Transport</a>. Routing and Greggs: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> via OSRM / Photon / Overpass. {plan.liveStatus === 'available' ? 'Live speed: TomTom. ' : ''}<a href="https://nationalhighways.co.uk/roads-and-travel/live-travel-updates/" target="_blank" rel="noreferrer">Check current incidents with National Highways</a>.</footer>
        </>}
      </div>
    </div>
  </main>;
}
