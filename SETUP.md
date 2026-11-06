# Building and releasing Well Good Mail

Most people only need the installer from the Releases page. This is for building your own copy or running your own releases.

## Requirements

- Node.js 22
- Rust (stable) and the Tauri 2 prerequisites for Windows: https://v2.tauri.app/start/prerequisites/
- Windows. The app is built for Windows only.

## Run it

```
npm install
npm run dev        # browser preview at http://localhost:1420 (use demo mode)
npm test
npm run typecheck
npm run tauri dev  # the desktop app
```

The browser preview only works in demo mode. Real accounts need the desktop app. Add `?demo=1` to the address (http://localhost:1420/?demo=1) to open straight into the demo mailbox.

## Google sign in

The app asks for a Google client ID and secret the first time it opens, with a step by step guide. Nothing needs to be built in. If you want your own build to have a key built in anyway, copy `.env.example` to `.env` and fill in `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_SECRET`.

## Releases and auto update

The "Build Windows app" workflow builds the installer and publishes it, with a signed update file, to this repository's Releases.

1. Make an update signing key. Keep the private key secret and out of git (`secrets/` is already ignored):

   ```
   npx tauri signer generate -w secrets/updater.key
   ```

2. Put the contents of `secrets/updater.key.pub` into `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`.
3. Change the address under `plugins.updater.endpoints` to your own repository's `releases/latest/download/latest.json`.
4. In your repository's settings, add a secret called `TAURI_SIGNING_PRIVATE_KEY` containing the private key.
5. Raise the version, push, and run the workflow:

   ```
   node scripts/bump-version.cjs 0.5.1
   git commit -am "Version 0.5.1" && git push
   ```

Back up the private key. If you lose it, existing installs cannot be updated automatically and everyone has to reinstall.
