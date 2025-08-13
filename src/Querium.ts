import { 
  IndexDefinition, 
  IndexKind, 
  IQuerium, 
  QueryOptions,
  SerializedData,
  TrieNode
} from './types';

/**
 * Querium - In-memory collection with multi-key indexes
 * Supports equality, range, and prefix indexes with snapshot/rollback and persistence
 */
export class Querium<T extends Record<string, any> = Record<string, any>> 
  implements IQuerium<T> {
  
  public primaryKey: string;
  public items: Map<string | number, T>;
  public indexes: Map<string, any>;
  private _snapshots: string[];

  constructor({ key = "id" } = {}) {
    this.primaryKey = key;
    this.items = new Map();
    this.indexes = new Map();
    this._snapshots = [];
  }

  // ---- Index Tanımı ----
  defineIndex(definition: IndexDefinition): this {
    const { name, key, unique = false, kind = "eq", compare } = definition;
    
    if (this.indexes.has(name)) throw new Error(`Index '${name}' already exists`);
    if (!["eq", "range", "prefix"].includes(kind)) throw new Error(`Invalid index kind: ${kind}`);

    const def = {
      name,
      keySpec: key,
      keyGetter: makeKeyGetter(key),
      unique,
      kind,
      compare: compare || defaultCompare,
      eq: { map: new Map() },
      range: { arr: [] },
      prefix: { root: makeTrieNode() },
    };

    if (kind === "prefix" && unique) {
      // Prefix index'te unique anlamsız, yok sayılıyor
    }

    this.indexes.set(name, def);
    for (const obj of this.items.values()) this.addToIndex(def, obj);
    return this;
  }

  // ---- CRUD ----
  insert(obj: T): string | number {
    const id = obj[this.primaryKey];
    if (id == null) throw new Error(`Missing primary key '${this.primaryKey}'`);
    if (this.items.has(id)) throw new Error(`Duplicate primary key '${id}'`);
    
    this.items.set(id, obj);
    for (const idx of this.indexes.values()) this.addToIndex(idx, obj);
    return id;
  }

  upsert(obj: T): string | number {
    const id = obj[this.primaryKey];
    if (id == null) throw new Error(`Missing primary key '${this.primaryKey}'`);
    if (this.items.has(id)) { 
      this.update(id, obj); 
      return id; 
    }
    return this.insert(obj);
  }

  update(id: string | number, patchOrNewObj: Partial<T> | T): T {
    if (!this.items.has(id)) throw new Error(`No item with id '${id}'`);
    const prev = this.items.get(id)!;
    const next = isPlainObject(patchOrNewObj)
      ? { ...prev, ...patchOrNewObj, [this.primaryKey]: id } as T
      : patchOrNewObj as T;

    for (const idx of this.indexes.values()) this.removeFromIndex(idx, prev);
    this.items.set(id, next);
    for (const idx of this.indexes.values()) this.addToIndex(idx, next);
    return next;
  }

  remove(id: string | number): boolean {
    const obj = this.items.get(id);
    if (!obj) return false;
    
    for (const idx of this.indexes.values()) this.removeFromIndex(idx, obj);
    this.items.delete(id);
    return true;
  }

  get(id: string | number): T | null { 
    return this.items.get(id) || null; 
  }
  
  size(): number { 
    return this.items.size; 
  }
  
  hasIndex(name: string): boolean { 
    return this.indexes.has(name); 
  }

  // ---- Equality Queries ----
  getOne(indexName: string, value: any): T | null {
    const idx = this.requireIndex(indexName, "eq");
    const k = canonicalKey(value);
    
    if (idx.unique) {
      const id = idx.eq.map.get(k);
      return id != null ? this.items.get(id) || null : null;
    } else {
      const set = idx.eq.map.get(k);
      if (!set || set.size === 0) return null;
      const firstId = set.values().next().value;
      return this.items.get(firstId) || null;
    }
  }

  getAll(indexName?: string, value?: any): T[] {
    // If no indexName provided, return all items
    if (!indexName) {
      return Array.from(this.items.values());
    }
    
    const idx = this.requireIndex(indexName, "eq");
    const k = canonicalKey(value);
    
    if (idx.unique) {
      const id = idx.eq.map.get(k);
      return id != null ? [this.items.get(id)!] : [];
    } else {
      const set = idx.eq.map.get(k);
      if (!set) return [];
      return Array.from(set, (id: any) => this.items.get(id)!);
    }
  }

  // ---- Range Queries ----
  between(indexName: string, min: any, max: any, options: QueryOptions = {}): T[] {
    const { inclusiveMin = true, inclusiveMax = true } = options;
    const idx = this.requireIndex(indexName, "range");
    
    const left = lowerBound(idx.range.arr, { value: min }, (a: any, b: any) => 
      compositeCompare(a.value, b.value, idx.compare)
    );

    const results: T[] = [];
    for (let i = left; i < idx.range.arr.length; i++) {
      const { value, id } = idx.range.arr[i];
      const cUpper = compositeCompare(value, max, idx.compare);
      if (cUpper > 0 || (!inclusiveMax && cUpper === 0)) break;

      const cLower = compositeCompare(value, min, idx.compare);
      const geMin = cLower > 0 || (inclusiveMin && cLower === 0);
      if (geMin) results.push(this.items.get(id)!);
    }
    return results;
  }

  // ---- Prefix Queries ----
  startsWith(indexName: string, prefix: string): T[] {
    const idx = this.requireIndex(indexName, "prefix");
    const str = valueToString(prefix);
    const node = trieFindNode(idx.prefix.root, str);
    if (!node) return [];
    
    const out: T[] = [];
    trieCollect(node, (id: any) => out.push(this.items.get(id)!));
    return out;
  }

  // ---- Persist / Snapshot ----
  serialize(): string {
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

  static deserialize<T extends Record<string, any> = Record<string, any>>(
    json: string | SerializedData<T>
  ): Querium<T> {
    const data = typeof json === "string" ? JSON.parse(json) : json;
    const coll = new Querium<T>({ key: data.primaryKey });
    
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

  snapshot(): string {
    const snap = this.serialize();
    this._snapshots.push(snap);
    return snap;
  }

  rollback(): boolean {
    if (this._snapshots.length === 0) return false;
    const snap = this._snapshots.pop()!;
    const restored = Querium.deserialize(snap);
    
    this.primaryKey = restored.primaryKey;
    this.items = restored.items as Map<string | number, T>;
    this.indexes = restored.indexes;
    return true;
  }

  // ---- Private methods ----
  private requireIndex(name: string, expectedKind?: IndexKind): any {
    const idx = this.indexes.get(name);
    if (!idx) throw new Error(`Index not found: '${name}'`);
    if (expectedKind && idx.kind !== expectedKind) {
      throw new Error(`Index '${name}' is not ${expectedKind}`);
    }
    return idx;
  }

  private addToIndex(idx: any, obj: T): void {
    const id = obj[this.primaryKey];
    const raw = idx.keyGetter(obj);
    
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
      const pos = lowerBound(idx.range.arr, node, (a: any, b: any) =>
        compositeCompare(a.value, b.value, idx.compare) || defaultCompare(a.id, b.id)
      );
      idx.range.arr.splice(pos, 0, node);
    } else if (idx.kind === "prefix") {
      const str = valueToString(raw);
      trieInsert(idx.prefix.root, str, id);
    }
  }

  private removeFromIndex(idx: any, obj: T): void {
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
      let pos = lowerBound(arr, { value, id }, (a: any, b: any) => {
        const c = compositeCompare(a.value, b.value, idx.compare);
        return c !== 0 ? c : defaultCompare(a.id, b.id);
      });
      
      while (pos < arr.length && compositeCompare(arr[pos].value, value, idx.compare) === 0) {
        if (arr[pos].id === id) { arr.splice(pos, 1); return; }
        pos++;
      }
      
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

// Helper functions
function isPlainObject(x: any): boolean {
  return Object.prototype.toString.call(x) === "[object Object]";
}

function makeKeyGetter(spec: string | string[] | ((obj: any) => any)): (obj: any) => any {
  if (typeof spec === "function") return spec;
  if (Array.isArray(spec)) {
    return (o: any) => spec.map(k => getByKey(o, k));
  }
  return (o: any) => getByKey(o, spec);
}

function getByKey(obj: any, key: string): any {
  if (typeof key !== "string") return obj[key];
  if (!key.includes(".")) return obj[key];
  return key.split(".").reduce((acc: any, k: string) => (acc == null ? acc : acc[k]), obj);
}

function defaultCompare(a: any, b: any): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a < b ? -1 : 1;
}

function normalizeComposite(v: any): any {
  return Array.isArray(v) ? v.slice() : v;
}

function compositeCompare(a: any, b: any, cmp: (a: any, b: any) => number = defaultCompare): number {
  const A = normalizeComposite(a), B = normalizeComposite(b);
  const aArr = Array.isArray(A), bArr = Array.isArray(B);
  if (!aArr && !bArr) return cmp(A, B);
  
  const len = Math.min(A.length, B.length);
  for (let i = 0; i < len; i++) {
    const c = cmp(A[i], B[i]);
    if (c !== 0) return c;
  }
  return defaultCompare(A.length, B.length);
}

function canonicalKey(v: any): string {
  return JSON.stringify(v);
}

function lowerBound(arr: any[], target: any, cmp: (a: any, b: any) => number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cmp(arr[mid], target) < 0) lo = mid + 1; else hi = mid;
  }
  return lo;
}

// Trie functions
function makeTrieNode(): TrieNode { 
  return { children: new Map(), ids: new Set() }; 
}

function valueToString(v: any): string {
  if (Array.isArray(v)) return v.map(valueToString).join(" ");
  if (v == null) return "";
  return String(v);
}

function trieInsert(root: TrieNode, str: string, id: any): void {
  let node = root;
  for (const ch of str) {
    if (!node.children.has(ch)) node.children.set(ch, makeTrieNode());
    node = node.children.get(ch)!;
    node.ids.add(id);
  }
}

function trieFindNode(root: TrieNode, prefix: string): TrieNode | null {
  let node = root;
  for (const ch of prefix) {
    node = node.children.get(ch)!;
    if (!node) return null;
  }
  return node;
}

function trieCollect(node: TrieNode, visit: (id: any) => void): void {
  for (const id of node.ids) visit(id);
}

function trieRemove(root: TrieNode, str: string, id: any): void {
  const stack: [TrieNode, string, TrieNode][] = [];
  let node = root;
  
  for (const ch of str) {
    const next = node.children.get(ch);
    if (!next) return;
    stack.push([node, ch, next]);
    node = next;
  }
  
      for (let i = stack.length - 1; i >= 0; i--) {
      const item = stack[i];
      if (item) {
        const [parent, ch, cur] = item;
        cur.ids.delete(id);
        if (cur.ids.size === 0 && cur.children.size === 0) {
          parent.children.delete(ch);
        }
      }
    }
}

// Persist helpers
function serializeKeySpec(spec: string | string[] | ((obj: any) => any)): any {
  if (typeof spec === "function") {
    return { t: "fn" };
  }
  if (Array.isArray(spec)) return { t: "arr", v: spec };
  return { t: "str", v: spec };
}

function deserializeKeySpec(obj: any): string | string[] {
  if (obj.t === "fn") {
    throw new Error("Cannot deserialize function keySpec. Provide key as string/array.");
  }
  return obj.t === "arr" ? obj.v : obj.v;
}
