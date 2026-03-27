let state = { ledgers: [] };

const entryForm = document.getElementById("entryForm");
const entryLedgerIdInput = document.getElementById("entryLedgerId");
const entryTypeInput = document.getElementById("entryType");
const entryAmountInput = document.getElementById("entryAmount");
const entryDateInput = document.getElementById("entryDate");
const entryDescriptionInput = document.getElementById("entryDescription");
const entrySubmitBtn = document.getElementById("entrySubmitBtn");
const vendorCount = document.getElementById("vendorCount");
const employeeCount = document.getElementById("employeeCount");
const recentEntryDateInput = document.getElementById("recentEntryDate");
const resetRecentDateBtn = document.getElementById("resetRecentDate");
const recentEntriesList = document.getElementById("recentEntriesList");
const menuToggle = document.getElementById("menuToggle");
const closeMenu = document.getElementById("closeMenu");
const sideNav = document.getElementById("sideNav");
const navOverlay = document.getElementById("navOverlay");

let editingEntryId = null;

entryDateInput.value = getTodayValue();
recentEntryDateInput.value = getTodayValue();

entryForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    ledgerId: entryLedgerIdInput.value,
    type: entryTypeInput.value,
    amount: toAmount(entryAmountInput.value),
    date: entryDateInput.value,
    description: entryDescriptionInput.value.trim()
  };

  if (!payload.ledgerId || !payload.description) {
    return;
  }

  try {
    if (editingEntryId) {
      await updateEntry(editingEntryId, payload);
    } else {
      await createEntry({
        id: crypto.randomUUID(),
        ...payload
      });
    }

    resetEntryForm();
    await refresh();
  } catch (error) {
    showRecentEntriesMessage(error.message);
  }
});

menuToggle.addEventListener("click", () => {
  const isOpen = sideNav.classList.toggle("open");
  sideNav.setAttribute("aria-hidden", String(!isOpen));
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  navOverlay.hidden = !isOpen;
});

recentEntryDateInput.addEventListener("input", renderRecentEntries);
resetRecentDateBtn.addEventListener("click", () => {
  recentEntryDateInput.value = getTodayValue();
  renderRecentEntries();
});

closeMenu.addEventListener("click", closeSideNav);
navOverlay.addEventListener("click", closeSideNav);

document.querySelectorAll(".side-link").forEach((link) => {
  link.addEventListener("click", closeSideNav);
});

void refresh();

async function refresh() {
  try {
    state = await loadLedgerState();
    populateLedgerOptions();
    renderSummary();
    renderRecentEntries();
  } catch (error) {
    state = { ledgers: [] };
    populateLedgerOptions();
    renderSummary();
    showRecentEntriesMessage(error.message);
  }
}

function renderSummary() {
  vendorCount.textContent = state.ledgers.filter((ledger) => ledger.type === "vendor").length;
  employeeCount.textContent = state.ledgers.filter((ledger) => ledger.type === "employee").length;
}

function populateLedgerOptions() {
  const currentValue = entryLedgerIdInput.value;
  const options = state.ledgers.map((ledger) => {
    const label = `${capitalize(ledger.type)} - ${ledger.name}`;
    return `<option value="${ledger.id}">${escapeHtml(label)}</option>`;
  });

  entryLedgerIdInput.innerHTML = options.length
    ? options.join("")
    : `<option value="">Create a ledger first</option>`;
  entryLedgerIdInput.disabled = !options.length;
  entrySubmitBtn.disabled = !options.length;

  if (state.ledgers.some((ledger) => ledger.id === currentValue)) {
    entryLedgerIdInput.value = currentValue;
  }
}

function renderRecentEntries() {
  const selectedDate = recentEntryDateInput.value || getTodayValue();
  const entries = state.ledgers
    .flatMap((ledger) => {
      return ledger.entries.map((entry) => ({
        ...entry,
        ledgerId: ledger.id,
        ledgerName: ledger.name,
        ledgerType: ledger.type
      }));
    })
    .filter((entry) => entry.date === selectedDate)
    .sort((left, right) => right.id.localeCompare(left.id));

  if (!entries.length) {
    showRecentEntriesMessage(`No entries found for ${escapeHtml(formatDate(selectedDate))}.`);
    return;
  }

  const rows = entries.map((entry) => {
    return `
      <tr>
        <td>${escapeHtml(formatDate(entry.date))}</td>
        <td>${escapeHtml(capitalize(entry.ledgerType))}</td>
        <td>${escapeHtml(entry.ledgerName)}</td>
        <td>${escapeHtml(entry.description)}</td>
        <td class="entry-type ${entry.type}">${escapeHtml(capitalize(entry.type))}</td>
        <td>${formatCurrency(entry.amount)}</td>
        <td class="action-cell">
          <button type="button" class="table-action-btn" data-entry-action="edit" data-entry-id="${escapeAttribute(entry.id)}">Edit</button>
          <button type="button" class="table-action-btn danger-btn" data-entry-action="delete" data-entry-id="${escapeAttribute(entry.id)}">Delete</button>
        </td>
      </tr>
    `;
  }).join("");

  recentEntriesList.innerHTML = `
    <table class="entries-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Ledger Type</th>
          <th>Name</th>
          <th>Description</th>
          <th>Entry Type</th>
          <th>Amount</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  bindRecentEntryActions(entries);
}

function bindRecentEntryActions(entries) {
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));

  recentEntriesList.querySelectorAll("[data-entry-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const { entryAction, entryId } = button.dataset;
      const entry = entriesById.get(entryId);
      if (!entry) {
        return;
      }

      if (entryAction === "edit") {
        startEditingEntry(entry);
        return;
      }

      if (entryAction === "delete") {
        await deleteRecentEntry(entry.id);
      }
    });
  });
}

function startEditingEntry(entry) {
  editingEntryId = entry.id;
  entryLedgerIdInput.value = entry.ledgerId;
  entryTypeInput.value = entry.type;
  entryAmountInput.value = String(entry.amount);
  entryDateInput.value = entry.date;
  entryDescriptionInput.value = entry.description;
  entrySubmitBtn.textContent = "Update Entry";
  document.getElementById("post-entry").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteRecentEntry(entryId) {
  if (!window.confirm("Delete this entry?")) {
    return;
  }

  try {
    await deleteEntryById(entryId);
    if (editingEntryId === entryId) {
      resetEntryForm();
    }
    await refresh();
  } catch (error) {
    showRecentEntriesMessage(error.message);
  }
}

function resetEntryForm() {
  editingEntryId = null;
  entryForm.reset();
  entryDateInput.value = getTodayValue();
  entrySubmitBtn.textContent = "Add Entry";
}

function showRecentEntriesMessage(message) {
  recentEntriesList.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function toAmount(value) {
  return Number.parseFloat(value) || 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR"
  }).format(value);
}

function formatDate(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function getTodayValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const localDate = new Date(now.getTime() - offset * 60000);
  return localDate.toISOString().split("T")[0];
}

function closeSideNav() {
  sideNav.classList.remove("open");
  sideNav.setAttribute("aria-hidden", "true");
  menuToggle.setAttribute("aria-expanded", "false");
  navOverlay.hidden = true;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
