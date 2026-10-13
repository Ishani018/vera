# Smart redraw

An optional Lab look that redraws a picture as clean line art using three models on this Mac. It needs a small helper program running locally. Without it, the Lab behaves exactly as before.

## Licence guard

Smart redraw is behind an env flag, `NEXT_PUBLIC_SMART_REDRAW`:

- unset: on in `npm run dev`, **off in production builds**
- `1` / `true` / `on`: on. `0` / `false` / `off`: off.

**Keep it off in anything you ship until you have read the model terms below.** The statuses are copied from `tools/logo-proto/LICENSES.md` (cards read 2026-10-04; not legal advice).

| Model | Licence stated | Status |
|---|---|---|
| BiRefNet (`ZhengPeng7/BiRefNet`) | MIT | READ, thin. The card says nothing about commercial use, outputs or training data. |
| Qwen2.5-VL 7B Instruct 4-bit (`mlx-community/...`) | Apache 2.0 | READ, thin. No commercial or acceptable-use text. Only the 7B was checked; other sizes differ. |
| FLUX.2 klein 4B (`black-forest-labs/...`) | Apache 2.0 | READ, one caveat. The card points to BFL usage policies and, for commercial open-weight use, Self-Hosted Commercial License Terms. Whether they bind the 4B weights is **unresolved**. Do not swap to the 9B (non-commercial). |

Not checked at all: the licences of the data these models were trained on. Libraries: `LICENSES.md` also lists them; `resvg_py` is UNVERIFIED.

## What stays out of the app

The browser only talks to the helper over `http://127.0.0.1:8765`. No model, weight or Python code is in the JavaScript bundle (`lib/lab/smart.ts` imports nothing). Models are not in the repo; they live in the Hugging Face cache on the Mac (about 22 GB).

## Starting the helper

```
cd tools/logo-proto
.venv/bin/python server.py
```

Then open the app at http://localhost:3000/lab. Smart redraw appears as a ninth look once the helper answers `/health`.

- Other app address: `.venv/bin/python server.py --origin http://localhost:3001` (repeat for more). Set `NEXT_PUBLIC_SMART_REDRAW_URL` if you change the helper's port (`--port`).
- Limits: 25 MB upload, 60 megapixels, one job at a time, 900 s timeout (`--max-mb`, `--timeout`).
- It binds 127.0.0.1 only, makes no network calls (models load offline), keeps no copies of pictures and deletes its temp files after each job.

If the helper is missing, fails or times out, the Lab says so and shows the built-in Hand-inked look instead. Cancel stops the job and frees the memory; it does not fall back.
