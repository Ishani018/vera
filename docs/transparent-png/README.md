# A transparent PNG, traced

`comparison.png` is the whole story in one picture: what you upload, what came out
before, what comes out now.

| file | what |
| --- | --- |
| `cat-source.png` | `starter/lines/cat.png` — 512×512, 94% fully transparent, black ink |
| `cat-before.png` | the export before the fix — the page thresholded to ink, the drawing lost inside it |
| `cat-after.png` | the export after it — the background read as paper, only the drawn lines ink |
| `comparison.png` | the three side by side, on a chequerboard, with the digests |

Both exports are "Already line art" with a die-cut outline, at 1026×1026, which is
exactly what `tests/golden/export-digests.json` pins.

The cause: every decode on the way into the tracer draws onto a fresh
`OffscreenCanvas`, and a fresh canvas is *transparent black* — `rgba(0,0,0,0)`.
Everything below reads the colour channels and ignores the alpha, because by then
a picture is a field of brightnesses. So a drawing with no background was a
drawing on black paper. `flattenOntoWhite` in `lib/lineart/pipeline.ts` composites
first; `docs/aesthetic-log.md` has the rest.
