/**
 * Tests for class instrumentation scenarios
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ServiceTracer, getGlobalTracer } from '../../lib/service-tracer.js';
import { transformSource, findExports, hasExports, extractModuleName } from '../../lib/transform.js';

describe('Class Instrumentation', () => {
  let tracer;

  beforeEach(() => {
    tracer = new ServiceTracer({ enabled: true });
  });

  afterEach(() => {
    tracer.clearTraces();
  });

  describe('transform.js - Export Detection', () => {
    it('detects class exports', () => {
      const source = `
        export class Calculator {
          add(a, b) { return a + b; }
        }
      `;
      expect(hasExports(source)).toBe(true);
      const exports = findExports(source);
      expect(exports).toHaveLength(1);
      expect(exports[0]).toEqual({ name: 'Calculator', type: 'class', declaration: 'inline' });
    });

    it('detects multiple class exports', () => {
      const source = `
        export class Calculator {}
        export class Parser {}
      `;
      const exports = findExports(source);
      expect(exports).toHaveLength(2);
      expect(exports.map(e => e.name)).toEqual(['Calculator', 'Parser']);
    });

    it('detects mixed exports (class and function)', () => {
      const source = `
        export class Calculator {}
        export function helper() {}
        export const util = () => {};
      `;
      const exports = findExports(source);
      expect(exports).toHaveLength(3);
      expect(exports.map(e => e.type)).toContain('class');
      expect(exports.map(e => e.type)).toContain('function');
      expect(exports.map(e => e.type)).toContain('const');
    });

    it('extracts module name from file path', () => {
      expect(extractModuleName('/path/to/calculator.js')).toBe('Calculator');
      expect(extractModuleName('/path/to/user-service.ts')).toBe('User-service');
      expect(extractModuleName('file:///path/to/MyClass.mjs')).toBe('MyClass');
    });
  });

  describe('transform.js - Code Transformation', () => {
    it('transforms class export with tracer injection', () => {
      const source = `export class Calculator {
  add(a, b) { return a + b; }
}`;
      const transformed = transformSource(source, 'Calculator', 'taist/lib/service-tracer.js');

      // Should contain tracer import
      expect(transformed).toContain('import { getGlobalTracer');
      // Should keep original class export (preserves hoisting for circular deps)
      expect(transformed).toContain('export class Calculator');
      // Should instrument class in-place at the end
      expect(transformed).toContain('__taist_instrumentClass(Calculator');
    });

    it('transforms class with default export', () => {
      const source = `export class Calculator {
  add(a, b) { return a + b; }
}
export default Calculator;`;
      const transformed = transformSource(source, 'Calculator', 'taist/lib/service-tracer.js');

      // Class default export should be kept in place (preserves hoisting)
      expect(transformed).toContain('export default Calculator');
      // Should instrument class in-place
      expect(transformed).toContain('__taist_instrumentClass(Calculator');
    });

    it('transforms function export correctly', () => {
      const source = `export function add(a, b) {
  return a + b;
}`;
      const transformed = transformSource(source, 'Utils', 'taist/lib/service-tracer.js');

      // Should rename original function
      expect(transformed).toContain('function __taist_orig_add');
      // Should export wrapped function
      expect(transformed).toContain('export const add = __taist_wrap(__taist_orig_add');
    });

    it('transforms arrow function export correctly', () => {
      const source = `export const multiply = (a, b) => a * b;`;
      const transformed = transformSource(source, 'Utils', 'taist/lib/service-tracer.js');

      // Should rename original
      expect(transformed).toContain('const __taist_orig_multiply');
      // Should export wrapped
      expect(transformed).toContain('export const multiply = __taist_wrap(__taist_orig_multiply');
    });

    it('returns unchanged source when no exports', () => {
      const source = `function internal() { return 42; }`;
      const transformed = transformSource(source, 'Utils', 'taist/lib/service-tracer.js');
      expect(transformed).toBe(source);
    });

    it('transforms object literal export with nested methods', () => {
      const source = `export const resolvers = {
  Query: {
    getUser(parent, args) { return { id: args.id }; }
  },
  Mutation: {
    async createUser(parent, args) { return { id: 1 }; }
  }
};`;
      const transformed = transformSource(source, 'Resolvers', 'taist/lib/service-tracer.js');

      // Should contain tracer import
      expect(transformed).toContain('import { getGlobalTracer');
      // Should rename original to __taist_orig_
      expect(transformed).toContain('const __taist_orig_resolvers');
      // Should re-export wrapped version (build-time instrumentation)
      expect(transformed).toContain('export const resolvers = __taist_instrumentObject(__taist_orig_resolvers');
      // Should contain the instrumentObject helper
      expect(transformed).toContain('const __taist_instrumentObject');
    });

    it('detects object literal exports in findExports', () => {
      const source = `export const config = { setting: true };
export const handlers = {
  onClick() { console.log('clicked'); }
};`;
      const exports = findExports(source);
      expect(exports).toHaveLength(2);
      expect(exports.map(e => e.name)).toContain('config');
      expect(exports.map(e => e.name)).toContain('handlers');
      expect(exports.filter(e => e.type === 'object')).toHaveLength(2);
    });
  });

  describe('ServiceTracer.instrument() - Class Methods', () => {
    it('instruments sync methods correctly', () => {
      class Calculator {
        add(a, b) { return a + b; }
        multiply(a, b) { return a * b; }
      }

      tracer.instrument(Calculator, 'Calculator');
      const calc = new Calculator();

      expect(calc.add(2, 3)).toBe(5);
      expect(calc.multiply(4, 5)).toBe(20);

      const traces = tracer.getTraces();
      expect(traces.filter(t => t.type === 'enter')).toHaveLength(2);
    });

    it('instruments async methods correctly', async () => {
      class AsyncService {
        async fetchData(id) {
          return { id, data: 'test' };
        }
      }

      tracer.instrument(AsyncService, 'AsyncService');
      const service = new AsyncService();

      const result = await service.fetchData(123);
      expect(result).toEqual({ id: 123, data: 'test' });

      const traces = tracer.getTraces();
      const entries = traces.filter(t => t.type === 'enter');
      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe('AsyncService.fetchData');
    });

    it('preserves sync return values (not Promises)', () => {
      class Calculator {
        add(a, b) { return a + b; }
      }

      tracer.instrument(Calculator, 'Calculator');
      const calc = new Calculator();

      const result = calc.add(2, 3);
      // Result should be a number, not a Promise
      expect(typeof result).toBe('number');
      expect(result).toBe(5);
    });

    it('handles recursive method calls with depth tracking', () => {
      // Use a tracer with higher depth limit for this test
      const deepTracer = new ServiceTracer({ enabled: true, depth: 10 });

      class Math {
        factorial(n) {
          if (n <= 1) return 1;
          return n * this.factorial(n - 1);
        }
      }

      deepTracer.instrument(Math, 'Math');
      const math = new Math();

      const result = math.factorial(5);
      expect(result).toBe(120);

      const entries = deepTracer.getTraces().filter(t => t.type === 'enter');
      // Should have 5 calls for factorial(5)
      expect(entries).toHaveLength(5);
      // Depth should increase for recursive calls
      expect(entries.map(e => e.depth)).toEqual([0, 1, 2, 3, 4]);

      deepTracer.clearTraces();
    });

    it('captures errors in methods', () => {
      class Validator {
        validate(value) {
          if (!value) {
            throw new Error('Value is required');
          }
          return true;
        }
      }

      tracer.instrument(Validator, 'Validator');
      const validator = new Validator();

      expect(() => validator.validate(null)).toThrow('Value is required');

      const errors = tracer.getTraces().filter(t => t.type === 'error');
      expect(errors).toHaveLength(1);
      expect(errors[0].error.message).toBe('Value is required');
    });

    it('instruments static methods', () => {
      class Utils {
        static format(value) {
          return String(value).toUpperCase();
        }
      }

      tracer.instrument(Utils, 'Utils');

      const result = Utils.format('hello');
      expect(result).toBe('HELLO');

      const entries = tracer.getTraces().filter(t => t.type === 'enter');
      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe('Utils.format');
    });

    it('skips private methods (underscore prefix)', () => {
      class Service {
        publicMethod() { return this._privateMethod(); }
        _privateMethod() { return 'private'; }
      }

      tracer.instrument(Service, 'Service');
      const service = new Service();

      service.publicMethod();

      // Only publicMethod should be traced, not _privateMethod
      const entries = tracer.getTraces().filter(t => t.type === 'enter');
      expect(entries.map(e => e.name)).toContain('Service.publicMethod');
      expect(entries.map(e => e.name)).not.toContain('Service._privateMethod');
    });
  });

  describe('ServiceTracer.wrapMethod() - Function Wrapping', () => {
    it('wraps sync function preserving return value', () => {
      function add(a, b) { return a + b; }

      const wrapped = tracer.wrapMethod(add, 'Utils.add', 'add');
      const result = wrapped(2, 3);

      expect(result).toBe(5);
      expect(typeof result).toBe('number');
    });

    it('wraps async function preserving Promise', async () => {
      async function fetchData() { return { data: 'test' }; }

      const wrapped = tracer.wrapMethod(fetchData, 'API.fetchData', 'fetchData');
      const result = wrapped();

      // Result should be a Promise
      expect(result).toBeInstanceOf(Promise);
      expect(await result).toEqual({ data: 'test' });
    });

    it('captures arguments in trace', () => {
      function greet(name, age) { return `Hello ${name}, age ${age}`; }

      const wrapped = tracer.wrapMethod(greet, 'Utils.greet', 'greet');
      wrapped('Alice', 30);

      const entry = tracer.getTraces().find(t => t.type === 'enter');
      expect(entry.args).toEqual(['Alice', 30]);
    });

    it('captures return value in trace', () => {
      function double(n) { return n * 2; }

      const wrapped = tracer.wrapMethod(double, 'Utils.double', 'double');
      wrapped(21);

      const exit = tracer.getTraces().find(t => t.type === 'exit');
      expect(exit.result).toBe(42);
    });
  });
});
