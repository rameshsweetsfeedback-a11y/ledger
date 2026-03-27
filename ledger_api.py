import json
import sqlite3
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import io
import csv
from urllib.parse import urlparse
import mimetypes
import os


HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8000"))
BASE_DIR = Path(__file__).parent
DATA_DIR = Path(os.environ.get("DATA_DIR", str(BASE_DIR))).resolve()
DB_PATH = DATA_DIR / "ledger.db"
BACKUP_DIR = DATA_DIR / "backups"
BASE_DIR = Path(__file__).parent


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    BACKUP_DIR.mkdir(exist_ok=True)
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS ledgers (
              id TEXT PRIMARY KEY,
              type TEXT NOT NULL CHECK(type IN ('vendor', 'employee')),
              name TEXT NOT NULL,
              note TEXT NOT NULL DEFAULT '',
              opening_balance REAL NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS entries (
              id TEXT PRIMARY KEY,
              ledger_id TEXT NOT NULL,
              type TEXT NOT NULL CHECK(type IN ('debit', 'credit')),
              amount REAL NOT NULL,
              date TEXT NOT NULL,
              description TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE
            );
            """
        )


def load_state() -> dict:
    with get_connection() as connection:
        ledgers = [
            {
                "id": row["id"],
                "type": row["type"],
                "name": row["name"],
                "note": row["note"],
                "openingBalance": row["opening_balance"],
                "entries": [],
            }
            for row in connection.execute(
                """
                SELECT id, type, name, note, opening_balance
                FROM ledgers
                ORDER BY type, name
                """
            )
        ]

        entries_by_ledger: dict[str, list[dict]] = {}
        for row in connection.execute(
            """
            SELECT id, ledger_id, type, amount, date, description
            FROM entries
            ORDER BY date, created_at, id
            """
        ):
            entries_by_ledger.setdefault(row["ledger_id"], []).append(
                {
                    "id": row["id"],
                    "type": row["type"],
                    "amount": row["amount"],
                    "date": row["date"],
                    "description": row["description"],
                }
            )

        for ledger in ledgers:
            ledger["entries"] = entries_by_ledger.get(ledger["id"], [])

        return {"ledgers": ledgers}


def create_backup() -> None:
    if not DB_PATH.exists():
        return

    BACKUP_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = BACKUP_DIR / f"ledger-backup-{timestamp}.db"
    shutil.copy2(DB_PATH, backup_path)

    backups = sorted(BACKUP_DIR.glob("ledger-backup-*.db"))
    for stale_backup in backups[:-10]:
        stale_backup.unlink(missing_ok=True)


def export_csv_text() -> str:
    state = load_state()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ledger_id",
        "ledger_type",
        "ledger_name",
        "ledger_note",
        "opening_balance",
        "entry_id",
        "entry_date",
        "entry_type",
        "entry_amount",
        "entry_description",
    ])

    for ledger in state["ledgers"]:
        if not ledger["entries"]:
            writer.writerow([
                ledger["id"],
                ledger["type"],
                ledger["name"],
                ledger["note"],
                ledger["openingBalance"],
                "",
                "",
                "",
                "",
                "",
            ])
            continue

        for entry in ledger["entries"]:
            writer.writerow([
                ledger["id"],
                ledger["type"],
                ledger["name"],
                ledger["note"],
                ledger["openingBalance"],
                entry["id"],
                entry["date"],
                entry["type"],
                entry["amount"],
                entry["description"],
            ])

    return output.getvalue()


class LedgerApiHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/health":
            self.respond_json(200, {"ok": True})
            return

        if parsed.path == "/state":
            self.respond_json(200, load_state())
            return

        if parsed.path == "/export.csv":
            self.respond_csv(export_csv_text(), "ledger-export.csv")
            return

        self.handle_static_file(parsed.path)
        return

    def do_POST(self):
        parsed = urlparse(self.path)

        try:
            if parsed.path == "/ledgers":
                self.handle_create_ledger()
                return

            if parsed.path == "/entries":
                self.handle_create_entry()
                return

            self.respond_json(404, {"message": "Not found."})
        except ValueError as error:
            self.respond_json(400, {"message": str(error)})

    def do_PUT(self):
        parsed = urlparse(self.path)

        try:
            if parsed.path.startswith("/entries/"):
                entry_id = parsed.path.removeprefix("/entries/")
                self.handle_update_entry(entry_id)
                return

            self.respond_json(404, {"message": "Not found."})
        except ValueError as error:
            self.respond_json(400, {"message": str(error)})

    def do_DELETE(self):
        parsed = urlparse(self.path)

        try:
            if parsed.path.startswith("/entries/"):
                entry_id = parsed.path.removeprefix("/entries/")
                self.handle_delete_entry(entry_id)
                return

            self.respond_json(404, {"message": "Not found."})
        except ValueError as error:
            self.respond_json(400, {"message": str(error)})

    def handle_create_ledger(self):
        data = self.read_json_body()
        ledger_id = require_text(data.get("id"), "Ledger id is required.")
        ledger_type = require_choice(data.get("type"), {"vendor", "employee"}, "Ledger type is invalid.")
        name = require_text(data.get("name"), "Ledger name is required.")
        note = str(data.get("note") or "").strip()
        opening_balance = require_number(data.get("openingBalance"), "Opening balance is invalid.")

        with get_connection() as connection:
            connection.execute(
                """
                INSERT INTO ledgers (id, type, name, note, opening_balance)
                VALUES (?, ?, ?, ?, ?)
                """,
                (ledger_id, ledger_type, name, note, opening_balance),
            )
        create_backup()

        self.respond_json(201, {"ok": True})

    def handle_create_entry(self):
        data = self.read_json_body()
        entry_id = require_text(data.get("id"), "Entry id is required.")
        ledger_id = require_text(data.get("ledgerId"), "Ledger is required.")
        entry_type = require_choice(data.get("type"), {"debit", "credit"}, "Entry type is invalid.")
        amount = require_positive_number(data.get("amount"), "Amount must be greater than zero.")
        date = require_text(data.get("date"), "Date is required.")
        description = require_text(data.get("description"), "Description is required.")

        with get_connection() as connection:
            ensure_ledger_exists(connection, ledger_id)
            connection.execute(
                """
                INSERT INTO entries (id, ledger_id, type, amount, date, description)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (entry_id, ledger_id, entry_type, amount, date, description),
            )
        create_backup()

        self.respond_json(201, {"ok": True})

    def handle_update_entry(self, entry_id: str):
        data = self.read_json_body()
        ledger_id = require_text(data.get("ledgerId"), "Ledger is required.")
        entry_type = require_choice(data.get("type"), {"debit", "credit"}, "Entry type is invalid.")
        amount = require_positive_number(data.get("amount"), "Amount must be greater than zero.")
        date = require_text(data.get("date"), "Date is required.")
        description = require_text(data.get("description"), "Description is required.")

        with get_connection() as connection:
            ensure_ledger_exists(connection, ledger_id)
            updated = connection.execute(
                """
                UPDATE entries
                SET ledger_id = ?, type = ?, amount = ?, date = ?, description = ?
                WHERE id = ?
                """,
                (ledger_id, entry_type, amount, date, description, entry_id),
            )

            if updated.rowcount == 0:
                raise ValueError("Entry not found.")
        create_backup()

        self.respond_json(200, {"ok": True})

    def handle_delete_entry(self, entry_id: str):
        with get_connection() as connection:
            deleted = connection.execute("DELETE FROM entries WHERE id = ?", (entry_id,))
            if deleted.rowcount == 0:
                raise ValueError("Entry not found.")
        create_backup()

        self.respond_json(200, {"ok": True})

    def read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            return json.loads(raw or "{}")
        except json.JSONDecodeError as error:
            raise ValueError("Invalid JSON body.") from error

    def respond_json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def respond_csv(self, text: str, filename: str):
        body = text.encode("utf-8")
        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_static_file(self, request_path: str):
        if request_path in {"", "/"}:
            file_path = BASE_DIR / "index.html"
        else:
            safe_path = request_path.lstrip("/")
            file_path = (BASE_DIR / safe_path).resolve()

        if BASE_DIR not in file_path.parents and file_path != BASE_DIR:
            self.respond_json(403, {"message": "Forbidden."})
            return

        if not file_path.exists() or not file_path.is_file():
            self.respond_json(404, {"message": "Not found."})
            return

        mime_type, _ = mimetypes.guess_type(str(file_path))
        body = file_path.read_bytes()
        self.send_response(200)
        if file_path.suffix in {".html", ".js", ".css", ".svg", ".webmanifest"}:
            self.send_cors_headers()
        self.send_header("Content-Type", mime_type or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")

    def log_message(self, format, *args):
        return


def ensure_ledger_exists(connection: sqlite3.Connection, ledger_id: str) -> None:
    row = connection.execute("SELECT 1 FROM ledgers WHERE id = ?", (ledger_id,)).fetchone()
    if row is None:
        raise ValueError("Ledger not found.")


def require_text(value, message: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(message)
    return text


def require_choice(value, allowed: set[str], message: str) -> str:
    text = require_text(value, message)
    if text not in allowed:
        raise ValueError(message)
    return text


def require_number(value, message: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(message) from error


def require_positive_number(value, message: str) -> float:
    number = require_number(value, message)
    if number <= 0:
        raise ValueError(message)
    return number


if __name__ == "__main__":
    initialize_database()
    print(f"Ledger API listening on http://{HOST}:{PORT}")
    server = ThreadingHTTPServer((HOST, PORT), LedgerApiHandler)
    server.serve_forever()
