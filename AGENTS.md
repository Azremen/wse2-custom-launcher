# Repository guide for coding agents

## Project and layout

This is an Electron launcher for Mount & Blade: Warband Script Enhancer 2 (WSE2).
The launcher is native; WSE2 executables are Windows applications and use Wine on
non-Windows systems.

| File or directory | Responsibility |
| --- | --- |
| [main.js](./main.js) | Electron main process, IPC handlers, game discovery, downloads, updates, Workshop scanning and process launching |
| [preload.js](./preload.js) | Sandboxed renderer API exposed through `contextBridge` |
| [renderer.js](./renderer.js) | Main/config window UI, module merging, translations and user interactions |
| [main.html](./main.html), [config.html](./config.html), [main.css](./main.css) | Launcher and configuration views and shared styles |
| [multiplayer.js](./multiplayer.js) | Multiplayer validation, argument construction, Windows console bootstrap and password redaction |
| [server-config.js](./server-config.js) | Server INI editor schema, value validation and preservation of additional settings |
| [config.json](./config.json) | WSE2 configuration form schema, not launcher preferences |
| [locales/](./locales/) | English, Turkish and Russian translations |
| [index.php](./index.php) | Remote module catalog endpoint |
| [generate-manifests.php](./generate-manifests.php) | Generates companion manifests for module ZIP archives |
| [tests/](./tests/) | Node test runner tests, including mocked main-process IPC |
| [package.json](./package.json) | Dependencies, commands and electron-builder packaging |
| [.github/workflows/build.yml](./.github/workflows/build.yml) | Tag-triggered platform builds and release publishing |

## Development commands

Use Node.js 24 or newer and npm. PHP 8 or newer with `ZipArchive` is required for
manifest generation, not for launching the desktop application.

```text
npm install
npm start
npm test
npm run pack
npm run dist:win
npm run dist:linux
npm run dist:mac
npm run generate:manifests
```

- `npm test` uses the built-in Node test runner; there is no separate lint or
  type-check script. JavaScript uses CommonJS, strict mode, four-space indentation
  and semicolons.
- For JavaScript changes, run the focused tests and `node --check` on changed
  JavaScript files. Documentation-only changes do not require application tests.
- Build Linux artifacts on Linux/WSL or through CI, and macOS artifacts on macOS.
  `npm run dist` targets Linux and Windows; use a platform-specific command when
  only one output is needed.
- Manifest generation writes/removes `Modules/*.manifest.json` files. Run it only
  against the intended module distribution directory.
- Release scripts can publish artifacts. Do not run them for ordinary validation.

## Change boundaries and invariants

- Keep OS/filesystem/process access in the main process. Extend [preload.js](./preload.js)
  and corresponding IPC handlers together; do not enable renderer Node integration,
  disable context isolation or relax the content security policy to add features.
- Add user-visible UI strings to all three locale files under `ui` and render
  them with `t()` or the existing `data-i18n` attributes. Preserve both main-window
  and configuration-window behavior when editing the shared renderer.
- Update the relevant English, Turkish and Russian sections of [README.md](./README.md)
  for user-facing changes.
- Preserve the normal PLAY path and independent client/server architecture choices.
  WSE2 multi-word module names are deliberately passed without surrounding quotes;
  do not replace the current argument handling without regression testing.
- Workshop modules stay in Steam's folders. Never copy, symlink or recursively
  delete Steam-managed content as a side effect of launcher actions.
- Keep a module's display `name`, engine `launchName` and filesystem `path`
  distinct. Local and Workshop image URLs are created using `pathToFileURL`;
  missing `main.bmp` uses the existing placeholder.
- Reuse [multiplayer.js](./multiplayer.js) for connection/server validation and
  quoting. Server command files (`-r`) and WSE2 INI configuration
  (`--config-path`) are different inputs. Extra arguments are one argv element
  per line, not shell commands.
- Dedicated and dedicated_campaign executables support x86/x64 independently of
  the client switch. Campaign startup may omit `-r`; ordinary dedicated startup
  requires it. Imported argument TXT files use UTF-8 and the same per-line format.
- Server INI editing reuses [config.html](./config.html), but saves only the bound
  server file or a native Save As destination, never the client module template.
  Preserve additional INI settings and keep password controls masked. Saving
  rewrites INI formatting; do not claim comments are retained.
- Dedicated servers must run in a separate console and outlive the launcher.
  Windows uses an encoded, data-only PowerShell `Start-Process` bootstrap;
  Linux uses Wine console tools and a terminal. Process creation is not proof of
  server readiness.
- Join passwords must remain session-only and redacted in logs. Persist only
  the whitelisted multiplayer fields; extra arguments are also session-only.
- Report launch, validation and settings failures explicitly through the existing
  result/error, UI feedback and logging mechanisms.

## Validation and local files

- Automated IPC tests mock Electron, process creation and Wine. They do not prove
  WSE2 auto-connect or Linux/Wine runtime compatibility. Report separately what
  was tested with an actual WSE2 client/server.
- UI smoke checks should include module selection, Workshop images, translations,
  x64 selection, form errors and unchanged normal PLAY behavior.
- `Modules/`, `node_modules/`, `dist/`, caches and logs are local/generated data.
  Avoid editing vendored files under `libs/` for application behavior.
- Do not read, print, commit or copy signing keys/certificates, `.env` values or
  credentials into documentation, fixtures or logs. Use placeholders in examples.
- Preserve unrelated working-tree changes and do not publish builds or create
  releases unless requested.
