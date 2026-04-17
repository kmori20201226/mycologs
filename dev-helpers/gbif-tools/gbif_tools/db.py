import psycopg2
import psycopg2.extras
from contextlib import contextmanager
from .config import DATABASE_URL

def get_connection():
    return psycopg2.connect(DATABASE_URL)

@contextmanager
def transaction():
    """Yield a cursor inside a committed transaction. Rolls back on error."""
    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                yield cur
    finally:
        conn.close()

def execute_batch(cur, sql: str, rows: list, page_size: int = 500):
    """Wrapper around psycopg2.extras.execute_batch for bulk inserts."""
    psycopg2.extras.execute_batch(cur, sql, rows, page_size=page_size)
