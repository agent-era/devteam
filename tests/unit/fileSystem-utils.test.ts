import {describe, test, expect} from '@jest/globals';
import {extractJsonObject, shellQuote} from '../../src/shared/utils/fileSystem.js';

describe('extractJsonObject', () => {
  test('returns pretty-printed JSON for a clean object', () => {
    const out = extractJsonObject('{"a":1,"b":[1,2]}');
    expect(out).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}');
  });

  test('strips ```json fences', () => {
    const out = extractJsonObject('```json\n{"x": 1}\n```');
    expect(out).not.toBeNull();
    expect(JSON.parse(out!)).toEqual({x: 1});
  });

  test('strips plain ``` fences', () => {
    const out = extractJsonObject('```\n{"x": 1}\n```');
    expect(JSON.parse(out!)).toEqual({x: 1});
  });

  test('tolerates leading and trailing prose', () => {
    const out = extractJsonObject('Here you go:\n{"ok": true}\nEnjoy!');
    expect(JSON.parse(out!)).toEqual({ok: true});
  });

  test('returns null when no object is present', () => {
    expect(extractJsonObject('no json here')).toBeNull();
    expect(extractJsonObject('')).toBeNull();
  });

  test('returns null for malformed JSON', () => {
    expect(extractJsonObject('{"unterminated":')).toBeNull();
    expect(extractJsonObject('{not valid}')).toBeNull();
  });

  test('handles nested braces correctly', () => {
    const out = extractJsonObject('{"outer": {"inner": 1}}');
    expect(JSON.parse(out!)).toEqual({outer: {inner: 1}});
  });
});

describe('shellQuote', () => {
  test('leaves safe identifiers unquoted', () => {
    expect(shellQuote('npm')).toBe('npm');
    expect(shellQuote('--dangerously-skip-permissions')).toBe('--dangerously-skip-permissions');
    expect(shellQuote('path/to/file.ts')).toBe('path/to/file.ts');
    expect(shellQuote('KEY=value')).toBe('KEY=value');
    expect(shellQuote('host:port')).toBe('host:port');
  });

  test('wraps strings with spaces in single quotes', () => {
    expect(shellQuote('hello world')).toBe(`'hello world'`);
  });

  test('escapes embedded single quotes', () => {
    expect(shellQuote("it's fine")).toBe(`'it'\\''s fine'`);
  });

  test('quotes strings with shell metacharacters', () => {
    expect(shellQuote('a;b')).toBe(`'a;b'`);
    expect(shellQuote('$(evil)')).toBe(`'$(evil)'`);
    expect(shellQuote('*')).toBe(`'*'`);
    expect(shellQuote('`cmd`')).toBe(`'\`cmd\`'`);
  });
});
