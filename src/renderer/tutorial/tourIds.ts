/** Stable `data-tour` anchors for the interactive first-run tutorial. */
export const TOUR_IDS = {
  navUniverse: 'tour-nav-universe',
  navScenes: 'tour-nav-scenes',
  fixtures: 'tour-fixtures',
  addFixture: 'tour-add-fixture',
  addFixturePopup: 'tour-add-fixture-popup',
  universeMap: 'tour-universe-map',
  smartGroupings: 'tour-smart-groupings',
  connections: 'tour-connections',
  connectionsClose: 'tour-connections-close',
  lightScenes: 'tour-light-scenes',
  addScene: 'tour-add-scene',
  modulators: 'tour-modulators',
  splits: 'tour-splits',
  addParam: 'tour-add-param',
  addParamPopup: 'tour-add-param-popup',
  params: 'tour-params',
  master: 'tour-master',
  blackout: 'tour-blackout',
  transport: 'tour-transport',
  saveLoad: 'tour-save-load',
} as const

export type TourId = (typeof TOUR_IDS)[keyof typeof TOUR_IDS]

export function tourSelector(id: TourId | string): string {
  return `[data-tour="${id}"]`
}
