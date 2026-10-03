# Models and licences

Everything the Line Art Lab can run, what it is, where it comes from, and
whether we are allowed to ship it. Verified on 3 October 2026 from this
machine; the "could not verify" section is as important as the rest.

The rule this file exists to serve: **the classic path is deterministic and
uses no model at all.** Nothing here is ever the default, and nothing here runs
until somebody asks for it by name.

---

## Reachable from the build sandbox

The agent proxy's egress policy allows `github.com` and
`raw.githubusercontent.com` and the npm registry. It **denies**
`huggingface.co`, `arxiv.org`, `ns.inria.fr` and `www.cs.cmu.edu`, all with a
403 at CONNECT, which is an organisation policy denial rather than a transient
failure. So the weights themselves could not be downloaded, sized or hashed
here, and two of the three training-data licences could not be read at source.

---

## Code licences — verified

| what | repo | licence | sha256 of the LICENSE file | bytes |
| --- | --- | --- | --- | --- |
| Informative Drawings | `carolineec/informative-drawings` | MIT, "Copyright (c) 2022 Caroline Chan" | `d12dd7d51af0afb8d6af4fdc18983a627be13559e1269422163bbe5353e3522e` | 1070 |
| Anime2Sketch | `Mukosame/Anime2Sketch` | MIT, "Copyright (c) 2021 Xiaoyu Xiang" | `3f3ad89f0e328d521a22f3f613331e2768a2c9a394557a59d43f3ef8431402a6` | 1069 |
| VTracer | `visioncortex/vtracer` | MIT, "Copyright (c) 2024 TSANG, Hao Fung" | `81ee739f355765c110fc89feff14ffffce829901f96ba811fd0b65a41a8636c7` | 1058 |

Potrace is **GPL-2.0** and is not used anywhere, per the brief.

## Packages — verified from the npm registry

| package | version | licence | unpacked | notes |
| --- | --- | --- | --- | --- |
| `onnxruntime-web` | 1.30.0 | MIT | 144,618,540 B | the whole package; only the wasm backend is served, and only on `/lab` |
| `@visioncortex/vtracer` | 1.0.0-alpha.4 | MIT OR Apache-2.0 | 692,673 B | VTracer's own WebAssembly build, no dependencies |

---

## The weights: **licence unclear, so they are gated**

This is the finding that matters.

`carolineec/informative-drawings` carries an MIT LICENSE at its root. That file
grants rights in "the Software" — the repository's code. The pre-trained
weights are **not in the repository**: the README links them from Google Drive,
there is no model card, no `MODEL_LICENSE`, and no separate statement anywhere
in the repo about what may be done with the trained networks.

The brief notes that the paper records a licence gap for part of the training
data. I could not read the paper or the dataset pages from here — arxiv.org,
ns.inria.fr (OpenSketch) and www.cs.cmu.edu (the contour-drawing dataset) are
all denied by the egress policy — so I can neither confirm nor refute the
specific restriction. What I can say precisely is this:

- the **code** is MIT, verified;
- the **weights** have no stated licence that I was able to find or verify;
- therefore **shipping the weights in a commercial product is not something
  this repository gives us permission to do**, and the sensible reading of an
  unstated licence is "not granted", not "granted".

### What that means in the product

Per the brief, the neural looks are therefore **gated behind a visible "check
licence" flag and are off by default**. They are never enabled silently, never
chosen as a default look, and the gate names the reason rather than hiding it.
Enabling the flag is a decision the owner of this project makes with the
licence in front of them; it is not a setting the app flips on anyone's behalf.

Weights are never committed to git. `npm run models:fetch` downloads and
verifies them for local use, and the Lab fetches them lazily into Cache Storage
with a progress bar and a sha256 check.

### Still to verify, on a machine that can reach Hugging Face

- `rocca/informative-drawings-line-art-onnx`: the exact file names, byte sizes
  and sha256 of the "realistic" and "coarse" ONNX graphs (the brief gives about
  17 MB for the port as a whole).
- Whether that repo states a licence of its own in its model card.
- The OpenSketch licence (expected to be a Creative Commons non-commercial
  term, which if correct would be decisive) and the contour-drawing dataset's
  terms.

`npm run models:fetch` prints each file's measured size and sha256 so these
rows can be filled in from the download rather than from memory.
