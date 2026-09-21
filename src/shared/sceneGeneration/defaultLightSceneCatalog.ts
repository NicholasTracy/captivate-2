/** Stable ids/names for default-save light scenes (core ladder + mover showcases). */
export interface DefaultLightSceneCatalogEntry {
  id: string
  name: string
}

/**
 * One entry per epicness-ladder tier, in generation order.
 * Names must match the deterministic recipes in `recipeForLadderIndex`.
 *
 * Cue-list shape: open washes → groove → build/motion → peak.
 */
export const DEFAULT_LIGHT_SCENE_CORE_CATALOG: DefaultLightSceneCatalogEntry[] = [
  { id: 'ex_cool_wash', name: 'Cool Stage Wash' },
  { id: 'ex_warm_wash', name: 'Warm Stage Wash' },
  { id: 'ex_dim_wash', name: 'Soft Dim Wash' },
  { id: 'ex_ambient_glow', name: 'Ambient Glow' },
  { id: 'ex_soft_color_drift', name: 'Soft Color Drift' },
  { id: 'ex_soft_position_drift', name: 'Soft Position Drift' },
  { id: 'ex_beat_pulse', name: 'On-Beat Pulse' },
  { id: 'ex_offbeat_pulse', name: 'Offbeat Pulse' },
  { id: 'ex_half_time_gate', name: 'Half-Time Gate' },
  { id: 'ex_kick_band', name: 'Kick Accent' },
  { id: 'ex_snare_pop', name: 'Snare Accent' },
  { id: 'ex_hat_sparkle', name: 'Hi-Hat Shimmer' },
  { id: 'ex_vocal_glow', name: 'Vocal Wash' },
  { id: 'ex_energy_swell', name: 'Energy Swell' },
  { id: 'ex_build_ramp', name: 'Build Ramp' },
  { id: 'ex_traveling_bar', name: 'Traveling Bar L→R' },
  { id: 'ex_position_sweep', name: 'Position Sweep L→R' },
  { id: 'ex_bass_drop', name: 'Bass Drop' },
  { id: 'ex_expanding_iris', name: 'Expanding Iris' },
  { id: 'ex_call_response', name: 'Call & Response' },
  { id: 'ex_wigwag_halves', name: 'Wig-Wag Halves' },
  { id: 'ex_spectrum_zones', name: 'Zone Wash' },
  { id: 'ex_traveling_bar_y', name: 'Traveling Bar T→B' },
  { id: 'ex_noise_journey', name: 'Color Journey' },
  { id: 'ex_dual_pulse', name: 'Dual Side Pulse' },
  { id: 'ex_random_spark', name: 'Random Spark Hits' },
  { id: 'ex_strobe_color', name: 'Strobe Gate' },
  { id: 'ex_peak_drive', name: 'Peak Drive' },
  { id: 'ex_open_peak', name: 'Open Peak' },
  { id: 'ex_main_peak', name: 'Peak Drive' },
  { id: 'ex_finale_peak', name: 'Open Peak' },
]

/** One entry per mover showcase, in {@link MOVER_SHOWCASES} generation order. */
export const DEFAULT_LIGHT_SCENE_MOVER_CATALOG: DefaultLightSceneCatalogEntry[] = [
  { id: 'ex_mover_sweep', name: 'Mover Floor Sweep' },
  { id: 'ex_mover_tandem', name: 'Mover Tandem Sweep' },
  { id: 'ex_mover_beat_tilt', name: 'Mover Beat Tilt Sweep' },
  { id: 'ex_mover_pan_cascade', name: 'Mover Pan Cascade' },
  { id: 'ex_mover_mirror', name: 'Mover Mirror Split' },
  { id: 'ex_mover_peak', name: 'Mover Peak Drive' },
]
