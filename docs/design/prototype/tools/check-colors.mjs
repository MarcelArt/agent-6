// Acceptance check: no colour values outside the tokens copied from src/styles.css.
// Usage: node check-colors.mjs <file> [<file> ...]   (HTML, CSS or JS)
//
// Removes the verbatim :root { } and .dark { } token blocks, then reports any hex,
// rgb/hsl/oklch/oklab/lab/lch/color() literal or named colour that remains.
// Allowed: transparent, currentColor, inherit, Tailwind's `#0000` initial values for
// ring/shadow custom properties, and its `color-mix(in lab, red, red)` / `rgb(from red r g b)`
// @supports feature tests (capability probes, never painted).
import fs from 'node:fs'

const named = 'black|white|red|green|blue|gray|grey|silver|maroon|purple|fuchsia|lime|olive|yellow|navy|teal|aqua|orange|pink|brown|gold|indigo|violet|cyan|magenta|beige|ivory|khaki|lavender|salmon|tan|coral|crimson|tomato|chocolate|plum|orchid|wheat|azure|snow|linen'
const patterns = [
  /#[0-9a-f]{3,8}\b/gi,
  /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(/gi,
  new RegExp(`(?<![\\w-])(?:${named})(?![\\w-])`, 'gi'),
]
let bad = 0
for (const file of process.argv.slice(2)) {
  let src = fs.readFileSync(file, 'utf8')
  src = src.replace(/:root\s*\{[^{}]*--background:[^{}]*\}/g, '').replace(/\.dark\s*\{[^{}]*--background:[^{}]*\}/g, '')
  src = src.replace(/@supports \(color: color-mix\(in lab, red, red\)\)/g, '').replace(/\(color:rgb\(from red r g b\)\)/g, '')
  src = src.replace(/#0000\b/g, '')
  if (/\.html$/.test(file)) {
    // only inspect markup attributes and <style>/<script> code, not visible prose
    src = [...src.matchAll(/(?:class|style|fill|stroke|color|bgcolor)="[^"]*"|<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g)].map((m) => m[0]).join('\n')
  }
  const hits = new Set()
  for (const re of patterns) for (const m of src.matchAll(re)) {
    const ctx = src.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ')
    // utility class names such as `fill-primary` are not colour values
    if (/^[a-z]+$/i.test(m[0]) && /(?:class|aria-label)="[^"]*$/.test(src.slice(Math.max(0, m.index - 400), m.index))) continue
    hits.add(`${m[0]}  …${ctx}…`)
  }
  if (hits.size) { bad += hits.size; console.log(`${file}: ${hits.size} colour value(s) outside the tokens`); for (const h of [...hits].slice(0, 20)) console.log('   ' + h) }
  else console.log(`${file}: clean`)
}
process.exit(bad ? 1 : 0)
