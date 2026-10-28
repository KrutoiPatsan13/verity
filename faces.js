// Рисует лицо-смайлик каждой версии Верити (SVG 100x100).

(function () {
  const INK = "#1a1a1a";

  function heart(cx, cy) {
    return `<path d="M${cx} ${cy + 7} C${cx - 12} ${cy - 1}, ${cx - 7} ${cy - 12}, ${cx} ${cy - 4} C${cx + 7} ${cy - 12}, ${cx + 12} ${cy - 1}, ${cx} ${cy + 7} Z" fill="#e91e63"/>`;
  }

  const EYES = {
    ovals: () =>
      `<ellipse cx="36" cy="38" rx="5" ry="8" fill="${INK}"/><ellipse cx="64" cy="38" rx="5" ry="8" fill="${INK}"/>`,
    angry: () =>
      `<ellipse cx="36" cy="40" rx="5" ry="6" fill="#ffeb3b"/><ellipse cx="64" cy="40" rx="5" ry="6" fill="#ffeb3b"/>
       <circle cx="36" cy="41" r="2.5" fill="${INK}"/><circle cx="64" cy="41" r="2.5" fill="${INK}"/>
       <path d="M26 28 L44 34 M74 28 L56 34" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
    wink: () =>
      `<ellipse cx="36" cy="38" rx="5" ry="8" fill="${INK}"/>
       <path d="M57 40 Q64 33 71 40" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    hearts: () => heart(36, 38) + heart(64, 38),
    big: () =>
      `<circle cx="35" cy="38" r="11" fill="#fff"/><circle cx="65" cy="38" r="11" fill="#fff"/>
       <circle cx="37" cy="40" r="6" fill="${INK}"/><circle cx="67" cy="40" r="6" fill="${INK}"/>
       <circle cx="39" cy="37" r="2" fill="#fff"/><circle cx="69" cy="37" r="2" fill="#fff"/>`,
    narrow: () =>
      `<path d="M28 41 L44 39 M56 39 L72 41" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
       <path d="M26 30 L44 35 M74 30 L56 35" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`,
    happy: () =>
      `<path d="M29 41 Q36 32 43 41 M57 41 Q64 32 71 41" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    void: () =>
      `<circle cx="36" cy="40" r="10" fill="#0a0a0a"/><circle cx="64" cy="40" r="10" fill="#0a0a0a"/>
       <circle cx="38" cy="42" r="1.8" fill="#ff5252"/><circle cx="66" cy="42" r="1.8" fill="#ff5252"/>`,
  };

  const MOUTHS = {
    smile: () =>
      `<path d="M24 58 Q50 84 76 58" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`,
    fangs: () =>
      `<path d="M26 60 Q50 88 74 60 Z" fill="#3e0d0d"/>
       <path d="M32 61 L36 71 L40 62 Z M60 62 L64 71 L68 61 Z" fill="#fff"/>`,
    smirk: () =>
      `<path d="M36 66 Q56 74 72 58" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`,
    o: () => `<ellipse cx="50" cy="69" rx="7" ry="9" fill="${INK}"/>`,
    flat: () =>
      `<path d="M34 70 Q50 64 66 70" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`,
    chew: () =>
      `<path d="M34 66 q8 7 16 0 q8 -7 16 0" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
       <circle cx="72" cy="74" r="2" fill="#8d5524"/><circle cx="77" cy="69" r="1.5" fill="#8d5524"/>`,
    stitch: () =>
      `<path d="M30 68 L70 68" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
       <path d="M35 63 L35 73 M43 63 L43 73 M51 63 L51 73 M59 63 L59 73 M67 63 L67 73" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`,
  };

  window.faceSVG = function (face) {
    const rx = face.chubby ? 49 : 46;
    const ry = face.chubby ? 44 : 46;
    const cheeks = face.chubby
      ? `<ellipse cx="22" cy="58" rx="9" ry="6" fill="#ff8a80" opacity=".6"/><ellipse cx="78" cy="58" rx="9" ry="6" fill="#ff8a80" opacity=".6"/>`
      : "";
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="50" cy="52" rx="${rx}" ry="${ry}" fill="${face.skin}"/>
      ${cheeks}${EYES[face.eyes]()}${MOUTHS[face.mouth]()}
    </svg>`;
  };
})();
