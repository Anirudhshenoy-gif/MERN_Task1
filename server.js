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
