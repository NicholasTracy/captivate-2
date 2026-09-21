import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { useDispatch } from 'react-redux'
import AppModal from './AppModal'
import { useTypedSelector } from '../redux/store'
import { setAppSettings, setSettingsOpen, pushStatusMessage } from '../redux/guiSlice'
import {
  BUILTIN_LANGUAGE_PACKS,
  BUILTIN_THEME_PACKS,
  type AppSettings,
  type LanguagePackId,
  type ThemePackId,
} from '../../shared/appSettings'
import { persistAppSettings } from '../appSettingsClient'
import {
  createThemeTemplate,
  parseCaptivateThemeFile,
  serializeThemeDocument,
  THEME_FILE_FILTERS,
} from '../../shared/themeFile'
import { loadFile, saveFile } from '../project/fileIO'
import { resolveThemePack } from '../theme'

export default function SettingsModal() {
  const dispatch = useDispatch()
  const open = useTypedSelector((state) => state.gui.settingsOpen)
  const stored = useTypedSelector((state) => state.gui.appSettings)
  const [draft, setDraft] = useState<AppSettings>(stored)
  const [themeError, setThemeError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDraft(stored)
      setThemeError(null)
    }
  }, [open, stored])

  if (!open) {
    return null
  }

  const customActive =
    draft.useCustomTheme && draft.customTheme !== null
  const customName = draft.customTheme?.document.name
  const customPath = draft.customTheme?.path

  async function onSave() {
    const next = await persistAppSettings(draft)
    dispatch(setAppSettings(next))
    dispatch(setSettingsOpen(false))
  }

  async function onLoadThemeFile() {
    setThemeError(null)
    const loaded = await loadFile('Load Captivate theme', THEME_FILE_FILTERS)
    if (loaded === null) return
    const parsed = parseCaptivateThemeFile(loaded.content)
    if (!parsed.ok) {
      setThemeError(parsed.error)
      return
    }
    setDraft((current) => ({
      ...current,
      useCustomTheme: true,
      customTheme: {
        path: loaded.filePath,
        document: parsed.document,
      },
      // Keep built-in id aligned with the theme’s base for fallbacks.
      themePackId: parsed.document.extends ?? current.themePackId,
    }))
    dispatch(
      pushStatusMessage({
        level: 'info',
        message: `Loaded theme “${parsed.document.name}”`,
      })
    )
  }

  async function onExportStarterTheme() {
    setThemeError(null)
    const baseId = draft.themePackId
    const base = resolveThemePack(baseId)
    const packMeta = BUILTIN_THEME_PACKS.find((pack) => pack.id === baseId)
    const slug = `${baseId}-custom`
    const document = createThemeTemplate({
      id: slug,
      name: `${packMeta?.label ?? 'Custom'} (edit me)`,
      extendsPack: baseId,
      description:
        'Starter theme exported from Captivate. Edit colors, save, then Load in Settings.',
      mode: base.mode,
      colors: {
        bg: { ...base.colors.bg },
        divider: base.colors.divider,
        accent: base.colors.accent,
        accentMuted: base.colors.accentMuted,
        text: { ...base.colors.text },
        icon: { ...base.colors.icon },
        button: { ...base.colors.button },
      },
      elevation: { ...base.elevation },
      mui: {
        fieldBg: base.mode === 'light' ? '#ffffff' : base.colors.bg.darker,
        outline: base.colors.divider,
        paper: base.colors.bg.lighter,
        default: base.colors.bg.primary,
      },
    })
    const path = await saveFile(
      'Export Captivate theme',
      serializeThemeDocument(document),
      THEME_FILE_FILTERS,
      { defaultPath: `${slug}.cth` }
    )
    if (path !== null) {
      dispatch(
        pushStatusMessage({
          level: 'info',
          message: `Exported theme starter to ${path}`,
        })
      )
    }
  }

  function onUseBuiltin() {
    setThemeError(null)
    setDraft((current) => ({
      ...current,
      useCustomTheme: false,
    }))
  }

  function onClearCustomTheme() {
    setThemeError(null)
    setDraft((current) => ({
      ...current,
      useCustomTheme: false,
      customTheme: null,
    }))
  }

  return (
    <AppModal
      open={true}
      title="Settings"
      maxWidth="36rem"
      onClose={() => dispatch(setSettingsOpen(false))}
      actions={[
        {
          label: 'Cancel',
          onClick: () => dispatch(setSettingsOpen(false)),
        },
        {
          label: 'Save',
          onClick: () => {
            void onSave()
          },
        },
      ]}
    >
      <Intro>
        Preferences are saved on this computer. Built-in themes ship with the
        app; you can also load a custom <code>.cth</code> theme file. See{' '}
        <code>docs/themes.md</code> for token names.
      </Intro>

      <Section>
        <SectionTitle>Appearance</SectionTitle>
        <FieldLabel htmlFor="settings-theme-pack">Built-in theme</FieldLabel>
        <Select
          id="settings-theme-pack"
          value={draft.themePackId}
          disabled={customActive}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              themePackId: event.target.value as ThemePackId,
              useCustomTheme: false,
            }))
          }
        >
          {BUILTIN_THEME_PACKS.map((pack) => (
            <option key={pack.id} value={pack.id}>
              {pack.label}
            </option>
          ))}
        </Select>
        <Hint>
          {customActive
            ? `Using custom theme “${customName}”. Switch to a built-in theme below, or clear the custom file.`
            : BUILTIN_THEME_PACKS.find((pack) => pack.id === draft.themePackId)
                ?.description}
        </Hint>

        <CustomBlock>
          <CustomTitle>Custom theme file</CustomTitle>
          {draft.customTheme ? (
            <CustomMeta>
              <strong>{draft.customTheme.document.name}</strong>
              {draft.customTheme.document.description
                ? ` — ${draft.customTheme.document.description}`
                : ''}
              {customPath ? (
                <PathLine title={customPath}>{customPath}</PathLine>
              ) : (
                <PathLine>Loaded without a saved path</PathLine>
              )}
              <StatusLine $active={customActive}>
                {customActive ? 'Active' : 'Loaded (not active)'}
              </StatusLine>
            </CustomMeta>
          ) : (
            <Hint>
              No custom theme loaded. Export a starter from the current built-in
              theme, edit the JSON, then load it here.
            </Hint>
          )}
          {themeError ? <ErrorLine>{themeError}</ErrorLine> : null}
          <ButtonRow>
            <ActionButton type="button" onClick={() => void onLoadThemeFile()}>
              Load theme…
            </ActionButton>
            <ActionButton
              type="button"
              onClick={() => void onExportStarterTheme()}
            >
              Export starter…
            </ActionButton>
            {draft.customTheme && !customActive ? (
              <ActionButton
                type="button"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    useCustomTheme: true,
                  }))
                }
              >
                Use custom
              </ActionButton>
            ) : null}
            {customActive ? (
              <ActionButton type="button" onClick={onUseBuiltin}>
                Use built-in
              </ActionButton>
            ) : null}
            {draft.customTheme ? (
              <ActionButton type="button" onClick={onClearCustomTheme}>
                Clear custom
              </ActionButton>
            ) : null}
          </ButtonRow>
        </CustomBlock>
      </Section>

      <Section>
        <SectionTitle>Language</SectionTitle>
        <FieldLabel htmlFor="settings-language-pack">UI language</FieldLabel>
        <Select
          id="settings-language-pack"
          value={draft.languagePackId}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              languagePackId: event.target.value as LanguagePackId,
            }))
          }
        >
          {BUILTIN_LANGUAGE_PACKS.map((pack) => (
            <option
              key={pack.id}
              value={pack.id}
              disabled={!pack.available}
            >
              {pack.label}
              {!pack.available ? ' (coming soon)' : ''}
            </option>
          ))}
        </Select>
        <Hint>
          {
            BUILTIN_LANGUAGE_PACKS.find(
              (pack) => pack.id === draft.languagePackId
            )?.description
          }{' '}
          Additional language packs will plug in here when available.
        </Hint>
      </Section>
    </AppModal>
  )
}

const Intro = styled.p`
  margin: 0 0 0.85rem;
  font-size: 0.82rem;
  line-height: 1.45;
  color: ${(p) => p.theme.colors.text.secondary};

  code {
    font-size: 0.78rem;
  }
`

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.85rem;
`

const SectionTitle = styled.h3`
  margin: 0;
  font-size: 0.88rem;
  font-weight: 700;
  color: ${(p) => p.theme.colors.text.primary};
`

const FieldLabel = styled.label`
  font-size: 0.78rem;
  color: ${(p) => p.theme.colors.text.secondary};
`

const Select = styled.select`
  width: 100%;
  border: 1px solid ${(p) => p.theme.colors.divider};
  border-radius: 0.3rem;
  background: ${(p) => p.theme.colors.bg.darker};
  color: ${(p) => p.theme.colors.text.primary};
  font-size: 0.82rem;
  padding: 0.35rem 0.45rem;

  &:disabled {
    opacity: 0.55;
  }
`

const Hint = styled.div`
  font-size: 0.74rem;
  line-height: 1.35;
  color: ${(p) => p.theme.colors.text.secondary};
`

const CustomBlock = styled.div`
  margin-top: 0.45rem;
  padding: 0.55rem 0.6rem;
  border: 1px solid ${(p) => p.theme.colors.divider};
  border-radius: 0.35rem;
  background: ${(p) => p.theme.colors.bg.panel};
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
`

const CustomTitle = styled.div`
  font-size: 0.78rem;
  font-weight: 700;
  color: ${(p) => p.theme.colors.text.primary};
`

const CustomMeta = styled.div`
  font-size: 0.74rem;
  line-height: 1.35;
  color: ${(p) => p.theme.colors.text.secondary};
`

const PathLine = styled.div`
  margin-top: 0.2rem;
  font-size: 0.68rem;
  opacity: 0.9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const StatusLine = styled.div<{ $active: boolean }>`
  margin-top: 0.2rem;
  font-size: 0.7rem;
  font-weight: 600;
  color: ${(p) =>
    p.$active ? p.theme.colors.accent : p.theme.colors.text.secondary};
`

const ErrorLine = styled.div`
  font-size: 0.74rem;
  color: ${(p) => p.theme.colors.text.error};
`

const ButtonRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.15rem;
`

const ActionButton = styled.button`
  border: 1px solid ${(p) => p.theme.colors.divider};
  border-radius: 0.28rem;
  background: ${(p) => p.theme.colors.bg.raised};
  color: ${(p) => p.theme.colors.button.text};
  font-size: 0.74rem;
  padding: 0.28rem 0.5rem;
  cursor: pointer;
  box-shadow: ${(p) => p.theme.elevation.shadowSm};

  &:hover {
    border-color: ${(p) => p.theme.colors.accent};
  }
`
