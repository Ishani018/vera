"""Stage 2: what is this, and what makes it recognisable? Qwen2.5-VL 7B (4-bit, MLX), local."""
from __future__ import annotations

import json
import re

from PIL import Image

REPO = "mlx-community/Qwen2.5-VL-7B-Instruct-4bit"

PROMPT = (
    "Look at this picture of a single subject. Reply with ONLY a JSON object, no prose, with exactly "
    'these keys: "subject" (a short name for it, 1-4 words), "features" (a list of 4 to 8 short phrases, '
    "each naming one visual feature that makes THIS subject recognisable and must survive being redrawn as "
    'simple line art), and "style_prompt" (one sentence describing how to redraw it as clean black line art).'
)


def parse_json(text: str) -> dict:
    """Pull the first {...} object out of a model reply, tolerating fences and chatter."""
    text = re.sub(r"```(?:json)?", "", text)
    start = text.find("{")
    if start < 0:
        raise ValueError("no JSON object in reply")
    depth = 0
    for i in range(start, len(text)):
        depth += text[i] == "{"
        depth -= text[i] == "}"
        if depth == 0:
            return json.loads(text[start : i + 1])
    raise ValueError("unterminated JSON object")


def validate(d: dict) -> dict:
    """Return a clean dict or raise ValueError saying what is wrong."""
    subject = str(d.get("subject", "")).strip()
    feats = [str(f).strip() for f in d.get("features", []) if str(f).strip()]
    style = str(d.get("style_prompt", "")).strip()
    if not subject:
        raise ValueError("missing subject")
    if not 4 <= len(feats) <= 8:
        raise ValueError(f"{len(feats)} features, wanted 4 to 8")
    if not style:
        raise ValueError("missing style_prompt")
    return {"subject": subject, "features": feats, "style_prompt": style}


class Analyser:
    def __init__(self):
        from mlx_vlm import load
        from mlx_vlm.utils import load_config

        self.model, self.processor = load(REPO)
        self.config = load_config(REPO)

    def run(self, image_path: str, retries: int = 1) -> dict:
        from mlx_vlm import generate
        from mlx_vlm.prompt_utils import apply_chat_template

        last = ""
        for attempt in range(retries + 1):
            prompt = apply_chat_template(self.processor, self.config, PROMPT, num_images=1)
            out = generate(self.model, self.processor, prompt, image=[image_path],
                           max_tokens=400, temperature=0.0, verbose=False)
            last = getattr(out, "text", str(out))
            try:
                d = validate(parse_json(last))
                d["raw_reply"] = last
                d["attempts"] = attempt + 1
                return d
            except (ValueError, json.JSONDecodeError) as e:
                err = str(e)
        return {"subject": "", "features": [], "style_prompt": "", "raw_reply": last,
                "attempts": retries + 1, "error": f"analysis did not produce valid JSON: {err}"}

    def close(self) -> None:
        del self.model, self.processor
        import gc

        gc.collect()
        try:
            import mlx.core as mx

            mx.clear_cache()
        except Exception:
            pass
