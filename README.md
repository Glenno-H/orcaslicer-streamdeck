# OrcaSlicer for Stream Deck

A free, open-source Stream Deck plugin for [OrcaSlicer](https://github.com/OrcaSlicer/OrcaSlicer) on Windows.
Put any of OrcaSlicer's commands on a key, with OrcaSlicer's own icons.

- **92 commands in 9 groups**: project and files, slice and print, edit and select, arrange and
  nudge, tools (move, rotate, cut, paint, emboss and more), paint brushes, camera views, preview
  sliders and display, and window tabs. There's also a **Custom Shortcut** key for anything else, and **Reload from Disk** has its own action so you can drag it straight onto a key.
- **Follows your own shortcuts.** If you change a shortcut in OrcaSlicer (Preferences > Keyboard
  shortcuts), the matching Stream Deck key uses the new one straight away. No setup needed.
- **Brings OrcaSlicer to the front** if another window is on top, then sends the key. You can turn
  this off per key.
- **Hold to repeat** for undo/redo, zoom, layer up/down, nudging and the G-code slider, the same as
  holding the key on your keyboard.
- Works on every Stream Deck with keys (MK.2, XL, Mini, Neo, +). Works in Multi Actions.

Built for OrcaSlicer 2.5. Earlier versions use mostly the same default keys.

## Install

1. Download `au.gkw.orcaslicer.streamDeckPlugin` from the [latest release](https://github.com/Glenno-H/orcaslicer-streamdeck/releases/latest).
2. Double-click it. Stream Deck asks to install it; click **Install**.
3. In Stream Deck, find **OrcaSlicer** in the actions list on the right.

Needs Windows 10 or 11 and Stream Deck 7.1 or newer.

## Use

1. Drag an action (for example **Tools**) onto a key.
2. In the settings panel below, pick the command (for example **Cut**). The key art changes to match,
   and the panel shows which keys it will send.
3. Press the key while OrcaSlicer is open.

A yellow warning triangle on the key means the press didn't reach OrcaSlicer. The reason is in
the plugin log: `%APPDATA%\Elgato\StreamDeck\Plugins\au.gkw.orcaslicer.sdPlugin\logs`. Usual causes:

- OrcaSlicer isn't running.
- That command has no key in OrcaSlicer. The "go to tab" commands (Home, Prepare, Preview, Device…)
  have no key by default. Give them one in OrcaSlicer's Preferences > Keyboard shortcuts, and the
  Stream Deck key starts working.
- OrcaSlicer is running as administrator and Stream Deck isn't. Windows blocks key presses between them.

Some commands only work in part of OrcaSlicer, the same as their keyboard shortcuts. Tools work on
the Prepare tab with something selected, layer and G-code keys work on the Preview tab, and paint
brushes need a painting tool open.

## Build from source

Needs Node.js 24 (Node 22 works for building).

```sh
npm install
npm run check     # type-check and run the tests
npm run build     # build into au.gkw.orcaslicer.sdPlugin/
npm run pack      # make dist/au.gkw.orcaslicer.streamDeckPlugin
```

To try changes on a Windows PC with Stream Deck installed: `npx streamdeck link au.gkw.orcaslicer.sdPlugin`,
then `npx streamdeck restart au.gkw.orcaslicer` after each `npm run build`.

### How it fits together

| File | Job |
|---|---|
| `src/catalogue.json` | Every command: OrcaSlicer's config id, label, default key, icon. Single source of truth. |
| `scripts/build-assets.mjs` | Builds key images, settings panels and `manifest.json` from the catalogue. |
| `src/keys.ts` | Reads OrcaSlicer's key text (`Ctrl+Shift+S`) and turns it into Windows key codes. |
| `src/orca-config.ts` | Reads your changed shortcuts from `%APPDATA%\OrcaSlicer\OrcaSlicer.conf`. |
| `src/win32.ts` | Sends key presses (`SendInput`) and finds and focuses OrcaSlicer's window, through Koffi. |
| `src/actions.ts` | The Stream Deck actions. |

### Updating for a new OrcaSlicer release

1. Compare `src/slic3r/GUI/Shortcuts.cpp` in the new release with `src/catalogue.json` and add or change
   commands.
2. Re-copy the icons: `node scripts/vendor-orca-icons.mjs <path-to-OrcaSlicer-checkout>`.
3. `npm run check && npm run pack`.

## Licence

AGPL-3.0, the same as OrcaSlicer, whose icons this uses. See `LICENSE` and `NOTICE.md`.
