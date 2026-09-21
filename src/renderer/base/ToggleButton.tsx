import styled from 'styled-components'
import React from 'react'

interface Props {
  isEnabled: boolean
  onClick: (e: React.MouseEvent) => void
  children: React.ReactNode
  title?: string
}

function childrenText(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return children.toString()
  if (Array.isArray(children)) {
    return children.map((item) => childrenText(item)).join(' ').trim()
  }
  return ''
}

export default function ToggleButton(props: Props) {
  const inferredTitle = props.title ?? childrenText(props.children) ?? 'Toggle'
  return (
    <Root
      type="button"
      enabled={props.isEnabled}
      onClick={props.onClick}
      aria-label={inferredTitle}
      title={inferredTitle}
    >
      {props.children}
    </Root>
  )
}

const Root = styled.button<{ enabled: boolean }>`
  background-color: ${(props) =>
    props.enabled
      ? props.theme.colors.accentMuted
      : props.theme.colors.bg.raised};
  color: ${(props) =>
    props.enabled
      ? props.theme.mode === 'light'
        ? props.theme.colors.accent
        : props.theme.colors.accent
      : props.theme.colors.text.secondary};
  border: 1px solid
    ${(props) =>
      props.enabled ? props.theme.colors.accent : props.theme.colors.divider};
  border-radius: 0.3rem;
  padding: 0rem 0.2rem;
  margin-right: 0.5rem;
  cursor: pointer;
  box-shadow: ${(props) => props.theme.elevation.shadowSm};
  font-weight: ${(props) => (props.enabled ? 700 : 500)};
`