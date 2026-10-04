"""Wall time and memory per stage.

Peak memory is read three ways because no single number is honest on Apple
silicon: the process's resident set (sampled every 50 ms), MLX's own allocator
peak (unified memory the framework holds, which RSS under-reports), and the
process-lifetime maximum from the OS.
"""
from __future__ import annotations

import contextlib
import resource
import threading
import time
from dataclasses import dataclass, field

import psutil

GB = 1024**3


def _mlx_peak() -> float:
    try:
        import mlx.core as mx

        return float(mx.get_peak_memory())
    except Exception:
        return 0.0


def _mlx_reset() -> None:
    try:
        import mlx.core as mx

        mx.reset_peak_memory()
    except Exception:
        pass


def os_peak_rss() -> float:
    return float(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)  # bytes on macOS


@dataclass
class StageRecord:
    name: str
    seconds: float = 0.0
    peak_rss: float = 0.0
    peak_mlx: float = 0.0
    note: str = ""

    def row(self) -> dict:
        return {
            "stage": self.name,
            "seconds": round(self.seconds, 2),
            "peak_rss_gb": round(self.peak_rss / GB, 2),
            "peak_mlx_gb": round(self.peak_mlx / GB, 2),
            "note": self.note,
        }


@dataclass
class Profile:
    records: list[StageRecord] = field(default_factory=list)
    limit_gb: float = 28.0
    over_limit: StageRecord | None = None
    #: called from the sampler thread the moment memory crosses limit_gb. The
    #: default stops the process, because the instruction was "stop and tell me".
    on_exceed: object = None

    @contextlib.contextmanager
    def stage(self, name: str, note: str = ""):
        rec = StageRecord(name, note=note)
        proc = psutil.Process()
        stop = threading.Event()
        peak = [proc.memory_info().rss]

        def sample():
            while not stop.is_set():
                rss = proc.memory_info().rss
                peak[0] = max(peak[0], rss)
                try:
                    import mlx.core as mx

                    held = float(mx.get_active_memory())
                except Exception:
                    held = 0.0
                if max(rss, held) / GB > self.limit_gb and callable(self.on_exceed):
                    self.on_exceed(name, max(rss, held) / GB)
                time.sleep(0.05)

        _mlx_reset()
        th = threading.Thread(target=sample, daemon=True)
        th.start()
        t0 = time.perf_counter()
        try:
            yield rec
        finally:
            rec.seconds = time.perf_counter() - t0
            stop.set()
            th.join()
            rec.peak_rss = float(peak[0])
            rec.peak_mlx = _mlx_peak()
            self.records.append(rec)
            worst = max(rec.peak_rss, rec.peak_mlx) / GB
            if worst > self.limit_gb and self.over_limit is None:
                self.over_limit = rec

    def total_seconds(self) -> float:
        return sum(r.seconds for r in self.records)

    def peak_gb(self) -> float:
        return max([max(r.peak_rss, r.peak_mlx) for r in self.records] + [0.0]) / GB
