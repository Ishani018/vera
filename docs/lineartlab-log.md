# Line Art Lab + Logo Mode — working log

Rollback point: branch **`pre-lineartlab`** at `ecdb47f` (and `pre-video` at
the same commit, for the other brief). To go back:

```sh
git fetch origin && git reset --hard origin/pre-lineartlab
```

## What to look at first

1. `docs/MODELS.md` — the licence finding. The neural looks are **off by
   default behind a "check licence" flag**, because the Informative Drawings
   weights have no licence I could verify. That is a decision you may want to
   revisit with the paper in front of you.
2. The classic engine is the real deliverable: pure TypeScript, deterministic,
   no model, no network.

## Sandbox limits, recorded up front

| host | result |
| --- | --- |
| `github.com`, `raw.githubusercontent.com` | reachable |
| `registry.npmjs.org` | reachable |
| `huggingface.co` | **403 at CONNECT — organisation egress policy** |
| `arxiv.org` | **403 at CONNECT** |
| `ns.inria.fr`, `www.cs.cmu.edu` (dataset pages) | **403 at CONNECT** |

So the real weights could not be downloaded, sized or hashed here. Per hard
rule 4 the neural work is built and tested against a **tiny generated ONNX
stand-in**, and `npm run models:fetch` is left for you to run on your Mac.

Two further limits carried over from the Press Proof work, both of which
change what a screenshot here is worth:

- **Webfonts do not load in this sandbox's browser** (`ERR_CERT_AUTHORITY_INVALID`:
  the image's NSS store predates this session's proxy CA and there is no
  `certutil`). The checks serve the real woff2 files from a curl-fetched cache
  instead, so screenshots show the real faces. TLS verification is untouched.
- **This headless Chromium reports `(hover: none)` and `(pointer: none)`**, and
  Tailwind gates hover utilities behind `@media (hover: hover)`. The harness
  re-applies the app's own rules with that gate removed in order to see hover
  states at all.

## Research basis — verified

See `docs/MODELS.md` for the table, the sha256 of each LICENSE file, and the
gap. Summary: Informative Drawings, Anime2Sketch and VTracer are all MIT as
*code*; the Informative Drawings *weights* have no stated licence. Potrace is
GPL-2.0 and is not used.

Vectorizer chosen: **`@visioncortex/vtracer` 1.0.0-alpha.4**, MIT OR
Apache-2.0, 692,673 B unpacked, no dependencies — VTracer's own WebAssembly
build, which is what the brief asked for.

---
