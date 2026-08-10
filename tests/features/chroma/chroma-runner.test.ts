import { describe, it, expect } from 'vitest';
import { detectDimensionError, parsePythonError } from "../../../src/features/chroma/chroma/chroma-runner";

describe('chroma/chroma-runner', () => {
  it('detectDimensionError: standard chroma message', () => {
    const err = detectDimensionError(
      "InvalidArgumentError: Collection expecting embedding with dimension of 1024, got 384"
    );
    expect(err !== null).toBe(true);
    expect(err!.expectedDim).toBe(1024);
    expect(err!.gotDim).toBe(384);
  });

  it('detectDimensionError: reversed wording', () => {
    const err = detectDimensionError("got 384, expected 1024");
    // Not matched by our regex; we should return null (not over-aggressive).
    expect(err === null).toBe(true);
  });

  it('detectDimensionError: unrelated error', () => {
    expect(detectDimensionError("ModuleNotFoundError: No module named 'foo'") === null).toBe(true);
  });

  it('detectDimensionError: empty string', () => {
    expect(detectDimensionError("") === null).toBe(true);
  });

  it('parsePythonError: empty stdout/stderr + non-zero exit', () => {
    const msg = parsePythonError({ exitCode: 2, stdout: "", stderr: "" });
    expect(msg).toContain("2");
  });

  it('parsePythonError: spawn-kill sentinel', () => {
    const msg = parsePythonError({ exitCode: -1, stdout: "", stderr: "" });
    expect(msg.toLowerCase()).toContain("python process");
  });

  it('parsePythonError: prefer JSON envelope error', () => {
    const msg = parsePythonError({
      exitCode: 1,
      stdout: JSON.stringify({ ok: false, data: null, error: "ENVELOPE_ERR" }),
      stderr: "noise from stderr",
    });
    expect(msg).toBe("ENVELOPE_ERR");
  });
});
