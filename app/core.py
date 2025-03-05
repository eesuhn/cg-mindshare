import requests

from ._constants import (
    GH_BASE_URL,
    HEADERS
)


class Core:
    def rate_limit(self) -> dict:
        url = f'{GH_BASE_URL}/rate_limit'
        response = requests.get(
            url=url,
            headers=HEADERS,
            timeout=10
        )
        response.raise_for_status()
        return response.json()
