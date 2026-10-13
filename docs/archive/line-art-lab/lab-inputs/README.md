# Lab inputs

Put your own pictures here — photographs, drawings, scans, anything you want to
see as line art. `npm run lab:bench docs/lab-inputs` writes a contact sheet for
each one into `out/lab-bench/`, and the committed sheets in `docs/lineart-shots/`
are made from whatever is in this folder.

**This folder started empty.** The engine's settings were tuned against the
synthetic test cards described in `docs/lineartlab-log.md` — a card with a disc,
a bar, a thin line, a ramp and a patch of fine checks, and a synthetic
photograph with smooth shading, hard edges and film grain. They exercise the
things that break a line finder on purpose, and they are still not somebody's
holiday snap.

So: the looks have **not** been tuned on real photographs. Drop some in and run
the bench, and the sheets will say what the engine actually does with them.

JPEG, PNG and WebP all work. Nothing in here is uploaded anywhere — the bench
runs on your machine and so does the Lab.
