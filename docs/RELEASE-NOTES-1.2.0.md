## What's new in Captivate 2 1.2.0

This release adds group intensity, custom themes, chase, and a scene-generation wizard, and keeps split beat effects locked to each split’s phase offset.

### Show control

- **Group intensity** — Per-group brightness ceilings under Master. Fixtures in several groups use the lowest value. Each slider is MIDI-assignable.
- **Chase** — Step through fixture slots in time with the split.
- **Phase offset** — Randomizer, chase, LFOs (including audio), and strobe follow the split’s beat offset.
- **Mover groups** — Optional group kinematics for movers.

### Themes & UI

- **Themes** — White, Captivate, and Black, plus custom `.cth` theme files you can load from Settings. See [docs/themes.md](https://github.com/NicholasTracy/captivate-2/blob/Main/docs/themes.md).
- **Position pad** — Size with a secondary drag; Feather stays. Width and Height sliders are gone.
- **Mixer** — Status labels no longer paint over the channel pillows.

### Fixtures & scenes

- **Scene generation wizard** — Generate light scenes from the current rig, with options to merge into the project.
- **Smart fixture groupings** — Suggest groups from the patched universe.
- **First-run tutorial** — Guided tour for a new project.

### Fixes

- Master channel assignment stays correct when the fixture map changes.
- Closing a detached preview window no longer crashes the app.

### Installing

Download the installer for your operating system below. You can install over Captivate 2 1.1.3; projects and settings are kept.

#### macOS install

Captivate 2 is not Apple-notarized. Download the **architecture-specific** DMG:

- **Apple Silicon (M1–M4):** `Captivate.2-1.2.0-arm64.dmg`
- **Intel Mac:** `Captivate.2-1.2.0-x64.dmg`

Check **About This Mac** → **Chip** (Apple M…) vs **Processor** (Intel). Do not use a generic `.dmg` without `-arm64` or `-x64` if both are listed.

First launch: drag to **Applications**, then **right-click → Open** and confirm. Full steps: [docs/MACOS-INSTALL.md](https://github.com/NicholasTracy/captivate-2/blob/Main/docs/MACOS-INSTALL.md).
