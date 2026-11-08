# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

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
- Unit tests, a smoke-test mode and a CI workflow that builds installers for Windows, macOS and Linux.

[1.0.0]: https://github.com/davCreate/Spotify-Overlay/releases/tag/v1.0.0
