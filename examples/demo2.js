const { Querium } = require("../dist/index.js");


const users = new Querium({ key: "id" });


users.defineIndex({ name: "byEmail", key: "email", unique: true, kind: "eq" });
users.defineIndex({ name: "byAge", key: "age", unique: false, kind: "range" }); // sayısal/sıralanabilir


users.insert({ id: 1, email: "a@x.com", age: 24, username: "alice" });
users.insert({ id: 2, email: "b@x.com", age: 31, username: "bob" });
users.insert({ id: 3, email: "c@x.com", age: 29, username: "carol" });


const carol = users.getOne("byEmail", "c@x.com");
console.log("Found carol:", carol);



const midAges = users.between("byAge", 25, 35); // id: 2 ve 3
console.log("Mid ages:", midAges);



users.update(3, { age: 33 });
console.log("Updated carol:", users.get(3));


users.remove(2);
console.log("Removed bob:", users.get(2));

console.log("All users:", users.getAll());