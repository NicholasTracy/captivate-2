/**
 * Application preferences (persisted). Theme and language pack IDs are placeholders
 * for future installable packs; built-in options ship with the app today.
 * Custom themes: load a `.cth` file (see `docs/themes.md`).
 */

import {
  parseCaptivateThemeFile,
  type CaptivateThemeDocument,
} from './themeFile'

/**
 * Built-in UI themes:
 * - `light` — white / light greys
 * - `captivate` — Captivate 2 default mid-greys (legacy id was `dark`)
 * - `black` — near-black / dark greys with white accents
 */
export type ThemePackId = 'light' | 'captivate' | 'black'

export type LanguagePackId = 'en'

/** Last loaded custom theme (document is cached so the UI works if the file moves). */
export type CustomThemeState = {
  /** Absolute path to the theme file, when known. */
  path: string | null
  document: CaptivateThemeDocument
}

export interface AppSettings {
  themePackId: ThemePackId
  languagePackId: LanguagePackId
  /** When true, project + fixture DB are written to the workspace files on an interval. */
  autosaveEnabled: boolean
  /** Last active project file (`.cap` / legacy `.captivate`). */
  lastProjectFilePath: string | null
  /** Sibling fixture DB for the last active project (`.cfx`). */
  lastFixtureLibraryFilePath: string | null
  /**
   * When true, the first-run interactive tutorial has been finished or skipped
   * and should not auto-prompt again (Help menu can still restart it).
   */
  firstRunTutorialCompleted: boolean
  /**
   * When true and `customTheme` is set, the custom theme file is active
   * instead of `themePackId`.
   */
  useCustomTheme: boolean
  /** Loaded custom theme (null when none). */
  customTheme: CustomThemeState | null
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  themePackId: 'captivate',
  languagePackId: 'en',
  autosaveEnabled: true,
  lastProjectFilePath: null,
  lastFixtureLibraryFilePath: null,
  firstRunTutorialCompleted: false,
  useCustomTheme: false,
  customTheme: null,
}

export type ThemePackOption = {
  id: ThemePackId
  label: string
  description: string
}

export type LanguagePackOption = {
  id: LanguagePackId
  label: string
  description: string
  /** When false, UI shows as coming soon / not yet loadable. */
  available: boolean
}

export const BUILTIN_THEME_PACKS: ThemePackOption[] = [
  {
    id: 'captivate',
    label: 'Captivate',
    description: 'Default Captivate 2 greys — the classic look.',
  },
  {
    id: 'light',
    label: 'White',
    description: 'Light backgrounds with high-contrast text and icons.',
  },
  {
    id: 'black',
    label: 'Dark',
    description:
      'Near-black cool charcoal with bright white accents and clearer raised panels.',
  },
]

/** Normalize a stored theme id, including the legacy `dark` → `captivate` rename. */
export function normalizeThemePackId(raw: unknown): ThemePackId {
  if (raw === 'light' || raw === 'captivate' || raw === 'black') {
    return raw
  }
  // Pre-Captivate-pack id: "dark" was the mid-grey Captivate default.
  if (raw === 'dark') {
    return 'captivate'
  }
  return DEFAULT_APP_SETTINGS.themePackId
}

function normalizeCustomTheme(raw: unknown): CustomThemeState | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'object') return null
  const source = raw as Partial<CustomThemeState>
  const parsed = parseCaptivateThemeFile(source.document)
  if (!parsed.ok) return null
  const path =
    typeof source.path === 'string' && source.path.trim().length > 0
      ? source.path.trim()
      : null
  return { path, document: parsed.document }
}

export const BUILTIN_LANGUAGE_PACKS: LanguagePackOption[] = [
  {
    id: 'en',
    label: 'English',
    description: 'Built-in UI strings.',
    available: true,
  },
]

export function normalizeAppSettings(raw: unknown): AppSettings {
  const base = { ...DEFAULT_APP_SETTINGS }
  if (raw === null || typeof raw !== 'object') {
    return base
  }
  const source = raw as Partial<AppSettings>
  base.themePackId = normalizeThemePackId(source.themePackId)
  if (source.languagePackId === 'en') {
    base.languagePackId = source.languagePackId
  }
  if (typeof source.autosaveEnabled === 'boolean') {
    base.autosaveEnabled = source.autosaveEnabled
  }
  if (
    typeof source.lastProjectFilePath === 'string' &&
    source.lastProjectFilePath.length > 0
  ) {
    base.lastProjectFilePath = source.lastProjectFilePath
  } else if (source.lastProjectFilePath === null) {
    base.lastProjectFilePath = null
  }
  if (
    typeof source.lastFixtureLibraryFilePath === 'string' &&
    source.lastFixtureLibraryFilePath.length > 0
  ) {
    base.lastFixtureLibraryFilePath = source.lastFixtureLibraryFilePath
  } else if (source.lastFixtureLibraryFilePath === null) {
    base.lastFixtureLibraryFilePath = null
  }
  if (typeof source.firstRunTutorialCompleted === 'boolean') {
    base.firstRunTutorialCompleted = source.firstRunTutorialCompleted
  }
  base.customTheme = normalizeCustomTheme(source.customTheme)
  if (typeof source.useCustomTheme === 'boolean') {
    base.useCustomTheme = source.useCustomTheme && base.customTheme !== null
  }
  return base
}

/** True when settings say to apply a loaded custom theme document. */
export function isCustomThemeActive(settings: AppSettings): boolean {
  return settings.useCustomTheme === true && settings.customTheme !== null
}
