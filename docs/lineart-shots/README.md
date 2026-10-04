# What each look does

One contact sheet per picture in `docs/lab-inputs/`: the original, then Ink pen,
Fine, Bold, Sketch, Hand-inked, Colouring page and Logo. Made by

```sh
npm run lab:bench docs/lab-inputs
```

which writes to `out/lab-bench/`; these were written straight into this folder
with `LAB_BENCH_OUT=docs/lineart-shots`.

**These are synthetic pictures, not photographs.** `docs/lab-inputs/` started
empty and these are the stand-ins the engine was tuned on: a test card built to
break a line finder, a synthetic photograph with shading and film grain, two
starter drawings, and one textured mark. Put your own pictures in
`docs/lab-inputs/` and run the bench again; the sheets will then say what the
engine does with real photographs, which nobody can currently claim.

Worth noticing on `synthetic-photo.png`: the Logo tile is a blue blob. That is
the mode being honest rather than failing — a photograph is thousands of shapes
and reducing it to three colours gives three colours of noise. The Lab says so
in words too, once a mark comes out past forty curves.

## Screens, at 1280 by 720

Not contact sheets — the pages themselves, photographed in a browser so each
claim in the log has a picture behind it.

| file | what it shows |
| --- | --- |
| `s5-confirm-lab-1280.png` | the Lab with a picture in it: chequer backdrop, canvas filling the stage, eight 118 × 90 look cards with Original first, and a control panel of three one-word labels with Advanced closed |
| `s5-confirm-advanced-1280.png` | the same, with Advanced opened, to show what it holds when asked |
| `trash-1280.png` | the trash dialog: a picture per row, a type tag, what is inside, and a days-left bar |
| `sidebar-1280.png` | the sidebar: four places, then the Brand kit and Storage tiles |

The red "1 Issue" badge in the bottom-left corner of the screen shots is Next.js's
development overlay, not part of the app. It is the `data-theme` hydration
warning described in the stage 8 notes, which predates this work.
