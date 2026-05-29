import {
  NotFoundError,
  buildHeaders,
  cleanClueText,
  getDayOfWeek,
  getFormattedDate,
  normalizeAnswerForLookup,
  normalizeClueForLookup,
  parseDate,
  toIsoDate
} from './utils.js';

const HOT_CACHE_VERSION_KEY = 'search-version';
const HOT_CACHE_TTL_SECONDS = 3600;
const PUZZLE_CACHE_TTL_SECONDS = 900;

function errorResponse(message, status = 400) {
  return new Response(
    JSON.stringify({
      success: false,
      error: message
    }),
    {
      status,
      headers: buildHeaders()
    }
  );
}

function successResponse(data) {
  return new Response(
    JSON.stringify({
      success: true,
      data,
      timestamp: new Date().toISOString()
    }),
    {
      status: 200,
      headers: buildHeaders()
    }
  );
}

function removeSensitiveFields(data) {
  if (Array.isArray(data)) {
    return data.map((item) => removeSensitiveFields(item));
  }

  if (data && typeof data === 'object') {
    const { permalink, ...safeData } = data;
    for (const key of Object.keys(safeData)) {
      if (safeData[key] && typeof safeData[key] === 'object') {
        safeData[key] = removeSensitiveFields(safeData[key]);
      }
    }
    return safeData;
  }

  return data;
}

function parseSearchMode(mode, defaultMode = 'contains') {
  if (mode === 'exact') {
    return 'exact';
  }
  if (mode === 'contains') {
    return 'contains';
  }
  return defaultMode;
}

function normalizePattern(pattern) {
  return String(pattern || '')
    .toUpperCase()
    .replace(/[^A-Z?]/g, '')
    .trim();
}

function matchesPattern(answerNorm, pattern) {
  if (!pattern) {
    return true;
  }

  if (answerNorm.length !== pattern.length) {
    return false;
  }

  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern[index] !== '?' && pattern[index] !== answerNorm[index]) {
      return false;
    }
  }

  return true;
}

function getHotCache(env) {
  return env.HOT_CACHE || null;
}

async function getHotCacheVersion(env) {
  const cache = getHotCache(env);
  if (!cache) {
    return 'v0';
  }
  return (await cache.get(HOT_CACHE_VERSION_KEY)) || 'v0';
}

async function bumpHotCacheVersion(env) {
  const cache = getHotCache(env);
  if (!cache) {
    return;
  }
  await cache.put(HOT_CACHE_VERSION_KEY, `v${Date.now()}`, {
    expirationTtl: HOT_CACHE_TTL_SECONDS
  });
}

async function getCachedJson(env, key) {
  const cache = getHotCache(env);
  if (!cache) {
    return null;
  }
  return cache.get(key, 'json');
}

async function putCachedJson(env, key, data, ttl = HOT_CACHE_TTL_SECONDS) {
  const cache = getHotCache(env);
  if (!cache) {
    return;
  }
  await cache.put(key, JSON.stringify(data), {
    expirationTtl: ttl
  });
}

async function deleteCachedKey(env, key) {
  const cache = getHotCache(env);
  if (!cache) {
    return;
  }
  await cache.delete(key);
}

function buildExactCacheKey(type, version, value) {
  return `${type}:${version}:${value}`;
}

function buildDateCacheKey(type, date) {
  return `${type}:${date}`;
}

async function invalidatePuzzleCaches(date, env) {
  await Promise.all([
    deleteCachedKey(env, buildDateCacheKey('puzzle', date)),
    deleteCachedKey(env, buildDateCacheKey('clues', date))
  ]);
}

async function getRawPuzzleDataByDate(date, env) {
  const puzzle = await env.DB.prepare(`
    SELECT *
    FROM puzzles
    WHERE date = ?
  `).bind(date).first();

  if (!puzzle) {
    return null;
  }

  const clues = await env.DB.prepare(`
    SELECT clue_id, puzzle_id, number, direction, clue_text, answer
    FROM clues
    WHERE puzzle_id = ?
    ORDER BY
      CASE direction
        WHEN 'across' THEN 0
        WHEN 'down' THEN 1
        ELSE 2
      END,
      number
  `).bind(puzzle.puzzle_id).all();

  return {
    puzzle,
    clues: clues.results || [],
    across: (clues.results || []).filter((clue) => clue.direction === 'across'),
    down: (clues.results || []).filter((clue) => clue.direction === 'down')
  };
}

async function getPuzzleByDate(date, env) {
  const cacheKey = buildDateCacheKey('puzzle', date);
  const cached = await getCachedJson(env, cacheKey);
  if (cached) {
    return successResponse(cached);
  }

  const puzzleData = await getRawPuzzleDataByDate(date, env);
  if (!puzzleData) {
    return errorResponse(`No puzzle found for date: ${date}`, 404);
  }

  const safe = removeSensitiveFields(puzzleData);
  await putCachedJson(env, cacheKey, safe, PUZZLE_CACHE_TTL_SECONDS);
  return successResponse(safe);
}

async function queryClueMatches(clueText, env, mode = 'contains', limit = 100) {
  const normalized = normalizeClueForLookup(clueText);
  const isExact = mode === 'exact';

  if (!normalized) {
    return { normalized, results: [] };
  }

  const sql = isExact ? `
    SELECT c.clue_id, c.puzzle_id, c.number, c.direction, c.clue_text, c.answer, p.date, p.title
    FROM clues c
    JOIN puzzles p ON p.puzzle_id = c.puzzle_id
    WHERE c.clue_norm = ?
    ORDER BY p.date DESC, c.direction, c.number
    LIMIT ${limit}
  ` : `
    SELECT c.clue_id, c.puzzle_id, c.number, c.direction, c.clue_text, c.answer, p.date, p.title
    FROM clues c
    JOIN puzzles p ON p.puzzle_id = c.puzzle_id
    WHERE c.clue_norm LIKE ?
    ORDER BY p.date DESC, c.direction, c.number
    LIMIT ${limit}
  `;

  const queryValue = isExact ? normalized : `%${normalized.replace(/[%_]/g, '')}%`;
  const result = await env.DB.prepare(sql).bind(queryValue).all();
  return {
    normalized,
    results: result.results || []
  };
}

async function getLatestStoredPuzzle(env) {
  const row = await env.DB.prepare(`
    SELECT date
    FROM puzzles
    ORDER BY date DESC
    LIMIT 1
  `).first();

  if (!row?.date) {
    return null;
  }

  return getRawPuzzleDataByDate(row.date, env);
}

async function getCluesByDate(date, env) {
  const cacheKey = buildDateCacheKey('clues', date);
  const cached = await getCachedJson(env, cacheKey);
  if (cached) {
    return successResponse(cached);
  }

  const puzzleData = await getRawPuzzleDataByDate(date, env);
  if (!puzzleData) {
    return errorResponse(`No puzzle found for date: ${date}`, 404);
  }

  const safe = removeSensitiveFields({
    puzzle_id: puzzleData.puzzle.puzzle_id,
    date: puzzleData.puzzle.date,
    title: puzzleData.puzzle.title,
    clues: puzzleData.clues
  });

  await putCachedJson(env, cacheKey, safe, PUZZLE_CACHE_TTL_SECONDS);
  return successResponse(safe);
}

async function searchByAnswer(answer, env, mode = 'exact') {
  const normalized = normalizeAnswerForLookup(answer);
  const isExact = mode === 'exact';

  if (!normalized) {
    return successResponse({ query: answer, mode, count: 0, results: [] });
  }

  const version = isExact ? await getHotCacheVersion(env) : null;
  const cacheKey = isExact ? buildExactCacheKey('answer', version, normalized) : null;
  if (cacheKey) {
    const cached = await getCachedJson(env, cacheKey);
    if (cached) {
      return successResponse(cached);
    }
  }

  const sql = isExact ? `
    SELECT c.clue_id, c.puzzle_id, c.number, c.direction, c.clue_text, c.answer, p.date, p.title
    FROM clues c
    JOIN puzzles p ON p.puzzle_id = c.puzzle_id
    WHERE c.answer_norm = ?
    ORDER BY p.date DESC, c.direction, c.number
    LIMIT 100
  ` : `
    SELECT c.clue_id, c.puzzle_id, c.number, c.direction, c.clue_text, c.answer, p.date, p.title
    FROM clues c
    JOIN puzzles p ON p.puzzle_id = c.puzzle_id
    WHERE c.answer_norm LIKE ?
    ORDER BY p.date DESC, c.direction, c.number
    LIMIT 100
  `;

  const queryValue = isExact ? normalized : `%${normalized.replace(/[%_]/g, '')}%`;
  const result = await env.DB.prepare(sql).bind(queryValue).all();
  const safe = removeSensitiveFields({
    query: answer,
    mode,
    count: result.results?.length || 0,
    results: result.results || []
  });

  if (cacheKey) {
    await putCachedJson(env, cacheKey, safe);
  }

  return successResponse(safe);
}

async function searchByClueText(clueText, env, mode = 'contains') {
  const normalized = normalizeClueForLookup(clueText);
  const isExact = mode === 'exact';

  if (!normalized) {
    return successResponse({ query: clueText, mode, count: 0, results: [] });
  }

  const version = isExact ? await getHotCacheVersion(env) : null;
  const cacheKey = isExact ? buildExactCacheKey('clue', version, normalized) : null;
  if (cacheKey) {
    const cached = await getCachedJson(env, cacheKey);
    if (cached) {
      return successResponse(cached);
    }
  }

  const result = await queryClueMatches(clueText, env, mode, 100);
  const safe = removeSensitiveFields({
    query: clueText,
    mode,
    count: result.results.length,
    results: result.results
  });

  if (cacheKey) {
    await putCachedJson(env, cacheKey, safe);
  }

  return successResponse(safe);
}

function buildSolveAnswers(matches, pattern) {
  const answers = new Map();

  for (const match of matches) {
    const answerNorm = normalizeAnswerForLookup(match.answer);
    if (!answerNorm || !matchesPattern(answerNorm, pattern)) {
      continue;
    }

    const existing = answers.get(answerNorm) || {
      word: answerNorm,
      score: 0,
      frequency: 0,
      last_seen: match.date || '',
      sample_clue: cleanClueText(match.clue_text || ''),
      sample_title: match.title || ''
    };

    existing.frequency += 1;
    existing.score += 100;
    if (String(match.date || '') > existing.last_seen) {
      existing.last_seen = match.date || '';
      existing.sample_clue = cleanClueText(match.clue_text || '');
      existing.sample_title = match.title || '';
    }

    answers.set(answerNorm, existing);
  }

  return [...answers.values()].sort((left, right) => {
    if (right.frequency !== left.frequency) {
      return right.frequency - left.frequency;
    }

    return String(right.last_seen).localeCompare(String(left.last_seen));
  });
}

async function solveByClue(clueText, pattern, env) {
  const normalizedClue = normalizeClueForLookup(clueText);
  const normalizedPattern = normalizePattern(pattern);

  if (!normalizedClue) {
    return successResponse({
      clue: clueText,
      normalized_clue: normalizedClue,
      pattern: normalizedPattern,
      mode: 'exact',
      answers: [],
      history: []
    });
  }

  const version = await getHotCacheVersion(env);
  const cacheKey = buildExactCacheKey('solve', version, `${normalizedClue}|${normalizedPattern || '*'}`);
  const cached = await getCachedJson(env, cacheKey);
  if (cached) {
    return successResponse(cached);
  }

  const exact = await queryClueMatches(clueText, env, 'exact', 200);
  let mode = 'exact';
  let history = exact.results.filter((match) => matchesPattern(normalizeAnswerForLookup(match.answer), normalizedPattern));
  let answers = buildSolveAnswers(exact.results, normalizedPattern);

  if (answers.length === 0) {
    const contains = await queryClueMatches(clueText, env, 'contains', 200);
    mode = 'contains';
    history = contains.results.filter((match) => matchesPattern(normalizeAnswerForLookup(match.answer), normalizedPattern));
    answers = buildSolveAnswers(contains.results, normalizedPattern);
  }

  const safe = removeSensitiveFields({
    clue: clueText,
    normalized_clue: normalizedClue,
    pattern: normalizedPattern,
    mode,
    count: answers.length,
    answers,
    history
  });

  await putCachedJson(env, cacheKey, safe);
  return successResponse(safe);
}

async function getRelatedClues(answer, env) {
  const normalized = normalizeAnswerForLookup(answer);
  if (!normalized) {
    return successResponse({ answer, occurrences: 0, appearances: [] });
  }

  const version = await getHotCacheVersion(env);
  const cacheKey = buildExactCacheKey('related', version, normalized);
  const cached = await getCachedJson(env, cacheKey);
  if (cached) {
    return successResponse(cached);
  }

  const [{ count: occurrences = 0 } = {}, rows] = await Promise.all([
    env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM clues
      WHERE answer_norm = ?
    `).bind(normalized).first(),
    env.DB.prepare(`
      WITH matched_puzzles AS (
        SELECT p.puzzle_id, p.date, p.formatted_date, p.day_of_week, p.title
        FROM clues c
        JOIN puzzles p ON p.puzzle_id = c.puzzle_id
        WHERE c.answer_norm = ?
        GROUP BY p.puzzle_id, p.date, p.formatted_date, p.day_of_week, p.title
        ORDER BY p.date DESC
        LIMIT 50
      )
      SELECT
        mp.puzzle_id,
        mp.date,
        mp.formatted_date,
        mp.day_of_week,
        mp.title,
        c.clue_id,
        c.number,
        c.direction,
        c.clue_text,
        c.answer
      FROM matched_puzzles mp
      JOIN clues c ON c.puzzle_id = mp.puzzle_id
      ORDER BY
        mp.date DESC,
        CASE c.direction
          WHEN 'across' THEN 0
          WHEN 'down' THEN 1
          ELSE 2
        END,
        c.number
    `).bind(normalized).all()
  ]);

  const grouped = {};
  for (const row of rows.results || []) {
    const key = `${row.puzzle_id}:${row.date}`;
    if (!grouped[key]) {
      grouped[key] = {
        date: row.date,
        formatted_date: row.formatted_date,
        day_of_week: row.day_of_week,
        title: row.title,
        clues: []
      };
    }

    grouped[key].clues.push({
      clue_id: row.clue_id,
      puzzle_id: row.puzzle_id,
      number: row.number,
      direction: row.direction,
      clue_text: row.clue_text,
      answer: row.answer
    });
  }

  const safe = removeSensitiveFields({
    answer,
    occurrences,
    appearances: Object.values(grouped)
  });

  await putCachedJson(env, cacheKey, safe);
  return successResponse(safe);
}

async function puzzleExists(date, env) {
  const result = await env.DB.prepare('SELECT 1 FROM puzzles WHERE date = ?').bind(date).first();
  return Boolean(result);
}

async function savePuzzleToDatabase(puzzle, env) {
  const existing = await env.DB.prepare(`
    SELECT puzzle_id
    FROM puzzles
    WHERE date = ?
  `).bind(puzzle.date).first();

  let puzzleId = existing?.puzzle_id || null;
  const createdAt = new Date().toISOString().replace('T', ' ').split('.')[0];

  if (puzzleId) {
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE puzzles
        SET formatted_date = ?, title = ?, author = ?, editor = ?, day_of_week = ?, permalink = ?
        WHERE puzzle_id = ?
      `).bind(
        puzzle.formatted_date || getFormattedDate(puzzle.date),
        puzzle.title || '',
        puzzle.author || '',
        puzzle.editor || '',
        puzzle.day_of_week || getDayOfWeek(puzzle.date),
        puzzle.permalink || '',
        puzzleId
      ),
      env.DB.prepare('DELETE FROM clues WHERE puzzle_id = ?').bind(puzzleId)
    ]);
  } else {
    const inserted = await env.DB.prepare(`
      INSERT INTO puzzles (date, formatted_date, title, author, editor, day_of_week, permalink, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING puzzle_id
    `).bind(
      puzzle.date,
      puzzle.formatted_date || getFormattedDate(puzzle.date),
      puzzle.title || '',
      puzzle.author || '',
      puzzle.editor || '',
      puzzle.day_of_week || getDayOfWeek(puzzle.date),
      puzzle.permalink || '',
      createdAt
    ).first();
    puzzleId = inserted?.puzzle_id || null;
  }

  if (!puzzleId) {
    throw new Error(`Could not resolve puzzle id for ${puzzle.date}`);
  }

  const statements = (puzzle.clues || []).map((clue) => {
    const clueText = cleanClueText(clue.clue_text || clue.clue || '');
    const answer = String(clue.answer || '').trim();
    const answerNorm = normalizeAnswerForLookup(answer);

    return env.DB.prepare(`
      INSERT INTO clues (puzzle_id, number, direction, clue_text, answer, clue_norm, answer_norm, answer_len)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      puzzleId,
      clue.number,
      clue.direction,
      clueText,
      answer,
      normalizeClueForLookup(clueText),
      answerNorm,
      answerNorm.length
    );
  });

  const chunkSize = 50;
  for (let index = 0; index < statements.length; index += chunkSize) {
    await env.DB.batch(statements.slice(index, index + chunkSize));
  }

  await invalidatePuzzleCaches(puzzle.date, env);
  await bumpHotCacheVersion(env);

  return {
    puzzle_id: puzzleId,
    clue_count: statements.length,
    is_new: !existing
  };
}

async function deletePuzzleByDate(date, env) {
  const existing = await env.DB.prepare(`
    SELECT puzzle_id
    FROM puzzles
    WHERE date = ?
  `).bind(date).first();

  if (!existing) {
    return errorResponse(`No puzzle found for date: ${date}`, 404);
  }

  const [deleteClues, deletePuzzle] = await env.DB.batch([
    env.DB.prepare('DELETE FROM clues WHERE puzzle_id = ?').bind(existing.puzzle_id),
    env.DB.prepare('DELETE FROM puzzles WHERE puzzle_id = ?').bind(existing.puzzle_id)
  ]);

  await invalidatePuzzleCaches(date, env);
  await bumpHotCacheVersion(env);

  return successResponse({
    message: `Successfully deleted puzzle for ${date}`,
    date,
    clues_deleted: deleteClues.changes,
    puzzle_deleted: deletePuzzle.changes
  });
}

function authorizeWrite(request, env) {
  if (!env.API_TOKEN) {
    return false;
  }

  return request.headers.get('Authorization') === `Bearer ${env.API_TOKEN}`;
}

function methodNotAllowed(allowed) {
  return errorResponse(`Method not allowed. Use ${allowed.join(', ')}.`, 405);
}

function requireWriteAccess(request, env) {
  if (request.method !== 'POST') {
    return methodNotAllowed(['POST']);
  }
  if (!authorizeWrite(request, env)) {
    return errorResponse('Unauthorized access. Valid API token required.', 401);
  }
  return null;
}

async function findLatestAvailablePuzzle(provider, env) {
  const lookbackDays = provider.lookbackDays || 14;

  for (let offset = 0; offset <= lookbackDays; offset += 1) {
    const probe = new Date();
    probe.setUTCDate(probe.getUTCDate() - offset);
    const date = toIsoDate(probe);

    try {
      const puzzle = await provider.fetchByDate(date, env);
      return { puzzle, date };
    } catch (error) {
      if (error instanceof NotFoundError) {
        continue;
      }
      throw error;
    }
  }

  throw new Error(`No ${provider.title} puzzle found in the last ${lookbackDays} days.`);
}

async function fetchAndSavePuzzle(date, env, provider) {
  const existing = await puzzleExists(date, env);
  if (existing) {
    return successResponse({
      message: `Puzzle for ${date} already exists in the database.`,
      date,
      updated: false
    });
  }

  const puzzle = await provider.fetchByDate(date, env);
  const result = await savePuzzleToDatabase(puzzle, env);

  return successResponse({
    message: `Saved ${provider.title} puzzle for ${date}.`,
    date,
    puzzle_id: result.puzzle_id,
    clue_count: result.clue_count,
    updated: true
  });
}

async function fetchAndSaveLatest(env, provider) {
  const latestPuzzle = typeof provider.fetchLatest === 'function'
    ? await provider.fetchLatest(env)
    : (await findLatestAvailablePuzzle(provider, env)).puzzle;
  const existing = await puzzleExists(latestPuzzle.date, env);

  if (existing) {
    return successResponse({
      message: `Latest available ${provider.title} puzzle is already stored.`,
      date: latestPuzzle.date,
      updated: false
    });
  }

  const result = await savePuzzleToDatabase(latestPuzzle, env);
  return successResponse({
    message: `Saved latest available ${provider.title} puzzle.`,
    date: latestPuzzle.date,
    puzzle_id: result.puzzle_id,
    clue_count: result.clue_count,
    updated: true
  });
}

export function createArchiveWorker(provider) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const path = url.pathname;

      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: buildHeaders() });
      }

      try {
        if (path === '/' || path === '') {
          return successResponse({
            provider: provider.slug,
            title: provider.title,
            endpoints: [
              '/api/puzzle/{date}',
              '/api/puzzle/latest',
              '/api/clues/{date}',
              '/api/solve?clue={text}&pattern={optionalPattern}',
              '/api/search/answer?q={answer}&mode=exact|contains',
              '/api/search/clue?q={text}&mode=exact|contains',
              '/api/related/answer?q={answer}',
              'POST /api/add/{date}',
              'POST /api/update/latest',
              'POST /api/delete/{date}'
            ]
          });
        }

        if (path === '/api/puzzle/latest') {
          const latest = await getLatestStoredPuzzle(env);
          if (!latest) {
            return errorResponse('No stored puzzles yet.', 404);
          }
          return successResponse(removeSensitiveFields(latest));
        }

        if (path.startsWith('/api/puzzle/')) {
          const date = parseDate(path.slice('/api/puzzle/'.length));
          if (!date) {
            return errorResponse('Invalid date format. Use YYYY-MM-DD or MM/DD/YYYY.');
          }
          return getPuzzleByDate(date, env);
        }

        if (path.startsWith('/api/clues/')) {
          const date = parseDate(path.slice('/api/clues/'.length));
          if (!date) {
            return errorResponse('Invalid date format. Use YYYY-MM-DD or MM/DD/YYYY.');
          }
          return getCluesByDate(date, env);
        }

        if (path === '/api/solve') {
          const clue = url.searchParams.get('clue');
          const pattern = url.searchParams.get('pattern') || '';
          if (!clue) {
            return errorResponse('Missing solve query parameter "clue".');
          }
          return solveByClue(clue, pattern, env);
        }

        if (path === '/api/search/answer') {
          const answer = url.searchParams.get('q');
          const mode = parseSearchMode(url.searchParams.get('mode'), 'exact');
          if (!answer) {
            return errorResponse('Missing search query parameter "q".');
          }
          return searchByAnswer(answer, env, mode);
        }

        if (path === '/api/search/clue') {
          const clue = url.searchParams.get('q');
          const mode = parseSearchMode(url.searchParams.get('mode'), 'contains');
          if (!clue) {
            return errorResponse('Missing search query parameter "q".');
          }
          return searchByClueText(clue, env, mode);
        }

        if (path === '/api/related/answer') {
          const answer = url.searchParams.get('q');
          if (!answer) {
            return errorResponse('Missing search query parameter "q".');
          }
          return getRelatedClues(answer, env);
        }

        if (path.startsWith('/api/add/')) {
          const denied = requireWriteAccess(request, env);
          if (denied) {
            return denied;
          }
          const parts = path.split('/').filter(Boolean);
          if (parts.length !== 3) {
            return errorResponse('Invalid URL format. Use /api/add/YYYY-MM-DD.', 400);
          }
          const date = parseDate(parts[2]);
          if (!date) {
            return errorResponse('Invalid date format. Use YYYY-MM-DD.');
          }
          return fetchAndSavePuzzle(date, env, provider);
        }

        if (path.startsWith('/api/update/latest')) {
          const denied = requireWriteAccess(request, env);
          if (denied) {
            return denied;
          }
          return fetchAndSaveLatest(env, provider);
        }

        if (path.startsWith('/api/delete/')) {
          const denied = requireWriteAccess(request, env);
          if (denied) {
            return denied;
          }
          const parts = path.split('/').filter(Boolean);
          if (parts.length !== 3) {
            return errorResponse('Invalid URL format. Use /api/delete/YYYY-MM-DD.', 400);
          }
          const date = parseDate(parts[2]);
          if (!date) {
            return errorResponse('Invalid date format. Use YYYY-MM-DD.');
          }
          return deletePuzzleByDate(date, env);
        }

        return errorResponse(`Endpoint not found: ${path}`, 404);
      } catch (error) {
        if (error instanceof NotFoundError) {
          return errorResponse(error.message, 404);
        }

        return errorResponse(error.message || 'Unexpected error.', 500);
      }
    },

    async scheduled(event, env) {
      try {
        return await fetchAndSaveLatest(env, provider);
      } catch (error) {
        return errorResponse(error.message || 'Scheduled update failed.', 500);
      }
    }
  };
}
