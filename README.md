# Xiaoma Asset Library

A local catalog for models, textures, HDRIs and reference images. Source version: 0.2.2. The public edition starts with an empty catalog and does not include personal asset indexes, curated collections, thumbnails or source media.

## Development

Use Node.js 22.13+ with `node:sqlite`, Windows and .NET Framework's C# compiler. Install dependencies with `npm install`. With pnpm, allow the Electron, esbuild and ffmpeg-static installation scripts as needed. Run `npm test`, `npm run build`, then `npm start`.

The independent edition declares its own dependencies and builds without the neighboring player project. Eleven core tests and the frontend/C# helper build passed before interface localization. Full UI, every professional file format and every external DCC version have not been retested.

`scripts/prepare.cjs` creates an empty catalog only when it is missing. It does not import a private scan database or overwrite an existing catalog. Use `XIAOMA_LIBRARY_DATA` to choose an isolated runtime data directory.

Optional DCC readers use `XIAOMA_BLENDER`, `XIAOMA_HYTHON` and `XIAOMA_UNRAR`. If a tool is absent, the relevant reader falls back or reports no available preview; it does not install or launch an unrelated editor. Blender and UnRAR also check their documented Program Files defaults. Houdini must be explicitly configured.

Project-authored source is MIT licensed. Electron, three.js, PDF.js, canvas, ag-psd, utif, FFmpeg and 7-Zip retain their respective licenses. FFmpeg is a separate encoder; its license and build information are copied to the output. External DCC software must be obtained and licensed separately. This source edition does not include an installer or third-party binaries.
