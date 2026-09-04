/* ========================================================================
   SHARK RUSH — CUSTOM PNG FISH
   Put PNG files in the SAME folder as index.html and game.js.
   Then add a fish below.
   ======================================================================== */

window.SHARK_RUSH_CUSTOM_FISH = window.SHARK_RUSH_CUSTOM_FISH || [];

window.addCustomFish = function (fish) {
  if (!fish || typeof fish !== 'object') return;
  if (fish.png) {
    const img = new Image();
    img.onload = () => { fish._imageReady = true; };
    img.onerror = () => { fish._imageFailed = true; console.warn('[Custom Fish] Could not load:', fish.png); };
    img.src = fish.png;
    fish._image = img;
  }
  window.SHARK_RUSH_CUSTOM_FISH.push(fish);
};

/* ======================== ADD CUSTOM PNG FISH HERE ======================== */

window.addCustomFish({
  id: 'my_custom_fish',
  name: 'My Custom Fish',

  // PNG FILE IN YOUR MAIN GITHUB FOLDER:
  png: 'golden_gumpy.png',

  // Hitbox / game size:
  r: 22,

  // Optional PNG display size:
  pngWidth: 70,
  pngHeight: 50,

  tier: 1,
  speed: 95,
  turn: 4,
  xp: 8,
  coin: 4,
  behavior: 'school',
  body: 'fish',

  // Optional eat-particle colours (safe defaults are also added by game.js):
  colA: '#74e6ff',
  colB: '#287bb8'
});

/*
COPY/PASTE THIS FOR MORE PNG FISH:

window.addCustomFish({
  id: 'red_fish',
  name: 'Red Fish',
  png: './red-fish.png',
  r: 25,
  pngWidth: 80,
  pngHeight: 55,
  tier: 2,
  speed: 110,
  turn: 3.5,
  xp: 15,
  coin: 6,
  behavior: 'wander',
  body: 'fish'
});
*/
