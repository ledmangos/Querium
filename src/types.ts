/**
 * TypeScript type definitions for Querium
 */

export type IndexKind = 'eq' | 'range' | 'prefix';

export interface IndexDefinition {
  name: string;
  key: string | string[] | ((obj: any) => any);
  unique?: boolean;
  kind?: IndexKind;
  compare?: (a: any, b: any) => number;
}

export interface IndexStorage {
  eq: { map: Map<string, any> };
  range: { arr: Array<{ value: any; id: any }> };
  prefix: { root: TrieNode };
}

export interface TrieNode {
  children: Map<string, TrieNode>;
  ids: Set<any>;
}

export interface Snapshot<T = any> {
  timestamp: number;
  data: Map<string | number, T>;
  indexes: Map<string, any>;
}

export interface QueryOptions {
  inclusiveMin?: boolean;
  inclusiveMax?: boolean;
}

export interface SerializedIndexDef {
  name: string;
  kind: IndexKind;
  unique: boolean;
  keySpec: SerializedKeySpec;
}

export interface SerializedKeySpec {
  t: 'fn' | 'arr' | 'str';
  v?: any;
}

export interface SerializedData<T = any> {
  primaryKey: string;
  indexDefs: SerializedIndexDef[];
  items: T[];
}

// Main class interface
export interface IQuerium<T extends Record<string, any> = Record<string, any>> {
  primaryKey: string;
  items: Map<string | number, T>;
  indexes: Map<string, any>;
  
  defineIndex(definition: IndexDefinition): this;
  insert(obj: T): string | number;
  upsert(obj: T): string | number;
  update(id: string | number, patchOrNewObj: Partial<T> | T): T;
  remove(id: string | number): boolean;
  get(id: string | number): T | null;
  size(): number;
  hasIndex(name: string): boolean;
  
  getOne(indexName: string, value: any): T | null;
  getAll(indexName: string, value: any): T[];
  between(indexName: string, min: any, max: any, options?: QueryOptions): T[];
  startsWith(indexName: string, prefix: string): T[];
  
  serialize(): string;
  snapshot(): string;
  rollback(): boolean;
}

// Static method interface
export interface QueriumConstructor {
  new<T extends Record<string, any> = Record<string, any>>(options: { key: string }): IQuerium<T>;
  deserialize<T extends Record<string, any> = Record<string, any>>(json: string | SerializedData<T>): IQuerium<T>;
}
