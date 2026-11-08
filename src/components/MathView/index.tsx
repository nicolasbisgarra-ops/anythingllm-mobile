import { memo, useMemo } from 'react';
import { PixelRatio, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { typesetTex } from '@/utils/latex/mathjax';
import { latexToUnicode } from '@/utils/latex/toUnicode';

/** React Native's default <Text> size, which the chat body uses */
const DEFAULT_FONT_SIZE = 14;
/** Display formulas are set a little larger than body text, like KaTeX/ChatGPT */
const DISPLAY_SCALE = 1.15;

type Props = {
  tex: string;
  display?: boolean;
  /** Text style of the surrounding paragraph: font size and colour are matched */
  textStyle?: StyleProp<TextStyle>;
};

/**
 * Typeset LaTeX with MathJax and draw it as SVG. Inline formulas sit on the text baseline
 * (render this inside a <Text>); display formulas are centered and scroll horizontally when
 * wider than the screen. Anything MathJax can't parse falls back to a Unicode rendering.
 */
export default memo(function MathView({ tex, display = false, textStyle }: Props) {
  const flat = StyleSheet.flatten(textStyle) || {};
  // Text scales with the system font size setting; the SVG has to be scaled to match
  const fontSize = (flat.fontSize ?? DEFAULT_FONT_SIZE) * PixelRatio.getFontScale() * (display ? DISPLAY_SCALE : 1);
  const color = (flat.color as string) ?? 'white';
  const math = useMemo(() => typesetTex(tex, display), [tex, display]);

  if (!math) {
    const fallback = latexToUnicode(tex);
    if (!display) return <Text style={[textStyle, styles.fallback]}>{fallback}</Text>;
    return (
      <Text selectable style={[textStyle, styles.fallback, styles.displayFallback]}>
        {fallback}
      </Text>
    );
  }

  const width = math.width * fontSize;
  const height = math.height * fontSize;
  const svg = <SvgXml xml={math.svg} width={width} height={height} color={color} />;

  if (!display) {
    // Inline views sit on the baseline; push the formula down by its depth so e.g. the
    // bottom of a fraction hangs below the line like it does in print.
    return <View style={{ width, height, transform: [{ translateY: math.depth * fontSize }] }}>{svg}</View>;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.display}
      contentContainerStyle={styles.displayContent}>
      {svg}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  fallback: { fontFamily: 'serif' },
  displayFallback: { textAlign: 'center', marginVertical: 8 },
  display: { marginVertical: 8 },
  displayContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
});
