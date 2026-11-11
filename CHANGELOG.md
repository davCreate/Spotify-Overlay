# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.9] - 2026-11-11

### Added
- Pet customization in Settings → Pets: body color (Orange, Blue, Green, Purple, Pink, Graphite), accessory (top hat, headphones, bow tie, glasses), idle on or off, and time to linger.
- Idle behaviour: after the wave the pet stays by the card and looks around, yawns, stretches, taps its feet, hops or waves, never the same thing twice in a row.
- The pet falls asleep with z notes when the music is paused and wakes with a hop when playback resumes.

### Changed
- The pet colors now come from CSS variables, so every palette uses the same pixel model.
- The Web API is never polled faster than every 5 s (see 1.0.8 for the rate limit).

## [1.0.8] - 2026-11-11

### Added
- Turn the pet on or off from the tray menu ("Pet" checkbox). The Settings toggle still works.

### Changed
- The pet is redrawn as a blocky pixel mascot with stubby arms and legs and big black eyes, in the style of Clawd On Desk.

### Fixed
- The overlay no longer blinks when the pet walks off screen. The window now stays stretched between pet runs and is released only when the pet is turned off or the overlay is unlocked.

## [1.0.7] - 2026-11-11

### Added
- The pet now hands over the card on every song change. If a card is on screen, it walks in, takes it and carries it off screen. The new song is put on the card out of sight, and the pet brings it back with a smooth walk.
- Dance step: after setting the card down, the pet sways, swaps its arms to the beat and floats music notes up from its head before it waves goodbye.
- Walking backwards while it drags the card away: the legs run in reverse.

### Fixed
- The overlay no longer blinks when the pet leaves the screen. The card now fades out while the window shrinks back and fades in at its real place.

### Changed
- Pet sequence is now: take the old card, bring the new one, show it off, set it down, dance, wave, walk away.
- Repository README refreshed: clearer pet section, up-to-date limitations and the project status.

## [1.0.6] - 2026-11-11

### Fixed
- The pet stood frozen on Windows when "Animation effects" is turned off in Windows settings. Its animations now always play.

### Changed
- Better pet walk. Each foot now lifts, reaches forward and plants. The body dips and squashes a little on every step and leans into the walk, while the arms swing and the antenna sways behind. Small dust puffs kick up behind the feet. The step speed now follows the walking speed, so the feet no longer slide across the ground.

## [1.0.5] - 2026-11-11

### Added
- 14 new 3D themes with animation: Sapphire Orbit, Golden Turntable, Hover Mint, Cloud Nine, Neon Cube, Toy Block, Obsidian Box, Depth Field, Paper Layers, Hologram, Mars Projection, Bass Drop, Heartbeat and Cafe Sign (56 themes in total).
- 7 new animated 3D effects, usable with any colors: 3D orbit (turns under a moving light), 3D hover (floats above its shadow), 3D box (a real box with top, bottom and side faces), 3D parallax (cover and text at different depths), hologram projector, beat pulse 3D (jumps toward you on the beat) and hanging sign.
- New **Pets** section. Turn on a pet and it delivers every new song: it walks in from the edge of the screen carrying the overlay, shows it off, puts it in its place, waves and walks away. The first pet is Claude. You can choose the edge it comes from, its size and its walking speed, and play the animation from Settings. It also works in the OBS browser source.

## [1.0.4] - 2026-11-11

### Added
- Windows: the overlay now reads what is playing straight from the Spotify desktop app (through Windows' media controls), including album art and progress. It makes no Spotify Web API calls while the desktop app plays, so it keeps working during "Rate limited by Spotify" waits and even without connecting an account. The Web API is used only when the desktop app isn't playing (for example when you listen on your phone), and on macOS and Linux.

## [1.0.3] - 2026-11-11

### Fixed
- "Rate limited by Spotify" errors. The app no longer asks Spotify what is playing so often: the default refresh interval is now 3000 ms (minimum 1000 ms), and while playback is paused or idle it checks much less often. While a song plays it still checks right after the song should end, so the next track shows up quickly.
- When Spotify does rate limit the app, it now waits exactly as long as Spotify asks and shows a readable time (for example "retrying in 16h 9m").

### Note
- If you already see a long rate-limit wait, it comes from Spotify and is tied to your Client ID. Wait it out, or create a new app in the Spotify Developer Dashboard and paste its Client ID in Settings → Account. Then keep the refresh interval at 3000 ms or more.

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

[1.0.6]: https://github.com/davCreate/Spotify-Overlay/releases/tag/v1.0.6
[1.0.5]: https://github.com/davCreate/Spotify-Overlay/releases/tag/v1.0.5
[1.0.4]: https://github.com/davCreate/Spotify-Overlay/releases/tag/v1.0.4
[1.0.3]: https://github.com/davCreate/Spotify-Overlay/releases/tag/v1.0.3
[1.0.2]: https://github.com/davCreate/Spotify-Overlay/releases/tag/v1.0.2
[1.0.1]: https://github.com/davCreate/Spotify-Overlay/releases/tag/v1.0.1
[1.0.0]: https://github.com/davCreate/Spotify-Overlay/releases/tag/v1.0.0
