const GITHUB_TOKEN =
  '';
const GH_BASE_URL = 'https://api.github.com';
const HEADERS = {
  Accept: 'application/vnd.github+json',
  Authorization: 'Bearer ' + GITHUB_TOKEN,
  'X-GitHub-Api-Version': '2022-11-28',
};

function searchRepositories(
  query,
  per_page = 30,
  page = 1,
  created_start = '*',
  created_end = '*',
  pushed_start = '*',
  pushed_end = '*'
) {
  var url = GH_BASE_URL + '/search/repositories';

  // Append created filter if applicable.
  if (created_start !== '*' || created_end !== '*') {
    query += ' created:' + created_start + '..' + created_end;
  }

  // Append pushed filter if applicable.
  if (pushed_start !== '*' || pushed_end !== '*') {
    query += ' pushed:' + pushed_start + '..' + pushed_end;
  }

  // Construct query parameters.
  var params = {
    q: query,
    per_page: per_page,
    page: page,
  };
  var queryString = Object.keys(params)
    .map(function (key) {
      return key + '=' + encodeURIComponent(params[key]);
    })
    .join('&');

  var finalUrl = url + '?' + queryString;

  var options = {
    method: 'get',
    headers: HEADERS,
    muteHttpExceptions: false,
  };

  var response = UrlFetchApp.fetch(finalUrl, options);
  return JSON.parse(response.getContentText());
}

function countSearchRepoCreated(
  keyword,
  created_start = '*',
  created_end = '*'
) {
  var result = searchRepositories(keyword, 30, 1, created_start, created_end);
  return result.total_count || 0;
}

function countSearchRepoPushed(keyword, pushed_start = '*', pushed_end = '*') {
  // Use default '*' for created dates since this function filters on pushed dates.
  var result = searchRepositories(
    keyword,
    30,
    1,
    '*',
    '*',
    pushed_start,
    pushed_end
  );
  return result.total_count || 0;
}

function exportDataToSheet() {
  // Get the active spreadsheet and sheet.
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();

  // Define your keyword and date ranges.
  var keyword = 'coingecko';
  var start_date = '2021-01-01';
  var end_date = '2025-12-31';

  // Retrieve counts from GitHub API.
  var createdCount = countSearchRepoCreated(keyword, start_date, end_date);
  var pushedCount = countSearchRepoPushed(keyword, start_date, end_date);

  // Clear existing data and write headers.
  sheet.clear();
  sheet.appendRow(['Keyword', 'Created Count', 'Pushed Count']);

  // Append the data.
  sheet.appendRow([keyword, createdCount, pushedCount]);
}

function myFunction() {
  exportDataToSheet();
}
