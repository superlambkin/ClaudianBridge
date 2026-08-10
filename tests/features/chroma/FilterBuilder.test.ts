import { describe, it, expect } from 'vitest';
import { buildWhere, buildWhereJson, parseCsv } from "../../../src/features/chroma/chroma/FilterBuilder";
import type { FilterSpec } from "../../../src/features/chroma/types";

function emptyFilter(): FilterSpec {
  return {
    metadataEqual: {},
    metadataIn: {},
    documentContains: "",
    queryText: "",
    nResults: 5,
  };
}

describe('chroma/chroma/FilterBuilder', () => {
  it('empty filter → null', () => {
    const { where, whereDocument } = buildWhere(emptyFilter());
    expect(where).toBeNull();
    expect(whereDocument).toBeNull();
  });

  it('metadataEqual single field', () => {
    const f: FilterSpec = {
      ...emptyFilter(),
      metadataEqual: { source: "foo.pdf" },
    };
    expect(buildWhere(f).where).toEqual({ source: "foo.pdf" });
  });

  it('metadataEqual multiple fields → $and', () => {
    const f: FilterSpec = {
      ...emptyFilter(),
      metadataEqual: { source: "foo.pdf", type: "pdf" },
    };
    expect(buildWhere(f).where).toEqual({
      $and: [{ source: "foo.pdf" }, { type: "pdf" }],
    });
  });

  it('metadataIn emits $in', () => {
    const f: FilterSpec = {
      ...emptyFilter(),
      metadataIn: { page: [1, 3, 5] },
    };
    expect(buildWhere(f).where).toEqual({ page: { $in: [1, 3, 5] } });
  });

  it('documentContains → $contains', () => {
    const f: FilterSpec = { ...emptyFilter(), documentContains: "HDMI" };
    expect(buildWhere(f).whereDocument).toEqual({ $contains: "HDMI" });
  });

  it('documentContains trimmed, empty', () => {
    const f: FilterSpec = { ...emptyFilter(), documentContains: "   " };
    expect(buildWhere(f).whereDocument).toBeNull();
  });

  it('metadataEqual empty string skipped', () => {
    const f: FilterSpec = {
      ...emptyFilter(),
      metadataEqual: { source: "" },
    };
    expect(buildWhere(f).where).toBeNull();
  });

  it('buildWhereJson stringifies correctly', () => {
    const f: FilterSpec = {
      ...emptyFilter(),
      metadataEqual: { source: "foo.pdf" },
    };
    expect(buildWhereJson(f)).toBe('{"source":"foo.pdf"}');
  });

  it('parseCsv splits + trims + drops empties', () => {
    expect(parseCsv("1, 3 ,,5")).toEqual(["1", "3", "5"]);
  });

  it('parseCsv empty → []', () => {
    expect(parseCsv("")).toEqual([]);
  });

  it('buildWhereJson: all-empty filter returns null (caller must skip --where)', () => {
    expect(buildWhereJson(emptyFilter())).toBe(null);
  });

  it('buildWhereJson: only documentContains returns null for where', () => {
    const f: FilterSpec = { ...emptyFilter(), documentContains: "HDMI" };
    expect(buildWhereJson(f)).toBe(null);
  });
});
