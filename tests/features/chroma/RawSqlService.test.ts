import { describe, it, expect } from 'vitest';
import { isReadOnlySelect } from "../../../src/features/chroma/chroma/RawSqlService";

describe('chroma/chroma/RawSqlService', () => {
  it('SELECT statement passes', () => {
    expect(isReadOnlySelect("SELECT * FROM collections").ok).toBe(true);
  });

  it('WITH ... SELECT passes', () => {
    expect(isReadOnlySelect("WITH c AS (SELECT 1) SELECT * FROM c").ok).toBe(true);
  });

  it('INSERT rejected', () => {
    const r = isReadOnlySelect("INSERT INTO foo VALUES (1)");
    expect(r.ok).toBe(false);
  });

  it('UPDATE rejected', () => {
    const r = isReadOnlySelect("UPDATE foo SET bar = 1");
    expect(r.ok).toBe(false);
  });

  it('DELETE rejected', () => {
    const r = isReadOnlySelect("DELETE FROM foo");
    expect(r.ok).toBe(false);
  });

  it('DROP rejected', () => {
    const r = isReadOnlySelect("DROP TABLE foo");
    expect(r.ok).toBe(false);
  });

  it('Multiple statements rejected', () => {
    const r = isReadOnlySelect("SELECT 1; SELECT 2");
    expect(r.ok).toBe(false);
  });

  it('Empty SQL rejected', () => {
    expect(isReadOnlySelect("").ok).toBe(false);
  });

  it('SELECT with banned keyword rejected', () => {
    const r = isReadOnlySelect("SELECT * FROM foo; DROP TABLE foo");
    expect(r.ok).toBe(false);
  });
});
