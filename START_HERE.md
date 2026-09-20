# QuietRoad: publish with Cloudflare

This folder contains the whole app, including the `/api/plan` service. Use **Workers & Pages → Create application → Import a repository** in Cloudflare. The static upload option cannot run the road search.

## Put the code on GitHub

1. Download and unzip `QuietRoad_Cloudflare.zip` on your computer.
2. At https://github.com/new create a repository called `quietroad` (public or private). You can leave **Add a README** unticked.
3. Open the new repository. Select **uploading an existing file** if the repository is empty, or **Add file → Upload files**. Drag the *contents* of the unzipped `QuietRoad_Cloudflare` folder into the upload area. Keep the `app`, `components`, `lib`, `public`, and `vendor` folders. Commit the files to `main`. Do not upload the ZIP itself.

## Deploy through Cloudflare

1. In Cloudflare, open **Workers & Pages → Create application → Import a repository → Get started**.
2. Connect GitHub if prompted and select the `quietroad` repository.
3. Set the application/Worker name to `quietroad` (the same name as in `wrangler.jsonc`). Keep the root directory blank, or use `/` if required.
4. Set **Build command** to `pnpm run build:vinext` and **Deploy command** to `pnpm run deploy:vinext`. If the dashboard asks for an install command, use `pnpm install --frozen-lockfile`.
5. Select **Save and Deploy**. Once complete, open the `workers.dev` link and try the example Blyth to Newcastle search.

If the build reports a Node version problem, set the build environment variable `NODE_VERSION` to `22.13.0` or newer. If GitHub does not appear in the list, check Cloudflare's GitHub integration permissions for the new repository.

The four suggestions use historical weekday daytime counts. Current traffic speeds are optional and require a TomTom Traffic API key entered in the app. Greggs locations come from OpenStreetMap.
