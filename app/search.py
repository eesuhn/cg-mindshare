import requests

from ._constants import (
    GITHUB_TOKEN
)


class Search:
    BASE_URL = 'https://api.github.com'
    headers = {
        'Accept': 'application/vnd.github+json',
        'Authorization': f'Bearer {GITHUB_TOKEN}',
        'X-GitHub-Api-Version': '2022-11-28'
    }

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
        url = f'{self.BASE_URL}/search/repositories'

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
            headers=self.headers,
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
        url = f'{self.BASE_URL}/search/code'
        params: dict = {
            'q': query,
            'per_page': per_page,
            'page': page
        }
        response = requests.get(
            url=url,
            headers=self.headers,
            params=params,
            timeout=10
        )
        response.raise_for_status()
        return response.json()
