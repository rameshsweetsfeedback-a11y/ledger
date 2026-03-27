const LEDGER_API_BASE_URL = "";

async function loadLedgerState() {
  return fetchApi("/state");
}

async function createLedger(ledger) {
  return fetchApi("/ledgers", {
    method: "POST",
    body: ledger
  });
}

async function createEntry(entry) {
  return fetchApi("/entries", {
    method: "POST",
    body: entry
  });
}

async function updateEntry(entryId, entry) {
  return fetchApi(`/entries/${encodeURIComponent(entryId)}`, {
    method: "PUT",
    body: entry
  });
}

async function deleteEntryById(entryId) {
  return fetchApi(`/entries/${encodeURIComponent(entryId)}`, {
    method: "DELETE"
  });
}

function getLedgerExportUrl() {
  return `${LEDGER_API_BASE_URL}/export.csv`;
}

async function fetchApi(path, options = {}) {
  const init = {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json"
    }
  };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  let response;

  try {
    response = await fetch(`${LEDGER_API_BASE_URL}${path}`, init);
  } catch {
    throw new Error("Ledger database server is not running. Start ledger_api.py first.");
  }

  let payload = {};

  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.message || "Database request failed.");
  }

  return payload;
}
