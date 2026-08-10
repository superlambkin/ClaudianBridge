import { describe, it, expect } from 'vitest';
import { normalizeGet, normalizeList, normalizeQuery, normalizeSql } from "../../../src/features/chroma/chroma/ResultNormalizer";

describe('chroma/chroma/ResultNormalizer', () => {
  it('normalizeList: ok envelope', () => {
    const raw = {
      ok: true,
      data: {
        collections: [
          { name: "foo", count: 10, metadata: { tag: "x" } },
          { name: "bar", count: null, metadata: null },
        ],
      },
      error: null,
    };
    const r = normalizeList(raw);
    expect(r.collections.length).toBe(2);
    expect(r.collections[0].name).toBe("foo");
    expect(r.collections[0].count).toBe(10);
    expect(r.collections[1].count).toBe(null);
  });

  it('normalizeList: error envelope throws', () => {
    expect(() => normalizeList({ ok: false, data: null, error: "bad" })).toThrow(/bad/);
  });

  it('normalizeGet: missing fields → null', () => {
    const raw = {
      ok: true,
      data: { records: [{ id: "a" }], total: 1 },
      error: null,
    };
    const r = normalizeGet(raw);
    expect(r.records[0].id).toBe("a");
    expect(r.records[0].metadata).toBe(null);
    expect(r.records[0].document).toBe(null);
    expect(r.records[0].distance).toBe(null);
  });

  it('normalizeQuery: distance present', () => {
    const raw = {
      ok: true,
      data: {
        records: [
          { id: "a", metadata: {}, document: "doc", distance: 0.1234 },
        ],
        total: 1,
        queryText: "q",
      },
      error: null,
    };
    const r = normalizeQuery(raw);
    expect(r.records[0].distance).toBe(0.1234);
    expect(r.queryText).toBe("q");
  });

  it('normalizeSql: rows + columns', () => {
    const raw = {
      ok: true,
      data: {
        columns: ["id", "name"],
        rows: [{ id: 1, name: "foo" }, { id: 2, name: "bar" }],
        truncated: false,
      },
      error: null,
    };
    const r = normalizeSql(raw);
    expect(r.columns).toEqual(["id", "name"]);
    expect(r.rows.length).toBe(2);
    expect(r.truncated).toBe(false);
  });

  it('normalizeSql: missing columns → empty', () => {
    const raw = { ok: true, data: {}, error: null };
    const r = normalizeSql(raw);
    expect(r.columns).toEqual([]);
    expect(r.rows).toEqual([]);
  });
});
