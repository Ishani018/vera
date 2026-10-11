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
| Line Art Lab, Tune | `lab/Lab.tsx` | Per-control Reset restores the look's own default. Advanced is collapsible. |
| Cover / board designer rail panels | `CoverDesigner.tsx`, `cover/Rail.tsx` | 14 fields on `PanelField`. Rail 78px, panel 312px. |
| Cover designer fallback aside | `CoverDesigner.tsx` | Same width and padding as the rail's panel. |
| Cover sub-sections | `cover/BrowseSize`, `StickerTray`, `StickerLibrary`, `CoverTemplates` | Headings are `SectionHeading`. |
| Colour popover | `cover/ColourField.tsx` | Headings use the panel label voice. |
| Font picker label | `FontPicker.tsx` | `ControlLabel`. |
| Sticker Studio | `stickers/StudioShell.tsx`, `StickerStudio.tsx` | `Field`/`Advanced` are thin wrappers over `PanelSection`; 12 hand-rolled labels are `ControlLabel`. |
| Colouring: line-art controls | `coloring/LineArtControls.tsx` | 32 sliders; optional `defaultValue` gives a Reset that restores it. |
| Colouring: Book tab | `coloring/AssemblyPanel.tsx`, `MatterPage.tsx` | Sections and fields; the upload error is a `Notice`. |
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
  so adding Reset there would mean inventing defaults; not done.
- Night: the floating zoom pill and the rail's undo/redo buttons on the cover
  designer still read pale-on-white. Same root cause as above; not fixed here.
- `golden:screen`: the image tier fails the same way on a clean checkout (this
  container's text rendering). The cover's layout tier also reports the stage
  1088px wide instead of 1080 since the cover aside went from 320 to 312px. That
  is a consequence of the width standardisation, not an environment effect, and
  the golden has **not** been re-recorded.
