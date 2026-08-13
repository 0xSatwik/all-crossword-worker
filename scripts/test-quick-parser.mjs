import { buildUsaTodayPuzzle } from '../shared/providers/usaToday.js';

let failures = 0;

function check(name, actual, expected) {
  if (actual !== expected) {
    failures += 1;
    console.log(`MISMATCH ${name}: expected [${expected}] got [${actual}]`);
  }
}

const quickSummary = {
  id: '38b24ab4-8d2a-4cad-bfe1-c65345a6efba',
  date: '2025-10-22',
  title: 'QuickCross',
  author: 'John Wilmes',
  editor: ''
};

const quickPuzzle = {
  id: '38b24ab4-8d2a-4cad-bfe1-c65345a6efba',
  date: '2025-10-22',
  type: 'quickcross',
  title: 'QuickCross',
  width: '4',
  author: 'John Wilmes',
  editor: '',
  height: '4',
  layout: ['01020304', '02000000', '03000000', '04000000'],
  downClue: '01|--> no ____"\n02|"Hurry!"\n03|Part\n04|Leg joint',
  solution: ['BARK', 'ISON', 'TALE', 'EPEE'],
  copyright: 'Andrews McMeel Syndication',
  acrossClue: '01|"All ____ and -->\n02|"The Heat __ __"\n03|Story\n04|Fencing sword'
};

const quickExpected = {
  '1a': 'BARK', '2a': 'ISON', '3a': 'TALE', '4a': 'EPEE',
  '1d': 'BITE', '2d': 'ASAP', '3d': 'ROLE', '4d': 'KNEE'
};

const quickOut = buildUsaTodayPuzzle({ summary: quickSummary, puzzle: quickPuzzle, date: '2025-10-22', title: 'USA Today Quick Cross' });
if (quickOut.clues.length !== 8) {
  failures += 1;
  console.log(`quick: expected 8 clues, got ${quickOut.clues.length}`);
}
for (const clue of quickOut.clues) {
  check(`quick ${clue.number}${clue.direction[0]}`, clue.answer, quickExpected[`${clue.number}${clue.direction[0]}`]);
}

const flatLayoutPuzzle = {
  ...quickPuzzle,
  layout: [quickPuzzle.layout.join('')],
  solution: [quickPuzzle.solution.join('')]
};
const flatOut = buildUsaTodayPuzzle({ summary: quickSummary, puzzle: flatLayoutPuzzle, date: '2025-10-22', title: 'USA Today Quick Cross' });
for (const clue of flatOut.clues) {
  check(`flat ${clue.number}${clue.direction[0]}`, clue.answer, quickExpected[`${clue.number}${clue.direction[0]}`]);
}

const dailySummary = {
  id: 'aa077755-0485-489e-8253-c8d9309a79aa',
  date: '2025-10-15',
  title: 'Age Backwards',
  author: 'Zhouqin Burnikel',
  editor: 'Amanda Rafkin'
};

const dailyPuzzle = {
  id: 'aa077755-0485-489e-8253-c8d9309a79aa',
  date: '2025-10-15',
  type: 'crossword',
  title: 'Age Backwards',
  width: '15',
  author: 'Zhouqin Burnikel',
  editor: 'Amanda Rafkin',
  height: '15',
  layout: [
    '0102030405-10607080910-1111213',
    '1400000000-11500000000-1160000',
    '1700000000180000000000-1190000',
    '20000000-121000000-12223000000',
    '-1-1-124250000-1-126000000-1-1',
    '272829-1300000313200-133003435',
    '360000370000-1380000-139000000',
    '400000000000410000004200000000',
    '43000000-1440000-1450000000000',
    '-1460000-1470000480000-1490000',
    '-1-150005100-1-152000053-1-1-1',
    '5455000000-1-1560000-157585960',
    '610000-16263640000006500000000',
    '660000-16700000000-16800000000',
    '690000-17000000000-17100000000'
  ],
  downClue: [
    '01|Moves like a rabbit',
    '02|Great Lake with a high concentration of shipwrecks',
    '03|Yahtzee cubes',
    '04|Bird in a gaggle',
    '05|Come to a close',
    '06|Strongly advising',
    '07|Close tightly',
    '08|Like seahorses that give birth',
    '09|Feel poorly',
    '10|"Coming soon" ad',
    '11|"Now or never, folks!"',
    '12|Pedaled vehicle',
    '13|Postal delivery',
    '18|Turnovers that are often crescent-shaped',
    '23|"Well, shucks"',
    '25|"That hit the ___"',
    '26|"Don\'t stress it!"',
    '27|___ Scotia, Canada',
    '28|Not canned or frozen',
    '29|Inked designs on calves',
    '31|Well-lubricated',
    '32|Fawn\'s mother',
    '34|Property claims',
    '35|Stage and screen star Jessica',
    '37|Location metadata',
    '41|First sign of a flower',
    '42|"___ that the truth!"',
    '48|Water park features',
    '51|Talk big',
    '53|Drum kit piece',
    '54|Rooms with test tubes',
    '55|Award quartet for Liza Minnelli',
    '56|Like a dried-out sponge',
    '58|"Couldn\'t agree more!"',
    '59|Religious offshoot',
    '60|Poses a question',
    '63|City bus path (Abbr.)',
    '64|Coconut cream container',
    '65|Thor or Vishnu or Shangdi'
  ].join('\n'),
  solution: [
    'HEDGE USMAP IBM',
    'ORION REAIR TIA',
    'PICODEGALLO SKI',
    'SEES MILE MODEL',
    '   ESPN  HOHO  ',
    'NFL PAGODA DOLL',
    'OREGON ION ARIA',
    'VEGETABLEGARDEN',
    'ASTO DUE LINING',
    ' HAT ADDSON ESE',
    '  TABS  LOTS   ',
    'LETGO  HIS NASA',
    'AGO ARCADEGAMES',
    'BOO STARE ORECK',
    'STS TENDS DENTS'
  ],
  copyright: '',
  acrossClue: [
    '01|Barrier made of shrubs',
    '06|Diagram with AK and HI insets',
    '11|Company nicknamed "Big Blue"',
    '14|Hunter only visible at night',
    '15|Show on TV again',
    '16|Aunt, in Spanish',
    '17|Condiment also known as "salsa fresca"',
    '19|Tackle a bunny hill',
    '20|Goes out with',
    '21|Air travel reward unit',
    '22|Catwalk walker',
    '24|Channel with sports news',
    '26|Ding Dong alternative',
    '27|Org. for Jaguars and Panthers',
    '30|Temple with multiple eaves',
    '33|Toy that might wear tiny shoes',
    '36|State with a beaver on its flag',
    '38|Lithium-___ battery',
    '39|Solo number in an opera',
    '40|Place to grow your own carrots and tomatoes',
    '43|Concerning',
    '44|Scheduled to arrive',
    '45|Puffer jacket layer',
    '46|Fez or beret',
    '47|Expands a house, maybe',
    '49|Opposite of WNW',
    '50|Happy hour bills',
    '52|Places to park',
    '54|"Drop it!"',
    '56|That fellow\'s',
    '57|Org. in "The Martian"',
    '61|"Many moons ___ . . ."',
    '62|Ms. Pac-Man and Centipede',
    '66|"Get off the stage!"',
    '67|Unblinking look',
    '68|Dyson alternative',
    '69|Lines on city maps (Abbr.)',
    '70|___ bar (pours drinks)',
    '71|Dings in a car\'s bumper'
  ].join('\n')
};

const dailyOut = buildUsaTodayPuzzle({ summary: dailySummary, puzzle: dailyPuzzle, date: '2025-10-15', title: 'USA Today Crossword' });
if (dailyOut.clues.length !== 78) {
  failures += 1;
  console.log(`daily: expected 78 clues (39a+39d), got ${dailyOut.clues.length}`);
}
if (dailyOut.title !== 'Age Backwards') {
  failures += 1;
  console.log(`daily title: expected "Age Backwards", got "${dailyOut.title}"`);
}
for (const spot of [['1a', 'HEDGE'], ['6a', 'USMAP'], ['54d', 'LABS'], ['70a', 'TENDS']]) {
  const clue = dailyOut.clues.find((c) => `${c.number}${c.direction[0]}` === spot[0]);
  if (!clue) {
    failures += 1;
    console.log(`daily: missing clue ${spot[0]}`);
  } else {
    check(`daily ${spot[0]}`, clue.answer, spot[1]);
  }
}

console.log(failures === 0 ? 'ALL CHECKS PASSED' : `FAILED (${failures} mismatches)`);
process.exit(failures === 0 ? 0 : 1);