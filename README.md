# QuietRoad

A UK journey planner for finding four quieter daytime hours, with an optional Greggs search along a route.

## Run it

Node 22.13 or later is required. Install dependencies with `pnpm install --frozen-lockfile`, then run `pnpm dev`. Open the address shown by Next.js. `pnpm build` checks the production build. Deploy the project as a Next.js app to a host that supports server routes, such as Vercel.

## What the numbers mean

- Search by start and end place or postcode to get a driving route, or search for a single road/postcode.
- OpenStreetMap data powers place lookup and driving route geometry (Photon and OSRM). A numbered road without a named area defaults to the Blyth, Northumberland vicinity; add `near Town` for another stretch.
- Department for Transport raw traffic counts provide actual hourly vehicle totals at nearby count points. The four one-hour windows have the lowest measured volumes relative to the busiest measured hour. A journey using several count points combines their hourly patterns into a relative index. The selected weekday is used for display; the counts are historic sample days, not matching-day forecasts.
- Government hourly samples usually cover 07:00–19:00 on weekdays. The app does not rank weekends or overnight hours when it has no matching evidence. For a lone postcode or unnumbered street it labels the closest available sampled road; that road may differ from the exact street entered.
- OpenStreetMap via Overpass finds Greggs within about 800 metres straight line of a driving route, or about 2.5 km of a selected spot. Results are possible stops, not verified drive-through detours. Opening hours are not verified.
- If the user enters their own TomTom Traffic API key in the optional box, the server requests current segment speeds for sampled points. The key is sent for that request and is not saved. Live sampled speeds are shown separately from the four historical windows. Without a key the app explicitly says live traffic is not connected.

This is a travel planning aid, not a live navigation or delay forecast. Check incidents and closures with National Highways and confirm shop details before leaving. Public location and routing services can rate limit or be temporarily unavailable; a busy public launch should use dedicated service accounts and caching.

## Sources

- [DfT road traffic statistics and raw counts](https://roadtraffic.dft.gov.uk/downloads)
- [DfT API documentation](https://roadtraffic.dft.gov.uk/api-documentation)
- [Photon geocoding](https://photon.komoot.io/)
- [OSRM routing](https://project-osrm.org/docs/v5.24.0/api/)
- [Overpass query language](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL)
- [TomTom Flow Segment Data](https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/traffic-flow/flow-segment-data)
- [OpenStreetMap attribution](https://www.openstreetmap.org/copyright)
