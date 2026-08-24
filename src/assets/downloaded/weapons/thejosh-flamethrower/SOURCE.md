# Flamethrower

- Author: TheJosh
- Source page: https://opengameart.org/content/flamethrower-0
- Download URL: https://opengameart.org/sites/default/files/flamethrower_0.png
- License: Creative Commons Zero 1.0 (CC0)
- Downloaded: 2026-08-19
- Original image: `flamethrower_0.png`
- SHA-256: `05b58d1f7fe20aa1148defc8f1e108a7f04944149b9cfc82220566aa9e849133`

The downloaded 2048x2048 RGBA texture is retained as the source artifact. It is a 3D model texture atlas, not a usable sprite. Since 2026-08-22 the Flamethrower sprites contain no pixels from this texture: the top-down gameplay sprite is drawn by `scripts/process_weapon_topdown_assets.py`, and since 2026-08-23 the side-view icon is generated in-project from a text prompt by `scripts/generate_weapon_assets.mjs`. The palette values in those spec files were authored by the project rather than sampled from this texture; it is retained only as a reference for the weapon's component layout (tank, retaining bands, hose, wand).
