/*
 * Pet catalog for Spotify Overlay.
 * Shared between the main process (CommonJS) and renderer pages (global `SO_PETS`).
 *
 * A pet is drawn as inline SVG facing right. Parts carry classes that src/shared/pets.css
 * animates: .pet-body (bob), .pet-eye (blink), .pet-leg-a/.pet-leg-b (walk cycle),
 * .pet-arm-front/.pet-arm-back (carry, show, wave poses), .pet-spark (twinkle),
 * .pet-mouth (smile). The pose is chosen with classes on the wrapper:
 * walking, carrying, showing, happy, waving.
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
      description: 'A friendly little orange helper with a sparkle on its head.',
      armReach: 0.9,
      svg: claudeSvg
    }
  ];

  let uid = 0;

  function claudeSvg() {
    const id = 'pet' + (++uid);
    return `
<svg class="pet-svg" viewBox="0 0 80 72" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="${id}-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ec9a7c"/>
      <stop offset="0.45" stop-color="#d97757"/>
      <stop offset="1" stop-color="#b85d3f"/>
    </linearGradient>
    <linearGradient id="${id}-limb" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c96a4b"/>
      <stop offset="1" stop-color="#9c4a31"/>
    </linearGradient>
    <radialGradient id="${id}-shine" cx="0.3" cy="0.25" r="0.6">
      <stop offset="0" stop-color="#fff" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse class="pet-shadow" cx="38" cy="69" rx="24" ry="3" fill="#000" opacity="0.28"/>
  <circle class="pet-dust pet-dust-a" cx="17" cy="65" r="3" fill="#d9cabb" opacity="0"/>
  <circle class="pet-dust pet-dust-b" cx="27" cy="66" r="2.6" fill="#d9cabb" opacity="0"/>
  <g class="pet-arm pet-arm-back"><rect x="6" y="33" width="14" height="7" rx="3.5" fill="url(#${id}-limb)"/></g>
  <g class="pet-legs">
    <rect class="pet-leg pet-leg-b" x="27" y="45" width="6" height="19" rx="2.5" fill="url(#${id}-limb)"/>
    <rect class="pet-leg pet-leg-b" x="49" y="45" width="6" height="19" rx="2.5" fill="url(#${id}-limb)"/>
    <rect class="pet-leg pet-leg-a" x="19" y="45" width="6" height="20" rx="2.5" fill="url(#${id}-limb)"/>
    <rect class="pet-leg pet-leg-a" x="41" y="45" width="6" height="20" rx="2.5" fill="url(#${id}-limb)"/>
  </g>
  <g class="pet-body">
    <g class="pet-antenna">
      <path d="M38 22 C38 18 39 16 40 13" stroke="#b85d3f" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path class="pet-spark" d="M40.5 2.5 L42.2 8.8 L48.5 10.5 L42.2 12.2 L40.5 18.5 L38.8 12.2 L32.5 10.5 L38.8 8.8 Z" fill="#ffd9a8" stroke="#f0a06a" stroke-width="0.8"/>
    </g>
    <rect x="14" y="20" width="50" height="34" rx="9" fill="url(#${id}-body)"/>
    <rect x="14" y="20" width="50" height="34" rx="9" fill="url(#${id}-shine)"/>
    <rect x="18" y="49" width="42" height="4" rx="2" fill="#000" opacity="0.08"/>
    <ellipse class="pet-blush" cx="33" cy="42" rx="3.6" ry="2" fill="#ff8f8f" opacity="0.55"/>
    <ellipse class="pet-blush" cx="57" cy="42" rx="3.6" ry="2" fill="#ff8f8f" opacity="0.55"/>
    <g class="pet-eyes">
      <rect class="pet-eye" x="36" y="29" width="5" height="9" rx="2" fill="#2a1a12"/>
      <rect class="pet-eye" x="49" y="29" width="5" height="9" rx="2" fill="#2a1a12"/>
      <rect x="37.2" y="30.4" width="1.8" height="2.4" rx="0.9" fill="#fff" opacity="0.9"/>
      <rect x="50.2" y="30.4" width="1.8" height="2.4" rx="0.9" fill="#fff" opacity="0.9"/>
    </g>
    <path class="pet-mouth" d="M41.5 43 Q45 46.5 48.5 43" stroke="#2a1a12" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  </g>
  <g class="pet-arm pet-arm-front"><rect x="58" y="33" width="16" height="7" rx="3.5" fill="url(#${id}-limb)"/><circle cx="73" cy="36.5" r="4" fill="#d97757"/></g>
</svg>`;
  }

  function findPet(id) {
    return PETS.find((p) => p.id === id) || PETS[0];
  }

  return { PETS, findPet };
});
