const KEYWORDS = [
  'CoinGecko',
  'GeckoTerminal',
  'CoinMarketCap',
  'CoinPaprika',
  'DexScreener',
  'Moralis',
  'DexPaprika',
  '"Defined.fi"',
  '"Codex.io"',
];
const PRE_KEYWORDS = ['Birdeye', 'Mobula'];
const HELP_KEYWORDS = ['API', 'SDK', 'Price', 'Token', 'Crypto'];

const FIXED_START_DATE = '2023-12-31'; // One-year data backfill. Must start on a Sunday.
const PUSHED_CREATED_SHEET_NAME = 'weekly-repos-created-pushed';
const PARSED_DATA_SHEET_NAME = 'parse-data';

const GITHUB_TOKEN = ''; // <-- Insert your GitHub token here.
const GH_BASE_URL = 'https://api.github.com';
const HEADERS = {
  Accept: 'application/vnd.github+json',
  Authorization: 'Bearer ' + GITHUB_TOKEN,
  'X-GitHub-Api-Version': '2022-11-28',
};

let API_CALL_COUNT = 0;
let TOTAL_REQUESTS_NEEDED = Number.MAX_SAFE_INTEGER;

/**
 * Queries GitHub's search API with retry on rate-limit errors.
 * The rate-limit check is done here by incrementing a global API_CALL_COUNT.
 *
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
  if (created_start !== '*' || created_end !== '*') {
    query += ` created:${created_start}..${created_end}`;
  }
  if (pushed_start !== '*' || pushed_end !== '*') {
    query += ` pushed:${pushed_start}..${pushed_end}`;
  }
  const params = { q: query, per_page, page };
  const queryString = Object.keys(params)
    .map((key) => key + '=' + encodeURIComponent(params[key]))
    .join('&');
  const finalUrl = GH_BASE_URL + '/search/repositories?' + queryString;
  const options = {
    method: 'get',
    headers: HEADERS,
    muteHttpExceptions: false,
  };

  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      API_CALL_COUNT++;
      if (API_CALL_COUNT % 30 === 0 && API_CALL_COUNT < TOTAL_REQUESTS_NEEDED) {
        Logger.log(
          `API call count reached ${API_CALL_COUNT}. Sleeping for 60 seconds.`
        );
        Utilities.sleep(60000);
      }
      const response = UrlFetchApp.fetch(finalUrl, options);
      return JSON.parse(response.getContentText());
    } catch (e) {
      if (e.toString().indexOf('API rate limit exceeded') !== -1) {
        Logger.log(
          `Rate limit exceeded. Attempt ${attempt + 1} of ${maxRetries}. Sleeping for 60 seconds.`
        );
        Utilities.sleep(60000);
      } else {
        throw e;
      }
    }
  }
  throw new Error('Failed to fetch from GitHub after multiple attempts.');
}

/**
 * Returns the total repository count for a keyword, based on the given date type.
 *
 * @param {string} keyword - The search keyword.
 * @param {string} dateType - Either "created" or "pushed".
 * @param {string} start - Start date.
 * @param {string} end - End date.
 * @returns {number} Total count from GitHub.
 */
function countSearchRepo(keyword, dateType, start, end) {
  let result;
  if (dateType === 'created') {
    result = searchRepositories(keyword, 30, 1, start, end, '*', '*');
  } else if (dateType === 'pushed') {
    result = searchRepositories(keyword, 30, 1, '*', '*', start, end);
  }
  return result.total_count || 0;
}

/**
 * For a given pre-keyword, combines it with each HELP_KEYWORD,
 * performs a search based on the date type, and returns the sum of total_counts.
 *
 * @param {string} pre_keyword - The pre-keyword.
 * @param {string} dateType - "created" or "pushed".
 * @param {string} start - Start date.
 * @param {string} end - End date.
 * @returns {number} Summed count.
 */
function countSearchRepoForPre(pre_keyword, dateType, start, end) {
  let total = 0;
  HELP_KEYWORDS.forEach((help) => {
    const query = pre_keyword + ' ' + help;
    total += countSearchRepo(query, dateType, start, end);
  });
  return total;
}

/**
 * Formats a Date object as "YYYY-MM-DD".
 *
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
 * For example, if today is 2025-03-05 (Wednesday), returns 2025-03-01.
 */
function getLastSaturday() {
  const timeZone = Session.getScriptTimeZone();
  const todayStr = Utilities.formatDate(new Date(), timeZone, 'yyyy-MM-dd');
  const today = new Date(todayStr);
  const dayOfWeek = today.getDay(); // Sunday=0, Monday=1, ..., Saturday=6
  const currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - dayOfWeek);
  const lastSaturday = new Date(currentWeekStart);
  lastSaturday.setDate(currentWeekStart.getDate() - 1);
  return lastSaturday;
}

/**
 * Generates weekly intervals (Sunday to Saturday) from FIXED_START_DATE until the latest complete week.
 *
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
  latestWeekStart.setDate(lastSaturday.getDate() - 6);
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
 * Generates a header row dynamically.
 * The header begins with "week-start" and "week-end", then two columns per KEYWORD,
 * followed by two columns per PRE_KEYWORD.
 *
 * @returns {Array<string>}
 */
function generateHeader() {
  const header = ['week-start', 'week-end'];
  KEYWORDS.forEach((keyword) => {
    header.push(`${keyword}_created`, `${keyword}_pushed`);
  });
  PRE_KEYWORDS.forEach((pre) => {
    header.push(`${pre}_created`, `${pre}_pushed`);
  });
  return header;
}

/**
 * Remaps a row based on the old header vs. new header.
 */
function remapRow(row, oldHeader, newHeader) {
  const newRow = [];
  newHeader.forEach((colName) => {
    const oldIndex = oldHeader.indexOf(colName);
    if (oldIndex !== -1) {
      newRow.push(row[oldIndex]);
    } else {
      newRow.push('');
    }
  });
  return newRow;
}

/**
 * Remaps existing data in the sheet to match the new header order.
 */
function remapExistingData(sheet, oldHeader, newHeader) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const dataRange = sheet.getRange(2, 1, lastRow - 1, oldHeader.length);
  const oldData = dataRange.getValues();
  const remappedData = oldData.map((row) =>
    remapRow(row, oldHeader, newHeader)
  );
  sheet
    .getRange(2, 1, remappedData.length, newHeader.length)
    .setValues(remappedData);
  Logger.log('Remapped existing data to match new header.');
}

/**
 * Updates each existing row to fill in missing data for any new keywords.
 */
function updateExistingRowsForNewKeywords(sheet, header) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('No data rows exist. Skipping update of existing rows.');
    return;
  }
  const dataRange = sheet.getRange(2, 1, lastRow - 1, header.length);
  const data = dataRange.getValues();
  const updatedData = [];

  data.forEach((row, rowIndex) => {
    while (row.length < header.length) row.push('');
    let weekStart = row[0];
    let weekEnd = row[1];
    if (weekStart instanceof Date) weekStart = formatDate(weekStart);
    if (weekEnd instanceof Date) weekEnd = formatDate(weekEnd);

    // Process KEYWORDS.
    KEYWORDS.forEach((keyword, i) => {
      const createdIndex = 2 + i * 2;
      const pushedIndex = createdIndex + 1;
      if (row[createdIndex] === '' || row[createdIndex] == null) {
        Logger.log(
          `Row ${rowIndex + 2}: Missing ${keyword}_created for week ${weekStart}`
        );
        row[createdIndex] = countSearchRepo(
          keyword,
          'created',
          weekStart,
          weekEnd
        );
      }
      if (row[pushedIndex] === '' || row[pushedIndex] == null) {
        Logger.log(
          `Row ${rowIndex + 2}: Missing ${keyword}_pushed for week ${weekStart}`
        );
        row[pushedIndex] = countSearchRepo(
          keyword,
          'pushed',
          weekStart,
          weekEnd
        );
      }
    });

    // Process PRE_KEYWORDS.
    const baseIndex = 2 + KEYWORDS.length * 2;
    PRE_KEYWORDS.forEach((pre, j) => {
      const createdIndex = baseIndex + j * 2;
      const pushedIndex = createdIndex + 1;
      if (row[createdIndex] === '' || row[createdIndex] == null) {
        Logger.log(
          `Row ${rowIndex + 2}: Missing ${pre}_created for week ${weekStart}`
        );
        row[createdIndex] = countSearchRepoForPre(
          pre,
          'created',
          weekStart,
          weekEnd
        );
      }
      if (row[pushedIndex] === '' || row[pushedIndex] == null) {
        Logger.log(
          `Row ${rowIndex + 2}: Missing ${pre}_pushed for week ${weekStart}`
        );
        row[pushedIndex] = countSearchRepoForPre(
          pre,
          'pushed',
          weekStart,
          weekEnd
        );
      }
    });
    updatedData.push(row);
  });

  sheet
    .getRange(2, 1, updatedData.length, header.length)
    .setValues(updatedData);
  Logger.log('Updated missing cells in existing rows.');
}

/**
 * Main function to:
 * 1. Update the header (and remap existing data if needed).
 * 2. Update missing cells in existing rows.
 * 3. Append rows for missing weekly intervals.
 * 4. Sort the data.
 */
function backfillWeeklyData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PUSHED_CREATED_SHEET_NAME);
  const header = generateHeader();

  if (!sheet) {
    sheet = ss.insertSheet(PUSHED_CREATED_SHEET_NAME);
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
  } else {
    const oldHeaderRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
    const existingHeader = oldHeaderRange.getValues()[0];
    if (existingHeader.join('|') !== header.join('|')) {
      // Remap the data rows to the new header order.
      remapExistingData(sheet, existingHeader, header);
      // Update the header row.
      sheet.getRange(1, 1, 1, header.length).setValues([header]);
    }
  }

  updateExistingRowsForNewKeywords(sheet, header);

  // Build a set of existing week-start values.
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

  // Generate weekly intervals and filter for missing ones.
  const intervals = getWeeklyIntervals(FIXED_START_DATE);
  const intervalsToFill = intervals.filter(
    (interval) => !existingWeeks[interval.start]
  );

  if (intervalsToFill.length === 0) {
    Logger.log('No missing intervals. Nothing to backfill.');
    return;
  }

  // Calculate total API calls per interval:
  // KEYWORDS: KEYWORDS.length * 2
  // PRE_KEYWORDS: PRE_KEYWORDS.length * HELP_KEYWORDS.length * 2
  const callsPerInterval =
    KEYWORDS.length * 2 + PRE_KEYWORDS.length * HELP_KEYWORDS.length * 2;
  TOTAL_REQUESTS_NEEDED = intervalsToFill.length * callsPerInterval;
  Logger.log(`Total API requests needed: ${TOTAL_REQUESTS_NEEDED}`);
  Logger.log(
    `Estimated time (in minutes): ${Math.ceil(TOTAL_REQUESTS_NEEDED / 30)}`
  );

  const rowsToAppend = [];

  intervalsToFill.forEach((interval) => {
    const row = [interval.start, interval.end];
    // Process KEYWORDS.
    KEYWORDS.forEach((keyword) => {
      row.push(
        countSearchRepo(keyword, 'created', interval.start, interval.end),
        countSearchRepo(keyword, 'pushed', interval.start, interval.end)
      );
    });
    // Process PRE_KEYWORDS.
    PRE_KEYWORDS.forEach((pre) => {
      row.push(
        countSearchRepoForPre(pre, 'created', interval.start, interval.end),
        countSearchRepoForPre(pre, 'pushed', interval.start, interval.end)
      );
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
 * Parses the weekly data from the source sheet and generates a new sheet with parsed data.
 */
function parseWeeklyData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getSheetByName(PUSHED_CREATED_SHEET_NAME);
  const targetSheet =
    ss.getSheetByName(PARSED_DATA_SHEET_NAME) ||
    ss.insertSheet(PARSED_DATA_SHEET_NAME);

  if (!sourceSheet) {
    Logger.log('Source sheet not found.');
    return;
  }

  const data = sourceSheet.getDataRange().getValues();
  if (data.length < 2) {
    Logger.log('No data available.');
    return;
  }

  const header = data[0];
  const weekStartIndex = 0;
  const keywordIndices = {};

  // Find column indices for each keyword
  KEYWORDS.forEach((keyword) => {
    keywordIndices[keyword] = {
      created: header.indexOf(`${keyword}_created`),
      pushed: header.indexOf(`${keyword}_pushed`),
    };
  });
  PRE_KEYWORDS.forEach((keyword) => {
    keywordIndices[keyword] = {
      created: header.indexOf(`${keyword}_created`),
      pushed: header.indexOf(`${keyword}_pushed`),
    };
  });

  // Generate the new header: week-start + keyword columns
  const newHeader = ['week-start', ...KEYWORDS, ...PRE_KEYWORDS];

  const parsedData = data.slice(1).map((row) => {
    const weekStart = row[weekStartIndex];
    const rowData = [weekStart];

    KEYWORDS.forEach((keyword) => {
      const createdCount =
        keywordIndices[keyword].created !== -1
          ? row[keywordIndices[keyword].created] || 0
          : 0;
      const pushedCount =
        keywordIndices[keyword].pushed !== -1
          ? row[keywordIndices[keyword].pushed] || 0
          : 0;
      rowData.push(createdCount + pushedCount);
    });
    PRE_KEYWORDS.forEach((keyword) => {
      const createdCount =
        keywordIndices[keyword].created !== -1
          ? row[keywordIndices[keyword].created] || 0
          : 0;
      const pushedCount =
        keywordIndices[keyword].pushed !== -1
          ? row[keywordIndices[keyword].pushed] || 0
          : 0;
      rowData.push(createdCount + pushedCount);
    });

    return rowData;
  });

  targetSheet.clear();
  targetSheet.getRange(1, 1, 1, newHeader.length).setValues([newHeader]);
  targetSheet
    .getRange(2, 1, parsedData.length, newHeader.length)
    .setValues(parsedData);
}

function parseCreatedData() {
  parseWeeklyDataByType('created');
}

function parsePushedData() {
  parseWeeklyDataByType('pushed');
}

function parseWeeklyDataByType(type) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getSheetByName(PUSHED_CREATED_SHEET_NAME);
  const targetSheetName = type === 'created' ? 'created' : 'pushed';
  let targetSheet =
    ss.getSheetByName(targetSheetName) || ss.insertSheet(targetSheetName);

  if (!sourceSheet) {
    Logger.log('Source sheet not found.');
    return;
  }

  const data = sourceSheet.getDataRange().getValues();
  if (data.length < 2) {
    Logger.log('No data available.');
    return;
  }

  const header = data[0];
  const keywordColumns = [
    'week-start',
    ...KEYWORDS.map((keyword) => `${keyword}_${type}`),
    ...PRE_KEYWORDS.map((keyword) => `${keyword}_${type}`),
  ];

  // Find indices of relevant columns
  const columnIndices = keywordColumns.map((colName) =>
    header.indexOf(colName)
  );

  // Rename columns (remove _created or _pushed suffix)
  const renamedColumns = ['week-start', ...KEYWORDS, ...PRE_KEYWORDS];

  // Extract the relevant data
  const extractedData = data
    .slice(1)
    .map((row) =>
      columnIndices.map((colIndex) => (colIndex !== -1 ? row[colIndex] : ''))
    );

  // Write to the target sheet
  targetSheet.clear();
  targetSheet
    .getRange(1, 1, 1, renamedColumns.length)
    .setValues([renamedColumns]);
  targetSheet
    .getRange(2, 1, extractedData.length, renamedColumns.length)
    .setValues(extractedData);
}

/**
 * Retrieves the top 10 CoinGecko repositories for a given week and returns a RichTextValue.
 * Each line is numbered (e.g., "1. ") and the repository name is set as a clickable link.
 * Each repository appears on a new line.
 *
 * @param {string} weekStart - The start date (YYYY-MM-DD) of the week.
 * @param {string} weekEnd - The end date (YYYY-MM-DD) of the week.
 * @return {RichTextValue} A RichTextValue with numbered clickable links.
 */
function getCoinGeckoTopReposRichText(weekStart, weekEnd) {
  var result = searchRepositories(
    'CoinGecko',
    10,
    1,
    '*',
    '*',
    weekStart,
    weekEnd
  );
  if (!result || !result.items || result.items.length === 0) {
    return SpreadsheetApp.newRichTextValue().setText('').build();
  }

  var items = result.items.slice(0, 10);
  var combinedText = '\n';
  items.forEach(function (item, index) {
    combinedText += index + 1 + '. ' + item.full_name;
    if (index < items.length - 1) {
      combinedText += '\n';
    }
  });
  combinedText += '\n';

  var builder = SpreadsheetApp.newRichTextValue().setText(combinedText);
  // Set offset to 1 to account for the initial newline.
  var offset = 1;
  // For each line, set the hyperlink only on the repository name part.
  items.forEach(function (item, index) {
    var prefix = index + 1 + '. ';
    var nameStart = offset + prefix.length;
    var nameLength = item.full_name.length;
    builder.setLinkUrl(nameStart, nameStart + nameLength, item.html_url);
    offset += prefix.length + nameLength;
    if (index < items.length - 1) {
      offset += 1; // for newline character.
    }
  });

  return builder.build();
}

/**
 * Backfills the "weekly-digest" sheet.
 * The sheet will have two columns:
 *   - week-start
 *   - top-repos (a cell containing numbered, clickable links for the top 10 CoinGecko repositories)
 * Data rows start at row 3.
 */
function backfillWeeklyDigest() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const digestSheetName = 'weekly-digest';
  let digestSheet = ss.getSheetByName(digestSheetName);

  if (!digestSheet) {
    digestSheet = ss.insertSheet(digestSheetName);
    // Reserve row 1 for custom info, header on row 2.
    digestSheet.getRange(2, 1, 1, 2).setValues([['week-start', 'top-repos']]);
  }

  // Build a set of existing week-start values.
  // Data rows start at row 3 (row 2 is header).
  const lastRow = digestSheet.getLastRow();
  const existingWeeks = {};
  if (lastRow > 2) {
    const weekStarts = digestSheet.getRange(3, 1, lastRow - 2, 1).getValues();
    weekStarts.forEach(function (row) {
      let cellValue = row[0];
      if (cellValue) {
        if (cellValue instanceof Date) cellValue = formatDate(cellValue);
        existingWeeks[cellValue] = true;
      }
    });
  }

  // Generate weekly intervals from FIXED_START_DATE until the latest complete week.
  const intervals = getWeeklyIntervals(FIXED_START_DATE);
  const intervalsToFill = intervals.filter(function (interval) {
    return !existingWeeks[interval.start];
  });

  if (intervalsToFill.length === 0) {
    Logger.log('No missing intervals. Nothing to backfill in weekly-digest.');
    return;
  }

  // Prepare rows to append: each row is [week-start, richText (top repos)].
  const rowsToAppend = intervalsToFill.map(function (interval) {
    var richText = getCoinGeckoTopReposRichText(interval.start, interval.end);
    return [interval.start, richText];
  });

  const startRow = digestSheet.getLastRow() + 1;
  digestSheet.getRange(startRow, 1, rowsToAppend.length, 2).setValues(
    rowsToAppend.map(function (row) {
      return [row[0], ''];
    })
  );

  const richTextArray = rowsToAppend.map(function (row) {
    return [row[1]];
  });
  digestSheet
    .getRange(startRow, 2, rowsToAppend.length, 1)
    .setRichTextValues(richTextArray);

  // Sort the data rows (starting from row 3) based on the week-start column (column 1).
  if (digestSheet.getLastRow() > 2) {
    digestSheet
      .getRange(3, 1, digestSheet.getLastRow() - 2, 2)
      .sort({ column: 1, ascending: false });
  }

  Logger.log(
    'Weekly digest backfilled with ' + rowsToAppend.length + ' new entries.'
  );
}

/**
 * Generates monthly intervals by grouping 4 complete weekly intervals.
 * Each interval has a start date (first week's Sunday) and an end date (last week's Saturday).
 * Only groups with exactly 4 weeks are included.
 *
 * @param {string} startDateString - The fixed start date (must be a Sunday).
 * @returns {Array<Object>} Array of intervals with {start, end} representing a 4-week period.
 */
function getMonthlyIntervals(startDateString) {
  const weeklyIntervals = getWeeklyIntervals(startDateString);
  const monthlyIntervals = [];
  for (let i = 0; i < weeklyIntervals.length; i += 4) {
    const group = weeklyIntervals.slice(i, i + 4);
    if (group.length < 4) break; // Skip incomplete group
    const monthStart = group[0].start;
    const monthEnd = group[group.length - 1].end;
    monthlyIntervals.push({ start: monthStart, end: monthEnd });
  }
  return monthlyIntervals;
}

/**
 * Backfills the "monthly-digest" sheet.
 * The sheet will have a custom info row (row 1), a header row (row 2) with two columns:
 *   - month-start (start date of the 4-week period)
 *   - top-repos (a cell containing numbered, clickable links for the top 10 CoinGecko repositories)
 * Data rows start at row 3.
 */
function backfillMonthlyDigest() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const digestSheetName = 'monthly-digest';
  let digestSheet = ss.getSheetByName(digestSheetName);

  if (!digestSheet) {
    digestSheet = ss.insertSheet(digestSheetName);
    // Reserve row 1 for custom info, header on row 2.
    digestSheet.getRange(2, 1, 1, 2).setValues([['month-start', 'top-repos']]);
  }

  // Build a set of existing month-start values.
  // Data rows start at row 3 (row 2 is header).
  const lastRow = digestSheet.getLastRow();
  const existingMonths = {};
  if (lastRow > 2) {
    const monthStarts = digestSheet.getRange(3, 1, lastRow - 2, 1).getValues();
    monthStarts.forEach(function (row) {
      let cellValue = row[0];
      if (cellValue) {
        if (cellValue instanceof Date) cellValue = formatDate(cellValue);
        existingMonths[cellValue] = true;
      }
    });
  }

  // Generate monthly intervals from FIXED_START_DATE until the latest complete week.
  const intervals = getMonthlyIntervals(FIXED_START_DATE);
  const intervalsToFill = intervals.filter(function (interval) {
    return !existingMonths[interval.start];
  });

  if (intervalsToFill.length === 0) {
    Logger.log('No missing intervals. Nothing to backfill in monthly-digest.');
    return;
  }

  // Prepare rows to append: each row is [month-start, richText (top repos)].
  const rowsToAppend = intervalsToFill.map(function (interval) {
    var richText = getCoinGeckoTopReposRichText(interval.start, interval.end);
    return [interval.start, richText];
  });

  const startRow = digestSheet.getLastRow() + 1;
  digestSheet.getRange(startRow, 1, rowsToAppend.length, 2).setValues(
    rowsToAppend.map(function (row) {
      return [row[0], ''];
    })
  );

  const richTextArray = rowsToAppend.map(function (row) {
    return [row[1]];
  });
  digestSheet
    .getRange(startRow, 2, rowsToAppend.length, 1)
    .setRichTextValues(richTextArray);

  // Sort the data rows (starting from row 3) based on the month-start column (column 1).
  if (digestSheet.getLastRow() > 2) {
    digestSheet
      .getRange(3, 1, digestSheet.getLastRow() - 2, 2)
      .sort({ column: 1, ascending: false });
  }

  Logger.log(
    'Monthly digest backfilled with ' + rowsToAppend.length + ' new entries.'
  );
}

/**
 * Main entry point.
 */
function myFunction() {
  backfillWeeklyData();
  parseWeeklyData();
  parseCreatedData();
  parsePushedData();
  backfillWeeklyDigest();
  backfillMonthlyDigest();
}
