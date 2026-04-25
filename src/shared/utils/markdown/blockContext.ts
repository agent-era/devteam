import type {BlockContext} from './types.js';

const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})\s*([^\s`~]*)\s*$/;
const HEADING = /^(\s*)(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s*(?:-\s*-\s*-[-\s]*|\*\s*\*\s*\*[\*\s]*|_\s*_\s*_[_\s]*)\s*$/;
const BLOCKQUOTE = /^(\s*)>\s?(.*)$/;
const UL = /^(\s*)([-*+])\s+(.*)$/;
const OL = /^(\s*)(\d+)([.)])\s+(.*)$/;

/**
 * Scan a markdown source string and produce one BlockContext per line
 * (1-indexed: result[i] describes file line i; result[0] is unused).
 *
 * The scan is line-local for everything except fenced code blocks, which
 * span multiple lines — those lines must be marked as `code` so the diff
 * renderer doesn't try to parse markdown inside them.
 */
export function computeBlockContext(content: string): BlockContext[] {
  const lines = content.split('\n');
  const out: BlockContext[] = new Array(lines.length + 1);
  out[0] = {kind: 'blank'};

  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;
  let fenceLang: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idx = i + 1;

    if (inFence) {
      const closeRe = new RegExp(`^\\s*${fenceChar === '\`' ? '`' : '~'}{${fenceLen},}\\s*$`);
      const close = closeRe.test(line);
      out[idx] = {kind: 'code', lang: fenceLang, isFenceMarker: close};
      if (close) {
        inFence = false;
        fenceChar = '';
        fenceLen = 0;
        fenceLang = undefined;
      }
      continue;
    }

    const open = line.match(FENCE_OPEN);
    if (open) {
      inFence = true;
      const marker = open[2];
      fenceChar = marker[0];
      fenceLen = marker.length;
      fenceLang = open[3] || undefined;
      out[idx] = {kind: 'code', lang: fenceLang, isFenceMarker: true};
      continue;
    }

    if (line.trim() === '') {
      out[idx] = {kind: 'blank'};
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      const level = heading[2].length as 1 | 2 | 3 | 4 | 5 | 6;
      const textStart = heading[1].length + heading[2].length + 1; // include single space after #
      out[idx] = {kind: 'heading', level, textStart};
      continue;
    }

    if (HR.test(line)) {
      out[idx] = {kind: 'hr'};
      continue;
    }

    const bq = line.match(BLOCKQUOTE);
    if (bq) {
      const textStart = line.indexOf('>') + 1 + (line[line.indexOf('>') + 1] === ' ' ? 1 : 0);
      out[idx] = {kind: 'blockquote', textStart};
      continue;
    }

    const ul = line.match(UL);
    if (ul) {
      out[idx] = {
        kind: 'list',
        indent: ul[1].length,
        bullet: ul[2],
        textStart: ul[1].length + ul[2].length + 1,
        ordered: false,
      };
      continue;
    }

    const ol = line.match(OL);
    if (ol) {
      out[idx] = {
        kind: 'list',
        indent: ol[1].length,
        bullet: `${ol[2]}${ol[3]}`,
        textStart: ol[1].length + ol[2].length + ol[3].length + 1,
        ordered: true,
      };
      continue;
    }

    out[idx] = {kind: 'para'};
  }

  return out;
}
