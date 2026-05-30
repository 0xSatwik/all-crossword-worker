export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export function notFound(message) {
  return new NotFoundError(message);
}

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
  'omgili',
  'facebookbot',
  'meta-externalagent',
  'amazonbot'
];

export function isBlockedApiCrawler(request) {
  const userAgent = (request.headers.get('User-Agent') || '').toLowerCase();
  return API_BLOCKED_USER_AGENT_PARTS.some((part) => userAgent.includes(part));
}

export function buildHeaders(options = {}) {
  const cacheControl = options.cacheControl || 'no-store';
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS, POST',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': options.contentType || 'application/json',
    'Cache-Control': cacheControl,
    'CDN-Cache-Control': options.cdnCacheControl || cacheControl,
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff'
  };
}

export function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function parseDate(dateStr) {
  if (!dateStr) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
    const [month, day, year] = dateStr.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  if (String(dateStr).toLowerCase() === 'today') {
    return toIsoDate(new Date());
  }

  return null;
}

export function safeDateFromIso(dateStr) {
  return new Date(`${dateStr}T12:00:00Z`);
}

export function getFormattedDate(dateStr) {
  return safeDateFromIso(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

export function getDayOfWeek(dateStr) {
  return safeDateFromIso(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC'
  });
}

export function repairMojibake(text) {
  if (!text || !/[ÃƒÃ‚Ã¢]/.test(text)) {
    return text || '';
  }

  try {
    const bytes = Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return text;
  }
}

export function decodePercentEscapes(text) {
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

export function decodeHtmlEntities(text) {
  if (!text) {
    return '';
  }

  const named = {
    '&quot;': '"',
    '&amp;': '&',
    '&#39;': "'",
    '&lt;': '<',
    '&gt;': '>',
    '&nbsp;': ' ',
    '&mdash;': '-',
    '&ndash;': '-',
    '&rsquo;': "'",
    '&lsquo;': "'",
    '&rdquo;': '"',
    '&ldquo;': '"',
    '&apos;': "'"
  };

  const result = text.replace(/&[a-zA-Z#0-9]+;/g, (entity) => {
    if (named[entity]) {
      return named[entity];
    }

    const hexMatch = entity.match(/^&#x([0-9a-fA-F]+);$/);
    if (hexMatch) {
      return String.fromCodePoint(parseInt(hexMatch[1], 16));
    }

    const decMatch = entity.match(/^&#(\d+);$/);
    if (decMatch) {
      return String.fromCodePoint(parseInt(decMatch[1], 10));
    }

    return entity;
  });

  return repairMojibake(result);
}

export function stripHtml(text) {
  return String(text || '').replace(/<[^>]*>/g, '');
}

export function cleanDisplayText(text) {
  return repairMojibake(
    decodePercentEscapes(decodeHtmlEntities(stripHtml(String(text || ''))))
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function cleanClueText(text) {
  return cleanDisplayText(text).replace(/:\s*$/, '').trim();
}

export function normalizeByline(author, editor) {
  let cleanAuthor = cleanDisplayText(author || '').replace(/^by\s+/i, '').trim();
  let cleanEditor = cleanDisplayText(editor || '')
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

export function summarizePuzzleCounts(across = [], down = []) {
  const acrossCount = Array.isArray(across) ? across.length : 0;
  const downCount = Array.isArray(down) ? down.length : 0;

  return {
    across_count: acrossCount,
    down_count: downCount,
    total_clues: acrossCount + downCount
  };
}

export function normalizeClueForLookup(text) {
  return cleanClueText(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function normalizeAnswerForLookup(text) {
  return String(text || '').toUpperCase().replace(/\s+/g, '').trim();
}

export async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    redirect: 'follow',
    ...options,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      Accept: '*/*',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw notFound(`404 for ${url}`);
    }
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.text();
}

export async function fetchJson(url, options = {}) {
  const text = await fetchText(url, options);
  return JSON.parse(text);
}

export function sortClues(clues) {
  return clues.sort((a, b) => {
    if (a.number !== b.number) {
      return a.number - b.number;
    }
    if (a.direction === b.direction) {
      return 0;
    }
    return a.direction === 'across' ? -1 : 1;
  });
}

export function normalizePuzzlePayload(payload) {
  const byline = normalizeByline(payload.author, payload.editor);

  return {
    date: payload.date,
    formatted_date: payload.formatted_date || getFormattedDate(payload.date),
    title: cleanDisplayText(payload.title || ''),
    author: byline.author,
    editor: byline.editor,
    day_of_week: payload.day_of_week || getDayOfWeek(payload.date),
    permalink: payload.permalink || '',
    clues: sortClues(
      (payload.clues || [])
        .map((clue) => {
          const clueText = cleanClueText(clue.clue_text || clue.clue || '');
          const answer = cleanDisplayText(String(clue.answer || '').trim());

          return {
            number: Number.parseInt(clue.number, 10),
            direction: clue.direction === 'down' ? 'down' : 'across',
            clue_text: clueText,
            answer
          };
        })
        .filter((clue) => Number.isFinite(clue.number) && clue.clue_text && clue.answer)
    )
  };
}

export function xmlAttribute(input, attribute) {
  const match = input.match(new RegExp(`${attribute}="([^"]*)"`, 'i'));
  return match ? decodeHtmlEntities(match[1]) : '';
}
