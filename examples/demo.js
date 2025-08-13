/**
 * Querium Demo - Querium usage examples
 */

const { Querium } = require("../dist/index.js");

console.log("🚀 Querium Demo Starting...\n");

// 0. Basic Example
console.log("0️⃣ Basic Example:");
const simpleUsers = new Querium({ key: "id" });

// Define indexes:
simpleUsers.defineIndex({ name: "byEmail", key: "email", unique: true, kind: "eq" });
simpleUsers.defineIndex({ name: "byAge", key: "age", unique: false, kind: "range" });

// Add data
simpleUsers.insert({ id: 1, email: "a@x.com", age: 24, username: "alice" });
simpleUsers.insert({ id: 2, email: "b@x.com", age: 31, username: "bob" });
simpleUsers.insert({ id: 3, email: "c@x.com", age: 29, username: "carol" });

// Equality search
const carol = simpleUsers.getOne("byEmail", "c@x.com");
console.log("Carol found:", carol?.username);

// Range search (age 25-35)
const midAges = simpleUsers.between("byAge", 25, 35);
console.log("Age 25-35:", midAges.map(x => x.username));

// Update (indexes automatically updated)
simpleUsers.update(3, { age: 33 });
console.log("Carol's new age:", simpleUsers.get(3)?.age);

// Remove
simpleUsers.remove(2);
console.log("User count after removal:", simpleUsers.size());

console.log("\n" + "=".repeat(50) + "\n");

// 1. Create collection
const users = new Querium({ key: "id" });

console.log("1️⃣ Defining indexes...");
users
  .defineIndex({ name: "byCityAge", kind: "eq", key: ["city", "age"] })
  .defineIndex({ name: "rangeCityAge", kind: "range", key: ["city", "age"] })
  .defineIndex({ name: "byNamePrefix", kind: "prefix", key: "name" });

// 2. Add data
console.log("2️⃣ Adding data...");
users.insert({ id: 1, city: "Ankara", age: 28, name: "firat" });
users.insert({ id: 2, city: "Ankara", age: 31, name: "fidan" });
users.insert({ id: 3, city: "İzmir", age: 25, name: "faruk" });
users.insert({ id: 4, city: "İstanbul", age: 30, name: "fatih" });

console.log(`📊 Total user count: ${users.size()}\n`);

// 3. Equality queries
console.log("3️⃣ Equality Index Queries:");
console.log("Users in Ankara aged 31:", users.getAll("byCityAge", ["Ankara", 31]).map(x => x.name));
console.log("Users in İzmir aged 25:", users.getAll("byCityAge", ["İzmir", 25]).map(x => x.name));

// 4. Range queries
console.log("\n4️⃣ Range Index Queries:");
const rangeResults = users.between("rangeCityAge", ["Ankara", 0], ["İzmir", 30]);
console.log("From Ankara to İzmir, age 0-30:", rangeResults.map(x => `${x.name} (${x.city}, ${x.age})`));

// 5. Prefix queries
console.log("\n5️⃣ Prefix Index Queries:");
console.log("Names starting with 'fi':", users.startsWith("byNamePrefix", "fi").map(x => x.name));
console.log("Names starting with 'fa':", users.startsWith("byNamePrefix", "fa").map(x => x.name));

// 6. Snapshot and Rollback
console.log("\n6️⃣ Snapshot and Rollback:");
console.log("Creating snapshot...");
users.snapshot();

console.log("Removing user 2...");
users.remove(2);
console.log(`User count after removal: ${users.size()}`);

console.log("Performing rollback...");
users.rollback();
console.log(`User count after rollback: ${users.size()}`);

// 7. Persistence
console.log("\n7️⃣ Persistence:");
const saved = users.serialize();
console.log("Collection serialized, size:", saved.length, "characters");

const restored = Querium.deserialize(saved);
console.log("Collection deserialized, user count:", restored.size());

// 8. Advanced queries
console.log("\n8️⃣ Advanced Queries:");
console.log("All users:", users.getAll().map(x => `${x.name} (${x.city}, ${x.age})`));

// 9. Performance test
console.log("\n9️⃣ Performance Test:");
const start = Date.now();
for (let i = 0; i < 1000; i++) {
  users.getAll("byCityAge", ["Ankara", 28]);
}
const end = Date.now();
console.log(`1000 equality query: ${end - start}ms`);

console.log("\n✅ Demo finished!");
