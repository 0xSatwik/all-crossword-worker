/**
 * NYT Mini Crossword Archive
 * Fetches and stores NYT Mini Crossword data in Cloudflare D1 database
 * Provides API endpoints for accessing and updating the data
 */

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

function isBlockedApiCrawler(request) {
  const userAgent = (request.headers.get('User-Agent') || '').toLowerCase();
  return API_BLOCKED_USER_AGENT_PARTS.some((part) => userAgent.includes(part));
}

function blockedCrawlerResponse(corsHeaders) {
  return new Response(JSON.stringify({
    success: false,
    error: 'Automated AI/API crawling is not allowed for this endpoint.'
  }), {
    status: 403,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
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
          'User-Agent': 'nyt-mini-archive',
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

// Handle all incoming requests
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-store',
      'CDN-Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
    };

    const authorizeWrite = () => Boolean(env.API_KEY) && request.headers.get('Authorization') === `Bearer ${env.API_KEY}`;

    // Handle OPTIONS requests for CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

    if (isBlockedApiCrawler(request)) {
      return blockedCrawlerResponse(corsHeaders);
    }

    // API endpoints
    if (path === '/today') {
      // Get today's puzzle
      return await getTodaysPuzzle(env, corsHeaders);
    } else if (path === '/date') {
      // Get puzzle by date
      const date = url.searchParams.get('date');
      if (!date || !isValidDateFormat(date)) {
        return new Response(JSON.stringify({ error: 'Invalid or missing date parameter. Use format YYYY-MM-DD' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      return await getPuzzleByDate(date, env, corsHeaders);
    } else if (path === '/clue') {
      // Search for a clue
      const clue = url.searchParams.get('q');
      const mode = parseSearchMode(url.searchParams.get('mode'), 'contains');
      if (!clue) {
        return new Response(JSON.stringify({ error: 'Missing search query parameter "q"' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      return await searchByClue(clue, env, corsHeaders, mode);
    } else if (path === '/solve') {
      const clue = url.searchParams.get('clue');
      const pattern = url.searchParams.get('pattern');
      if (!clue) {
        return new Response(JSON.stringify({ error: 'Missing search query parameter "clue"' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      return await solveByClue(clue, pattern, env, corsHeaders);
    } else if (path === '/answer') {
      // Search for an answer
      const answer = url.searchParams.get('q');
      const mode = parseSearchMode(url.searchParams.get('mode'), 'exact');
      if (!answer) {
        return new Response(JSON.stringify({ error: 'Missing search query parameter "q"' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      return await searchByAnswer(answer, env, corsHeaders, mode);
    } else if (path === '/today/add') {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed. Use POST.' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      if (!authorizeWrite()) {
        return new Response(JSON.stringify({ error: 'Invalid API key' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      return await fetchAndStoreTodaysPuzzle(env, corsHeaders);
    } else if (path === '/date/add') {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed. Use POST.' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      if (!authorizeWrite()) {
        return new Response(JSON.stringify({ error: 'Invalid API key' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      const date = url.searchParams.get('date');
      if (!date || !isValidDateFormat(date)) {
        return new Response(JSON.stringify({ error: 'Invalid or missing date parameter. Use format YYYY-MM-DD' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      return await fetchAndStorePuzzleByDate(date, env, corsHeaders);
    } else if (path.startsWith('/today/add/') || path.startsWith('/date/add/')) {
      return new Response(JSON.stringify({
        error: 'Legacy path-token write routes were removed. Use POST write routes with Authorization: Bearer <API_KEY>.'
      }), {
        status: 410,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } else if (path === '/formatted') {
      // Get formatted puzzle data (like in crossword_solution.txt)
      const date = url.searchParams.get('date');
      if (!date) {
        const today = new Date().toISOString().split('T')[0];
        return await getFormattedPuzzle(today, env, corsHeaders);
      }
      if (!isValidDateFormat(date)) {
        return new Response(JSON.stringify({ error: 'Invalid date format. Use format YYYY-MM-DD' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      return await getFormattedPuzzle(date, env, corsHeaders);
    } else if (path === '/list') {
      // Get list of available dates (paginated)
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = parseInt(url.searchParams.get('limit') || '50');

      // Enforce reasonable limits
      const safeLimit = Math.min(Math.max(limit, 1), 100);
      const safePage = Math.max(page, 1);

      return await listAvailableDates(safePage, safeLimit, env, corsHeaders);
    } else if (path === '/') {
      // Default response with API documentation for the root path
      return new Response(JSON.stringify({
        message: 'NYT Mini Crossword Archive API',
        endpoints: [
          { path: '/today', description: 'Get today\'s puzzle' },
          { path: '/date?date=YYYY-MM-DD', description: 'Get puzzle by date' },
          { path: '/clue?q=search_term&mode=exact|contains', description: 'Search for clues by exact text or keyword' },
          { path: '/solve?clue=search_term&pattern=OPTIONAL', description: 'Solve by clue using stored mini archive matches' },
          { path: '/answer?q=search_term&mode=exact|contains', description: 'Search for answers by exact text or partial match' },
          { path: '/formatted?date=YYYY-MM-DD', description: 'Get formatted puzzle text (defaults to today if no date)' },
          { path: 'POST /today/add', description: 'Add today\'s puzzle (requires Authorization bearer token)' },
          { path: 'POST /date/add?date=YYYY-MM-DD', description: 'Add puzzle for specific date (requires Authorization bearer token)' }
        ]
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } else {
      // Default response for unknown routes
      return new Response(JSON.stringify({
        message: 'NYT Mini Crossword Archive API - Unknown Route',
        endpoints: [
          { path: '/today', description: 'Get today\'s puzzle' },
          { path: '/date?date=YYYY-MM-DD', description: 'Get puzzle by date' },
          { path: '/clue?q=search_term&mode=exact|contains', description: 'Search for clues by exact text or keyword' },
          { path: '/solve?clue=search_term&pattern=OPTIONAL', description: 'Solve by clue using stored mini archive matches' },
          { path: '/answer?q=search_term&mode=exact|contains', description: 'Search for answers by exact text or partial match' },
          { path: '/formatted?date=YYYY-MM-DD', description: 'Get formatted puzzle like in crossword_solution.txt' }
        ]
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },

  // Handle scheduled cron trigger
  async scheduled(event, env, ctx) {
    ctx.waitUntil(fetchAndStoreTodaysPuzzle(env));
  },
};

function normalizeClueForLookup(text) {
  return (text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/:\s*$/, '')
    .trim();
}

function normalizeAnswerForLookup(text) {
  return (text || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .trim();
}

function parseSearchMode(mode, defaultMode = 'contains') {
  return mode === 'exact' ? 'exact' : defaultMode;
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

/**
 * Fetch today's puzzle from NYT API and store it in the database
 */
async function fetchAndStoreTodaysPuzzle(env, corsHeaders = {}) {
  try {
    // Get today's date in YYYY-MM-DD format (as fallback)
    const today = new Date().toISOString().split('T')[0];

    // Fetch today's puzzle
    const puzzleData = await fetchNYTPuzzle(today, true);

    // use the date from the puzzle itself, fallback to today if missing
    const dateToStore = puzzleData.publicationDate || today;

    if (await puzzleExistsInDB(dateToStore, env.DB)) {
      return new Response(JSON.stringify({
        success: true,
        message: `Puzzle for ${dateToStore} already exists in the database.`,
        date: dateToStore,
        updated: false
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Process and store the puzzle data
    const stored = await storePuzzleInDB(dateToStore, puzzleData, env.DB);

    await triggerFrontendRebuild(env, {
      provider: 'nyt-mini',
      title: 'NYT Mini Crossword',
      date: dateToStore,
      clue_count: stored.clue_count,
      updated_at: new Date().toISOString()
    });

    return new Response(JSON.stringify({
      success: true,
      message: `Successfully fetched and stored puzzle for ${dateToStore}`,
      date: dateToStore,
      clue_count: stored.clue_count,
      updated: true
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

/**
 * Fetch puzzle for a specific date from NYT API and store it in the database
 */
async function fetchAndStorePuzzleByDate(date, env, corsHeaders = {}) {
  try {
    if (await puzzleExistsInDB(date, env.DB)) {
      return new Response(JSON.stringify({
        success: true,
        message: `Puzzle for ${date} already exists in the database.`,
        date,
        updated: false
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Fetch puzzle for the specified date
    const puzzleData = await fetchNYTPuzzle(date, true);

    // Process and store the puzzle data
    const stored = await storePuzzleInDB(date, puzzleData, env.DB);

    await triggerFrontendRebuild(env, {
      provider: 'nyt-mini',
      title: 'NYT Mini Crossword',
      date,
      clue_count: stored.clue_count,
      updated_at: new Date().toISOString()
    });

    return new Response(JSON.stringify({
      success: true,
      message: `Successfully fetched and stored puzzle for ${date}`,
      date,
      clue_count: stored.clue_count,
      updated: true
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

/**
 * Get today's puzzle from the database
 */
async function getTodaysPuzzle(env, corsHeaders = {}) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const resolvedDate = await getLatestAvailablePuzzleDate(today, env);
    if (!resolvedDate) {
      return new Response(JSON.stringify({
        success: false,
        error: `No puzzle found for ${today}`
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return await getPuzzleByDate(resolvedDate, env, corsHeaders);
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

async function getLatestAvailablePuzzleDate(targetDate, env) {
  const onOrBeforeStmt = env.DB
    .prepare('SELECT date FROM puzzles WHERE date <= ? ORDER BY date DESC LIMIT 1')
    .bind(targetDate);
  const onOrBeforeResult = await onOrBeforeStmt.first();

  if (onOrBeforeResult?.date) {
    return onOrBeforeResult.date;
  }

  const latestStmt = env.DB.prepare('SELECT date FROM puzzles ORDER BY date DESC LIMIT 1');
  const latestResult = await latestStmt.first();
  return latestResult?.date || null;
}

async function puzzleExistsInDB(date, db) {
  const result = await db.prepare('SELECT 1 FROM puzzles WHERE date = ? LIMIT 1').bind(date).first();
  return Boolean(result);
}

/**
 * Get formatted puzzle data (like in crossword_solution.txt)
 */
async function getFormattedPuzzle(date, env, corsHeaders = {}) {
  try {
    // Query the database for the formatted puzzle text
    const stmt = env.DB.prepare('SELECT formatted_text FROM puzzles WHERE date = ?').bind(date);
    const result = await stmt.first();

    if (!result) {
      return new Response(JSON.stringify({
        success: false,
        error: `No puzzle found for ${date}`
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(result.formatted_text, {
      headers: { 'Content-Type': 'text/plain', ...corsHeaders },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

/**
 * Get puzzle by date from the database
 */
async function getPuzzleByDate(date, env, corsHeaders = {}) {
  try {
    // Query the database for the puzzle
    const stmt = env.DB.prepare('SELECT formatted_text, extracted_data FROM puzzles WHERE date = ?').bind(date);
    const result = await stmt.first();

    if (!result) {
      return new Response(JSON.stringify({
        success: false,
        error: `No puzzle found for ${date}`
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Parse the stored JSON data
    const extractedData = JSON.parse(result.extracted_data);

    // Get the clues from the clues table
    const cluesStmt = env.DB.prepare('SELECT direction, number, clue, answer FROM clues WHERE date = ? ORDER BY direction DESC, CAST(number AS INTEGER)').bind(date);
    const clues = await cluesStmt.all();

    // Format the response
    const response = {
      success: true,
      date: date,
      formatted: result.formatted_text,
      data: {
        across: {},
        down: {}
      },
      clues: clues.results
    };

    // Organize clues by direction and number
    for (const clue of clues.results) {
      const direction = clue.direction.toLowerCase();
      response.data[direction][clue.number] = {
        clue: clue.clue,
        answer: clue.answer
      };
    }

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

/**
 * Search for clues containing the search term
 */
async function searchByClue(searchTerm, env, corsHeaders = {}, mode = 'contains') {
  try {
    const normalizedClue = normalizeClueForLookup(searchTerm);
    const isExact = mode === 'exact';
    const stmt = env.DB.prepare(isExact ? `
      SELECT date, direction, number, clue, answer
      FROM clues
      WHERE clue_norm = ?
      ORDER BY date DESC
      LIMIT 100
    ` : `
      SELECT date, direction, number, clue, answer
      FROM clues
      WHERE clue_norm LIKE ?
      ORDER BY date DESC
      LIMIT 100
    `).bind(isExact ? normalizedClue : `%${normalizedClue.replace(/[%_]/g, '')}%`);

    const result = await stmt.all();

    if (!result.results || result.results.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        mode,
        count: 0,
        matches: []
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      mode,
      count: result.results.length,
      matches: result.results
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
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
      sample_clue: match.clue || ''
    };

    existing.frequency += 1;
    existing.score += 100;

    if (String(match.date || '') > existing.last_seen) {
      existing.last_seen = match.date || '';
      existing.sample_clue = match.clue || '';
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

async function solveByClue(searchTerm, pattern, env, corsHeaders = {}) {
  try {
    const normalizedClue = normalizeClueForLookup(searchTerm);
    const normalizedPattern = normalizePattern(pattern);

    if (!normalizedClue) {
      return new Response(JSON.stringify({
        success: true,
        clue: searchTerm,
        normalized_clue: normalizedClue,
        pattern: normalizedPattern,
        mode: 'exact',
        count: 0,
        answers: [],
        history: []
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const exactStmt = env.DB.prepare(`
      SELECT date, direction, number, clue, answer
      FROM clues
      WHERE clue_norm = ?
      ORDER BY date DESC
      LIMIT 200
    `).bind(normalizedClue);

    const exact = await exactStmt.all();
    let mode = 'exact';
    let history = (exact.results || []).filter((match) => matchesPattern(normalizeAnswerForLookup(match.answer), normalizedPattern));
    let answers = buildSolveAnswers(exact.results || [], normalizedPattern);

    if (answers.length === 0) {
      const containsStmt = env.DB.prepare(`
        SELECT date, direction, number, clue, answer
        FROM clues
        WHERE clue_norm LIKE ?
        ORDER BY date DESC
        LIMIT 200
      `).bind(`%${normalizedClue.replace(/[%_]/g, '')}%`);

      const contains = await containsStmt.all();
      mode = 'contains';
      history = (contains.results || []).filter((match) => matchesPattern(normalizeAnswerForLookup(match.answer), normalizedPattern));
      answers = buildSolveAnswers(contains.results || [], normalizedPattern);
    }

    return new Response(JSON.stringify({
      success: true,
      clue: searchTerm,
      normalized_clue: normalizedClue,
      pattern: normalizedPattern,
      mode,
      count: answers.length,
      answers,
      history
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

/**
 * Search for answers containing the search term
 */
async function searchByAnswer(searchTerm, env, corsHeaders = {}, mode = 'exact') {
  try {
    const normalizedAnswer = normalizeAnswerForLookup(searchTerm);
    const isExact = mode === 'exact';
    const stmt = env.DB.prepare(isExact ? `
      SELECT date, direction, number, clue, answer
      FROM clues
      WHERE answer_norm = ?
      ORDER BY date DESC
      LIMIT 100
    ` : `
      SELECT date, direction, number, clue, answer
      FROM clues
      WHERE answer_norm LIKE ?
      ORDER BY date DESC
      LIMIT 100
    `).bind(isExact ? normalizedAnswer : `%${normalizedAnswer.replace(/[%_]/g, '')}%`);

    const result = await stmt.all();

    if (!result.results || result.results.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        mode,
        count: 0,
        matches: []
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      mode,
      count: result.results.length,
      matches: result.results
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

/**
 * List available puzzle dates with pagination
 * Sorted by date descending (latest first)
 */
async function listAvailableDates(page, limit, env, corsHeaders = {}) {
  try {
    const offset = (page - 1) * limit;

    // Get total count
    const countStmt = env.DB.prepare('SELECT COUNT(*) as total FROM puzzles');
    const countResult = await countStmt.first();
    const total = countResult.total;
    const totalPages = Math.ceil(total / limit);

    // Get paginated dates
    const stmt = env.DB.prepare(`
      SELECT date 
      FROM puzzles 
      ORDER BY date DESC 
      LIMIT ? OFFSET ?
    `).bind(limit, offset);

    const result = await stmt.all();

    const dates = result.results.map(row => row.date);

    return new Response(JSON.stringify({
      success: true,
      pagination: {
        total: total,
        page: page,
        limit: limit,
        totalPages: totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      dates: dates
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

/**
 * Fetch puzzle data from NYT API
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {boolean} useArchiveHeaders - Whether to use special headers for archive requests
 */
async function fetchNYTPuzzle(date, useArchiveHeaders = false) {
  let url;
  let headers = {
    'Content-Type': 'application/json',
  };

  if (useArchiveHeaders) {
    // For archived puzzles, use the date-specific URL and required headers
    url = `https://www.nytimes.com/svc/crosswords/v6/puzzle/mini/${date}.json`;
    headers = {
      'authority': 'www.nytimes.com',
      'method': 'GET',
      'path': `/svc/crosswords/v6/puzzle/mini/${date}.json`,
      'scheme': 'https',
      'accept': '*/*',
      'accept-encoding': 'gzip, deflate, br, zstd',
      'accept-language': 'en-US,en;q=0.7',
      'content-type': 'application/x-www-form-urlencoded',
      'priority': 'u=1, i',
      'referer': `https://www.nytimes.com/crosswords/game/mini/${date.replace(/-/g, '/')}`,
      'sec-ch-ua': '"Brave";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'sec-gpc': '1',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
      'x-games-auth-bypass': 'true'
    };

    // Note: In a production environment, you would need to handle cookies
    // This is just a placeholder for the required cookies
    // headers.cookie = 'nyt-a=YOUR_COOKIE; SIDNY=YOUR_COOKIE; nyt-purr=YOUR_COOKIE; nyt-jkidd=YOUR_COOKIE';
  } else {
    // For today's puzzle, use the standard URL
    url = 'https://www.nytimes.com/svc/crosswords/v6/puzzle/mini.json';
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch puzzle: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Store puzzle data in the D1 database
 */
async function storePuzzleInDB(date, puzzleData, db) {
  // Extract the relevant data from the puzzle
  const extractedData = extractCrosswordData(puzzleData);

  // Generate the formatted text like in crossword_solution.txt
  const formattedText = formatCrosswordText(extractedData);

  // Begin a transaction
  const results = await db.batch([
    // Store the extracted data and formatted text
    db.prepare(
      'INSERT OR REPLACE INTO puzzles (date, formatted_text, extracted_data) VALUES (?, ?, ?)'
    ).bind(
      date,
      formattedText,
      JSON.stringify(extractedData)
    ),

    // Delete existing clues for this date (in case we're updating)
    db.prepare('DELETE FROM clues WHERE date = ?').bind(date)
  ]);

  // Insert clues into the clues table
  const clueStatements = [];

  // Add across clues
  for (const number in extractedData.across) {
    const clueData = extractedData.across[number];
    const clueText = clueData.clue;
    const answerText = clueData.answer;
    clueStatements.push(
      db.prepare(
        'INSERT INTO clues (date, direction, number, clue, answer, clue_norm, answer_norm, answer_len) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        date,
        'Across',
        number,
        clueText,
        answerText,
        normalizeClueForLookup(clueText),
        normalizeAnswerForLookup(answerText),
        normalizeAnswerForLookup(answerText).length
      )
    );
  }

  // Add down clues
  for (const number in extractedData.down) {
    const clueData = extractedData.down[number];
    const clueText = clueData.clue;
    const answerText = clueData.answer;
    clueStatements.push(
      db.prepare(
        'INSERT INTO clues (date, direction, number, clue, answer, clue_norm, answer_norm, answer_len) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        date,
        'Down',
        number,
        clueText,
        answerText,
        normalizeClueForLookup(clueText),
        normalizeAnswerForLookup(answerText),
        normalizeAnswerForLookup(answerText).length
      )
    );
  }

  // Execute all clue insertions
  await db.batch(clueStatements);

  return {
    clue_count: clueStatements.length
  };
}

/**
 * Format crossword data as text (like in crossword_solution.txt)
 */
function formatCrosswordText(extractedData) {
  let formattedOutput = "ACROSS:\n";

  // Sort across clues by label (numerically)
  const acrossLabels = Object.keys(extractedData.across).sort((a, b) => parseInt(a) - parseInt(b));

  for (const label of acrossLabels) {
    const clueData = extractedData.across[label];
    formattedOutput += `${label}) ${clueData.clue} = ${clueData.answer}\n`;
  }

  formattedOutput += "\nDOWN:\n";

  // Sort down clues by label (numerically)
  const downLabels = Object.keys(extractedData.down).sort((a, b) => parseInt(a) - parseInt(b));

  for (const label of downLabels) {
    const clueData = extractedData.down[label];
    formattedOutput += `${label}) ${clueData.clue} = ${clueData.answer}\n`;
  }

  return formattedOutput;
}

/**
 * Extract structured data from the puzzle JSON
 */
function extractCrosswordData(puzzleData) {
  const puzzle = puzzleData.body[0];
  const cells = puzzle.cells;
  const clues = puzzle.clues;
  const clue_lists = puzzle.clueLists;

  // Create dictionaries for across and down clues
  const across_clues = {};
  const down_clues = {};

  // Find which clue list is Across and which is Down
  const across_index = clue_lists[0].name === 'Across' ? 0 : 1;
  const down_index = 1 - across_index;

  // Process all clues
  for (const clue of clues) {
    const direction = clue.direction;
    const label = clue.label;
    const text = clue.text[0].plain;

    // Get the answer by following the cells in the clue
    let answer = "";
    for (const cell_index of clue.cells) {
      if (cell_index < cells.length && cells[cell_index].answer) {
        answer += cells[cell_index].answer;
      }
    }

    if (direction === 'Across') {
      across_clues[label] = { clue: text, answer: answer };
    } else {  // Down
      down_clues[label] = { clue: text, answer: answer };
    }
  }

  return {
    across: across_clues,
    down: down_clues,
    dimensions: puzzle.dimensions,
    constructor: puzzleData.constructors ? puzzleData.constructors[0] : null,
    publication_date: puzzleData.publicationDate
  };
}

/**
 * Validate date format (YYYY-MM-DD)
 */
function isValidDateFormat(dateString) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;

  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
} 
