# Licences

Status VERIFIED means the model card or package metadata was read on the date shown. It is not legal advice.

## Models

"READ" means the card text in `cards/` was read on 2026-10-04 and the licence statement below is quoted or paraphrased from it.
It does not mean a lawyer looked at it, and none of these cards answers the training-data question (see the last note).

| Model | Repo | Licence stated | Status | What the card actually says |
|---|---|---|---|---|
| BiRefNet | `ZhengPeng7/BiRefNet` | MIT | READ, thin | Front matter `license: mit` plus an MIT badge. **Nothing about commercial use, outputs or training data.** MIT itself permits commercial use, but the card adds nothing to that. |
| Qwen2.5-VL 7B Instruct 4-bit (MLX) | `mlx-community/Qwen2.5-VL-7B-Instruct-4bit` | Apache 2.0 | READ, thin | Front matter `license: apache-2.0` on both the MLX conversion and the original 7B card. **No commercial-use or acceptable-use text on either.** The MLX card says it is a conversion made with mlx-vlm 0.1.11. Only the 7B was checked: other Qwen2.5-VL sizes carry different licences. |
| FLUX.2 klein 4B | `black-forest-labs/FLUX.2-klein-4B` | Apache 2.0 | READ, one caveat | Card: "Open weights available for commercial use under the Apache 2.0 license"; the 9B variants are under a **non-commercial** licence. `LICENSE.md` is the plain Apache 2.0 text. **Caveat:** the safety section also says acceptable use is "governed by policies set out in applicable documentation", naming a Usage Policy and, for commercial open-weight users, Self-Hosted Commercial License Terms. It does not say whether those bind the 4B Apache weights, and the Apache text does not mention them. **Unresolved. Read BFL's current terms before shipping anything commercial.** |

Notes:
- FLUX.2 klein **9B** is under the FLUX Non-Commercial License. Do not swap to 9B without a new licence decision.
- The klein card "encourages" NSFW and protected-content filters for 4B deployments. Not required by the licence text. Worth doing if this ships.
- BiRefNet runs repo code (`trust_remote_code=True`). That code is in the same MIT repo.
- **Not checked at all:** the licences of the datasets these models were trained on. A model licence does not answer that question, and for a logo tool it is the one a client may ask.
- No model here was trained or fine-tuned by this project. All three are used as published.

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
