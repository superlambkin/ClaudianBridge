import { describe, it, expect } from 'vitest';
import { formatImageGenError } from '../../../src/features/image-gen/types';

describe('formatImageGenError', () => {
  it('no_key', () => {
    expect(formatImageGenError({ kind: 'no_key', providerId: 'minimax' })).toContain('not configured');
    expect(formatImageGenError({ kind: 'no_key', providerId: 'minimax' })).toContain('minimax');
  });
  it('expired', () => {
    expect(formatImageGenError({ kind: 'expired', providerId: 'zhipu', httpStatus: 401 })).toContain('expired');
    expect(formatImageGenError({ kind: 'expired', providerId: 'zhipu', httpStatus: 401 })).toContain('401');
  });
  it('error', () => {
    expect(formatImageGenError({ kind: 'error', providerId: 'minimax', message: 'boom' })).toContain('boom');
    expect(formatImageGenError({ kind: 'error', providerId: 'minimax', httpStatus: 500, message: 'srv' })).toContain('500');
  });
});
