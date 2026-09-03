import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FIRST_RUN_GUIDE_STORAGE_KEY,
  hasSeenFirstRunGuide,
  markFirstRunGuideSeen,
} from './first-run-storage.js';

describe('first-run-storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports the guide as unseen in a browser that has never shown it', () => {
    expect(hasSeenFirstRunGuide()).toBe(false);
  });

  it('remembers the guide once it has been shown', () => {
    markFirstRunGuideSeen();
    expect(hasSeenFirstRunGuide()).toBe(true);
    expect(localStorage.getItem(FIRST_RUN_GUIDE_STORAGE_KEY)).not.toBeNull();
  });

  it('is idempotent -- marking it twice is still one dismissal', () => {
    markFirstRunGuideSeen();
    const first = localStorage.getItem(FIRST_RUN_GUIDE_STORAGE_KEY);
    markFirstRunGuideSeen();
    expect(localStorage.getItem(FIRST_RUN_GUIDE_STORAGE_KEY)).toBe(first);
  });

  it('treats a throwing localStorage as "not seen" rather than crashing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: storage is disabled in this context');
    });
    expect(() => hasSeenFirstRunGuide()).not.toThrow();
    expect(hasSeenFirstRunGuide()).toBe(false);
  });

  it('never crashes when localStorage refuses a write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => {
      markFirstRunGuideSeen();
    }).not.toThrow();
  });
});
