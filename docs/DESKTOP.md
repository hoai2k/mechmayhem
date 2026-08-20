# MECH MAYHEM desktop builds (Windows + Mac)

The game ships as a self-contained desktop app that wraps the browser build in
Electron. Users download a zip, unzip, and double-click — no install, no
internet, no dev tools. Under the hood the app boots a tiny localhost static
server for the built bundle and opens it in a bundled Chromium window (so
WebGL, gamepads, and `.glb` loading behave exactly like the real browser).

## Files

- `electron/main.cjs` — Electron entry point (window + lifecycle)
- `electron/static-server.cjs` — dependency-free localhost file server
- `electron-builder.yml` — packaging config (portable zips, Win x64 + Mac universal)
- `.github/workflows/release.yml` — CI that builds and publishes the zips

## Run locally (dev)

```bash
npm install
npm run desktop      # builds the web bundle, then launches the Electron app
```

## Build the zips yourself

```bash
npm run dist:win     # -> release/MechMayhem-<ver>-win.zip   (Windows only)
npm run dist:mac     # -> release/MechMayhem-<ver>-mac.zip   (macOS only)
```

Each platform's zip must be built on that platform (or in CI). A Mac zip built
without an Apple Developer signing cert is **unsigned**: on first launch macOS
shows an "unidentified developer" warning — right-click the app → **Open** to
bypass, or run `xattr -cr "Mech Mayhem.app"` if macOS quarantined it. Windows
SmartScreen shows a similar "More info → Run anyway" prompt for unsigned apps.

## Cutting a release (the normal path)

Releases are **not** automatic. New commits do nothing on their own — a release
is a frozen snapshot built from one specific tagged commit. To publish one, push
a tag named `vX.Y.Z`. CI then builds fresh Windows + Mac zips and attaches them
to a GitHub Release.

### Add a tag from the GitHub web UI (no command line)

1. Go to the repo → **Releases** (right sidebar, or `/releases`).
2. Click **Draft a new release**.
3. Under **Choose a tag**, type a new tag like `v1.0.0` and pick
   **Create new tag: v1.0.0 on publish**. Leave the target as `main`.
4. Add a title/notes if you like, then click **Publish release**.

Publishing the tag triggers the workflow. A few minutes later the build job
attaches `MechMayhem-*-win.zip` and `MechMayhem-*-mac.zip` to that same
release. (The release is created immediately with no files; the zips appear
once CI finishes — refresh the page.)

## Test the build pipeline without publishing

In the **Actions** tab, open **Build desktop apps** → **Run workflow**. This
builds both zips and uploads them as temporary CI **artifacts** (downloadable
from that run's summary) without creating any public release. Use this to
confirm the Windows/Mac builds work before cutting a real `v1.0.0` tag.

## Notes

- The app does **not** auto-update. A user on an old zip keeps that version
  until they download a newer one.
- The app icon is `build/icon.png` (Vulcan's rotary-cannon badge, 1024×1024).
  electron-builder auto-generates the Windows `.ico` and macOS `.icns` from it
  at package time. Replace that PNG (≥512×512) to change the icon.
