import {
  cleanClueText,
  fetchText,
  fetchJson,
  getDayOfWeek,
  getFormattedDate,
  normalizePuzzlePayload,
  notFound,
  xmlAttribute
} from '../core/utils.js';

function buildLegacyXmlDate(date) {
  return `${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}`;
}

function extractTag(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}[^>]*v="([^"]*)"`, 'i'));
  return match ? xmlAttribute(match[0], 'v') : '';
}

function buildUsaTodayQueryUrl(query, variables, operationName) {
  const params = new URLSearchParams({
    query,
    variables: JSON.stringify(variables),
    operationName
  });

  return `https://play.usatoday.com/api/query?${params.toString()}`;
}

function buildUsaTodayGraphQlHeaders(referer = 'https://play.usatoday.com/crossword') {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Referer: referer,
    'x-api-type': 'games',
    'x-sitecode': 'USAT'
  };
}

async function fetchUsaTodayQuickSummary(date) {
  const query = `
    query anonymousCrosswordFindGameData($type: String = "quickcross", $date: String, $pages: PagesInputType) {
      __typename
      findGameData(type: $type, date: $date, pages: $pages) {
        __typename
        id
        date
        type
        ...anonymousCrosswordDataPartsRecent
      }
    }

    fragment anonymousCrosswordDataPartsRecent on CrosswordData {
      __typename
      id
      date
      title
      author
      editor
    }
  `;

  const url = buildUsaTodayQueryUrl(
    query,
    {
      userID: '',
      pages: { pageNum: 1, perPage: 1 },
      queryType: 'crosswords_unfiltered_games',
      type: 'quickcross',
      date
    },
    'anonymousCrosswordFindGameData'
  );

  const json = await fetchJson(url, {
    headers: buildUsaTodayGraphQlHeaders()
  });

  const game = json?.data?.findGameData?.[0];
  if (!game?.id) {
    throw notFound(`No USA Today Quick Cross puzzle for ${date}`);
  }

  return game;
}

async function fetchUsaTodayQuickGame(id) {
  const query = `
    query CrosswordsSingleGame($id: String!) {
      __typename
      gameData(id: $id) {
        __typename
        ...crosswordSingleGameData
      }
    }

    fragment crosswordSingleGameData on CrosswordData {
      __typename
      id
      date
      type
      title
      width
      author
      editor
      height
      layout
      downClue
      solution
      copyright
      acrossClue
    }
  `;

  const referer = `https://play.usatoday.com/quick-cross/${id}`;
  const url = buildUsaTodayQueryUrl(query, { id }, 'CrosswordsSingleGame');
  const json = await fetchJson(url, {
    headers: buildUsaTodayGraphQlHeaders(referer)
  });

  const game = json?.data?.gameData;
  if (!game?.id) {
    throw notFound(`No USA Today Quick Cross payload for ${id}`);
  }

  return game;
}

function buildQuickNumberGrid(layoutRows, width) {
  return (layoutRows || []).map((row) => {
    const numbers = [];
    for (let index = 0; index < row.length && numbers.length < width; index += 2) {
      const chunk = row.slice(index, index + 2);
      if (chunk === '-1') {
        numbers.push(-1);
      } else if (/^\d{2}$/.test(chunk)) {
        numbers.push(Number.parseInt(chunk, 10));
      } else {
        numbers.push(0);
      }
    }
    return numbers;
  });
}

function buildQuickNumberIndex(numberGrid, height, width) {
  const numberToPos = new Map();

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const value = numberGrid[row]?.[col];
      if (value > 0) {
        numberToPos.set(value, { row, col });
      }
    }
  }

  return numberToPos;
}

function extractQuickAnswer(number, direction, numberGrid, solutionGrid, width, height, numberToPos) {
  const start = numberToPos.get(number);
  if (!start) {
    return '';
  }

  let row = start.row;
  let col = start.col;
  let answer = '';

  while (row < height && col < width) {
    if (numberGrid[row]?.[col] === -1) {
      break;
    }

    const char = solutionGrid[row]?.[col] || '';
    if (!char || char === ' ') {
      break;
    }

    answer += char;

    if (direction === 'across') {
      col += 1;
    } else {
      row += 1;
    }
  }

  return answer;
}

function parseQuickClueBlock(raw, direction, numberGrid, solutionGrid, width, height, numberToPos) {
  return String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawNumber, ...rest] = line.split('|');
      const number = Number.parseInt(rawNumber, 10);
      const clueText = cleanClueText(rest.join('|'));
      const answer = extractQuickAnswer(number, direction, numberGrid, solutionGrid, width, height, numberToPos);

      return {
        number,
        direction,
        clue_text: clueText,
        answer
      };
    })
    .filter((clue) => Number.isFinite(clue.number) && clue.clue_text && clue.answer);
}

export function createUsaTodayDailyProvider() {
  return {
    slug: 'usa-today-daily',
    title: 'USA Today Crossword',
    lookbackDays: 14,
    async fetchByDate(date) {
      const code = buildLegacyXmlDate(date);
      const url = `https://picayune.uclick.com/comics/usaon/data/usaon${code}-data.xml`;
      const xml = await fetchText(url);

      if (!xml.includes('<crossword')) {
        throw notFound(`No USA Today crossword for ${date}`);
      }

      const getBlock = (tag) => {
        const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
        return match ? match[1] : '';
      };

      const parseBlock = (content, direction) => {
        const matches = [...content.matchAll(/<[ad]\d+\s+([^>]+)\/>/gi)];
        return matches.map((match) => {
          const attrs = match[1];
          return {
            number: Number.parseInt(xmlAttribute(attrs, 'cn'), 10),
            direction,
            clue_text: xmlAttribute(attrs, 'c'),
            answer: xmlAttribute(attrs, 'a')
          };
        });
      };

      return normalizePuzzlePayload({
        date,
        formatted_date: getFormattedDate(date),
        title: extractTag(xml, 'Title') || 'USA Today Crossword',
        author: extractTag(xml, 'Author'),
        editor: extractTag(xml, 'Editor').replace(/^Ed\.\s*/i, ''),
        day_of_week: getDayOfWeek(date),
        permalink: url,
        clues: [
          ...parseBlock(getBlock('across'), 'across'),
          ...parseBlock(getBlock('down'), 'down')
        ]
      });
    }
  };
}

export function createUsaTodayQuickProvider() {
  return {
    slug: 'usa-today-quick',
    title: 'USA Today Quick Cross',
    lookbackDays: 30,
    async fetchByDate(date) {
      const summary = await fetchUsaTodayQuickSummary(date);
      const puzzle = await fetchUsaTodayQuickGame(summary.id);
      const width = Number.parseInt(puzzle.width, 10);
      const height = Number.parseInt(puzzle.height, 10);
      const numberGrid = buildQuickNumberGrid(puzzle.layout, width);
      const numberToPos = buildQuickNumberIndex(numberGrid, height, width);

      return normalizePuzzlePayload({
        date,
        formatted_date: getFormattedDate(date),
        title: 'USA Today Quick Cross',
        author: puzzle.author || summary.author || '',
        editor: puzzle.editor || summary.editor || '',
        day_of_week: getDayOfWeek(date),
        permalink: `https://play.usatoday.com/quick-cross/${summary.id}`,
        clues: [
          ...parseQuickClueBlock(
            puzzle.acrossClue,
            'across',
            numberGrid,
            puzzle.solution || [],
            width,
            height,
            numberToPos
          ),
          ...parseQuickClueBlock(
            puzzle.downClue,
            'down',
            numberGrid,
            puzzle.solution || [],
            width,
            height,
            numberToPos
          )
        ]
      });
    }
  };
}
