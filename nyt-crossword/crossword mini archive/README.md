# NYT Mini Crossword Archive

A Cloudflare Worker project that automatically fetches and stores NYT Mini Crossword puzzles daily, with a web interface for viewing and solving them.

## Features

- **Automated Daily Updates**: Fetches the latest NYT Mini Crossword puzzle at 10 PM Eastern Time every day
- **Secure API Endpoints**: API key protected endpoints for manual updates
- **Historical Data**: Support for retrieving and storing puzzles from past dates
- **Interactive Web Interface**: User-friendly interface for viewing and solving puzzles
- **Cloudflare D1 Database**: Efficient storage of puzzle data in Cloudflare's serverless SQL database

## Setup Instructions

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or later)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Cloudflare account with Workers and D1 enabled

### Installation

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/nyt-mini-archive.git
   cd nyt-mini-archive
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a D1 database:
   ```
   wrangler d1 create nyt_mini_crosswords
   ```

4. Update the `wrangler.toml` file with your database ID from the previous step:
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "nyt_mini_crosswords"
   database_id = "YOUR_DATABASE_ID" # Replace with your actual D1 database ID
   ```

5. Set a secure API key in `wrangler.toml`:
   ```toml
   [vars]
   API_KEY = "YOUR_SECURE_API_KEY" # Replace with a secure API key
   ```

6. Apply the database migrations:
   ```
   wrangler d1 execute nyt_mini_crosswords --file=./migrations/0000_create_puzzles_table.sql

   wrangler d1 execute nyt_mini_crosswords --file=./migrations/0000_create_puzzles_table.sql --remote
   ```

7. Deploy the worker:
   ```
   wrangler deploy
   ```

### Configuration

The worker is configured to run daily at 10 PM Eastern Time. You can modify the cron schedule in `wrangler.toml` if needed:

```toml
[triggers]
crons = ["0 22 * * * America/New_York"] # Run daily at 10 PM Eastern Time
```

## API Endpoints

### Public Endpoints

- **GET /today**: Get today's puzzle
- **GET /date?date=YYYY-MM-DD**: Get puzzle for a specific date

### Protected Endpoints (Require API Key)

- **POST /today/add** with `Authorization: Bearer <API_KEY>`: Fetch and store the latest puzzle
- **POST /date/add?date=YYYY-MM-DD** with `Authorization: Bearer <API_KEY>`: Fetch and store one specific date

### Solver Endpoint

- **GET /solve?clue=TEXT&pattern=OPTIONAL**: Search stored mini archive data and return ranked answer candidates

## Web Interface

The web interface is available at the root URL of your worker. You can also deploy the static HTML file from the `public` directory to any web hosting service.

To use the web interface:

1. Open the HTML file in a browser or deploy it to a web server
2. Update the `API_BASE_URL` variable in the script to point to your Cloudflare Worker URL
3. Use the date selector or "Today's Puzzle" button to load puzzles
4. Click on clues to reveal answers or use the "Reveal All Answers" button

See `api_endpoints.txt` for the current endpoint reference.

## Notes on NYT API Access

For historical puzzles, the NYT API requires specific headers and potentially authentication cookies. The current implementation includes the necessary headers for making these requests, but you may need to update the cookie values for older puzzles.

## Troubleshooting

- **Missing Puzzles**: The NYT sometimes updates their API or authentication requirements. If puzzles are not being fetched correctly, check the console logs for error messages.
- **Database Issues**: If the database is not storing puzzles correctly, ensure your D1 database is properly configured and the migrations have been applied.
- **CORS Errors**: The worker includes CORS headers for all responses, but you may need to adjust them if you're hosting the frontend on a different domain.

## License

MIT License 
