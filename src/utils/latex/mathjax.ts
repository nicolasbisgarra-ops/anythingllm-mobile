/**
 * TeX -> SVG typesetting with MathJax, fully offline and in plain JS (no WebView).
 *
 * The SVG is drawn with react-native-svg by `components/MathView`. MathJax is only
 * initialised the first time a message contains math, and results are cached because the
 * chat re-renders the whole message on every streamed token.
 */
import { mathjax } from 'mathjax-full/js/mathjax';
import { TeX } from 'mathjax-full/js/input/tex';
import { SVG } from 'mathjax-full/js/output/svg';
import { liteAdaptor, type LiteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html';
import 'mathjax-full/js/input/tex/base/BaseConfiguration';
import 'mathjax-full/js/input/tex/ams/AmsConfiguration';
import 'mathjax-full/js/input/tex/newcommand/NewcommandConfiguration';
import 'mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration';
import 'mathjax-full/js/input/tex/cancel/CancelConfiguration';
import 'mathjax-full/js/input/tex/color/ColorConfiguration';
import 'mathjax-full/js/input/tex/braket/BraketConfiguration';

export type TypesetMath = {
  svg: string;
  /** Size in em: multiply by the font size for pixels */
  width: number;
  height: number;
  /** How far the formula extends below the text baseline, in em */
  depth: number;
};

/** MathJax's SVG viewBox is in thousandths of an em */
const UNITS_PER_EM = 1000;
const CACHE_LIMIT = 300;

let adaptor: LiteAdaptor | null = null;
let doc: ReturnType<typeof mathjax.document> | null = null;
const cache = new Map<string, TypesetMath | null>();

function getDocument() {
  if (!doc) {
    adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    doc = mathjax.document('', {
      InputJax: new TeX({
        packages: ['base', 'ams', 'newcommand', 'boldsymbol', 'cancel', 'color', 'braket'],
        // Throw instead of rendering a red error box so callers can fall back to plain text
        formatError: (_jax: unknown, err: Error) => {
          throw err;
        },
      }),
      // Inline every glyph path so each SVG is self-contained
      OutputJax: new SVG({ fontCache: 'none' }),
    });
  }
  return { doc, adaptor: adaptor! };
}

/** Typeset a TeX expression, or `null` when it can't be parsed (unknown macro, bad braces) */
export function typesetTex(tex: string, display: boolean): TypesetMath | null {
  const key = `${display ? 'D' : 'I'}${tex}`;
  if (cache.has(key)) return cache.get(key)!;

  let result: TypesetMath | null = null;
  try {
    const { doc: mjDoc, adaptor: mjAdaptor } = getDocument();
    const container = mjDoc.convert(tex, { display });
    const svgNode = mjAdaptor.firstChild(container) as any;
    const viewBox = (mjAdaptor.getAttribute(svgNode, 'viewBox') || '').split(/\s+/).map(Number);
    const style = mjAdaptor.getAttribute(svgNode, 'style') || '';
    const widthEx = parseFloat(mjAdaptor.getAttribute(svgNode, 'width'));
    // Sizing comes from the metrics below; react-native-svg has no use for CSS/ARIA attributes
    for (const attr of ['style', 'role', 'focusable', 'width', 'height']) mjAdaptor.removeAttribute(svgNode, attr);
    const svg = mjAdaptor.outerHTML(svgNode);
    if (viewBox.length === 4 && viewBox.every(Number.isFinite)) {
      const [, minY, vbWidth, vbHeight] = viewBox;
      const width = vbWidth / UNITS_PER_EM;
      // Express MathJax's `vertical-align: -Nex` in em using the svg's own ex/em ratio
      const emPerEx = widthEx > 0 ? width / widthEx : 0.442;
      const alignEx = parseFloat(style.match(/vertical-align:\s*(-?[\d.]+)ex/)?.[1] ?? '0');
      result = {
        svg,
        width,
        height: vbHeight / UNITS_PER_EM,
        depth: alignEx < 0 ? -alignEx * emPerEx : Math.max(0, (vbHeight + minY) / UNITS_PER_EM),
      };
    }
  } catch {
    result = null;
  }

  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}
