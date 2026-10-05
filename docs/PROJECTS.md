# Project files and autosave

Captivate projects are file-based workspaces. Use them when a show should move
between computers, survive app restarts, or be kept with other production files.

## File pair

A project is saved as a `.cap` file. Captivate also writes a paired fixture
library file next to it with the same name and the `.cfx` extension:

```text
My Show/
  main-room.cap
  main-room.cfx
```

Keep the two files together when copying or backing up a show. The `.cap` file
contains the project state; the `.cfx` file is the adjacent fixture database that
Captivate writes and can merge when the project is loaded.

Legacy `.captivate` project files and `.captivate-fixtures` fixture databases can
still be opened. The next save normalizes project paths to `.cap` and fixture
database paths to `.cfx`; the content migration is the extension and save
location, not a different project model.

## Create, save, and load

### New Project

Use **File > New Project** to start a file-backed workspace.

1. Choose **Empty Project** or **Default Scenes**.
2. Pick a folder and project name.
3. Captivate writes both the `.cap` and matching `.cfx` files.

The dialog warns that unsaved work in the current project will be lost before the
new state is written.

### Save Project

**File > Save Project** writes the active project path. **Save Project As...**
chooses a new path. Manual project saves are full saves: Captivate writes every
project section that it knows how to persist, then writes the paired fixture
database.

### Load Project

**File > Load Project...** reads a `.cap` or legacy `.captivate` file, then shows
checkboxes for the sections found in that file. Leave a section checked to apply
it, or uncheck it to keep the current in-memory state for that section.

After applying the selected sections, Captivate also looks for the sibling `.cfx`
file and merges fixture definitions from it if the file exists.

## What is saved

Project files use the `captivate.project` schema. Current saves include these
sections:

| Section | Contents |
|---------|----------|
| DMX Settings | Universes, patched fixtures, fixture types, and DMX editor state. |
| Light Scenes | Light scenes, splits, auto-scene settings, modulation mappings, and scene parameters. |
| Visual Scenes | Visual scene state and visual parameters. |
| Visualizer Streaming Defaults | Streaming output defaults such as FFmpeg / NDI runtime settings when available. |
| Serial Device Settings (MIDI & DMX) | MIDI/DMX connection state, audio input settings (including Advanced Music Energy), MIDI learn maps (`buttonActions` / `sliderActions`), keyboard shortcuts, and MIDI clock / Link flags. |
| App UI Settings | A profile subset: active page, blackout, LED/video toggles, depth view, and LED sidebar visibility. |
| DMX Mixer State | Mixer values and related live mixer state. |
| Laser Engine | Laser fixtures, zones, scenes, and laser project state. |

The paired `.cfx` file contains serialized fixture definitions from the current
fixture library.

## What is not restored from a project

Some data is application preference or runtime state instead of project content:

- Theme, language, autosave preference, last project path, last fixture path,
  and `firstRunTutorialCompleted` are app settings (`app-data/app-settings.json`).
  Cancelling quit or closing a detached window turns the live tour off for this
  session only; it does not mark the first-run prompt finished.
- Recent Projects is stored by the desktop app under user data, not inside the
  `.cap` file.
- Transient UI state such as open dialogs, status messages, and temporary
  calibration overrides is cleared during load.
- The short-lived BPM tap hint used by audio beat detection is cleared when
  device state is normalized on load. MIDI/keyboard **bindings** are kept with
  device settings; learn-mode overlay flags are also on that object and are not
  stripped (see troubleshooting).

## Autosave and recovery

Captivate has two persistence paths:

1. **Project file autosave** writes the active `.cap` and `.cfx` files every 15
   seconds when **File > Autosave** is enabled and a project path is set. It skips
   the disk write if the Redux state snapshot has not changed.
2. **Session recovery** stores local autosave snapshots when there is no project
   path or project file autosave is disabled. This is a fallback for the current
   computer, not a portable project file.

Autosave is enabled by default as an app preference. It starts writing project
files after you create, save, or load a project path. Closing the main window
can flush the project first; macOS **Quit** does not. See [Closing the app](#closing-the-app).

## Closing the app

Closing the app stops lighting and video output. The window-close path asks
first. macOS Quit does not.

### Main window close

Closing the main window (title-bar close, or Alt+F4 where the OS sends a window
close) is intercepted. The renderer shows **Are you sure?** with **Stop!** and
**Dont Stop**. The message is “Closing the app will stop all lighting and video
output.”

**Dont Stop** leaves the show running. No project file is written on that path.

**Stop!** shows a blocking **Closing Captivate** overlay and waits up to **4
seconds** (`flushAutoSaveForQuit`):

| Workspace | What the flush does |
|-----------|---------------------|
| No project path | Writes the local session snapshot only (“Finishing up…”). |
| Project path set | Full-save the `.cap` and sibling `.cfx` (“Saving project before exit…”), then the session snapshot. The 15-second autosave timer is stopped first. |

When that flush returns ok, the main process tears the app down (below). You
are not asked to confirm a second time.

If a periodic autosave write is still running, the quit flush waits up to **3
seconds** for it to finish. If it is still in flight after that, the quit path
does not start a second project write and still reports ok after the session
snapshot. **Save did not finish** is only for a timeout of the whole flush (4
seconds) or a thrown write error.

If the flush times out or throws, a second critical dialog appears: **Save did
not finish**.

- With a project file, the choices are **Quit Without Saving** and **Save and
  Quit**.
- With no project file, they are **Quit Without Saving** and **Save As and
  Quit**.
- **Save and Quit** writes the current path. **Save As and Quit** opens the
  save dialog. Cancelling that dialog still quits; `saveProject` returns
  without throwing.
- If the manual save throws, **Save Failed** offers **Quit Without Saving** or
  one retry. After that dialog, including a failed retry, quit continues.

These dialogs do not dismiss on a backdrop click. A second close event while
the prompt is already open is ignored.

### macOS Quit (Command+Q)

**Captivate 2 → Quit** calls main-process teardown directly. It does not show
**Are you sure?** and does not run the renderer project flush. Edits newer than
the last autosave (15 seconds, when enabled) or session snapshot can be lost.
Windows and Linux have no Quit item; exit is the main-window close path above.

### Detached windows

Closing a detached page asks **Close Window?** (**Close** / **Dont close**).
The message is “Closing this window will not close the main window.” Confirm
does not save the project and does not quit. If the close still fails, an alert
says “Unable to close this window from the modal action.” Once app teardown has
started, detached windows close without this prompt.

### Tour and click targets

Quit and detached-close confirms are `critical` dialogs (z-index **19995**),
above the interactive-tour coach (**19990**). Opening either prompt also sets
`interactiveTourActive` to false, and the coach unmounts while a critical
dialog is open. **Dont Stop** or **Dont close** does not resume the tour.
Restart it from **Help → Interactive Tutorial**.

### Main-process teardown

After a confirmed window-close flush, or immediately on macOS Quit:

1. `isClosing` is set first so later `close` handlers do not prompt again.
2. A dirty default fixture library save is raced against **800 ms**.
3. Main and visualizer window placement is flushed.
4. Laser DAC disconnect is raced against **2 seconds** (the disconnect call
   itself is capped at **1.5 seconds**). This is a disconnect, not a per-backend
   `stopOutput`.
5. The engine is stopped, the main window is closed, and `destroy()` runs if
   `close()` is still blocked. Then `app.quit()`.

`will-quit` flushes window layout again and stops the engine. It does not write
the `.cap` file.

## Recent projects

The File menu keeps up to 12 recent project paths. Each entry shows the file name
and the time it was recorded. Missing files are pruned when the menu reads the
list, and **Clear Recent Projects** removes the stored list.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Autosave is not creating `.cap` / `.cfx` files | Confirm the project has been created or saved to disk, then confirm **File > Autosave** is checked. Unsaved sessions only use local recovery. |
| A copied project is missing custom fixture definitions | Copy the sibling `.cfx` file with the `.cap`, or use **Load Fixture Database...** to merge a saved fixture database. |
| Loading a project changes only part of the show | Reopen the load dialog and verify the section checkboxes. Unchecked sections are intentionally left unchanged. |
| Green MIDI/keyboard overlays appear after load | Learn-mode flags are saved with Serial Device Settings. Exit mapping (**Esc**) and save again, or uncheck that section on load. Bindings: [MIDI and keyboard mapping](midi-mapping.md). |
| A legacy save reports an incompatible format | Start a new project and import the fixture database when prompted. Modern supported project files use the `captivate.project` schema. |
| Command+Q dropped the last few edits | macOS Quit skips the pre-exit project flush. Use **File > Save Project**, or close the main window and choose **Stop!** so the 4-second flush runs. |
| **Save did not finish** on exit | The project write exceeded 4 seconds or threw. **Save and Quit** retries once through the normal save path. **Quit Without Saving** exits with the last successful write. |
| Cancelling **Save As and Quit** still exited | A cancelled save dialog returns without an error, and quit continues. Save to a path first if the show must be kept. |
| Quit confirm sat under the tutorial coach | Fixed in 1.2.1: the confirm is a critical dialog and the tour is suspended while it is open. |

## Implementation map

- File extensions and sibling path rules: `src/shared/projectFiles.ts`
- Project save schema and section labels: `src/shared/save.ts`
- Project write pipeline: `src/renderer/project/projectFileWriter.ts`
- Load dialog and selective apply: `src/renderer/menu/ProjectSaveLoadDialogs.tsx`
- Menu actions and fixture DB merge: `src/renderer/menu/projectSaveLoadActions.ts`
- File autosave and session recovery: `src/renderer/autosave.ts`
  (`FILE_AUTOSAVE_INTERVAL_MS` 15000, `QUIT_FLUSH_TIMEOUT_MS` 4000,
  `flushAutoSaveForQuit`, `writeWorkspaceFilesSilent`)
- Window-close prompt and stalled-save choices: `src/renderer/index.tsx`
  (`on_app_close_prompt`, `on_detached_window_close_prompt`)
- Critical dialog stack: `src/renderer/zIndexes.ts`, `src/renderer/overlays/FullscreenOverlay.tsx`
- Main-process teardown: `requestMainWindowQuit` in `src/main/main.ts`
  (macOS Quit in `src/main/menu.ts` calls this directly)
- Recent Projects storage: `src/main/recentProjectsStorage.ts`
