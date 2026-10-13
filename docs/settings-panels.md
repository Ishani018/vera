# Settings panels: what is on the shared system, and what is not

One set of parts: `Panel`, `PanelHeader`, `PanelSection`, `SectionHeading`,
`Control`, `ControlLabel`, `PanelField`, `PanelState` and `Tray`, all in
`components/panel/Panel.tsx`, with the geometry in `PANEL` in `lib/theme.ts`.
Nothing here is a second control library: sliders, toggles and selects are still
the ones in `components/ui.tsx`.

Which part to reach for:

- **`Control`** — a slider (or anything with two focusable pieces). A `<div>`,
  because one `<label>` around a slider and its number makes a click on the
  number drag the slider. Takes `value`, `hint` (behind an "i"), `onReset`.
- **`PanelField`** — one input that its label should own (a text box, a select).
  A `<label>`, so the name is clickable and read out with the value.
- **`PanelSection`** — a group. `collapsible` is a `<details>`/`<summary>`
  (keyboard, find-on-page and no-JS for free). `now` shows the current value on a
  shut header. Its title is a real `<h4>`.
- **`PanelState`** — empty, loading and error, one shape.

## Migrated

| Surface | File(s) | Notes |
| --- | --- | --- |
| ~~Line Art Lab, Tune~~ | archived | The Lab was taken out of the app; tag `archive/line-art-lab`. See `docs/archive/line-art-lab/README.md`. |
| Cover / board designer rail panels | `CoverDesigner.tsx`, `cover/Rail.tsx` | 14 fields on `PanelField`. Rail 78px, panel 312px. |
| Cover designer fallback aside | `CoverDesigner.tsx` | Same width and padding as the rail's panel. |
| Cover sub-sections | `cover/BrowseSize`, `StickerTray`, `StickerLibrary`, `CoverTemplates` | Headings are `SectionHeading`. |
| Colour popover | `cover/ColourField.tsx` | Headings use the panel label voice. |
| Font picker label | `FontPicker.tsx` | `ControlLabel`. |
| Sticker Studio | `stickers/StudioShell.tsx`, `StickerStudio.tsx` | `Field`/`Advanced` are thin wrappers over `PanelSection`; 12 hand-rolled labels are `ControlLabel`. |
| Colouring: line-art controls | `coloring/LineArtControls.tsx` | 32 sliders; optional `defaultValue` gives a Reset that restores it. |
| Colouring: Pages tab | `coloring/PageSwitches.tsx`, `AssemblyPanel.tsx`, `MatterPage.tsx` | The editor has three tabs: **Pages**, **Cover**, **Export**. Pages is the switches (line art on/off, a blank back behind each picture on/off), the pictures, then Book details / Paper / Front of the book, all collapsible with their current value on the shut header. The whole-book preview and the launch-day posts moved to Export. |
| Poetry: trays | `Modes.tsx` → `Tray` | `PanelSection` with `now`; open tray still kept in the store. |
| Poetry: Design/Write panels | `controls.tsx` (9 panels, 31 fields) | One import line: `PanelField as Field`. Typography and matter groups are `PanelSection`. |
| Poetry: type controls | `FontControls.tsx` | Alignment/italic/colour row now has a label and a named group. |
| Poetry: Export | `ExportPanel.tsx` | Four sections. |

Panel surfaces (`Modes`, `Workspace` rail, `cover/Rail`, the cover aside, both
colouring asides, the sticker sheet column) paint `--studio-card`, not
`bg-paper`: `--color-paper` is the printed sheet and is white in every palette,
so a panel on it stayed white while its ink turned cream in Night.

## Justified exceptions (not migrated)

| Surface | Why |
| --- | --- |
| `ImportDialog`, `IllustrationEditor`, `PoemEditor` | Modal dialogs and an editor pane, not side panels. Their sentence-case `ui.Field` labels are right for a form. |
| `coloring/ExportView` | A centred page, not a side panel; its own headings are the page's. |
| Colouring "Pictures" aside (`PageGrid`) | A grid of thumbnails to reorder, not controls. Surface follows the studio card. |
| `HelpPanel` | A list of shortcuts in a modal. |

## Known gaps, stated plainly

- Only the Lab and the colouring line-art sliders have a per-control Reset. The
  poetry book's settings are not "moved from a default" in a way the app tracks,
  so adding Reset there would mean inventing defaults; not done, on purpose.
- Night, still pale-on-light, outside the settings panels and so not touched:
  the `text-paper` badges on thumbnails (`PageGrid` numbers and delete,
  `StickerLibrary` delete). Same cause as everything fixed here: `--color-paper`
  is the printed sheet and stays white, `ink-900` turns cream.
- Observed in a Night screenshot but not measured or touched: the floating
  toolbar over the canvas (Arc / Corners / arrange icons) is a white pill with
  pale icons. It is a canvas overlay, not a settings panel.
- Disabled Undo/Redo on the cover rail measure 1.95:1 (Night) to 2.5:1 (Default,
  Riso). That is the app-wide `.btn:disabled { opacity: .4 }`, which WCAG exempts
  for inactive controls; it was left alone rather than changed for every button.
  Enabled, hovered and keyboard-focused they are 15:1 or better.
- `golden:screen`, image tier: fails with the same numbers (cover 4981/1163,
  board 2971/668) at `df27df3` — the commit that recorded the goldens, before
  any of this work — so it is this container's text rendering, not a regression.
  Not re-recorded.
- `golden:screen`, cover layout tier: passes. The cover's stacked aside is
  320px (`PANEL.stackedWidth`), not the rail panel's 312, because 312 moved the
  board stage from 1080px to 1088px.
- `node.getAttribute is not a function` is thrown by the vendored Paged.js
  (`public/vendor/paged.polyfill.js`, `findElement`) when the colouring book's
  preview paginates (any of its Book/Cover/Launch kit/Export tabs). It is
  present at `df27df3`, before this work, and not on the poetry book's
  routes. It does not touch the panels; not investigated further.
- At 390px wide the poetry book's top toolbar overflows by about 13px
  (document width 403). Present without these changes; it is the header, not a
  panel.

## Line art and blank backs (for activity books)

There are no book "types" — just two switches in the Book tab's **How pages are
made** section. `coloring.lineArtOn` (default true, so existing books are
unchanged) decides whether pictures are traced. Off, a picture prints exactly as
uploaded: the conversion queue does nothing, the preview and export use the
original, resolution is the upload's own pixels, the Pictures tab shows placement
only, and nothing is reported as "not converted". Stored line art is ignored, not
deleted, so switching back costs nothing. `coloring.singleSided` (a blank page
behind every picture) was already a switch and now sits beside it. An activity
book is simply a book with both off.
