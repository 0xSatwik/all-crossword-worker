# NYT Crossword Archive API

This Cloudflare Worker provides an API for accessing historical New York Times crossword puzzle data stored in a Cloudflare D1 database. It also includes endpoints for automatically scraping and updating puzzle data.

## API Endpoints

### Public Endpoints (Read-Only)

These endpoints do not require an API key and are used to retrieve puzzle data.

#### Get Puzzle by Date
- **URL**: `GET /api/puzzle/{date}`
- **Description**: Retrieves the complete puzzle data for a specific date, including all clues.
- **Parameters**: `date` in `YYYY-MM-DD` or `MM/DD/YYYY` format (or `today`).
- **Example**: `/api/puzzle/2023-01-01`

#### Get Clues by Date
- **URL**: `GET /api/clues/{date}`
- **Description**: Retrieves just the clues for a specific date's puzzle.
- **Example**: `/api/clues/2023-01-01`

#### Search by Answer
- **URL**: `GET /api/search/answer?q={answer}`
- **Description**: Searches for clues with a specific answer.
- **Example**: `/api/search/answer?q=OREO`

#### Search by Clue Text
- **URL**: `GET /api/search/clue?q={clue_text}`
- **Description**: Searches for clues containing specific text.
- **Example**: `/api/search/clue?q=Famous cookie`

#### Get Related Clues
- **URL**: `GET /api/related/answer?q={answer}`
- **Description**: Retrieves all related clues for a specific answer across multiple puzzles.
- **Example**: `/api/related/answer?q=OREO`

---

### Protected Endpoints (Write/Admin)

These endpoints require `Authorization: Bearer <API_TOKEN>`.

#### Add or Update Puzzle by Date
- **URL**: `POST /api/add/{date}`
- **Description**: Scrapes a puzzle for a specific date and stores it.

#### Update Latest Puzzle
- **URL**: `POST /api/update/latest`
- **Description**: Checks for and stores the latest available puzzle.

#### Delete Puzzle Data
- **URL**: `POST /api/delete/{date}`
- **Description**: Deletes stored puzzle data for a specific date.

#### Solve by Clue
- **URL**: `GET /api/solve?clue={text}&pattern={optionalPattern}`
- **Description**: Searches stored archive data and returns ranked answer candidates plus clue history.

#### Legacy Removed Routes
- `/today/add/{apiKey}`
- `/date/add/{apiKey}`
- `/today/commit/{apiKey}`
- These now return `410 Gone`.

---

## Configuration

The write token is set via the `API_TOKEN` environment variable or secret in Cloudflare.

```toml
[vars]
API_TOKEN = "your-secret-token-here"
```

## Deployment

1.  **Create D1 Database**: `npx wrangler d1 create crossword_archive`
2.  **Apply Schema**: run the project migrations with Wrangler
3.  **Deploy**: `npm run deploy`

See `api_endpoints_detailed.txt` for the current endpoint reference.

## License

MIT
