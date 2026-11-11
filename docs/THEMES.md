# Themes

A theme controls the colors, background, border, shadow, font and visual effect of the overlay. Layout, sizes and the visualizer are separate settings, so one theme works with every layout.

## Using themes

- **Settings → Themes**: themes are grouped into categories (Normal, Minimal, 3D, Glass, Neon & Glow, Animated, Retro, Colorful & Nature, Streaming). Click a category chip to filter, and click a card to apply it.
- Change any value in the editor below the gallery. Your changes are applied live and marked as *(modified)*.
- **Save as new theme** stores your version as a custom theme.
- **Undo my tweaks** returns to the original preset.
- **Export…** writes the current theme to a `.json` file. **Import…** adds a theme file as a new custom theme.

## Theme file format

```json
{
  "type": "spotify-overlay-theme",
  "name": "My Neon Theme",
  "values": {
    "background": "gradient",
    "bg": "#2b1055",
    "bg2": "#d53a9d",
    "gradientAngle": 160,
    "bgOpacity": 0.95,
    "albumBlur": 30,
    "text": "#fff0fb",
    "subtext": "#ffb8ec",
    "accent": "#ff3ec8",
    "accent2": "#00e5ff",
    "useAlbumColors": false,
    "borderWidth": 0,
    "borderColor": "#ffffff",
    "shadow": 24,
    "glow": 22,
    "font": "condensed",
    "effect": "neon"
  }
}
```

Every key in `values` is optional. Missing keys take the default value, and invalid values are ignored.

| Key | Type | Allowed values | Meaning |
|---|---|---|---|
| `background` | string | `solid`, `gradient`, `glass`, `album`, `none` | Background style |
| `bg` | color | `#rrggbb` | Main background color (the tint over the cover in `album` mode) |
| `bg2` | color | `#rrggbb` | Second gradient color (`gradient`, `glass`) |
| `gradientAngle` | number | 0–360 | Gradient direction in degrees |
| `bgOpacity` | number | 0–1 | Background opacity |
| `albumBlur` | number | 0–80 | Blur radius of the cover in `album` mode (px) |
| `text` | color | `#rrggbb` | Title color |
| `subtext` | color | `#rrggbb` | Artist, album and time color |
| `accent` | color | `#rrggbb` | Progress bar, visualizer and glow |
| `accent2` | color | `#rrggbb` | End color of gradients |
| `useAlbumColors` | boolean | `true` / `false` | Replace the accents with colors extracted from the cover |
| `borderWidth` | number | 0–8 | Border width (px) |
| `borderColor` | color | `#rrggbb` | Border color |
| `shadow` | number | 0–80 | Drop-shadow blur (px) |
| `glow` | number | 0–60 | Accent glow around the card (px) |
| `font` | string | `system`, `rounded`, `condensed`, `serif`, `mono`, `display` | Font family (system fonts only, so it works offline) |
| `effect` | string | `none`, `tilt`, `extrude`, `layered`, `neumorph`, `neon`, `holo`, `aurora`, `shimmer`, `scanlines`, `pixel`, `sticker`, `orbit`, `hover3d`, `cube`, `parallax`, `hologram`, `beat3d`, `swing` | Visual effect (3D, glow, animated or retro) |

## Contributing a built-in theme

1. Add an entry to `PRESETS` in [`src/shared/themes.js`](../src/shared/themes.js):
   ```js
   preset('my-theme', 'My Theme', 'neon', 'One short sentence describing it.', {
     background: 'gradient', bg: '#101010', bg2: '#303030', accent: '#ff8800', accent2: '#ffcc00', effect: 'neon'
   }),
   ```
   The third argument is the gallery category: one of the ids in `CATEGORIES` (`classic`, `minimal`, `3d`, `glass`, `neon`, `animated`, `retro`, `colorful`, `stream`). Values you leave out come from the base theme (Emerald Night).
2. Run `npm test`. It checks that every preset value is valid, that ids are unique and that every category exists.
3. Open a pull request with a screenshot of the theme. `npx electron . --smoke-test=./smoke` creates one for you.

Please check that the text stays readable: aim for a contrast ratio of at least 4.5:1 between `text` and `bg`.
