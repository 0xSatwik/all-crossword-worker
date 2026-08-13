import { fetchAmuseLabsPuzzle } from '../core/amuselabs.js';
import {
  fetchText,
  getDayOfWeek,
  getFormattedDate,
  normalizePuzzlePayload
} from '../core/utils.js';

function buildLegacyXmlDate(date) {
  return `${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}`;
}

function computeFvlt(set, puzzleId, uid) {
  const hash = (value) => {
    let total = 0;
    for (let index = 0; index < value.length; index += 1) {
      total = (total + value.charCodeAt(index)) >>> 0;
    }
    return total;
  };

  return ((hash(set) ^ hash(puzzleId) ^ hash(uid)) >>> 0).toString(16);
}

async function getLatAmuseLoadToken(set) {
  const pickerUrl = `https://lat.amuselabs.com/lat/date-picker?set=${set}`;
  const pickerHtml = await fetchText(pickerUrl, {
    headers: {
      Referer: 'https://www.latimes.com/games/crossword',
      Origin: 'https://www.latimes.com'
    }
  });

  const rawspsMatch = pickerHtml.match(/pickerParams\.rawsps\s*=\s*['"]([^'"]+)['"]/);
  if (rawspsMatch) {
    const params = JSON.parse(atob(rawspsMatch[1]));
    return params.loadToken || '';
  }

  const scriptMatch = pickerHtml.match(/<script[^>]*id="params"[^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) {
    return { loadToken: '', uid: '' };
  }

  const paramsBlob = JSON.parse(scriptMatch[1]);
  if (!paramsBlob.rawsps) {
    return { loadToken: '', uid: '' };
  }

  const decoded = JSON.parse(atob(paramsBlob.rawsps));
  const loadToken = decoded.loadToken || '';
  let uid = '';

  if (loadToken) {
    try {
      const payload = JSON.parse(atob(loadToken.split('.')[1]));
      uid = payload.uid || '';
    } catch {
      uid = '';
    }
  }

  return { loadToken, uid };
}

async function fetchLatAmusePuzzle({ set, id, date, title }) {
  const { loadToken, uid } = await getLatAmuseLoadToken(set);
  let url = `https://lat.amuselabs.com/lat/crossword?id=${id}&set=${set}`;

  if (loadToken) {
    url += `&loadToken=${encodeURIComponent(loadToken)}`;
  }
  if (uid) {
    url += `&fvlt=${computeFvlt(set, id, uid)}`;
  }

  return fetchAmuseLabsPuzzle({
    url,
    date,
    defaults: {
      title,
      formatted_date: getFormattedDate(date),
      day_of_week: getDayOfWeek(date),
      permalink: url
    }
  });
}

export function createLatimesDailyProvider() {
  return {
    slug: 'latimes-daily',
    title: 'Los Angeles Times Daily Crossword',
    lookbackDays: 14,
    async fetchByDate(date) {
      return fetchLatAmusePuzzle({
        set: 'latimes',
        id: `tca${buildLegacyXmlDate(date)}`,
        date,
        title: 'Los Angeles Times Daily Crossword'
      });
    }
  };
}

export function createLatimesMiniProvider() {
  return {
    slug: 'latimes-mini',
    title: 'LA Times Mini',
    lookbackDays: 14,
    async fetchByDate(date) {
      return fetchLatAmusePuzzle({
        set: 'latimes-mini',
        id: `latimes-mini-${date.replace(/-/g, '')}`,
        date,
        title: 'LA Times Mini'
      });
    }
  };
}
