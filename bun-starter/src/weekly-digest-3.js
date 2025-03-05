const GITHUB_TOKEN =
  '';
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

// Returns the last complete week's Saturday.
// We define the latest complete week as the week ending on the last Saturday before today.
function getLastSaturday() {
  var today = new Date();
  var dayOfWeek = today.getDay(); // Sunday=0, ... Saturday=6
  // Always move back to last Saturday (even if today is Saturday).
  var offset = dayOfWeek + 1;
  var lastSaturday = new Date(today);
  lastSaturday.setDate(today.getDate() - offset);
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
  // Latest complete week interval: weekStart = lastSaturday - 6 days.
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
// It reads the existing "Week Start" values and only fills missing intervals
// up to the latest complete week, pausing as needed to respect the GitHub API rate limit.
function backfillWeeklyData() {
  var keywords = ['coingecko', 'birdeye', 'mobula'];
  var fixedStartDate = '2025-01-05'; // starting from this Sunday

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = 'weekly-repos-2';
  var sheet = ss.getSheetByName(sheetName);

  // Generate header dynamically.
  var header = generateHeader(keywords);

  // If the sheet doesn't exist, create it and add the header row.
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(header);
  } else {
    // Check/update the header row if necessary.
    var lastColumn = Math.max(sheet.getLastColumn(), 1);
    var existingHeader = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    if (existingHeader.join('|') !== header.join('|')) {
      sheet.getRange(1, 1, 1, header.length).setValues([header]);
    }
  }

  // Read existing week start values from the sheet (skip header row).
  var lastRow = sheet.getLastRow();
  var existingWeeks = {};
  if (lastRow > 1) {
    var weekStarts = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    weekStarts.forEach(function (row) {
      var cellValue = row[0];
      if (cellValue) {
        // Convert Date object to string if necessary.
        if (cellValue instanceof Date) {
          cellValue = formatDate(cellValue);
        }
        existingWeeks[cellValue] = true;
      }
    });
  }

  // Build all weekly intervals from fixed start date until the latest complete week.
  var intervals = getWeeklyIntervals(fixedStartDate);

  // Filter to only intervals that are missing in the sheet (based on "Week Start").
  var intervalsToFill = intervals.filter(function (interval) {
    return !existingWeeks[interval.start];
  });

  // Calculate the total number of API calls needed.
  // Each interval requires 2 calls per keyword (created and pushed).
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
      // Get count for repositories created in the interval.
      var createdCount = countSearchRepoCreated(
        keyword,
        interval.start,
        interval.end
      );
      apiCallCount++;
      if (apiCallCount % 30 === 0 && apiCallCount < totalRequestsNeeded) {
        Utilities.sleep(60000); // Pause 60 seconds if 30 requests have been made.
      }

      // Get count for repositories pushed in the interval.
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
      .getRange(startRow, 1, rowsToAppend.length, header.length)
      .setValues(rowsToAppend);
    // Sort the sheet by the "Week Start" column (assumed to be column 1).
    sheet.sort(1);
    Logger.log('Backfilled ' + rowsToAppend.length + ' weeks of data.');
  } else {
    Logger.log('No missing intervals. Nothing to backfill.');
  }
}

function myFunction() {
  backfillWeeklyData();
}
