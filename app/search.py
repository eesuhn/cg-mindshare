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
        page: int = 1
    ) -> dict:
        url = f'{self.BASE_URL}/search/repositories'
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

    def count_keyword(
        self,
        keyword: str
    ) -> int:
        result = self.search_code(keyword)
        if 'total_count' not in result:
            return 0
        total_count = result.get('total_count', 0)
        return total_count
