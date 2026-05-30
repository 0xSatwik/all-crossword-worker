/**
 * Cloudflare Worker for the NYT Crossword Archive API
 * Provides access to historical crossword data stored in D1 database
 */

// Headers for CORS and content type
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS, POST',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};
const READ_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600';
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

function jsonHeaders(cacheControl = 'no-store') {
  return {
    ...headers,
    'Cache-Control': cacheControl,
    'CDN-Cache-Control': cacheControl,
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff'
  };
}

function isBlockedApiCrawler(request) {
  const userAgent = (request.headers.get('User-Agent') || '').toLowerCase();
  return API_BLOCKED_USER_AGENT_PARTS.some((part) => userAgent.includes(part));
}

// Error response helper
function errorResponse(message, status = 400) {
  return new Response(
    JSON.stringify({
      success: false,
      error: message
    }),
    {
      status: status,
      headers: jsonHeaders()
    }
  );
}

// Success response helper
function successResponse(data) {
  return new Response(
    JSON.stringify({
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    }),
    {
      status: 200,
      headers: jsonHeaders(READ_CACHE_CONTROL)
    }
  );
}

function blockedCrawlerResponse() {
  return new Response(JSON.stringify({
    success: false,
    error: 'Automated AI/API crawling is not allowed for this endpoint.'
  }), {
    status: 403,
    headers: jsonHeaders()
  });
}

async function triggerFrontendRebuild(env, payload) {
  if (env.FRONTEND_REBUILD_HOOK_URL) {
    try {
      await fetch(env.FRONTEND_REBUILD_HOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.error('Frontend rebuild hook failed:', error);
    }
  }

  if (env.GITHUB_DISPATCH_TOKEN && env.GITHUB_DISPATCH_REPO) {
    try {
      const response = await fetch(`https://api.github.com/repos/${env.GITHUB_DISPATCH_REPO}/dispatches`, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'crossword-archive-worker',
          'X-GitHub-Api-Version': '2026-03-10'
        },
        body: JSON.stringify({
          event_type: env.GITHUB_DISPATCH_EVENT || 'crossword-data-updated',
          client_payload: payload
        })
      });

      if (!response.ok) {
        console.error(`GitHub repository dispatch failed: ${response.status}`);
      }
    } catch (error) {
      console.error('GitHub repository dispatch failed:', error);
    }
  }
}

// Remove sensitive fields from response data
function removeSensitiveFields(data) {
  // If it's an array, process each item
  if (Array.isArray(data)) {
    return data.map(item => removeSensitiveFields(item));
  }

  // If it's an object, remove permalink field
  if (data && typeof data === 'object') {
    // Create a new object without the permalink
    const { permalink, ...safeData } = data;

    // Process nested objects and arrays
    for (const key in safeData) {
      if (typeof safeData[key] === 'object' && safeData[key] !== null) {
        safeData[key] = removeSensitiveFields(safeData[key]);
      }
    }

    return safeData;
  }

  // Return primitives as is
  return data;
}

// Parse date parameters in various formats
function parseDate(dateStr) {
  // Handle YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Handle MM/DD/YYYY format
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
    const [month, day, year] = dateStr.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Get today's date in YYYY-MM-DD format if "today" is passed
  if (dateStr.toLowerCase() === 'today') {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  // Handle invalid date format
  return null;
}

// Get formatted date string
function getFormattedDate(dateStr) {
  try {
    const dt = new Date(dateStr);
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return dt.toLocaleDateString('en-US', options);
  } catch (error) {
    return "Unknown Date";
  }
}

// Get day of week
function getDayOfWeek(dateStr) {
  try {
    const dt = new Date(dateStr);
    return dt.toLocaleDateString('en-US', { weekday: 'long' });
  } catch (error) {
    return null;
  }
}

// Add HTML entity decoder function
function decodeHtmlEntities(text) {
  if (!text) return '';

  const entities = {
    '&quot;': '"',
    '&amp;': '&',
    '&#39;': "'",
    '&lt;': '<',
    '&gt;': '>',
    '&nbsp;': ' ',
    '&mdash;': '—',
    '&ndash;': '–',
    '&rsquo;': "'",
    '&lsquo;': "'",
    '&rdquo;': '"',
    '&ldquo;': '"',
    '&apos;': "'"
  };

  // Replace all HTML entities with their corresponding characters
  return text.replace(/&[^;]+;/g, (entity) => {
    if (entities[entity]) {
      return entities[entity];
    }

    // Handle numeric entities
    if (entity.match(/&#[0-9]+;/)) {
      const code = entity.replace(/&#([0-9]+);/, '$1');
      return String.fromCharCode(parseInt(code, 10));
    }

    return entity;
  });
}

// Function to clean and normalize clue text
function cleanClueText(text) {
  if (!text) return '';

  // Remove HTML tags
  let cleaned = text.replace(/<[^>]*>/g, '');

  // Decode HTML entities
  cleaned = decodeHtmlEntities(cleaned);

  // Remove any trailing colons
  cleaned = cleaned.replace(/:\s*$/, '');

  // Normalize spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

function cleanDisplayText(text) {
  if (!text) return '';

  let cleaned = decodeHtmlEntities(String(text));

  if (/%[0-9A-Fa-f]{2}/.test(cleaned)) {
    try {
      cleaned = decodeURIComponent(cleaned);
    } catch {
      cleaned = cleaned.replace(/%([0-9A-Fa-f]{2})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );
    }
  }

  return cleaned
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeByline(author, editor) {
  let cleanAuthor = cleanDisplayText(author).replace(/^by\s+/i, '').trim();
  let cleanEditor = cleanDisplayText(editor)
    .replace(/^(?:edited by|editors?\s*:|ed\.?\s*)/i, '')
    .trim();

  if (!cleanEditor && cleanAuthor) {
    const combinedPatterns = [
      /^(.*?)\s*[;|/]\s*(?:edited by|ed\.?)\s*(.+)$/i,
      /^(.*?)\s*[·•-]\s*edited by\s+(.+)$/i
    ];

    for (const pattern of combinedPatterns) {
      const match = cleanAuthor.match(pattern);
      if (match) {
        cleanAuthor = cleanDisplayText(match[1]).replace(/^by\s+/i, '').trim();
        cleanEditor = cleanDisplayText(match[2])
          .replace(/^(?:edited by|editors?\s*:|ed\.?\s*)/i, '')
          .trim();
        break;
      }
    }
  }

  return {
    author: cleanAuthor,
    editor: cleanEditor
  };
}

function summarizePuzzleCounts(across = [], down = []) {
  const acrossCount = Array.isArray(across) ? across.length : 0;
  const downCount = Array.isArray(down) ? down.length : 0;

  return {
    across_count: acrossCount,
    down_count: downCount,
    total_clues: acrossCount + downCount
  };
}

function addPuzzleMetadata(puzzleData) {
  if (!puzzleData?.puzzle) {
    return puzzleData;
  }

  const counts = summarizePuzzleCounts(puzzleData.across, puzzleData.down);
  const byline = normalizeByline(puzzleData.puzzle.author, puzzleData.puzzle.editor);

  return {
    ...puzzleData,
    puzzle: {
      ...puzzleData.puzzle,
      ...byline,
      ...counts
    }
  };
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

function parseSearchMode(mode, defaultMode = 'contains') {
  if (mode === 'exact') return 'exact';
  if (mode === 'contains') return 'contains';
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

function authorizeWrite(request, env) {
  if (!env.API_TOKEN) {
    return false;
  }

  return request.headers.get('Authorization') === `Bearer ${env.API_TOKEN}`;
}

function requireWriteAccess(request, env) {
  if (request.method !== 'POST') {
    return errorResponse('Method not allowed. Use POST.', 405);
  }

  if (!authorizeWrite(request, env)) {
    return errorResponse('Unauthorized access. Valid API token required.', 401);
  }

  return null;
}

// Router for handling API requests
async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Handle OPTIONS request (CORS preflight)
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: jsonHeaders() });
  }

  if (isBlockedApiCrawler(request)) {
    return blockedCrawlerResponse();
  }

  // Add a root route handler to show API documentation
  if (path === '/' || path === '') {
    return new Response(
      JSON.stringify({
        success: true,
        api: "Crossword Archive API",
        version: "1.1.0",
        deployment_check: "ok",
        endpoints: [
          "/api/puzzle/{date} - Get puzzle by date (YYYY-MM-DD)",
          "/api/puzzle/latest - Get the most recent puzzle",
          "/api/clues/{date} - Get clues by date (YYYY-MM-DD)",
          "/api/solve?clue={text}&pattern={optionalPattern} - Solve by clue using stored archive matches",
          "/api/search/answer?q={answer}&mode=exact|contains - Search clues by answer",
          "/api/search/clue?q={text}&mode=exact|contains - Search answers by clue text",
          "/api/related/answer?q={answer} - Get related clues for an answer",
          "POST /api/add/{date} - Add or update puzzle for specific date",
          "POST /api/update/latest - Fetch and update the latest puzzle",
          "POST /api/delete/{date} - Delete puzzle data for a specific date"
        ]
      }),
      {
        status: 200,
        headers: jsonHeaders(READ_CACHE_CONTROL)
      }
    );
  }

  if (path === '/api/puzzle/latest') {
    const latest = await env.DB.prepare(`
      SELECT date
      FROM puzzles
      ORDER BY date DESC
      LIMIT 1
    `).first();

    if (!latest?.date) {
      return errorResponse('No stored puzzles yet.', 404);
    }

    return await getPuzzleByDate(latest.date, env);
  }

  // Route for getting puzzle by date
  if (path.startsWith('/api/puzzle/') && path.length > 12) {
    const dateParam = path.slice(12); // Extract date from URL
    const date = parseDate(dateParam);

    if (!date) {
      return errorResponse('Invalid date format. Use YYYY-MM-DD or MM/DD/YYYY.');
    }

    return await getPuzzleByDate(date, env);
  }

  // Route for getting clues by date
  if (path.startsWith('/api/clues/') && path.length > 11) {
    const dateParam = path.slice(11); // Extract date from URL
    const date = parseDate(dateParam);

    if (!date) {
      return errorResponse('Invalid date format. Use YYYY-MM-DD or MM/DD/YYYY.');
    }

    return await getCluesByDate(date, env);
  }

  // Route for searching clues by answer
  if (path === '/api/search/answer') {
    const params = url.searchParams;
    const answer = params.get('q');
    const mode = parseSearchMode(params.get('mode'), 'exact');

    if (!answer) {
      return errorResponse('Missing search query parameter "q".');
    }

    return await searchByAnswer(answer, env, mode);
  }

  // Route for searching answers by clue text
  if (path === '/api/search/clue') {
    const params = url.searchParams;
    const clueText = params.get('q');
    const mode = parseSearchMode(params.get('mode'), 'contains');

    if (!clueText) {
      return errorResponse('Missing search query parameter "q".');
    }

    return await searchByClueText(clueText, env, mode);
  }

  if (path === '/api/solve') {
    const params = url.searchParams;
    const clueText = params.get('clue');
    const pattern = params.get('pattern');

    if (!clueText) {
      return errorResponse('Missing search query parameter "clue".');
    }

    return await solveByClue(clueText, pattern, env);
  }

  // Route for getting all related clues for an answer
  if (path === '/api/related/answer') {
    const params = url.searchParams;
    const answer = params.get('q');

    if (!answer) {
      return errorResponse('Missing search query parameter "q".');
    }

    return await getRelatedClues(answer, env);
  }

  if (path.startsWith('/today/add/') || path.startsWith('/date/add/') || path.startsWith('/today/commit/')) {
    return errorResponse('Legacy path-token write routes were removed. Use POST write routes with Authorization: Bearer <API_TOKEN>.', 410);
  }

  if (path.startsWith('/api/add/')) {
    const denied = requireWriteAccess(request, env);
    if (denied) {
      return denied;
    }

    const parts = path.split('/').filter(p => p.length > 0);
    if (parts.length !== 3) {
      return errorResponse('Invalid URL format. Use /api/add/YYYY-MM-DD.');
    }

    const dateParam = parts[2];
    const date = parseDate(dateParam);

    if (!date) {
      return errorResponse('Invalid date format. Use YYYY-MM-DD.');
    }

    return await fetchAndAddPuzzle(date, env);
  }

  if (path.startsWith('/api/update/latest')) {
    const denied = requireWriteAccess(request, env);
    if (denied) {
      return denied;
    }

    return await fetchAndAddLatestPuzzle(env);
  }

  if (path.startsWith('/api/delete/') && path.length > 12) {
    const denied = requireWriteAccess(request, env);
    if (denied) {
      return denied;
    }

    const pathParts = path.slice(12).split('/');

    if (pathParts.length < 1) {
      return errorResponse('Invalid URL format. Use /api/delete/YYYY-MM-DD');
    }

    const dateParam = pathParts[0];
    const date = parseDate(dateParam);

    if (!date) {
      return errorResponse('Invalid date format. Use YYYY-MM-DD.');
    }

    if (pathParts.length > 1 && pathParts[1]) {
      return errorResponse('Delete route no longer accepts API tokens in the URL path.', 400);
    }

    return await deletePuzzleByDate(date, env);
  }

  // Default response for unknown routes
  return errorResponse(`Endpoint not found: ${path}`, 404);
}

// NEW: Helper to get raw puzzle data from DB without formatting a response
async function getRawPuzzleDataByDate(date, env) {
  // Get puzzle info
  const puzzleData = await env.DB.prepare(`
    SELECT * FROM puzzles WHERE date = ?
  `).bind(date).first();

  if (!puzzleData) {
    return null;
  }

  // Get all clues for this puzzle
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
  `).bind(puzzleData.puzzle_id).all();

  // Format the data into the structure needed for today.json
  const result = {
    puzzle: puzzleData,
    clues: clues.results,
    across: clues.results.filter(c => c.direction === 'across'),
    down: clues.results.filter(c => c.direction === 'down')
  };

  return addPuzzleMetadata(result);
}

// Get puzzle and all clues for a specific date
async function getPuzzleByDate(date, env) {
  try {
    const puzzleData = await getRawPuzzleDataByDate(date, env);

    if (!puzzleData) {
      return errorResponse(`No puzzle found for date: ${date}`, 404);
    }

    // Remove sensitive fields like permalink
    const safeData = removeSensitiveFields(puzzleData);

    return successResponse(safeData);
  } catch (error) {
    console.error(`Database error retrieving puzzle for ${date}:`, error);
    return errorResponse(`Database error: ${error.message}`, 500);
  }
}

// Get just the clues for a specific date
async function getCluesByDate(date, env) {
  try {
    const puzzleData = await getRawPuzzleDataByDate(date, env);

    if (!puzzleData) {
      return errorResponse(`No puzzle found for date: ${date}`, 404);
    }

    // Extract just the clues
    const cluesData = {
      puzzle_id: puzzleData.puzzle.puzzle_id,
      date: puzzleData.puzzle.date,
      title: puzzleData.puzzle.title,
      author: puzzleData.puzzle.author,
      editor: puzzleData.puzzle.editor,
      across_count: puzzleData.puzzle.across_count,
      down_count: puzzleData.puzzle.down_count,
      total_clues: puzzleData.puzzle.total_clues,
      clues: puzzleData.clues
    };

    // Remove sensitive fields like permalink
    const safeData = removeSensitiveFields(cluesData);

    return successResponse(safeData);
  } catch (error) {
    console.error(`Database error retrieving clues for ${date}:`, error);
    return errorResponse(`Database error: ${error.message}`, 500);
  }
}

// Search for clues by answer
async function searchByAnswer(answer, env, mode = 'exact') {
  try {
    const normalizedAnswer = normalizeAnswerForLookup(answer);
    const isExact = mode === 'exact';

    if (!normalizedAnswer) {
      return successResponse({
        query: answer,
        mode,
        count: 0,
        results: []
      });
    }

    const sql = isExact ? `
      SELECT
        c.clue_id,
        c.puzzle_id,
        c.number,
        c.direction,
        c.clue_text,
        c.answer,
        p.date,
        p.title
      FROM clues c
      JOIN puzzles p ON c.puzzle_id = p.puzzle_id
      WHERE c.answer_norm = ?
      ORDER BY p.date DESC, c.direction, c.number
      LIMIT 100
    ` : `
      SELECT
        c.clue_id,
        c.puzzle_id,
        c.number,
        c.direction,
        c.clue_text,
        c.answer,
        p.date,
        p.title
      FROM clues c
      JOIN puzzles p ON c.puzzle_id = p.puzzle_id
      WHERE c.answer_norm LIKE ?
      ORDER BY p.date DESC, c.direction, c.number
      LIMIT 100
    `;

    const clues = await env.DB.prepare(sql)
      .bind(isExact ? normalizedAnswer : `%${normalizedAnswer.replace(/[%_]/g, '')}%`)
      .all();

    if (!clues.results || clues.results.length === 0) {
      return successResponse({
        query: answer,
        mode,
        count: 0,
        results: []
      });
    }

    const result = {
      query: answer,
      mode,
      count: clues.results.length,
      results: clues.results
    };

    // Remove sensitive fields like permalink
    const safeData = removeSensitiveFields(result);

    return successResponse(safeData);
  } catch (error) {
    console.error(`Error searching for answer "${answer}":`, error);
    return errorResponse(`Database error: ${error.message}`, 500);
  }
}

async function queryClueMatches(clueText, env, mode = 'contains', limit = 100) {
  const normalizedClue = normalizeClueForLookup(clueText);
  const isExact = mode === 'exact';

  if (!normalizedClue) {
    return {
      normalized: normalizedClue,
      results: []
    };
  }

  const sql = isExact ? `
    SELECT
      c.clue_id,
      c.puzzle_id,
      c.number,
      c.direction,
      c.clue_text,
      c.answer,
      p.date,
      p.title
    FROM clues c
    JOIN puzzles p ON c.puzzle_id = p.puzzle_id
    WHERE c.clue_norm = ?
    ORDER BY p.date DESC, c.direction, c.number
    LIMIT ${limit}
  ` : `
    SELECT
      c.clue_id,
      c.puzzle_id,
      c.number,
      c.direction,
      c.clue_text,
      c.answer,
      p.date,
      p.title
    FROM clues c
    JOIN puzzles p ON c.puzzle_id = p.puzzle_id
    WHERE c.clue_norm LIKE ?
    ORDER BY p.date DESC, c.direction, c.number
    LIMIT ${limit}
  `;

  const result = await env.DB.prepare(sql)
    .bind(isExact ? normalizedClue : `%${normalizedClue.replace(/[%_]/g, '')}%`)
    .all();

  return {
    normalized: normalizedClue,
    results: result.results || []
  };
}

// Search for answers by clue text
async function searchByClueText(clueText, env, mode = 'contains') {
  try {
    const normalizedClue = normalizeClueForLookup(clueText);
    const isExact = mode === 'exact';

    if (!normalizedClue) {
      return successResponse({
        query: clueText,
        mode,
        count: 0,
        results: []
      });
    }

    const clues = await queryClueMatches(clueText, env, mode, 100);

    if (clues.results.length === 0) {
      return successResponse({
        query: clueText,
        mode,
        count: 0,
        results: []
      });
    }

    const result = {
      query: clueText,
      mode,
      count: clues.results.length,
      results: clues.results
    };

    // Remove sensitive fields like permalink
    const safeData = removeSensitiveFields(result);

    return successResponse(safeData);
  } catch (error) {
    console.error(`Error searching for clue "${clueText}":`, error);
    return errorResponse(`Database error: ${error.message}`, 500);
  }
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
  try {
    const normalizedClue = normalizeClueForLookup(clueText);
    const normalizedPattern = normalizePattern(pattern);

    if (!normalizedClue) {
      return successResponse({
        clue: clueText,
        normalized_clue: normalizedClue,
        pattern: normalizedPattern,
        mode: 'exact',
        count: 0,
        answers: [],
        history: []
      });
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

    const result = removeSensitiveFields({
      clue: clueText,
      normalized_clue: normalizedClue,
      pattern: normalizedPattern,
      mode,
      count: answers.length,
      answers,
      history
    });
    return successResponse(result);
  } catch (error) {
    console.error(`Error solving clue "${clueText}":`, error);
    return errorResponse(`Database error: ${error.message}`, 500);
  }
}

// Get all related clues for a specific answer
async function getRelatedClues(answer, env) {
  try {
    const normalizedAnswer = normalizeAnswerForLookup(answer);

    const matchingClues = await env.DB.prepare(`
      SELECT
        c.clue_id,
        c.puzzle_id,
        c.number,
        c.direction,
        c.clue_text,
        c.answer,
        p.date,
        p.formatted_date,
        p.day_of_week,
        p.title
      FROM clues c
      JOIN puzzles p ON c.puzzle_id = p.puzzle_id
      WHERE c.answer_norm = ?
      ORDER BY p.date DESC
    `).bind(normalizedAnswer).all();

    if (!matchingClues.results || matchingClues.results.length === 0) {
      return errorResponse(`No related clues found for answer: ${answer}`, 404);
    }

    const puzzleClues = await env.DB.prepare(`
      SELECT
        c.puzzle_id,
        c.clue_id,
        c.number,
        c.direction,
        c.clue_text,
        c.answer,
        p.date,
        p.formatted_date,
        p.day_of_week,
        p.title
      FROM clues c
      JOIN puzzles p ON c.puzzle_id = p.puzzle_id
      WHERE c.puzzle_id IN (
        SELECT DISTINCT puzzle_id
        FROM clues
        WHERE answer_norm = ?
      )
      ORDER BY
        p.date DESC,
        CASE c.direction
          WHEN 'across' THEN 0
          WHEN 'down' THEN 1
          ELSE 2
        END,
        c.number
    `).bind(normalizedAnswer).all();

    const cluesByDate = {};
    for (const clue of puzzleClues.results || []) {
      if (!cluesByDate[clue.date]) {
        cluesByDate[clue.date] = {
          date: clue.date,
          formatted_date: clue.formatted_date,
          day_of_week: clue.day_of_week,
          title: clue.title,
          clues: []
        };
      }

      cluesByDate[clue.date].clues.push({
        clue_id: clue.clue_id,
        puzzle_id: clue.puzzle_id,
        number: clue.number,
        direction: clue.direction,
        clue_text: clue.clue_text,
        answer: clue.answer
      });
    }

    const response = {
      answer: answer,
      occurrences: matchingClues.results.length,
      appearances: Object.values(cluesByDate)
    };

    // Remove sensitive fields like permalink
    const safeData = removeSensitiveFields(response);

    return successResponse(safeData);
  } catch (error) {
    console.error(`Error finding related clues for "${answer}":`, error);
    return errorResponse(`Database error: ${error.message}`, 500);
  }
}

// NEW: Fetch raw puzzle data from NYT API
async function fetchNYTPuzzleData(date) {
  const url = `https://www.nytimes.com/svc/crosswords/v6/puzzle/daily/${date}.json`;
  console.log(`Fetching puzzle data from ${url}`);

  try {
    const response = await fetch(url, {
      headers: {
        'authority': 'www.nytimes.com',
        'method': 'GET',
        'path': `/svc/crosswords/v6/puzzle/daily/${date}.json`,
        'scheme': 'https',
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.7',
        'content-type': 'application/x-www-form-urlencoded',
        'priority': 'u=1, i',
        'referer': `https://www.nytimes.com/crosswords/game/daily/${date.replace(/-/g, '/')}`,
        'sec-ch-ua': '"Brave";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'sec-gpc': '1',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
        'x-games-auth-bypass': 'true'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch puzzle data: ${response.status} ${response.statusText}`);
    }

    const jsonData = await response.json();
    return jsonData;
  } catch (error) {
    console.error(`Error fetching NYT puzzle data for ${date}:`, error);
    return null;
  }
}

// NEW: Extract puzzle data from NYT JSON format
function extractNYTData(jsonData, date) {
  if (!jsonData || !jsonData.body || !jsonData.body[0]) {
    console.error("Invalid NYT JSON data structure");
    return null;
  }

  const puzzleBody = jsonData.body[0];
  const cells = puzzleBody.cells;

  // New Clue List
  const transformedClues = [];

  if (puzzleBody.clues) {
    puzzleBody.clues.forEach((rawClue) => {
      let answer = "";
      if (rawClue.cells && Array.isArray(rawClue.cells)) {
        answer = rawClue.cells.map(cellIndex => {
          return cells[cellIndex] ? cells[cellIndex].answer : "";
        }).join("");
      }

      // Label is usually integer, but API sends strings sometimes.
      const number = parseInt(rawClue.label, 10);

      // Extract clue text
      let clueText = "";
      if (rawClue.text && rawClue.text[0]) {
        if (rawClue.text[0].plain) {
          clueText = rawClue.text[0].plain;
        } else if (typeof rawClue.text[0] === 'string') {
          clueText = rawClue.text[0];
        }
      }

      if (!clueText && rawClue.text) {
        // Fallback if text is just a string?
        // Based on 17.json, structure is text: [ { plain: "..." } ]
      }

      transformedClues.push({
        number: number,
        clue: clueText,
        answer: answer,
        direction: rawClue.direction.toLowerCase()
      });
    });
  }

  const byline = normalizeByline(
    (jsonData.constructors && jsonData.constructors[0])
      || (puzzleBody.constructors && puzzleBody.constructors[0])
      || '',
    jsonData.editor || puzzleBody.editor || ''
  );

  return {
    date: date, // "YYYY-MM-DD"
    formatted_date: getFormattedDate(date),
    day_of_week: getDayOfWeek(date),
    title: cleanDisplayText(puzzleBody.title || `New York Times, ${getFormattedDate(date)}`),
    author: byline.author,
    editor: byline.editor,
    clues: transformedClues
  };
}

// NEW: Save puzzle data to the database
async function savePuzzleToDatabase(puzzle, env) {
  try {
    console.log(`Saving puzzle for ${puzzle.date}: ${puzzle.title}`);

    // Ensure all required fields have values to prevent D1_TYPE_ERROR
    const permalink = puzzle.permalink || ''; // Default to empty string if permalink is undefined

    // Begin a transaction
    const insertPuzzle = env.DB.prepare(`
      INSERT INTO puzzles (date, formatted_date, title, author, editor, day_of_week, permalink)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (date) DO UPDATE SET
        formatted_date = excluded.formatted_date,
        title = excluded.title,
        author = excluded.author,
        editor = excluded.editor,
        day_of_week = excluded.day_of_week,
        permalink = excluded.permalink
    `);

    const result = await insertPuzzle.bind(
      puzzle.date,
      puzzle.formatted_date || '',
      cleanDisplayText(puzzle.title || ''),
      normalizeByline(puzzle.author, puzzle.editor).author,
      normalizeByline(puzzle.author, puzzle.editor).editor,
      puzzle.day_of_week || '',
      permalink
    ).run();

    // Get the puzzle ID
    let puzzleId;
    if (result.changes > 0) {
      // If we inserted a new puzzle, get the last ID
      const getLastId = await env.DB.prepare('SELECT last_insert_rowid() as id').first();
      puzzleId = getLastId.id;
    } else {
      // If we updated an existing puzzle, get its ID
      const getPuzzleId = await env.DB.prepare('SELECT puzzle_id FROM puzzles WHERE date = ?').bind(puzzle.date).first();
      puzzleId = getPuzzleId.puzzle_id;

      // Delete existing clues for this puzzle
      await env.DB.prepare('DELETE FROM clues WHERE puzzle_id = ?').bind(puzzleId).run();
    }

    // Insert clues using batch execution for performance
    const clueStatements = puzzle.clues.map(clue => {
      const clueText = cleanClueText(clue.clue || clue.clue_text || '');
      const clueAnswer = (clue.answer || '').trim();

      return env.DB.prepare(`
        INSERT INTO clues (puzzle_id, number, direction, clue_text, answer, clue_norm, answer_norm, answer_len)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        puzzleId,
        clue.number,
        clue.direction,
        clueText,
        clueAnswer,
        normalizeClueForLookup(clueText),
        normalizeAnswerForLookup(clueAnswer),
        normalizeAnswerForLookup(clueAnswer).length
      );
    });

    // Execute all clue insertions in a single batch
    if (clueStatements.length > 0) {
      // D1 has a limit on batch size (usually 128 or sometimes 100 queries)
      // Safely batch in chunks of 50 to avoid hitting limits
      const BATCH_SIZE = 50;
      for (let i = 0; i < clueStatements.length; i += BATCH_SIZE) {
        const batch = clueStatements.slice(i, i + BATCH_SIZE);
        await env.DB.batch(batch);
      }
    }

    return {
      puzzle_id: puzzleId,
      date: puzzle.date,
      clue_count: puzzle.clues.length,
      is_new: result.changes > 0
    };
  } catch (error) {
    console.error("Error saving puzzle data:", error);
    throw error;
  }
}

// NEW: Check if puzzle exists for a date
async function puzzleExists(date, env) {
  try {
    const result = await env.DB.prepare('SELECT 1 FROM puzzles WHERE date = ?').bind(date).first();
    return !!result;
  } catch (error) {
    console.error(`Error checking if puzzle exists for ${date}:`, error);
    return false;
  }
}

// NEW: Fetch and add a puzzle for a specific date
async function fetchAndAddPuzzle(date, env) {
  try {
    // Check if puzzle already exists
    const exists = await puzzleExists(date, env);
    if (exists) {
      return successResponse({
        message: `Puzzle for ${date} already exists in the database.`,
        date: date,
        updated: false
      });
    }

    // Scrape the puzzle data
    console.log(`Fetching puzzle data for ${date}`);
    const rawData = await fetchNYTPuzzleData(date);

    // Process the data
    const puzzleData = extractNYTData(rawData, date);

    if (!puzzleData || !puzzleData.clues || puzzleData.clues.length === 0) {
      return errorResponse(`No puzzle data found for ${date}.`, 404);
    }

    // Save to database
    const result = await savePuzzleToDatabase(puzzleData, env);

    const payload = {
      message: `Successfully added puzzle for ${date} with ${result.clue_count} clues.`,
      date: date,
      puzzle_id: result.puzzle_id,
      clue_count: result.clue_count,
      updated: true
    };

    await triggerFrontendRebuild(env, {
      provider: 'nyt-daily',
      title: 'NYT Crossword',
      date,
      updated_at: new Date().toISOString()
    });

    return successResponse(payload);
  } catch (error) {
    console.error(`Error fetching puzzle for ${date}:`, error);
    return errorResponse(`Error fetching puzzle: ${error.message}`, 500);
  }
}

// NEW: Fetch today's or latest available puzzle
async function fetchAndAddLatestPuzzle(env) {
  try {
    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    console.log(`Checking for latest puzzle on ${todayStr}.`);

    let message;
    let updatedDb = false;
    let savedResult = null;

    // Try to get puzzle from DB first
    let puzzleData = await getRawPuzzleDataByDate(todayStr, env);

    if (puzzleData) {
      // Puzzle is already in the database.
      message = "Today's puzzle is already in the database.";
      console.log(message);
    } else {
      // Puzzle not in DB, so scrape it
      console.log(`Puzzle for ${todayStr} not in DB. Attempting to fetch from source.`);
      const rawData = await fetchNYTPuzzleData(todayStr);
      const scrapedData = extractNYTData(rawData, todayStr);

      if (!scrapedData || !scrapedData.clues || scrapedData.clues.length === 0) {
        return successResponse({
          message: `No new puzzle available to scrape for today (${todayStr}) yet.`,
          date: todayStr,
          updated: false
        });
      }

      // Save to database
      savedResult = await savePuzzleToDatabase(scrapedData, env);
      updatedDb = true;

      puzzleData = await getRawPuzzleDataByDate(todayStr, env);

      message = `Successfully added puzzle for ${todayStr} with ${savedResult.clue_count} clues.`;
    }

    if (!puzzleData) {
      return errorResponse(`Could not retrieve puzzle data for ${todayStr}.`, 500);
    }

    if (updatedDb) {
      await triggerFrontendRebuild(env, {
        provider: 'nyt-daily',
        title: 'NYT Crossword',
        date: todayStr,
        puzzle_id: savedResult?.puzzle_id,
        clue_count: savedResult?.clue_count,
        updated_at: new Date().toISOString()
      });
    }

    return successResponse({
      message: message,
      date: todayStr,
      updated: updatedDb
    });
  } catch (error) {
    return errorResponse(`Error fetching latest puzzle: ${error.message}`, 500);
  }
}

// NEW: Function to delete a puzzle by date
async function deletePuzzleByDate(date, env) {
  try {
    // First, check if puzzle exists
    const puzzleData = await env.DB.prepare(`
      SELECT puzzle_id FROM puzzles WHERE date = ?
    `).bind(date).first();

    if (!puzzleData) {
      return errorResponse(`No puzzle found for date: ${date}`, 404);
    }

    const puzzleId = puzzleData.puzzle_id;

    // Begin a transaction to ensure atomic operation
    // Delete the clues first (foreign key constraint)
    const deleteCluesResult = await env.DB.prepare(`
      DELETE FROM clues WHERE puzzle_id = ?
    `).bind(puzzleId).run();

    // Then delete the puzzle
    const deletePuzzleResult = await env.DB.prepare(`
      DELETE FROM puzzles WHERE puzzle_id = ?
    `).bind(puzzleId).run();

    return successResponse({
      message: `Successfully deleted puzzle for ${date}`,
      date: date,
      clues_deleted: deleteCluesResult.changes,
      puzzle_deleted: deletePuzzleResult.changes
    });
  } catch (error) {
    console.error(`Error deleting puzzle for ${date}:`, error);
    return errorResponse(`Database error: ${error.message}`, 500);
  }
}

async function updateGithubFile(filePath, content, message, env) {
  console.warn(`GitHub writebacks were removed. Skipping ${filePath}.`);
  return null;
}

// Main event handler
export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  },

  // NEW: Scheduled event handler for automatic updates
  async scheduled(event, env, ctx) {
    // This will be triggered on the schedule defined in wrangler.toml
    console.log(`Running scheduled update at ${new Date().toISOString()}`);
    try {
      const result = await fetchAndAddLatestPuzzle(env);
      console.log("Scheduled update result:", JSON.stringify(result));
      return result;
    } catch (error) {
      console.error("Error in scheduled update:", error);
      return errorResponse(`Scheduled update failed: ${error.message}`, 500);
    }
  }
}; 
