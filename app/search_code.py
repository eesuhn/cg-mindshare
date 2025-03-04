import requests

from typing import Optional, Dict, Union
from ._constants import (
    GITHUB_TOKEN,
    BASE_URL
)
from eesuhn_sdk import (
    print_error
)


class SearchCode:
    headers = {
        'Accept': 'application/vnd.github+json',
        'Authorization': f'Bearer {GITHUB_TOKEN}',
        'X-GitHub-Api-Version': '2022-11-28'
    }

    def search_repositories(
        self,
        query: str,
        per_page: int = 10,  # TODO: What's the default value?
        page: int = 1
    ) -> dict:
        url = f'{BASE_URL}/search/repositories'
        params: Dict[str, Union[str, int]] = {
            'q': query,
            'per_page': per_page,
            'page': page
        }
        response = requests.get(
            url,
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
        url = f'{BASE_URL}/search/code'
        params: Dict[str, Union[str, int]] = {
            'q': query,
            'per_page': per_page,
            'page': page
        }
        response = requests.get(
            url,
            headers=self.headers,
            params=params,
            timeout=10
        )
        response.raise_for_status()
        return response.json()

    def count_keyword_occurrences(
        self,
        keyword: str,
        language: Optional[str] = None
    ) -> int:
        query = f'{keyword}+language:{language}' if language else keyword
        result = self.search_code(query)
        if 'total_count' not in result:
            print_error('No total_count found')
            return 0
        total_count = result.get('total_count', 0)
        return total_count
