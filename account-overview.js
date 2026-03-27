let state = { ledgers: [] };
const OVERVIEW_PASSWORD = "100210";

const passwordGate = document.getElementById("passwordGate");
const overviewContent = document.getElementById("overviewContent");
const passwordForm = document.getElementById("passwordForm");
const passwordInput = document.getElementById("passwordInput");
const passwordMessage = document.getElementById("passwordMessage");
const ledgerForm = document.getElementById("ledgerForm");
const ledgerTypeInput = document.getElementById("ledgerType");
const ledgerNameInput = document.getElementById("ledgerName");
const openingBalanceInput = document.getElementById("openingBalance");
const ledgerNoteInput = document.getElementById("ledgerNote");
const vendorAccounts = document.getElementById("vendorAccounts");
const employeeAccounts = document.getElementById("employeeAccounts");
const overviewVendorCount = document.getElementById("overviewVendorCount");
const overviewEmployeeCount = document.getElementById("overviewEmployeeCount");
const vendorGroupTotal = document.getElementById("vendorGroupTotal");
const employeeGroupTotal = document.getElementById("employeeGroupTotal");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const vendorSearch = document.getElementById("vendorSearch");
const employeeSearch = document.getElementById("employeeSearch");
const vendorPrevPage = document.getElementById("vendorPrevPage");
const vendorNextPage = document.getElementById("vendorNextPage");
const employeePrevPage = document.getElementById("employeePrevPage");
const employeeNextPage = document.getElementById("employeeNextPage");
const vendorPageInfo = document.getElementById("vendorPageInfo");
const employeePageInfo = document.getElementById("employeePageInfo");
const accountCardTemplate = document.getElementById("accountCardTemplate");
const accountDetailPanel = document.getElementById("accountDetailPanel");
const detailType = document.getElementById("detailType");
const detailTitle = document.getElementById("detailTitle");
const detailNote = document.getElementById("detailNote");
const detailOpeningBalance = document.getElementById("detailOpeningBalance");
const detailCurrentBalance = document.getElementById("detailCurrentBalance");
const detailTotalDebits = document.getElementById("detailTotalDebits");
const detailTotalCredits = document.getElementById("detailTotalCredits");
const detailTotalEntries = document.getElementById("detailTotalEntries");
const detailEntryRows = document.getElementById("detailEntryRows");
const closeDetailPanel = document.getElementById("closeDetailPanel");

let selectedLedgerId = null;
const pageSize = 6;
const paging = { vendor: 1, employee: 1 };

passwordForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (passwordInput.value === OVERVIEW_PASSWORD) {
    passwordMessage.textContent = "";
    passwordGate.hidden = true;
    overviewContent.hidden = false;
    void refreshOverview();
    return;
  }

  passwordMessage.textContent = "Incorrect password.";
});

ledgerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const ledger = {
    id: crypto.randomUUID(),
    type: ledgerTypeInput.value,
    name: ledgerNameInput.value.trim(),
    note: ledgerNoteInput.value.trim(),
    openingBalance: toAmount(openingBalanceInput.value)
  };

  if (!ledger.name) {
    return;
  }

  try {
    await createLedger(ledger);
    ledgerForm.reset();
    openingBalanceInput.value = "0";
    await refreshOverview();
  } catch (error) {
    window.alert(error.message);
  }
});

closeDetailPanel.addEventListener("click", () => {
  accountDetailPanel.hidden = true;
  selectedLedgerId = null;
});

exportCsvBtn.href = getLedgerExportUrl();
vendorSearch.addEventListener("input", () => {
  paging.vendor = 1;
  renderOverview();
});
employeeSearch.addEventListener("input", () => {
  paging.employee = 1;
  renderOverview();
});
vendorPrevPage.addEventListener("click", () => changePage("vendor", -1));
vendorNextPage.addEventListener("click", () => changePage("vendor", 1));
employeePrevPage.addEventListener("click", () => changePage("employee", -1));
employeeNextPage.addEventListener("click", () => changePage("employee", 1));

detailEntryRows.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-detail-action]");
  if (!actionButton || !selectedLedgerId) {
    return;
  }

  const { detailAction, entryId } = actionButton.dataset;
  if (!entryId) {
    return;
  }

  if (detailAction === "edit") {
    void editDetailEntry(selectedLedgerId, entryId);
    return;
  }

  if (detailAction === "delete") {
    void deleteDetailEntry(selectedLedgerId, entryId);
  }
});

initializePasswordGate();

function initializePasswordGate() {
  passwordGate.hidden = false;
  overviewContent.hidden = true;
}

async function refreshOverview() {
  try {
    state = await loadLedgerState();
    renderOverview();
  } catch (error) {
    state = { ledgers: [] };
    renderOverview(error.message);
  }
}

function renderOverview(errorMessage = "") {
  const vendorLedgers = filterLedgers("vendor", vendorSearch.value);
  const employeeLedgers = filterLedgers("employee", employeeSearch.value);

  overviewVendorCount.textContent = vendorLedgers.length;
  overviewEmployeeCount.textContent = employeeLedgers.length;
  vendorGroupTotal.textContent = formatCurrency(calculateGroupTotal(vendorLedgers));
  employeeGroupTotal.textContent = formatCurrency(calculateGroupTotal(employeeLedgers));

  renderAccountGroup(vendorAccounts, vendorLedgers, "vendor", errorMessage);
  renderAccountGroup(employeeAccounts, employeeLedgers, "employee", errorMessage);
}

function renderAccountGroup(container, ledgers, type, errorMessage = "") {
  container.innerHTML = "";

  if (errorMessage) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(errorMessage)}</div>`;
    updatePagination(type, 0, 0);
    return;
  }

  if (!ledgers.length) {
    container.innerHTML = `<div class="empty-state">No ${escapeHtml(type)} accounts found.</div>`;
    updatePagination(type, 0, 0);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(ledgers.length / pageSize));
  paging[type] = Math.min(paging[type], totalPages);
  const startIndex = (paging[type] - 1) * pageSize;
  const pageLedgers = ledgers.slice(startIndex, startIndex + pageSize);

  pageLedgers.forEach((ledger) => {
    const fragment = accountCardTemplate.content.cloneNode(true);
    const cardButton = fragment.querySelector(".account-card-button");
    const title = fragment.querySelector(".account-title");
    const note = fragment.querySelector(".account-note");
    const balance = fragment.querySelector(".account-balance");
    const pdfButton = fragment.querySelector(".pdf-btn");

    const debits = ledger.entries
      .filter((entry) => entry.type === "debit")
      .reduce((sum, entry) => sum + entry.amount, 0);
    const credits = ledger.entries
      .filter((entry) => entry.type === "credit")
      .reduce((sum, entry) => sum + entry.amount, 0);

    title.textContent = ledger.name;
    note.textContent = ledger.note || "Click to view full account information.";
    balance.textContent = formatCurrency(ledger.openingBalance + debits - credits);
    cardButton.addEventListener("click", () => openAccountDetail(ledger));
    pdfButton.addEventListener("click", () => exportAccountToPdf(ledger));

    container.appendChild(fragment);
  });

  updatePagination(type, paging[type], totalPages);
}

function openAccountDetail(ledger) {
  selectedLedgerId = ledger.id;
  const debits = ledger.entries
    .filter((entry) => entry.type === "debit")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const credits = ledger.entries
    .filter((entry) => entry.type === "credit")
    .reduce((sum, entry) => sum + entry.amount, 0);

  detailType.textContent = `${capitalize(ledger.type)} Account`;
  detailTitle.textContent = ledger.name;
  detailNote.textContent = ledger.note || "No note added for this account.";
  detailOpeningBalance.textContent = formatCurrency(ledger.openingBalance);
  detailCurrentBalance.textContent = formatCurrency(ledger.openingBalance + debits - credits);
  detailTotalDebits.textContent = formatCurrency(debits);
  detailTotalCredits.textContent = formatCurrency(credits);
  detailTotalEntries.textContent = String(ledger.entries.length);
  detailEntryRows.innerHTML = "";

  if (!ledger.entries.length) {
    detailEntryRows.innerHTML = `<tr><td colspan="6">No entries recorded for this account.</td></tr>`;
  } else {
    let runningBalance = ledger.openingBalance;

    ledger.entries
      .slice()
      .sort((left, right) => new Date(left.date) - new Date(right.date))
      .forEach((entry) => {
        runningBalance += entry.type === "debit" ? entry.amount : -entry.amount;

        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${escapeHtml(formatDate(entry.date))}</td>
          <td>${escapeHtml(entry.description)}</td>
          <td class="entry-type ${entry.type}">${escapeHtml(capitalize(entry.type))}</td>
          <td>${formatCurrency(entry.amount)}</td>
          <td>${formatCurrency(runningBalance)}</td>
          <td class="action-cell">
            <button type="button" class="table-action-btn" data-detail-action="edit" data-entry-id="${escapeAttribute(entry.id)}">Edit</button>
            <button type="button" class="table-action-btn danger-btn" data-detail-action="delete" data-entry-id="${escapeAttribute(entry.id)}">Delete</button>
          </td>
        `;
        detailEntryRows.appendChild(row);
      });
  }

  accountDetailPanel.hidden = false;
  accountDetailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function calculateGroupTotal(ledgers) {
  return ledgers.reduce((total, ledger) => {
    const debits = ledger.entries
      .filter((entry) => entry.type === "debit")
      .reduce((sum, entry) => sum + entry.amount, 0);
    const credits = ledger.entries
      .filter((entry) => entry.type === "credit")
      .reduce((sum, entry) => sum + entry.amount, 0);

    return total + (ledger.openingBalance + debits - credits);
  }, 0);
}

async function editDetailEntry(ledgerId, entryId) {
  const ledger = state.ledgers.find((item) => item.id === ledgerId);
  const entry = ledger?.entries.find((item) => item.id === entryId);
  if (!ledger || !entry) {
    return;
  }

  const description = window.prompt("Edit description", entry.description);
  if (description === null) {
    return;
  }

  const amountInput = window.prompt("Edit amount", String(entry.amount));
  if (amountInput === null) {
    return;
  }

  const amount = Number.parseFloat(amountInput);
  if (!Number.isFinite(amount) || amount <= 0) {
    window.alert("Enter a valid amount.");
    return;
  }

  const date = window.prompt("Edit date (YYYY-MM-DD)", entry.date);
  if (date === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    if (date !== null) {
      window.alert("Enter a valid date in YYYY-MM-DD format.");
    }
    return;
  }

  const type = window.prompt("Edit type: debit or credit", entry.type);
  if (type === null) {
    return;
  }

  const normalizedType = type.trim().toLowerCase();
  if (!["debit", "credit"].includes(normalizedType)) {
    window.alert("Type must be debit or credit.");
    return;
  }

  try {
    await updateEntry(entryId, {
      ledgerId,
      type: normalizedType,
      amount,
      date,
      description: description.trim()
    });
    await refreshOverview();
    const refreshedLedger = state.ledgers.find((item) => item.id === ledgerId);
    if (refreshedLedger) {
      openAccountDetail(refreshedLedger);
    }
  } catch (error) {
    window.alert(error.message);
  }
}

async function deleteDetailEntry(ledgerId, entryId) {
  if (!window.confirm("Delete this entry?")) {
    return;
  }

  try {
    await deleteEntryById(entryId);
    await refreshOverview();
    const refreshedLedger = state.ledgers.find((item) => item.id === ledgerId);
    if (refreshedLedger) {
      openAccountDetail(refreshedLedger);
    } else {
      accountDetailPanel.hidden = true;
      selectedLedgerId = null;
    }
  } catch (error) {
    window.alert(error.message);
  }
}

function exportAccountToPdf(ledger) {
  const debits = ledger.entries
    .filter((entry) => entry.type === "debit")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const credits = ledger.entries
    .filter((entry) => entry.type === "credit")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const currentBalance = ledger.openingBalance + debits - credits;
  const sortedEntries = ledger.entries
    .slice()
    .sort((left, right) => new Date(left.date) - new Date(right.date));

  let runningBalance = ledger.openingBalance;
  const entryRows = sortedEntries.length
    ? sortedEntries.map((entry) => {
        runningBalance += entry.type === "debit" ? entry.amount : -entry.amount;
        return `
          <tr>
            <td>${escapeHtml(formatDate(entry.date))}</td>
            <td>${escapeHtml(entry.description)}</td>
            <td>${escapeHtml(capitalize(entry.type))}</td>
            <td>${formatCurrency(entry.amount)}</td>
            <td>${formatCurrency(runningBalance)}</td>
          </tr>
        `;
      }).join("")
    : `<tr><td colspan="5">No entries recorded for this account.</td></tr>`;

  const printWindow = window.open("", "_blank", "width=1000,height=800");
  if (!printWindow) {
    window.alert("Please allow pop-ups to export the PDF.");
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>${escapeHtml(ledger.name)} Report</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #1f2933; }
        h1 { margin-bottom: 4px; }
        p { margin: 4px 0; color: #52606d; }
        .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 24px 0; }
        .chip { border: 1px solid #d8c9b5; border-radius: 12px; padding: 12px; }
        .chip span { display: block; font-size: 12px; text-transform: uppercase; color: #7b8794; margin-bottom: 6px; }
        table { width: 100%; border-collapse: collapse; margin-top: 24px; }
        th, td { border: 1px solid #d8c9b5; padding: 10px; text-align: left; }
        th { background: #f4efe7; }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(ledger.name)}</h1>
      <p>${escapeHtml(capitalize(ledger.type))} Account</p>
      <p>${escapeHtml(ledger.note || "No note added for this account.")}</p>
      <div class="meta">
        <div class="chip"><span>Opening Balance</span><strong>${formatCurrency(ledger.openingBalance)}</strong></div>
        <div class="chip"><span>Current Balance</span><strong>${formatCurrency(currentBalance)}</strong></div>
        <div class="chip"><span>Total Debits</span><strong>${formatCurrency(debits)}</strong></div>
        <div class="chip"><span>Total Credits</span><strong>${formatCurrency(credits)}</strong></div>
        <div class="chip"><span>Total Entries</span><strong>${sortedEntries.length}</strong></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Type</th>
            <th>Amount</th>
            <th>Running Balance</th>
          </tr>
        </thead>
        <tbody>${entryRows}</tbody>
      </table>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function filterLedgers(type, query) {
  const normalizedQuery = query.trim().toLowerCase();
  return state.ledgers
    .filter((ledger) => ledger.type === type)
    .filter((ledger) => {
      if (!normalizedQuery) {
        return true;
      }

      return ledger.name.toLowerCase().includes(normalizedQuery)
        || ledger.note.toLowerCase().includes(normalizedQuery);
    });
}

function changePage(type, delta) {
  const query = type === "vendor" ? vendorSearch.value : employeeSearch.value;
  const totalItems = filterLedgers(type, query).length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  paging[type] = Math.min(totalPages, Math.max(1, paging[type] + delta));
  renderOverview();
}

function updatePagination(type, currentPage, totalPages) {
  const isVendor = type === "vendor";
  const prevButton = isVendor ? vendorPrevPage : employeePrevPage;
  const nextButton = isVendor ? vendorNextPage : employeeNextPage;
  const pageInfo = isVendor ? vendorPageInfo : employeePageInfo;

  if (totalPages === 0) {
    pageInfo.textContent = "Page 0 of 0";
    prevButton.disabled = true;
    nextButton.disabled = true;
    return;
  }

  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  prevButton.disabled = currentPage <= 1;
  nextButton.disabled = currentPage >= totalPages;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR"
  }).format(value);
}

function toAmount(value) {
  return Number.parseFloat(value) || 0;
}

function formatDate(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
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
