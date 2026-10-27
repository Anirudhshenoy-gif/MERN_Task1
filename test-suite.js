// test-suite.js - Automated test checklist validation
const http = require("http");

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on("error", reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runTests() {
  console.log("Starting automated test checklist...\n");

  // 1. GET /api/items
  const get1 = await request({ host: "localhost", port: 3000, path: "/api/items", method: "GET" });
  console.log("Test 1 [GET items]:", get1.status === 200 ? "PASS" : "FAIL", get1.body);

  // 2. POST /api/items (Valid)
  const post1 = await request(
    { host: "localhost", port: 3000, path: "/api/items", method: "POST", headers: { "Content-Type": "application/json" } },
    { name: "Minimalist Notebook", price: 45.5 }
  );
  console.log("Test 2 [POST valid]:", post1.status === 201 ? "PASS" : "FAIL", post1.body);

  // 3. PUT /api/items/:id (Valid)
  const put1 = await request(
    { host: "localhost", port: 3000, path: `/api/items/${post1.body.id}`, method: "PUT", headers: { "Content-Type": "application/json" } },
    { name: "Minimalist Notebook (Hardcover)", price: 55 }
  );
  console.log("Test 3 [PUT valid]:", put1.status === 200 ? "PASS" : "FAIL", put1.body);

  // 4. Edge case: Empty name (400)
  const errEmpty = await request(
    { host: "localhost", port: 3000, path: "/api/items", method: "POST", headers: { "Content-Type": "application/json" } },
    { name: "   ", price: 10 }
  );
  console.log("Test 4 [POST empty name -> 400]:", errEmpty.status === 400 ? "PASS" : "FAIL", errEmpty.body);

  // 5. Edge case: Negative price (400)
  const errNeg = await request(
    { host: "localhost", port: 3000, path: "/api/items", method: "POST", headers: { "Content-Type": "application/json" } },
    { name: "Valid Name", price: -5 }
  );
  console.log("Test 5 [POST negative price -> 400]:", errNeg.status === 400 ? "PASS" : "FAIL", errNeg.body);

  // 6. Edge case: Price exceeding 10,000,000 (400)
  const errHuge = await request(
    { host: "localhost", port: 3000, path: "/api/items", method: "POST", headers: { "Content-Type": "application/json" } },
    { name: "Yacht", price: 999999999 }
  );
  console.log("Test 6 [POST huge price -> 400]:", errHuge.status === 400 ? "PASS" : "FAIL", errHuge.body);

  // 7. Edge case: Invalid ID (400)
  const errId = await request(
    { host: "localhost", port: 3000, path: "/api/items/abc", method: "PUT", headers: { "Content-Type": "application/json" } },
    { name: "Valid", price: 10 }
  );
  console.log("Test 7 [PUT invalid ID -> 400]:", errId.status === 400 ? "PASS" : "FAIL", errId.body);

  // 8. Edge case: Non-existent ID (404)
  const err404 = await request(
    { host: "localhost", port: 3000, path: "/api/items/99999", method: "PUT", headers: { "Content-Type": "application/json" } },
    { name: "Valid", price: 10 }
  );
  console.log("Test 8 [PUT not found -> 404]:", err404.status === 404 ? "PASS" : "FAIL", err404.body);

  // 9. DELETE /api/items/:id (Valid)
  const del1 = await request(
    { host: "localhost", port: 3000, path: `/api/items/${post1.body.id}`, method: "DELETE" }
  );
  console.log("Test 9 [DELETE valid]:", del1.status === 200 ? "PASS" : "FAIL", del1.body);

  // 10. Unknown API route (404 JSON)
  const unknown = await request({ host: "localhost", port: 3000, path: "/api/nonexistent", method: "GET" });
  console.log("Test 10 [Unknown route -> 404 JSON]:", unknown.status === 404 ? "PASS" : "FAIL", unknown.body);

  console.log("\nAll tests evaluated.");
}

runTests().catch(console.error);
