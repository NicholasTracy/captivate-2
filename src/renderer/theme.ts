// import original module declarations
import 'styled-components'
import {
  isCustomThemeActive,
  type AppSettings,
  type ThemePackId,
} from '../shared/appSettings'
import {
  mergeThemeColors,
  mergeThemeElevation,
  type CaptivateThemeDocument,
} from '../shared/themeFile'

/** @deprecated Prefer ThemePackId — kept for older call sites. */
export type ThemeType = 'light' | 'dark'

/** White theme — light greys, dark text. */
export function light() {
  return {
    mode: 'light' as 'light' | 'dark',
    colors: {
      bg: {
        primary: '#eee',
        darker: '#d8d8d8',
        lighter: '#fff',
        panel: '#f2f2f2',
        raised: '#fafafa',
      },
      divider: '#6a6a6a',
      /** Focus / selection accent (cool slate on light). */
      accent: '#3a5f9e',
      accentMuted: 'rgba(58, 95, 158, 0.22)',
      text: {
        primary: '#141414',
        secondary: '#2e2e2e',
        error: '#8b1a1a',
        warning: '#7a5a00',
      },
      icon: {
        primary: 'rgba(0, 0, 0, 0.84)',
        secondary: 'rgba(0, 0, 0, 0.72)',
      },
      button: {
        text: '#141414',
        textMuted: '#262626',
        icon: 'rgba(0, 0, 0, 0.82)',
      },
    },
    font: {
      size: {
        h1: '1.4rem',
      },
    },
    spacing: (units: Number) => `${units}rem`,
    elevation: {
      shadowSm: '0 1px 2px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.12)',
      shadowMd: '0 6px 18px rgba(0, 0, 0, 0.22), 0 2px 6px rgba(0, 0, 0, 0.14)',
      shadowSidebar: '4px 0 20px rgba(0, 0, 0, 0.16)',
      insetHighlight:
        'inset 0 1px 0 rgba(255, 255, 255, 0.9), inset 0 -1px 0 rgba(0, 0, 0, 0.06)',
      insetDepth: 'inset 0 2px 6px rgba(0, 0, 0, 0.14)',
    },
  }
}

export type Theme_t = ReturnType<typeof light>

/** Captivate 2 default — mid greys with light text. */
export function captivate(): Theme_t {
  return {
    ...light(),
    mode: 'dark',
    colors: {
      bg: {
        primary: 'hsl(0, 0%, 12%)',
        darker: 'hsl(0, 0%, 8%)',
        lighter: 'hsl(0, 0%, 17%)',
        panel: 'hsl(0, 0%, 20%)',
        raised: 'hsl(0, 0%, 23%)',
      },
      divider: '#555',
      accent: '#7ba4ff',
      accentMuted: 'rgba(123, 164, 255, 0.22)',
      text: {
        primary: '#f2f2f2',
        secondary: '#d2d2d2',
        error: '#f88',
        warning: '#ff8',
      },
      icon: {
        primary: 'rgba(255, 255, 255, 0.94)',
        secondary: 'rgba(255, 255, 255, 0.84)',
      },
      button: {
        text: 'rgba(255, 255, 255, 0.94)',
        textMuted: 'rgba(255, 255, 255, 0.86)',
        icon: 'rgba(255, 255, 255, 0.9)',
      },
    },
    elevation: {
      shadowSm: '0 1px 2px rgba(0, 0, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.35)',
      shadowMd: '0 5px 16px rgba(0, 0, 0, 0.55), 0 2px 4px rgba(0, 0, 0, 0.4)',
      shadowSidebar: '4px 0 20px rgba(0, 0, 0, 0.5)',
      insetHighlight: 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      insetDepth: 'inset 0 2px 8px rgba(0, 0, 0, 0.45)',
    },
  }
}

/**
 * Dark theme — near-black cool charcoal with bright white accents.
 * Surfaces stay very dark; contrast comes from white hairlines, brighter
 * secondary text hierarchy, and clear raised steps.
 */
export function black(): Theme_t {
  return {
    ...light(),
    mode: 'dark',
    colors: {
      bg: {
        // Cool near-black stack — enough step between layers to read depth
        primary: 'hsl(220, 12%, 5%)',
        darker: 'hsl(220, 14%, 2%)',
        lighter: 'hsl(220, 10%, 9%)',
        panel: 'hsl(220, 9%, 11%)',
        raised: 'hsl(220, 8%, 15%)',
      },
      // Bright white edge accents against pure black
      divider: 'rgba(255, 255, 255, 0.34)',
      accent: '#f2f5fb',
      accentMuted: 'rgba(242, 245, 251, 0.16)',
      text: {
        primary: '#ffffff',
        secondary: 'rgba(255, 255, 255, 0.7)',
        error: '#ff9a9a',
        warning: '#ffe29a',
      },
      icon: {
        primary: '#ffffff',
        secondary: 'rgba(255, 255, 255, 0.72)',
      },
      button: {
        text: '#ffffff',
        textMuted: 'rgba(255, 255, 255, 0.78)',
        icon: '#ffffff',
      },
    },
    elevation: {
      // Soft black depth + thin white rim so cards lift off the void
      shadowSm:
        '0 0 0 1px rgba(255, 255, 255, 0.08), 0 2px 6px rgba(0, 0, 0, 0.75)',
      shadowMd:
        '0 0 0 1px rgba(255, 255, 255, 0.1), 0 8px 24px rgba(0, 0, 0, 0.85), 0 2px 6px rgba(0, 0, 0, 0.6)',
      shadowSidebar:
        '1px 0 0 rgba(255, 255, 255, 0.1), 6px 0 28px rgba(0, 0, 0, 0.8)',
      insetHighlight:
        'inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 rgba(0, 0, 0, 0.55)',
      insetDepth: 'inset 0 2px 12px rgba(0, 0, 0, 0.75)',
    },
  }
}

/** @deprecated Use {@link captivate} — legacy name for the Captivate 2 default pack. */
export function dark(): Theme_t {
  return captivate()
}

export function resolveThemePack(themePackId: ThemePackId): Theme_t {
  switch (themePackId) {
    case 'light':
      return light()
    case 'black':
      return black()
    case 'captivate':
    default:
      return captivate()
  }
}

/**
 * Apply a custom theme document onto its `extends` base pack.
 * Spacing stays a runtime function from the base (not serializable).
 */
export function applyThemeDocument(document: CaptivateThemeDocument): Theme_t {
  const baseId = document.extends ?? 'captivate'
  const base = resolveThemePack(baseId)
  const colors = mergeThemeColors(base.colors, document.colors)
  const elevation = mergeThemeElevation(base.elevation, document.elevation)
  const font =
    document.font?.size?.h1 !== undefined
      ? {
          size: {
            h1: document.font.size.h1,
          },
        }
      : base.font

  return {
    ...base,
    mode: document.mode ?? base.mode,
    colors,
    elevation,
    font,
  }
}

/** Resolve the active styled-components theme from app settings. */
export function resolveActiveTheme(settings: AppSettings): Theme_t {
  if (isCustomThemeActive(settings) && settings.customTheme) {
    return applyThemeDocument(settings.customTheme.document)
  }
  return resolveThemePack(settings.themePackId)
}

/** MUI overrides carried by the active custom theme, if any. */
export function activeThemeMuiOverrides(settings: AppSettings) {
  if (isCustomThemeActive(settings) && settings.customTheme) {
    return settings.customTheme.document.mui ?? null
  }
  return null
}

declare module 'styled-components' {
  export interface DefaultTheme extends Theme_t {}
}
