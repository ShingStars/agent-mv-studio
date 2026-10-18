/**
 * Font loading.
 *
 * The browser host loads only OFL fonts shipped with the package (via the
 * `@fontsource/*` dependencies). Each family is registered for the weights the
 * styles actually use, and `loadFonts()` resolves only after every face needed
 * by the demo has been decoded — otherwise the first rendered frame would use a
 * fallback and every later frame would shift.
 */

const LATIN = [
  ['Inter', 'inter', [400, 500, 600, 700, 800]],
  ['JetBrains Mono', 'jetbrains-mono', [400, 500, 700]],
  ['Source Serif 4', 'source-serif-4', [400, 600, 700]],
] as const;

export async function loadFonts(base = '/vendor/@fontsource'): Promise<void> {
  const css: string[] = [];
  for (const [family, slug, weights] of LATIN) {
    for (const w of weights) {
      const url = `${base}/${slug}/files/${slug}-latin-${w}-normal.woff2`;
      css.push(
        `@font-face{font-family:"${family}";font-style:normal;font-weight:${w};font-display:block;src:url("${url}") format("woff2");}`,
      );
    }
  }
  const style = document.createElement('style');
  style.textContent = css.join('\n');
  document.head.appendChild(style);

  const jobs: Promise<unknown>[] = [];
  for (const [family, , weights] of LATIN) {
    for (const w of weights) {
      jobs.push(document.fonts.load(`${w} 24px "${family}"`, 'AaBb019'));
    }
  }
  await Promise.all(jobs);
  await document.fonts.ready;
}

/** Font diagnostics for `doctor` output. */
export function fontReport(): string[] {
  const out: string[] = [];
  for (const [family] of LATIN) out.push(`${family}: ${document.fonts.check(`400 16px "${family}"`) ? 'ok' : 'missing'}`);
  return out;
}
