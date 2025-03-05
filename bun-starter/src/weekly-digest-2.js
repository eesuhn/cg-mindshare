const GITHUB_TOKEN = '';
const GH_BASE_URL = 'https://api.github.com';
const HEADERS = {
  Accept: 'application/vnd.github+json',
  Authorization: 'Bearer ' + GITHUB_TOKEN,
  'X-GitHub-Api-Version': '2022-11-28',
};

// Query the GitHub API with optional created and pushed date filters.
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

  // Append created filter if specified.
  if (created_start !== '*' || created_end !== '*') {
    query += ' created:' + created_start + '..' + created_end;
  }
  // Append pushed filter if specified.
  if (pushed_start !== '*' || pushed_end !== '*') {
    query += ' pushed:' + pushed_start + '..' + pushed_end;
  }

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

// Returns the total repository count for repositories created between the given dates.
function countSearchRepoCreated(keyword, created_start, created_end) {
  var result = searchRepositories(keyword, 30, 1, created_start, created_end);
  return result.total_count || 0;
}

// Returns the total repository count for repositories pushed between the given dates.
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

// Format a Date object to "YYYY-MM-DD".
function formatDate(date) {
  var year = date.getFullYear();
  var month = (date.getMonth() + 1).toString().padStart(2, '0');
  var day = date.getDate().toString().padStart(2, '0');
  return year + '-' + month + '-' + day;
}

// Returns the last Saturday (end of the most recent complete week).
function getLastSaturday() {
  var today = new Date();
  var dayOfWeek = today.getDay(); // Sunday = 0, Saturday = 6.
  var offset = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
  var lastSaturday = new Date(today);
  lastSaturday.setDate(today.getDate() - offset);
  lastSaturday.setHours(0, 0, 0, 0);
  return lastSaturday;
}

// Build weekly intervals (Sunday to Saturday) from a given start date until the last complete week.
function getWeeklyIntervals(startDateString) {
  var intervals = [];
  var startDate = new Date(startDateString);
  var lastSaturday = getLastSaturday();

  // Loop over weeks until the week ending after startDate exceeds lastSaturday.
  var currentStart = new Date(startDate);
  while (true) {
    var currentEnd = new Date(currentStart);
    currentEnd.setDate(currentStart.getDate() + 6);
    if (currentEnd > lastSaturday) break;
    intervals.push({
      start: formatDate(currentStart),
      end: formatDate(currentEnd),
    });
    currentStart.setDate(currentStart.getDate() + 7);
  }
  return intervals;
}

// Main function: backfill missing weekly data if the sheet is missing rows.
// It respects GitHub's rate limit of 30 requests per minute by batching API calls.
function backfillWeeklyData() {
  var sheetName = 'weekly-repos-1';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  // Create the sheet if it doesn't exist and write header.
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    var header = [
      'Week Start',
      'Week End',
      'coingecko Created',
      'coingecko Pushed',
      'birdeye Created',
      'birdeye Pushed',
      'mobula Created',
      'mobula Pushed',
    ];
    sheet.appendRow(header);
  }

  // Read existing week start dates from the sheet (assuming header is in row 1).
  var dataRange = sheet.getDataRange();
  var data = dataRange.getValues();
  var existingWeeks = {};
  for (var i = 1; i < data.length; i++) {
    var weekStart = data[i][0];
    if (weekStart) {
      existingWeeks[weekStart] = true;
    }
  }

  // Get all weekly intervals from 2025-01-05 (Sunday) up to the last complete week.
  var intervals = getWeeklyIntervals('2025-01-05');

  // Only process intervals that are not already in the sheet.
  var intervalsToFill = intervals.filter(function (interval) {
    return !existingWeeks[interval.start];
  });

  // Calculate the total API calls required (6 calls per interval).
  var totalRequestsNeeded = intervalsToFill.length * 6;
  var batches = Math.ceil(totalRequestsNeeded / 30);
  Logger.log('Total API requests needed: ' + totalRequestsNeeded);
  Logger.log('Estimated time (in minutes): ' + batches);

  var keywords = ['coingecko', 'birdeye', 'mobula'];
  var rowsToAppend = [];
  var apiCallCount = 0;

  // Loop over each missing weekly interval.
  intervalsToFill.forEach(function (interval) {
    var row = [interval.start, interval.end];
    keywords.forEach(function (keyword) {
      // Count repositories created in the interval.
      var createdCount = countSearchRepoCreated(
        keyword,
        interval.start,
        interval.end
      );
      apiCallCount++;
      if (apiCallCount % 30 === 0 && apiCallCount < totalRequestsNeeded) {
        // Pause for 60 seconds to respect rate limit.
        Utilities.sleep(60000);
      }

      // Count repositories pushed in the interval.
      var pushedCount = countSearchRepoPushed(
        keyword,
        interval.start,
        interval.end
      );
      apiCallCount++;
      if (apiCallCount % 30 === 0 && apiCallCount < totalRequestsNeeded) {
        Utilities.sleep(60000);
      }

      row.push(createdCount, pushedCount);
    });
    rowsToAppend.push(row);
  });

  // Append the new rows to the sheet.
  if (rowsToAppend.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    sheet
      .getRange(startRow, 1, rowsToAppend.length, rowsToAppend[0].length)
      .setValues(rowsToAppend);
    Logger.log('Backfilled ' + rowsToAppend.length + ' weeks of data.');
  } else {
    Logger.log('No missing intervals. Nothing to backfill.');
  }
}

function myFunction() {
  backfillWeeklyData();
}
