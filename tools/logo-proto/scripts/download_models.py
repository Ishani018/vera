"""Download exactly the approved model files into the Hugging Face cache.

Approved by the owner: BiRefNet, Qwen2.5-VL 7B 4-bit (MLX) and FLUX.2 klein 4B
(only the files mflux needs, not the duplicate single-file copy). No SDXL.
"""
import time
from huggingface_hub import snapshot_download

JOBS = [
    ("ZhengPeng7/BiRefNet", None),
    ("mlx-community/Qwen2.5-VL-7B-Instruct-4bit", None),
    (
        "black-forest-labs/FLUX.2-klein-4B",
        ["vae/*.safetensors", "transformer/*.safetensors", "text_encoder/*.safetensors",
         "tokenizer/**", "*.json", "scheduler/*", "LICENSE.md", "README.md"],
    ),
]

for repo, patterns in JOBS:
    t = time.time()
    print(f"== {repo}", flush=True)
    path = snapshot_download(repo_id=repo, allow_patterns=patterns)
    print(f"   done in {time.time()-t:.0f}s -> {path}", flush=True)
