// Querium.js
class Querium {
  constructor({ key = "id" } = {}) {
    this.primaryKey = key;
    this.items = new Map();       // id -> object
    this.indexes = new Map();     // name -> indexDef
    this._snapshots = [];         // rollback stack
  }

  // ---- Index Tanımı ----
  defineIndex({ name, key, unique = false, kind = "eq", compare } = {}) {
    if (this.indexes.has(name)) throw new Error(`Index '${name}' already exists`);
    if (!["eq", "range", "prefix"].includes(kind)) throw new Error(`Invalid index kind: ${kind}`);

    const def = {
      name,
      keySpec: key,                  // or ["a","b"] or function
      keyGetter: makeKeyGetter(key), // (obj)=> value | composite array | string
      unique,
      kind,
      compare: compare || defaultCompare,
      // storage alanları:
      eq: { map: new Map() },                 // valueKey(string) -> id | Set<id>
      range: { arr: [] },                     // sorted [{value, id}]
      prefix: { root: makeTrieNode() },       // trie
    };

    // prefix’te unique anlamsız: yok sayıyoruz
    if (kind === "prefix" && unique) {
      console.warn(`[${name}] prefix index 'unique' yok sayıldı.`);
    }

    this.indexes.set(name, def);
    // var olan verilerden full build
    for (const obj of this.items.values()) this.#addToIndex(def, obj);
    return this;
  }

  // ---- CRUD ----
  insert(obj) {
    const id = obj[this.primaryKey];
    if (id == null) throw new Error(`Missing primary key '${this.primaryKey}'`);
    if (this.items.has(id)) throw new Error(`Duplicate primary key '${id}'`);
    this.items.set(id, obj);
    for (const idx of this.indexes.values()) this.#addToIndex(idx, obj);
    return id;
  }

  upsert(obj) {
    const id = obj[this.primaryKey];
    if (id == null) throw new Error(`Missing primary key '${this.primaryKey}'`);
    if (this.items.has(id)) { this.update(id, obj); return id; }
    return this.insert(obj);
  }

  update(id, patchOrNewObj) {
    if (!this.items.has(id)) throw new Error(`No item with id '${id}'`);
    const prev = this.items.get(id);
    const next = isPlainObject(patchOrNewObj)
      ? { ...prev, ...patchOrNewObj, [this.primaryKey]: id }
      : patchOrNewObj;

    for (const idx of this.indexes.values()) this.#removeFromIndex(idx, prev);
    this.items.set(id, next);
    for (const idx of this.indexes.values()) this.#addToIndex(idx, next);
    return next;
  }

  remove(id) {
    const obj = this.items.get(id);
    if (!obj) return false;
    for (const idx of this.indexes.values()) this.#removeFromIndex(idx, obj);
    this.items.delete(id);
    return true;
  }

  get(id) { return this.items.get(id) || null; }
  size() { return this.items.size; }
  hasIndex(name) { return this.indexes.has(name); }

  // ---- Equality Queries ----
  getOne(indexName, value) {
    const idx = this.#requireIndex(indexName, "eq");
    const k = canonicalKey(value);
    if (idx.unique) {
      const id = idx.eq.map.get(k);
      return id != null ? this.items.get(id) : null;
    } else {
      const set = idx.eq.map.get(k);
      if (!set || set.size === 0) return null;
      const firstId = set.values().next().value;
      return this.items.get(firstId) || null;
    }
  }
  getAll(indexName, value) {
    // If no indexName provided, return all items
    if (!indexName) {
      return Array.from(this.items.values());
    }
    
    const idx = this.#requireIndex(indexName, "eq");
    const k = canonicalKey(value);
    if (idx.unique) {
      const id = idx.eq.map.get(k);
      return id != null ? [this.items.get(id)] : [];
    } else {
      const set = idx.eq.map.get(k);
      if (!set) return [];
      return Array.from(set, (id) => this.items.get(id));
    }
  }

  // ---- Range Queries ----
  between(indexName, min, max, { inclusiveMin = true, inclusiveMax = true } = {}) {
    const idx = this.#requireIndex(indexName, "range");
    const left = lowerBound(idx.range.arr, { value: min }, (a, b) => compositeCompare(a.value, b.value, idx.compare));

    const results = [];
    for (let i = left; i < idx.range.arr.length; i++) {
      const { value, id } = idx.range.arr[i];
      // stop condition
      const cUpper = compositeCompare(value, max, idx.compare);
      if (cUpper > 0 || (!inclusiveMax && cUpper === 0)) break;

      const cLower = compositeCompare(value, min, idx.compare);
      const geMin = cLower > 0 || (inclusiveMin && cLower === 0);
      if (geMin) results.push(this.items.get(id));
    }
    return results;
  }

  // ---- Prefix Queries ----
  startsWith(indexName, prefix) {
    const idx = this.#requireIndex(indexName, "prefix");
    const str = valueToString(prefix);
    const node = trieFindNode(idx.prefix.root, str);
    if (!node) return [];
    const out = [];
    trieCollect(node, (id) => out.push(this.items.get(id)));
    return out;
  }

  // ---- Persist / Snapshot ----
  serialize() {
    const indexDefs = [];
    for (const idx of this.indexes.values()) {
      indexDefs.push({
        name: idx.name,
        kind: idx.kind,
        unique: idx.unique,
        keySpec: serializeKeySpec(idx.keySpec)
      });
    }
    const payload = {
      primaryKey: this.primaryKey,
      indexDefs,
      items: Array.from(this.items.values())
    };
    return JSON.stringify(payload);
  }

  static deserialize(json) {
    const data = typeof json === "string" ? JSON.parse(json) : json;
    const coll = new Querium({ key: data.primaryKey });
    for (const def of data.indexDefs) {
      coll.defineIndex({
        name: def.name,
        kind: def.kind,
        unique: def.unique,
        key: deserializeKeySpec(def.keySpec)
      });
    }
    for (const obj of data.items) coll.insert(obj);
    return coll;
  }

  snapshot() {
    const snap = this.serialize();
    this._snapshots.push(snap);
    return snap;
  }

  rollback() {
    if (this._snapshots.length === 0) return false;
    const snap = this._snapshots.pop();
    const restored = Querium.deserialize(snap);
    // current instance'ı restore et
    this.primaryKey = restored.primaryKey;
    this.items = restored.items;
    this.indexes = restored.indexes;
    return true;
  }

  // ---- private ----
  #requireIndex(name, expectedKind) {
    const idx = this.indexes.get(name);
    if (!idx) throw new Error(`Index not found: '${name}'`);
    if (expectedKind && idx.kind !== expectedKind) {
      throw new Error(`Index '${name}' is not ${expectedKind}`);
    }
    return idx;
  }

  #addToIndex(idx, obj) {
    const id = obj[this.primaryKey];
    const raw = idx.keyGetter(obj); // primitive | array | string
    if (idx.kind === "eq") {
      const keyStr = canonicalKey(raw);
      if (idx.unique) {
        if (idx.eq.map.has(keyStr)) {
          throw new Error(`Unique constraint on '${idx.name}' violated for key ${keyStr}`);
        }
        idx.eq.map.set(keyStr, id);
      } else {
        const set = idx.eq.map.get(keyStr) || new Set();
        set.add(id);
        idx.eq.map.set(keyStr, set);
      }
    } else if (idx.kind === "range") {
      const value = normalizeComposite(raw);
      const node = { value, id };
      const pos = lowerBound(idx.range.arr, node, (a, b) =>
        compositeCompare(a.value, b.value, idx.compare) || defaultCompare(a.id, b.id)
      );
      idx.range.arr.splice(pos, 0, node);
    } else if (idx.kind === "prefix") {
      const str = valueToString(raw);
      trieInsert(idx.prefix.root, str, id);
    }
  }

  #removeFromIndex(idx, obj) {
    const id = obj[this.primaryKey];
    const raw = idx.keyGetter(obj);
    if (idx.kind === "eq") {
      const keyStr = canonicalKey(raw);
      if (idx.unique) {
        if (idx.eq.map.get(keyStr) === id) idx.eq.map.delete(keyStr);
      } else {
        const set = idx.eq.map.get(keyStr);
        if (set) {
          set.delete(id);
          if (set.size === 0) idx.eq.map.delete(keyStr);
        }
      }
    } else if (idx.kind === "range") {
      const value = normalizeComposite(raw);
      const arr = idx.range.arr;
      let pos = lowerBound(arr, { value, id }, (a, b) => {
        const c = compositeCompare(a.value, b.value, idx.compare);
        return c !== 0 ? c : defaultCompare(a.id, b.id);
      });
      // ileri tarafta tara
      while (pos < arr.length && compositeCompare(arr[pos].value, value, idx.compare) === 0) {
        if (arr[pos].id === id) { arr.splice(pos, 1); return; }
        pos++;
      }
      // fallback linear
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].id === id && compositeCompare(arr[i].value, value, idx.compare) === 0) {
          arr.splice(i, 1); return;
        }
      }
    } else if (idx.kind === "prefix") {
      const str = valueToString(raw);
      trieRemove(idx.prefix.root, str, id);
    }
  }
}

/* ---------------- helpers ---------------- */
function isPlainObject(x) {
  return Object.prototype.toString.call(x) === "[object Object]";
}
function makeKeyGetter(spec) {
  if (typeof spec === "function") return spec;
  if (Array.isArray(spec)) {
    return (o) => spec.map(k => getByKey(o, k));
  }
  return (o) => getByKey(o, spec);
}
function getByKey(obj, key) {
  if (typeof key !== "string") return obj[key];
  if (!key.includes(".")) return obj[key];
  return key.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}
function defaultCompare(a, b) {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a < b ? -1 : 1;
}
function normalizeComposite(v) {
  return Array.isArray(v) ? v.slice() : v;
}
function compositeCompare(a, b, cmp = defaultCompare) {
  const A = normalizeComposite(a), B = normalizeComposite(b);
  const aArr = Array.isArray(A), bArr = Array.isArray(B);
  if (!aArr && !bArr) return cmp(A, B);
  // lexicographic for arrays
  const len = Math.min(A.length, B.length);
  for (let i = 0; i < len; i++) {
    const c = cmp(A[i], B[i]);
    if (c !== 0) return c;
  }
  return defaultCompare(A.length, B.length);
}
function canonicalKey(v) {
  // primitive -> JSON.stringify; array -> JSON.stringify of array (stable)
  return JSON.stringify(v);
}
function lowerBound(arr, target, cmp) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cmp(arr[mid], target) < 0) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/* ---------- Simple Trie for prefix index ---------- */
function makeTrieNode() { return { children: new Map(), ids: new Set() }; }
function valueToString(v) {
  if (Array.isArray(v)) return v.map(valueToString).join(" "); // composite -> "a b"
  if (v == null) return "";
  return String(v);
}
function trieInsert(root, str, id) {
  let node = root;
  for (const ch of str) {
    if (!node.children.has(ch)) node.children.set(ch, makeTrieNode());
    node = node.children.get(ch);
    node.ids.add(id); 
  }
}
function trieFindNode(root, prefix) {
  let node = root;
  for (const ch of prefix) {
    node = node.children.get(ch);
    if (!node) return null;
  }
  return node;
}
function trieCollect(node, visit) {
  for (const id of node.ids) visit(id);
}
function trieRemove(root, str, id) {
  const stack = [];
  let node = root;
  for (const ch of str) {
    const next = node.children.get(ch);
    if (!next) return;
    stack.push([node, ch, next]);
    node = next;
  }

  for (let i = stack.length - 1; i >= 0; i--) {
    const [parent, ch, cur] = stack[i];
    cur.ids.delete(id);
    if (cur.ids.size === 0 && cur.children.size === 0) {
      parent.children.delete(ch);
    }
  }
}

/* ---------- Persist helpers ---------- */
function serializeKeySpec(spec) {
  if (typeof spec === "function") {
    return { t: "fn" };
  }
  if (Array.isArray(spec)) return { t: "arr", v: spec };
  return { t: "str", v: spec };
}
function deserializeKeySpec(obj) {
  if (obj.t === "fn") {
    throw new Error("Cannot deserialize function keySpec. Provide key as string/array.");
  }
  return obj.t === "arr" ? obj.v : obj.v;
}

module.exports = { Querium };