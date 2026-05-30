/**
 * Crossword Solver API - Cloudflare Worker
 *
 * Exact internal matches are checked first, then CrosswordNexus,
 * and finally Datamuse as the last fallback.
 */

const CROSSWORD_NEXUS_URL = 'https://crosswordnexus.com';
const DATAMUSE_API_URL = 'https://api.datamuse.com/words';
const DEFAULT_ARCHIVE_API_URL = 'https://crossword-archive-worker.mitomat.workers.dev';
const DEFAULT_MINI_API_URL = 'https://nyt-mini-archive.nytsolver.workers.dev';
const DEFAULT_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600';
const SOLVER_CACHE_VERSION = '2026-05-31-v2';
const API_BLOCKED_USER_AGENT_PARTS = [
  'gptbot',
  'chatgpt-user',
  'claudebot',
  'claude-user',
  'claude-searchbot',
  'anthropic-ai',
  'perplexitybot',
  'perplexity-user',
  'bytespider',
  'ccbot',
  'cohere-ai',
  'diffbot',
  'meta-externalagent',
  'amazonbot'
];

function getCorsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
  };
}

function isBlockedApiCrawler(request) {
  const userAgent = (request.headers.get('User-Agent') || '').toLowerCase();
  return API_BLOCKED_USER_AGENT_PARTS.some((part) => userAgent.includes(part));
}

function jsonResponse(data, env, init = {}) {
  const responseHeaders = {
    'Content-Type': 'application/json',
    ...getCorsHeaders(env),
    ...(init.headers || {}),
  };

  return new Response(JSON.stringify(data), {
    ...init,
    headers: responseHeaders,
  });
}

function errorResponse(message, env, status = 400) {
  return jsonResponse(
    {
      success: false,
      error: message,
    },
    env,
    { status }
  );
}

function decodeHtmlEntities(text) {
  if (!text) return '';

  const entities = {
    '&quot;': '"',
    '&amp;': '&',
    '&#39;': "'",
    '&lt;': '<',
    '&gt;': '>',
    '&nbsp;': ' ',
    '&rsquo;': "'",
    '&lsquo;': "'",
    '&rdquo;': '"',
    '&ldquo;': '"',
    '&apos;': "'",
  };

  return text.replace(/&[^;]+;/g, (entity) => {
    if (entities[entity]) {
      return entities[entity];
    }

    if (/&#[0-9]+;/.test(entity)) {
      const code = entity.replace(/&#([0-9]+);/, '$1');
      return String.fromCharCode(parseInt(code, 10));
    }

    return entity;
  });
}

function decodePercentEscapes(text) {
  const value = String(text || '');

  if (!/%[0-9A-Fa-f]{2}/.test(value)) {
    return value;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value.replace(/%([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
  }
}

function cleanClueText(text) {
  if (!text) return '';

  return decodePercentEscapes(decodeHtmlEntities(text))
    .replace(/<[^>]*>/g, '')
    .replace(/:\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeClueForLookup(text) {
  return cleanClueText(text)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAnswerForLookup(text) {
  return (text || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .trim();
}

function normalizePattern(pattern) {
  return (pattern || '')
    .toUpperCase()
    .replace(/[^A-Z?]/g, '')
    .trim();
}

function matchesPattern(answerNorm, pattern) {
  if (!pattern) return true;
  if (answerNorm.length !== pattern.length) return false;

  for (let i = 0; i < pattern.length; i += 1) {
    if (pattern[i] !== '?' && pattern[i] !== answerNorm[i]) {
      return false;
    }
  }

  return true;
}

function formatDate(dateString) {
  try {
    const date = new Date(`${dateString}T00:00:00`);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

function getDayOfWeek(dateString) {
  try {
    const date = new Date(`${dateString}T00:00:00`);
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  } catch {
    return '';
  }
}

function getArchiveApiUrl(env) {
  return env.ARCHIVE_API_URL || DEFAULT_ARCHIVE_API_URL;
}

function getMiniApiUrl(env) {
  return env.MINI_API_URL || DEFAULT_MINI_API_URL;
}

function shouldUseMiniLookup(env) {
  return env.ENABLE_MINI_LOOKUP === 'true' && !!getMiniApiUrl(env);
}

function getArchiveFetcher(env) {
  if (env.ARCHIVE_SERVICE && typeof env.ARCHIVE_SERVICE.fetch === 'function') {
    return env.ARCHIVE_SERVICE;
  }

  return null;
}

function normalizeInternalHistoryItem(item, source = 'daily') {
  const answer = normalizeAnswerForLookup(item.answer);

  return {
    clue_id: item.clue_id ?? 0,
    puzzle_id: item.puzzle_id ?? 0,
    number: item.number ?? null,
    direction: item.direction || '',
    clue_text: cleanClueText(item.clue_text || item.clue || ''),
    answer,
    answer_norm: answer,
    date: item.date,
    title: item.title || 'New York Times Crossword',
    formatted_date: item.formatted_date || formatDate(item.date),
    day_of_week: item.day_of_week || getDayOfWeek(item.date),
    source,
  };
}

function normalizeMiniHistoryItem(item) {
  return {
    date: item.date,
    direction: item.direction || '',
    number: item.number ?? '',
    clue: cleanClueText(item.clue || ''),
    answer: normalizeAnswerForLookup(item.answer),
    source: 'mini',
  };
}

function dedupeHistoryItems(items, keyBuilder) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyBuilder(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function sortByDateDesc(items) {
  return [...items].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function buildInternalAnswerResults(dailyMatches, miniMatches, pattern) {
  const answerMap = new Map();

  const addMatch = (match, source) => {
    const answerNorm = normalizeAnswerForLookup(match.answer);
    if (!answerNorm || !matchesPattern(answerNorm, pattern)) {
      return;
    }

    const existing = answerMap.get(answerNorm) || {
      word: answerNorm,
      length: answerNorm.length,
      score: 0,
      rating: 1,
      source: 'internal',
      frequency: 0,
      daily_count: 0,
      mini_count: 0,
      last_seen: match.date || '',
      sources: [],
    };

    existing.frequency += 1;
    existing.score += 100;
    existing.last_seen = existing.last_seen > match.date ? existing.last_seen : match.date;

    if (!existing.sources.includes(source)) {
      existing.sources.push(source);
    }

    if (source === 'daily') {
      existing.daily_count += 1;
    } else if (source === 'mini') {
      existing.mini_count += 1;
    }

    existing.rating = Math.max(1, Math.min(5, existing.frequency));

    answerMap.set(answerNorm, existing);
  };

  dailyMatches.forEach((match) => addMatch(match, 'daily'));
  miniMatches.forEach((match) => addMatch(match, 'mini'));

  return [...answerMap.values()].sort((a, b) => {
    if (b.frequency !== a.frequency) {
      return b.frequency - a.frequency;
    }

    return String(b.last_seen).localeCompare(String(a.last_seen));
  });
}

async function sha1Prefix(value) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-1', encoded);
  const firstByte = new Uint8Array(digest)[0];
  return firstByte.toString(16).padStart(2, '0');
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

async function fetchArchiveJson(url, env, options = {}) {
  const archiveFetcher = getArchiveFetcher(env);
  const response = archiveFetcher
    ? await archiveFetcher.fetch(url, options)
    : await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Archive request failed with status ${response.status}`);
  }

  return response.json();
}

async function fetchArchiveExactMatches(clue, env) {
  try {
    const url = new URL('/api/search/clue', getArchiveApiUrl(env));
    url.searchParams.set('q', clue);
    url.searchParams.set('mode', 'exact');

    const payload = await fetchArchiveJson(url.toString(), env);
    const results = payload?.data?.results || [];

    return sortByDateDesc(
      results.map((item) => normalizeInternalHistoryItem(item, 'daily'))
    );
  } catch (error) {
    console.error('Archive exact lookup failed:', error);
    return [];
  }
}

async function fetchMiniExactMatches(clue, env) {
  try {
    const url = new URL('/clue', getMiniApiUrl(env));
    url.searchParams.set('q', clue);
    url.searchParams.set('mode', 'exact');

    const payload = await fetchJson(url.toString());
    const results = payload?.matches || [];

    return sortByDateDesc(
      results.map((item) => normalizeMiniHistoryItem(item))
    );
  } catch (error) {
    console.error('Mini exact lookup failed:', error);
    return [];
  }
}

async function fetchColdArchiveExactMatches(clueNorm, env) {
  if (!env.COLD_ARCHIVE_BASE_URL || !clueNorm) {
    return [];
  }

  try {
    const prefix = await sha1Prefix(clueNorm);
    const baseUrl = env.COLD_ARCHIVE_BASE_URL.replace(/\/$/, '');
    const shardUrl = `${baseUrl}/clue/${prefix}.json`;
    const payload = await fetchJson(shardUrl, {
      cf: { cacheTtl: 86400, cacheEverything: true },
    });
    const entries = payload?.entries?.[clueNorm] || [];

    return sortByDateDesc(
      entries.map((item) => normalizeInternalHistoryItem(item, 'cold_archive'))
    );
  } catch (error) {
    console.error('Cold archive shard lookup failed:', error);
    return [];
  }
}

function extractAnswers(html) {
  const answers = [];
  const tableMatch = html.match(/<table>[\s\S]*?<\/table>/);
  if (!tableMatch) return answers;

  const rows = tableMatch[0].match(/<tr>[\s\S]*?<\/tr>/g);
  if (!rows) return answers;

  rows.forEach((row) => {
    const starsMatch = row.match(/star\.png" alt="&#x2b50;" \/>/g);
    const rating = starsMatch ? starsMatch.length : 0;
    const wordMatch = row.match(/<a href="\/word\/([^"]+)">/);

    if (wordMatch && wordMatch[1]) {
      const word = normalizeAnswerForLookup(decodeURIComponent(wordMatch[1]));
      if (word && !word.includes('-')) {
        answers.push({
          word,
          length: word.length,
          rating,
          score: rating * 100,
          source: 'crosswordnexus',
        });
      }
    }
  });

  return answers;
}

async function fetchCrosswordNexusAnswers(clue, pattern = '') {
  const url = `${CROSSWORD_NEXUS_URL}/finder.php?clue=${encodeURIComponent(clue)}${pattern ? `&pattern=${encodeURIComponent(pattern)}` : ''}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch data: ${response.status}`);
  }

  const html = await response.text();
  return extractAnswers(html).filter((item) => matchesPattern(item.word, pattern));
}

async function fetchDatamuseAnswers(clue, pattern = '') {
  const url = new URL(DATAMUSE_API_URL);
  url.searchParams.set('ml', clue);
  url.searchParams.set('max', '100');

  if (pattern) {
    url.searchParams.set('sp', pattern.toLowerCase());
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to fetch Datamuse data: ${response.status}`);
  }

  const data = await response.json();

  return (Array.isArray(data) ? data : [])
    .filter((item) => item?.word && !item.word.includes(' ') && !item.word.includes('-'))
    .map((item) => ({
      word: normalizeAnswerForLookup(item.word),
      length: normalizeAnswerForLookup(item.word).length,
      score: item.score || 0,
      source: 'datamuse',
    }))
    .filter((item) => item.word && matchesPattern(item.word, pattern))
    .sort((a, b) => b.score - a.score);
}

function limitAnswers(answers, limit = 12) {
  return answers.slice(0, limit);
}

async function fetchExternalAnswers(clue, pattern) {
  try {
    const nexusAnswers = limitAnswers(await fetchCrosswordNexusAnswers(clue, pattern));
    if (nexusAnswers.length > 0) {
      return {
        provider: 'crosswordnexus',
        answers: nexusAnswers,
      };
    }
  } catch (error) {
    console.error('CrosswordNexus lookup failed:', error);
  }

  try {
    const datamuseAnswers = limitAnswers(await fetchDatamuseAnswers(clue, pattern));
    if (datamuseAnswers.length > 0) {
      return {
        provider: 'datamuse',
        answers: datamuseAnswers,
      };
    }
  } catch (error) {
    console.error('Datamuse lookup failed:', error);
  }

  return {
    provider: '',
    answers: [],
  };
}

async function buildSolvePayload(clue, pattern, env) {
  const normalizedClue = normalizeClueForLookup(clue);
  const normalizedPattern = normalizePattern(pattern);
  const useMiniLookup = shouldUseMiniLookup(env);

  const [hotDailyMatches, coldDailyMatches, miniMatches, externalResult] = await Promise.all([
    fetchArchiveExactMatches(clue, env),
    fetchColdArchiveExactMatches(normalizedClue, env),
    useMiniLookup ? fetchMiniExactMatches(clue, env) : Promise.resolve([]),
    fetchExternalAnswers(clue, normalizedPattern),
  ]);

  const dailyMatches = sortByDateDesc(
    dedupeHistoryItems(
      [...hotDailyMatches, ...coldDailyMatches],
      (item) => `${item.date}|${item.direction}|${item.number}|${item.answer_norm}`
    )
  );

  const internalAnswers = limitAnswers(
    buildInternalAnswerResults(dailyMatches, miniMatches, normalizedPattern)
  );
  const externalAnswers = externalResult.answers;

  const history = {
    daily: dailyMatches,
    mini: miniMatches,
  };

  return {
    success: true,
    clue,
    normalized_clue: normalizedClue,
    pattern: normalizedPattern,
    source: internalAnswers.length > 0 ? 'internal' : (externalResult.provider || 'internal'),
    used_fallback: internalAnswers.length === 0,
    answers: internalAnswers.length > 0 ? internalAnswers : externalAnswers,
    historical_answers: internalAnswers,
    external_answers: externalAnswers,
    external_source: externalResult.provider,
    history,
    timestamp: new Date().toISOString(),
  };
}

async function handleSolveRequest(request, env, ctx) {
  const url = new URL(request.url);
  const clue = url.searchParams.get('clue');
  const pattern = url.searchParams.get('pattern') || '';

  if (!clue) {
    return errorResponse('Clue parameter is required', env, 400);
  }

  const normalizedClue = normalizeClueForLookup(clue);
  const normalizedPattern = normalizePattern(pattern);
  const cacheUrl = new URL(request.url);
  cacheUrl.search = '';
  cacheUrl.searchParams.set('v', SOLVER_CACHE_VERSION);
  cacheUrl.searchParams.set('clue', normalizedClue);
  if (normalizedPattern) {
    cacheUrl.searchParams.set('pattern', normalizedPattern);
  }

  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
  const cache = caches.default;
  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }

  const payload = await buildSolvePayload(clue, pattern, env);
  const response = jsonResponse(payload, env, {
    headers: {
      'Cache-Control': DEFAULT_CACHE_CONTROL,
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

function documentationResponse(env) {
  return jsonResponse(
    {
      success: true,
      api: 'Crossword Solver API',
      endpoints: [
        '/solve?clue={text}&pattern={optionalPattern} - Unified exact-first solver',
        '/?clue={text}&pattern={optionalPattern} - Legacy CrosswordNexus passthrough',
      ],
    },
    env
  );
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(env),
      });
    }

    if (isBlockedApiCrawler(request)) {
      return errorResponse('Automated AI/API crawling is not allowed for this endpoint.', env, 403);
    }

    if (request.method !== 'GET') {
      return errorResponse('Method not allowed', env, 405);
    }

    const url = new URL(request.url);
    const clue = url.searchParams.get('clue');
    const pattern = normalizePattern(url.searchParams.get('pattern') || '');

    if (url.pathname === '/solve') {
      return handleSolveRequest(request, env, ctx);
    }

    if (url.pathname === '/' && clue) {
      try {
        const answers = await fetchCrosswordNexusAnswers(clue, pattern);
        return jsonResponse(
          {
            success: true,
            answers,
            source: 'crosswordnexus.com',
          },
          env
        );
      } catch (error) {
        return jsonResponse(
          {
            success: false,
            error: error.message,
          },
          env,
          { status: 500 }
        );
      }
    }

    if (url.pathname === '/' || url.pathname === '') {
      return documentationResponse(env);
    }

    return errorResponse(`Endpoint not found: ${url.pathname}`, env, 404);
  },
};
