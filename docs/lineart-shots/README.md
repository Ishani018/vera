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
