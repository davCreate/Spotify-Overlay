# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.2] - 2026-11-09

### Added
- App language option (Settings → General → Language): English, Spanish, French and Russian. *Automatic* follows the system language. The settings window, tray menu, notifications, dialogs, overlay messages and the browser login page are translated.
- Test that fails when a UI string is missing a translation.

## [1.0.1] - 2026-11-09

### Added
- Theme gallery sorted into 9 categories (Normal, Minimal, 3D, Glass, Neon & Glow, Animated, Retro, Colorful & Nature, Streaming) with filter chips. Each theme card now shows a live effect preview and tags for its background, effect and font.
- 24 new themes (42 in total), including Tilted Stage, Solid Block, Card Deck, Soft Clay, Neon Tokyo, Aurora, Holographic, Arcade 8-bit and Chroma Key.
- New theme option **Visual effect** with 12 effects: 3D tilt, 3D extruded block, 3D stacked cards, soft 3D (neumorphism), neon tube, holographic, aurora, shimmer, CRT scanlines, pixel/8-bit and sticker.
- **Overall size** controls: a size slider (50–300%) at the top of Settings → Layout, Small/Normal/Large/Extra large and Bigger/Smaller buttons, a *Size* submenu in the tray, and rebindable shortcuts (`Ctrl+Alt+Up` / `Ctrl+Alt+Down`). The whole overlay scales proportionally.

### Changed
- The "Drag to move" hint under the unlocked overlay is smaller and fainter, and keeps the same size at any overlay scale.
- Retro Terminal now uses the CRT scanlines effect.

## [1.0.0] - 2026-11-08

### Added
- Always-on-top, transparent, click-through overlay showing the current Spotify track or episode: album art, title, artist, album, device and a live progress bar.
- Spotify login with OAuth 2.0 PKCE (user-provided Client ID, loopback redirect) and encrypted token storage.
- Audio visualizer with 7 styles (bars, mirrored bars, LED blocks, dots, wave, waveform lines, circle), 3 placements and 4 color modes. It uses real system audio on Windows and a simulated mode elsewhere.
- 18 built-in themes, a full theme editor, album-adaptive colors, custom themes and theme import/export.
- 4 layouts, 4 album-art shapes (including a spinning vinyl), beat pulse, 6 song-change transitions and idle animations.
- Visibility rules: hide when idle, hide when paused, auto-hide after song changes.
- Tray icon, rebindable global shortcuts, launch at startup and start hidden.
- OBS / Streamlabs browser source served on `127.0.0.1`.
- Settings export/import and reset.
- Built-in update checker (Settings → Updates and the tray menu). The Windows installer and Linux AppImage download and install updates in-app; other builds link to the download page. Automatic checks on launch and every 6 hours, with a notification when a new version is out.
- Unit tests, a smoke-test mode and a CI workflow that builds installers for Windows, macOS and Linux.

[1.0.2]: https://github.com/davCreate/Spotify-Overlay/releases/tag/v1.0.2
[1.0.1]: https://github.com/davCreate/Spotify-Overlay/releases/tag/v1.0.1
[1.0.0]: https://github.com/davCreate/Spotify-Overlay/releases/tag/v1.0.0
