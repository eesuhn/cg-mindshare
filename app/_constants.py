import os

from dotenv import load_dotenv


load_dotenv()

GITHUB_TOKEN = os.getenv('GITHUB_TOKEN')
GH_BASE_URL = 'https://api.github.com'
HEADERS = {
    'Accept': 'application/vnd.github+json',
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'X-GitHub-Api-Version': '2022-11-28'
}
