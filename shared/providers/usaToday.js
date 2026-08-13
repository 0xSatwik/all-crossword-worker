import {
  cleanClueText,
  fetchJson,
  getDayOfWeek,
  getFormattedDate,
  normalizePuzzlePayload,
  notFound
} from '../core/utils.js';

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

async function fetchUsaTodayGameSummary(type, date) {
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
      type,
      date
    },
    'anonymousCrosswordFindGameData'
  );

  const json = await fetchJson(url, {
    headers: buildUsaTodayGraphQlHeaders()
  });

  const game = json?.data?.findGameData?.[0];
  if (!game?.id) {
    throw notFound(`No USA Today ${type} puzzle for ${date}`);
  }

  return game;
}

async function fetchUsaTodayGame(id) {
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
    throw notFound(`No USA Today puzzle payload for ${id}`);
  }

  return game;
}

export function normalizeLayoutRows(layout, width, height) {
  if (!Array.isArray(layout) || layout.length === 0) {
    return [];
  }

  if (layout.length === height) {
    return layout;
  }

  const flat = layout.join('');
  const cellChars = flat.length === width * height ? 1 : 2;
  const rows = [];
  for (let row = 0; row < height; row += 1) {
    rows.push(flat.slice(row * width * cellChars, (row + 1) * width * cellChars));
  }
  return rows;
}

export function buildQuickNumberGrid(layout, width, height) {
  return normalizeLayoutRows(layout, width, height).map((row) => {
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

export function buildQuickNumberIndex(numberGrid, height, width) {
  const acrossNumberToPos = new Map();
  const downNumberToPos = new Map();

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const value = numberGrid[row]?.[col];
      if (value > 0) {
        const pos = { row, col };
        const isBlockedLeft = col === 0 || numberGrid[row]?.[col - 1] === -1;
        const isBlockedTop = row === 0 || numberGrid[row - 1]?.[col] === -1;
        if (isBlockedLeft) {
          acrossNumberToPos.set(value, pos);
        }
        if (isBlockedTop) {
          downNumberToPos.set(value, pos);
        }
      }
    }
  }

  return { across: acrossNumberToPos, down: downNumberToPos };
}

export function extractQuickAnswer(number, direction, numberGrid, solutionGrid, width, height, numberToPos) {
  const start = numberToPos[direction]?.get(number);
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

export function parseQuickClueBlock(raw, direction, numberGrid, solutionGrid, width, height, numberToPos) {
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

export function buildUsaTodayPuzzle({ summary, puzzle, date, title }) {
  const width = Number.parseInt(puzzle.width, 10);
  const height = Number.parseInt(puzzle.height, 10);
  const numberGrid = buildQuickNumberGrid(puzzle.layout, width, height);
  const solutionGrid = normalizeLayoutRows(puzzle.solution || [], width, height);
  const numberToPos = buildQuickNumberIndex(numberGrid, height, width);

  const resolvedTitle =
    (puzzle.title && puzzle.title !== 'QuickCross')
      ? puzzle.title
      : (summary.title && summary.title !== 'QuickCross') ? summary.title : title;

  return normalizePuzzlePayload({
    date,
    formatted_date: getFormattedDate(date),
    title: resolvedTitle,
    author: puzzle.author || summary.author || '',
    editor: puzzle.editor || summary.editor || '',
    day_of_week: getDayOfWeek(date),
    permalink: `https://play.usatoday.com/quick-cross/${summary.id}`,
    clues: [
      ...parseQuickClueBlock(
        puzzle.acrossClue,
        'across',
        numberGrid,
        solutionGrid,
        width,
        height,
        numberToPos
      ),
      ...parseQuickClueBlock(
        puzzle.downClue,
        'down',
        numberGrid,
        solutionGrid,
        width,
        height,
        numberToPos
      )
    ]
  });
}

export function createUsaTodayDailyProvider() {
  return {
    slug: 'usa-today-daily',
    title: 'USA Today Crossword',
    lookbackDays: 14,
    async fetchByDate(date) {
      const summary = await fetchUsaTodayGameSummary('crossword', date);
      const puzzle = await fetchUsaTodayGame(summary.id);

      return buildUsaTodayPuzzle({
        summary,
        puzzle,
        date,
        title: 'USA Today Crossword'
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
      const summary = await fetchUsaTodayGameSummary('quickcross', date);
      const puzzle = await fetchUsaTodayGame(summary.id);

      return buildUsaTodayPuzzle({
        summary,
        puzzle,
        date,
        title: 'USA Today Quick Cross'
      });
    }
  };
}
