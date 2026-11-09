# Contributing to Spotify Overlay

Thanks for wanting to help! Bug reports, ideas, themes, docs and code are all welcome.

## Ground rules

- Be kind. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- For anything bigger than a small fix, open an issue first so we can agree on the approach.
- Keep pull requests focused: one feature or fix per PR.

## Development setup

```bash
git clone https://github.com/davCreate/Spotify-Overlay.git
cd Spotify-Overlay
npm install
npm run dev      # starts the app with DevTools and verbose renderer logging
```

Useful scripts:

| Command | What it does |
|---|---|
| `npm start` | Run the app |
| `npm run dev` | Run with DevTools open and every renderer `console` message printed to the terminal |
| `npm test` | Unit tests (`node:test`, no extra dependencies) |
| `npm run lint` | Syntax-check every JavaScript file |
| `npx electron . --smoke-test=./smoke` | Launch with a temporary profile, screenshot the overlay and every settings section into `./smoke`, then exit |
| `npm run icon` | Regenerate `assets/icon.png` and `assets/tray.png` |
| `npm run dist` | Build installers for your OS into `dist/` |

> **Building on Windows fails with `Cannot create symbolic link`?** electron-builder extracts an archive that contains symlinks. Turn on **Settings → System → For developers → Developer Mode** (or run the terminal as Administrator) once, then run `npm run dist:win` again.

You need your own Spotify Client ID to test the live connection (see the README). Without one, the overlay shows a demo track while Settings is open, which is enough for most UI work.

## Architecture in 60 seconds

- **Main process** (`src/main`) owns everything privileged: windows, tray, global shortcuts, the Spotify OAuth flow and polling, settings persistence and the OBS server.
- **Renderers** (`src/renderer`) are plain HTML/CSS/JS with `contextIsolation`, `sandbox` and no Node.js access. They talk to the main process only through `window.overlayAPI`, which is defined in `src/preload/preload.js`.
- **Shared** (`src/shared`) holds the default settings and the themes. These files work both as CommonJS modules and as browser globals.
- The overlay page also runs as an **OBS browser source**. In that case `overlay.js` uses Server-Sent Events instead of the preload API.

### Adding a setting

1. Add the key and its default value to `DEFAULT_SETTINGS` in `src/shared/defaults.js`.
2. If it is a number or an enumeration, add its limits or allowed values to `NUMBER_LIMITS` / `ENUMS` in `src/main/store.js`.
3. Add a field to the right section in `src/renderer/settings/schema.js`. The UI is generated from the schema.
4. Use it in `src/renderer/overlay/overlay.js`, usually in `applySettings()`.
5. Add a test if it has logic.

### Adding a theme

Add a `preset(...)` entry to `PRESETS` in `src/shared/themes.js`. The full format is in [docs/THEMES.md](docs/THEMES.md). The test suite checks that every value is valid.

### Adding a visualizer style

Add a `case` to `Visualizer.draw()` in `src/renderer/overlay/visualizer.js`. Then add the style id to `ENUMS['visualizer.style']` in `store.js` and to the options in `schema.js`.

## Translations

The app UI is available in English, Spanish, French and Russian. The repository itself (code, comments, docs, commits) stays in English.

- Write UI text in English and wrap it in `tr('...')` (renderer and main process). Use placeholders for values: `tr('Version {version}', { version })`.
- Add the translation of every new string to `src/shared/locales/es.js`, `fr.js` and `ru.js`. The English text is the key.
- `npm test` fails if a string is missing in any language or a translation drops a `{placeholder}`. `node test/i18n.test.js --list` prints the missing keys.

## Code style

- Plain modern JavaScript (ES2020+), 2-space indentation, single quotes and semicolons.
- No new runtime dependencies without discussing them first. The only one is `electron-updater`.
- Never use `innerHTML` with data from Spotify or from users. Build DOM nodes instead (see `h()` in `settings.js`).
- Run `npm run lint && npm test` before you push.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/): `feat: add spectrum visualizer`, `fix: keep overlay on screen after monitor change`, `docs: …`.

## Releasing (maintainers)

1. Bump `version` in `package.json` and add an entry to `CHANGELOG.md`.
2. Create a GitHub release with the tag `vX.Y.Z`.
3. The **CI** workflow builds Windows, macOS and Linux installers and attaches them to the release automatically.
