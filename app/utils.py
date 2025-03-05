import json

from eesuhn_sdk import (
    print_error,
    print_success
)
from typing import Optional
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo


def get_package_root() -> Path:
    return Path(__file__).parent


def get_current_time() -> str:
    """
    Returns the current time in the format `YYYY-MM-DD`
    """
    return datetime.now().strftime('%Y-%m-%d')


def convert_unix_to_myt(
    unix_time: int
) -> datetime:
    """
    Returns the time in the Malaysia timezone
    """
    return datetime.fromtimestamp(
        timestamp=unix_time,
        tz=ZoneInfo('Asia/Kuala_Lumpur')
    )


def print_json(
    data: Optional[dict]
) -> None:
    if data is None:
        print_error('No JSON data to print')
        return
    print(json.dumps(data, indent=2))


def log_json(
    data: Optional[dict],
    filename: str,
    dest: str = 'logs'
) -> None:
    if data is None:
        print_error('No JSON data to log')
        return
    path = get_package_root() / dest
    file = path / f"{filename}_{get_current_time()}.json"
    with open(file, 'w', encoding='utf-8') as f:
        f.write(json.dumps(data, indent=2))
    print_success(f'JSON data logged to {file}')
