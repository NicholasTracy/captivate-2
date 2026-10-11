# First-run interactive tutorial

A coach-mark tour of the real Universe and Scenes controls. It explains
fixtures, patching, groups, scenes, and live output. It does not create a
project, patch fixtures, or change DMX output on its own.

## When it appears

On the main window, after app settings have loaded, Captivate waits **600 ms**
and then offers **Take the interactive tour?** if
`firstRunTutorialCompleted` is still false.

The offer waits while another dialog is up: new project, Settings, About,
Connections, the scene-generation wizard, an app dialog, or the loading
overlay. Detached page windows (`?page=`) never show the prompt.

| Choice | Result |
|--------|--------|
| **Start tour** | Closes Connections, switches to Universe, and starts the tour. |
| **Not now**, or closing the prompt | Sets `firstRunTutorialCompleted` and does not ask again. |
| **Skip** during the tour | Ends the tour and sets the same flag. |

Replay does not clear the flag. Use **Help → Interactive Tutorial**. That
command is ignored unless the window has focus.

## What the steps do

Steps live in `FIRST_RUN_TOUR_STEPS`. The tour dims the page and spotlights a
`data-tour` target. Some steps advance when you click that target; others
advance when the project gains a fixture type, a patched fixture, or a group.

If the open project already has fixture types or patched fixtures, early setup
steps are skipped or rewritten. Copy in the coach card is guidance only.

**Help → Online Tutorials** opens the wiki. It is separate from this tour.

## Persistence

`firstRunTutorialCompleted` is an **app setting**, not a field in the `.cap`
file. It is stored in `app-settings.json` under the Electron user-data
directory (`app-data/app-settings.json`). Loading another project does not
bring the prompt back. A failed write still sets the in-memory flag for this
session.

## Codepaths

| Role | Path |
|------|------|
| Prompt | `src/renderer/tutorial/FirstRunTutorialPrompt.tsx` |
| Coach overlay | `src/renderer/tutorial/InteractiveTour.tsx` |
| Step list | `src/renderer/tutorial/firstRunTourSteps.ts` |
| Help menu command | `src/main/menu.ts` (`start-interactive-tutorial`) |
| Settings file | `src/main/appSettingsStorage.ts` |

## Related

- [Project files and autosave](PROJECTS.md) — the flag is not in the project
- [Smart fixture groupings](smart-fixture-groupings.md) — a Universe step in the tour
