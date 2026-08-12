from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Presyong Palengke"
    environment: str = "development"
    cors_origins: list[str] = ["http://localhost:5175", "http://127.0.0.1:5175"]

    # Deployed Apps Script web app URL (ends with /exec). Optional if spreadsheet CSV works.
    sheets_webapp_url: str = ""

    # Google Sheet used by the scraper / dashboard.
    spreadsheet_id: str = "1aRYXiGhhoeDQNNb4T1ooXubO11VlLs86bSIpvF1HtK8"
    latest_sheet_gid: str = "77241631"

    # Optional local JSON fixture for offline / first run.
    sample_data_path: str = ""
    cache_ttl_seconds: int = 300
    request_timeout_seconds: int = 120

    @property
    def resolved_sample_path(self) -> Path:
        if self.sample_data_path:
            path = Path(self.sample_data_path)
            if path.is_file():
                return path
        return Path(__file__).resolve().parents[1] / "data" / "sample_latest.json"

    @property
    def latest_csv_url(self) -> str:
        sheet_id = self.spreadsheet_id.strip()
        gid = self.latest_sheet_gid.strip() or "0"
        if not sheet_id:
            return ""
        return (
            f"https://docs.google.com/spreadsheets/d/{sheet_id}/export"
            f"?format=csv&gid={gid}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
