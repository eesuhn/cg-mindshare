import requests

from ._constants import (
    GH_BASE_URL,
    HEADERS
)


class Search:
    def search_repositories(
        self,
        query: str,
        per_page: int = 30,
        page: int = 1,
        created_start: str = '*',
        created_end: str = '*',
        pushed_start: str = '*',
        pushed_end: str = '*'
    ) -> dict:
        url = f'{GH_BASE_URL}/search/repositories'

        if created_start != '*' or created_end != '*':
            query += f' created:{created_start}..{created_end}'
        if pushed_start != '*' or pushed_end != '*':  # might cause error
            query += f' pushed:{pushed_start}..{pushed_end}'

        params: dict = {
            'q': query,
            'per_page': per_page,
            'page': page
        }
        response = requests.get(
            url=url,
            headers=HEADERS,
            params=params,
            timeout=10
        )
        response.raise_for_status()
        return response.json()

    def search_code(
        self,
        query: str,
        per_page: int = 30,
        page: int = 1
    ) -> dict:
        url = f'{GH_BASE_URL}/search/code'
        params: dict = {
            'q': query,
            'per_page': per_page,
            'page': page
        }
        response = requests.get(
            url=url,
            headers=HEADERS,
            params=params,
            timeout=10
        )
        response.raise_for_status()
        return response.json()
