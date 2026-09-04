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
    img.src = fish.png;
    fish._image = img;
  }
  window.SHARK_RUSH_CUSTOM_FISH.push(fish);
};

/* ======================== ADD CUSTOM PNG FISH HERE ======================== */
window.addCustomFish({
  id: 'gold_blue',
  name: 'Gold_blue',
  png: 'golden_guppy.png',
  r: 22,
  pngWidth: 70,
  pngHeight: 50,
  tier: 1,
  speed: 95,
  turn: 4,
  xp: 8,
  coin: 4,
  behavior: 'school',
  body: 'fish'
});
window.addCustomFish({
  id: 'my_custom_fish',
  name: 'My Custom Fish',

  // PNG FILE IN YOUR MAIN GITHUB FOLDER:
  png: './my-custom-fish.png',

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
  body: 'fish'
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
