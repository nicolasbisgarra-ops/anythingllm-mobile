/**
 * Lightweight LaTeX -> Unicode converter, the fallback for math MathJax can't typeset
 * (see `utils/latex/mathjax.ts`): `\int_0^2 \sqrt{9x - 35}\,dx` -> `∫₀² √(9x − 35) dx`.
 * Anything we don't recognise degrades to its readable source (command name without the
 * backslash), never to an error.
 */

const SYMBOLS: Record<string, string> = {
  // Greek lowercase
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ',
  omicron: 'ο', pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ',
  upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  // Greek uppercase
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ',
  Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  // Binary operators
  cdot: '·', cdotp: '·', times: '×', div: '÷', pm: '±', mp: '∓', ast: '∗', star: '⋆', circ: '∘',
  bullet: '•', oplus: '⊕', ominus: '⊖', otimes: '⊗', odot: '⊙', cup: '∪', cap: '∩', setminus: '∖',
  wedge: '∧', land: '∧', vee: '∨', lor: '∨', neg: '¬', lnot: '¬',
  // Relations
  le: '≤', leq: '≤', leqslant: '≤', ge: '≥', geq: '≥', geqslant: '≥', ne: '≠', neq: '≠', approx: '≈',
  equiv: '≡', sim: '∼', simeq: '≃', cong: '≅', propto: '∝', ll: '≪', gg: '≫', lt: '<', gt: '>',
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇',
  perp: '⊥', parallel: '∥', mid: '∣', models: '⊨', vdash: '⊢',
  // Arrows
  to: '→', rightarrow: '→', leftarrow: '←', gets: '←', leftrightarrow: '↔', Rightarrow: '⇒',
  Leftarrow: '⇐', Leftrightarrow: '⇔', iff: '⇔', implies: '⟹', impliedby: '⟸', mapsto: '↦',
  uparrow: '↑', downarrow: '↓', longrightarrow: '⟶', longleftarrow: '⟵', Longrightarrow: '⟹',
  // Big operators
  int: '∫', iint: '∬', iiint: '∭', oint: '∮', sum: '∑', prod: '∏', coprod: '∐',
  bigcup: '⋃', bigcap: '⋂', bigoplus: '⨁', bigotimes: '⨂',
  // Misc
  infty: '∞', partial: '∂', nabla: '∇', forall: '∀', exists: '∃', nexists: '∄', emptyset: '∅',
  varnothing: '∅', angle: '∠', triangle: '△', square: '□', degree: '°', prime: '′', hbar: 'ℏ',
  ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', therefore: '∴', because: '∵', checkmark: '✓',
  cdots: '⋯', ldots: '…', dots: '…', dotsc: '…', dotsb: '⋯', vdots: '⋮', ddots: '⋱',
  // Delimiters
  langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', vert: '|', lvert: '|',
  rvert: '|', Vert: '‖', lVert: '‖', rVert: '‖', lbrace: '{', rbrace: '}', backslash: '\\',
  colon: ':',
  // Spacing
  quad: ' ', qquad: '  ',
};

/** Single-character escapes: `\,` `\{` `\%` ... */
const CHAR_ESCAPES: Record<string, string> = {
  ',': ' ', ':': ' ', ';': ' ', ' ': ' ', '!': '', '>': ' ',
  '{': '{', '}': '}', '%': '%', '$': '$', '#': '#', '&': '&', '_': '_', '|': '‖',
};

/** Operator names printed upright as words */
const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'coth', 'log', 'ln', 'lg', 'exp', 'lim', 'liminf', 'limsup', 'max', 'min', 'sup', 'inf', 'det',
  'dim', 'ker', 'deg', 'gcd', 'lcm', 'arg', 'mod', 'Pr', 'hom',
]);

/** Commands whose argument is plain text */
const TEXT_COMMANDS = new Set(['text', 'textrm', 'textit', 'textbf', 'textsf', 'texttt', 'mbox', 'textnormal', 'operatorname']);

/** Font/style commands that we can't express in plain text: keep the content */
const PASSTHROUGH_COMMANDS = new Set([
  'mathrm', 'mathit', 'mathbf', 'mathsf', 'mathtt', 'mathcal', 'mathscr', 'mathfrak', 'boldsymbol',
  'bm', 'displaystyle', 'textstyle', 'scriptstyle', 'mathnormal', 'pmb', 'boxed', 'underline',
  'phantom', 'cancel', 'mathop',
]);

/** Sizing prefixes: `\left(` `\bigl[` ... render just the delimiter */
const SIZING = new Set(['left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr', 'biggl', 'biggr', 'Biggl', 'Biggr', 'middle']);

const ACCENTS: Record<string, string> = {
  vec: '⃗', hat: '̂', widehat: '̂', bar: '̄', overline: '̅', dot: '̇',
  ddot: '̈', tilde: '̃', widetilde: '̃', check: '̌', acute: '́', grave: '̀',
  breve: '̆', overrightarrow: '⃗',
};

const DOUBLE_STRUCK: Record<string, string> = {
  R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ', H: 'ℍ', E: '𝔼', F: '𝔽', '1': '𝟙',
};

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', ' ': ' ',
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ',
  n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ',
  A: 'ᴬ', B: 'ᴮ', D: 'ᴰ', E: 'ᴱ', G: 'ᴳ', H: 'ᴴ', I: 'ᴵ', J: 'ᴶ', K: 'ᴷ', L: 'ᴸ', M: 'ᴹ', N: 'ᴺ',
  O: 'ᴼ', P: 'ᴾ', R: 'ᴿ', T: 'ᵀ', U: 'ᵁ', V: 'ⱽ', W: 'ᵂ',
  'α': 'ᵅ', 'β': 'ᵝ', 'γ': 'ᵞ', 'δ': 'ᵟ', 'ε': 'ᵋ', 'ϵ': 'ᵋ', 'θ': 'ᶿ', 'φ': 'ᵠ', 'ϕ': 'ᵠ', 'χ': 'ᵡ',
  '′': '′', '∗': '*', '*': '*', '∘': '°', '°': '°',
};

const SUBSCRIPT: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎', ' ': ' ',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ',
  s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
  'β': 'ᵦ', 'γ': 'ᵧ', 'ρ': 'ᵨ', 'φ': 'ᵩ', 'ϕ': 'ᵩ', 'χ': 'ᵪ',
};

const VULGAR_FRACTIONS: Record<string, string> = {
  '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾', '1/5': '⅕', '2/5': '⅖', '3/5': '⅗',
  '4/5': '⅘', '1/6': '⅙', '5/6': '⅚', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞',
};

/** Operators that take their limits as sub/superscripts; spaced from what follows */
const BIG_OPERATORS = new Set(['∫', '∬', '∭', '∮', '∑', '∏', '∐', '⋃', '⋂', '⨁', '⨂']);

function mapScript(text: string, table: Record<string, string>): string | null {
  let out = '';
  for (const ch of text) {
    const mapped = table[ch];
    if (mapped === undefined) return null;
    out += mapped;
  }
  return out;
}

/** True when the rendered text reads as one unit and needs no parentheses around it */
function isAtom(text: string): boolean {
  if ([...text].length <= 1) return true;
  if (/^[\p{L}\p{N}.,′]+$/u.test(text)) return true;
  // Already wrapped in a single matching pair of brackets
  if (/^\((?:[^()]|\([^()]*\))*\)$/.test(text) || /^\[[^[\]]*\]$/.test(text)) return true;
  // Root / function application of an atom: √x, √(x+1)
  return /^√(\p{L}|\p{N}|\(.*\))$/u.test(text);
}

const wrap = (text: string) => (isAtom(text) ? text : `(${text})`);

class Parser {
  private pos = 0;

  constructor(private readonly src: string) {}

  parse(): string {
    return this.parseUntil(null);
  }

  private peek(): string {
    return this.src[this.pos];
  }

  /** Read a `{...}` group's raw source, or a single token when there are no braces */
  private readArgSource(): string {
    this.skipSpaces();
    const ch = this.src[this.pos];
    if (ch === undefined) return '';
    if (ch === '{') {
      let depth = 0;
      const start = this.pos + 1;
      for (; this.pos < this.src.length; this.pos++) {
        const c = this.src[this.pos];
        if (c === '\\') {
          this.pos++;
          continue;
        }
        if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) {
            this.pos++;
            return this.src.slice(start, this.pos - 1);
          }
        }
      }
      return this.src.slice(start);
    }
    if (ch === '\\') {
      const start = this.pos;
      this.pos++;
      if (/[a-zA-Z]/.test(this.src[this.pos] ?? '')) {
        while (/[a-zA-Z]/.test(this.src[this.pos] ?? '')) this.pos++;
      } else {
        this.pos++;
      }
      return this.src.slice(start, this.pos);
    }
    this.pos++;
    return ch;
  }

  private readArg(): string {
    return new Parser(this.readArgSource()).parse();
  }

  /** Optional `[...]` argument (e.g. `\sqrt[3]{x}`) */
  private readOptionalArg(): string | null {
    this.skipSpaces();
    if (this.src[this.pos] !== '[') return null;
    const end = this.src.indexOf(']', this.pos);
    if (end === -1) return null;
    const raw = this.src.slice(this.pos + 1, end);
    this.pos = end + 1;
    return new Parser(raw).parse();
  }

  private skipSpaces() {
    while (this.src[this.pos] === ' ' || this.src[this.pos] === '\n' || this.src[this.pos] === '\t') this.pos++;
  }

  private readCommandName(): string {
    // Positioned right after the backslash
    const start = this.pos;
    if (/[a-zA-Z]/.test(this.src[this.pos] ?? '')) {
      while (/[a-zA-Z]/.test(this.src[this.pos] ?? '')) this.pos++;
      return this.src.slice(start, this.pos);
    }
    this.pos++;
    return this.src.slice(start, this.pos);
  }

  private parseUntil(stop: string | null): string {
    let out = '';
    // Set after ∫/∑/... so their limits stay attached but the operand is spaced: ∫₀² x dx
    let afterBigOperator = false;
    while (this.pos < this.src.length) {
      const ch = this.peek();
      if (stop !== null && this.src.startsWith(stop, this.pos)) break;

      if (ch === '^' || ch === '_') {
        this.pos++;
        out += this.script(ch, this.readArgSource());
        continue;
      }
      if (afterBigOperator && ch !== ' ' && ch !== '\n') {
        afterBigOperator = false;
        if (!out.endsWith(' ')) out += ' ';
      }
      if (ch === '\\') {
        this.pos++;
        const rendered = this.command(this.readCommandName(), out);
        out += rendered;
        if (BIG_OPERATORS.has(rendered)) afterBigOperator = true;
        continue;
      }
      if (ch === '{') {
        out += this.readArg();
        continue;
      }
      if (ch === '}') {
        // Stray closing brace: ignore
        this.pos++;
        continue;
      }
      this.pos++;
      if (ch === "'") out += '′';
      else if (ch === '-') out += '−';
      else if (ch === '*') out += '∗';
      else if (ch === '~') out += ' ';
      else if (ch === '\n' || ch === '\t') out += out.endsWith(' ') ? '' : ' ';
      else if (ch === ' ') out += out.endsWith(' ') || out === '' ? '' : ' ';
      else out += ch;
    }
    return out;
  }

  /**
   * `x^{2}` -> `x²` when every character has a Unicode super/subscript form, otherwise the
   * explicit `x^(3/2)` notation.
   */
  private script(kind: '^' | '_', rawArg: string): string {
    // x^\circ -> x°
    if (kind === '^' && /^\\circ\s*$/.test(rawArg)) return '°';
    const rendered = new Parser(rawArg).parse().trim();
    if (!rendered) return '';
    const mapped = mapScript(rendered, kind === '^' ? SUPERSCRIPT : SUBSCRIPT);
    const compact = rendered.replace(/\s+/g, '');
    return mapped ?? `${kind}${[...compact].length === 1 ? compact : `(${compact})`}`;
  }

  private command(name: string, before: string): string {
    if (name in CHAR_ESCAPES) return CHAR_ESCAPES[name];
    if (name === '\\') return '\n';
    if (name in SYMBOLS) return SYMBOLS[name];
    if (FUNCTIONS.has(name)) {
      // `\sin x` -> `sin x`, but `2\sin` -> `2 sin`
      const needsSpace = before !== '' && /[\p{L}\p{N})]$/u.test(before);
      return `${needsSpace ? ' ' : ''}${name}${this.nextIsWordChar() ? ' ' : ''}`;
    }
    if (TEXT_COMMANDS.has(name)) return this.readArgSource();
    if (PASSTHROUGH_COMMANDS.has(name)) {
      if (name === 'displaystyle' || name === 'textstyle' || name === 'scriptstyle') return '';
      return this.readArg();
    }
    if (SIZING.has(name)) {
      this.skipSpaces();
      if (this.peek() === '.') {
        this.pos++;
        return '';
      }
      if (this.peek() === '\\') {
        this.pos++;
        const delimiter = this.readCommandName();
        return CHAR_ESCAPES[delimiter] ?? SYMBOLS[delimiter] ?? delimiter;
      }
      if (this.pos < this.src.length) return this.src[this.pos++];
      return '';
    }
    if (name in ACCENTS) {
      const arg = this.readArg();
      const mark = ACCENTS[name];
      // Combining marks only look right on single characters; long arguments get one per char
      if (name === 'overline' || name === 'bar') return [...arg].map(c => c + mark).join('');
      return [...arg].length === 1 ? arg + mark : `${arg}${mark}`;
    }
    switch (name) {
      case 'frac':
      case 'dfrac':
      case 'tfrac':
      case 'cfrac': {
        const num = this.readArg().trim();
        const den = this.readArg().trim();
        return fraction(num, den);
      }
      case 'sqrt': {
        const index = this.readOptionalArg();
        const radicand = this.readArg().trim();
        const root = index === '3' ? '∛' : index === '4' ? '∜' : index ? `${mapScript(index, SUPERSCRIPT) ?? index}√` : '√';
        return root + wrap(radicand);
      }
      case 'binom':
      case 'dbinom':
      case 'tbinom': {
        const n = this.readArg().trim();
        const k = this.readArg().trim();
        return `C(${n}, ${k})`;
      }
      case 'mathbb': {
        const arg = this.readArg();
        return [...arg].map(c => DOUBLE_STRUCK[c] ?? c).join('');
      }
      case 'pmod':
        return ` (mod ${this.readArg()})`;
      case 'bmod':
        return ' mod ';
      case 'not': {
        this.skipSpaces();
        const next = this.readArgSource();
        const rendered = new Parser(next).parse();
        if (rendered === '=') return '≠';
        if (rendered === '∈') return '∉';
        return `${rendered}̸`;
      }
      case 'begin':
        return this.environment(this.readArgSource());
      case 'end':
        this.readArgSource();
        return '';
      case 'label':
      case 'tag':
      case 'nonumber':
      case 'notag':
        if (name === 'label' || name === 'tag') this.readArgSource();
        return '';
      case 'limits':
      case 'nolimits':
        return '';
      default: {
        // Unknown command: keep its name readable, `\foo{x}` -> foo(x)
        this.skipSpaces();
        if (this.peek() === '{') return `${name}(${this.readArg().trim()})`;
        return /[a-zA-Z]/.test(this.peek() ?? '') ? `${name} ` : name;
      }
    }
  }

  private nextIsWordChar(): boolean {
    const next = this.src[this.pos];
    return next !== undefined && /[\p{L}\p{N}\\]/u.test(next);
  }

  /** `\begin{env} ... \end{env}`: rows on separate lines, cells spaced apart */
  private environment(env: string): string {
    const endTag = `\\end{${env}}`;
    const end = this.src.indexOf(endTag, this.pos);
    const body = end === -1 ? this.src.slice(this.pos) : this.src.slice(this.pos, end);
    this.pos = end === -1 ? this.src.length : end + endTag.length;

    const base = env.replace(/\*$/, '');
    // array/tabular take a column spec argument
    const content = base === 'array' ? body.replace(/^\s*\{[^}]*\}/, '') : body;
    const rows = content
      .split(/\\\\(?:\[[^\]]*\])?/)
      .map(row => row.trim())
      .filter(row => row.length > 0)
      .map(row =>
        row
          .split(/(?<!\\)&/)
          .map(cell => new Parser(cell).parse().trim())
          .join(base === 'cases' ? ',\u2002' : base.endsWith('matrix') ? '\u2002\u2002' : ' '),
      );

    switch (base) {
      case 'pmatrix':
        return rows.map(r => `(${r})`).join('\n');
      case 'bmatrix':
        return rows.map(r => `[${r}]`).join('\n');
      case 'vmatrix':
        return rows.map(r => `|${r}|`).join('\n');
      case 'Vmatrix':
        return rows.map(r => `‖${r}‖`).join('\n');
      case 'cases':
        return rows.map(r => `{\u2002${r}`).join('\n');
      default:
        return rows.join('\n');
    }
  }
}

function fraction(num: string, den: string): string {
  if (/^\d+$/.test(num) && /^\d+$/.test(den)) {
    // ½, otherwise ³⁄₂ so it can't be misread next to a following factor: ³⁄₂(x−4)
    return VULGAR_FRACTIONS[`${num}/${den}`] ?? `${mapScript(num, SUPERSCRIPT)}\u2044${mapScript(den, SUBSCRIPT)}`;
  }
  // Derivatives read fine without parentheses: d/dx, dy/dx, ∂f/∂x, d²y/dx²
  const compact = (t: string) => t.replace(/\s+/g, '');
  if (/^[d∂δΔ]/u.test(num) && num[0] === den[0] && [...compact(num)].length <= 4 && [...compact(den)].length <= 4) {
    return `${compact(num)}/${compact(den)}`;
  }
  // The denominator binds tighter than juxtaposition suggests: a/2b means a/(2b)
  const simpleDen = [...den].length <= 1 || /^\d+(\.\d+)?$/.test(den) || (isAtom(den) && /^[([√]/.test(den));
  return `${wrap(num)}/${simpleDen ? den : `(${den})`}`;
}

/** Convert a LaTeX math expression (without the `$` delimiters) to readable Unicode text */
export function latexToUnicode(latex: string): string {
  try {
    return new Parser(latex.trim())
      .parse()
      .replace(/[  ]+\n/g, '\n')
      .replace(/\n[  ]+/g, '\n')
      .replace(/ {2,}/g, ' ')
      // `\left( x \right)` -> (x)
      .replace(/([([{⟨]) /g, '$1')
      .replace(/ ([)\]}⟩])/g, '$1')
      // ∂ f -> ∂f, ∇ f -> ∇f
      .replace(/([∂∇]) (?=\p{L})/gu, '$1')
      .trim();
  } catch {
    return latex;
  }
}
