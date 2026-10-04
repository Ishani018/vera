"""Stage 2: what is this, and what makes it recognisable? Qwen2.5-VL 7B (4-bit, MLX), local."""
from __future__ import annotations

import json
import re

from PIL import Image

REPO = "mlx-community/Qwen2.5-VL-7B-Instruct-4bit"

PROMPT = (
    "Look at this picture of a single subject. Reply with ONLY a JSON object, no prose, with exactly "
    'these keys: "subject" (a short name for it, 1-4 words), "features" (a list of 4 to 8 short phrases, '
    "each naming one distinct visual feature OF THE SUBJECT ITSELF that makes it recognisable and must "
    "survive being redrawn as simple line art), and \"style_prompt\" (one sentence describing how to redraw it "
    "as clean black line art). Features describe the subject's SHAPE AND STRUCTURE only, things a pen can "
    "draw: never list the background, backdrop, surroundings, colours or textures, and never name the same "
    "thing twice in different words."
)

#: Words that mean "not the subject". The prompt asks the model not to use them;
#: this is the safety net for when it does anyway (it listed "White background").
BACKGROUND = re.compile(r"\b(background|backdrop|surroundings?|scenery)\b", re.I)
#: Colour and texture cannot be drawn in black line, so a feature made of them is
#: not one that "must survive". The 7B model lists them anyway, even when told not
#: to ("golden brown", "fluffy texture"), so this is a net, not a nicety.
NOT_DRAWABLE = re.compile(
    r"\b(colou?rs?|colou?red|golden|brown|yellow|orange|red|blue|green|white|black|grey|gray|pink|purple|tan|"
    r"beige|cream|texture[ds]?|fluffy|crumbly|crispy|crunchy|soft|shiny|glossy|moist|juicy|warm|fresh)\b", re.I)
_STOP = {"a", "an", "the", "of", "on", "in", "with", "and", "to", "its", "it"}


def _words(f: str) -> frozenset[str]:
    return frozenset(w.rstrip("s") for w in re.findall(r"[a-z]+", f.lower()) if w not in _STOP)


def drop_colour_sentences(text: str) -> str:
    """The style sentence goes to the redraw model, which is already told "no colour".
    A sentence that asks for one ("golden brown color") would argue with that."""
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return " ".join(p for p in parts if not NOT_DRAWABLE.search(p)) or "Redraw it as clean black line art."


def strip_undrawable(feature: str) -> str:
    """Remove colour and texture words and keep what is left: "Red roof" -> "roof",
    "Golden syrup dripping" -> "syrup dripping", "golden brown" -> "" (nothing drawable)."""
    out = NOT_DRAWABLE.sub(" ", feature)
    out = re.sub(r"\s+", " ", out).strip(" ,;-")
    return out if _words(out) else ""


def clean_features(features: list[str]) -> list[str]:
    """Drop background features, strip colour/texture words, and drop any feature that is
    just a shorter wording of another."""
    kept = []
    for f in features:
        if BACKGROUND.search(f):
            continue
        g = strip_undrawable(f)
        if g:
            kept.append(g)
    sets = [_words(f) for f in kept]
    out = []
    for i, f in enumerate(kept):
        dup = any(
            j != i and sets[i] and (sets[i] < sets[j] or (sets[i] == sets[j] and j < i))
            for j in range(len(kept))
        )
        if not dup:
            out.append(f)
    return out


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
    feats = clean_features([str(f).strip() for f in d.get("features", []) if str(f).strip()])
    style = str(d.get("style_prompt", "")).strip()
    if not subject:
        raise ValueError("missing subject")
    if not 4 <= len(feats) <= 8:
        raise ValueError(f"{len(feats)} features, wanted 4 to 8")
    if not style:
        raise ValueError("missing style_prompt")
    style = drop_colour_sentences(style)
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
