import styled from 'styled-components'
import { applyRandomization } from 'shared/randomizer'
import { EnvelopeBarHost } from './EnvelopeModuleLayout'

interface Props {
  levels: number[]
  mix: number
}

const gapRatio = 0.45

/**
 * Shared fixture-slot level bars for Randomizer and Chase modules.
 */
export default function SlotBarVisualizer({ levels, mix }: Props) {
  const divsAndGaps =
    levels.length === 0 ? (
      <Gap />
    ) : (
      Array(levels.length * 2 - 1)
        .fill(0)
        .map((_v, i) => {
          if (i % 2 === 0) {
            const level = levels[i / 2] ?? 0
            const gated = applyRandomization(1, level, mix)
            return (
              <Bar
                key={i}
                style={{
                  backgroundColor: `hsl(0, 0%, ${gated * 100}%)`,
                }}
              />
            )
          }
          return <Gap key={i} />
        })
    )

  return (
    <EnvelopeBarHost>
      <Track>{divsAndGaps}</Track>
    </EnvelopeBarHost>
  )
}

const Track = styled.div`
  display: flex;
  height: 100%;
  width: 100%;
`

const Bar = styled.div`
  flex: 1 0 0;
  min-width: 2px;
  background-color: #555;
  border-radius: 1px;
`

const Gap = styled.div`
  flex: ${gapRatio} 0 0;
  max-width: 0.35rem;
`
