const C = {R:'#D6251A', RD:'#A2160E', P:'#EEE5D2', PD:'#D9CDB2', K:'#13100F', G:'#E8B43A'};
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const starPts = (cx, cy, r) => { let s = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * .382 : r; s += (cx + Math.cos(a) * q).toFixed(1) + ',' + (cy + Math.sin(a) * q).toFixed(1) + ' '; } return s; };
const bands = (ang, fill, op, gap = 46, wd = 15) => { let s = ''; for (let y = -220; y < 620; y += gap) s += `<rect x="-250" y="${y}" width="800" height="${wd}"/>`; return `<g fill="${fill}" opacity="${op}" transform="rotate(${ang} 150 200)">${s}</g>`; };
const dots = (seed, n, fill, y0 = 0, y1 = 400) => { const r = rng(seed); let s = ''; for (let i = 0; i < n; i++) s += `<circle cx="${(r() * 300).toFixed(1)}" cy="${(y0 + r() * (y1 - y0)).toFixed(1)}" r="${(.6 + r() * 1.7).toFixed(2)}"/>`; return `<g fill="${fill}">${s}</g>`; };
const flower = (x, y, r) => { let s = ''; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 5; s += `<circle cx="${(x + Math.cos(a) * r * .62).toFixed(1)}" cy="${(y + Math.sin(a) * r * .62).toFixed(1)}" r="${(r * .56).toFixed(1)}"/>`; } return `<g fill="${C.R}" stroke="${C.P}" stroke-width="1.3">${s}</g><circle cx="${x}" cy="${y}" r="${(r * .3).toFixed(1)}" fill="${C.G}"/>`; };
const ART = {
  xue: () => `
    <rect width="300" height="400" fill="${C.R}"/>${bands(-28, C.RD, .6, 44, 17)}
    <polygon points="${starPts(204, 122, 74)}" fill="none" stroke="${C.P}" stroke-width="1.2" opacity=".55"/><polygon points="${starPts(204, 122, 54)}" fill="${C.P}"/>
    <path d="M0,246 L28,220 L54,238 L92,200 L128,240 L160,214 L196,250 L236,210 L270,240 L300,218 L300,400 L0,400Z" fill="${C.RD}"/>
    <path d="M0,296 L34,254 L58,276 L104,210 L140,266 L170,238 L214,290 L250,256 L300,304 L300,400 L0,400Z" fill="${C.P}"/>
    <path d="M104,210 L140,266 L126,312 L113,262Z M34,254 L58,276 L48,312 L39,280Z M170,238 L214,290 L196,326 L181,284Z M250,256 L300,304 L300,338 L263,296Z" fill="${C.K}"/>
    <path d="M104,210 L96,246 L84,262Z M170,238 L166,270 L154,280Z M250,256 L246,286 L234,296Z" fill="${C.PD}"/>
    <path d="M0,356 L46,330 L88,348 L132,316 L176,344 L220,322 L262,342 L300,326 L300,400 L0,400Z" fill="${C.K}"/>
    <path d="M0,353 L46,327 L88,345 L132,313 L176,341 L220,319 L262,339 L300,323" fill="none" stroke="${C.R}" stroke-width="4.5" stroke-linejoin="round"/>
    <path d="M0,348 L46,322 L88,340 L132,308 L176,336 L220,314 L262,334 L300,318" fill="none" stroke="${C.R}" stroke-width="3.4" stroke-dasharray="3.2 3.2"/>
    <g fill="${C.R}"><path d="M40,330 v-16 h3 v3 h3 v-3 h3 v3 h3 v-3 h3 v16z"/><path d="M125,316 v-18 h3 v3 h3 v-3 h3 v3 h3 v-3 h3 v18z"/><path d="M213,322 v-16 h3 v3 h3 v-3 h3 v3 h3 v-3 h3 v16z"/></g>
    ${dots(19, 70, C.P)}`,
  changzheng: () => `
    <rect width="300" height="400" fill="${C.P}"/>${bands(-28, C.R, .13, 44, 17)}
    <path d="M0,262 L30,236 L64,256 L104,214 L146,252 L186,226 L228,262 L266,238 L300,258 L300,400 L0,400Z" fill="${C.R}"/>
    <path d="M0,302 L44,278 L86,306 L128,272 L172,310 L208,286 L252,314 L300,290 L300,400 L0,400Z" fill="${C.RD}"/>
    <g fill="none" stroke="${C.P}" stroke-width="1.6" opacity=".8"><path d="M104,372 l9,-5 9,5 9,-5 9,5 9,-5 9,5 9,-5 9,5 9,-5 9,5 9,-5 9,5"/><path d="M100,384 l9,-5 9,5 9,-5 9,5 9,-5 9,5 9,-5 9,5 9,-5 9,5 9,-5 9,5 9,-5"/><path d="M104,396 l9,-5 9,5 9,-5 9,5 9,-5 9,5 9,-5 9,5 9,-5 9,5 9,-5 9,5"/></g>
    <path d="M0,400 L0,318 L56,306 L96,324 L110,360 L100,400Z" fill="${C.K}"/><path d="M300,400 L300,304 L264,298 L222,314 L204,352 L212,400Z" fill="${C.K}"/>
    <g fill="none" stroke="${C.K}" stroke-width="1.5"><path d="M96,324 Q154,354 222,314"/><path d="M97,329 Q154,360 221,319"/><path d="M98,334 Q154,366 220,324"/><path d="M99,339 Q154,372 219,329"/></g>
    <g stroke="${C.K}" stroke-width="1"><path d="M116,333 v14 M134,340 v14 M154,343 v15 M176,340 v14 M198,331 v14"/></g>
    <path d="M56,308 V66" stroke="${C.K}" stroke-width="3.6"/><circle cx="56" cy="64" r="4" fill="${C.K}"/>
    <path d="M57,72 C96,54 134,96 182,80 C216,69 248,82 284,64 L276,160 C244,178 214,160 182,174 C134,192 98,152 57,170Z" fill="${C.R}"/>
    <path d="M182,80 C216,69 248,82 284,64 L276,160 C244,178 214,160 182,174Z" fill="${C.RD}" opacity=".55"/>
    <polygon points="${starPts(96, 108, 19)}" fill="${C.G}"/>
    <g fill="${C.K}"><path d="M150,249 l2,-7 2,7z M158,244 l2,-7 2,7z M166,239 l2,-7 2,7z M174,234 l2,-7 2,7z M182,229 l2,-7 2,7z"/></g>`,
  yongmei: () => `
    <rect width="300" height="400" fill="${C.K}"/>${bands(-28, C.P, .05, 44, 17)}
    <rect x="88" y="50" width="204" height="204" fill="none" stroke="${C.R}" stroke-width="1.2" opacity=".7" transform="rotate(14 190 152)"/><rect x="104" y="66" width="172" height="172" fill="${C.R}" transform="rotate(14 190 152)"/>
    <path d="M0,0 L88,0 L68,56 L96,116 L62,180 L86,250 L52,320 L74,400 L0,400Z" fill="${C.P}"/>
    <path d="M88,0 L68,56 L42,30Z M96,116 L62,180 L46,122Z M86,250 L52,320 L36,264Z" fill="${C.PD}"/>
    <path d="M70,60 l4,30 5,-24z M80,84 l3,24 5,-18z M66,186 l4,28 5,-22z M76,214 l3,22 5,-17z M58,326 l4,26 5,-20z" fill="${C.P}"/>
    <g fill="none" stroke="${C.P}" stroke-linecap="round"><path d="M56,336 C112,322 140,274 170,238 C198,206 234,178 262,104" stroke-width="7"/><path d="M170,238 C162,212 164,188 150,160" stroke-width="4"/><path d="M216,190 C238,188 254,196 278,184" stroke-width="3.5"/><path d="M242,150 C228,132 214,126 202,104" stroke-width="3"/><path d="M112,304 C122,290 120,272 128,256" stroke-width="3"/></g>
    ${flower(150, 158, 12)}${flower(262, 102, 11)}${flower(278, 184, 9)}${flower(202, 102, 9)}${flower(128, 254, 9)}${flower(192, 214, 10)}${flower(234, 168, 7)}${flower(96, 320, 7)}
    ${dots(33, 60, C.P)}`
};

export function artwork(index) {
  const key = ['xue', 'changzheng', 'yongmei'][index];
  return `<svg viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${ART[key]()}</svg>`;
}
