import { useMemo } from 'react'
import { ThemeProvider } from 'styled-components'
import { ThemeProvider as MuiThemeProvider } from '@emotion/react'
import { useTypedSelector } from './redux/store'
import {
  activeThemeMuiOverrides,
  resolveActiveTheme,
} from './theme'
import { createMuiThemeFromResolved } from './muiTheme'

type Props = {
  children: React.ReactNode
}

export default function AppThemeShell({ children }: Props) {
  const appSettings = useTypedSelector((state) => state.gui.appSettings)
  const theme = useMemo(
    () => resolveActiveTheme(appSettings),
    [appSettings]
  )
  const muiTheme = useMemo(
    () =>
      createMuiThemeFromResolved(theme, activeThemeMuiOverrides(appSettings)),
    [theme, appSettings]
  )

  return (
    <ThemeProvider theme={theme}>
      <MuiThemeProvider theme={muiTheme}>{children}</MuiThemeProvider>
    </ThemeProvider>
  )
}
