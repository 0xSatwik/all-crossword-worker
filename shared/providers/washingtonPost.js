import {
  fetchJson,
  getDayOfWeek,
  getFormattedDate,
  normalizePuzzlePayload,
  notFound
} from '../core/utils.js';

function buildWapoUrl(type, date) {
  const [year, month, day] = date.split('-');
  return `https://games-service-prod.site.aws.wapo.pub/crossword/levels/${type}/${year}/${month}/${day}`;
}

function createWashingtonPostProvider(type, title) {
  return {
    slug: `washington-post-${type}`,
    title,
    lookbackDays: type === 'sunday' ? 21 : 14,
    async fetchByDate(date) {
      const url = buildWapoUrl(type, date);
      let json;

      try {
        json = await fetchJson(url);
      } catch (error) {
        if (error.name === 'NotFoundError') {
          throw notFound(`No Washington Post ${type} puzzle for ${date}`);
        }
        throw error;
      }

      if (!Array.isArray(json.words) || json.words.length === 0) {
        throw notFound(`No Washington Post ${type} puzzle for ${date}`);
      }

      const clues = json.words.map((word) => {
        const firstCell = json.cells?.[word.indexes?.[0]];
        const answer = (word.indexes || []).map((index) => json.cells?.[index]?.answer || '').join('');
        return {
          number: Number.parseInt(firstCell?.number || '0', 10),
          direction: word.direction,
          clue_text: word.clue,
          answer
        };
      });

      return normalizePuzzlePayload({
        date,
        formatted_date: getFormattedDate(date),
        title: json.title || title,
        author: json.creator || '',
        editor: '',
        day_of_week: getDayOfWeek(date),
        permalink: url,
        clues
      });
    }
  };
}

export function createWashingtonPostDailyProvider() {
  return createWashingtonPostProvider('daily', 'Washington Post Daily Crossword');
}

export function createWashingtonPostMiniProvider() {
  return createWashingtonPostProvider('mini', 'Washington Post Mini Crossword');
}

export function createWashingtonPostSundayProvider() {
  return createWashingtonPostProvider('sunday', 'Washington Post Sunday Crossword');
}
