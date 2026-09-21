/**
 * Captivate custom theme files (`.cth` / `.json`).
 *
 * Themes are JSON documents that partially override a built-in base pack.
 * Token names match `Theme_t` in `src/renderer/theme.ts` — see `docs/themes.md`.
 */

import type { ThemePackId } from './appSettings'

export const CAPTIVATE_THEME_FORMAT = 'captivate-theme' as const
export const CAPTIVATE_THEME_VERSION = 1 as const
/** Short extension: Captivate THeme. */
export const CAPTIVATE_THEME_EXTENSION = '.cth'

export type ThemeMode = 'light' | 'dark'

/** Optional MUI-only surfaces (inputs, paper). Falls back from `colors` when omitted. */
export type ThemeMuiOverrides = {
  /** Outlined / filled input fill. */
  fieldBg?: string
  /** Outlined input border (idle). */
  outline?: string
  /** Dialog / menu paper. */
  paper?: string
  /** Default page background for MUI. */
  default?: string
  /** Placeholder text in inputs. */
  placeholder?: string
  /** Floating input label. */
  label?: string
}

export type ThemeColorsFile = {
  bg?: {
    /** Main app chrome / window background. */
    primary?: string
    /** Recessed wells, tracks, darker gutters. */
    darker?: string
    /** Slightly lifted surfaces (cards, headers). */
    lighter?: string
    /** Control modules, panels, grouped chrome. */
    panel?: string
    /** Buttons / chips sitting above panels. */
    raised?: string
  }
  /** Hairlines, outlined control borders. */
  divider?: string
  /** Focus / selection / active accent. */
  accent?: string
  /** Soft fill behind accent (toggles, selected chips). */
  accentMuted?: string
  text?: {
    primary?: string
    secondary?: string
    error?: string
    warning?: string
  }
  icon?: {
    primary?: string
    secondary?: string
  }
  button?: {
    text?: string
    textMuted?: string
    icon?: string
  }
}

export type ThemeElevationFile = {
  shadowSm?: string
  shadowMd?: string
  shadowSidebar?: string
  insetHighlight?: string
  insetDepth?: string
}

export type ThemeFontFile = {
  size?: {
    h1?: string
  }
}

/**
 * On-disk theme document. All color/elevation keys are optional — omitted
 * tokens inherit from `extends` (default `captivate`).
 */
export type CaptivateThemeDocument = {
  format: typeof CAPTIVATE_THEME_FORMAT
  version: typeof CAPTIVATE_THEME_VERSION
  /** Stable slug (a-z, 0-9, hyphen). Used in settings UI. */
  id: string
  /** Human-readable name. */
  name: string
  description?: string
  /** Built-in pack to inherit missing tokens from. */
  extends?: ThemePackId
  /** Light or dark UI mode. Defaults to the base pack’s mode. */
  mode?: ThemeMode
  colors?: ThemeColorsFile
  elevation?: ThemeElevationFile
  font?: ThemeFontFile
  mui?: ThemeMuiOverrides
}

export type ThemeParseResult =
  | { ok: true; document: CaptivateThemeDocument }
  | { ok: false; error: string }

const ID_RE = /^[a-z][a-z0-9-]{0,63}$/
const COLOR_MAX = 160
const CSS_MAX = 480

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function asOptionalString(
  value: unknown,
  field: string,
  maxLen: number
): string | undefined | { error: string } {
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    return { error: `${field} must be a string` }
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return { error: `${field} must not be empty` }
  }
  if (trimmed.length > maxLen) {
    return { error: `${field} is too long (max ${maxLen} characters)` }
  }
  return trimmed
}

function parseColorGroup(
  raw: unknown,
  prefix: string,
  keys: readonly string[]
): Record<string, string> | { error: string } | undefined {
  if (raw === undefined) return undefined
  if (!isPlainObject(raw)) {
    return { error: `${prefix} must be an object` }
  }
  const out: Record<string, string> = {}
  for (const key of keys) {
    if (!(key in raw)) continue
    const parsed = asOptionalString(raw[key], `${prefix}.${key}`, COLOR_MAX)
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      return parsed
    }
    if (typeof parsed === 'string') {
      out[key] = parsed
    }
  }
  return out
}

/**
 * Parse and validate a Captivate theme file (JSON string or already-parsed object).
 */
export function parseCaptivateThemeFile(raw: unknown): ThemeParseResult {
  let value: unknown = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return { ok: false, error: 'Theme file is not valid JSON' }
    }
  }

  if (!isPlainObject(value)) {
    return { ok: false, error: 'Theme file must be a JSON object' }
  }

  if (value.format !== CAPTIVATE_THEME_FORMAT) {
    return {
      ok: false,
      error: `Expected format "${CAPTIVATE_THEME_FORMAT}"`,
    }
  }

  if (value.version !== CAPTIVATE_THEME_VERSION) {
    return {
      ok: false,
      error: `Unsupported theme version (expected ${CAPTIVATE_THEME_VERSION})`,
    }
  }

  const idRaw = asOptionalString(value.id, 'id', 64)
  if (!idRaw || typeof idRaw !== 'string') {
    return {
      ok: false,
      error:
        idRaw && typeof idRaw === 'object'
          ? idRaw.error
          : 'id is required (e.g. "ocean")',
    }
  }
  if (!ID_RE.test(idRaw)) {
    return {
      ok: false,
      error:
        'id must be lowercase letters/digits/hyphens and start with a letter',
    }
  }

  const nameRaw = asOptionalString(value.name, 'name', 80)
  if (!nameRaw || typeof nameRaw !== 'string') {
    return {
      ok: false,
      error:
        nameRaw && typeof nameRaw === 'object' ? nameRaw.error : 'name is required',
    }
  }

  let description: string | undefined
  if (value.description !== undefined) {
    const desc = asOptionalString(value.description, 'description', 280)
    if (desc && typeof desc === 'object' && 'error' in desc) {
      return { ok: false, error: desc.error }
    }
    if (typeof desc === 'string') description = desc
  }

  let extendsPack: ThemePackId | undefined
  if (value.extends !== undefined) {
    if (
      value.extends !== 'light' &&
      value.extends !== 'captivate' &&
      value.extends !== 'black'
    ) {
      return {
        ok: false,
        error: 'extends must be "light", "captivate", or "black"',
      }
    }
    extendsPack = value.extends
  }

  let mode: ThemeMode | undefined
  if (value.mode !== undefined) {
    if (value.mode !== 'light' && value.mode !== 'dark') {
      return { ok: false, error: 'mode must be "light" or "dark"' }
    }
    mode = value.mode
  }

  const colorsRaw = value.colors
  let colors: ThemeColorsFile | undefined
  if (colorsRaw !== undefined) {
    if (!isPlainObject(colorsRaw)) {
      return { ok: false, error: 'colors must be an object' }
    }
    colors = {}
    const bg = parseColorGroup(colorsRaw.bg, 'colors.bg', [
      'primary',
      'darker',
      'lighter',
      'panel',
      'raised',
    ])
    if (bg && 'error' in bg) return { ok: false, error: bg.error }
    if (bg) colors.bg = bg

    for (const key of ['divider', 'accent', 'accentMuted'] as const) {
      if (!(key in colorsRaw)) continue
      const parsed = asOptionalString(colorsRaw[key], `colors.${key}`, COLOR_MAX)
      if (parsed && typeof parsed === 'object' && 'error' in parsed) {
        return { ok: false, error: parsed.error }
      }
      if (typeof parsed === 'string') {
        colors[key] = parsed
      }
    }

    const text = parseColorGroup(colorsRaw.text, 'colors.text', [
      'primary',
      'secondary',
      'error',
      'warning',
    ])
    if (text && 'error' in text) return { ok: false, error: text.error }
    if (text) colors.text = text

    const icon = parseColorGroup(colorsRaw.icon, 'colors.icon', [
      'primary',
      'secondary',
    ])
    if (icon && 'error' in icon) return { ok: false, error: icon.error }
    if (icon) colors.icon = icon

    const button = parseColorGroup(colorsRaw.button, 'colors.button', [
      'text',
      'textMuted',
      'icon',
    ])
    if (button && 'error' in button) return { ok: false, error: button.error }
    if (button) colors.button = button
  }

  let elevation: ThemeElevationFile | undefined
  if (value.elevation !== undefined) {
    if (!isPlainObject(value.elevation)) {
      return { ok: false, error: 'elevation must be an object' }
    }
    elevation = {}
    for (const key of [
      'shadowSm',
      'shadowMd',
      'shadowSidebar',
      'insetHighlight',
      'insetDepth',
    ] as const) {
      if (!(key in value.elevation)) continue
      const parsed = asOptionalString(
        value.elevation[key],
        `elevation.${key}`,
        CSS_MAX
      )
      if (parsed && typeof parsed === 'object' && 'error' in parsed) {
        return { ok: false, error: parsed.error }
      }
      if (typeof parsed === 'string') {
        elevation[key] = parsed
      }
    }
  }

  let font: ThemeFontFile | undefined
  if (value.font !== undefined) {
    if (!isPlainObject(value.font)) {
      return { ok: false, error: 'font must be an object' }
    }
    if (value.font.size !== undefined) {
      if (!isPlainObject(value.font.size)) {
        return { ok: false, error: 'font.size must be an object' }
      }
      const h1 = asOptionalString(value.font.size.h1, 'font.size.h1', 32)
      if (h1 && typeof h1 === 'object' && 'error' in h1) {
        return { ok: false, error: h1.error }
      }
      if (typeof h1 === 'string') {
        font = { size: { h1 } }
      }
    }
  }

  let mui: ThemeMuiOverrides | undefined
  if (value.mui !== undefined) {
    if (!isPlainObject(value.mui)) {
      return { ok: false, error: 'mui must be an object' }
    }
    mui = {}
    for (const key of [
      'fieldBg',
      'outline',
      'paper',
      'default',
      'placeholder',
      'label',
    ] as const) {
      if (!(key in value.mui)) continue
      const parsed = asOptionalString(value.mui[key], `mui.${key}`, COLOR_MAX)
      if (parsed && typeof parsed === 'object' && 'error' in parsed) {
        return { ok: false, error: parsed.error }
      }
      if (typeof parsed === 'string') {
        mui[key] = parsed
      }
    }
  }

  const document: CaptivateThemeDocument = {
    format: CAPTIVATE_THEME_FORMAT,
    version: CAPTIVATE_THEME_VERSION,
    id: idRaw,
    name: nameRaw,
    ...(description !== undefined ? { description } : {}),
    ...(extendsPack !== undefined ? { extends: extendsPack } : {}),
    ...(mode !== undefined ? { mode } : {}),
    ...(colors !== undefined ? { colors } : {}),
    ...(elevation !== undefined ? { elevation } : {}),
    ...(font !== undefined ? { font } : {}),
    ...(mui !== undefined ? { mui } : {}),
  }

  return { ok: true, document }
}

/** Deep-merge file colors onto a full colors object. */
export function mergeThemeColors<T extends { bg: Record<string, string> }>(
  base: T,
  patch: ThemeColorsFile | undefined
): T {
  if (!patch) return base
  const next = { ...base } as T & {
    bg: Record<string, string>
    text?: Record<string, string>
    icon?: Record<string, string>
    button?: Record<string, string>
    divider?: string
    accent?: string
    accentMuted?: string
  }
  if (patch.bg) {
    next.bg = { ...base.bg, ...patch.bg }
  }
  if (patch.text) {
    const baseText =
      'text' in base && base.text && typeof base.text === 'object'
        ? (base.text as Record<string, string>)
        : {}
    next.text = { ...baseText, ...patch.text }
  }
  if (patch.icon) {
    const baseIcon =
      'icon' in base && base.icon && typeof base.icon === 'object'
        ? (base.icon as Record<string, string>)
        : {}
    next.icon = { ...baseIcon, ...patch.icon }
  }
  if (patch.button) {
    const baseButton =
      'button' in base && base.button && typeof base.button === 'object'
        ? (base.button as Record<string, string>)
        : {}
    next.button = { ...baseButton, ...patch.button }
  }
  if (patch.divider !== undefined) next.divider = patch.divider
  if (patch.accent !== undefined) next.accent = patch.accent
  if (patch.accentMuted !== undefined) next.accentMuted = patch.accentMuted
  return next as T
}

export function mergeThemeElevation<T extends Record<string, string>>(
  base: T,
  patch: ThemeElevationFile | undefined
): T {
  if (!patch) return base
  return { ...base, ...patch }
}

/** Starter document users can export and edit. */
export function createThemeTemplate(options: {
  id: string
  name: string
  extendsPack?: ThemePackId
  description?: string
  mode?: ThemeMode
  colors?: ThemeColorsFile
  elevation?: ThemeElevationFile
  mui?: ThemeMuiOverrides
}): CaptivateThemeDocument {
  return {
    format: CAPTIVATE_THEME_FORMAT,
    version: CAPTIVATE_THEME_VERSION,
    id: options.id,
    name: options.name,
    ...(options.description !== undefined
      ? { description: options.description }
      : {}),
    extends: options.extendsPack ?? 'captivate',
    ...(options.mode !== undefined ? { mode: options.mode } : {}),
    ...(options.colors !== undefined ? { colors: options.colors } : {}),
    ...(options.elevation !== undefined
      ? { elevation: options.elevation }
      : {}),
    ...(options.mui !== undefined ? { mui: options.mui } : {}),
  }
}

export function serializeThemeDocument(
  document: CaptivateThemeDocument
): string {
  return `${JSON.stringify(document, null, 2)}\n`
}

/** File filters for open/save dialogs. */
export const THEME_FILE_FILTERS: { name: string; extensions: string[] }[] = [
  { name: 'Captivate Theme', extensions: ['cth', 'json'] },
]
