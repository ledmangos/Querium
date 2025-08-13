import { Querium } from './Querium.js';

describe('Querium', () => {
  let users: Querium;
  let simpleUsers: Querium;

  beforeEach(() => {
    users = new Querium({ key: "id" });
    
    // Define indexes
    users
      .defineIndex({ name: "byCityAge", kind: "eq", key: ["city", "age"] })
      .defineIndex({ name: "rangeCityAge", kind: "range", key: ["city", "age"] })
      .defineIndex({ name: "byNamePrefix", kind: "prefix", key: "name" });

    // Insert test data
    users.insert({ id: 1, city: "Ankara", age: 28, name: "firat" });
    users.insert({ id: 2, city: "Ankara", age: 31, name: "fidan" });
    users.insert({ id: 3, city: "İzmir", age: 25, name: "faruk" });

    // Simple users for basic example tests
    simpleUsers = new Querium({ key: "id" });
    simpleUsers.defineIndex({ name: "byEmail", key: "email", unique: true, kind: "eq" });
    simpleUsers.defineIndex({ name: "byAge", key: "age", unique: false, kind: "range" });
    
    simpleUsers.insert({ id: 1, email: "a@x.com", age: 24, username: "alice" });
    simpleUsers.insert({ id: 2, email: "b@x.com", age: 31, username: "bob" });
    simpleUsers.insert({ id: 3, email: "c@x.com", age: 29, username: "carol" });
  });

  describe('Basic Example Operations', () => {
    test('should work with simple email and age indexes', () => {
      // Test email equality index
      const carol = simpleUsers.getOne("byEmail", "c@x.com");
      expect(carol?.["username"]).toBe("carol");
      
      // Test age range index
      const midAges = simpleUsers.between("byAge", 25, 35);
      expect(midAges).toHaveLength(2);
      expect(midAges.map(x => x["username"]).sort()).toEqual(["bob", "carol"]);
    });

    test('should update and maintain indexes correctly', () => {
      // Update age
      simpleUsers.update(3, { age: 33 });
      expect(simpleUsers.get(3)?.["age"]).toBe(33);
      
      // Verify range index still works
      const midAges = simpleUsers.between("byAge", 25, 35);
      expect(midAges).toHaveLength(2);
      expect(midAges.find(x => x["id"] === 3)?.["age"]).toBe(33);
    });

    test('should remove items and maintain indexes', () => {
      simpleUsers.remove(2);
      expect(simpleUsers.size()).toBe(2);
      
      // Verify range index still works
      const midAges = simpleUsers.between("byAge", 25, 35);
      expect(midAges).toHaveLength(1);
      expect(midAges[0]?.["username"]).toBe("carol");
    });
  });

  describe('Basic Operations', () => {
    test('should insert items correctly', () => {
      expect(users.size()).toBe(3);
      expect(users.get(1)).toEqual({ id: 1, city: "Ankara", age: 28, name: "firat" });
    });

    test('should update items correctly', () => {
      users.update(1, { age: 29 });
      expect(users.get(1)?.["age"]).toBe(29);
    });

    test('should remove items correctly', () => {
      expect(users.remove(2)).toBe(true);
      expect(users.size()).toBe(2);
      expect(users.get(2)).toBeNull();
    });
  });

  describe('Equality Index', () => {
    test('should query by composite equality index', () => {
      const results = users.getAll("byCityAge", ["Ankara", 31]);
      expect(results).toHaveLength(1);
      expect(results[0]?.["id"]).toBe(2);
    });

    test('should return empty array for non-existent values', () => {
      const results = users.getAll("byCityAge", ["İstanbul", 30]);
      expect(results).toHaveLength(0);
    });
  });

  describe('Range Index', () => {
    test('should query by range index', () => {
      // Test age range within same city
      const results = users.between("rangeCityAge", ["Ankara", 25], ["Ankara", 35]);
      expect(results).toHaveLength(2);
      expect(results.map(x => x["id"]).sort()).toEqual([1, 2]);
    });

    test('should respect inclusive/exclusive bounds', () => {
      // Test with exclusive bounds - should include age 31 but not 30 or 35
      const results = users.between("rangeCityAge", ["Ankara", 30], ["Ankara", 35], { 
        inclusiveMin: false, 
        inclusiveMax: false 
      });
      expect(results).toHaveLength(1); // Only age 31 (between 30-35 exclusive)
      expect(results[0]?.["id"]).toBe(2); // User with age 31
    });
  });

  describe('Prefix Index', () => {
    test('should query by prefix', () => {
      const results = users.startsWith("byNamePrefix", "fi");
      expect(results).toHaveLength(2);
      expect(results.map(x => x["name"]).sort()).toEqual(["fidan", "firat"]);
    });

    test('should return empty array for non-matching prefix', () => {
      const results = users.startsWith("byNamePrefix", "xyz");
      expect(results).toHaveLength(0);
    });
  });

  describe('Snapshot and Rollback', () => {
    test('should create snapshot and rollback', () => {
      users.snapshot();
      users.remove(2);
      expect(users.size()).toBe(2);
      
      users.rollback();
      expect(users.size()).toBe(3);
      expect(users.get(2)).toBeTruthy();
    });
  });

  describe('Serialization', () => {
    test('should serialize and deserialize correctly', () => {
      const serialized = users.serialize();
      const restored = Querium.deserialize(serialized);
      
      expect(restored.size()).toBe(users.size());
      expect(restored.getAll("byCityAge", ["Ankara", 31])).toHaveLength(1);
    });
  });

  describe('Error Handling', () => {
    test('should throw error for duplicate primary key', () => {
      expect(() => {
        users.insert({ id: 1, city: "İstanbul", age: 30, name: "test" });
      }).toThrow('Duplicate primary key');
    });

    test('should throw error for missing primary key', () => {
      expect(() => {
        users.insert({ city: "İstanbul", age: 30, name: "test" });
      }).toThrow('Missing primary key');
    });

    test('should throw error for non-existent index', () => {
      expect(() => {
        users.getAll("nonExistentIndex", "value");
      }).toThrow('Index not found');
    });
  });
});
