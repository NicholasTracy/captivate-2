## What's new in Captivate 2 1.2.1

This patch fixes closing the app when the quit dialog or a stalled save blocked exit.

### Fixes

- **Quit confirm** — The Stop! dialog stays above the interactive tutorial coach so Close / Stop always receive clicks.
- **Stalled save on exit** — If saving before quit hangs or fails, Captivate asks you to **Save and Quit** or **Quit Without Saving** instead of exiting silently with unsaved work.
- **Detached windows** — Close Window? uses the same critical dialog stack as app quit.
- **Hardening** — Quit sets closing state earlier and force-destroys the window if a normal close is still blocked.

### Installing

Download the installer for your operating system below. You can install over Captivate 2 1.2.0; projects and settings are kept.

#### macOS install

Captivate 2 is not Apple-notarized. Download the **architecture-specific** DMG:

- **Apple Silicon (M1–M4):** `Captivate.2-1.2.1-arm64.dmg`
- **Intel Mac:** `Captivate.2-1.2.1-x64.dmg`

Check **About This Mac** → **Chip** (Apple M…) vs **Processor** (Intel). Do not use a generic `.dmg` without `-arm64` or `-x64` if both are listed.

First launch: drag to **Applications**, then **right-click → Open** and confirm. Full steps: [docs/MACOS-INSTALL.md](https://github.com/NicholasTracy/captivate-2/blob/Main/docs/MACOS-INSTALL.md).
