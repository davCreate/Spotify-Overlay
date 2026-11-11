/*
 * Pet catalog for Spotify Overlay.
 * Shared between the main process (CommonJS) and renderer pages (global `SO_PETS`).
 *
 * A pet is drawn as inline SVG facing right, in a blocky pixel style. Parts carry classes that
 * src/shared/pets.css animates: .pet-body (bob), .pet-eye (blink), .pet-leg-a/.pet-leg-b (walk
 * cycle), .pet-arm-front/.pet-arm-back (carry, show, wave, dance poses), .pet-mouth (smile).
 * The pose is chosen with classes on the wrapper: walking, carrying, showing, happy, dancing,
 * waving.
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
      description: 'A blocky orange pixel buddy with stubby arms and legs and big black eyes.',
      armReach: 0.97,
      svg: clawdSvg
    }
  ];

  let uid = 0;

  /*
   * Pixel grid (1 unit = one "pixel" of the mascot), viewBox 90 x 56:
   *   head/body  x 10..80, y 0..30 (with a small notch on top)
   *   eyes       two tall black pixels at y 8..22
   *   arms       one pixel block on each side at y 10..20
   *   legs       four short blocks under the body, y 30..46
   */
  function clawdSvg() {
    const id = 'pet' + (++uid);
    return `
<svg class="pet-svg" viewBox="0 0 90 56" aria-hidden="true" focusable="false" shape-rendering="crispEdges">
  <defs>
    <linearGradient id="${id}-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e4835f"/>
      <stop offset="1" stop-color="#cc6443"/>
    </linearGradient>
  </defs>
  <ellipse class="pet-shadow" cx="45" cy="53" rx="34" ry="2.6" fill="#000" opacity="0.28"/>
  <rect class="pet-dust pet-dust-a" x="6" y="49" width="6" height="4" fill="#d9cabb" opacity="0"/>
  <rect class="pet-dust pet-dust-b" x="16" y="50" width="5" height="3" fill="#d9cabb" opacity="0"/>
  <g class="pet-arm pet-arm-back"><rect x="0" y="10" width="10" height="10" fill="#b95a3c"/></g>
  <g class="pet-legs">
    <rect class="pet-leg pet-leg-b" x="10" y="30" width="10" height="16" fill="#b95a3c"/>
    <rect class="pet-leg pet-leg-a" x="30" y="30" width="10" height="16" fill="#b95a3c"/>
    <rect class="pet-leg pet-leg-b" x="50" y="30" width="10" height="16" fill="#b95a3c"/>
    <rect class="pet-leg pet-leg-a" x="70" y="30" width="10" height="16" fill="#b95a3c"/>
  </g>
  <g class="pet-body">
    <path d="M10 0 H36 V4 H54 V0 H80 V30 H10 Z" fill="url(#${id}-body)"/>
    <rect class="pet-eye" x="22" y="8" width="10" height="14" fill="#1d1410"/>
    <rect class="pet-eye" x="58" y="8" width="10" height="14" fill="#1d1410"/>
    <path class="pet-mouth" d="M36 25 H54" stroke="#1d1410" stroke-width="3" fill="none"/>
  </g>
  <g class="pet-arm pet-arm-front"><rect x="80" y="10" width="10" height="10" fill="#cc6443"/></g>
</svg>`;
  }

  function findPet(id) {
    return PETS.find((p) => p.id === id) || PETS[0];
  }

  return { PETS, findPet };
});
