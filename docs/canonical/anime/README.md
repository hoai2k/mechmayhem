# `docs/canonical/anime/` — the cel-shaded renditions

One drawing per mech, `mech_<id>.png`, copied verbatim from
`hoai2k/mechbrawler` `docs/canonical/` (the keyed RGBA versions, not the
`originals/` chroma-card deliveries). Same seventeen characters as this
game's roster; same naming quirk — `mech_null.png` is **nullbot**.

They are anime-style, cel-shaded interpretations of the same designs whose
photoreal PBR renderings live one directory up. The geometry they draw is
simpler and more legible than the photoreal set — big faceted panels, clean
silhouettes, flat colour fields with one or two shade steps — which is what
makes them a good reference for a procedural rebuild (see
`docs/ANIME_PROCEDURAL_PLAN.md`).

Note the keyed alpha is imperfect: most files carry chroma-smear noise in
the fully/partially transparent background regions (visible if you composite
onto a light card). The figure pixels themselves are clean; anything that
samples colour from these images must mask by alpha ≥ ~0.95 first.
