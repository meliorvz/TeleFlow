"""Configuration management for Teleapps."""

import os
from pathlib import Path
from dataclasses import dataclass, field
from dotenv import load_dotenv


@dataclass
class Config:
    """Application configuration loaded from environment."""
    
    # Telegram
    tg_api_id: int = 0
    tg_api_hash: str = ""
    
    # Data paths
    data_dir: Path = field(default_factory=lambda: Path.home() / "Documents" / "teleapps")
    
    # Bulk send
    bulk_send_delay_seconds: int = 10
    bulk_send_max_per_job: int = 200
    
    # LLM (OpenRouter)
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    llm_model: str = "anthropic/claude-3.5-sonnet"
    llm_system_prompt: str | None = None
    
    # Report schedule
    report_cadence: str = "manual"  # manual | daily | weekly
    
    # Message cache limit per conversation
    message_cache_limit: int = 50
    
    # LLM conversation age cutoff (days)
    llm_conversation_max_age_days: int = 90
    
    # Web server
    web_host: str = "127.0.0.1"
    web_port: int = 8080
    
    @property
    def db_path(self) -> Path:
        return self.data_dir / "teleapps.db"
    
    @property
    def session_path(self) -> Path:
        return self.data_dir / "teleapps.session"
    
    @property
    def log_path(self) -> Path:
        return self.data_dir / "teleapps.log"
    
    @property
    def llm_enabled(self) -> bool:
        return bool(self.openrouter_api_key)


def load_config(env_file: Path | None = None) -> Config:
    """Load configuration from environment variables and optional .env file."""
    
    # Try to find config.env in various locations
    if env_file is None:
        for candidate in [
            Path.cwd() / "config.env",
            Path.cwd().parent / "config.env",  # If running from src/
            Path(__file__).parent.parent.parent.parent / "config.env",  # Relative to this file
            Path.home() / "teleapps" / "config.env",
            Path.home() / "Documents" / "teleapps" / "config.env",
        ]:
            if candidate.exists():
                env_file = candidate
                break
    
    if env_file and env_file.exists():
        load_dotenv(env_file)
    
    # Parse required values
    api_id_str = os.getenv("TG_API_ID", "0")
    try:
        api_id = int(api_id_str)
    except ValueError:
        api_id = 0
    
    # Parse optional integer values
    def get_int(key: str, default: int) -> int:
        try:
            return int(os.getenv(key, str(default)))
        except ValueError:
            return default
    
    # Build data_dir path
    data_dir_str = os.getenv("DATA_DIR")
    if data_dir_str:
        data_dir = Path(data_dir_str).expanduser()
    else:
        data_dir = Path.home() / "Documents" / "teleapps"
    
    return Config(
        tg_api_id=api_id,
        tg_api_hash=os.getenv("TG_API_HASH", ""),
        data_dir=data_dir,
        bulk_send_delay_seconds=get_int("BULK_SEND_DELAY_SECONDS", 10),
        bulk_send_max_per_job=get_int("BULK_SEND_MAX_PER_JOB", 200),
        openrouter_api_key=os.getenv("OPENROUTER_API_KEY", ""),
        openrouter_base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        llm_model=os.getenv("LLM_MODEL", "anthropic/claude-3.5-sonnet"),
        llm_system_prompt=os.getenv("LLM_SYSTEM_PROMPT"),
        report_cadence=os.getenv("REPORT_CADENCE", "manual"),
        message_cache_limit=get_int("MESSAGE_CACHE_LIMIT", 50),
        llm_conversation_max_age_days=get_int("LLM_CONVERSATION_MAX_AGE_DAYS", 90),
        web_host=os.getenv("WEB_HOST", "127.0.0.1"),
        web_port=get_int("WEB_PORT", 8080),
    )


def validate_config(config: Config) -> list[str]:
    """Validate configuration and return list of errors."""
    errors = []
    
    if not config.tg_api_id:
        errors.append("TG_API_ID is required")
    
    if not config.tg_api_hash:
        errors.append("TG_API_HASH is required")
    
    if config.report_cadence not in ("manual", "daily", "weekly"):
        errors.append(f"REPORT_CADENCE must be manual, daily, or weekly (got: {config.report_cadence})")
    
    return errors


# Global config instance (lazy loaded)
_config: Config | None = None


def get_config() -> Config:
    """Get the global config instance, loading if necessary."""
    global _config
    if _config is None:
        _config = load_config()
    return _config


def ensure_data_dir(config: Config) -> None:
    """Ensure the data directory exists."""
    config.data_dir.mkdir(parents=True, exist_ok=True)
