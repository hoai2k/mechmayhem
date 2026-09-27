# Menu redesign concepts

Mockups of three redesigns of the title screen and fighter select, built from
the game's own assets. `0_current_*` is the shipped state they respond to.

| Files | Concept |
|---|---|
| `A1_title_{neon,ruins,volcano}.jpg`, `A2_select.jpg` | **A — The city is the menu.** The menus stand in a real corner of a real arena (hero props, painted horizon, real mechs, engine lighting); the title rotates arenas per visit. Rendered in-engine with `tools/scratch/menudiorama.mjs`. No new art. |
| `B1_title.jpg`, `B2_select.jpg`, `B3_select4p.jpg` | **B — Fight night.** A broadcast / fight-card package in 2D; classic versus select, split panels for 3–4 players. Uses posters today; the hero cards in `docs/image-requests.md` upgrade it. |
| `C1_title.jpg`, `C2_select.jpg` | **C — The hangar.** A launch bay with the sign over the bay door; select as four bays under a roster board (Smash-style, in the world). The hangar here is CSS; the real one needs the two backplates in `docs/image-requests.md`. |

Shared rules in every concept: the neon sign is untouched; one roster block;
each player's info on their own card (lore moves behind a Y move list); empty
seats read "Press A to join"; four button prompts instead of eight; Oswald
shipped as a webfont.
