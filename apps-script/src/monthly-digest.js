/**
 *   1. Computes weekly intervals (from a fixed start date up to the last complete week).
 *   2. Groups every 4 weeks into a monthly interval.
 *   3. For each monthly interval, fetches the top 10 CoinGecko repositories from GitHub.
 *   4. Writes the formatted output to a markdown file in the same directory.
 *
 * Note:
 *   - This script uses Node.js APIs (e.g. fs and fetch). Be sure to run in an environment with Node v18+ or with node-fetch installed.
 *   - Adjust the GITHUB_TOKEN with a valid token.
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // For Node v18+, native fetch is available. Remove if using built-in fetch.

// --- Configuration Constants ---
const GITHUB_TOKEN =
  ''; // Insert your GitHub token.
const GH_BASE_URL = 'https://api.github.com';
const HEADERS = {
  Accept: 'application/vnd.github+json',
  Authorization: 'Bearer ' + GITHUB_TOKEN,
  'X-GitHub-Api-Version': '2022-11-28',
};

const FIXED_START_DATE = '2023-12-31'; // One-year data backfill; must start on a Sunday.
const RATE_LIMIT_THRESHOLD = 30; // Adjust as necessary for rate limits.

// --- Utility Functions ---

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
 * Sleeps for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Computes the latest complete week's Saturday.
 * For example, if today is Wednesday, returns the previous Saturday.
 *
 * @returns {Date} Last complete week's Saturday.
 */
function getLastSaturday() {
  const today = new Date();
  // Determine day of week (Sunday = 0, Saturday = 6)
  const dayOfWeek = today.getDay();
  // Get last Saturday (if today is Saturday, use last week's Saturday)
  const offset = dayOfWeek >= 6 ? 7 : dayOfWeek + 1;
  const lastSaturday = new Date(today);
  lastSaturday.setDate(today.getDate() - offset);
  return lastSaturday;
}

/**
 * Generates weekly intervals (each interval is Sunday to Saturday) from FIXED_START_DATE until the week that contains last complete Saturday.
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
  // Determine latest week start from last Saturday.
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
 * Groups weekly intervals into monthly intervals by taking every 4 weeks.
 * Each monthly interval is defined by the first week's start and the fourth week's end.
 *
 * @param {string} startDateString
 * @returns {Array<Object>} Array of monthly intervals with {start, end}.
 */
function getMonthlyIntervals(startDateString) {
  const weeklyIntervals = getWeeklyIntervals(startDateString);
  const monthlyIntervals = [];
  for (let i = 0; i + 3 < weeklyIntervals.length; i += 4) {
    monthlyIntervals.push({
      start: weeklyIntervals[i].start,
      end: weeklyIntervals[i + 3].end,
    });
  }
  return monthlyIntervals;
}

/**
 * Queries GitHub's search API with retry on rate-limit errors.
 * Appends the pushed date filter to the query.
 *
 * @param {string} query - Base query string.
 * @param {number} per_page - Number of results per page.
 * @param {number} page - Page number.
 * @param {string} weekStart - Start date (for pushed filter).
 * @param {string} weekEnd - End date (for pushed filter).
 * @returns {Promise<Object>} Parsed JSON response.
 */
let apiCallCount = 0;
async function searchRepositories(query, per_page, page, weekStart, weekEnd) {
  let fullQuery = query + ` pushed:${weekStart}..${weekEnd}`;
  const params = { q: fullQuery, per_page, page };
  const queryString = Object.keys(params)
    .map((key) => key + '=' + encodeURIComponent(params[key]))
    .join('&');
  const finalUrl = `${GH_BASE_URL}/search/repositories?${queryString}`;

  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      apiCallCount++;
      // Optionally pause if rate limiting is near.
      if (apiCallCount % RATE_LIMIT_THRESHOLD === 0) {
        console.log(
          `API call count reached ${apiCallCount}. Sleeping for 60 seconds.`
        );
        await sleep(60000);
      }
      const response = await fetch(finalUrl, {
        method: 'get',
        headers: HEADERS,
      });
      const data = await response.json();
      return data;
    } catch (e) {
      console.log(`Attempt ${attempt + 1} failed.`, e);
      await sleep(60000);
    }
  }
  throw new Error('Failed to fetch from GitHub after multiple attempts.');
}

/**
 * Retrieves the top 10 CoinGecko repositories for the given interval and returns a markdown formatted string.
 * Each line is numbered and contains the repository name as a clickable link.
 *
 * @param {string} weekStart - Start date (YYYY-MM-DD) of the interval.
 * @param {string} weekEnd - End date (YYYY-MM-DD) of the interval.
 * @returns {Promise<string>} Markdown formatted string with repository links.
 */
async function getCoinGeckoTopReposMarkdown(weekStart, weekEnd) {
  // Fetch top 10 repositories for query "CoinGecko".
  const result = await searchRepositories(
    'CoinGecko',
    10,
    1,
    weekStart,
    weekEnd
  );
  if (!result || !result.items || result.items.length === 0) {
    return 'No repositories found for this interval.';
  }
  // Build markdown list with numbered repo names as clickable links.
  let markdownList = '';
  result.items.slice(0, 10).forEach((item, index) => {
    markdownList += `${index + 1}. [${item.full_name}](${item.html_url})\n`;
  });
  return markdownList;
}

/**
 * Main function to generate the monthly digest markdown file.
 *
 * It:
 *   - Computes monthly intervals.
 *   - Fetches top CoinGecko repos for each interval.
 *   - Builds a markdown string.
 *   - Writes/overwrites a file named "monthly-digest.md" in the same directory.
 */
async function main() {
  console.log('Generating monthly digest...');
  const monthlyIntervals = getMonthlyIntervals(FIXED_START_DATE);

  let markdownContent = '# Monthly Digest\n\n';

  for (const interval of monthlyIntervals) {
    markdownContent += `## ${interval.start} to ${interval.end}\n\n`;
    try {
      const repoMarkdown = await getCoinGeckoTopReposMarkdown(
        interval.start,
        interval.end
      );
      markdownContent += repoMarkdown + '\n';
    } catch (err) {
      markdownContent += `Error fetching repositories: ${err.message}\n\n`;
    }
  }

  // Write markdown file in the current directory.
  const filePath = path.join(__dirname, 'monthly-digest.md');
  fs.writeFileSync(filePath, markdownContent);
  console.log(`Monthly digest written to ${filePath}`);
}

// Run the main function.
main().catch((error) => {
  console.error('Error generating digest:', error);
});
