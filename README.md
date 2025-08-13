# Querium

Querium is a lightweight in-memory collection with multi-key equality, range, composite, and prefix indexes, offering fast lookups, flexible queries, and snapshot/persistence support without an external database.

## Why Not Just Use JavaScript's .find()?

JavaScript's built-in `.find()` method is great for simple lookups, but it has significant limitations:

- **Performance**: `.find()` scans the entire array sequentially - O(n) complexity
- **No indexing**: Every query requires a full array scan, even for repeated searches
- **Limited queries**: Only supports simple equality checks, no range or prefix searches
- **Memory inefficiency**: No optimization for frequently accessed data
- **Scalability issues**: Performance degrades linearly as data grows

## Why Querium?

Querium solves these problems by providing:

- **Fast lookups**: O(1) average case for equality queries, O(log n) for ranges
- **Smart indexing**: Automatically maintains indexes for instant access
- **Advanced queries**: Support for range, prefix, and composite key searches
- **Memory optimization**: Efficient data structures for large datasets
- **Snapshot system**: Built-in state management for complex operations

## Features

- **Multi-key indexes**: Support for equality, range, and prefix indexes
- **Composite keys**: Index on multiple fields with custom comparison functions
- **Snapshot & Rollback**: Create snapshots and rollback to previous states
- **Persistence**: Serialize/deserialize collections to/from JSON
- **TypeScript support**: Full TypeScript definitions included
- **Universal compatibility**: Works in Node.js, browsers, and other JavaScript environments

## Installation

```bash
npm install querium
```

## Usage

### Basic Example

```javascript
const { Querium } = require("querium");

const users = new Querium({ key: "id" });

users.defineIndex({ name: "byEmail", key: "email", unique: true, kind: "eq" });
users.defineIndex({ name: "byAge", key: "age", unique: false, kind: "range" });

// Add data
users.insert({ id: 1, email: "a@x.com", age: 24, username: "alice" });
users.insert({ id: 2, email: "b@x.com", age: 31, username: "bob" });
users.insert({ id: 3, email: "c@x.com", age: 29, username: "carol" });

// Equality search
const carol = users.getOne("byEmail", "c@x.com");

// Range search (age 25-35)
const midAges = users.between("byAge", 25, 35);

// Update (indexes automatically updated)
users.update(3, { age: 33 });

// Remove
users.remove(2);
```

### Advanced Example

```javascript
const { Querium } = require("querium");

// Create collection with primary key
const users = new Querium({ key: "id" });

// Define indexes
users
  .defineIndex({ name: "byCityAge", kind: "eq", key: ["city", "age"] })
  .defineIndex({ name: "rangeCityAge", kind: "range", key: ["city", "age"] })
  .defineIndex({ name: "byNamePrefix", kind: "prefix", key: "name" });

// Insert data
users.insert({ id: 1, city: "Ankara", age: 28, name: "firat" });
users.insert({ id: 2, city: "Ankara", age: 31, name: "fidan" });
users.insert({ id: 3, city: "İzmir", age: 25, name: "faruk" });

// Query by equality index
console.log(users.getAll("byCityAge", ["Ankara", 31])); // -> [{ id: 2, ... }]

// Query by range index
console.log(users.between("rangeCityAge", ["Ankara", 0], ["İzmir", 30]).map(x => x.id)); // -> [1, 3]

// Query by prefix index
console.log(users.startsWith("byNamePrefix", "fi").map(x => x.name)); // -> ["firat", "fidan"]
```

### TypeScript

```typescript
import { Querium } from "querium";

interface User {
  id: number;
  city: string;
  age: number;
  name: string;
}

const users = new Querium<User>({ key: "id" });

// Define indexes with type safety
users
  .defineIndex({ name: "byCityAge", kind: "eq", key: ["city", "age"] })
  .defineIndex({ name: "rangeCityAge", kind: "range", key: ["city", "age"] })
  .defineIndex({ name: "byNamePrefix", kind: "prefix", key: "name" });

// Insert with type checking
users.insert({ id: 1, city: "Ankara", age: 28, name: "firat" });

// Query with proper typing
const results: User[] = users.getAll("byCityAge", ["Ankara", 31]);
```

### Snapshot and Rollback

```javascript
// Create a snapshot
users.snapshot();

// Make changes
users.remove(2);

// Rollback to previous state
users.rollback(); // id: 2 is back
```

### Persistence

```javascript
// Save to disk
const saved = users.serialize();
// ... write to file

// Load from disk
const restored = Querium.deserialize(saved);
```

## Index Types

### Equality Index (`eq`)
Fast lookups for exact matches. Supports single fields, composite keys, and custom key functions.

```javascript
users.defineIndex({ name: "byCity", kind: "eq", key: "city" });
users.defineIndex({ name: "byCityAge", kind: "eq", key: ["city", "age"] });
users.defineIndex({ name: "custom", kind: "eq", key: (obj) => obj.city + "_" + obj.age });
```

### Range Index (`range`)
Efficient range queries with custom comparison functions.

```javascript
users.defineIndex({ name: "byAge", kind: "range", key: "age" });
users.defineIndex({ name: "byCityAge", kind: "range", key: ["city", "age"] });

// Query ranges
users.between("byAge", 25, 35);
users.between("byCityAge", ["Ankara", 0], ["İzmir", 30]);
```

### Prefix Index (`prefix`)
Fast prefix matching for strings and composite values.

```javascript
users.defineIndex({ name: "byName", kind: "prefix", key: "name" });

// Find names starting with "fi"
users.startsWith("byName", "fi");
```

## API Reference

### Constructor
```javascript
new Querium({ key: "id" })
```

### Index Management
- `defineIndex(definition)` - Define a new index
- `hasIndex(name)` - Check if index exists

### CRUD Operations
- `insert(obj)` - Insert new item
- `upsert(obj)` - Insert or update item
- `update(id, patch)` - Update existing item
- `remove(id)` - Remove item
- `get(id)` - Get item by primary key
- `size()` - Get collection size

### Queries
- `getOne(indexName, value)` - Get single item by index
- `getAll(indexName, value)` - Get all items by index
- `between(indexName, min, max, options)` - Range query
- `startsWith(indexName, prefix)` - Prefix query

### Persistence
- `serialize()` - Export to JSON string
- `static deserialize(json)` - Import from JSON
- `snapshot()` - Create snapshot
- `rollback()` - Rollback to last snapshot

## Performance

- **Equality queries**: O(1) average case
- **Range queries**: O(log n) with binary search
- **Prefix queries**: O(k) where k is prefix length
- **Memory usage**: Linear with data size + index overhead

## License

MIT
