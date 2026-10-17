import { describe, expect, it } from 'vitest';
import { caseStateAfter, changeCase, nextCase } from './textCase';

describe('changeCase', () => {
  it('handles upper and lower case', () => {
    expect(changeCase('Hello World', 'upper')).toBe('HELLO WORLD');
    expect(changeCase('Hello World', 'lower')).toBe('hello world');
  });

  it('capitalises each word for title case', () => {
    expect(changeCase('the quick-brown fox (and friends)', 'title')).toBe('The Quick-Brown Fox (And Friends)');
    expect(changeCase("DON'T STOP", 'title')).toBe("Don't Stop");
  });

  it('capitalises sentences for sentence case', () => {
    expect(changeCase('HELLO THERE. HOW ARE YOU? FINE!  GOOD', 'sentence')).toBe('Hello there. How are you? Fine!  Good');
    expect(changeCase('version 2.5 is OUT', 'sentence')).toBe('Version 2.5 is out');
  });

  it('continues from the text before the selection', () => {
    expect(changeCase('WORLD', 'sentence', caseStateAfter('Hello '))).toBe('world');
    expect(changeCase('world', 'sentence', caseStateAfter('Done. '))).toBe('World');
    expect(changeCase('ORLD', 'title', caseStateAfter('Hello w'))).toBe('orld');
  });

  it('keeps the length the same', () => {
    expect(changeCase('straße', 'upper')).toHaveLength('straße'.length);
  });
});

describe('nextCase', () => {
  it('cycles lowercase → UPPERCASE → Title Case → lowercase', () => {
    expect(nextCase('hello world')).toBe('upper');
    expect(nextCase('HELLO WORLD')).toBe('title');
    expect(nextCase('Hello World')).toBe('lower');
    expect(nextCase('hELLo')).toBe('upper');
  });
});
