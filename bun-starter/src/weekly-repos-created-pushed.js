const KEYWORDS = ['coingecko'];
const FIXED_START_DATE = '2025-01-05'; // starting from this Sunday.
const TARGET_SHEET_NAME = 'weekly-repos-created-pushed';

const GITHUB_TOKEN = '';
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

function countSearchRepoCreated(keyword, created_start, created_end) {
  var result = searchRepositories(keyword, 30, 1, created_start, created_end);
  return result.total_count || 0;
}

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

/**
 * Format a Date object as "YYYY-MM-DD".
 *
 * @param {Date} date
 * @returns
 */
function formatDate(date) {
  var year = date.getFullYear();
  var month = (date.getMonth() + 1).toString().padStart(2, '0');
  var day = date.getDate().toString().padStart(2, '0');
  return year + '-' + month + '-' + day;
}

/**
 * * Computes the latest complete week's Saturday.
 * * Current week's Sunday is computed and then the previous day is taken as Saturday.
 *
 * @returns
 */
function getLastSaturday() {
  var today = new Date();
  var currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - today.getDay()); // Sunday of current week.
  var lastSaturday = new Date(currentWeekStart);
  lastSaturday.setDate(currentWeekStart.getDate() - 1);
  lastSaturday.setHours(0, 0, 0, 0);
  return lastSaturday;
}

/**
 * Generates weekly intervals (Sunday to Saturday) from FIXED_START_DATE until the latest complete week.
 *
 * @param {string} startDateString
 * @returns
 */
function getWeeklyIntervals(startDateString) {
  var intervals = [];
  var startDate = new Date(startDateString);
  // Ensure the fixed start date is a Sunday.
  if (startDate.getDay() !== 0) {
    var daysToAdd = (7 - startDate.getDay()) % 7;
    startDate.setDate(startDate.getDate() + daysToAdd);
  }

  var lastSaturday = getLastSaturday();
  var latestWeekStart = new Date(lastSaturday);
  latestWeekStart.setDate(lastSaturday.getDate() - 6); // Latest complete week starts 6 days before lastSaturday.

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

function generateHeader(keywords) {
  var header = ['week-start', 'week-end'];
  keywords.forEach(function (keyword) {
    header.push(keyword + '_created', keyword + '_pushed');
  });
  return header;
}

/**
 * * Updates each existing row (starting from row 2) to fill in data for any new keywords.
 * * For each row, if the expected cell for a keyword is missing or empty,
 *   it computes the created and pushed counts and updates the row.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string[]} header
 * @returns
 */
function updateExistingRowsForNewKeywords(sheet, header) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return; // no data rows exist.

  var dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
  var data = dataRange.getValues();
  var updatedData = [];
  var apiCallCount = 0;

  // For each existing row, ensure it has columns matching the new header.
  data.forEach(function (row) {
    while (row.length < header.length) {
      row.push('');
    }
    var weekStart = row[0];
    var weekEnd = row[1];
    if (weekStart instanceof Date) {
      weekStart = formatDate(weekStart);
    }
    if (weekEnd instanceof Date) {
      weekEnd = formatDate(weekEnd);
    }
    // For each keyword, the expected columns are:
    // created: index = 2 + (i*2)
    // pushed: index = 2 + (i*2) + 1
    KEYWORDS.forEach(function (keyword, i) {
      var createdIndex = 2 + i * 2;
      var pushedIndex = 2 + i * 2 + 1;
      // If cell is empty (or undefined), then update.
      if (
        row[createdIndex] === '' ||
        row[createdIndex] === null ||
        row[createdIndex] === undefined
      ) {
        var createdCount = countSearchRepoCreated(keyword, weekStart, weekEnd);
        row[createdIndex] = createdCount;
        apiCallCount++;
        if (apiCallCount % 30 === 0) {
          Utilities.sleep(60000); // Pause for 60 seconds.
        }
      }
      if (
        row[pushedIndex] === '' ||
        row[pushedIndex] === null ||
        row[pushedIndex] === undefined
      ) {
        var pushedCount = countSearchRepoPushed(keyword, weekStart, weekEnd);
        row[pushedIndex] = pushedCount;
        apiCallCount++;
        if (apiCallCount % 30 === 0) {
          Utilities.sleep(60000); // Pause for 60 seconds.
        }
      }
    });
    updatedData.push(row);
  });
  sheet
    .getRange(2, 1, updatedData.length, header.length)
    .setValues(updatedData);
}

/**
 * Main function that:
 * 1. Ensures the header row is up-to-date.
 * 2. Updates existing rows with data for any new keywords.
 * 3. Appends rows for missing weekly intervals.
 * 4. Sorts the data (excluding header) by "week-start".
 *
 * @returns
 */
function backfillWeeklyData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TARGET_SHEET_NAME);
  var header = generateHeader(KEYWORDS);

  // Create the sheet if it doesn't exist or update header row.
  if (!sheet) {
    sheet = ss.insertSheet(TARGET_SHEET_NAME);
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
  } else {
    var existingHeader = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0];
    // If header is different, update it.
    if (existingHeader.join('|') !== header.join('|')) {
      sheet.getRange(1, 1, 1, header.length).setValues([header]);
    }
  }

  // First, update existing rows (row 2 onward) to fill in missing columns for new keywords.
  updateExistingRowsForNewKeywords(sheet, header);

  // Read existing week-start values from the sheet.
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

  // Build all weekly intervals from FIXED_START_DATE until the latest complete week.
  var intervals = getWeeklyIntervals(FIXED_START_DATE);

  // Filter intervals missing in the sheet.
  var intervalsToFill = intervals.filter(function (interval) {
    return !existingWeeks[interval.start];
  });

  // If there are no missing intervals, log and exit.
  if (intervalsToFill.length === 0) {
    Logger.log('No missing intervals. Nothing to backfill.');
    return;
  }

  // Calculate the total API calls needed (2 calls per keyword per missing interval).
  var totalRequestsNeeded = intervalsToFill.length * KEYWORDS.length * 2;
  Logger.log('Total API requests needed: ' + totalRequestsNeeded);
  Logger.log(
    'Estimated time (in minutes): ' + Math.ceil(totalRequestsNeeded / 30)
  );

  var apiCallCount = 0;
  var rowsToAppend = [];

  intervalsToFill.forEach(function (interval) {
    var row = [interval.start, interval.end];
    KEYWORDS.forEach(function (keyword) {
      var createdCount = countSearchRepoCreated(
        keyword,
        interval.start,
        interval.end
      );
      apiCallCount++;
      if (apiCallCount % 30 === 0 && apiCallCount < totalRequestsNeeded) {
        Utilities.sleep(60000); // Pause for 60 seconds.
      }
      var pushedCount = countSearchRepoPushed(
        keyword,
        interval.start,
        interval.end
      );
      apiCallCount++;
      if (apiCallCount % 30 === 0 && apiCallCount < totalRequestsNeeded) {
        Utilities.sleep(60000); // Pause for 60 seconds.
      }
      row.push(createdCount, pushedCount);
    });
    rowsToAppend.push(row);
  });

  // Append the new rows (starting after the last row, preserving header row).
  var startRow = sheet.getLastRow() + 1;
  sheet
    .getRange(startRow, 1, rowsToAppend.length, header.length)
    .setValues(rowsToAppend);

  // Sort only the data rows (rows 2 onward) by "week-start" (first column).
  if (sheet.getLastRow() > 1) {
    sheet
      .getRange(2, 1, sheet.getLastRow() - 1, header.length)
      .sort({ column: 1, ascending: true });
  }

  Logger.log('Backfilled ' + rowsToAppend.length + ' week(s) of data.');
}

/**
 * Main entry point.
 */
function myFunction() {
  backfillWeeklyData();
}
