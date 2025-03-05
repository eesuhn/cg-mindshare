const GITHUB_TOKEN =
  '';
const GH_BASE_URL = 'https://api.github.com';
const HEADERS = {
  Accept: 'application/vnd.github+json',
  Authorization: 'Bearer ' + GITHUB_TOKEN,
  'X-GitHub-Api-Version': '2022-11-28',
};

// Makes the API call to GitHub, adding created and pushed filters if provided.
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

  // Append created filter if provided.
  if (created_start !== '*' || created_end !== '*') {
    query += ' created:' + created_start + '..' + created_end;
  }

  // Append pushed filter if provided.
  if (pushed_start !== '*' || pushed_end !== '*') {
    query += ' pushed:' + pushed_start + '..' + pushed_end;
  }

  var params = {
    q: query,
    per_page: per_page,
    page: page,
  };

  // Build query string.
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

// Returns the total count for repositories created between the given dates.
function countSearchRepoCreated(keyword, created_start, created_end) {
  var result = searchRepositories(keyword, 30, 1, created_start, created_end);
  return result.total_count || 0;
}

// Returns the total count for repositories pushed between the given dates.
function countSearchRepoPushed(keyword, pushed_start, pushed_end) {
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

// Formats a Date object as YYYY-MM-DD.
function formatDate(date) {
  var year = date.getFullYear();
  var month = (date.getMonth() + 1).toString().padStart(2, '0');
  var day = date.getDate().toString().padStart(2, '0');
  return year + '-' + month + '-' + day;
}

// Determines the most recent complete week by finding the last Saturday.
// If today is Saturday, it uses today; otherwise, it subtracts the needed days.
function getLastSaturday() {
  var today = new Date();
  var dayOfWeek = today.getDay(); // Sunday = 0, Monday = 1, ... Saturday = 6.
  var offset = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
  var lastSaturday = new Date(today);
  lastSaturday.setDate(today.getDate() - offset);
  lastSaturday.setHours(0, 0, 0, 0);
  return lastSaturday;
}

// Main function that computes weekly intervals, queries GitHub for each keyword and interval,
// and exports the aggregated data to the "Weekly GitHub Repos" sheet.
function exportWeeklyData() {
  var keywords = ['coingecko', 'birdeye', 'mobula'];
  var numWeeks = 4;

  // Determine the last complete week's Saturday.
  var lastSaturday = getLastSaturday();

  // Build an array of intervals (each interval is Sunday to Saturday).
  // Intervals are sorted from oldest to newest.
  var intervals = [];
  for (var i = numWeeks - 1; i >= 0; i--) {
    var weekEnd = new Date(lastSaturday);
    weekEnd.setDate(lastSaturday.getDate() - i * 7);
    var weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6);
    intervals.push({
      start: formatDate(weekStart),
      end: formatDate(weekEnd),
    });
  }

  // Create or clear the sheet for export.
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = 'Weekly GitHub Repos';
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clear();
  }

  // Prepare header row.
  // First two columns: Week Start and Week End.
  // Then, for each keyword, two columns: one for Created count and one for Pushed count.
  var header = ['Week Start', 'Week End'];
  keywords.forEach(function (keyword) {
    header.push(keyword + ' Created', keyword + ' Pushed');
  });

  var data = [];
  data.push(header);

  // For each weekly interval, query the GitHub API for each keyword.
  intervals.forEach(function (interval) {
    var row = [interval.start, interval.end];
    keywords.forEach(function (keyword) {
      var createdCount = countSearchRepoCreated(
        keyword,
        interval.start,
        interval.end
      );
      var pushedCount = countSearchRepoPushed(
        keyword,
        interval.start,
        interval.end
      );
      row.push(createdCount, pushedCount);
    });
    data.push(row);
  });

  // Write the aggregated data to the sheet.
  sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
}

function myFunction() {
  exportWeeklyData();
}
