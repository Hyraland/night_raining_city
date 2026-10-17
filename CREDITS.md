# Credits

- "Blue Whale - Textured" by Bohdan Lvov (https://sketchfab.com/ostapblendercg), licensed CC-BY-4.0:
  https://sketchfab.com/3d-models/blue-whale-textured-d24d19021c724c3a9134eebcb76b0e0f.
  - `assets/whale.glb` (built by `blender/build_whale.py`) takes its proportions from it; that whale is
    modelled anew from measured profiles, no mesh or texture of the original is used.
  - `assets/whale_ref.glb` (made by `blender/convert_reference_whale.py`) is the original's mesh itself, changed:
    put in its rest pose, scaled and turned, its textures, skeleton and animation left out, new UVs and vertex
    colours added for the hologram.

- The mammoth's skeleton (`assets/museum/mammoth.glb`, not shown at present, kept for later): *Mammuthus primigenius*
  (Blumbach), Pleistocene, Alaska, USNM V23792, from the Smithsonian 3D Digitization program, CC0:
  https://3d.si.edu/object/3d/mammoth:341c96cd-f967-4540-8ed1-d3fc56d31f12 . Courtesy of the Smithsonian
  Institution, National Museum of Natural History, Department of Paleobiology.

- The fossils in the museum's walk through time (`assets/museum/`), the same scans as in the earth_history
  project (see its assets/models/SOURCES.md), drawn here without their textures, in the city's own tones:
  Sketchfab, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/):
  `cetotherium.glb` — "Cetotherium riabinini assembled skeleton" by SchmalhausenEvolMorph
  (https://sketchfab.com/3d-models/cetotherium-riabinini-assembled-skeleton-8532da04db044d9c8417fcec43053e3a);
  `stegosaurus.glb` — "Stegosaurus Skeleton" by Artec 3D
  (https://sketchfab.com/3d-models/stegosaurus-skeleton-dc6e1c748484449587b81426d41da6cb).
  Changed: textures left out, drawn in flat tones, scaled and placed.

- Icons from game-icons.net (https://game-icons.net, https://github.com/game-icons/icons), licensed CC BY 3.0
  (https://creativecommons.org/licenses/by/3.0/), used as silhouettes in the brands' cases (`assets/icons/game-icons/`,
  unchanged): `cake-slice.svg` by Lorc; `cupcake.svg`, `donut.svg`, `stairs-cake.svg`, `ice-cream-cone.svg`,
  `croissant.svg` by Delapouite; `monstera-leaf.svg` by Delapouite (光合书店's logo); `high-tide.svg` by Delapouite (潮汐能源's logo).

- `assets/icons/material/icecream.svg`, `cloud.svg`, `bedtime.svg`, `emoji_food_beverage.svg`, `coffee.svg`: the
  "icecream", "cloud", "bedtime" (a crescent moon), "emoji_food_beverage" (a cup) and "coffee" symbols of Google's
  Material Symbols (rounded, filled; https://fonts.google.com/icons), Apache License 2.0; on 云上冰淇淋's, 落月摇情's
  and 浮岛咖啡's signs, 浮岛咖啡's menu (its cups) and its ad (the cup on the cloud).

- The cat over the street (`assets/cat.glb`, the same file as the earth_history project's): "Medium poly Cat In
  Motion 3d Model Free" by iRahulRajput, CC BY 4.0
  (https://sketchfab.com/3d-models/medium-poly-cat-in-motion-3d-model-free-5c31c77904de4e458d434c167ea0f4bc);
  its textures compressed; its moving (sitting, licking, walking, running, looking round) done in `src/holoCat.js`'s
  vertex shader, after earth_history's `src/walker.js`.

- `assets/icons/noto/` (cat, rabbit, fox, bear, panda, frog, penguin, hamster, dog, tiger, koala, mouse, pig, paws,
  yarn, fish; croissant, baguette, bread, bagel, pretzel, waffle, pancakes, doughnut, cookie, pie, wheat, flatbread,
  butter, honey, milk, coffee, sandwich, sunset; blossom; ramen; onigiri, juice, bento, tissue, candy, umbrella, toothbrush, egg, straw, chocolate,
  battery, soap, lotion): glyphs of Google's Noto Emoji, the single-colour font (https://fonts.google.com/noto/specimen/Noto+Emoji,
  https://github.com/google/fonts/tree/main/ofl/notoemoji), SIL Open Font License 1.1 (`assets/icons/noto/OFL.txt`).
  Changed: each glyph's outline taken out of the font at its default weight and set in a 512 square, white; for
  喵星杂货's blind boxes, machines and cases, 夕光烘焙's breads and 白云乡's flowers.
