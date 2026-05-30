import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const configPath = path.join(rootDir, 'config', 'workers.json');
const workersDir = path.join(rootDir, 'workers');
const setupPath = path.join(rootDir, 'SETUP-COMMANDS.md');

const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
const cfProfileKeys = new Map([
  ['atlantic', 'atlantic'],
  ['guardian-cryptic', 'gc'],
  ['guardian-prize', 'gp'],
  ['guardian-quick', 'gq'],
  ['guardian-quiptic', 'gquip'],
  ['guardian-weekend', 'gw'],
  ['latimes-daily', 'law'],
  ['latimes-mini', 'lam'],
  ['usa-today-daily', 'utd'],
  ['usa-today-quick', 'utq'],
  ['washington-post-daily', 'wpd'],
  ['washington-post-mini', 'wpm'],
  ['washington-post-sunday', 'wps']
]);

function entrySource(worker) {
  switch (worker.family) {
    case 'atlantic':
      return `import { createArchiveWorker } from '../../../shared/core/createArchiveWorker.js';\nimport { createAtlanticProvider } from '../../../shared/providers/atlantic.js';\n\nexport default createArchiveWorker(createAtlanticProvider());\n`;
    case 'guardian':
      return `import { createArchiveWorker } from '../../../shared/core/createArchiveWorker.js';\nimport { createGuardianProvider } from '../../../shared/providers/guardian.js';\n\nexport default createArchiveWorker(createGuardianProvider({\n  seriesTag: '${worker.seriesTag}',\n  title: '${worker.title}'\n}));\n`;
    case 'latimes-daily':
      return `import { createArchiveWorker } from '../../../shared/core/createArchiveWorker.js';\nimport { createLatimesDailyProvider } from '../../../shared/providers/latimes.js';\n\nexport default createArchiveWorker(createLatimesDailyProvider());\n`;
    case 'latimes-mini':
      return `import { createArchiveWorker } from '../../../shared/core/createArchiveWorker.js';\nimport { createLatimesMiniProvider } from '../../../shared/providers/latimes.js';\n\nexport default createArchiveWorker(createLatimesMiniProvider());\n`;
    case 'usa-today-daily':
      return `import { createArchiveWorker } from '../../../shared/core/createArchiveWorker.js';\nimport { createUsaTodayDailyProvider } from '../../../shared/providers/usaToday.js';\n\nexport default createArchiveWorker(createUsaTodayDailyProvider());\n`;
    case 'usa-today-quick':
      return `import { createArchiveWorker } from '../../../shared/core/createArchiveWorker.js';\nimport { createUsaTodayQuickProvider } from '../../../shared/providers/usaToday.js';\n\nexport default createArchiveWorker(createUsaTodayQuickProvider());\n`;
    case 'wapo-daily':
      return `import { createArchiveWorker } from '../../../shared/core/createArchiveWorker.js';\nimport { createWashingtonPostDailyProvider } from '../../../shared/providers/washingtonPost.js';\n\nexport default createArchiveWorker(createWashingtonPostDailyProvider());\n`;
    case 'wapo-mini':
      return `import { createArchiveWorker } from '../../../shared/core/createArchiveWorker.js';\nimport { createWashingtonPostMiniProvider } from '../../../shared/providers/washingtonPost.js';\n\nexport default createArchiveWorker(createWashingtonPostMiniProvider());\n`;
    case 'wapo-sunday':
      return `import { createArchiveWorker } from '../../../shared/core/createArchiveWorker.js';\nimport { createWashingtonPostSundayProvider } from '../../../shared/providers/washingtonPost.js';\n\nexport default createArchiveWorker(createWashingtonPostSundayProvider());\n`;
    default:
      throw new Error(`Unknown worker family: ${worker.family}`);
  }
}

function cronSchedule(worker) {
  if (worker.family === 'guardian') {
    return ['5 23 * * *', '5 0 * * *', '5 1 * * *'];
  }

  if (worker.family === 'latimes-daily' || worker.family === 'latimes-mini') {
    return ['15 4 * * *', '15 5 * * *', '15 8 * * *'];
  }

  if (worker.family === 'usa-today-daily' || worker.family === 'usa-today-quick') {
    return ['20 4 * * *', '20 5 * * *', '20 8 * * *'];
  }

  if (worker.family.startsWith('wapo-')) {
    return ['25 4 * * *', '25 5 * * *', '25 8 * * *'];
  }

  return ['10 4 * * *', '10 5 * * *', '10 8 * * *'];
}

function wranglerToml(worker) {
  const vars = worker.slug === 'usa-today-daily'
    ? `\n[vars]\nEXTRA_UPDATE_URLS = "https://usa-today-quick-worker.everyman-5b4.workers.dev/api/update/latest"\n`
    : '';
  const triggers = worker.slug === 'usa-today-quick'
    ? ''
    : `\n[triggers]\ncrons = [\n${cronSchedule(worker).map((cron) => `  "${cron}"`).join(',\n')}\n]\n`;
  return `name = "${worker.workerName}"
main = "src/index.js"
compatibility_date = "2026-04-09"

[[d1_databases]]
binding = "DB"
database_name = "${worker.databaseName}"
database_id = "REPLACE_WITH_D1_DATABASE_ID"
${vars}${triggers}
`;
}

function setupCommands(workers) {
  const sections = [
    '# Setup Commands',
    '',
    'Run these from `all-crossword-worker/` after `npm run generate`.',
    '',
    'Shared migration files:',
    '',
    '- `shared/migrations/0000_initial_migration.sql`',
    '- `shared/migrations/0001_normalized_lookup_columns.sql`',
    '',
    'Optional secret for all workers:',
    '',
    '- `API_TOKEN`: required for `POST /api/add/...`, `POST /api/update/latest`, and `POST /api/delete/...`.',
    '- `GUARDIAN_API_KEY`: optional for Guardian workers. If omitted, the public `test` key is used.',
    ''
  ];

  for (const worker of workers) {
    sections.push(`## ${worker.name}`);
    sections.push('');
    sections.push('```powershell');
    sections.push(`cd workers/${worker.slug}`);
    sections.push(`npx wrangler d1 create ${worker.databaseName}`);
    sections.push('# Copy the returned database_id into wrangler.toml');
    sections.push('npx wrangler secret put API_TOKEN');
    if (worker.family === 'guardian') {
      sections.push('# Optional: only if you want your own Guardian API key');
      sections.push('# npx wrangler secret put GUARDIAN_API_KEY');
    }
    sections.push(`npx wrangler d1 execute ${worker.databaseName} --file=../../shared/migrations/0000_initial_migration.sql --remote`);
    sections.push(`npx wrangler d1 execute ${worker.databaseName} --file=../../shared/migrations/0001_normalized_lookup_columns.sql --remote`);
    sections.push('npx wrangler deploy');
    sections.push('```');
    sections.push('');
  }

  return sections.join('\n');
}

await fs.mkdir(workersDir, { recursive: true });

for (const worker of config.workers) {
  const projectDir = path.join(workersDir, worker.slug);
  const srcDir = path.join(projectDir, 'src');
  await fs.mkdir(srcDir, { recursive: true });
  await fs.writeFile(path.join(srcDir, 'index.js'), entrySource(worker));
  await fs.writeFile(path.join(projectDir, 'wrangler.toml'), wranglerToml(worker));
  await fs.writeFile(path.join(projectDir, '.cf-profile'), `${cfProfileKeys.get(worker.slug) || ''}\n`);
}

await fs.writeFile(setupPath, setupCommands(config.workers));
