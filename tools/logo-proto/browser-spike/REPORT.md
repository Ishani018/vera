# Browser spike: can a small image-to-line-art model run in the browser?

Machine: Apple M1 Max, 34 GB, Chrome 154, ONNX Runtime Web 1.30, page served cross-origin isolated (needed for WASM threads). Nothing else was running during the measurements. One fresh Chrome per row. "Warm run" is the median of three runs after the first; it includes reading the result back. "First run" includes WebGPU shader compile. "+ browser RAM" is the peak resident memory of Chrome and all its child processes (renderer, GPU) minus the same before the model loaded. **This is one fast machine; see the caveats.**

## What was built

- `unet.py`: plain U-Net (conv, batch norm, relu, max-pool, transposed conv), 512 px in, 1-channel ink map out. Sizes by base width: S c=18 (2.46 M params), M c=36, L c=58.
- `prep.py` + `train.py`: 22 pairs (the 11 photos x 2 variations in `results/run2`, photo vs the rasterised `minimal-n.svg`), 300 steps each on the Mac GPU (MPS).
- `export.py`: ONNX opset 17, then fp16 (`keep_io_types`) and static int8 QDQ. ONNX output matches PyTorch (fp32 exact, fp16 within 0.002, int8 within 0.06-0.14 at worst pixels).
- `bench.mjs`, `run-bench.mjs`, `serve.mjs`: the in-browser benchmark, run through Chrome.

**The training proves the pipeline, not that it learns.** Dice loss on its own 22 training pictures ended at 0.70-0.71 for all three sizes (1.0 is nothing, 0.0 is perfect). That is poor even for memorisation. Two reasons, one measured and one not: 300 steps is short; and the teacher SVGs are drawn in the *subject-crop frame* (the pipeline cuts out and crops the subject), while I fed the full photo, so the pairs are not pixel-aligned (visible in `data/check.png` if you re-run `prep.py`). Real training must apply the same crop to the photo. Timings do not depend on this.

## Line-art network

| model | runtime | px | file MB | gzip MB | warm run | first run | session load | + browser RAM MB |
|---|---|---|---|---|---|---|---|---|
| s-fp32 | WebGPU | 512 | 9.8 | 9.1 | 0.04 s | 0.54 s | 0.38 s | 426 |
| s-fp16 | WebGPU | 512 | 4.9 | 4.5 | 0.04 s | 0.71 s | 0.35 s | 453 |
| s-fp32 | WASM x1 | 512 | 9.8 | 9.1 | 0.94 s | 0.98 s | 0.32 s | 472 |
| s-fp32 | WASM x4 | 512 | 9.8 | 9.1 | 0.24 s | 0.29 s | 0.33 s | 508 |
| s-int8 | WASM x4 | 512 | 2.5 | 1.8 | 0.30 s | 0.36 s | 0.37 s | 537 |
| m-fp32 | WebGPU | 512 | 39.3 | 36.5 | 0.09 s | 0.14 s | 0.41 s | 601 |
| m-fp16 | WebGPU | 512 | 19.7 | 18.1 | 0.12 s | 0.12 s | 0.38 s | 475 |
| m-fp32 | WASM x1 | 512 | 39.3 | 36.5 | 3.60 s | 3.63 s | 0.36 s | 606 |
| m-fp32 | WASM x4 | 512 | 39.3 | 36.5 | 0.91 s | 0.95 s | 0.35 s | 635 |
| m-int8 | WASM x4 | 512 | 9.9 | 7.0 | 1.02 s | 1.07 s | 0.38 s | 670 |
| l-fp32 | WebGPU | 512 | 102.0 | 94.6 | 0.40 s | 0.43 s | 0.42 s | 991 |
| l-fp16 | WebGPU | 512 | 51.0 | 46.9 | 0.33 s | 0.35 s | 0.38 s | 663 |
| l-fp32 | WASM x1 | 512 | 102.0 | 94.6 | 9.23 s | 9.35 s | 0.38 s | 990 |
| l-fp32 | WASM x4 | 512 | 102.0 | 94.6 | 2.34 s | 2.44 s | 0.40 s | 966 |
| l-int8 | WASM x4 | 512 | 25.5 | 17.8 | 2.46 s | 2.55 s | 0.40 s | 867 |

Sizes: S is 4.9 MB at fp16, M 19.7 MB, L 51 MB, which are the "about 5, 20 and 50 MB" asked for. gzip barely helps (weights do not compress): download is about 92% of the file.

## Cutout models (speed and size only; mask quality was not judged)

| model | runtime | px | file MB | gzip MB | warm run | first run | session load | + browser RAM MB |
|---|---|---|---|---|---|---|---|---|
| u2netp | WebGPU | 320 | 4.6 | 4.2 | **fails**: ceil_mode output-shape is computed, but ceil_mode kerne…| | | 493 |
| u2netp | WASM x4 | 320 | 4.6 | 4.2 | 0.33 s | 0.40 s | 0.41 s | 744 |
| modnet-fp32 | WebGPU | 512 | 25.9 | 24.0 | 0.04 s | 1.03 s | 0.48 s | 557 |
| modnet-fp32 | WASM x4 | 512 | 25.9 | 24.0 | 0.35 s | 0.38 s | 0.42 s | 577 |
| modnet-fp16 | WebGPU | 512 | 13.0 | 11.9 | 0.04 s | 0.93 s | 0.49 s | 667 |
| modnet-fp16 | WASM x4 | 512 | 13.0 | 11.9 | 0.31 s | 0.39 s | 0.49 s | 902 |
| modnet-uint8 | WebGPU | 512 | 6.6 | 5.2 | 1.27 s | 1.55 s | 0.61 s | 946 |
| modnet-uint8 | WASM x4 | 512 | 6.6 | 5.2 | 0.43 s | 0.50 s | 0.56 s | 665 |
| silueta | WebGPU | 320 | 44.2 | 27.0 | **fails**: ceil_mode output-shape is computed, but ceil_mode kerne…| | | 792 |
| silueta | WASM x4 | 320 | 44.2 | 27.0 | 1.05 s | 1.14 s | 0.49 s | 1083 |
| rmbg14-q | WebGPU | 1024 | 44.4 | 30.8 | 10.13 s | 10.78 s | 0.71 s | 1918 |
| rmbg14-q | WASM x4 | 1024 | 44.4 | 30.8 | 2.88 s | 2.93 s | 0.60 s | 1318 |

Candidates found under about 40 MB: U2-Netp (4.6 MB), MODNet (6.6 / 13 / 25.9 MB). Silueta (44.2 MB) and RMBG-1.4 quantised (44.4 MB) are just over and were measured as references. IS-Net general use and the BiRefNet family are 170 MB or more and were not downloaded.

## Findings

1. **Speed is not the problem.** Even the 51 MB model takes 0.33 s on WebGPU and 2.3 s on WASM with 4 threads for one 512 px picture. Single-threaded WASM is 4x slower (9.2 s for L), which is the case to plan for if the page cannot be cross-origin isolated.
2. **WebGPU is fastest but not always usable.** U2-Netp and Silueta fail on WebGPU in ORT Web 1.30 (the MaxPool `ceil_mode` kernel is not implemented). MODNet works at 0.04 s but its first run costs about 1 s of shader compile. The quantised models are slower on WebGPU than fp32 (MODNet uint8 1.27 s vs 0.04 s; RMBG-1.4 q 10 s), so quantise only for WASM, and even there it did not help.
3. **int8 did not speed up WASM** (fp32 0.24 s, int8 0.30 s for S): it saves download (L 102 MB -> 25 MB int8, 18 MB gzip) but not time. fp16 halves the file and was about equal in speed on this GPU.
4. **Memory:** 0.4 to 1 GB of extra browser RAM per loaded model at 512 px, mostly runtime buffers, not weights. RMBG-1.4 at 1024 px took 1.3-1.9 GB.
5. **Download is the real cost**, not compute: 5 / 20 / 51 MB at fp16 on every first visit (cacheable afterwards).

## Is under 10 seconds achievable?

For the **network**, yes, with a wide margin on this machine: under 1 s on WebGPU and under 3 s on 4-thread WASM for every size tried. A laptop 3 to 4 times slower (older Intel, no usable WebGPU) would still be about 3 to 10 s on WASM for the 20 to 50 MB models, so under 10 s holds for S and M and is borderline for L on the weakest hardware. I did not test any other machine, so that last claim is an estimate.

The total for a picture also includes steps I did not measure here: cutout (0.3 s), resizing, and tracing the ink map to SVG curves (the existing JS tracer, a second or two). The thing this spike cannot say is whether a model this small can **draw** like the teacher. That is a training-data and quality question, not a speed one.

## What to aim for

- Size: **about 20 MB (fp16, M)** as the starting point: 0.1 s WebGPU / 0.9 s WASM, 20 MB first download. Try S (5 MB) first for quality, and only go to L if M visibly lacks capacity.
- Runtime: **ONNX Runtime Web, WebGPU first, WASM (4 threads) as the fallback**, fp16 weights for WebGPU and fp32 or fp16 for WASM. Serve the page with COOP/COEP headers for WASM threads (this affects anything embedded cross-origin).
- Cutout: **U2-Netp (4.6 MB, WASM, 0.33 s)** is the practical general-purpose option for objects; MODNet is portrait-only. Do not use RMBG-1.4 (non-commercial licence, 44 MB, slow on WebGPU).

## Not done / limits

One machine, one picture, three runs per row. No Safari or Firefox. No battery or thermal measurement. Cutout quality not compared. No real training.
