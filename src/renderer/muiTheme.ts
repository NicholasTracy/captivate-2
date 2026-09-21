import { createTheme, type Theme } from '@mui/material/styles'
import { APP_TOOLTIP_SX } from './base/appTooltip'
import { overlayZIndex } from './zIndexes'
import type { ThemePackId } from '../shared/appSettings'
import type { ThemeMuiOverrides } from '../shared/themeFile'
import { resolveThemePack, type Theme_t } from './theme'

const sharedZIndex = {
  modal: overlayZIndex.muiDialog,
  snackbar: overlayZIndex.muiDialog + 1,
  tooltip: overlayZIndex.tooltip,
}

const sharedComponents = {
  MuiPopover: {
    styleOverrides: {
      root: {
        zIndex: overlayZIndex.muiMenu,
      },
    },
  },
  MuiTooltip: {
    defaultProps: {
      enterDelay: 400,
      placement: 'top' as const,
    },
    styleOverrides: {
      tooltip: {
        ...APP_TOOLTIP_SX,
      },
    },
  },
}

function inputOverrides(theme: Theme_t, mui: ThemeMuiOverrides | null) {
  const isLight = theme.mode === 'light'
  const text = theme.colors.text.primary
  const placeholder =
    mui?.placeholder ??
    (isLight ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.45)')
  const outline = mui?.outline ?? theme.colors.divider
  const fieldBg =
    mui?.fieldBg ?? (isLight ? '#ffffff' : theme.colors.bg.darker)
  const disabledBg = isLight ? '#f0f0f0' : theme.colors.bg.primary
  const disabledText = isLight
    ? 'rgba(0, 0, 0, 0.38)'
    : 'rgba(255, 255, 255, 0.38)'
  const label =
    mui?.label ??
    (isLight ? 'rgba(0, 0, 0, 0.68)' : 'rgba(255, 255, 255, 0.7)')
  const filledHover = isLight ? '#f5f5f5' : theme.colors.bg.panel

  return {
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: fieldBg,
        },
        input: {
          color: text,
          '&::placeholder': {
            color: placeholder,
            opacity: 1,
          },
        },
        notchedOutline: {
          borderColor: outline,
          '& legend': {
            maxWidth: '100%',
          },
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          '&.Mui-disabled': {
            backgroundColor: disabledBg,
          },
        },
        input: {
          '&.Mui-disabled': {
            color: disabledText,
            WebkitTextFillColor: disabledText,
          },
        },
      },
    },
    MuiFilledInput: {
      styleOverrides: {
        root: {
          backgroundColor: fieldBg,
          '&:hover': {
            backgroundColor: filledHover,
          },
          '&.Mui-focused': {
            backgroundColor: fieldBg,
          },
        },
        input: {
          color: text,
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: label,
          '&.MuiInputLabel-shrink': {
            backgroundColor: fieldBg,
            paddingInline: '0.28rem',
            marginInline: '-0.14rem',
          },
        },
      },
    },
  }
}

function iconOverrides(theme: Theme_t) {
  const isLight = theme.mode === 'light'
  const primary = theme.colors.icon.primary
  const secondary = theme.colors.icon.secondary

  return {
    MuiButton: {
      styleOverrides: {
        root: {
          color: theme.colors.button.text,
        },
        text: {
          color: theme.colors.button.text,
        },
        outlined: {
          color: theme.colors.button.text,
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: primary,
          '&:hover': {
            color: isLight
              ? 'rgba(0, 0, 0, 0.92)'
              : 'rgba(255, 255, 255, 0.98)',
          },
          '&.Mui-disabled': {
            color: isLight
              ? 'rgba(0, 0, 0, 0.32)'
              : 'rgba(255, 255, 255, 0.38)',
          },
        },
      },
    },
    MuiSvgIcon: {
      styleOverrides: {
        root: {
          color: secondary,
        },
      },
    },
    MuiFormControlLabel: {
      styleOverrides: {
        label: {
          color: theme.colors.text.secondary,
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          color: isLight ? '#757575' : '#bdbdbd',
        },
        track: {
          backgroundColor: isLight ? '#9e9e9e' : '#616161',
        },
      },
    },
  }
}

function paletteFromTheme(theme: Theme_t, mui: ThemeMuiOverrides | null) {
  const isLight = theme.mode === 'light'
  return {
    mode: theme.mode,
    primary: {
      main: theme.colors.accent,
      contrastText: isLight ? '#ffffff' : theme.colors.bg.primary,
    },
    secondary: {
      main: theme.colors.text.secondary,
    },
    background: {
      default: mui?.default ?? theme.colors.bg.primary,
      paper: mui?.paper ?? theme.colors.bg.lighter,
    },
    text: {
      primary: theme.colors.text.primary,
      secondary: theme.colors.text.secondary,
      disabled: isLight
        ? 'rgba(0, 0, 0, 0.38)'
        : 'rgba(255, 255, 255, 0.38)',
    },
    action: {
      active: theme.colors.icon.primary,
      hover: isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.08)',
      selected: theme.colors.accentMuted,
      disabled: isLight
        ? 'rgba(0, 0, 0, 0.26)'
        : 'rgba(255, 255, 255, 0.3)',
    },
    divider: theme.colors.divider,
    error: {
      main: theme.colors.text.error,
    },
    warning: {
      main: theme.colors.text.warning,
    },
  }
}

/** Build MUI theme from a resolved Captivate `Theme_t` (+ optional file overrides). */
export function createMuiThemeFromResolved(
  theme: Theme_t,
  mui: ThemeMuiOverrides | null = null
): Theme {
  return createTheme({
    palette: paletteFromTheme(theme, mui),
    zIndex: sharedZIndex,
    components: {
      ...sharedComponents,
      ...inputOverrides(theme, mui),
      ...iconOverrides(theme),
    },
  })
}

/** @deprecated Prefer {@link createMuiThemeFromResolved} with `resolveActiveTheme`. */
export function createMuiTheme(themePackId: ThemePackId): Theme {
  return createMuiThemeFromResolved(resolveThemePack(themePackId), null)
}

/** Default Captivate MUI theme (remote entry and legacy imports). */
export const muiTheme = createMuiTheme('captivate')
