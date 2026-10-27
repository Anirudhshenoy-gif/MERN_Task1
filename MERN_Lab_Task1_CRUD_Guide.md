# MERN Lab Task 1: Front End for CRUD Operations on an Array of Items (Hardened Version)

**Tech used:** HTML, CSS, JavaScript (Fetch API), Express.js, REST API
**Data storage:** JavaScript array in memory, saved to `items.json` so data survives restarts

---

## 1. Objective

Build a web page, based on the wireframe, that performs **Create, Read, Update, Delete (CRUD)** on an array of items through an Express.js REST API. This version is built to handle bad input, server errors, double clicks, malicious text and stale data without crashing or corrupting anything.

### Wireframe (from the sketch)

```
+---------------------------------+
|  Name   [______________]        |
|  Price  [______________]        |
|                    [ Submit ]   |
+---------------------------------+

+----+--------+-------+---------------------+
| ID | Name   | Price | Action              |
+----+--------+-------+---------------------+
| 1  | Book   | 250   | [Edit]   [Delete]   |
| 2  | Pen    | 25    | [Edit]   [Delete]   |
+----+--------+-------+---------------------+
```

---

## 2. What "Foolproof" Means Here

| Risk | How this version handles it |
|------|-----------------------------|
| User types HTML/script as a name (XSS) | Rows are built with `textContent`, never `innerHTML`; no inline `onclick` |
| Empty, whitespace-only or very long name | Validated in the browser **and** on the server (1 to 50 chars, trimmed) |
| Negative, non-numeric, `NaN`, `Infinity` or huge price | Validated on both sides (0 to 10,000,000, rounded to 2 decimals) |
| Someone bypasses the page and calls the API directly | Server never trusts the client and re-validates everything |
| Malformed JSON or oversized request body | Caught by an error middleware, returns 400 / 413 instead of crashing |
| Invalid ID such as `/api/items/abc` | Returns 400; unknown ID returns 404 |
| Unknown API URL | Returns a JSON 404 instead of an HTML error page |
| Double-click on Submit or Delete | All buttons are disabled while a request is in flight |
| Server is down or network fails | User sees a clear error message; page does not break |
| Item deleted in another tab, then edited here | Server returns 404, page shows the message and refreshes |
| Server restart loses data | Items are saved to `items.json` (atomic write) and reloaded on start |
| Corrupted or missing `items.json` | Falls back to default items instead of crashing |
| Port already in use | Clear console message and clean exit |
| Names containing quotes like `O'Brien` | Safe, because data is never pasted into inline JavaScript |
| Two items getting the same ID | ID counter is derived from the highest existing ID and never reused in a session |

---

## 3. Prerequisites

- Node.js v18 or later and npm
- VS Code (or any editor)
- Postman or curl (optional, for API testing)

```bash
node -v
npm -v
```

---

## 4. Project Structure

```
crud-app/
├── server.js
├── package.json
├── items.json          (auto-created on first change)
└── public/
    ├── index.html
    ├── style.css
    └── script.js
```

---

## 5. Setup

```bash
mkdir crud-app
cd crud-app
npm init -y
npm install express
mkdir public
```

Add to `package.json`:

```json
"scripts": {
  "start": "node server.js"
}
```

---

## 6. REST API Design

| Operation | Method | Endpoint         | Body              | Success         | Errors        |
|-----------|--------|------------------|-------------------|-----------------|---------------|
| Read all  | GET    | `/api/items`     | none              | 200 + array     | 500           |
| Create    | POST   | `/api/items`     | `{ name, price }` | 201 + new item  | 400, 413, 500 |
| Update    | PUT    | `/api/items/:id` | `{ name, price }` | 200 + item      | 400, 404, 500 |
| Delete    | DELETE | `/api/items/:id` | none              | 200 + message   | 400, 404, 500 |

Every error response has the shape `{ "message": "reason" }`.

---

## 7. Backend: `server.js`

```js
const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "items.json");

const NAME_MAX = 50;
const PRICE_MAX = 10000000;

// ---------- Middleware ----------
app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

// ---------- Data layer ----------
const defaultItems = [
  { id: 1, name: "Book", price: 250 },
  { id: 2, name: "Pen", price: 25 },
];

function isStoredItem(i) {
  return (
    i &&
    Number.isInteger(i.id) &&
    i.id > 0 &&
    typeof i.name === "string" &&
    typeof i.price === "number" &&
    Number.isFinite(i.price)
  );
}

function loadItems() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (Array.isArray(parsed)) return parsed.filter(isStoredItem);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn("items.json unreadable, using defaults:", err.message);
    }
  }
  return defaultItems.map((i) => ({ ...i }));
}

function saveItems() {
  try {
    const tmp = DATA_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(items, null, 2));
    fs.renameSync(tmp, DATA_FILE); // atomic replace, avoids half-written files
  } catch (err) {
    console.error("Could not save items.json:", err.message);
  }
}

let items = loadItems();
let nextId = items.reduce((max, i) => Math.max(max, i.id), 0) + 1;

// ---------- Helpers ----------
function validateItem(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Request body must be a JSON object" };
  }

  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (!name) return { error: "Name is required" };
  if (name.length > NAME_MAX) return { error: `Name must be at most ${NAME_MAX} characters` };

  let price = body.price;
  if (typeof price === "string" && price.trim() !== "") price = Number(price);
  if (typeof price !== "number" || !Number.isFinite(price)) {
    return { error: "Price must be a valid number" };
  }
  if (price < 0) return { error: "Price cannot be negative" };
  if (price > PRICE_MAX) return { error: `Price cannot exceed ${PRICE_MAX}` };

  price = Math.round(price * 100) / 100;
  return { value: { name, price } };
}

function parseId(raw) {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

// ---------- Routes ----------
// READ all
app.get("/api/items", (req, res) => {
  res.json(items);
});

// CREATE
app.post("/api/items", (req, res) => {
  const { value, error } = validateItem(req.body);
  if (error) return res.status(400).json({ message: error });

  const newItem = { id: nextId++, ...value };
  items.push(newItem);
  saveItems();
  res.status(201).json(newItem);
});

// UPDATE
app.put("/api/items/:id", (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ message: "Invalid item ID" });

  const item = items.find((i) => i.id === id);
  if (!item) return res.status(404).json({ message: "Item not found. It may have been deleted." });

  const { value, error } = validateItem(req.body);
  if (error) return res.status(400).json({ message: error });

  item.name = value.name;
  item.price = value.price;
  saveItems();
  res.json(item);
});

// DELETE
app.delete("/api/items/:id", (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ message: "Invalid item ID" });

  const index = items.findIndex((i) => i.id === id);
  if (index === -1) {
    return res.status(404).json({ message: "Item not found. It may already be deleted." });
  }

  items.splice(index, 1);
  saveItems();
  res.json({ message: "Item deleted" });
});

// ---------- Fallbacks (must stay below the routes) ----------
app.use("/api", (req, res) => {
  res.status(404).json({ message: "API route not found" });
});

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Malformed JSON in request body" });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ message: "Request body too large" });
  }
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

// ---------- Start ----------
const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the other process or set PORT=3001.`);
  } else {
    console.error("Server error:", err);
  }
  process.exit(1);
});
```

---

## 8. Front End

### `public/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Items CRUD</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div class="container">
    <h1>Items Manager</h1>

    <!-- Message area for errors and confirmations -->
    <div id="status" class="status hidden" role="alert" aria-live="polite"></div>

    <!-- Form -->
    <form id="itemForm" class="form-box" autocomplete="off" novalidate>
      <input type="hidden" id="itemId" />

      <div class="form-row">
        <label for="name">Name</label>
        <input type="text" id="name" maxlength="50" placeholder="Enter item name" required />
      </div>

      <div class="form-row">
        <label for="price">Price</label>
        <input type="number" id="price" min="0" max="10000000" step="0.01"
               placeholder="Enter price" required />
      </div>

      <div class="form-actions">
        <button type="button" id="cancelBtn" class="btn btn-gray hidden">Cancel</button>
        <button type="submit" id="submitBtn" class="btn btn-primary">Submit</button>
      </div>
    </form>

    <!-- Table -->
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Price</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody id="itemTableBody"></tbody>
      </table>
    </div>
  </div>

  <script src="script.js"></script>
</body>
</html>
```

### `public/style.css`

```css
* {
  box-sizing: border-box;
}

body {
  font-family: Arial, sans-serif;
  background: #f4f6f8;
  margin: 0;
  padding: 20px;
}

.container {
  max-width: 640px;
  margin: 0 auto;
}

h1 {
  text-align: center;
  color: #333;
}

.hidden {
  display: none !important;
}

/* Status banner */
.status {
  padding: 10px 14px;
  border-radius: 4px;
  margin-bottom: 15px;
  font-size: 14px;
}
.status.error   { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
.status.success { background: #dcfce7; color: #166534; border: 1px solid #86efac; }

/* Form */
.form-box {
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 20px;
  margin-bottom: 25px;
}

.form-row {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.form-row label {
  width: 80px;
  font-weight: bold;
}

.form-row input {
  flex: 1;
  min-width: 0;
  padding: 8px;
  border: 1px solid #999;
  border-radius: 4px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* Buttons */
.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-primary { background: #2563eb; color: #fff; }
.btn-edit    { background: #f59e0b; color: #fff; }
.btn-delete  { background: #dc2626; color: #fff; }
.btn-gray    { background: #6b7280; color: #fff; }

.btn:hover:not(:disabled) { opacity: 0.85; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Table */
.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
}

th, td {
  border: 1px solid #ccc;
  padding: 10px;
  text-align: left;
  word-break: break-word;
}

th {
  background: #e5e7eb;
}

td .btn {
  margin-right: 6px;
}

.empty {
  text-align: center;
  color: #777;
}
```

### `public/script.js`

```js
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
    /* response had no JSON body */
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
    // If the item no longer exists, leave edit mode so the form is not stuck
    if (isUpdate && /not found/i.test(err.message)) resetForm();
  } finally {
    await loadItems(); // always re-sync with the server
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
      // If the deleted item was being edited, leave edit mode
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
```

---

## 9. Run the Application

```bash
node server.js
```

Open **http://localhost:3000**

---

## 10. How It Works

1. `index.html` loads `script.js`, which calls `GET /api/items` and builds the table.
2. **Create:** Submit validates in the browser, then sends `POST`. The server validates again, adds the item and saves `items.json`.
3. **Edit:** Edit copies the row into the form (looked up by ID from the loaded array) and switches the button to "Update". Submit then sends `PUT /api/items/:id`.
4. **Delete:** Delete asks for confirmation, then sends `DELETE /api/items/:id`.
5. After every action, success or failure, the table is reloaded from the server so the screen always matches the real data.

---

## 11. Testing Checklist

### Normal flow

| # | Test | Expected |
|---|------|----------|
| 1 | Open the page | Shows Book (250) and Pen (25) |
| 2 | Add "Bag", price 500 | New row appears, green "Item added." message |
| 3 | Edit Pen, change price to 30, click Update | Row shows Pen, 30 |
| 4 | Delete Book and confirm | Row removed |
| 5 | Click Edit then Cancel | Form clears, button returns to "Submit" |

### Abuse and edge cases

| # | Test | Expected |
|---|------|----------|
| 6 | Name `<img src=x onerror=alert(1)>` | Shown as plain text, no alert |
| 7 | Name `O'Brien "Pens"` | Saved and displayed correctly, Edit still works |
| 8 | Empty name or only spaces | Error "Name is required." |
| 9 | 51+ character name | Error about the length limit |
| 10 | Price `-5`, empty, or `abc` | Error message, nothing saved |
| 11 | Price `99999999999` | Error about maximum price |
| 12 | Price `10.999` | Saved as `11` (rounded to 2 decimals) |
| 13 | Double-click Submit quickly | Only one item is created |
| 14 | Stop the server, then click Submit | "Cannot reach the server" message, page still works |
| 15 | Open two tabs; delete an item in tab A, edit it in tab B and Update | Error "Item not found", form resets, table refreshes |
| 16 | Add items, stop and restart the server | Items are still there |
| 17 | Delete `items.json` or fill it with garbage, restart | Server starts with the default two items |

### API tests with curl

```bash
# Valid
curl http://localhost:3000/api/items
curl -X POST http://localhost:3000/api/items -H "Content-Type: application/json" -d '{"name":"Bag","price":500}'
curl -X PUT http://localhost:3000/api/items/1 -H "Content-Type: application/json" -d '{"name":"Notebook","price":300}'
curl -X DELETE http://localhost:3000/api/items/2

# Should all fail cleanly
curl -X POST http://localhost:3000/api/items -H "Content-Type: application/json" -d '{bad json'      # 400 malformed JSON
curl -X POST http://localhost:3000/api/items -H "Content-Type: application/json" -d '{"name":"","price":5}'   # 400
curl -X POST http://localhost:3000/api/items -H "Content-Type: application/json" -d '{"name":"X","price":-1}' # 400
curl -X PUT  http://localhost:3000/api/items/abc -H "Content-Type: application/json" -d '{"name":"X","price":1}' # 400 invalid ID
curl -X PUT  http://localhost:3000/api/items/9999 -H "Content-Type: application/json" -d '{"name":"X","price":1}' # 404
curl -X DELETE http://localhost:3000/api/items/9999    # 404
curl http://localhost:3000/api/nothing                 # 404 JSON
```

---

## 12. Troubleshooting

| Problem | Likely cause / fix |
|---------|--------------------|
| `Cannot GET /` | `index.html` is not inside the `public` folder |
| Every POST returns 400 "Request body must be a JSON object" | Missing `Content-Type: application/json` header |
| Port already in use | Run `PORT=3001 node server.js` (on Windows PowerShell: `$env:PORT=3001; node server.js`) |
| Changes to code not showing | Hard refresh (Ctrl+Shift+R) and restart the server |
| Data not saving | Check console for "Could not save items.json" (folder permissions) |

---

## 13. Honest Limits (Out of Scope for This Lab)

This version is solid for a lab, but a real production app would also need:

- A real database such as MongoDB (the "M" in MERN) instead of a JSON file
- Authentication and authorisation (anyone who can reach the server can edit data)
- Rate limiting and HTTPS
- Concurrency control if many users edit at the same moment

---

## 14. Submission Checklist

- [ ] `node server.js` starts without errors
- [ ] Create, Read, Update and Delete all work
- [ ] Layout matches the wireframe (form on top, table below)
- [ ] Edge-case tests 6 to 17 pass
- [ ] Screenshots of the output, including one error message
- [ ] Files: `server.js`, `index.html`, `style.css`, `script.js`
