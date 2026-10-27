const API_URL = "/api/items";
const NAME_MAX = 50;
const PRICE_MAX = 10000000;

const form = document.getElementById("itemForm");
const itemIdInput = document.getElementById("itemId");
const nameInput = document.getElementById("name");
const priceInput = document.getElementById("price");
const submitBtn = document.getElementById("submitBtn");
const cancelBtn = document.getElementById("cancelBtn");
const tableBody = document.getElementById("itemTableBody");
const statusBox = document.getElementById("status");

let items = [];
let busy = false;
let statusTimer = null;

// ---------- UI helpers ----------
function showMessage(text, type = "error") {
  clearTimeout(statusTimer);
  statusBox.textContent = text;
  statusBox.className = `status ${type}`;
  if (type === "success") {
    statusTimer = setTimeout(() => statusBox.classList.add("hidden"), 3000);
  }
}

function clearMessage() {
  clearTimeout(statusTimer);
  statusBox.className = "status hidden";
  statusBox.textContent = "";
}

function setBusy(flag) {
  busy = flag;
  document.querySelectorAll("button").forEach((b) => (b.disabled = flag));
}

function resetForm() {
  form.reset();
  itemIdInput.value = "";
  submitBtn.textContent = "Submit";
  cancelBtn.classList.add("hidden");
}

// ---------- Network helper ----------
async function request(url, options = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new Error("Cannot reach the server. Check that it is running.");
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no JSON body */
  }

  if (!res.ok) {
    throw new Error((data && data.message) || `Request failed (status ${res.status})`);
  }
  return data;
}

// ---------- READ ----------
async function loadItems() {
  try {
    items = await request(API_URL);
    renderTable();
  } catch (err) {
    showMessage(err.message);
    tableBody.replaceChildren(messageRow("Could not load items."));
  }
}

function messageRow(text) {
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = 4;
  td.className = "empty";
  td.textContent = text;
  tr.appendChild(td);
  return tr;
}

function makeButton(label, className, action, id) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `btn ${className}`;
  btn.textContent = label;
  btn.dataset.action = action;
  btn.dataset.id = String(id);
  return btn;
}

function renderTable() {
  if (items.length === 0) {
    tableBody.replaceChildren(messageRow("No items found"));
    return;
  }

  const rows = items.map((item) => {
    const tr = document.createElement("tr");

    [item.id, item.name, item.price].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = String(value); // textContent is safe against XSS
      tr.appendChild(td);
    });

    const actionTd = document.createElement("td");
    actionTd.append(
      makeButton("Edit", "btn-edit", "edit", item.id),
      makeButton("Delete", "btn-delete", "delete", item.id)
    );
    tr.appendChild(actionTd);
    return tr;
  });

  tableBody.replaceChildren(...rows);
}

// ---------- Client-side validation ----------
function readAndValidateForm() {
  const name = nameInput.value.trim().replace(/\s+/g, " ");
  const priceText = priceInput.value.trim();

  if (!name) return { error: "Name is required." };
  if (name.length > NAME_MAX) return { error: `Name must be at most ${NAME_MAX} characters.` };
  if (priceText === "") return { error: "Price is required." };

  const price = Number(priceText);
  if (!Number.isFinite(price)) return { error: "Price must be a valid number." };
  if (price < 0) return { error: "Price cannot be negative." };
  if (price > PRICE_MAX) return { error: `Price cannot exceed ${PRICE_MAX}.` };

  return { value: { name, price } };
}

// ---------- CREATE and UPDATE ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;

  const { value, error } = readAndValidateForm();
  if (error) return showMessage(error);

  const id = itemIdInput.value;
  const isUpdate = id !== "";

  setBusy(true);
  try {
    await request(isUpdate ? `${API_URL}/${id}` : API_URL, {
      method: isUpdate ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
    resetForm();
    showMessage(isUpdate ? "Item updated." : "Item added.", "success");
  } catch (err) {
    showMessage(err.message);
    if (isUpdate && /not found/i.test(err.message)) resetForm();
  } finally {
    await loadItems();
    setBusy(false);
  }
});

// ---------- EDIT and DELETE (event delegation) ----------
tableBody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn || busy) return;

  const id = Number(btn.dataset.id);
  const item = items.find((i) => i.id === id);

  if (btn.dataset.action === "edit") {
    if (!item) return showMessage("Item no longer exists.");
    clearMessage();
    itemIdInput.value = item.id;
    nameInput.value = item.name;
    priceInput.value = item.price;
    submitBtn.textContent = "Update";
    cancelBtn.classList.remove("hidden");
    nameInput.focus();
    return;
  }

  if (btn.dataset.action === "delete") {
    const label = item ? item.name : `#${id}`;
    if (!confirm(`Delete "${label}"?`)) return;

    setBusy(true);
    try {
      await request(`${API_URL}/${id}`, { method: "DELETE" });
      if (itemIdInput.value === String(id)) resetForm();
      showMessage("Item deleted.", "success");
    } catch (err) {
      showMessage(err.message);
    } finally {
      await loadItems();
      setBusy(false);
    }
  }
});

cancelBtn.addEventListener("click", () => {
  if (busy) return;
  resetForm();
  clearMessage();
});

// ---------- Initial load ----------
loadItems();
