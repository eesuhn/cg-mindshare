// Constants
const KEYWORDS = [
  'CoinGecko',
  'CoinMarketCap',
  'CoinPaprika',
  'DexScreener',
  'Moralis',
  'DexPaprika',
  '"Defined.fi"',
  '"Codex.io"',

  // Keyword(s) that search unintended projects.
  'Birdeye',
  'Mobula',
];
const FIXED_START_DATE = '2023-12-31'; // starting from this Sunday.
const TARGET_SHEET_NAME = 'weekly-repos-created-pushed';

const GITHUB_TOKEN = ''; // <-- Insert your GitHub token here.
const GH_BASE_URL = 'https://api.github.com';
const HEADERS = {
  Accept: 'application/vnd.github+json',
  Authorization: 'Bearer ' + GITHUB_TOKEN,
  'X-GitHub-Api-Version': '2022-11-28',
};

/**
 * Checks the API call count and pauses for 60 seconds every 30 calls.
 * @param {number} apiCallCount - Current number of API calls.
 * @param {number} totalRequestsNeeded - Total API requests planned.
 */
function checkRateLimit(apiCallCount, totalRequestsNeeded) {
  if (apiCallCount % 30 === 0 && apiCallCount < totalRequestsNeeded) {
    Logger.log(
      `API call count reached ${apiCallCount}. Sleeping for 60 seconds.`
    );
    Utilities.sleep(60000);
  }
}

/**
 * Queries GitHub's search API.
 * @param {string} query - Base query string.
 * @param {number} [per_page=30] - Results per page.
 * @param {number} [page=1] - Page number.
 * @param {string} [created_start='*'] - Created start date.
 * @param {string} [created_end='*'] - Created end date.
 * @param {string} [pushed_start='*'] - Pushed start date.
 * @param {string} [pushed_end='*'] - Pushed end date.
 * @returns {Object} Parsed JSON response.
 */
function searchRepositories(
  query,
  per_page = 30,
  page = 1,
  created_start = '*',
  created_end = '*',
  pushed_start = '*',
  pushed_end = '*'
) {
  let url = GH_BASE_URL + '/search/repositories';
  if (created_start !== '*' || created_end !== '*') {
    query += ' created:' + created_start + '..' + created_end;
  }
  if (pushed_start !== '*' || pushed_end !== '*') {
    query += ' pushed:' + pushed_start + '..' + pushed_end;
  }
  const params = {
    q: query,
    per_page,
    page,
  };
  const queryString = Object.keys(params)
    .map((key) => key + '=' + encodeURIComponent(params[key]))
    .join('&');
  const finalUrl = url + '?' + queryString;
  const options = {
    method: 'get',
    headers: HEADERS,
    muteHttpExceptions: false,
  };
  const response = UrlFetchApp.fetch(finalUrl, options);
  return JSON.parse(response.getContentText());
}

/**
 * Returns the total repository count for repos created in a given interval.
 */
function countSearchRepoCreated(keyword, created_start, created_end) {
  const result = searchRepositories(keyword, 30, 1, created_start, created_end);
  return result.total_count || 0;
}

/**
 * Returns the total repository count for repos pushed in a given interval.
 */
function countSearchRepoPushed(keyword, pushed_start, pushed_end) {
  const result = searchRepositories(
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
 * Formats a Date object as "YYYY-MM-DD".
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Computes the latest complete week's Saturday using the script's timezone.
 * For example, if the current date is 2025-03-05 (Wednesday),
 * this function returns 2025-03-01.
 */
function getLastSaturday() {
  const timeZone = Session.getScriptTimeZone();
  // Get today's date string in the script timezone.
  const todayStr = Utilities.formatDate(new Date(), timeZone, 'yyyy-MM-dd');
  const today = new Date(todayStr);
  const dayOfWeek = today.getDay(); // Sunday=0, Monday=1, ..., Saturday=6
  // Compute the current week's Sunday.
  const currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - dayOfWeek);
  // Last Saturday is one day before current week's Sunday.
  const lastSaturday = new Date(currentWeekStart);
  lastSaturday.setDate(currentWeekStart.getDate() - 1);
  return lastSaturday;
}

/**
 * Generates weekly intervals (Sunday to Saturday) from FIXED_START_DATE until the latest complete week.
 * @param {string} startDateString
 * @returns {Array<Object>} Array of intervals with {start, end}.
 */
function getWeeklyIntervals(startDateString) {
  const intervals = [];
  const startDate = new Date(startDateString);
  // Ensure the fixed start date is a Sunday.
  if (startDate.getDay() !== 0) {
    const daysToAdd = (7 - startDate.getDay()) % 7;
    startDate.setDate(startDate.getDate() + daysToAdd);
  }
  const lastSaturday = getLastSaturday();
  const latestWeekStart = new Date(lastSaturday);
  latestWeekStart.setDate(lastSaturday.getDate() - 6); // Latest complete week starts 6 days before lastSaturday.
  let currentStart = new Date(startDate);
  while (currentStart <= latestWeekStart) {
    const currentEnd = new Date(currentStart);
    currentEnd.setDate(currentStart.getDate() + 6);
    intervals.push({
      start: formatDate(currentStart),
      end: formatDate(currentEnd),
    });
    currentStart.setDate(currentStart.getDate() + 7);
  }
  return intervals;
}

/**
 * Generates a header row dynamically based on KEYWORDS.
 * The header row always begins with "week-start" and "week-end".
 * @param {Array<string>} keywords
 * @returns {Array<string>} Header row.
 */
function generateHeader(keywords) {
  const header = ['week-start', 'week-end'];
  keywords.forEach((keyword) =>
    header.push(`${keyword}_created`, `${keyword}_pushed`)
  );
  return header;
}

/**
 * Updates each existing row (starting from row 2) to fill in data for any new keywords.
 * For each row, if the expected cell for a keyword is missing or empty,
 * it computes the created and pushed counts and updates the row.
 * Logs the process for each update.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Array<string>} header
 */
function updateExistingRowsForNewKeywords(sheet, header) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('No data rows exist. Skipping update of existing rows.');
    return;
  }
  const dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
  const data = dataRange.getValues();
  const updatedData = [];
  let apiCallCount = 0;

  data.forEach((row, rowIndex) => {
    while (row.length < header.length) row.push('');
    let weekStart = row[0];
    let weekEnd = row[1];
    if (weekStart instanceof Date) weekStart = formatDate(weekStart);
    if (weekEnd instanceof Date) weekEnd = formatDate(weekEnd);

    KEYWORDS.forEach((keyword, i) => {
      const createdIndex = 2 + i * 2;
      const pushedIndex = createdIndex + 1;

      if (row[createdIndex] === '' || row[createdIndex] == null) {
        Logger.log(
          `Row ${rowIndex + 2}: Missing ${keyword}_created for week ${weekStart}`
        );
        const createdCount = countSearchRepoCreated(
          keyword,
          weekStart,
          weekEnd
        );
        row[createdIndex] = createdCount;
        apiCallCount++;
        checkRateLimit(apiCallCount, Number.MAX_SAFE_INTEGER);
      }
      if (row[pushedIndex] === '' || row[pushedIndex] == null) {
        Logger.log(
          `Row ${rowIndex + 2}: Missing ${keyword}_pushed for week ${weekStart}`
        );
        const pushedCount = countSearchRepoPushed(keyword, weekStart, weekEnd);
        row[pushedIndex] = pushedCount;
        apiCallCount++;
        checkRateLimit(apiCallCount, Number.MAX_SAFE_INTEGER);
      }
    });
    updatedData.push(row);
  });

  sheet
    .getRange(2, 1, updatedData.length, header.length)
    .setValues(updatedData);
  Logger.log(`Updated missing cells. Total API calls made: ${apiCallCount}`);
}

/**
 * Main function that:
 * 1. Ensures the header row is up-to-date.
 * 2. Updates existing rows for any new keywords.
 * 3. Appends rows for missing weekly intervals.
 * 4. Sorts the data (excluding the header) by "week-start".
 */
function backfillWeeklyData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TARGET_SHEET_NAME);
  const header = generateHeader(KEYWORDS);

  // Create the sheet if it doesn't exist; otherwise, update header if needed.
  if (!sheet) {
    sheet = ss.insertSheet(TARGET_SHEET_NAME);
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
  } else {
    const existingHeader = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0];
    if (existingHeader.join('|') !== header.join('|')) {
      sheet.getRange(1, 1, 1, header.length).setValues([header]);
    }
  }

  // Update existing rows for any new keywords.
  updateExistingRowsForNewKeywords(sheet, header);

  // Build set of existing week-start values.
  const lastRow = sheet.getLastRow();
  const existingWeeks = {};
  if (lastRow > 1) {
    const weekStarts = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    weekStarts.forEach((row) => {
      let cellValue = row[0];
      if (cellValue) {
        if (cellValue instanceof Date) cellValue = formatDate(cellValue);
        existingWeeks[cellValue] = true;
      }
    });
  }

  // Build all weekly intervals from FIXED_START_DATE until the latest complete week.
  const intervals = getWeeklyIntervals(FIXED_START_DATE);
  const intervalsToFill = intervals.filter(
    (interval) => !existingWeeks[interval.start]
  );

  if (intervalsToFill.length === 0) {
    Logger.log('No missing intervals. Nothing to backfill.');
    return;
  }

  const totalRequestsNeeded = intervalsToFill.length * KEYWORDS.length * 2;
  Logger.log(`Total API requests needed: ${totalRequestsNeeded}`);
  Logger.log(
    `Estimated time (in minutes): ${Math.ceil(totalRequestsNeeded / 30)}`
  );

  let apiCallCount = 0;
  const rowsToAppend = [];

  intervalsToFill.forEach((interval) => {
    const row = [interval.start, interval.end];
    KEYWORDS.forEach((keyword) => {
      const createdCount = countSearchRepoCreated(
        keyword,
        interval.start,
        interval.end
      );
      apiCallCount++;
      checkRateLimit(apiCallCount, totalRequestsNeeded);
      const pushedCount = countSearchRepoPushed(
        keyword,
        interval.start,
        interval.end
      );
      apiCallCount++;
      checkRateLimit(apiCallCount, totalRequestsNeeded);
      row.push(createdCount, pushedCount);
    });
    rowsToAppend.push(row);
  });

  const startRow = sheet.getLastRow() + 1;
  sheet
    .getRange(startRow, 1, rowsToAppend.length, header.length)
    .setValues(rowsToAppend);

  if (sheet.getLastRow() > 1) {
    sheet
      .getRange(2, 1, sheet.getLastRow() - 1, header.length)
      .sort({ column: 1, ascending: true });
  }

  Logger.log(`Backfilled ${rowsToAppend.length} week(s) of data.`);
}

/**
 * Main entry point.
 */
function myFunction() {
  backfillWeeklyData();
}
