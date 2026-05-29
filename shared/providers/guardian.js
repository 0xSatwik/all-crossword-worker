import {
  cleanClueText,
  decodeHtmlEntities,
  fetchJson,
  fetchText,
  getDayOfWeek,
  getFormattedDate,
  normalizePuzzlePayload,
  notFound
} from '../core/utils.js';

function guardianApiUrl(seriesTag, date, apiKey) {
  const params = new URLSearchParams({
    tag: `crosswords/series/${seriesTag}`,
    'from-date': date,
    'to-date': date,
    'page-size': '1',
    'api-key': apiKey || 'test'
  });

  return `https://content.guardianapis.com/search?${params.toString()}`;
}

async function fetchGuardianPuzzleReference(seriesTag, date, apiKey) {
  const json = await fetchJson(guardianApiUrl(seriesTag, date, apiKey));
  const result = json.response?.results?.[0];
  if (!result) {
    return null;
  }
  return result;
}

function decodeIslandProps(encodedProps) {
  return JSON.parse(decodeHtmlEntities(encodedProps));
}

async function fetchGuardianPageData(webUrl) {
  const html = await fetchText(webUrl);
  const islandMatch = html.match(/<gu-island[^>]*name="CrosswordComponent"[^>]*props="([^"]*)"/i);

  if (!islandMatch) {
    throw new Error(`Guardian page did not include crossword props: ${webUrl}`);
  }

  const props = decodeIslandProps(islandMatch[1]);
  return props.data;
}

function parseGuardianPuzzle(pageData, date, permalink, fallbackTitle) {
  const clues = (pageData.entries || [])
    .map((entry) => {
      let clueText = cleanClueText(entry.clue || '');
      clueText = clueText.replace(/\s*\([\d,\- ]+\)\s*$/, '').trim();

      return {
        number: Number.parseInt(entry.number, 10),
        direction: entry.direction,
        clue_text: clueText,
        answer: decodeHtmlEntities(String(entry.solution || '')).trim()
      };
    })
    .filter((clue) => clue.number && clue.clue_text && clue.answer);

  return normalizePuzzlePayload({
    date,
    formatted_date: getFormattedDate(date),
    title: pageData.name || fallbackTitle,
    author: pageData.creator?.name || '',
    editor: '',
    day_of_week: getDayOfWeek(date),
    permalink,
    clues
  });
}

const SERIES_URL_OVERRIDES = {
  'weekend-crossword': 'weekend',
};

function normalizeGuardianDateCandidate(candidate) {
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return new Date(candidate).toISOString().slice(0, 10);
  }

  if (typeof candidate === 'string') {
    if (/^\d+$/.test(candidate)) {
      return new Date(Number(candidate)).toISOString().slice(0, 10);
    }

    if (candidate.length >= 10) {
      return candidate.slice(0, 10);
    }
  }

  return null;
}

function guardianPublishedDate(pageData) {
  const candidates = [
    pageData?.date,
    pageData?.webPublicationDate,
    pageData?.webPublication?.webPublicationDate,
    pageData?.publishedAt,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeGuardianDateCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function guardianHasSolution(pageData) {
  return pageData?.solutionAvailable !== false;
}

function getGuardianSeriesMatches(seriesTag, seriesHtml) {
  const urlSlug = SERIES_URL_OVERRIDES[seriesTag] || seriesTag;
  return [...seriesHtml.matchAll(new RegExp(`href="(/crosswords/${urlSlug}/\\d+)"`, 'g'))];
}

async function fetchGuardianPuzzleFromSeriesPage(seriesTag, date) {
  const seriesUrl = `https://www.theguardian.com/crosswords/series/${seriesTag}`;
  const seriesHtml = await fetchText(seriesUrl);
  const matches = getGuardianSeriesMatches(seriesTag, seriesHtml);

  if (matches.length === 0) {
    return null;
  }

  const seen = new Set();
  for (const match of matches) {
    const path = match[1];
    if (!path || seen.has(path)) {
      continue;
    }
    seen.add(path);

    const puzzleUrl = `https://www.theguardian.com${path}`;
    try {
      const pageData = await fetchGuardianPageData(puzzleUrl);
      if (guardianPublishedDate(pageData) !== date) {
        continue;
      }
      if (!guardianHasSolution(pageData)) {
        continue;
      }

      const puzzle = parseGuardianPuzzle(pageData, date, puzzleUrl, `Guardian ${seriesTag} crossword`);
      if (puzzle.clues.length === 0) {
        continue;
      }

      return puzzle;
    } catch {
      continue;
    }
  }

  return null;
}

async function fetchGuardianLatestFromSeriesPage(seriesTag, lookbackDays) {
  const seriesUrl = `https://www.theguardian.com/crosswords/series/${seriesTag}`;
  const seriesHtml = await fetchText(seriesUrl);
  const matches = getGuardianSeriesMatches(seriesTag, seriesHtml);

  if (matches.length === 0) {
    return null;
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const earliest = new Date(today);
  earliest.setUTCDate(earliest.getUTCDate() - lookbackDays);

  const seen = new Set();
  for (const match of matches) {
    const path = match[1];
    if (!path || seen.has(path)) {
      continue;
    }
    seen.add(path);

    const puzzleUrl = `https://www.theguardian.com${path}`;
    try {
      const pageData = await fetchGuardianPageData(puzzleUrl);
      const publishedDate = guardianPublishedDate(pageData);
      if (!publishedDate) {
        continue;
      }
      if (!guardianHasSolution(pageData)) {
        continue;
      }

      const published = new Date(`${publishedDate}T00:00:00Z`);
      if (published > today) {
        continue;
      }
      if (published < earliest) {
        break;
      }

      const puzzle = parseGuardianPuzzle(pageData, publishedDate, puzzleUrl, `Guardian ${seriesTag} crossword`);
      if (puzzle.clues.length === 0) {
        continue;
      }

      return puzzle;
    } catch {
      continue;
    }
  }

  return null;
}

export function createGuardianProvider({ seriesTag, title, lookbackDays = 21 }) {
  return {
    slug: `guardian-${seriesTag}`,
    title,
    lookbackDays,
    async fetchByDate(date, env) {
      try {
        const result = await fetchGuardianPuzzleReference(seriesTag, date, env.GUARDIAN_API_KEY);
        if (result?.webUrl) {
          const pageData = await fetchGuardianPageData(result.webUrl);
          if (guardianPublishedDate(pageData) === date && guardianHasSolution(pageData)) {
            const puzzle = parseGuardianPuzzle(pageData, date, result.webUrl, result.webTitle || title);
            if (puzzle.clues.length > 0) {
              return puzzle;
            }
          }
        }
      } catch {
        // Fall through to the series page when the Content API lags or fails.
      }

      const freshPuzzle = await fetchGuardianPuzzleFromSeriesPage(seriesTag, date);
      if (freshPuzzle) {
        return freshPuzzle;
      }

      throw notFound(`No Guardian ${seriesTag} puzzle for ${date}`);
    },
    async fetchLatest() {
      const latestPuzzle = await fetchGuardianLatestFromSeriesPage(seriesTag, lookbackDays);
      if (latestPuzzle) {
        return latestPuzzle;
      }

      throw notFound(`No recent Guardian ${seriesTag} puzzle found.`);
    }
  };
}
