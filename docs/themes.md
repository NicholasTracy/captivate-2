# Custom themes

Captivate ships three built-in themes (**Captivate**, **White**, **Dark**).
You can also author a **theme file** and load it from **Settings → Appearance**.

## Quick start

1. Open **Settings**.
2. Choose a built-in theme close to what you want.
3. Click **Export starter…** and save a `.cth` file.
4. Edit the JSON in any text editor (see token list below).
5. Click **Load theme…**, pick your file, then **Save**.

The loaded document is cached in app settings. On launch, Captivate re-reads the
file from disk when the saved path still exists, so external edits apply after
restart.

## File format

- Extension: `.cth` (Captivate THeme; `.json` also accepted)
- Encoding: UTF-8 JSON
- `format` must be `"captivate-theme"`
- `version` must be `1`

Minimal example:

```json
{
  "format": "captivate-theme",
  "version": 1,
  "id": "ocean",
  "name": "Ocean",
  "description": "Cool blue night look",
  "extends": "captivate",
  "mode": "dark",
  "colors": {
    "accent": "#6ec8ff",
    "accentMuted": "rgba(110, 200, 255, 0.22)",
    "bg": {
      "primary": "#0a1628",
      "darker": "#060e1a",
      "lighter": "#122038",
      "panel": "#152844",
      "raised": "#1a3254"
    },
    "divider": "rgba(140, 180, 220, 0.35)",
    "text": {
      "primary": "#e8f4ff",
      "secondary": "#a8c4dc"
    }
  }
}
```

Omitted tokens inherit from `extends` (`light` | `captivate` | `black`, default
`captivate`).

## Token reference

These names map to the runtime theme used by styled-components
(`src/renderer/theme.ts`) and drive MUI chrome via `createMuiThemeFromResolved`.

### Root

| Token | Type | Meaning |
|-------|------|---------|
| `id` | string | Stable slug: `^[a-z][a-z0-9-]{0,63}$` |
| `name` | string | Display name in Settings |
| `description` | string? | Short blurb |
| `extends` | enum? | Base pack: `light`, `captivate`, `black` |
| `mode` | `light` \| `dark`? | Overall UI mode (defaults to base) |

### `colors.bg`

| Token | Meaning |
|-------|---------|
| `primary` | Main app / window background |
| `darker` | Recessed wells, tracks, gutters |
| `lighter` | Slightly lifted surfaces (cards, headers) |
| `panel` | Control modules and grouped chrome |
| `raised` | Buttons / chips above panels |

### `colors` (scalars)

| Token | Meaning |
|-------|---------|
| `divider` | Hairlines and outlined control borders |
| `accent` | Focus / selection / active accent |
| `accentMuted` | Soft fill behind accent (toggles, chips) |

### `colors.text`

| Token | Meaning |
|-------|---------|
| `primary` | Body / primary labels |
| `secondary` | Hints, muted labels |
| `error` | Error text |
| `warning` | Warning text |

### `colors.icon`

| Token | Meaning |
|-------|---------|
| `primary` | Default icon color |
| `secondary` | Secondary / decorative icons |

### `colors.button`

| Token | Meaning |
|-------|---------|
| `text` | Button label |
| `textMuted` | Quieter button text |
| `icon` | Icons inside buttons |

### `elevation`

CSS `box-shadow` strings:

| Token | Meaning |
|-------|---------|
| `shadowSm` | Small lift (chips, compact controls) |
| `shadowMd` | Medium lift (cards, popovers) |
| `shadowSidebar` | Side rail depth |
| `insetHighlight` | Top highlight inset |
| `insetDepth` | Recessed inset |

### `font.size`

| Token | Meaning |
|-------|---------|
| `h1` | Large heading size (e.g. `"1.4rem"`) |

### `mui` (optional)

MUI input / paper surfaces. When omitted, Captivate derives them from `colors`.

| Token | Meaning |
|-------|---------|
| `fieldBg` | Outlined / filled input fill |
| `outline` | Idle outlined input border |
| `paper` | Dialog / menu paper |
| `default` | MUI default page background |
| `placeholder` | Input placeholder text |
| `label` | Floating input label |

## Color values

Any CSS color string Captivate can paint is allowed: `#rgb`, `#rrggbb`,
`#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, `hsla()`, and most named colors.
Keep values under ~160 characters.

## Tips

- Start from **Export starter…** so every token is present and easy to tweak.
- Prefer editing `accent` / `bg` / `text` first; elevation is optional polish.
- White themes should use `mode: "dark"` only if text stays light — match
  `mode` to text contrast.
- Hard-coded colors in some specialized views (pads, 3D, visualizer) may not
  follow the theme file; the shared chrome and most controls do.
- Schema + parser live in `src/shared/themeFile.ts`.

## Example file

See [`examples/ocean.cth`](examples/ocean.cth).
