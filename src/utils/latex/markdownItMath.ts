/**
 * markdown-it plugin that recognises LaTeX math so it isn't shown as raw `$...$` source.
 *
 * Produces three token types, rendered by the chat's markdown rules:
 * - `math_inline`  `$x^2$` or `\(x^2\)` inside a line of text
 * - `math_display` `$$...$$` or `\[...\]` sitting inside a paragraph
 * - `math_block`   `$$...$$` or `\[...\]` starting a line (may span several lines)
 *
 * Inline `$` follows the Pandoc rules so prices aren't mistaken for math: the opening `$`
 * must be followed by a non-space, the closing `$` preceded by a non-space and not followed
 * by a digit ("costs $5 or $10" stays text).
 */
// markdown-it ships without type definitions in this project
type StateInline = any;
type StateBlock = any;
type MarkdownIt = { inline: { ruler: any }; block: { ruler: any } };

/** Index of `needle` in `src` from `from`, skipping backslash-escaped occurrences */
function findUnescaped(src: string, needle: string, from: number): number {
  let idx = src.indexOf(needle, from);
  while (idx !== -1) {
    let backslashes = 0;
    for (let i = idx - 1; i >= 0 && src[i] === '\\'; i--) backslashes++;
    if (backslashes % 2 === 0) return idx;
    idx = src.indexOf(needle, idx + 1);
  }
  return -1;
}

function isWhitespace(ch: string | undefined) {
  return ch === ' ' || ch === '\t' || ch === '\n';
}

function mathInline(state: StateInline, silent: boolean): boolean {
  const src: string = state.src;
  const start: number = state.pos;
  const ch = src[start];
  let content: string;
  let end: number;
  let display: boolean;
  let markup: string;

  if (ch === '\\' && (src[start + 1] === '(' || src[start + 1] === '[')) {
    display = src[start + 1] === '[';
    const close = display ? '\\]' : '\\)';
    const closeAt = src.indexOf(close, start + 2);
    if (closeAt === -1) return false;
    content = src.slice(start + 2, closeAt);
    end = closeAt + 2;
    markup = display ? '\\[' : '\\(';
  } else if (ch === '$') {
    if (src[start + 1] === '$') {
      const closeAt = findUnescaped(src, '$$', start + 2);
      if (closeAt === -1) return false;
      content = src.slice(start + 2, closeAt);
      end = closeAt + 2;
      display = true;
      markup = '$$';
    } else {
      if (isWhitespace(src[start + 1]) || src[start + 1] === undefined) return false;
      let closeAt = findUnescaped(src, '$', start + 1);
      // A closing `$` preceded by whitespace can't close; keep looking on the same line
      while (closeAt !== -1 && isWhitespace(src[closeAt - 1])) {
        closeAt = findUnescaped(src, '$', closeAt + 1);
      }
      if (closeAt === -1 || closeAt === start + 1) return false;
      if (/\d/.test(src[closeAt + 1] ?? '')) return false;
      content = src.slice(start + 1, closeAt);
      // Inline math never spans a blank line
      if (content.includes('\n\n')) return false;
      end = closeAt + 1;
      display = false;
      markup = '$';
    }
  } else {
    return false;
  }

  if (!content.trim()) return false;
  if (!silent) {
    const token = state.push(display ? 'math_display' : 'math_inline', 'math', 0);
    token.content = content.trim();
    token.markup = markup;
  }
  state.pos = end;
  return true;
}

function mathBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  let pos: number = state.bMarks[startLine] + state.tShift[startLine];
  let max: number = state.eMarks[startLine];
  // Indented code block
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;

  const src: string = state.src;
  let open: string;
  let close: string;
  if (src.startsWith('$$', pos)) {
    open = '$$';
    close = '$$';
  } else if (src.startsWith('\\[', pos)) {
    open = '\\[';
    close = '\\]';
  } else {
    return false;
  }
  pos += open.length;

  let nextLine = startLine;
  let content = '';
  let found = false;
  let firstLine = src.slice(pos, max);

  // Single line: $$ ... $$ (anything after the closing delimiter disqualifies it)
  const sameLineClose = firstLine.indexOf(close);
  if (sameLineClose !== -1) {
    if (firstLine.slice(sameLineClose + close.length).trim() !== '') return false;
    content = firstLine.slice(0, sameLineClose);
    found = true;
  } else {
    const lines = [firstLine];
    for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
      pos = state.bMarks[nextLine] + state.tShift[nextLine];
      max = state.eMarks[nextLine];
      // A blank line ends the search: this was not a math block
      if (pos >= max) break;
      const line = src.slice(pos, max);
      const closeAt = line.indexOf(close);
      if (closeAt !== -1) {
        if (line.slice(closeAt + close.length).trim() !== '') return false;
        lines.push(line.slice(0, closeAt));
        found = true;
        break;
      }
      lines.push(line);
    }
    content = lines.join('\n');
  }

  if (!found || !content.trim()) return false;
  if (silent) return true;

  state.line = nextLine + 1;
  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.content = content.trim();
  token.markup = open;
  token.map = [startLine, state.line];
  return true;
}

export default function markdownItMath(md: MarkdownIt) {
  // Before `escape`, otherwise `\(` and `\[` are consumed as escaped punctuation
  md.inline.ruler.before('escape', 'math_inline', mathInline);
  md.block.ruler.before('fence', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
}
