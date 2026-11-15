// Compiles the prototype CSS with the project's own Tailwind v4.
// Usage: node docs/design/prototype/tools/build.mjs   (defaults: scans the prototype, writes assets/app.css)
//        node build.mjs <dir-to-scan> <out.css>
//
// The tokens (@theme inline, :root, .dark, @layer base) are read verbatim from
// src/styles.css at build time, so the prototype can never drift from them.
// Tailwind's default palette, shadows and extra font families are removed, so a
// utility such as `bg-zinc-800` or `shadow-md` simply produces no CSS.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile } from '@tailwindcss/node'
import { Scanner } from '@tailwindcss/oxide'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../../../..') // tools -> prototype -> design -> docs -> repo root
const [, , scanDir = path.resolve(here, '..'), outFile = path.resolve(here, '../assets/app.css')] = process.argv
const fontDir = 'fonts' // fonts/ sits next to the output CSS

const styles = fs.readFileSync(path.join(repo, 'src/styles.css'), 'utf8')
function block(startPattern) {
  const start = styles.search(startPattern)
  if (start < 0) throw new Error(`block not found: ${startPattern}`)
  let depth = 0
  for (let i = styles.indexOf('{', start); i < styles.length; i++) {
    if (styles[i] === '{') depth++
    else if (styles[i] === '}' && --depth === 0) return styles.slice(start, i + 1)
  }
  throw new Error(`unbalanced block: ${startPattern}`)
}

const css = `
@import "tailwindcss";
@import "shadcn/tailwind.css";
@custom-variant dark (&:is(.dark *));

/* Only the project tokens may produce colours, shadows and fonts. */
@theme {
  --color-*: initial;
  --shadow-*: initial;
  --inset-shadow-*: initial;
  --drop-shadow-*: initial;
  --text-shadow-*: initial;
  --font-serif: initial;
  --font-mono: initial;
}

/* ---- copied verbatim from src/styles.css ---- */
${block(/@theme inline\s*\{/)}
${block(/:root\s*\{/)}
${block(/\.dark\s*\{/)}
${block(/@layer base\s*\{/)}
/* ---- end of copy ---- */

@font-face {
  font-family: 'Geist Variable';
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url(${fontDir}/geist-latin-ext-wght-normal.woff2) format('woff2-variations');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'Geist Variable';
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url(${fontDir}/geist-latin-wght-normal.woff2) format('woff2-variations');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

${fs.readFileSync(path.join(here, 'kit.css'), 'utf8')}
`

const compiler = await compile(css, { base: here, onDependency() {} })
const scanner = new Scanner({
  sources: [{ base: path.resolve(scanDir), pattern: '**/*.{html,js}', negated: false }],
})
const candidates = scanner.scan()
// Tailwind's internal default for --tw-ring-offset-color is #fff; point it at the token instead
// (the shadcn convention is ring-offset-background), so the output holds no colour outside the tokens.
const out = compiler.build(candidates).replaceAll('initial-value: #fff;', 'initial-value: var(--background);').replaceAll('--tw-ring-offset-color: #fff;', '--tw-ring-offset-color: var(--background);')
fs.writeFileSync(outFile, out)
console.log(`wrote ${path.relative(process.cwd(), outFile)} (${(out.length / 1024).toFixed(1)} KB, ${candidates.length} candidates)`)
