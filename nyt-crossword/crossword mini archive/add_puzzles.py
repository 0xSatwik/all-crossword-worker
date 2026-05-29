import requests
import time
import concurrent.futures
from datetime import datetime, timedelta
import threading

# Configuration
BASE_URL = "https://nyt-mini-archive.nytsolver.workers.dev"
API_KEY = "BlgingIo@7"
CONCURRENCY = 10
RETRY_WAIT = 60  # Seconds to wait on error

# Lock for clean printing from multiple threads
print_lock = threading.Lock()

def safe_print(message):
    with print_lock:
        print(message)

def add_puzzle_with_retry(date_str):
    """Calls the API to add a puzzle with retry logic."""
    url = f"{BASE_URL}/date/add?date={date_str}"
    
    while True:
        try:
            safe_print(f"[{date_str}] Processing...")
            response = requests.post(
                url,
                headers={
                    "Authorization": f"Bearer {API_KEY}"
                },
                timeout=30
            )
            
            if response.status_code == 200:
                safe_print(f"[{date_str}] Success")
                return True
            else:
                error_msg = f"[{date_str}] Failed ({response.status_code}): {response.text[:100]}"
                safe_print(f"{error_msg}. Waiting {RETRY_WAIT}s before retry...")
                time.sleep(RETRY_WAIT)
        except Exception as e:
            safe_print(f"[{date_str}] Error: {str(e)}. Waiting {RETRY_WAIT}s before retry...")
            time.sleep(RETRY_WAIT)

def process_dates_parallel(date_list):
    """Processes a list of dates in parallel using a thread pool."""
    if not date_list:
        return

    with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
        list(executor.map(add_puzzle_with_retry, date_list))

def get_date_range(start_str, end_str):
    """Returns a list of dates from start to end (backwards)."""
    start_date = datetime.strptime(start_str, "%Y-%m-%d")
    end_date = datetime.strptime(end_str, "%Y-%m-%d")
    dates = []
    
    curr = start_date
    while curr >= end_date:
        dates.append(curr.strftime("%Y-%m-%d"))
        curr -= timedelta(days=1)
    return dates

def get_infinite_dates(start_str, count=100):
    """Returns the next 'count' dates starting from start_str (backwards)."""
    start_date = datetime.strptime(start_str, "%Y-%m-%d")
    dates = []
    for i in range(count):
        date = start_date - timedelta(days=i)
        dates.append(date.strftime("%Y-%m-%d"))
    return dates

if __name__ == "__main__":
    # Range 1: 2026-01-17 to 2026-01-04
    print(f"--- Starting Range 1 (Parallel, {CONCURRENCY} threads) ---")
    range1_dates = get_date_range("2026-01-17", "2026-01-04")
    process_dates_parallel(range1_dates)
    
    # Range 2: 2025-09-28 backwards
    print(f"\n--- Starting Range 2 (Parallel, {CONCURRENCY} threads, batch size 100) ---")
    current_start_date = datetime.strptime("2025-09-28", "%Y-%m-%d")
    
    try:
        while True:
            batch_start_str = current_start_date.strftime("%Y-%m-%d")
            print(f"\nProcessing batch starting from {batch_start_str}...")
            
            # Process in batches of 100 dates to allow for Ctrl+C and status updates
            dates = []
            for i in range(100):
                d = current_start_date - timedelta(days=i)
                dates.append(d.strftime("%Y-%m-%d"))
            
            process_dates_parallel(dates)
            
            # Move start date for next batch
            current_start_date -= timedelta(days=100)
            
    except KeyboardInterrupt:
        print("\nStopped by user.")
