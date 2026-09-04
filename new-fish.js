/* ========================================================================
   SHARK RUSH — CUSTOM FISH PACK
   Paste or add your custom fish objects below.
   game.js reads this file automatically on startup.
   ======================================================================== */

window.SHARK_RUSH_CUSTOM_FISH = window.SHARK_RUSH_CUSTOM_FISH || [];

// Helper: register one fish safely.
window.addCustomFish = function (fish) {
  if (!fish || typeof fish !== 'object') return;
  window.SHARK_RUSH_CUSTOM_FISH.push(fish);
};

/* ======================== ADD CUSTOM FISH HERE ======================== */

window.addCustomFish({
  id: 'golden_guppy',          // Must be unique
  name: 'Golden Guppy',
  tier: 1,                     // 0=tiny, 1=small, 2=medium, 3=large, 4=apex
  r: 18,                       // Size/radius
  speed: 105,
  turn: 4.5,
  xp: 8,
  coin: 4,
  body: 'fish',                // fish, shrimp, squid, crab, jelly, ray, eel, predator
  colA: '#ffe46b',
  colB: '#e39b24',
  behavior: 'school'           // school, wander, hide, drift, glide, predator, ambush
});

/*
PASTE MORE FISH LIKE THIS:

window.addCustomFish({
  id: 'my_new_fish',
  name: 'My New Fish',
  tier: 2,
  r: 24,
  speed: 90,
  turn: 3,
  xp: 12,
  coin: 5,
  body: 'fish',
  colA: '#00d9ff',
  colB: '#0066aa',
  behavior: 'wander'
});
*/
