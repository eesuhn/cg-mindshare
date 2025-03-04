import sys

from eesuhn_sdk import (
    print_success,
    print_error
)
from .search import Search


class Main:
    def __init__(self) -> None:
        if 'search-code' in sys.argv:
            self.get_search_code_count(
                keyword='coingecko',
            )

    def get_search_code_count(
        self,
        keyword: str,
    ) -> None:
        count = Search().count_keyword(
            keyword=keyword
        )
        if count == 0:
            print_error(f'Keyword "{keyword}" was not found')
            return
        print_success(f'Keyword "{keyword}" was found {count} times')
