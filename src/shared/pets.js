/*
 * Pet catalog for Spotify Overlay.
 * Shared between the main process (CommonJS) and renderer pages (global `SO_PETS`).
 *
 * A pet is drawn as inline SVG facing right, in a blocky pixel style. Colors come from CSS
 * variables (see PALETTES and src/shared/pets.css), so every pet can be recolored. Accessories
 * are optional SVG groups shown with data-acc on the wrapper.
 *
 * Parts carry classes that src/shared/pets.css animates: .pet-body, .pet-eye (blink, look,
 * sleep), .pet-leg-a/.pet-leg-b (walk, tap), .pet-arm-front/.pet-arm-back (carry, show, wave,
 * dance, stretch), .pet-mouth and .pet-yawn. The pose is a class on the wrapper.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SO_PETS = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * `armReach` is how far (0..1 of the pet's width) the front arm reaches when carrying:
   * the overlay card is held at that point.
   */
  const PETS = [
    {
      id: 'claude',
      name: 'Claude',
      description: 'A blocky pixel buddy with stubby arms and legs and big black eyes.',
      armReach: 0.97,
      svg: clawdSvg
    }
  ];

  /** Body colors. `top`/`bottom` shade the body, `limb` the arms and legs, `dark` the front arm. */
  const PALETTES = {
    orange: { top: '#e4835f', bottom: '#cc6443', limb: '#b95a3c', dark: '#cc6443' },
    blue: { top: '#7fb0ff', bottom: '#3f73d9', limb: '#2f5cb8', dark: '#3f73d9' },
    green: { top: '#86d9a2', bottom: '#3fa76a', limb: '#2f8a56', dark: '#3fa76a' },
    purple: { top: '#bd96ff', bottom: '#8358d6', limb: '#6a40b5', dark: '#8358d6' },
    pink: { top: '#ff9fc7', bottom: '#e0609a', limb: '#bf4c7e', dark: '#e0609a' },
    graphite: { top: '#959dab', bottom: '#4f5663', limb: '#3a404b', dark: '#4f5663' }
  };

  /** Accessories the pet can wear. 'none' shows nothing. */
  const ACCESSORIES = ['none', 'tophat', 'headphones', 'bowtie', 'glasses'];

  let uid = 0;

  /*
   * Pixel grid (1 unit = one "pixel" of the mascot), viewBox 90 x 56:
   *   head/body  x 10..80, y 0..30 (with a small notch on top)
   *   eyes       two tall pixels at y 8..22
   *   arms       one pixel block on each side at y 10..20
   *   legs       four short blocks under the body, y 30..46
   * Accessories sit above (negative y, the svg overflows visibly) or on the body.
   */
  function clawdSvg() {
    const id = 'pet' + (++uid);
    return `
<svg class="pet-svg" viewBox="0 0 90 56" aria-hidden="true" focusable="false" shape-rendering="crispEdges">
  <defs>
    <linearGradient id="${id}-body" x1="0" y1="0" x2="0" y2="1">
      <stop class="pet-stop-top" offset="0"/>
      <stop class="pet-stop-bottom" offset="1"/>
    </linearGradient>
  </defs>
  <ellipse class="pet-shadow" cx="45" cy="53" rx="34" ry="2.6" fill="#000" opacity="0.28"/>
  <rect class="pet-dust pet-dust-a" x="6" y="49" width="6" height="4" fill="#d9cabb" opacity="0"/>
  <rect class="pet-dust pet-dust-b" x="16" y="50" width="5" height="3" fill="#d9cabb" opacity="0"/>
  <g class="pet-arm pet-arm-back"><rect class="pet-skin-limb" x="0" y="10" width="10" height="10"/></g>
  <g class="pet-legs">
    <rect class="pet-leg pet-leg-b pet-skin-limb" x="10" y="30" width="10" height="16"/>
    <rect class="pet-leg pet-leg-a pet-skin-limb" x="30" y="30" width="10" height="16"/>
    <rect class="pet-leg pet-leg-b pet-skin-limb" x="50" y="30" width="10" height="16"/>
    <rect class="pet-leg pet-leg-a pet-skin-limb" x="70" y="30" width="10" height="16"/>
  </g>
  <g class="pet-body">
    <path d="M10 0 H36 V4 H54 V0 H80 V30 H10 Z" fill="url(#${id}-body)"/>
    <rect class="pet-eye pet-ink" x="22" y="8" width="10" height="14"/>
    <rect class="pet-eye pet-ink" x="58" y="8" width="10" height="14"/>
    <path class="pet-mouth pet-ink-stroke" d="M36 25 H54" stroke-width="3" fill="none"/>
    <ellipse class="pet-yawn pet-ink" cx="45" cy="25" rx="6" ry="5" opacity="0"/>
    <g class="pet-acc pet-acc-tophat">
      <rect class="pet-acc-fill" x="28" y="-16" width="34" height="16"/>
      <rect class="pet-acc-fill" x="20" y="-3" width="50" height="4"/>
    </g>
    <g class="pet-acc pet-acc-headphones">
      <path class="pet-acc-stroke" d="M12 8 Q45 -16 78 8" fill="none" stroke-width="3.5"/>
      <rect class="pet-acc-fill" x="7" y="6" width="7" height="13"/>
      <rect class="pet-acc-fill" x="76" y="6" width="7" height="13"/>
    </g>
    <g class="pet-acc pet-acc-glasses">
      <rect class="pet-acc-stroke" x="18" y="6" width="14" height="18" rx="3" fill="none" stroke-width="2.5"/>
      <rect class="pet-acc-stroke" x="58" y="6" width="14" height="18" rx="3" fill="none" stroke-width="2.5"/>
      <path class="pet-acc-stroke" d="M32 13 H58" stroke-width="2.5"/>
    </g>
    <path class="pet-acc pet-acc-bowtie pet-acc-fill" d="M34 19 L45 24 L34 29 Z M56 19 L45 24 L56 29 Z"/>
  </g>
  <g class="pet-arm pet-arm-front"><rect class="pet-skin-dark" x="80" y="10" width="10" height="10"/></g>
</svg>`;
  }

  function findPet(id) {
    return PETS.find((p) => p.id === id) || PETS[0];
  }

  /* Short lines the pet says when it shows the card (translated in the app). */
  const SAY_LINES = ['Ta-da!', 'Here we go!', 'Ooh, new song!', 'Feel this one!', 'Turn it up!'];

  return { PETS, PALETTES, ACCESSORIES, SAY_LINES, findPet };
});
