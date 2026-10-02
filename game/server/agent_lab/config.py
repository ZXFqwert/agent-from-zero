from dataclasses import dataclass, field
import os
from pathlib import Path
from urllib.parse import urlsplit


def bounded_env(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        result = int(os.environ.get(name, str(default)))
    except ValueError:
        raise ValueError(f"Invalid {name}") from None
    if not minimum <= result <= maximum:
        raise ValueError(f"Invalid {name}")
    return result


@dataclass(frozen=True)
class Settings:
    database: Path = Path(__file__).resolve().parents[1] / "data" / "lab.sqlite3"
    base_url: str = ""
    model: str = ""
    api_key: str = field(default="", repr=False)
    daily_runs: int = 10
    max_steps: int = 8
    run_seconds: float = 120
    max_output_tokens: int = 512
    token_days: int = 30

    @property
    def enabled(self) -> bool:
        return bool(self.base_url and self.model and self.api_key)

    @classmethod
    def from_env(cls):
        # Intentionally no dotenv discovery: root learning-project secrets are unrelated.
        base = os.environ.get("MODEL_BASE_URL", "").strip().rstrip("/")
        if base:
            parsed = urlsplit(base)
            if parsed.scheme not in {"https", "http"} or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
                raise ValueError("Invalid MODEL_BASE_URL")
        return cls(
            database=Path(os.environ.get("LAB_DATABASE", str(cls().database))),
            base_url=base,
            model=os.environ.get("MODEL_NAME", "").strip(),
            api_key=os.environ.get("MODEL_API_KEY", "").strip(),
            daily_runs=bounded_env("LAB_DAILY_RUNS", 10, 1, 10),
            max_steps=bounded_env("LAB_MAX_STEPS", 8, 1, 8),
            run_seconds=bounded_env("LAB_RUN_SECONDS", 120, 1, 120),
            max_output_tokens=bounded_env("LAB_MAX_OUTPUT_TOKENS", 512, 64, 2048),
            token_days=bounded_env("LAB_TOKEN_DAYS", 30, 1, 365),
        )
