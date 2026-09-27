# Fonts

The menus' display and label faces, bundled so every machine gets the same
type. The CSS stack used to START with Bahnschrift, which only Windows ships,
so everywhere else the menus quietly fell back to Arial Narrow or Arial.

| File | Face | Used for |
|---|---|---|
| `Oswald-var.woff2` | Oswald, variable 200–700 (latin) | `--font-display`: headings, fighter names, prompts |
| `BarlowSemiCondensed-{500,600,700}.woff2` | Barlow Semi Condensed (latin) | `--font-label`: tags, stats, small caps lines |

Declared once, at the top of `src/style.css` (`@font-face`), which Vite
resolves at build time — hence `src/`, per ASSETS.md.

Both are SIL Open Font License 1.1: `OFL-Oswald.txt`,
`OFL-BarlowSemiCondensed.txt`. Latin subsets from Google Fonts; a language
needing more glyphs falls through to the rest of the stack.

The neon title sign deliberately keeps its own face (the UI stack's heavy
italic) — it is the logo, not a heading.
