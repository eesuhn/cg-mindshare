import sys

from eesuhn_sdk import (
    print_success,
    print_error
)
from .search import Search


class Main:
    keyword = 'coingecko'
    start_date = '2021-01-01'
    end_date = '2025-12-31'

    def __init__(self) -> None:
        if 'search-code' in sys.argv:
            self.count_search_code(
                keyword='coingecko'
            )
        if 'search-repo-created' in sys.argv:
            self.count_search_repo_created(
                keyword=self.keyword,
                created_start=self.start_date,
                created_end=self.end_date
            )
        if 'search-repo-pushed' in sys.argv:
            self.count_search_repo_pushed(
                keyword=self.keyword,
                pushed_start=self.start_date,
                pushed_end=self.end_date
            )

    def count_search_code(
        self,
        keyword: str,
    ) -> None:
        result = Search().search_code(
            query=keyword
        )
        total_count = result.get('total_count', 0)
        if total_count == 0:
            print_error(f'count_search_code: Keyword "{keyword}" was not found')
            return
        print_success(f'count_search_code: Keyword "{keyword}" was found {total_count} times')

    def count_search_repo_created(
        self,
        keyword: str,
        created_start: str = '*',
        created_end: str = '*'
    ) -> None:
        result = Search().search_repositories(
            query=keyword,
            created_start=created_start,
            created_end=created_end
        )
        total_count = result.get('total_count', 0)
        if total_count == 0:
            print_error(f'count_search_repo_created: Keyword "{keyword}" was not found')
            return
        print_success(f'count_search_repo_created: Keyword "{keyword}" was found {total_count} times')

    def count_search_repo_pushed(
        self,
        keyword: str,
        pushed_start: str = '*',
        pushed_end: str = '*'
    ) -> None:
        result = Search().search_repositories(
            query=keyword,
            pushed_start=pushed_start,
            pushed_end=pushed_end
        )
        total_count = result.get('total_count', 0)
        if total_count == 0:
            print_error(f'count_search_repo_pushed: Keyword "{keyword}" was not found')
            return
        print_success(f'count_search_repo_pushed: Keyword "{keyword}" was found {total_count} times')
