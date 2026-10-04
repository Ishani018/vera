# Licences

Status VERIFIED means the model card or package metadata was read on the date shown. It is not legal advice.

## Models

| Model | Repo | Licence | Status | Source read |
|---|---|---|---|---|
| BiRefNet | `ZhengPeng7/BiRefNet` | MIT | VERIFIED 2026-10-04 | `cards/birefnet.md` front matter `license: mit` |
| Qwen2.5-VL 7B Instruct 4-bit (MLX) | `mlx-community/Qwen2.5-VL-7B-Instruct-4bit` | Apache 2.0 | VERIFIED 2026-10-04 | `cards/qwen-mlx.md` and original `cards/qwen-orig.md`, both `license: apache-2.0` |
| FLUX.2 klein 4B | `black-forest-labs/FLUX.2-klein-4B` | Apache 2.0 | VERIFIED 2026-10-04 | `cards/klein.md` ("open weights available for commercial use under Apache 2.0") and `cards/klein-LICENSE.md` (full Apache 2.0 text) |

Notes:
- FLUX.2 klein **9B** is under the FLUX Non-Commercial License. Do not swap to 9B without a new licence decision.
- The klein card "encourages" NSFW and protected-content filters for 4B deployments. Not required by the licence. Worth doing if this ships.
- BiRefNet runs repo code (`trust_remote_code=True`). That code is in the same MIT repo.
- Not checked: the licences of datasets these models were trained on. Model licences do not answer that question.

## Libraries (from installed package metadata)

| Package | Licence |
|---|---|
| mflux 0.21.0 | MIT |
| mlx / mlx-metal | MIT |
| mlx-vlm 0.7.4 | MIT |
| vtracer 0.6.15 | MIT |
| transformers | Apache 2.0 |
| torch / torchvision | BSD-style (multi-licence expression, permissive) |
| scipy | BSD |
| psutil | BSD-3-Clause |
| pillow, numpy | permissive (MIT-CMU / BSD), UNVERIFIED in metadata here |
| resvg_py 0.5.0 | UNVERIFIED: package metadata has no licence field. resvg itself is MPL-2.0 or Apache/MIT depending on version. Check before shipping. |

Not used on purpose: Potrace (GPL).
