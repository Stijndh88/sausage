import { describe, expect, it } from 'vitest';
import pkg from '../package.json';
import { VERSION, versionLabel } from '../src/version';

describe('version', () => {
  it('comes from package.json and is semver', () => {
    expect(VERSION).toBe(pkg.version);
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('labels the build with its commit when known', () => {
    expect(versionLabel('1.2.3', 'abc1234')).toBe('v1.2.3 (abc1234)');
    expect(versionLabel('1.2.3', '')).toBe('v1.2.3');
  });
});
