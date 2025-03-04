from eesuhn_sdk import print_success
from .search_code import SearchCode
from typing import Optional


class Main:
    def __init__(self) -> None:
        self.get_search_code_count(
            keyword='coingecko',
            # language='python'
        )
        pass

    def get_search_code_count(
        self,
        keyword: str,
        language: Optional[str] = None
    ) -> None:
        count = SearchCode().count_keyword_occurrences(
            keyword=keyword,
            language=language
        )
        print_success(f'Keyword "{keyword}" was found {count} times')
