import { latexToUnicode } from '../toUnicode';
import markdownItMath from '../markdownItMath';
import { typesetTex } from '../mathjax';

const MarkdownIt = require('markdown-it');

describe('latexToUnicode', () => {
  it.each([
    // The arc length answer from a Qwen3.5 4b chat that used to render as raw `$...$`
    ['y^2 = 4(x-4)^3', 'y² = 4(x−4)³'],
    ['0 \\le x \\le 2', '0 ≤ x ≤ 2'],
    ['y = \\sqrt{4(x-4)^3} = 2(x-4)^{3/2}', 'y = √(4(x−4)³) = 2(x−4)^(3/2)'],
    ["f'(x) = 2 \\cdot \\frac{3}{2}(x-4)^{1/2}", 'f′(x) = 2 · ³⁄₂(x−4)^(1/2)'],
    ["L = \\int_a^b \\sqrt{1 + [f'(x)]^2} dx", 'L = ∫ₐᵇ √(1 + [f′(x)]²) dx'],
    ['= \\int_0^2 \\sqrt{9x - 35} dx', '= ∫₀² √(9x − 35) dx'],
    // Fractions
    ['\\frac{1}{2}', '½'],
    ['\\frac{d}{dx}', 'd/dx'],
    ['\\frac{\\partial f}{\\partial x}', '∂f/∂x'],
    ['x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}', 'x = (−b ± √(b² − 4ac))/(2a)'],
    ['\\left( \\frac{a}{b} \\right)^2', '(a/b)²'],
    // Scripts, operators, functions
    ['\\sum_{i=1}^{n} i', '∑ᵢ₌₁ⁿ i'],
    ['\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1', 'lim_(x→0) (sin x)/x = 1'],
    ['a_{n+1} = a_n + d', 'aₙ₊₁ = aₙ + d'],
    ['e^{i\\pi} + 1 = 0', 'e^(iπ) + 1 = 0'],
    ['90^\\circ', '90°'],
    ['2\\sin x\\cos x', '2 sin x cos x'],
    // Fonts, text, accents, roots
    ['\\mathbb{R}^n', 'ℝⁿ'],
    ['\\text{Area} = \\pi r^2', 'Area = π r²'],
    ['\\vec{v} \\cdot \\hat{n}', 'v⃗ · n̂'],
    ['\\sqrt[3]{27} = 3', '∛27 = 3'],
    ['\\{x \\mid x > 0\\}', '{x ∣ x > 0}'],
    ['x \\neq y', 'x ≠ y'],
    // Environments
    ['\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}', '(1\u2002\u20022)\n(3\u2002\u20024)'],
    ['\\begin{cases} x & x \\ge 0 \\\\ -x & x < 0 \\end{cases}', '{\u2002x,\u2002x ≥ 0\n{\u2002−x,\u2002x < 0'],
  ])('%s', (input, expected) => {
    expect(latexToUnicode(input)).toBe(expected);
  });

  it('keeps unknown commands readable instead of throwing', () => {
    expect(latexToUnicode('\\foo{x} + \\frac{1}')).toBe('foo(x) + 1/');
  });
});

describe('markdownItMath', () => {
  const md = new MarkdownIt({ typographer: true, linkify: true }).use(markdownItMath);
  const inlineTypes = (src: string) =>
    md.parseInline(src, {})[0].children.map((t: any) => [t.type, t.content]);

  it('parses inline $...$ and \\(...\\)', () => {
    expect(inlineTypes('Given $y > 0$ and \\(a^2\\).')).toEqual([
      ['text', 'Given '],
      ['math_inline', 'y > 0'],
      ['text', ' and '],
      ['math_inline', 'a^2'],
      ['text', '.'],
    ]);
  });

  it('does not treat prices or escaped dollars as math', () => {
    expect(inlineTypes('It costs $5 or $10, not \\$x\\$.')).toEqual([['text', 'It costs $5 or $10, not $x$.']]);
  });

  it('leaves math-looking code spans alone', () => {
    expect(inlineTypes('Use `$x$` here')).toEqual([
      ['text', 'Use '],
      ['code_inline', '$x$'],
      ['text', ' here'],
    ]);
  });

  it('lifts display math written mid-paragraph into its own block', () => {
    const tokens = md.parse('We get $$x^2$$ and so \\[y\\] done.', {});
    expect(tokens.map((t: any) => [t.type, t.content])).toEqual([
      ['paragraph_open', ''],
      ['inline', ''],
      ['paragraph_close', ''],
      ['math_block', 'x^2'],
      ['paragraph_open', ''],
      ['inline', ''],
      ['paragraph_close', ''],
      ['math_block', 'y'],
      ['paragraph_open', ''],
      ['inline', ''],
      ['paragraph_close', ''],
    ]);
    expect(tokens[1].children.map((t: any) => t.content)).toEqual(['We get ']);
    expect(tokens[9].children.map((t: any) => t.content)).toEqual([' done.']);
  });

  it('turns a $$ line right after text into a display block', () => {
    const tokens = md.parse("Since we're given $y > 0$:\n$$y = \\sqrt{4(x-4)^3}$$", {});
    expect(tokens.map((t: any) => t.type)).toEqual(['paragraph_open', 'inline', 'paragraph_close', 'math_block']);
    expect(tokens[3].content).toBe('y = \\sqrt{4(x-4)^3}');
  });

  it('parses multi-line $$ and \\[ blocks', () => {
    for (const src of ['$$\n\\int_0^2 x\\,dx\n$$', '\\[\n\\int_0^2 x\\,dx\n\\]']) {
      const tokens = md.parse(src, {});
      expect(tokens.map((t: any) => [t.type, t.content])).toEqual([['math_block', '\\int_0^2 x\\,dx']]);
    }
  });

  it('leaves an unterminated $$ (still streaming) as text', () => {
    const tokens = md.parse('$$\\int_0^2', {});
    expect(tokens.map((t: any) => t.type)).toEqual(['paragraph_open', 'inline', 'paragraph_close']);
  });
});

describe('typesetTex', () => {
  it('typesets inline and display math to SVG with em-based metrics', () => {
    const inline = typesetTex('y^2 = 4(x-4)^3', false)!;
    expect(inline.svg.startsWith('<svg')).toBe(true);
    expect(inline.svg).toContain('currentColor');
    expect(inline.width).toBeGreaterThan(5);
    expect(inline.height).toBeGreaterThan(0.8);
    expect(inline.depth).toBeGreaterThan(0.1);

    const display = typesetTex("L = \\int_a^b \\sqrt{1 + [f'(x)]^2}\\, dx", true)!;
    expect(display.height).toBeGreaterThan(inline.height);
  });

  it('returns null for TeX it cannot parse so callers can fall back', () => {
    expect(typesetTex('\\notamacro{x}', false)).toBeNull();
    expect(typesetTex('\\frac{1}{', true)).toBeNull();
  });

  it('caches results', () => {
    expect(typesetTex('a+b', false)).toBe(typesetTex('a+b', false));
  });
});
