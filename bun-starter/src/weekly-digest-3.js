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

  if (created_start !== '*' || created_end !== '*') {
    query += ' created:' + created_start + '..' + created_end;
  }
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

// Returns the repository count for repositories created between the given dates.
function countSearchRepoCreated(keyword, created_start, created_end) {
  var result = searchRepositories(keyword, 30, 1, created_start, created_end);
  return result.total_count || 0;
}

// Returns the repository count for repositories pushed between the given dates.
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

// Compute the latest complete week's Saturday.
// Here we compute the current week's Sunday and subtract one day.
function getLastSaturday() {
  var today = new Date();
  var currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - today.getDay()); // Sunday of current week.
  var lastSaturday = new Date(currentWeekStart);
  lastSaturday.setDate(currentWeekStart.getDate() - 1);
  lastSaturday.setHours(0, 0, 0, 0);
  return lastSaturday;
}

// Build weekly intervals (Sunday to Saturday) from a given start date until the latest complete week.
function getWeeklyIntervals(startDateString) {
  var intervals = [];
  var startDate = new Date(startDateString);

  // Ensure the fixed start date is a Sunday. If not, adjust to the next Sunday.
  if (startDate.getDay() !== 0) {
    var daysToAdd = (7 - startDate.getDay()) % 7;
    startDate.setDate(startDate.getDate() + daysToAdd);
  }

  var lastSaturday = getLastSaturday();
  // Latest complete week starts 6 days before lastSaturday.
  var latestWeekStart = new Date(lastSaturday);
  latestWeekStart.setDate(lastSaturday.getDate() - 6);

  var currentStart = new Date(startDate);
  while (currentStart <= latestWeekStart) {
    var currentEnd = new Date(currentStart);
    currentEnd.setDate(currentStart.getDate() + 6);
    intervals.push({
      start: formatDate(currentStart),
      end: formatDate(currentEnd),
    });
    currentStart.setDate(currentStart.getDate() + 7);
  }
  return intervals;
}

// Generate dynamic header row based on keywords.
function generateHeader(keywords) {
  var header = ['Week Start', 'Week End'];
  keywords.forEach(function (keyword) {
    header.push(keyword + ' Created', keyword + ' Pushed');
  });
  return header;
}

// Main function: Backfill missing weekly data into the sheet.
// Reads existing "Week Start" values (from row 2 onward) and only fills missing intervals up to the latest complete week.
// Respects GitHub API rate limit and leaves header row intact.
function backfillWeeklyData() {
  var keywords = ['coingecko', 'birdeye', 'mobula'];
  var fixedStartDate = '2025-01-05'; // starting from this Sunday

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = 'weekly-repos-3';
  var sheet = ss.getSheetByName(sheetName);

  // Generate dynamic header.
  var header = generateHeader(keywords);

  // Create sheet if it doesn't exist; otherwise, ensure header row (row 1) is correct.
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
  } else {
    var existingHeader = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0];
    // Only update header if necessary.
    if (existingHeader.join('|') !== header.join('|')) {
      sheet.getRange(1, 1, 1, header.length).setValues([header]);
    }
  }

  // Read existing week start values from row 2 onward.
  var lastRow = sheet.getLastRow();
  var existingWeeks = {};
  if (lastRow > 1) {
    var weekStarts = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    weekStarts.forEach(function (row) {
      var cellValue = row[0];
      if (cellValue) {
        if (cellValue instanceof Date) {
          cellValue = formatDate(cellValue);
        }
        existingWeeks[cellValue] = true;
      }
    });
  }

  // Build all weekly intervals from fixed start date until the latest complete week.
  var intervals = getWeeklyIntervals(fixedStartDate);

  // Filter intervals missing in the sheet (by "Week Start").
  var intervalsToFill = intervals.filter(function (interval) {
    return !existingWeeks[interval.start];
  });

  // If no intervals to backfill, log and exit.
  if (intervalsToFill.length === 0) {
    Logger.log('No missing intervals. Nothing to backfill.');
    return;
  }

  // Calculate total API calls (2 per keyword per interval).
  var totalRequestsNeeded = intervalsToFill.length * keywords.length * 2;
  Logger.log('Total API requests needed: ' + totalRequestsNeeded);
  Logger.log(
    'Estimated time (in minutes): ' + Math.ceil(totalRequestsNeeded / 30)
  );

  var apiCallCount = 0;
  var rowsToAppend = [];

  // Process each missing weekly interval.
  intervalsToFill.forEach(function (interval) {
    var row = [interval.start, interval.end];
    keywords.forEach(function (keyword) {
      // Count repositories created.
      var createdCount = countSearchRepoCreated(
        keyword,
        interval.start,
        interval.end
      );
      apiCallCount++;
      if (apiCallCount % 30 === 0 && apiCallCount < totalRequestsNeeded) {
        Utilities.sleep(60000); // Pause for 60 seconds.
      }

      // Count repositories pushed.
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

  // Append new rows starting after the header row.
  var startRow = sheet.getLastRow() + 1;
  sheet
    .getRange(startRow, 1, rowsToAppend.length, header.length)
    .setValues(rowsToAppend);

  // Sort only the data rows (keeping header row intact) by "Week Start" (column 1).
  if (sheet.getLastRow() > 1) {
    sheet
      .getRange(2, 1, sheet.getLastRow() - 1, header.length)
      .sort({ column: 1, ascending: true });
  }

  Logger.log('Backfilled ' + rowsToAppend.length + ' week(s) of data.');
}

function myFunction() {
  backfillWeeklyData();
}
