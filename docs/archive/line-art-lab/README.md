# Line Art Lab (archived)

Taken out of the app. The code, its tests and its sample pictures are not in the
working tree any more, but nothing is lost: it is all at the git tag
`archive/line-art-lab`.

To look at it:

    git show archive/line-art-lab --stat

To put it back:

    git checkout archive/line-art-lab -- app/lab components/lab lib/lab \
      tests/lab-ui.test.mjs tests/smart.test.mjs tests/measure.test.mjs \
      tests/logo.test.mjs tests/trace.test.mjs tests/intake.test.mjs \
      public/lab-samples scripts/lab-bench.mjs

then re-add the home-screen tile and the Sticker Studio's "Line art" card (see
the commit that archived it), and the `lab:bench` / `test:lab-ui` npm scripts.

What stays: the colouring book's own line-art conversion (`lib/lineart`), which
is a separate engine and is still used by the colouring editor. `tools/logo-proto`
(the optional Smart redraw helper the Lab talked to) is untouched.

The notes in this folder are the Lab's own working log and inputs.
