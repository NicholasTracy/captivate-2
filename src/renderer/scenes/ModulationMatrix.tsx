import {
  useActiveLightScene,
  useControlSelector,
  useDmxSelector,
  useTypedSelector,
} from 'renderer/redux/store'
import styled from 'styled-components'
import ModulationSlider, { AddModulationButton } from './ModulationSlider'
import {
  activeInterModParamKeys,
  activeSplitModulationEntries,
} from '../../shared/modulation'
import { universeHasMovers } from 'shared/dmxFixtures'
import {
  hideMoversSplitUi,
  hideVisSplitUi,
} from './splitUiVisibility'

export default function ModulationMatrix({ index }: { index: number }) {
  const activeSceneId = useControlSelector((control) => control.light.active)
  return (
    <div>
      <SplitSceneModulationMatrix
        key={activeSceneId}
        modIndex={index}
      />
      <AddModulationButton modIndex={index} />
    </div>
  )
}

function SplitSceneModulationMatrix({ modIndex }: { modIndex: number }) {
  const videoEnabled = useTypedSelector((state) => state.gui.videoEnabled)
  const hasMoverFixtures = useDmxSelector((dmx) =>
    universeHasMovers(dmx.universe, dmx.fixtureTypesByID)
  )

  const splitEntries = useActiveLightScene((scene) => {
    const modulator = scene.modulators[modIndex]
    return activeSplitModulationEntries(modulator, scene.splitScenes.length, {
      shouldIncludeSplit: (splitIndex) => {
        const groups = scene.splitScenes[splitIndex]?.groups
        if (hideVisSplitUi(videoEnabled, groups)) {
          return false
        }
        if (hideMoversSplitUi(hasMoverFixtures, groups)) {
          return false
        }
        return true
      },
    })
  })

  const interModKeys = useActiveLightScene((scene) =>
    activeInterModParamKeys(scene.modulators[modIndex]?.lfoInterModulation)
  )

  return (
    <SplitRoot>
      {splitEntries.map(({ splitIndex, param }) => (
        <ModulationSlider
          splitIndex={splitIndex}
          key={`${splitIndex}:${param}:mod${modIndex}`}
          modIndex={modIndex}
          param={param}
        />
      ))}
      {interModKeys.map((paramKey) => (
        <ModulationSlider
          splitIndex={0}
          key={`${paramKey}:im:mod${modIndex}`}
          modIndex={modIndex}
          param={paramKey}
        />
      ))}
    </SplitRoot>
  )
}

const SplitRoot = styled.div``
