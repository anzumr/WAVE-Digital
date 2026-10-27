/*!
 * WAVE Digital - hero background "Brand Ribbons" (wave-bg.js)
 * ---------------------------------------------------------------------------
 * Layered, glossy bands of water in the WAVE logo's blues, tinted toward the
 * site's teal. When the page has loaded the tide sweeps in from the
 * bottom-left, the front band curls into a crest and bursts into spray, and
 * the logo surfaces through the splash. Afterwards sets of swell roll in every
 * 6-9s, a slow gloss travels along every band, the wind tears spray off the
 * front crest, and the pointer lights (lantern), stirs, sparks and splashes
 * the water. Clicking the sky drops a glowing bead into the sea.
 *
 * Classic script: no modules, no dependencies, no network, works from file://.
 *
 *   var bg = window.WaveBackground.mount(canvas, {
 *     logo:    el,     // .hero-art - surfaces out of the water and rides it
 *     textEl:  el,     // .hero-inner - water, spray and sparks keep clear of the copy
 *     onBreak: fn,     // called once when the intro wave breaks (right away when
 *                      //   there is no intro: reduced motion, intro:false, fallbacks)
 *     intro: true,           // play the tide-in intro
 *     interactive: true,     // pointer lantern / wake / sparks, click splash, sky bead
 *     reducedMotion: undefined, // true = still frame, false = force motion, undefined = follow the OS
 *     renderer: 'auto',      // 'auto' | '2d' (force the Canvas 2D renderer)
 *     debug: false           // adds stats() and _debug to the returned object (QA only);
 *                            //   a debug mount also honours tier: 'full' | 'lite'
 *   });
 *   bg.splash(0.7, 0.65);    // fractions of the hero size
 *   bg.destroy();
 *
 * Renderer chain: WebGL -> Canvas 2D on a sibling canvas (on GL init/shader
 * failure, a render exception or context loss; back to WebGL when the context
 * is restored) -> static CSS backdrop of the hero (logo shown whole).
 *
 * Cost: nothing is drawn while the page scrolls (the last frame slides away with
 * the hero; the water carries on ~150 ms after the scroll stops), nor while the
 * hero is off screen or the tab hidden - so what it costs at rest never touches
 * scrolling, and it trades frame rate, never sharpness, for that cost:
 *  - 'full' (a GPU): the screen's own pixels up to DPR 2 (5.6 Mpx; 1.9 Mpx on
 *    phones) at up to 60 fps. Frames over budget at rest step the frame rate
 *    down first (60 -> 45 -> 30 -> 24 fps); only then the buffer, 15% a step,
 *    never below 1 buffer px per CSS px. A steady 30 Hz (Chrome's Energy Saver)
 *    or other display rate is recognised as the refresh, not as overload. Only
 *    the smooth sky (gradient, haze, halo) is shaded at half resolution and
 *    blitted with a full-resolution dither: indistinguishable from full.
 *  - 'lite' (WebGL drawn in software - SwiftShader, llvmpipe, WARP... - or no
 *    WebGL at all): 1 buffer px per CSS px (min 0.75) at a lower frame rate
 *    (24 -> 20 -> 15 -> 12 fps), simpler shading, fewer particles.
 * Add ?wave=info to the page URL for a small readout of the renderer, GPU,
 * buffer and frame rate this browser uses.
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var TAU = Math.PI * 2;
  var noop = function () {};
  var CORNERS = [-1, -1, 1, -1, -1, 1, 1, 1];   // fx quad corners (hoisted: no per-quad allocation)
  var TILE = 64;                                // GLSL value noise repeats every 64 lattice units
  var K_DROP = 0, K_MIST = 1, K_RING = 2, K_BIO = 3, K_BEAD = 4, K_PUFF = 5, K_BLOOM = 6;

  /* ------------------------------------------------------------------ utils */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function eOut(t) { t = clamp(t, 0, 1); var u = 1 - t; return 1 - u * u * u; }
  function eInOut(t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  // Time terms are wrapped on the CPU (double precision) at a period where the
  // shader term repeats exactly, so nothing ever jumps and float precision never decays.
  function wrapN(v) { return v - Math.floor(v / TILE) * TILE; }
  function wrapA(v) { return v - Math.floor(v / TAU) * TAU; }
  function hex(h) {
    h = h.replace('#', '');
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  }
  function mix3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function css(c, a) {
    return 'rgba(' + Math.round(clamp(c[0], 0, 1) * 255) + ',' + Math.round(clamp(c[1], 0, 1) * 255) + ',' +
      Math.round(clamp(c[2], 0, 1) * 255) + ',' + (+clamp(a, 0, 1)).toFixed(3) + ')';
  }
  function mulberry(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  // Monotone cubic (Fritsch-Carlson) through control points - smooth, no overshoot.
  function monotone(xs, ys) {
    var n = xs.length, d = [], m = [], i;
    for (i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      var a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { var q = 3 / Math.sqrt(s); m[i] = q * a * d[i]; m[i + 1] = q * b * d[i]; }
    }
    return function (x) {
      if (x <= xs[0]) return ys[0] + m[0] * (x - xs[0]);
      if (x >= xs[n - 1]) return ys[n - 1] + m[n - 1] * (x - xs[n - 1]);
      var k = 0;
      while (k < n - 2 && x > xs[k + 1]) k++;
      var h = xs[k + 1] - xs[k], t = (x - xs[k]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h * m[k] +
        (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h * m[k + 1];
    };
  }
  function blur1(a, r) {
    if (r < 1) return a;
    var n = a.length, out = new Float32Array(n), acc = 0, i;
    for (i = -r; i <= r; i++) acc += a[clamp(i, 0, n - 1)];
    for (i = 0; i < n; i++) {
      out[i] = acc / (2 * r + 1);
      acc += a[clamp(i + r + 1, 0, n - 1)] - a[clamp(i - r, 0, n - 1)];
    }
    return out;
  }

  /* ---------------------------------------------------------------- palette */
  // Logo blues (azure #12a8ec, royal #0b3f8e, light cyan) pulled toward the original
  // site's teal (#19506a / #086184 / #06243a) and its cyan accent (#70e5f2).
  var C = {
    topF: hex('#b4f1fc'), topB: hex('#4d9fbf'),     // crest light: front -> back
    midF: hex('#1c9fd2'), midB: hex('#1b6488'),     // azure-teal body
    deepF: hex('#0c5679'), deepB: hex('#0d3a58'),   // teal-navy depth
    royal: hex('#0b3a86'),                           // royal blue, only deep inside the front body
    abyss: hex('#031a2f'),
    gap: hex('#06243a'),                             // the logo's cut lines, as translucent navy
    rim: hex('#5fd3ea'),                             // luminous rim on the back bands
    lantern: hex('#70e5f2'),
    fog: hex('#0b2d45'),
    foam: hex('#effcff'),
    spray: hex('#e8faff'), sprayB: hex('#9ee2f6'),
    bio: hex('#70e5f2')
  };

  /* ================================================================ WebGL */
  var GLSL_NOISE = [
    'uniform sampler2D uNoise;',
    'float h21(vec2 p){ p = mod(p, 64.0); vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
    // value noise from the 64x64 lattice texture (texel = h21 at its cell's four corners): one fetch
    // instead of four hashes per call, same smoothstep weights as the hash version below
    'float vn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  vec4 n = texture2D(uNoise, (mod(i, 64.0) + 0.5) / 64.0);',
    '  return mix(mix(n.r, n.g, f.x), mix(n.b, n.a, f.x), f.y); }',
    // full-precision hash noise, kept for the fine glints in the moon column
    'float vnh(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  float a = h21(i), b = h21(i + vec2(1.0, 0.0)), c = h21(i + vec2(0.0, 1.0)), d = h21(i + vec2(1.0, 1.0));',
    '  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }'
  ].join('\n');

  // CPU twin of the GLSL h21 hash (float32 at each step), used to build the noise lattice texture
  function h21cpu(x, y) {
    var F = Math.fround, fr = function (v) { v = F(v); return F(v - Math.floor(v)); };
    var k = F(0.1031), a = fr(F(x) * k), b = fr(F(y) * k), c = a;
    var d = F(F(F(a * F(b + 33.33)) + F(b * F(c + 33.33))) + F(c * F(a + 33.33)));
    a = F(a + d); b = F(b + d); c = F(c + d);
    return fr(F(a + b) * c);
  }
  function noiseLattice() {
    var hv = new Float32Array(64 * 64), px = new Uint8Array(64 * 64 * 4), x, y;
    for (y = 0; y < 64; y++) for (x = 0; x < 64; x++) hv[y * 64 + x] = h21cpu(x, y);
    for (y = 0; y < 64; y++) for (x = 0; x < 64; x++) {
      var o = (y * 64 + x) * 4, x1 = (x + 1) & 63, y1 = (y + 1) & 63;
      px[o] = Math.round(hv[y * 64 + x] * 255); px[o + 1] = Math.round(hv[y * 64 + x1] * 255);
      px[o + 2] = Math.round(hv[y1 * 64 + x] * 255); px[o + 3] = Math.round(hv[y1 * 64 + x1] * 255);
    }
    return px;
  }

  // Readability scrim + bottom fade into the next section (amount A of the page colour SCRIM).
  // Full tier: its own pass over the finished frame, exactly as always, but rasterised only where A > 0
  // (NO_SCRIM in the passes below it).
  // Lite: folded into every pass instead. With premultiplied "over" blending, scaling each layer by (1 - A)
  // and adding SCRIM * A * alpha composes to the same picture, except where additive light saturates.
  var GLSL_SCRIM = [
    'const vec3 SCRIM = vec3(0.012, 0.051, 0.098);',
    '#ifdef NO_SCRIM',
    'float scrimA(vec2 p){ return 0.0; }',
    '#else',
    'uniform vec4 uRect; uniform vec4 uS;',
    'float scrimA(vec2 p){',
    '  vec2 c = (uRect.xy + uRect.zw) * 0.5; vec2 hs = (uRect.zw - uRect.xy) * 0.5;',
    '  vec2 q = abs(p - c) - hs + 48.0;',
    '  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 48.0;',
    '  float a = uS.x * (1.0 - smoothstep(-70.0, 190.0, sd));',
    '  float l = uS.y * (1.0 - smoothstep(0.0, uS.w, p.x));',
    '  float bt = uS.z * smoothstep(uRes.y - 96.0, uRes.y, p.y);',
    '  return 1.0 - (1.0 - a) * (1.0 - l) * (1.0 - bt);',
    '}',
    '#endif'
  ].join('\n');

  var VS_FULL = 'attribute vec2 aP; void main(){ gl_Position = vec4(aP, 0.0, 1.0); }';
  // the sky (or its blit) is drawn as a strip from the top edge down to just below the highest crest (CSS px)
  var VS_SKY = 'attribute vec2 aP; uniform vec2 uRes; void main(){ gl_Position = vec4(aP / uRes * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0); }';

  var FS_SKY = [
    'uniform vec2 uRes; uniform vec2 uView; uniform vec4 uHalo; uniform vec4 uSkyT; uniform vec4 uKeep; uniform float uWisp;',
    GLSL_NOISE,
    GLSL_SCRIM,
    'void main(){',
    '  vec2 p = vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y) * (uRes / uView);',
    // the site's hero backdrop: radial-gradient(ellipse at 60% 30%, #19506a 0, #06243a 42%, #020b15 82%)
    // (farthest-corner ellipse: radii 1.1095W x 0.8321H)
    '  vec2 c = vec2(0.60, 0.30) * uRes;',
    '  float t = length((p - c) / (uRes * vec2(1.1095, 0.8321)));',
    '  vec3 c0 = vec3(0.098, 0.314, 0.416); vec3 c1 = vec3(0.024, 0.141, 0.227); vec3 c2 = vec3(0.008, 0.043, 0.082);',
    '  vec3 col = t < 0.42 ? mix(c0, c1, t / 0.42) : mix(c1, c2, clamp((t - 0.42) / 0.40, 0.0, 1.0));',
    // slow sea haze so the sky is never a dead gradient
    '#ifdef LITE',
    '  float n = vn(p * 0.0021 + uSkyT.xy);',
    '#else',
    '  float n = vn(p * 0.0021 + uSkyT.xy) * 0.6 + vn(p * 0.0057 + vec2(uSkyT.z, 0.0)) * 0.4;',
    '#endif',
    '  col *= 0.95 + 0.10 * n;',
    // faint moonlit cloud wisps in the upper-right sky, right of the copy (mask first: the noise only where it shows)
    '#ifndef LITE',
    '  if (uWisp > 0.001) {',
    '    float m = smoothstep(uKeep.z + 20.0, uKeep.z + 300.0, p.x) * smoothstep(0.03 * uRes.y, 0.16 * uRes.y, p.y) * (1.0 - smoothstep(0.24 * uRes.y, 0.6 * uRes.y, p.y));',
    '    if (m > 0.0) {',
    '      vec2 q = p * vec2(0.0021, 0.0068) + vec2(uSkyT.w, 0.0);',
    '      float f = vn(q) * 0.55 + vn(q * 2.03 + vec2(13.1, 7.7)) * 0.3 + vn(q * 4.07 + vec2(3.3, 1.9)) * 0.15;',
    '      col += vec3(0.50, 0.78, 0.88) * smoothstep(0.46, 0.82, f) * m * uWisp;',
    '    }',
    '  }',
    '#endif',
    // soft moonlit halo behind the logo
    '  vec2 hd = (p - uHalo.xy) / uHalo.z; float hr = dot(hd, hd);',
    '  col += vec3(0.06, 0.29, 0.42) * exp(-hr * 1.6) * uHalo.w;',
    '  col += vec3(0.14, 0.44, 0.60) * exp(-hr * 6.0) * uHalo.w * 0.28;',
    '#ifdef SKY_HALF',
    // into the half-resolution texture, dithered before it is quantised to 8 bits: the bilinear blit then
    // averages the dither into the in-between levels, so the dark gradient never bands into plateaus
    '  gl_FragColor = vec4(col + (h21(gl_FragCoord.xy + vec2(23.0, 41.0)) - 0.5) / 255.0, 1.0);',
    '#else',
    '  float A = scrimA(p);',
    '  col += (h21(gl_FragCoord.xy) - 0.5) / 255.0;',
    '  gl_FragColor = vec4(col * (1.0 - A) + SCRIM * A, 1.0);',
    '#endif',
    '}'
  ].join('\n');

  // full-resolution blit of the half-resolution sky (bilinear), with the per-pixel dither the sky always had
  var FS_BLIT = [
    'uniform vec2 uView; uniform sampler2D uSky;',
    GLSL_NOISE,
    'void main(){',
    '  gl_FragColor = vec4(texture2D(uSky, gl_FragCoord.xy / uView).rgb + (h21(gl_FragCoord.xy) - 0.5) / 255.0, 1.0);',
    '}'
  ].join('\n');

  // the scrim over the finished frame (full tier), computed per pixel exactly as it always was
  var FS_SCRIM = [
    'uniform vec2 uRes; uniform vec2 uView;',
    GLSL_SCRIM,
    'void main(){',
    '  float A = scrimA(vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y) * (uRes / uView));',
    '  gl_FragColor = vec4(SCRIM * A, A);',
    '}'
  ].join('\n');

  var VS_WATER = [
    'attribute vec2 aPos; attribute vec4 aA; attribute vec4 aB;',
    'uniform vec2 uRes; uniform vec4 uTop[8]; uniform vec4 uMid[8]; uniform vec4 uDeep[8]; uniform vec4 uPar[8]; uniform vec4 uFlow[8];',
    'uniform vec4 uLight;',
    'varying vec4 v0; varying vec4 v1; varying vec4 v2; varying vec4 v3; varying vec4 v4; varying vec4 v5; varying vec4 v6;',
    'void main(){',
    '  int b = int(aB.z + 0.5);',
    '  vec4 par = uPar[b];',
    '  v0 = aA;',                                             // d, room, gap, u
    '  v1 = vec4(aB.x, aB.y, par.x, par.y);',                 // foam, lit, fog, brightness
    '  v2 = uTop[b]; v3 = uMid[b]; v4 = uDeep[b];',
    '  vec2 dl = (aPos - uLight.xy) / uLight.z;',
    '  v5 = vec4(exp(-dot(dl, dl)) * uLight.w, par.z, 0.0, aB.w);',  // halo light, rim glow, -, alpha
    '  v6 = uFlow[b];',                                       // flow offset 1, flow offset 2, gloss centre, gap alpha
    '  gl_Position = vec4(aPos / uRes * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);',
    '}'
  ].join('\n');

  var FS_WATER = [
    'varying vec4 v0; varying vec4 v1; varying vec4 v2; varying vec4 v3; varying vec4 v4; varying vec4 v5; varying vec4 v6;',
    'uniform float uFw; uniform float uGlossW; uniform vec2 uRes; uniform vec2 uView; uniform vec4 uPtr;',
    'uniform vec3 uGap; uniform vec3 uFog; uniform vec3 uAbyss; uniform vec3 uRoyal; uniform vec3 uFoam; uniform vec3 uRim; uniform vec3 uLan;',
    'uniform vec4 uGlit; uniform vec4 uTa; uniform vec4 uTb; uniform vec4 uTc;',
    GLSL_NOISE,
    GLSL_SCRIM,
    'void main(){',
    '  float d = v0.x; float room = v0.y; float g = v0.z; float u = v0.w;',
    '  float fw = uFw; float depth = v4.a; float seed = depth * 7.3 + 0.5;',
    // coverage: anti-aliased crest edge, thin translucent gap line above it, lip inner edge.
    // Below the crest d is the vertical distance, so on a sloped crest one buffer pixel across the edge spans
    // more than fw of d: with derivatives the edge ramp is exactly one buffer pixel wide at any slope.
    '  float aw = fw;',
    '#ifdef DERIV',
    '  aw = clamp(length(vec2(dFdx(d), dFdy(d))), fw * 0.5, fw * 4.0);',
    '#endif',
    '  float body = smoothstep(-aw * 0.5, aw * 0.5, d);',
    '  float line = smoothstep(-g - fw * 0.75, -g + fw * 0.25, d) * (1.0 - body);',
    '  float alpha = v5.w * (1.0 - v3.a * smoothstep(room - fw * 1.5, room, d));',
    '  float dd = max(d, 0.0);',
    '  vec2 fp = vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y) * (uRes / uView);',
    // pointer lantern: a soft cyan pool of light in the water and a bright streak along the crest
    '  float lan = 0.0;',
    '  if (uPtr.w > 0.001) { vec2 dp = (fp - uPtr.xy) / uPtr.z; lan = exp(-dot(dp, dp)) * uPtr.w; }',
    '  vec3 col = vec3(0.0);',
    // above the crest only the rim light and the gap line show: the body shading is skipped there
    '  if (body > 0.0) {',
    '  float rc = clamp(room, 26.0, 96.0 + 30.0 * depth);',
    '  float v = dd / rc;',
    // band gradient: light crest -> azure-teal -> teal-navy (-> royal deep in the front body) -> abyss
    '  col = mix(v2.rgb, v3.rgb, smoothstep(0.0, 0.22, v) * 0.6 + smoothstep(0.0, 10.0, dd) * 0.4);',
    '  col = mix(col, v4.rgb, smoothstep(0.16, 0.9, v));',
    '  col = mix(col, uRoyal, smoothstep(0.7, 1.6, v) * depth * depth * 0.5);',
    '  col = mix(col, uAbyss, smoothstep(0.75, 2.3, v) * (0.85 + 0.15 * depth));',
    // slow, large-scale light inside the body (never a flat fill)
    '  float cz = 0.5;',
    '#ifndef LITE',
    '  cz = vn(vec2(u * 0.011 + uTa.x, dd * 0.028 + uTa.y + seed));',
    '#endif',
    '  col *= 0.9 + 0.2 * cz * smoothstep(14.0, 70.0, dd);',
    // moon column under the logo: a soft light path with fine shimmering glints
    '  float gx = (u - uGlit.x) / uGlit.z;',
    '  float gm = exp(-gx * gx) * smoothstep(0.6, 1.0, depth) * smoothstep(5.0, 20.0, dd) * (1.0 - smoothstep(40.0, 210.0, dd));',
    '  if (gm > 0.004) {',
    '#ifndef LITE',
    '    float g1 = vnh(vec2(u * 0.075 + uTa.z, dd * 0.42 + uTa.w));',
    '    float g2 = vnh(vec2(u * 0.19 + uTb.x, dd * 0.9 + uTb.y));',
    '    float gl = smoothstep(0.72, 0.93, g1 * 0.7 + g2 * 0.3);',
    '    col += vec3(0.62, 0.9, 1.0) * gl * gm * uGlit.w;',
    '#endif',
    '    col += vec3(0.16, 0.36, 0.46) * gm * uGlit.w * 0.22;',
    '  }',
    // gloss: segmented specular streak under the crest + broad sheen, gliding with the flow,
    // plus a slow travelling swell of light that runs along every band
    // (the gloss segments only show within ~20px of the crest: skip the noise deeper down)
    '  float seg = 0.0;',
    '#ifndef LITE',
    '  if (dd < 120.0) { float n1 = vn(vec2(u * 0.0042 - v6.x, seed)); float n2 = vn(vec2(u * 0.0115 - v6.y, seed + 3.7)); seg = smoothstep(0.40, 0.78, n1 * 0.68 + n2 * 0.32); }',
    '#endif',
    '  float gc = (u - v6.z) / uGlossW;',
    '  float sw = exp(-gc * gc);',
    '  float lit = v1.y;',
    '  float sc = 3.0 + 2.6 * depth; float sW = 1.1 + 0.9 * depth;',
    '#ifdef LITE',
    // a coarse buffer: thin lights are kept at least ~1 buffer pixel wide (same total light), so they never stair-step
    '  float sW1 = max(sW, 1.2 * fw); float sk = (dd - sc) / sW1;',
    '  float spec = exp(-sk * sk) * max(seg, sw * 0.85) * v2.a * (0.3 + 0.85 * lit) * (sW / sW1);',
    '#else',
    '  float sk = (dd - sc) / sW;',
    '  float spec = exp(-sk * sk) * max(seg, sw * 0.85) * v2.a * (0.3 + 0.85 * lit);',
    '#endif',
    '  float sheen = exp(-dd / 15.0) * (0.10 + 0.30 * seg + 0.45 * sw) * (0.4 + 0.6 * lit) * v2.a;',
    '  col += vec3(0.55, 0.88, 1.0) * sheen * 0.42;',
    '  col += vec3(0.30, 0.62, 0.78) * sw * exp(-dd / 60.0) * 0.07;',
    // soft inner flow line, like the thin highlight curves inside the logo bands
    '  float ik = (v - 0.46 - 0.05 * sin(u * 0.006 + uTb.z + seed)) / 0.022;',
    '  col += vec3(0.45, 0.80, 1.0) * exp(-ik * ik) * 0.06 * v2.a * smoothstep(40.0, 120.0, room);',
    // light from the logo halo catching nearby crests
    '  col += vec3(0.30, 0.72, 0.95) * v5.x * exp(-dd / 34.0) * 0.30;',
    '  col = mix(col, vec3(0.94, 0.99, 1.0), clamp(spec, 0.0, 1.0) * 0.85);',
    '  if (uPtr.w > 0.001) col += uLan * lan * (0.75 * exp(-dd / 5.0) + 0.22 * exp(-dd / 45.0) + 0.07);',
    // foam lace on disturbed / breaking crests
    '  float foam = v1.x;',
    '  if (foam > 0.01 && dd < 12.0 + 16.0 * foam) {',
    '    float fm = 0.0;',
    '#ifndef LITE',
    '    float fz = 2.5 + 15.0 * foam;',
    '    float fn = vn(vec2(u * 0.17 + uTb.w, dd * 0.36 + uTc.x)) * 0.55 + vn(vec2(u * 0.45 + uTc.y, dd * 0.95 + 11.0)) * 0.45;',
    '    fm = smoothstep(0.58 - 0.22 * foam, 0.9 - 0.2 * foam, fn) * (1.0 - smoothstep(fz * 0.2, fz, dd)) * clamp(foam * 1.3, 0.0, 1.0);',
    '#endif',
    '#ifdef LITE',
    '    float fW = max(2.2, fw); fm = max(fm, exp(-dd / fW) * clamp(foam, 0.0, 1.0) * 0.7 * (2.2 / fW));',
    '#else',
    '    fm = max(fm, exp(-dd / 2.2) * clamp(foam, 0.0, 1.0) * 0.7);',
    '#endif',
    '    col = mix(col, uFoam, clamp(fm, 0.0, 1.0) * (0.25 + 0.6 * depth * depth));',
    '  }',
    '  col = mix(col, uFog, v1.z);',
    '  col *= v1.w;',
    '  }',
    // luminous rim above the crest (additive light, no coverage), stronger near the lantern
    '  float above = max(-d - g, 0.0);',
    '  float rimW = 1.6 + 2.0 * (1.0 - depth);',
    '#ifdef LITE',
    '  float rimW1 = max(rimW, 1.2 * fw);',
    '  float glow = (v5.y + lan * 1.4) * exp(-above / rimW1) * (rimW / rimW1) * (1.0 - body) * smoothstep(-g - 9.0 - fw, -g - 1.0, d);',
    '#else',
    '  float glow = (v5.y + lan * 1.4) * exp(-above / rimW) * (1.0 - body) * smoothstep(-g - 9.0, -g - 1.0, d);',
    '#endif',
    '  vec3 rimCol = mix(uRim, uLan, clamp(lan * 1.5, 0.0, 1.0));',
    '  float A = (body + line * v6.w) * alpha;',
    '  vec3 rgb = (col * body + uGap * line * v6.w) * alpha + rimCol * glow * alpha * 0.55;',
    '  rgb += (h21(gl_FragCoord.xy) - 0.5) / 255.0 * A;',
    // the frame buffer clamps bright crest light at 1.0 before the scrim darkens it: keep that order
    '  float S = scrimA(fp);',
    '  gl_FragColor = vec4(min(rgb, vec3(1.0)) * (1.0 - S) + SCRIM * (S * A), A);',
    '}'
  ].join('\n');

  var VS_FX = [
    'attribute vec2 aPos; attribute vec4 aLoc; attribute vec4 aCol;',
    'uniform vec2 uRes; varying vec4 vLoc; varying vec4 vCol;',
    'void main(){ vLoc = aLoc; vCol = aCol; gl_Position = vec4(aPos / uRes * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0); }'
  ].join('\n');

  var FS_FX = [
    'uniform vec2 uRes; uniform vec2 uView;',
    GLSL_SCRIM,
    'varying vec4 vLoc; varying vec4 vCol;',
    'void main(){',
    '  vec2 q = vLoc.xy; float k = vLoc.w; float r2 = dot(q, q); float a = 0.0;',
    '  if (k < 0.5) {',                                    // droplet / mote / bead: soft round sprite, bright core + glow
    '    a = exp(-r2 * 11.0) * 0.95 + exp(-r2 * 3.2) * 0.28;',
    '    a *= 1.0 - smoothstep(0.8, 1.0, sqrt(r2));',
    '  } else if (k < 1.5) {',                             // mist / glow
    '    a = exp(-r2 * 3.2) * (1.0 - smoothstep(0.7, 1.0, sqrt(r2)));',
    '  } else if (k < 2.5) {',                             // ripple ring: soft, lit from the front, faint inner swell
    '    float r = sqrt(r2); float th = max(vLoc.z, 0.01);',
    '    float e1 = (r - 0.82) / th; float e2 = (r - 0.6) / (th * 2.2);',
    '    a = exp(-e1 * e1) + 0.3 * exp(-e2 * e2);',
    '    a *= (0.35 + 0.65 * smoothstep(-0.8, 0.9, q.y)) * (1.0 - smoothstep(0.94, 1.0, r));',
    '  } else {',                                          // crest glint
    '    float r = sqrt(r2);',
    '    float s1 = exp(-abs(q.x) * 15.0) * exp(-abs(q.y) * 2.4);',
    '    float s2 = exp(-abs(q.y) * 15.0) * exp(-abs(q.x) * 2.4);',
    '    a = (max(s1, s2) * 0.8 + exp(-r2 * 30.0)) * (1.0 - smoothstep(0.75, 1.0, r));',
    '  }',
    '  a *= vCol.a;',
    '  vec2 fp = vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y) * (uRes / uView);',
    '  gl_FragColor = vec4(vCol.rgb * a * (1.0 - scrimA(fp)), 0.0);',   // additive light (under the scrim)
    '}'
  ].join('\n');

  // WebGL without a GPU: SwiftShader, llvmpipe / softpipe / lavapipe, WARP ("Microsoft Basic Render Driver"),
  // Apple's software renderer. Such a context draws on the CPU, next to the page's own (also CPU) compositing.
  var SOFT_GL = /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render|\bwarp\b|mesa offscreen/i;
  var softSeen = false;    // a context was refused for a performance caveat earlier in this page
  function glRendererName(gl) {
    var s = '';
    try {
      s = String(gl.getParameter(gl.RENDERER) || '');
      // Chrome and Safari mask RENDERER; Firefox reports the real (sanitised) name and warns on the extension
      if (!s || /^webkit webgl$/i.test(s)) {
        var ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) s = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || s);
      }
    } catch (e) { /* unknown renderer */ }
    return s;
  }

  function createGLRenderer(canvas, forcedTier) {
    var gl = null, caveat = false;
    // No MSAA: every edge is smoothed in the shaders over one buffer pixel (uFw, or the derivatives). Ask for a
    // context that is not software-rendered first; when the browser refuses it, take the software one (lite tier).
    var attrs = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: true };
    try {
      gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
      if (!gl) {
        attrs.failIfMajorPerformanceCaveat = false;
        gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
        caveat = !!gl;
      }
    } catch (e) { gl = null; }
    if (!gl) return null;
    if (caveat) softSeen = true;
    var gpuName = glRendererName(gl);
    var soft = softSeen || SOFT_GL.test(gpuName);
    var lite = forcedTier ? forcedTier === 'lite' : soft;

    var prec = 'mediump';
    try {
      var hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      if (hp && hp.precision > 0) prec = 'highp';
    } catch (e) { /* keep mediump */ }
    // screen-space derivatives (near-universal in WebGL 1) size the crest's anti-aliasing exactly
    var deriv = false;
    try { deriv = !!gl.getExtension('OES_standard_derivatives'); } catch (e) { deriv = false; }

    var R = { kind: 'gl', canvas: canvas, ok: false, failed: false, soft: soft, lite: lite, gpu: gpuName, deriv: deriv, caveat: caveat };
    var P = {}, buf = {}, maxAttr = 0, halfSky = false;
    var wv = null, wvBands = null, skyV = null, skyU = null, scrimV = new Float32Array(24), fxv = null, fxQuadsMax = 0, fxn = 0, fxViews = [];

    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        var log = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error('shader: ' + log);
      }
      return s;
    }
    function prog(vs, fs, attribs, defs) {
      var p = gl.createProgram(), head = 'precision ' + prec + ' float;\n' + (lite ? '#define LITE 1\n' : '') + (defs || '');
      // (#extension must precede every other token; it is only ever enabled in fragment shaders)
      var fsHead = deriv ? '#extension GL_OES_standard_derivatives : enable\n#define DERIV 1\n' : '';
      var vsh = sh(gl.VERTEX_SHADER, head + vs), fsh = sh(gl.FRAGMENT_SHADER, fsHead + head + fs);
      gl.attachShader(p, vsh);
      gl.attachShader(p, fsh);
      for (var i = 0; i < attribs.length; i++) gl.bindAttribLocation(p, i, attribs[i]);
      gl.linkProgram(p);
      // flagged for deletion: freed together with the program (a Pause / Play re-mount leaves nothing behind)
      gl.deleteShader(vsh); gl.deleteShader(fsh);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
      var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) || 0;
      for (var j = 0; j < n; j++) {
        var info = gl.getActiveUniform(p, j);
        if (info) u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
      }
      return { p: p, u: u, n: attribs.length };
    }
    function use(pr) {
      gl.useProgram(pr.p);
      var n = Math.max(maxAttr, pr.n);
      for (var i = 0; i < n; i++) {
        if (i < pr.n) gl.enableVertexAttribArray(i); else gl.disableVertexAttribArray(i);
      }
      maxAttr = pr.n;
    }

    function resetAttribs() { for (var i = 0; i < 4; i++) gl.disableVertexAttribArray(i); maxAttr = 0; }
    function init() {
      if (gl.isContextLost()) throw new Error('context lost');
      // a re-mount (Pause / Play) gets this canvas's existing context back, with the previous mount's state
      resetAttribs();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      // Full tier: the sky (smooth: gradient, slow haze, wide wisps, halo) is shaded at half resolution into a
      // texture and blitted with the full-resolution dither; the scrim is a pass of its own over the finished
      // frame. Lite (already a coarse buffer) and a missing render target shade the sky directly.
      halfSky = !lite && makeSkyTarget();
      R.halfSky = halfSky;
      var noScrim = halfSky ? '#define NO_SCRIM 1\n' : '';
      P.sky = halfSky ? prog(VS_FULL, FS_SKY, ['aP'], '#define SKY_HALF 1\n' + noScrim) : prog(VS_SKY, FS_SKY, ['aP']);
      P.water = prog(VS_WATER, FS_WATER, ['aPos', 'aA', 'aB'], noScrim);
      P.fx = prog(VS_FX, FS_FX, ['aPos', 'aLoc', 'aCol'], noScrim);
      if (halfSky) {
        P.blit = prog(VS_SKY, FS_BLIT, ['aP']);
        P.scrim = prog(VS_SKY, FS_SCRIM, ['aP']);
        gl.useProgram(P.blit.p); gl.uniform1i(P.blit.u.uSky, 1);
        buf.scrim = gl.createBuffer();
        buf.tri = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.tri);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      }
      buf.sky = gl.createBuffer();
      buf.wv = gl.createBuffer(); buf.wi = gl.createBuffer();
      buf.fv = gl.createBuffer(); buf.fi = gl.createBuffer();
      fxQuadsMax = 1200;
      var qi = new Uint16Array(fxQuadsMax * 6);
      for (var q = 0; q < fxQuadsMax; q++) {
        var o = q * 4, k = q * 6;
        qi[k] = o; qi[k + 1] = o + 1; qi[k + 2] = o + 2; qi[k + 3] = o + 2; qi[k + 4] = o + 1; qi[k + 5] = o + 3;
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.fi);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, qi, gl.STATIC_DRAW);
      fxv = new Float32Array(fxQuadsMax * 4 * 10); fxViews = [];
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.fv);
      gl.bufferData(gl.ARRAY_BUFFER, fxv.byteLength, gl.DYNAMIC_DRAW);
      // the noise lattice lives on texture unit 0 for the whole life of the context (uNoise defaults to 0)
      buf.noise = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, buf.noise);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 64, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, noiseLattice());
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      R.ok = true;
    }
    // half-resolution sky render target on texture unit 1 (linear, clamped: valid for any size in WebGL 1)
    function makeSkyTarget() {
      try {
        buf.skyTex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, buf.skyTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.activeTexture(gl.TEXTURE0);
        buf.skyFb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, buf.skyFb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, buf.skyTex, 0);
        var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        buf.tw = 2; buf.th = 2;
        if (!ok) { gl.deleteFramebuffer(buf.skyFb); gl.deleteTexture(buf.skyTex); buf.skyFb = buf.skyTex = null; }
        return ok;
      } catch (e) { gl.activeTexture(gl.TEXTURE0); return false; }
    }

    // index buffer for N bands x S samples (+ a lip of LS samples), 3 vertices per sample
    function ensureIndices(N, S, LS) {
      if (buf.kN === N && buf.kS === S && buf.kL === LS) return;
      buf.kN = N; buf.kS = S; buf.kL = LS;
      var bandIdx = N * (S - 1) * 12, lipIdx = (LS - 1) * 12;
      var idx = new Uint16Array(bandIdx + lipIdx), p = 0;
      var strip = function (base, count) {
        for (var j = 0; j < count - 1; j++) {
          var a0 = base + j * 3, a1 = a0 + 3;
          idx[p++] = a0; idx[p++] = a0 + 1; idx[p++] = a1;
          idx[p++] = a1; idx[p++] = a0 + 1; idx[p++] = a1 + 1;
          idx[p++] = a0 + 1; idx[p++] = a0 + 2; idx[p++] = a1 + 1;
          idx[p++] = a1 + 1; idx[p++] = a0 + 2; idx[p++] = a1 + 2;
        }
      };
      for (var b = 0; b < N; b++) strip(b * S * 3, S);
      strip(N * S * 3, LS);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.wi);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      buf.bandIdx = bandIdx; buf.lipIdx = lipIdx;
      wv = new Float32Array((N * S + LS) * 3 * 10);
      wvBands = wv.subarray(0, N * S * 3 * 10);      // views are made once per layout, never per frame
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.wv);
      gl.bufferData(gl.ARRAY_BUFFER, wv.byteLength, gl.DYNAMIC_DRAW);
      skyV = new Float32Array(S * 4); skyU = new Float32Array(S);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.sky);
      gl.bufferData(gl.ARRAY_BUFFER, skyV.byteLength, gl.DYNAMIC_DRAW);
    }
    function scrimUniforms(u, sc) {
      if (!u.uRect) return;                          // NO_SCRIM: the scrim pass applies it later
      gl.uniform4f(u.uRect, sc.scrim[0], sc.scrim[1], sc.scrim[2], sc.scrim[3]);
      gl.uniform4f(u.uS, sc.scrim[4], sc.scrim[5], sc.scrim[6], sc.scrim[7]);
    }

    function quad(cx, cy, ax, ay, bx, by, kind, param, r, g, b, alpha) {
      if (fxn >= fxQuadsMax) return;
      var o = fxn * 40;
      for (var c = 0; c < 4; c++) {
        var lx = CORNERS[c * 2], ly = CORNERS[c * 2 + 1], i = o + c * 10;
        fxv[i] = cx + ax * lx + bx * ly; fxv[i + 1] = cy + ay * lx + by * ly;
        fxv[i + 2] = lx; fxv[i + 3] = ly; fxv[i + 4] = param; fxv[i + 5] = kind;
        fxv[i + 6] = r; fxv[i + 7] = g; fxv[i + 8] = b; fxv[i + 9] = alpha;
      }
      fxn++;
    }

    R.draw = function (sc) {
      if (!R.ok || gl.isContextLost()) return;
      var N = sc.N, S = sc.S, LS = sc.LS, j, b;
      // the drawing buffer as the browser actually made it (it may clamp a very large canvas)
      var vw = gl.drawingBufferWidth || sc.pw, vh = gl.drawingBufferHeight || sc.ph;
      ensureIndices(N, S, LS);
      gl.viewport(0, 0, vw, vh);
      var xs = sc.xs, fwp = sc.fw, ext = sc.rimExt;

      /* sky, rasterised only from the top edge down to just below the water's top: the bands' bodies are
         opaque below it and cover every pixel there, so the sky would be shaded for nothing. Between two
         samples every crest is a straight segment, so there the water's top (the highest crest) never lies
         lower than su = min over the bands of each segment's lower end; the strip reaches su + cut. */
      var sv = skyV, su = skyU, q = 0, cut = 2 + fwp, yMax = sc.H + 4, yb, e;
      for (j = 0; j < S - 1; j++) su[j] = 1e9;
      for (b = 0; b < N; b++) {
        yb = sc.bands[b].y;
        for (j = 0; j < S - 1; j++) { e = yb[j] > yb[j + 1] ? yb[j] : yb[j + 1]; if (e < su[j]) su[j] = e; }
      }
      for (j = 0; j < S; j++) {
        e = (j === 0 ? su[0] : (j === S - 1 || su[j - 1] > su[j] ? su[j - 1] : su[j])) + cut;
        sv[q++] = xs[j]; sv[q++] = -4; sv[q++] = xs[j]; sv[q++] = e < yMax ? e : yMax;
      }
      gl.disable(gl.BLEND);
      var u = P.sky.u;
      if (halfSky) {
        // the whole sky at half resolution into its texture ...
        var tw = (vw + 1) >> 1, th = (vh + 1) >> 1;
        gl.bindFramebuffer(gl.FRAMEBUFFER, buf.skyFb);
        if (buf.tw !== tw || buf.th !== th) {
          gl.activeTexture(gl.TEXTURE1);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          gl.activeTexture(gl.TEXTURE0);
          buf.tw = tw; buf.th = th;
        }
        gl.viewport(0, 0, tw, th);
        use(P.sky);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.tri);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(u.uView, tw, th);
      } else {
        use(P.sky);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.sky);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, sv);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(u.uView, vw, vh);
      }
      gl.uniform2f(u.uRes, sc.W, sc.H);
      gl.uniform4fv(u.uHalo, sc.halo);
      gl.uniform4fv(u.uSkyT, sc.skyT);
      gl.uniform4fv(u.uKeep, sc.keep);
      gl.uniform1f(u.uWisp, sc.wisp);
      scrimUniforms(u, sc);
      if (halfSky) {
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        // ... then blitted into the strip above the water at full resolution
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, vw, vh);
        use(P.blit);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.sky);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, sv);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(P.blit.u.uRes, sc.W, sc.H);
        gl.uniform2f(P.blit.u.uView, vw, vh);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, S * 2);

      /* water bands (one draw call, back to front, curl lip last) */
      var p = 0;
      for (b = 0; b < N; b++) {
        var B = sc.bands[b], y = B.y, minF = B.minF, gpx = B.gap, al = B.alpha;
        var gg = gpx + ext + fwp;
        for (j = 0; j < S; j++) {
          var x = xs[j], yy = y[j];
          var jl = j > 0 ? j - 1 : j, jr = j < S - 1 ? j + 1 : j;
          var tx = xs[jr] - xs[jl], ty = y[jr] - y[jl], tl = Math.sqrt(tx * tx + ty * ty);
          if (tl < 1e-6) tl = 1;
          var nx = ty / tl, ny = -tx / tl;                    // outward (up) normal
          var room = minF[j] - yy;
          var bot = Math.max(yy + 2, minF[j] + 8);
          var fo = B.foam[j], li = B.lit[j];
          // rim / gap (above the crest)
          wv[p++] = x + nx * gg; wv[p++] = yy + ny * gg; wv[p++] = -gg; wv[p++] = room; wv[p++] = gpx; wv[p++] = x;
          wv[p++] = fo; wv[p++] = li; wv[p++] = b; wv[p++] = al;
          // crest
          wv[p++] = x; wv[p++] = yy; wv[p++] = 0; wv[p++] = room; wv[p++] = gpx; wv[p++] = x;
          wv[p++] = fo; wv[p++] = li; wv[p++] = b; wv[p++] = al;
          // body bottom (hidden under the band in front)
          wv[p++] = x; wv[p++] = bot; wv[p++] = bot - yy; wv[p++] = room; wv[p++] = gpx; wv[p++] = x;
          wv[p++] = fo; wv[p++] = li; wv[p++] = b; wv[p++] = al;
        }
      }
      var lip = sc.lip, count = buf.bandIdx;
      if (lip.active) {
        var lg = lip.g + ext + fwp;
        for (j = 0; j < LS; j++) {
          var lx = lip.x[j], ly = lip.y[j], lnx = lip.nx[j], lny = lip.ny[j], w = lip.w[j], lu = lip.u[j], lf = lip.foam[j];
          wv[p++] = lx - lnx * lg; wv[p++] = ly - lny * lg; wv[p++] = -lg; wv[p++] = w; wv[p++] = lip.g; wv[p++] = lu;
          wv[p++] = lf; wv[p++] = 0.85; wv[p++] = N; wv[p++] = lip.alpha;
          wv[p++] = lx; wv[p++] = ly; wv[p++] = 0; wv[p++] = w; wv[p++] = lip.g; wv[p++] = lu;
          wv[p++] = lf; wv[p++] = 0.85; wv[p++] = N; wv[p++] = lip.alpha;
          wv[p++] = lx + lnx * w; wv[p++] = ly + lny * w; wv[p++] = w; wv[p++] = w; wv[p++] = lip.g; wv[p++] = lu;
          wv[p++] = lf; wv[p++] = 0.85; wv[p++] = N; wv[p++] = lip.alpha;
        }
        count += buf.lipIdx;
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      use(P.water);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.wv);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, p > wvBands.length ? wv : wvBands);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 40, 0);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 40, 8);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 24);
      u = P.water.u;
      gl.uniform2f(u.uRes, sc.W, sc.H);
      gl.uniform2f(u.uView, vw, vh);
      gl.uniform4fv(u.uTop, sc.pal.top);
      gl.uniform4fv(u.uMid, sc.pal.mid);
      gl.uniform4fv(u.uDeep, sc.pal.deep);
      gl.uniform4fv(u.uPar, sc.pal.par);
      gl.uniform4fv(u.uFlow, sc.pal.flow);
      gl.uniform4fv(u.uLight, sc.light);
      gl.uniform4fv(u.uPtr, sc.ptr);
      gl.uniform1f(u.uFw, fwp);
      gl.uniform1f(u.uGlossW, sc.glossW);
      gl.uniform3fv(u.uGap, C.gap);
      gl.uniform3fv(u.uFog, C.fog);
      gl.uniform3fv(u.uAbyss, C.abyss);
      gl.uniform3fv(u.uRoyal, C.royal);
      gl.uniform3fv(u.uFoam, C.foam);
      gl.uniform3fv(u.uRim, C.rim);
      gl.uniform3fv(u.uLan, C.lantern);
      gl.uniform4fv(u.uGlit, sc.glit);
      gl.uniform4fv(u.uTa, sc.ta);
      gl.uniform4fv(u.uTb, sc.tb);
      gl.uniform4fv(u.uTc, sc.tc);
      scrimUniforms(u, sc);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.wi);
      gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);

      /* light: spray, mist, rings, motes, beads, glints (additive) */
      fxn = 0;
      var Pp = sc.P, i, a, k, s, x0, y0;
      // lite (coarse buffer): a sprite is never smaller than about one buffer pixel, with the same total light
      var fxMin = lite ? sc.W / vw : 0, gMin = fxMin * 4;
      for (i = 0; i < Pp.n; i++) {
        a = Pp.a[i];
        if (a < 0.004) continue;
        k = Pp.k[i]; x0 = Pp.x[i]; y0 = Pp.y[i]; s = Pp.s[i];
        if (s < fxMin && (k === K_DROP || k === K_BIO || k === K_BEAD)) { a *= (s / fxMin) * (s / fxMin); s = fxMin; if (a < 0.004) continue; }
        if (k === K_DROP) {
          var tc = Pp.c[i];
          quad(x0, y0, s * 2.5, 0, 0, s * 2.5, 0, 0, lerp(C.spray[0], C.sprayB[0], tc), lerp(C.spray[1], C.sprayB[1], tc), lerp(C.spray[2], C.sprayB[2], tc), a);
        } else if (k === K_MIST) {
          quad(x0, y0, s, 0, 0, s * 0.62, 1, 0, 0.62, 0.86, 1, a);
        } else if (k === K_RING) {
          quad(x0, y0, s, 0, 0, s * 0.27, 2, Pp.c[i], 0.72, 0.94, 1, a);
        } else if (k === K_BIO) {
          quad(x0, y0, s * 2.6, 0, 0, s * 2.6, 0, 0, C.bio[0], C.bio[1], C.bio[2], a);
        } else if (k === K_PUFF) {
          quad(x0, y0, s, 0, 0, s * 0.85, 1, 0, 0.86, 0.96, 1, a);
        } else if (k === K_BLOOM) {
          quad(x0, y0, s, 0, 0, s * 0.7, 1, 0, 0.55, 0.88, 1, a);
        } else {
          quad(x0, y0, s * 7, 0, 0, s * 7, 1, 0, 0.45, 0.85, 1, a * 0.4);
          quad(x0, y0, s * 2.6, 0, 0, s * 2.6, 0, 0, 0.92, 0.99, 1, a);
        }
      }
      var G = sc.G;
      for (i = 0; i < G.n; i++) {
        var gr = G.r[i], ga = G.a[i];
        if (gr < gMin) { ga *= (gr / gMin) * (gr / gMin) * 2; gr = gMin; }
        if (ga > 0.004) quad(G.x[i], G.y[i], gr, 0, 0, gr, 3, 0, 0.8, 0.95, 1, ga);
      }
      if (fxn > 0) {
        gl.blendFunc(gl.ONE, gl.ONE);
        use(P.fx);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.fv);
        var vi = Math.ceil(fxn / 64);                 // upload in 64-quad steps through cached views
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, fxViews[vi] || (fxViews[vi] = fxv.subarray(0, Math.min(fxQuadsMax, vi * 64) * 40)));
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 40, 0);
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 40, 8);
        gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 24);
        u = P.fx.u;
        gl.uniform2f(u.uRes, sc.W, sc.H);
        gl.uniform2f(u.uView, vw, vh);
        scrimUniforms(u, sc);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.fi);
        gl.drawElements(gl.TRIANGLES, fxn * 6, gl.UNSIGNED_SHORT, 0);
      }

      if (halfSky) {
        /* readability scrim + bottom fade over the finished frame, rasterised only where it is non-zero:
           left of where both the copy's halo (copy + 190 px) and the side gradient end, plus the bottom 96 px */
        var sm = sc.scrim, Wp = sc.W + 1, Hp = sc.H + 1, xL = Math.min(Wp, Math.max(sm[7], sm[2] + 190)), yB = sc.H - 96, n6 = 6;
        rect(scrimV, 0, -1, -1, xL, Hp);
        if (xL < Wp) { rect(scrimV, 12, xL, yB, Wp, Hp); n6 = 12; }
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        use(P.scrim);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.scrim);
        gl.bufferData(gl.ARRAY_BUFFER, scrimV, gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        u = P.scrim.u;
        gl.uniform2f(u.uRes, sc.W, sc.H);
        gl.uniform2f(u.uView, vw, vh);
        scrimUniforms(u, sc);
        gl.drawArrays(gl.TRIANGLES, 0, n6);
      }
    };
    function rect(a, o, x0, y0, x1, y1) {
      a[o] = x0; a[o + 1] = y0; a[o + 2] = x1; a[o + 3] = y0; a[o + 4] = x0; a[o + 5] = y1;
      a[o + 6] = x0; a[o + 7] = y1; a[o + 8] = x1; a[o + 9] = y0; a[o + 10] = x1; a[o + 11] = y1;
    }

    R.restore = function () { buf = {}; P = {}; R.ok = false; init(); };
    R.dispose = function () {
      R.ok = false;
      try {
        if (gl.isContextLost()) return;
        resetAttribs();
        ['sky', 'blit', 'scrim', 'water', 'fx'].forEach(function (k) { if (P[k]) gl.deleteProgram(P[k].p); });
        ['tri', 'sky', 'scrim', 'wv', 'wi', 'fv', 'fi'].forEach(function (k) { if (buf[k]) gl.deleteBuffer(buf[k]); });
        if (buf.noise) gl.deleteTexture(buf.noise);
        if (buf.skyFb) gl.deleteFramebuffer(buf.skyFb);
        if (buf.skyTex) gl.deleteTexture(buf.skyTex);
      } catch (e) { /* ignore */ }
    };

    try { init(); } catch (e) { R.ok = false; R.failed = true; R.error = e; }
    return R;
  }

  /* ========================================================= Canvas 2D fallback */
  function create2DRenderer(cv) {
    var ctx = null;
    try { ctx = cv.getContext('2d', { alpha: false }); } catch (e) { ctx = null; }
    if (!ctx) return null;
    var R = { kind: '2d', canvas: cv, ok: true };
    var skyC = null, skyKey = '', palVer = -1, bandCss = [];

    function sprite(n, rgb, soft) {
      var c = document.createElement('canvas'); c.width = c.height = n;
      var x = c.getContext('2d'), h = n / 2, g = x.createRadialGradient(h, h, 0, h, h, h);
      var s = rgb[0] + ',' + rgb[1] + ',' + rgb[2];
      if (soft) {
        g.addColorStop(0, 'rgba(' + s + ',1)'); g.addColorStop(0.45, 'rgba(' + s + ',0.45)'); g.addColorStop(1, 'rgba(' + s + ',0)');
      } else {
        g.addColorStop(0, 'rgba(' + s + ',1)'); g.addColorStop(0.2, 'rgba(' + s + ',0.8)');
        g.addColorStop(0.42, 'rgba(' + s + ',0.2)'); g.addColorStop(1, 'rgba(' + s + ',0)');
      }
      x.fillStyle = g; x.fillRect(0, 0, n, n);
      return c;
    }
    var dotW = sprite(32, [232, 250, 255], false), dotC = sprite(32, [112, 229, 242], false), puff = sprite(64, [158, 220, 255], true);

    function buildSky(sc) {
      var key = sc.W + 'x' + sc.H + ':' + Math.round(sc.keep[2]);
      if (skyC && skyKey === key) return;
      skyKey = key;
      var w = Math.max(2, Math.round(sc.W / 2)), h = Math.max(2, Math.round(sc.H / 2));
      skyC = skyC || document.createElement('canvas');
      skyC.width = w; skyC.height = h;
      var x = skyC.getContext('2d');
      x.fillStyle = '#020b15'; x.fillRect(0, 0, w, h);
      x.save();
      x.translate(w * 0.6, h * 0.3); x.scale(w * 1.1095, h * 0.8321);
      var g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, '#19506a'); g.addColorStop(0.42, '#06243a'); g.addColorStop(0.82, '#020b15'); g.addColorStop(1, '#020b15');
      x.fillStyle = g; x.fillRect(-2, -2, 4, 4);
      x.restore();
      if (sc.wisp > 0) {   // a few faint wisps in the upper right
        var r = mulberry(11), x0 = (sc.keep[2] + 120) / 2;
        for (var i = 0; i < 7; i++) {
          var cx = lerp(x0, w * 0.98, r()), cy = h * lerp(0.07, 0.36, r()), rx = w * lerp(0.08, 0.16, r()), ry = rx * 0.16;
          if (cx < x0) continue;
          x.save(); x.translate(cx, cy); x.scale(rx, ry);
          var wg = x.createRadialGradient(0, 0, 0, 0, 0, 1);
          wg.addColorStop(0, 'rgba(128,199,224,0.05)'); wg.addColorStop(1, 'rgba(128,199,224,0)');
          x.fillStyle = wg; x.fillRect(-1, -1, 2, 2); x.restore();
        }
      }
    }
    function buildBandCss(sc) {
      if (palVer === sc.pal.ver) return;
      palVer = sc.pal.ver; bandCss = [];
      var P = sc.pal;
      for (var b = 0; b <= sc.N; b++) {
        var o = b * 4, fog = P.par[o], br = P.par[o + 1];
        var tint = function (c) { var m = mix3(c, C.fog, fog); return [m[0] * br, m[1] * br, m[2] * br]; };
        var top = tint([P.top[o], P.top[o + 1], P.top[o + 2]]), mid = tint([P.mid[o], P.mid[o + 1], P.mid[o + 2]]);
        var deep = tint([P.deep[o], P.deep[o + 1], P.deep[o + 2]]), dep = P.deep[o + 3];
        var low = tint(mix3(mix3([P.deep[o], P.deep[o + 1], P.deep[o + 2]], C.royal, 0.45 * dep * dep), C.abyss, 0.55));
        bandCss.push({
          dep: dep, deep: css(deep, 1), low: css(low, 1), abyss: css(tint(C.abyss), 1), midS: css(mid, 1),
          mid: css(mid, 0.55), top: css(top, 0.7), hi: css([0.93, 0.99, 1], 0.45 * P.top[o + 3] * (1 - fog)),
          gap: css(C.gap, P.flow[o + 3]), rim: css(C.rim, 0.16 + 0.2 * P.par[o + 2])
        });
      }
    }
    function crest(xs, y, S, st, off) {
      ctx.beginPath(); ctx.moveTo(xs[0], y[0] + off);
      for (var j = st; j < S; j += st) ctx.lineTo(xs[j], y[j] + off);
      ctx.lineTo(xs[S - 1], y[S - 1] + off);
    }

    R.draw = function (sc) {
      var W = sc.W, H = sc.H, xs = sc.xs, S = sc.S, N = sc.N, b, j, i;
      buildSky(sc); buildBandCss(sc);
      ctx.setTransform(sc.pw / W, 0, 0, sc.ph / H, 0, 0);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(skyC, 0, 0, W, H);
      if (sc.halo[3] > 0.01) {
        var hr = sc.halo[2] * 1.5, hg = ctx.createRadialGradient(sc.halo[0], sc.halo[1], 0, sc.halo[0], sc.halo[1], hr);
        hg.addColorStop(0, css([0.2, 0.56, 0.72], 0.34 * sc.halo[3])); hg.addColorStop(0.5, css([0.1, 0.4, 0.55], 0.12 * sc.halo[3])); hg.addColorStop(1, 'rgba(20,80,110,0)');
        ctx.fillStyle = hg; ctx.fillRect(sc.halo[0] - hr, sc.halo[1] - hr, hr * 2, hr * 2);
      }
      var st = S > 160 ? 2 : 1;
      for (b = 0; b < N; b++) {
        var B = sc.bands[b], y = B.y, minF = B.minF, bc = bandCss[b], front = b === N - 1;
        var ymin = 1e9;
        ctx.beginPath(); ctx.moveTo(xs[0], y[0]);
        for (j = st; j < S; j += st) { ctx.lineTo(xs[j], y[j]); if (y[j] < ymin) ymin = y[j]; }
        ctx.lineTo(xs[S - 1], y[S - 1]);
        for (j = S - 1; j >= 0; j -= st) ctx.lineTo(xs[j], Math.max(y[j] + 2, minF[j] + 8));
        ctx.lineTo(xs[0], Math.max(y[0] + 2, minF[0] + 8));
        ctx.closePath();
        var lg = ctx.createLinearGradient(0, ymin, 0, ymin + 120 + 260 * bc.dep);
        if (front) { lg.addColorStop(0, bc.midS); lg.addColorStop(0.3, bc.deep); lg.addColorStop(0.7, bc.low); }
        else { lg.addColorStop(0, bc.deep); lg.addColorStop(0.45, bc.low); }
        lg.addColorStop(1, bc.abyss);
        ctx.fillStyle = lg; ctx.fill();
        ctx.save(); ctx.clip();
        ctx.lineJoin = 'round';
        crest(xs, y, S, st, 0); ctx.lineWidth = 2 * (22 + 22 * bc.dep); ctx.strokeStyle = bc.mid; ctx.stroke();
        ctx.lineWidth = 2 * (7 + 6 * bc.dep); ctx.strokeStyle = bc.top; ctx.stroke();
        if (front && sc.glit[3] > 0.01) {      // soft moon column under the logo
          var gx = sc.glit[0], gy = B.y[Math.round(clamp((gx - xs[0]) / (xs[1] - xs[0]), 0, S - 1))];
          ctx.save(); ctx.translate(gx, gy + 90); ctx.scale(sc.glit[2] * 1.1, 110);
          var cg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
          cg.addColorStop(0, css([0.5, 0.82, 0.95], 0.16 * sc.glit[3])); cg.addColorStop(1, 'rgba(120,200,235,0)');
          ctx.fillStyle = cg; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
        }
        crest(xs, y, S, st, 2.5 + 2 * bc.dep); ctx.lineWidth = 1.2 + bc.dep; ctx.strokeStyle = bc.hi; ctx.stroke();
        ctx.restore();
        if (!front) {                          // luminous rim instead of a dark outline
          ctx.globalCompositeOperation = 'lighter';
          crest(xs, y, S, st, -2.2); ctx.lineWidth = 3.5; ctx.strokeStyle = bc.rim; ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        }
        crest(xs, y, S, st, -B.gap * 0.5); ctx.lineWidth = B.gap; ctx.strokeStyle = bc.gap; ctx.stroke();
      }
      var lip = sc.lip;
      if (lip.active && lip.alpha > 0.02) {
        var LS = sc.LS;
        ctx.globalAlpha = lip.alpha;
        ctx.beginPath(); ctx.moveTo(lip.x[0], lip.y[0]);
        for (j = 1; j < LS; j++) ctx.lineTo(lip.x[j], lip.y[j]);
        for (j = LS - 1; j >= 0; j--) ctx.lineTo(lip.x[j] + lip.nx[j] * lip.w[j], lip.y[j] + lip.ny[j] * lip.w[j]);
        ctx.closePath();
        var lgr = ctx.createLinearGradient(lip.x[0], lip.y[0] - 40, lip.x[LS - 1], lip.y[LS - 1] + 30);
        lgr.addColorStop(0, '#1c9fd2'); lgr.addColorStop(1, '#7fd9f2');
        ctx.fillStyle = lgr; ctx.fill();
        ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(200,242,253,0.75)'; ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // light
      ctx.globalCompositeOperation = 'lighter';
      var Pp = sc.P, a, k, s, x0, y0;
      for (i = 0; i < Pp.n; i++) {
        a = Pp.a[i]; if (a < 0.01) continue;
        k = Pp.k[i]; x0 = Pp.x[i]; y0 = Pp.y[i]; s = Pp.s[i];
        if (k === K_MIST || k === K_PUFF || k === K_BLOOM) {
          ctx.globalAlpha = Math.min(1, a * 1.1); ctx.drawImage(puff, x0 - s, y0 - s * 0.62, s * 2, s * 1.24);
        } else if (k === K_RING) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = 'rgba(160,230,250,' + (a * 0.35).toFixed(3) + ')'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(x0, y0, s * 0.82, s * 0.27 * 0.82, 0, 0, TAU); ctx.stroke();
          ctx.strokeStyle = 'rgba(210,246,255,' + (a * 0.4).toFixed(3) + ')'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.ellipse(x0, y0, s * 0.82, s * 0.27 * 0.82, 0, 0.15, Math.PI - 0.15); ctx.stroke();
        } else {
          var r = k === K_BEAD ? s * 4.5 : s * 2.6;
          ctx.globalAlpha = Math.min(1, a); ctx.drawImage(k === K_BIO ? dotC : dotW, x0 - r, y0 - r, r * 2, r * 2);
        }
      }
      var G = sc.G;
      for (i = 0; i < G.n; i++) {
        if (G.a[i] < 0.01) continue;
        ctx.globalAlpha = Math.min(1, G.a[i]); ctx.drawImage(dotW, G.x[i] - G.r[i] * 0.6, G.y[i] - G.r[i] * 0.6, G.r[i] * 1.2, G.r[i] * 1.2);
      }
      if (sc.ptr[3] > 0.01) {                  // lantern
        var pr = sc.ptr[2] * 0.9, pg = ctx.createRadialGradient(sc.ptr[0], sc.ptr[1], 0, sc.ptr[0], sc.ptr[1], pr);
        pg.addColorStop(0, css(C.lantern, 0.12 * sc.ptr[3])); pg.addColorStop(1, 'rgba(112,229,242,0)');
        ctx.globalAlpha = 1; ctx.fillStyle = pg; ctx.fillRect(sc.ptr[0] - pr, sc.ptr[1] - pr, pr * 2, pr * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      // scrim
      var sm = sc.scrim;
      var lgs = ctx.createLinearGradient(0, 0, sm[7], 0);
      lgs.addColorStop(0, 'rgba(3,13,25,' + sm[5] + ')'); lgs.addColorStop(1, 'rgba(3,13,25,0)');
      ctx.fillStyle = lgs; ctx.fillRect(0, 0, W, H);
      var cx = (sm[0] + sm[2]) / 2, cy = (sm[1] + sm[3]) / 2, rr = Math.max(sm[2] - sm[0], sm[3] - sm[1]) * 0.75;
      var rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
      rg.addColorStop(0, 'rgba(3,13,25,' + sm[4] + ')'); rg.addColorStop(1, 'rgba(3,13,25,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      var bg = ctx.createLinearGradient(0, H - 96, 0, H);
      bg.addColorStop(0, 'rgba(3,13,25,0)'); bg.addColorStop(1, 'rgba(3,13,25,' + sm[6] + ')');
      ctx.fillStyle = bg; ctx.fillRect(0, H - 96, W, 96);
    };
    R.dispose = noop;
    return R;
  }

  /* ================================================================== mount */
  function mount(canvas, opts) {
    opts = opts || {};
    if (canvas && typeof canvas.getContext === 'function') {
      try { return mountImpl(canvas, opts); } catch (e) { /* fall through to the static page */ }
    }
    if (typeof opts.onBreak === 'function') setTimeout(function () { try { opts.onBreak(); } catch (e) { /* host error */ } }, 0);
    return { destroy: noop, splash: noop };
  }

  function mountImpl(canvas, opts) {
    var doc = document;
    var host = canvas.parentElement || canvas;
    var logo = opts.logo && opts.logo.style ? opts.logo : null;
    var textEl = opts.textEl && opts.textEl.getBoundingClientRect ? opts.textEl : null;
    var interactive = opts.interactive !== false;
    var mq = null;
    try { mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null; } catch (e) { mq = null; }
    var forcedRM = typeof opts.reducedMotion === 'boolean';
    var reduced = forcedRM ? opts.reducedMotion : !!(mq && mq.matches);
    // QA hook (debug mounts only): force the 'full' or 'lite' tier whatever renderer is detected
    var forcedTier = opts.debug && (opts.tier === 'full' || opts.tier === 'lite') ? opts.tier : '';

    var disposers = [], timers = [];
    var destroyed = false;
    function on(target, type, fn, o) {
      target.addEventListener(type, fn, o);
      disposers.push(function () { target.removeEventListener(type, fn, o); });
    }
    function later(fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; }

    var saved = { pe: canvas.style.pointerEvents, vis: canvas.style.visibility, display: canvas.style.display };
    var logoSaved = logo ? {
      opacity: logo.style.opacity, transform: logo.style.transform, clipPath: logo.style.clipPath,
      webkitClipPath: logo.style.webkitClipPath, willChange: logo.style.willChange
    } : null;
    canvas.style.pointerEvents = 'none';      // the canvas never eats clicks meant for the hero's buttons

    /* ---- renderer chain: WebGL -> 2D (sibling canvas when GL owns this one) -> static CSS ---- */
    var R = null, glR = null, sibling = null, target = canvas, ro = null, io = null;
    function makeSibling() {
      if (sibling) return sibling;
      sibling = doc.createElement('canvas');
      sibling.className = canvas.className;
      sibling.setAttribute('aria-hidden', 'true');
      sibling.style.cssText = canvas.style.cssText;
      sibling.style.display = saved.display || '';
      sibling.style.visibility = '';
      sibling.style.pointerEvents = 'none';
      if (canvas.parentNode) canvas.parentNode.insertBefore(sibling, canvas.nextSibling);
      canvas.style.display = 'none';
      if (ro) { try { ro.unobserve(canvas); ro.observe(sibling); } catch (e) { /* ignore */ } }
      target = sibling;
      return sibling;
    }
    function removeSibling() {
      if (!sibling) return;
      if (ro) { try { ro.unobserve(sibling); ro.observe(canvas); } catch (e) { /* ignore */ } }
      if (sibling.parentNode) sibling.parentNode.removeChild(sibling);
      sibling = null;
      target = canvas;
      canvas.style.display = saved.display;
    }
    // Tiers: 'full' on a GPU; 'lite' (small buffer, ~20 fps, simpler shading, fewer particles) when WebGL is
    // software-rendered, or missing altogether (in a current browser that almost always means no usable GPU,
    // and the 2D fallback would then rasterise on the CPU too).
    var lite = forcedTier === 'lite';
    var glSeen = null;                        // what WebGL reported (for the ?wave=info readout)
    if (opts.renderer !== '2d') {
      glR = createGLRenderer(canvas, forcedTier);
      glSeen = glR ? { gpu: glR.gpu, soft: glR.soft, caveat: glR.caveat, failed: glR.failed } : { gpu: '', none: true };
      if (glR) lite = glR.lite;
      else if (!forcedTier) lite = true;
      if (glR && glR.failed) {
        // a WebGL context exists but the shaders failed: 2D must live on a sibling canvas
        try { glR.dispose(); } catch (e) { /* ignore */ }
        glR = null;
        R = create2DRenderer(makeSibling());
      } else if (glR) {
        R = glR;
      }
    }
    if (!R && !sibling) R = create2DRenderer(canvas);
    if (!R) {
      removeSibling();
      canvas.style.visibility = 'hidden';
      throw new Error('no renderer');
    }

    /* ---- state ---- */
    var W = 0, H = 0, dpr = 1, dprScale = 1, pw = 0, ph = 0;
    var mobile = false, s = 1;
    var N = 5, S = 0, M = 0, LS = 48, sx = 6, dx = 12, pad = 44;
    var xs = null, bands = [];
    var lcx = 0, yb = 0, lw = 300, xBreak = 0, xSet = 0;
    var logoR = null, textR = null, textLines = [];
    var keepX0 = 0, keepY0 = 0, keepX1 = -1, keepY1 = -1, hasKeep = false;
    var t = 0;                                    // animation clock (s) - only advances while running
    var animIntro = opts.intro !== false && !reduced;
    var introT = animIntro ? 0 : 99;
    var INTRO_END = 3.4;
    var introStarted = false, introDone = !animIntro;
    var held = false;
    var surge = null, nextSet = 99, nextWind = 99;
    var broke = false;
    var dirty = true, bufDirty = true, baseMoving = false;
    var raf = 0, lastTs = 0, visible = true, debugPaused = false;
    var drawn = 0;                                // frames drawn (stats, ?wave=info)
    var frozen = false, freezeTimer = 0, quietAt = 0, freezes = 0, thawAt = 0;   // scroll freeze (see onScrollish())
    var perf = { acc: 0, n: 0, last: 0, warm: 0, over: 0, up: 0, upAt: -1e9, lock: false, pin: false, steps: 0 };
    var d0 = 1;                                   // buffer scale before the adaptive factor (dprScale)
    var resFloor = 1;                             // lowest dprScale the adaptive step may take (computeBuffer())
    var pinD = 0;                                 // debug mounts only: a pinned buffer density (_debug.pin)
    var liteMin = 0.75;                           // lite: lowest buffer px per CSS px (0.5 in an emergency, judge())
    // frame-rate ladder (see judge()): the frame rate steps down before the resolution does
    var FPS = lite ? [24, 20, 15, 12] : [60, 45, 30, 24], fpsI = 0;
    var dueTs = 0;                                // when the next frame is due (frame governor)
    var rafPrev = 0, ivs = new Float32Array(64), ivTmp = new Float32Array(64), ivN = 0;   // rAF intervals (ms)
    var refIv = 1000 / 60;                        // the browser's frame interval: display refresh or its cap
    var lip = {
      active: false, alpha: 1, g: 1.5, x: new Float32Array(LS), y: new Float32Array(LS), nx: new Float32Array(LS),
      ny: new Float32Array(LS), w: new Float32Array(LS), u: new Float32Array(LS), foam: new Float32Array(LS)
    };
    var ptr = { x: -1e4, y: -1e4, sx: -1e4, sy: -1e4, vx: 0, vy: 0, inside: false, str: 0, lan: 0, mouse: false, lastMove: 0, bioAcc: 0, prevSide: new Int8Array(8) };
    var flowSpd = new Float32Array(8), glossOff = new Float32Array(8);

    /* particles: packed typed arrays, swap-remove, nothing allocated per frame */
    var MAXP = 900;
    var P = {
      n: 0, x: new Float32Array(MAXP), y: new Float32Array(MAXP), vx: new Float32Array(MAXP), vy: new Float32Array(MAXP),
      l: new Float32Array(MAXP), m: new Float32Array(MAXP), s: new Float32Array(MAXP), s0: new Float32Array(MAXP),
      a0: new Float32Array(MAXP), a: new Float32Array(MAXP), p: new Float32Array(MAXP), c: new Float32Array(MAXP),
      k: new Uint8Array(MAXP), b: new Uint8Array(MAXP)
    };
    var kinds = new Int32Array(7);
    var GMAX = 16;
    var G = { n: 0, x: new Float32Array(GMAX), y: new Float32Array(GMAX), r: new Float32Array(GMAX), a: new Float32Array(GMAX), l: new Float32Array(GMAX), m: new Float32Array(GMAX), b: new Uint8Array(GMAX) };
    var clipY = new Float32Array(13), clipQ = new Int16Array(13), clipState = -1;
    var logoTyQ = 1e9, logoRotQ = 1e9, logoOpQ = -1;

    var scene = {
      W: 0, H: 0, pw: 0, ph: 0, t: 0, N: 0, S: 0, LS: LS, xs: null, bands: null, lip: lip, P: P, G: G, pal: null,
      halo: new Float32Array(4), light: new Float32Array(4), glit: new Float32Array(4), ptr: new Float32Array(4),
      scrim: new Float32Array(8), keep: new Float32Array(4), skyT: new Float32Array(4),
      ta: new Float32Array(4), tb: new Float32Array(4), tc: new Float32Array(4),
      wisp: 0, glossW: 220, fw: 1, rimExt: 10
    };
    var pal = {
      ver: 0, top: new Float32Array(32), mid: new Float32Array(32), deep: new Float32Array(32),
      par: new Float32Array(32), flow: new Float32Array(32)
    };
    scene.pal = pal;

    function clipLogo() { return !!logo && !!R && R.kind === 'gl' && !reduced; }

    /* ---- measurement / layout ---- */
    function measure() {
      var cr = target.getBoundingClientRect();
      W = Math.max(1, cr.width); H = Math.max(1, cr.height);
      logoR = null; textR = null;
      if (logo) {
        // offset geometry ignores the transform we apply to the logo
        var lwid = logo.offsetWidth, lhei = logo.offsetHeight;
        if (lwid > 4 && lhei > 4) {
          if (logo.offsetParent && logo.offsetParent === target.offsetParent) {
            logoR = { x: logo.offsetLeft - target.offsetLeft, y: logo.offsetTop - target.offsetTop, w: lwid, h: lhei };
          } else {
            var lr = logo.getBoundingClientRect();
            logoR = { x: lr.left - cr.left + (lr.width - lwid) / 2, y: lr.top - cr.top + (lr.height - lhei) / 2 - (logoTyQ < 1e8 ? logoTyQ / 4 : 0), w: lwid, h: lhei };
          }
        }
      }
      textLines = [];
      if (textEl) {
        // tight line boxes of the real text + buttons (not the full-width block)
        try {
          var walker = doc.createTreeWalker(textEl, 4 /* SHOW_TEXT */, null), range = doc.createRange(), node, i, rs;
          var add = function (q) {
            if (q.width > 0.5 && q.height > 0.5) textLines.push({ x0: q.left - cr.left, y0: q.top - cr.top, x1: q.right - cr.left, y1: q.bottom - cr.top });
          };
          while ((node = walker.nextNode())) {
            if (!node.nodeValue || !/\S/.test(node.nodeValue)) continue;
            range.selectNodeContents(node);
            rs = range.getClientRects();
            for (i = 0; i < rs.length; i++) add(rs[i]);
          }
          var els = textEl.querySelectorAll('a,button');
          for (i = 0; i < els.length; i++) add(els[i].getBoundingClientRect());
        } catch (e) { textLines = []; }
        if (textLines.length) {
          var u0 = 1e9, v0 = 1e9, u1 = -1e9, v1 = -1e9;
          for (var q = 0; q < textLines.length; q++) {
            var tl = textLines[q];
            u0 = Math.min(u0, tl.x0); v0 = Math.min(v0, tl.y0); u1 = Math.max(u1, tl.x1); v1 = Math.max(v1, tl.y1);
          }
          textR = { x: u0, y: v0, w: u1 - u0, h: v1 - v0 };
        } else {
          var tr = textEl.getBoundingClientRect();
          if (tr.width > 4 && tr.height > 4) textR = { x: tr.left - cr.left, y: tr.top - cr.top, w: tr.width, h: tr.height };
        }
      }
      bufDirty = true;
    }

    // Resolution policy, in drawing-buffer pixels per CSS pixel (d). The cost of a sharp frame is paid in
    // frame rate (judge()), so the buffer is the screen's own pixels wherever that is affordable at all:
    //   full: the device ratio up to 2, within 5.6 Mpx (1.9 Mpx on phones) - a 1920x1080 @1.25 or a
    //         1440x900 @2 laptop is native. The budget never takes d below 1; only beyond 8.3 Mpx at d = 1
    //         (larger than a 4K screen) is d lowered, as a last resort.
    //   lite (software rendering): d = 1 within LITE_PX (CSS upscales by the device ratio), never below 0.75.
    // The adaptive step (dprScale) may then lower d to 1 (full) / 0.75 (lite), 0.8x that on very large screens.
    var LITE_PX = [0.5e6, 1.3e6];                 // lite budget: phones, larger screens
    function computeBuffer() {
      var dev = window.devicePixelRatio || 1, A = W * H, phone = W < 700;
      var is2d = R && R.kind === '2d';
      var big = A > 3.5e6;                        // a hero beyond ~2560x1370 CSS px: the floors give a little
      var d, minD, budget;
      if (lite) {
        minD = (big ? 0.8 : 1) * liteMin;
        budget = LITE_PX[phone ? 0 : 1];
        d = Math.min(dev, 1);
        if (A * d * d > budget) d = Math.max(Math.sqrt(budget / A), Math.min(d, minD));
      } else {
        minD = big ? 0.8 : 1;
        // 2D on a GPU (only when WebGL broke) rasterises paths and gradients: a little more modest
        budget = is2d ? (phone ? 1.2e6 : 3.3e6) : (phone ? 1.9e6 : 5.6e6);
        d = Math.min(dev, 2);
        if (A * d * d > budget) d = Math.max(Math.sqrt(budget / A), Math.min(d, 1));
        if (A * d * d > 8.3e6) d = Math.sqrt(8.3e6 / A);
      }
      d0 = d;
      resFloor = d0 > minD ? minD / d0 : 1;
      d = pinD > 0 ? pinD : d0 * Math.max(resFloor, Math.min(1, dprScale));
      dpr = d;
      pw = Math.max(1, Math.round(W * d)); ph = Math.max(1, Math.round(H * d));
      bufDirty = false;
    }
    // Only ever called right before a draw in the same task, so a resize never shows a blank frame.
    function applyBuffer() {
      if (bufDirty) computeBuffer();
      if (target.width !== pw) target.width = pw;
      if (target.height !== ph) target.height = ph;
      scene.pw = pw; scene.ph = ph; scene.fw = 1 / dpr;   // edge anti-aliasing width: one buffer pixel, in CSS px
    }

    function makeBand(b) {
      return {
        b: b, k: N - 1 - b,
        base: new Float32Array(S), tgt: new Float32Array(S), low: 0, y: new Float32Array(S), minF: new Float32Array(S),
        foam: new Float32Array(S), lit: new Float32Array(S), amp: new Float32Array(S),
        nd: new Float32Array(M), nv: new Float32Array(M), na: new Float32Array(M), nf: new Float32Array(M),
        gap: 1.5, alpha: 1, p1: 0, p2: 0, ampK: 1
      };
    }

    var lastLayoutW = 0, lastLayoutH = 0, firstLayout = true;
    function layout(snap) {
      var sizeChanged = Math.abs(W - lastLayoutW) > 0.5 || Math.abs(H - lastLayoutH) > 0.5;
      if (sizeChanged) { P.n = 0; kinds.fill(0); lastLayoutW = W; lastLayoutH = H; }   // positions belong to the old geometry
      mobile = W < 700;
      s = clamp(Math.min(W / 1440, H / 850) * 0.5 + 0.5, 0.62, 1.2);
      if (mobile) s = clamp(W / 600, 0.55, 0.8);
      var nN = mobile ? 4 : 5;
      // crest sample spacing (CSS px): every tier draws at ~1 buffer px per CSS px or more, so all get the
      // same smooth crests (the geometry is a few thousand vertices: nothing next to the pixels)
      var nsx = Math.max(mobile ? 4 : 6, (W + 2 * pad) / 560);
      var nS = Math.ceil((W + 2 * pad) / nsx) + 1;
      var ndx = mobile ? 9 : 12;
      var nM = Math.ceil((W + 2 * pad) / ndx) + 2;
      var reuse = !firstLayout && !sizeChanged && nN === N && nS === S && nM === M && bands.length === N;
      N = nN; sx = nsx; S = nS; dx = ndx; M = nM;
      var j, b, k, B;
      if (!reuse) {
        xs = new Float32Array(S);
        for (j = 0; j < S; j++) xs[j] = -pad + j * sx;
        bands = [];
        for (b = 0; b < N; b++) bands.push(makeBand(b));
      }

      // anchors: the logo decides where the swell rises to; the water overlaps its
      // bottom ~10% only when the logo is clipped by the live WebGL waterline
      var wl = clipLogo() ? 0.905 : 0.94;
      if (logoR) {
        lcx = logoR.x + logoR.w * 0.5; lw = logoR.w;
        yb = clamp(logoR.y + logoR.h * wl, H * 0.5, H * 0.95);
      } else {
        lcx = W * (mobile ? 0.8 : 0.76); lw = mobile ? 160 : clamp(W * 0.3, 240, 450);
        yb = H * (mobile ? 0.86 : 0.72);
      }
      lcx = clamp(lcx, W * 0.35, W * 0.97);
      xBreak = lcx - lw * (mobile ? 0.40 : 0.32);
      xSet = lcx + lw * 0.64 < W - 40 ? lcx + lw * 0.64 : Math.max(40, lcx - lw * 0.64);

      // front band: low along the bottom-left, sweeping up to the logo's waterline, then nearly flat
      var yL = H * (mobile ? 0.975 : 0.958);
      var dY = Math.max(0, yL - yb);
      var fxp = [-0.12 * W, 0.3 * lcx, 0.58 * lcx, 0.8 * lcx, lcx, lcx + 0.5 * (W - lcx) + 1, W * 1.12 + 2];
      var fyp = [yL + 0.01 * H, yL - 0.03 * dY, yL - 0.26 * dY, yL - 0.76 * dY, yb, yb - (mobile ? 0.008 : 0.02) * H, yb - (mobile ? 0.012 : 0.03) * H];
      var front = monotone(fxp, fyp);
      // bands behind it: blade-like tapered tails emerging one after another (like the logo's lower bands)
      var sp = (mobile ? 0.042 : 0.058) * H;
      var spk = [0, 1.0, 0.84, 1.1, 0.9];
      var tailX = mobile ? [0, 0.0, 0.26, 0.5] : [0, 0.02, 0.17, 0.34, 0.5];
      var Lt = 0.38 * lcx;
      var fan = new Float32Array(S);
      for (j = 0; j < S; j++) {
        var xj = xs[j];
        fan[j] = xj <= lcx ? 0.55 + 0.45 * sstep(0.15 * lcx, lcx, xj) : 1 + 0.25 * (xj - lcx) / Math.max(1, W - lcx);
      }
      for (k = 0; k < N; k++) {
        B = bands[N - 1 - k];
        var Pb = k > 0 ? bands[N - k] : null;
        for (j = 0; j < S; j++) {
          var x = xs[j];
          if (!Pb) { B.tgt[j] = front(x); continue; }
          var tp = sstep(tailX[k] * lcx, tailX[k] * lcx + Lt, x);
          B.tgt[j] = Pb.tgt[j] - sp * spk[k] * fan[j] * tp + 5 * (1 - tp);
        }
      }

      // keep the water clear of the actual text lines (pushes the whole stack down where needed)
      if (textLines.length) {
        var keep = new Float32Array(S), wide = W > 1800 ? 1 : 0;
        var margin = (mobile ? 0.035 : 0.05) * H + wide * 26, side = 50 + wide * 40;
        for (var r = 0; r < textLines.length; r++) {
          var L = textLines[r];
          for (j = 0; j < S; j++) if (xs[j] > L.x0 - side && xs[j] < L.x1 + side) keep[j] = Math.max(keep[j], L.y1 + margin);
        }
        keep = blur1(blur1(keep, Math.round(70 / sx)), Math.round(70 / sx));
        var top = bands[0], push = new Float32Array(S);
        for (j = 0; j < S; j++) { var z = keep[j] - top.tgt[j]; push[j] = 0.5 * (z + Math.sqrt(z * z + 900)) - 15; }
        push = blur1(push, Math.round(40 / sx));
        for (b = 0; b < N; b++) for (j = 0; j < S; j++) bands[b].tgt[j] += Math.max(0, push[j]);
      }

      for (b = 0; b < N; b++) {
        B = bands[b]; k = B.k;
        var f = k / (N - 1);
        for (j = 0; j < S; j++) B.amp[j] = 0.4 + 0.6 * clamp((fan[j] - 0.55) / 0.45, 0, 1);
        B.ampK = lerp(mobile ? 7 : 12, mobile ? 4 : 7, f) * s;
        B.p1 = k * 0.55 + 0.3; B.p2 = k * 0.9 + 1.3;
        B.gap = k === 0 ? (mobile ? 1.3 : 1.5) : lerp(1.1, 0.8, f);
        B.low = H * ((mobile ? 0.935 : 0.915) - (mobile ? 0.013 : 0.016) * k);   // calm low-tide sliver before the tide comes in
        if (!reuse || snap) B.base.set(B.tgt);
      }
      baseMoving = reuse && !snap;
      ptr.prevSide.fill(0);

      // per-band material (draw order; index N = the curl lip)
      for (b = 0; b <= N; b++) {
        var kk = b === N ? 0 : N - 1 - b, ff = kk / (N - 1), o = b * 4;
        var tc = mix3(C.topF, C.topB, Math.pow(ff, 0.8)), mc = mix3(C.midF, C.midB, ff), dc = mix3(C.deepF, C.deepB, ff);
        var alt = (kk % 2) ? 0.88 : 1.0;
        pal.top[o] = tc[0]; pal.top[o + 1] = tc[1]; pal.top[o + 2] = tc[2]; pal.top[o + 3] = lerp(1.0, 0.45, ff);
        pal.mid[o] = mc[0]; pal.mid[o + 1] = mc[1]; pal.mid[o + 2] = mc[2]; pal.mid[o + 3] = b === N ? 1 : 0;
        pal.deep[o] = dc[0]; pal.deep[o + 1] = dc[1]; pal.deep[o + 2] = dc[2]; pal.deep[o + 3] = 1 - ff;
        pal.par[o] = 0.5 * Math.pow(ff, 1.4); pal.par[o + 1] = (1 - 0.08 * ff) * alt * (b === N ? 1.04 : 1);
        pal.par[o + 2] = kk === 0 ? 0.2 : lerp(0.62, 0.34, ff); pal.par[o + 3] = 0;
        pal.flow[o + 3] = kk === 0 ? 0.66 : lerp(0.34, 0.16, ff);           // gap-line opacity, fading with depth
        flowSpd[b] = lerp(34, 14, ff) * s;
        glossOff[b] = ((kk * 0.37 + 0.11) % 1);
      }
      pal.ver++;

      scene.W = W; scene.H = H; scene.N = N; scene.S = S;
      scene.xs = xs; scene.bands = bands;
      scene.glossW = 230 * s;
      scene.rimExt = 10;
      // text keep-out (particles fade out inside it) and scrim
      var trr = textR || (mobile ? { x: 0, y: H * 0.12, w: W, h: H * 0.5 } : { x: W * 0.04, y: H * 0.26, w: W * 0.54, h: H * 0.5 });
      hasKeep = !!textR;
      var km = mobile ? 10 : 16;
      keepX0 = trr.x - km; keepY0 = trr.y - km; keepX1 = trr.x + trr.w + km; keepY1 = trr.y + trr.h + km;
      scene.keep[0] = keepX0; scene.keep[1] = keepY0; scene.keep[2] = textR ? keepX1 : W * 0.5; scene.keep[3] = keepY1;
      var sc = scene.scrim;
      sc[0] = trr.x; sc[1] = trr.y; sc[2] = trr.x + trr.w; sc[3] = trr.y + trr.h;
      // sc[6] = 1: the bottom rows fade exactly to the page colour #030d19, so there is no seam above #about
      sc[4] = mobile ? 0.3 : 0.26; sc[5] = mobile ? 0.16 : 0.4; sc[6] = 1; sc[7] = mobile ? W * 1.1 : Math.max(W * 0.6, trr.x + trr.w + 60);

      // crest glints are re-seeded on layout
      G.n = mobile ? 6 : 12;
      for (var i = 0; i < G.n; i++) { newGlint(i, Math.random); G.l[i] = Math.random() * G.m[i]; }
      firstLayout = false;
      dirty = false;
    }

    function approachBase(dt) {
      if (!baseMoving) return;
      var kf = 1 - Math.exp(-dt * 3), mx = 0;
      for (var b = 0; b < N; b++) {
        var B = bands[b], base = B.base, tgt = B.tgt;
        for (var j = 0; j < S; j++) {
          var d = tgt[j] - base[j];
          base[j] += d * kf;
          if (d > mx) mx = d; else if (-d > mx) mx = -d;
        }
      }
      if (mx < 0.05) baseMoving = false;
    }

    /* ---- sampling helpers ---- */
    function sampleIdx(x) { return clamp((x + pad) / sx, 0, S - 1.001); }
    function crestAt(B, x) {
      var f = sampleIdx(x), j = f | 0, u = f - j;
      return B.y[j] + (B.y[j + 1] - B.y[j]) * u;
    }
    function baseAt(B, x) {
      var f = sampleIdx(x), j = f | 0, u = f - j;
      return B.base[j] + (B.base[j + 1] - B.base[j]) * u;
    }
    function simAt(B, x) {                         // Catmull-Rom on the spring nodes
      var f = clamp((x + pad) / dx, 0, M - 1.001), k = f | 0, u = f - k;
      var p0 = B.nd[k > 0 ? k - 1 : 0], p1 = B.nd[k], p2 = B.nd[k + 1], p3 = B.nd[k + 2 < M ? k + 2 : M - 1];
      return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
    }
    function foamAt(B, x) {
      var f = clamp((x + pad) / dx, 0, M - 1.001), k = f | 0, u = f - k;
      return B.nf[k] + (B.nf[k + 1] - B.nf[k]) * u;
    }
    function bandBelow(x, y) {                     // nearest band whose crest is below (y down) the point
      var best = N - 1, bd = 1e9;
      for (var b = 0; b < N; b++) {
        var d = crestAt(bands[b], x) - y;
        if (d > -6 && d < bd) { bd = d; best = b; }
      }
      return best;
    }
    function bandAt(x, y) {                        // frontmost band whose water contains the point, -1 = sky
      for (var b = N - 1; b >= 0; b--) if (y >= crestAt(bands[b], x) - 4) return b;
      return -1;
    }
    function keepFade(x, y) {                      // 0 inside the text keep-out, 1 clear of it
      if (!hasKeep) return 1;
      var d = Math.max(Math.max(keepX0 - x, x - keepX1), Math.max(keepY0 - y, y - keepY1));
      return d >= 28 ? 1 : (d <= 0 ? 0 : d / 28);
    }
    function inText(x, y) {
      for (var i = 0; i < textLines.length; i++) {
        var L = textLines[i];
        if (x > L.x0 - 6 && x < L.x1 + 6 && y > L.y0 - 6 && y < L.y1 + 6) return true;
      }
      return false;
    }

    /* ---- particles ---- */
    function spawn(kind, x, y, vx, vy, life, size, alpha, band) {
      if (P.n >= MAXP) return -1;
      var i = P.n++;
      P.k[i] = kind; P.b[i] = band; P.x[i] = x; P.y[i] = y; P.vx[i] = vx; P.vy[i] = vy;
      P.l[i] = 0; P.m[i] = life; P.s[i] = size; P.s0[i] = size; P.a0[i] = alpha; P.a[i] = 0; P.p[i] = 0; P.c[i] = Math.random();
      kinds[kind]++;
      return i;
    }
    function kill(i) {
      kinds[P.k[i]]--;
      var e = --P.n;
      if (i !== e) {
        P.k[i] = P.k[e]; P.b[i] = P.b[e]; P.x[i] = P.x[e]; P.y[i] = P.y[e]; P.vx[i] = P.vx[e]; P.vy[i] = P.vy[e];
        P.l[i] = P.l[e]; P.m[i] = P.m[e]; P.s[i] = P.s[e]; P.s0[i] = P.s0[e]; P.a0[i] = P.a0[e]; P.a[i] = P.a[e];
        P.p[i] = P.p[e]; P.c[i] = P.c[e];
      }
    }
    function addDrop(x, y, vx, vy, size, life, minVx) {
      if (kinds[K_DROP] >= (lite ? (mobile ? 110 : 220) : (mobile ? 240 : 560))) return;
      if (minVx !== undefined && vx < minVx) vx = minVx + (vx - minVx) * 0.15;
      if (keepFade(x, y) <= 0) return;
      spawn(K_DROP, x, y, vx, vy, life, size, 1, bandBelow(x, y + 30));
    }
    function addMist(x, y, r, a, vx, vy, life) {
      if (kinds[K_MIST] >= (lite ? 36 : 70)) return;
      spawn(K_MIST, x, y, vx, vy, life, r, a, N - 1);
    }
    function addRing(x, y, rmax, life, a, b) {
      if (kinds[K_RING] >= 12) return;
      var i = spawn(K_RING, x, y, 0, 0, life, 4, a, b === undefined ? N - 1 : b);
      if (i >= 0) P.p[i] = rmax;
    }
    function impulse(b, x, v, sigma, foam) {
      var B = bands[b]; if (!B) return;
      var k0 = Math.max(0, Math.floor((x - 3 * sigma + pad) / dx)), k1 = Math.min(M - 1, Math.ceil((x + 3 * sigma + pad) / dx));
      for (var k = k0; k <= k1; k++) {
        var xx = -pad + k * dx, gk = Math.exp(-((xx - x) * (xx - x)) / (sigma * sigma));
        B.nv[k] += v * gk;
        if (foam) B.nf[k] = Math.max(B.nf[k], foam * gk);
      }
    }

    // a splash at (x,y): a crown of round droplets thrown up and to the right, mist,
    // soft lit ripple rings and a pulse through nearby bands
    function splashAt(x, y, power, dir) {
      power = power || 1; dir = dir || 0;
      var n = Math.round((mobile ? 38 : 72) * power * (lite ? 0.55 : 1)), scl = mobile ? 0.72 : 1, pwr = Math.min(dir > 0 ? 1.22 : 1.45, Math.sqrt(power));
      var bias = 0.16 + (hasKeep && x < keepX1 + 220 && y > keepY0 - 40 ? 0.22 : 0);   // lean away from the copy
      for (var i = 0; i < n; i++) {
        var ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.35 + dir * 0.3 + bias;
        var far = Math.random() < 0.16;
        var sp = rnd(140, 420) * pwr * scl * (far ? 1.35 : 1);
        var rz = Math.random(), sz = rz < 0.55 ? rnd(0.55, 1.1) : (rz < 0.9 ? rnd(1.1, 2.0) : rnd(2.0, 3.0));
        addDrop(x + rnd(-14, 14) * scl * pwr, y + rnd(-4, 6), Math.cos(ang) * sp, Math.sin(ang) * sp, sz * scl, rnd(0.7, 1.35), dir > 0 ? -90 : undefined);
      }
      // white water: heavy spray that rises, swells and falls back, and a brief bloom of light
      for (i = 0; i < Math.round((mobile ? 4 : 7) * power); i++) {
        var pa = -Math.PI / 2 + (Math.random() - 0.5) * 0.9 + dir * 0.25 + bias;
        var ps = rnd(90, 250) * scl * Math.min(1.3, 0.6 + power * 0.35);
        spawn(K_PUFF, x + rnd(-20, 20) * scl, y - rnd(0, 6), Math.cos(pa) * ps * 0.8, Math.sin(pa) * ps, rnd(0.45, 0.8), rnd(8, 15) * scl, rnd(0.3, 0.45), N - 1);
      }
      spawn(K_BLOOM, x + 8 * scl, y - 12 * scl, 0, -30, 0.55, 60 * scl * Math.min(1.6, Math.sqrt(power)), 0.26 * Math.min(1.2, 0.5 + power * 0.4), N - 1);
      for (i = 0; i < Math.round(4 * power) + 2; i++) {
        addMist(x + rnd(-30, 42) * scl * pwr, y + rnd(-26, 4), rnd(26, 56) * scl * pwr, rnd(0.035, 0.07), rnd(-10, 26), rnd(-44, -12), rnd(1.3, 2.2));
      }
      if (power <= 1.01) {
        var bb = bandAt(x, y + 2); if (bb < 0) bb = N - 1;
        addRing(x, y, 130 * scl * Math.max(0.6, power), 1.4, 0.34 * Math.min(1, power + 0.2), bb);
        addRing(x, y, 70 * scl * Math.max(0.6, power), 1.0, 0.22 * Math.min(1, power + 0.2), bb);
      }
      for (var b = 0; b < N; b++) {
        var dy = crestAt(bands[b], x) - y, inf = Math.exp(-(dy * dy) / (140 * 140));
        if (inf > 0.04) impulse(b, x, 320 * s * power * inf, 55 * s, 0.9 * inf);
      }
    }

    // the wind tears a few droplets off the front crest, right of the copy
    function windSpray() {
      var FB = bands[N - 1];
      var x0 = mobile ? W * 0.3 : Math.max(W * 0.45, (hasKeep ? keepX1 : 0) + 60), x1 = W - 16;
      if (x1 - x0 < 40) return;
      var x = rnd(x0, x1), best = x, by = crestAt(FB, x);
      for (var q = -60; q <= 60; q += 12) {              // ride up to the local crest top
        var xx = clamp(x + q, x0, x1), yy = crestAt(FB, xx);
        if (yy < by) { by = yy; best = xx; }
      }
      var n = Math.round(rnd(8, 15) * (mobile ? 0.6 : 1));
      for (var i = 0; i < n; i++) {
        addDrop(best + rnd(-16, 16) * s, by - rnd(0, 3), rnd(50, 210) * s, -rnd(130, 330) * s, rnd(0.6, 1.7) * (mobile ? 0.8 : 1), rnd(0.8, 1.5));
      }
      addMist(best + 12, by - 10 * s, rnd(24, 44) * (mobile ? 0.6 : 1), 0.05, rnd(26, 50), -16, rnd(1.4, 2.2));
      impulse(N - 1, best, 60 * s, 26 * s, 0.35);
    }

    /* ---- surges: the intro tide and the periodic sets ---- */
    function startSurge(big) {
      var A = big ? H * (mobile ? 0.11 : 0.19) : H * (mobile ? 0.036 : 0.046);
      surge = {
        t0: big ? 0 : introT, big: big,
        x0: big ? -0.15 * W : 0.08 * lcx, x1: big ? xBreak : xSet,
        delay: big ? 0.1 : 0, travel: big ? 1.2 : 2.6,
        amp: A, curlStart: big ? 0.88 : 2.0, burstAt: big ? 1.42 : 2.75, curl: big ? 3.55 : 2.4,
        R: A * 0.42, w: A * 0.26, burst: false, xc: -1e4, A: 0, phi: 0, alpha: 1
      };
    }
    function updateSurge() {
      if (!surge) return;
      var g = surge, tt = introT - g.t0;
      var p = eOut((tt - g.delay) / g.travel);
      g.xc = lerp(g.x0, g.x1, p);
      g.A = g.amp * sstep(0.02, g.big ? 0.8 : 1.4, tt) * (1 - sstep(g.burstAt + 0.02, g.burstAt + 0.4, tt));
      g.phi = g.curl * eInOut((tt - g.curlStart) / (g.burstAt - g.curlStart));
      g.alpha = 1 - sstep(g.burstAt, g.burstAt + 0.13, tt);
      if (!g.burst && tt >= g.burstAt) { g.burst = true; burst(g); }
      if (tt > g.burstAt + 0.6) surge = null;
    }
    function surgeAt(k, x) {
      var g = surge;
      if (!g || g.A <= 0.01) return 0;
      var xc = g.xc - k * 16 * s, dxp = x - xc;
      var sig = dxp < 0 ? Math.max(120, W * (mobile ? 0.3 : 0.2)) : Math.max(40, W * (mobile ? 0.08 : 0.05));
      return g.A * Math.max(0.12, 1 - 0.24 * k) * Math.exp(-(dxp * dxp) / (sig * sig));
    }
    function burst(g) {
      var power = g.big ? (mobile ? 2.2 : 2.6) : 0.7;
      if (lip.active) {                   // the lip disintegrates into spray along its length
        for (var j = Math.floor(LS * 0.3); j < LS; j += (g.big ? 1 : 3)) {
          var tx = (lip.x[Math.min(LS - 1, j + 1)] - lip.x[Math.max(0, j - 1)]), ty = (lip.y[Math.min(LS - 1, j + 1)] - lip.y[Math.max(0, j - 1)]);
          var tl = Math.sqrt(tx * tx + ty * ty) || 1;
          var cnt = g.big ? 3 : 1;
          for (var c = 0; c < cnt; c++) {
            var sp = rnd(90, 300) * (mobile ? 0.7 : 1);
            addDrop(lip.x[j] + lip.nx[j] * rnd(0, lip.w[j]), lip.y[j] + lip.ny[j] * rnd(0, lip.w[j]),
              tx / tl * sp * 0.6 - lip.nx[j] * sp * 0.45 + rnd(-30, 50), ty / tl * sp * 0.3 - lip.ny[j] * sp * 0.45 - rnd(60, 200),
              rnd(0.8, 2.4) * (mobile ? 0.8 : 1), rnd(0.7, 1.3), -60);
          }
        }
      }
      var ix = lip.active ? lip.x[LS - 1] : g.xc + g.R, iy = lip.active ? lip.y[LS - 1] : crestAt(bands[N - 1], ix);
      splashAt(ix, iy, power, 1.25);
      impulse(N - 1, ix, 300 * s * (g.big ? 1 : 0.4), 85 * s, 1);
      if (N > 1) impulse(N - 2, ix + 20, 170 * s * (g.big ? 1 : 0.4), 90 * s, 0.5);
      if (g.big) { addMist(ix + 30, iy - 50, 110 * (mobile ? 0.6 : 1), 0.07, 14, -26, 1.8); fireBreak(); }
    }
    function fireBreak() {
      if (broke) return;
      broke = true;
      if (typeof opts.onBreak === 'function') later(function () { if (!destroyed) { try { opts.onBreak(); } catch (e) { /* host error */ } } }, 0);
    }

    function buildLip() {
      var g = surge;
      lip.active = !!(g && g.phi > 0.02 && g.alpha > 0.01);
      if (!lip.active) return;
      var FB = bands[N - 1];
      var px = g.xc, py = crestAt(FB, px);
      var R0 = g.R * (0.55 + 0.45 * sstep(0, 1, g.A / g.amp)), w0 = g.w;
      var rootN = 14, rootLen = R0 * 1.1, cX = px, cY = py + R0;
      var tot = 0, j;
      for (j = 0; j < LS; j++) {
        var x, y;
        if (j < rootN) {
          x = px - rootLen + rootLen * (j / rootN); y = crestAt(FB, x);
        } else {
          var th = g.phi * ((j - rootN + 1) / (LS - rootN));
          var r = R0 * (1 - 0.34 * th / Math.PI);
          x = cX + r * Math.sin(th); y = cY - r * Math.cos(th);
        }
        lip.x[j] = x; lip.y[j] = y;
      }
      for (j = 0; j < LS; j++) {
        var jl = j > 0 ? j - 1 : j, jr = j < LS - 1 ? j + 1 : j;
        var tx = lip.x[jr] - lip.x[jl], ty = lip.y[jr] - lip.y[jl], tl = Math.sqrt(tx * tx + ty * ty) || 1;
        lip.nx[j] = -ty / tl; lip.ny[j] = tx / tl;             // into the body (inside the curl)
        if (j > 0) { var ddx = lip.x[j] - lip.x[j - 1], ddy = lip.y[j] - lip.y[j - 1]; tot += Math.sqrt(ddx * ddx + ddy * ddy); }
        lip.u[j] = px - rootLen + tot;
        var sN = j / (LS - 1);
        var taper = sstep(0, 0.28, sN) * Math.pow(1 - sstep(0.45, 1.0, sN), 0.85);
        lip.w[j] = Math.max(0, w0 * taper * (0.4 + 0.6 * clamp(g.phi / 1.2, 0, 1)));
        lip.foam[j] = sstep(0.55, 1, sN) * 0.9 * clamp(g.phi / g.curl, 0, 1);
      }
      lip.alpha = g.alpha;
      lip.g = FB.gap;
    }

    /* ---- per-frame simulation ---- */
    function introMix(k, x) {              // 0 = calm low tide, 1 = the tide is in
      if (introT >= INTRO_END) return 1;
      var tt = introT - k * 0.055;
      if (tt <= 0) return 0;
      var fr = lerp(-0.5 * W, 1.5 * W, eOut(tt / 1.25));
      return (1 - sstep(fr - 0.45 * W, fr, x)) * eOut(tt / 1.05);
    }

    function simulate(dt) {
      if (dt <= 0) return;
      var steps = Math.min(12, Math.ceil(dt / (1 / 120))), h = dt / steps;
      var c2 = Math.pow(250 * s, 2), w02 = 2.6 * 2.6, damp = 1.5, cpl = 3.5;
      var pin = ptr.str > 0.01 && interactive;
      for (var st = 0; st < steps; st++) {
        for (var b = 0; b < N; b++) {
          var B = bands[b], nd = B.nd, nv = B.nv, na = B.na, k;
          var up = b > 0 ? bands[b - 1].nd : null, dn = b < N - 1 ? bands[b + 1].nd : null;
          for (k = 0; k < M; k++) {
            var l = nd[k > 0 ? k - 1 : 0], r = nd[k < M - 1 ? k + 1 : M - 1], c = nd[k];
            var acc = c2 * (l - 2 * c + r) / (dx * dx) - w02 * c - damp * nv[k];
            if (up) acc += cpl * (up[k] - c);
            if (dn) acc += cpl * (dn[k] - c);
            na[k] = acc;
          }
          if (pin) {
            var cy = crestAt(B, ptr.sx), dy = ptr.sy - cy;
            var R0 = 150 * s, inf = Math.exp(-(dy * dy) / (R0 * R0)) * ptr.str;
            if (inf > 0.02) {
              var sig = 70 * s, k0 = Math.max(0, Math.floor((ptr.sx - 3 * sig + pad) / dx)), k1 = Math.min(M - 1, Math.ceil((ptr.sx + 3 * sig + pad) / dx));
              var pull = clamp(dy, -95 * s, 95 * s) * 13 * inf;              // swell toward the cursor ...
              var wake = Math.min(Math.abs(ptr.vx), 1600) / 1600 * 520 * s * inf * (dy > -30 * s ? 1 : 0.3);   // ... and a wake
              var drag = Math.min(1, 5 * h) * inf;
              for (k = k0; k <= k1; k++) {
                var xx = -pad + k * dx, gk = Math.exp(-((xx - ptr.sx) * (xx - ptr.sx)) / (sig * sig));
                na[k] += (pull + wake) * gk;
                nv[k] += (ptr.vy * 0.5 - nv[k]) * drag * gk;
              }
            }
          }
          var lim = 72 * s;
          for (k = 0; k < M; k++) {
            nv[k] += na[k] * h;
            nd[k] += nv[k] * h;
            if (nd[k] > lim) { nd[k] = lim; nv[k] *= 0.5; } else if (nd[k] < -lim) { nd[k] = -lim; nv[k] *= 0.5; }
          }
        }
      }
      var fd = Math.exp(-dt * 1.1);
      for (b = 0; b < N; b++) {
        B = bands[b];
        for (k = 0; k < M; k++) B.nf[k] = Math.max(B.nf[k] * fd, clamp(Math.abs(B.nv[k]) / (190 * s) - 0.12, 0, 1));
      }
    }

    function glossCentre(b) {                 // a slow swell of light running along each band
      var Lg = scene.glossW, per = W + 4 * Lg;
      return -2 * Lg + wrapP(t * 95 * s + glossOff[b] * per, per);
    }
    function wrapP(v, per) { return v - Math.floor(v / per) * per; }

    function computeCrests() {
      var b, j, B, k;
      var k1 = TAU / (560 * s), w1 = TAU / 7.5, k2 = TAU / (290 * s), w2 = TAU / 4.8;
      var lx = scene.light[0], ly = scene.light[1];
      var intro = introT < INTRO_END;
      var swA = 7 * s, swS = 1 / (scene.glossW * 1.1);
      for (b = 0; b < N; b++) {
        B = bands[b]; k = B.k;
        var breath = 3.5 * s * Math.sin(t * TAU / 11 + k * 0.3);
        var gc = glossCentre(b);
        pal.flow[b * 4 + 2] = gc;
        for (j = 0; j < S; j++) {
          var x = xs[j];
          var sw = B.ampK * B.amp[j] * (0.62 * Math.sin(x * k1 - t * w1 + B.p1) + 0.38 * Math.sin(x * k2 - t * w2 + B.p2));
          var gq = (x - gc) * swS;
          var swell = gq * gq < 9 ? swA * B.amp[j] * Math.exp(-gq * gq) : 0;
          var base = B.base[j];
          if (intro) base = lerp(B.low, base, introMix(k, x));
          B.y[j] = base + sw - swell + breath + simAt(B, x) - surgeAt(k, x);
        }
      }
      // occlusion: crest of the highest band in front of each band
      for (j = 0; j < S; j++) {
        var m = H + 40;
        for (b = N - 1; b >= 0; b--) { bands[b].minF[j] = m; if (bands[b].y[j] < m) m = bands[b].y[j]; }
      }
      // lighting + foam per sample
      var ambientFoamX = logoR ? lcx : -1e4;
      for (b = 0; b < N; b++) {
        B = bands[b];
        for (j = 0; j < S; j++) {
          var jl = j > 0 ? j - 1 : j, jr = j < S - 1 ? j + 1 : j;
          var tx = xs[jr] - xs[jl], ty = B.y[jr] - B.y[jl], tl = Math.sqrt(tx * tx + ty * ty) || 1;
          var nx = ty / tl, ny = -tx / tl;
          var Lx = lx - xs[j], Ly = ly - B.y[j], Ll = Math.sqrt(Lx * Lx + Ly * Ly) || 1;
          B.lit[j] = clamp(0.5 + 0.5 * (nx * Lx + ny * Ly) / Ll, 0, 1) * 0.7 + 0.3 * clamp(-ny, 0, 1);
          var fo = foamAt(B, xs[j]);
          if (B.k === 0 && logoR) {                 // churn where the logo meets the water
            var dl = (xs[j] - ambientFoamX) / (lw * 0.5);
            if (dl * dl < 9) fo = Math.max(fo, 0.2 * Math.exp(-dl * dl * 1.6) * (0.75 + 0.25 * Math.sin(t * 1.3 + xs[j] * 0.02)) * sstep(1.6, 2.6, introT));
          }
          B.foam[j] = fo;
        }
      }
    }

    function land(i, x, cy) {                       // a droplet meets the water: it re-ripples the surface
      var sz = P.s0[i], b = P.b[i];
      if (sz > 1.5) impulse(b, x, 8 * sz * s, 22 * s, 0.16);
      if (sz > 2.3 && Math.random() < 0.22) addRing(x, cy, 26 * sz * (mobile ? 0.7 : 1), 0.8, 0.16, b);
    }

    function updateParticles(dt) {
      var g = 1050 * (mobile ? 0.8 : 1), FB = bands[N - 1];
      var dragX = Math.exp(-dt * 0.5), dragY = Math.exp(-dt * 0.25);
      for (var i = P.n - 1; i >= 0; i--) {
        var k = P.k[i], life = (P.l[i] += dt), max = P.m[i];
        if (life >= max) { kill(i); continue; }
        var p = life / max, x, y, f, cy;
        if (k === K_DROP || k === K_BEAD) {
          P.vy[i] += g * dt * (k === K_BEAD ? 0.75 : 1);
          P.vx[i] *= dragX; P.vy[i] *= dragY;
          x = (P.x[i] += P.vx[i] * dt); y = (P.y[i] += P.vy[i] * dt);
          cy = crestAt(k === K_BEAD ? FB : (bands[P.b[i]] || FB), x);
          if (P.vy[i] > 0 && y > cy + 2) {
            if (k === K_BEAD) { kill(i); splashAt(x, cy, 0.55, 0.2); continue; }
            land(i, x, cy); kill(i); continue;
          }
          if (y > H + 20 || x < -40 || x > W + 40) { kill(i); continue; }
          f = keepFade(x, y);
          if (f <= 0 && k === K_DROP) { kill(i); continue; }
          P.a[i] = P.a0[i] * (k === K_BEAD ? 1 : 1 - sstep(0.6, 1, p)) * f;
        } else if (k === K_MIST) {
          x = (P.x[i] += P.vx[i] * dt); y = (P.y[i] += P.vy[i] * dt);
          P.s[i] = P.s0[i] * (1 + life * 0.9);
          P.a[i] = P.a0[i] * Math.sin(Math.PI * p) * keepFade(x, y);
        } else if (k === K_RING) {
          P.s[i] = 6 + P.p[i] * eOut(p);
          P.a[i] = P.a0[i] * (1 - sstep(0.1, 1, p));
          P.c[i] = 0.05 + 0.06 * p;                 // ring thickness (P.p holds the final radius)
          P.a[i] *= keepFade(P.x[i], P.y[i]);
        } else if (k === K_PUFF) {
          P.vy[i] += g * 0.42 * dt; P.vx[i] *= Math.exp(-dt * 1.2); P.vy[i] *= Math.exp(-dt * 0.5);
          x = (P.x[i] += P.vx[i] * dt); y = (P.y[i] += P.vy[i] * dt);
          P.s[i] = P.s0[i] * (1 + life * 1.6);
          if (P.vy[i] > 0 && y > crestAt(FB, x) + P.s[i] * 0.3) { kill(i); continue; }
          P.a[i] = P.a0[i] * (1 - sstep(0.25, 1, p)) * sstep(0, 0.08, p) * keepFade(x, y);
        } else if (k === K_BLOOM) {
          y = (P.y[i] += P.vy[i] * dt);
          P.s[i] = P.s0[i] * (1 + p * 0.8);
          P.a[i] = P.a0[i] * (1 - p) * (1 - p) * keepFade(P.x[i], y);
        } else {                                    // bioluminescent mote: drifts up, twinkles out
          P.vx[i] *= Math.exp(-dt * 1.2); P.vy[i] = P.vy[i] * Math.exp(-dt * 0.8) - 14 * dt;
          x = (P.x[i] += P.vx[i] * dt); y = (P.y[i] += P.vy[i] * dt);
          var tw = 0.65 + 0.35 * Math.sin(life * 17 + P.c[i] * 40);
          P.a[i] = P.a0[i] * Math.pow(Math.sin(Math.PI * p), 1.4) * tw * keepFade(x, y) * (y > crestAt(FB, x) - 30 ? 1 : 0.5);
        }
      }
      // drifting sea mist at the logo's waterline
      if (logoR && introT > 2 && Math.random() < dt * 1.2) {
        var mx = lcx + rnd(-0.45, 0.45) * lw;
        addMist(mx, crestAt(FB, mx) - rnd(0, 16), rnd(28, 56) * (mobile ? 0.6 : 1), rnd(0.03, 0.06), rnd(-10, 14), rnd(-16, -6), rnd(2.5, 4));
      }
    }

    function newGlint(i, r) {
      var b = N - 1 - Math.floor(r() * Math.min(4, N)), x = 0, tries = 0;
      do { x = r() * W; tries++; } while (tries < 10 && !mobile && hasKeep && x > keepX0 - 30 && x < keepX1 + 10);
      G.b[i] = b; G.x[i] = x; G.l[i] = 0; G.m[i] = 1.4 + r() * 1.8; G.r[i] = (4 + r() * 6) * (mobile ? 0.8 : 1); G.a[i] = 0;
    }
    function updateGlints(dt, r) {
      var appear = sstep(1.6, 2.4, introT);
      for (var i = 0; i < G.n; i++) {
        G.l[i] += dt;
        if (G.l[i] > G.m[i]) newGlint(i, r);
        var B = bands[G.b[i]] || bands[N - 1];
        G.y[i] = crestAt(B, G.x[i]) + 2.5;
        var p = G.l[i] / G.m[i], sn = Math.sin(Math.PI * clamp(p, 0, 1));
        G.a[i] = sn * sn * sn * 0.6 * appear * keepFade(G.x[i], G.y[i]);
      }
    }

    /* ---- pointer ---- */
    function localXY(e) {
      var r = target.getBoundingClientRect();
      ptr.cx = e.clientX; ptr.cy = e.clientY;
      ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top;
    }
    // After a scroll the hero has moved under a pointer that may not have moved at all: re-read where it
    // now is over the water and settle there, so the jump is not taken for a fast swipe (wake, spray).
    function resyncPointer() {
      if (!ptr.inside || ptr.cx === undefined) return;
      var r = target.getBoundingClientRect();
      var x = ptr.cx - r.left, y = ptr.cy - r.top;
      if (x < 0 || y < 0 || x > r.width || y > r.height) { ptr.inside = false; return; }
      ptr.x = ptr.sx = x; ptr.y = ptr.sy = y; ptr.vx = 0; ptr.vy = 0;
      ptr.prevSide.fill(0);
    }
    function onMove(e) {
      localXY(e);
      ptr.inside = true; ptr.lastMove = performance.now();
      ptr.mouse = e.pointerType === 'mouse' || e.pointerType === 'pen' || !e.pointerType;
      if (ptr.sx < -1000) { ptr.sx = ptr.x; ptr.sy = ptr.y; }
      if (!raf) kick();
    }
    function onLeave() { ptr.inside = false; }
    function onClick(e) {
      if (reduced || destroyed || !R) return;
      var tg = e.target;
      if (tg && tg.closest && tg.closest('a,button,input,select,textarea,label,summary,[role="button"],[contenteditable]')) return;
      var r = target.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      if (textLines.length && inText(x, y)) return;   // selecting the copy, not playing with the water
      poke(x, y);
    }
    var pokes = 0;
    function poke(x, y) {
      pokes++;
      if (dirty) { measure(); layout(); }
      if (x < 0 || y < 0 || x > W || y > H) return;
      var b = bandAt(x, y);
      if (b < 0) {                                    // the sky: drop a glowing bead into the sea
        var i = spawn(K_BEAD, x, y, rnd(-18, 18), 30, 4, mobile ? 1.6 : 2, 1, N - 1);
        if (i >= 0) { addMist(x, y, 22, 0.05, 0, -8, 0.8); }
      } else {
        splashAt(x, crestAt(bands[b], x), 1, 0);
      }
      kick();
    }
    function updatePointer(dt) {
      if (dt <= 0) return;
      var idle = (performance.now() - ptr.lastMove) / 1000;
      var on1 = ptr.inside && idle < 2.5 && interactive;
      ptr.str += ((on1 ? 1 : 0) - ptr.str) * Math.min(1, dt * (on1 ? 6 : 1.6));
      var lanOn = on1 && ptr.mouse && introT > 2.2;
      ptr.lan += ((lanOn ? 1 : 0) - ptr.lan) * Math.min(1, dt * (lanOn ? 4 : 1.5));
      var ox = ptr.sx, oy = ptr.sy, a = Math.min(1, dt * 18);
      ptr.sx += (ptr.x - ptr.sx) * a; ptr.sy += (ptr.y - ptr.sy) * a;
      var vx = (ptr.sx - ox) / dt, vy = (ptr.sy - oy) / dt;
      ptr.vx += (vx - ptr.vx) * Math.min(1, dt * 12); ptr.vy += (vy - ptr.vy) * Math.min(1, dt * 12);
      if (ptr.str < 0.3 || introT < 1.8) { ptr.bioAcc = 0; return; }
      var speed = Math.sqrt(ptr.vx * ptr.vx + ptr.vy * ptr.vy);
      // flick spray when the pointer cuts quickly through a crest
      for (var b = 0; b < N; b++) {
        var cy = crestAt(bands[b], ptr.sx), side = ptr.sy < cy ? -1 : 1;
        if (ptr.prevSide[b] && ptr.prevSide[b] !== side && speed > 520 * s && ptr.sx > 0 && ptr.sx < W) {
          var n = mobile ? 4 : 8;
          for (var i = 0; i < n; i++) addDrop(ptr.sx + rnd(-8, 8), cy - 2, ptr.vx * rnd(0.15, 0.4) + rnd(-30, 60), -rnd(140, 380) * s, rnd(0.9, 2.4), rnd(0.6, 1.1));
          impulse(b, ptr.sx, ptr.vy * 0.4, 40 * s, 0.6);
        }
        ptr.prevSide[b] = side;
      }
      // bioluminescent sparks wherever the pointer is inside the water
      if (bandAt(ptr.sx, ptr.sy - 6) >= 0 && kinds[K_BIO] < 60) {
        ptr.bioAcc += dt * (14 + Math.min(speed, 1600) * 0.04) * (mobile ? 0.6 : 1);
        while (ptr.bioAcc >= 1) {
          ptr.bioAcc -= 1;
          var ang = Math.random() * TAU, rr = Math.sqrt(Math.random()) * 34 * s;
          spawn(K_BIO, ptr.sx + Math.cos(ang) * rr, ptr.sy + Math.sin(ang) * rr * 0.7, ptr.vx * 0.06 + rnd(-16, 16), ptr.vy * 0.06 - rnd(10, 34), rnd(1.0, 1.6), rnd(1.0, 1.9), rnd(0.75, 1.0), N - 1);
        }
      } else ptr.bioAcc = 0;
    }

    /* ---- logo choreography: surfaces out of the water and rides it ---- */
    function setLogoClip(v) {
      if (v === null) {
        if (clipState !== 0) { clipState = 0; logo.style.clipPath = ''; logo.style.webkitClipPath = ''; }
        return;
      }
      clipState = 1;
      logo.style.clipPath = v; logo.style.webkitClipPath = v;
    }
    var logoBob = -1e9;
    function updateLogo(dt) {
      if (!logo || !logoR) return;
      var FB = bands[N - 1];
      var rise = introT >= INTRO_END ? 1 : (clipLogo() ? eOut((introT - 1.38) / 1.15) : eOut((introT - 1.42) / 0.7));
      var cx = logoR.x + logoR.w * 0.5;
      // ride the highest water under the logo's footprint, so a passing set lifts it instead of covering it
      var up = -1e9;
      for (var q = 0; q <= 4; q++) {
        var xq = cx + (q / 4 - 0.5) * logoR.w * 0.7;
        var dq = (baseAt(FB, xq) - crestAt(FB, xq)) * (1 - 0.5 * Math.abs(q / 4 - 0.5));
        if (dq > up) up = dq;
      }
      var y1 = crestAt(FB, cx - logoR.w * 0.3), y2 = crestAt(FB, cx + logoR.w * 0.3);
      var bobT = reduced ? 0 : -clamp(up, -60, 90);
      logoBob = (dt > 0 && logoBob > -1e8) ? logoBob + (bobT - logoBob) * Math.min(1, dt * 9) : bobT;
      var bob = logoBob;
      var rot = reduced ? 0 : clamp(Math.atan2(y2 - y1, logoR.w * 0.6) * 0.4, -0.05, 0.05);
      // clipped (WebGL): rises out of the water; unclipped (2D / still frame): a short lift above it, never a ghost over the water
      var ty = (1 - rise) * (clipLogo() ? logoR.h * 0.75 : Math.min(36, logoR.h * 0.12)) + bob;
      // only touch the DOM when a quantised value actually changes
      var tq = Math.round(ty * 4), rq = Math.round(rot * 2864.79);
      if (tq !== logoTyQ || rq !== logoRotQ) {
        logoTyQ = tq; logoRotQ = rq;
        logo.style.transform = (tq === 0 && rq === 0) ? '' : 'translate3d(0,' + (tq / 4) + 'px,0) rotate(' + (rq / 50) + 'deg)';
      }
      var op = introT >= INTRO_END ? 100 : Math.round(100 * (clipLogo() ? sstep(1.3, 1.46, introT) : sstep(1.42, 1.8, introT)));
      if (op !== logoOpQ) { logoOpQ = op; logo.style.opacity = op >= 100 ? (logoSaved.opacity === '0' ? '' : logoSaved.opacity) : String(op / 100); }
      if (!clipLogo()) { setLogoClip(null); return; }
      // waterline (screen) -> logo-local coordinates (inverse of translate + rotate about the centre)
      var ox = logoR.w * 0.5, oy = logoR.h * 0.5, cs = Math.cos(-rot), sn = Math.sin(-rot), NP = 12, any = false, changed = clipState !== 1;
      for (var i = 0; i <= NP; i++) {
        var sxp = logoR.x - logoR.w * 0.1 + logoR.w * 1.2 * i / NP;
        var syp = crestAt(FB, sxp) - FB.gap - 0.5;
        var qx = sxp - logoR.x - ox, qy = syp - logoR.y - ty - oy;
        var ly = sn * qx + cs * qy + oy;
        clipY[i] = cs * qx - sn * qy + ox;            // local x
        var q = Math.round(Math.min(logoR.h, Math.max(0, ly)));   // the mask stays inside the logo's own box
        if (q < logoR.h) any = true;
        if (q !== clipQ[i]) { clipQ[i] = q; changed = true; }
      }
      if (!any) { setLogoClip(null); return; }
      if (!changed) return;
      var str = 'polygon(' + Math.round(clipY[0]) + 'px 0px,' + Math.round(clipY[NP]) + 'px 0px';
      for (i = NP; i >= 0; i--) str += ',' + Math.round(clipY[i]) + 'px ' + clipQ[i] + 'px';
      setLogoClip(str + ')');
    }
    function restoreLogo() {
      if (!logo || !logoSaved) return;
      logo.style.opacity = logoSaved.opacity === '0' ? '' : logoSaved.opacity; logo.style.transform = logoSaved.transform;
      logo.style.clipPath = logoSaved.clipPath; logo.style.webkitClipPath = logoSaved.webkitClipPath;
      logo.style.willChange = logoSaved.willChange;
      logoTyQ = 1e9; logoRotQ = 1e9; logoOpQ = -1; clipState = -1;
    }

    /* ---- frame ---- */
    function updateSceneLights() {
      var lit = animIntro ? 0.35 + 0.65 * sstep(1.2, 2.3, introT) : 1;      // the held first frame is already lit
      var appear = animIntro ? sstep(1.2, 2.3, introT) : 1;
      var hx = lcx + lw * 0.1, hy = logoR ? logoR.y + logoR.h * 0.34 : yb - H * 0.22;
      var breathe = 1 + 0.07 * Math.sin(t * 0.7);
      var h = scene.halo; h[0] = hx; h[1] = hy; h[2] = lw * (mobile ? 0.8 : 0.62); h[3] = (mobile ? 0.34 : 0.36) * lit * breathe;
      var l = scene.light; l[0] = lcx; l[1] = yb - H * 0.06; l[2] = lw * 0.7; l[3] = 0.65 * lit;
      var gl = scene.glit; gl[0] = lcx + lw * 0.04; gl[1] = 0; gl[2] = lw * 0.26; gl[3] = (mobile ? 0.32 : 0.42) * appear;
      var pp = scene.ptr; pp[0] = ptr.sx; pp[1] = ptr.sy; pp[2] = 180 * s; pp[3] = interactive ? 0.8 * ptr.lan : 0;
      scene.wisp = mobile ? 0 : 0.08 * lit;
    }
    function updateTimeUniforms() {
      var T = t, a = scene.skyT;
      a[0] = wrapN(T * 0.018); a[1] = wrapN(-T * 0.007); a[2] = wrapN(-T * 0.025); a[3] = wrapN(T * 0.012);
      a = scene.ta; a[0] = wrapN(T * 0.07); a[1] = wrapN(-T * 0.045); a[2] = wrapN(T * 0.3); a[3] = wrapN(-T * 1.1);
      a = scene.tb; a[0] = wrapN(-T * 0.5); a[1] = wrapN(T * 0.7); a[2] = wrapA(T * 0.4); a[3] = wrapN(T * 0.5);
      a = scene.tc; a[0] = wrapN(-T * 0.4); a[1] = wrapN(-T * 0.9); a[2] = 0; a[3] = 0;
      for (var b = 0; b <= N; b++) {
        pal.flow[b * 4] = wrapN(T * flowSpd[b] * 0.0042);
        pal.flow[b * 4 + 1] = wrapN(T * flowSpd[b] * 1.35 * 0.0115);
      }
      pal.flow[N * 4 + 2] = -1e5;               // no travelling gloss on the curl lip
    }

    function step(dt) {
      t += dt;
      if (!held) {
        introT += dt;
        if (animIntro && !introStarted) { introStarted = true; startSurge(true); }
        if (introT >= INTRO_END) {
          if (nextSet > 90) nextSet = introT + rnd(3.5, 5.5);
          if (nextWind > 90) nextWind = introT + rnd(0.8, 1.8);
          if (!introDone) { introDone = true; dirty = true; }    // re-measure once the copy has settled (eased, no jump)
        }
        if (!surge && introT >= nextSet) { startSurge(false); nextSet = introT + rnd(6, 9); }
        if (introT >= nextWind) { windSpray(); nextWind = introT + rnd(2, 4); }
      }
      approachBase(dt);
      updatePointer(dt);
      updateSurge();
      simulate(dt);
      updateSceneLights();
      computeCrests();
      buildLip();
      updateParticles(dt);
      updateGlints(dt, Math.random);
      updateLogo(dt);
      updateTimeUniforms();
      scene.t = t;
    }

    function render() { R.draw(scene); drawn++; }

    function running() { return !destroyed && !!R && !reduced && visible && !doc.hidden && !debugPaused; }

    // Adaptive cost, judged at rest in half-second windows (never while scrolling: nothing is drawn then).
    // The browser's own frame rate is told apart from overload first: when the rAF intervals of a window are
    // steady (80% within 20% of their median) at a display rate (<= 21 ms, 48 Hz and up) or at ~33.3 ms (a 30 Hz
    // cap such as Chrome's Energy Saver on battery), that is the refresh, and frames are only expected that
    // often. Two windows in a row (~1 s) whose frames come more than 25% later than expected take one step
    // down: the frame rate first (full: 60 -> 45 -> 30 -> 24 fps; lite: 24 -> 20 -> 15 -> 12), then the buffer,
    // 15% a step, down to the floor computeBuffer() allows. ~6 s with no late frame at all take one step back
    // up (the buffer first, then the frame rate) - unless that step up led straight back over budget (a step
    // down within ~5 s of it): then it stays down (hysteresis: no see-sawing).
    function median(n) {
      var a = ivTmp.subarray(0, n);
      a.set(ivs.subarray(0, n)); a.sort();
      return n % 2 ? a[(n - 1) >> 1] : 0.5 * (a[n / 2 - 1] + a[n / 2]);
    }
    function judge(dt, ts) {
      perf.last = Math.round(dt * 1000);
      // skip the first frames after a (re)start or a change of step, and the page's own loading
      if (++perf.warm <= 4 || doc.readyState !== 'complete') { ivN = 0; return; }
      perf.acc += dt; perf.n++;
      if (perf.acc < 0.5 || perf.n < 3) return;
      var avg = perf.acc / perf.n * 1000, win = perf.acc, n = ivN, i, m, near = 0, late = 0;
      perf.acc = 0; perf.n = 0; ivN = 0;
      if (n >= 3) {
        m = median(n);
        for (i = 0; i < n; i++) if (Math.abs(ivs[i] - m) < 0.2 * m) near++;
        if (near >= 0.8 * n && (m <= 21 || Math.abs(m - 33.3) < 2.7)) refIv = m;
        for (i = 0; i < n; i++) if (ivs[i] > 1.5 * refIv) late++;
      }
      if (perf.pin) return;
      var expect = Math.max(1000 / FPS[fpsI], refIv);
      if (avg > expect * 1.25) {
        perf.up = 0;
        if (++perf.over >= 2) {
          perf.over = 0;
          var canDown = fpsI < FPS.length - 1 || dprScale > resFloor + 1e-3;
          // a machine too slow for the lite tier even at its lowest step (under ~6 fps): the floor gives way
          // rather than keep the browser's software renderer busy
          if (!canDown && lite && liteMin > 0.5 && avg > expect * 2) { liteMin = 0.5; computeBuffer(); canDown = dprScale > resFloor + 1e-3; }
          if (canDown) {
            if (ts - perf.upAt < 5000) perf.lock = true;
            if (fpsI < FPS.length - 1) fpsI++;
            else { dprScale = Math.max(resFloor, Math.min(1, dprScale) * 0.85); bufDirty = true; }
            perf.warm = 0; perf.steps++;
          }
        }
      } else {
        perf.over = 0;
        if (avg < expect * 1.1 && late <= n * 0.1 && (dprScale < 1 || fpsI > 0) && !perf.lock) {
          perf.up += win;
          if (perf.up >= 6) {
            perf.up = 0; perf.upAt = ts; perf.warm = 0; perf.steps++;
            if (dprScale < 1) { dprScale = Math.min(1, dprScale / 0.85); if (dprScale > 0.99) dprScale = 1; bufDirty = true; } else fpsI--;
          }
        } else perf.up = 0;
      }
    }

    function frame(ts) {
      raf = 0;
      if (frozen || !running()) { lastTs = 0; return; }
      if (rafPrev && ivN < 64) ivs[ivN++] = ts - rafPrev;
      rafPrev = ts;
      // Frame governor: frames are spaced 1 / FPS[fpsI] apart on average, at whatever rate the browser runs
      // rAF (a callback within ~half a refresh of the due time draws; the due time advances by whole frame
      // intervals, so 45 fps on a 60 Hz screen is a steady 2-1-1 vsync rhythm). dt spans the skipped
      // callbacks, so the motion speed never changes.
      var iv = 1000 / FPS[fpsI];
      if (dueTs && ts < dueTs - 0.45 * Math.min(refIv, iv)) { raf = requestAnimationFrame(frame); return; }
      dueTs = dueTs && ts - dueTs < iv ? dueTs + iv : ts + iv;
      var now = ts / 1000;
      // the first frame after a (re)start takes one nominal step: a resume never jumps ahead or repeats a frame
      var measured = lastTs > 0;
      var dt = measured ? Math.min(Math.max(now - lastTs, 0), 0.25) : 1 / FPS[fpsI];
      lastTs = now;
      try {
        if (dirty) { measure(); layout(); }
        if (measured && dt > 0) judge(dt, ts);
        step(dt);
        applyBuffer();
        render();
      } catch (e) {
        fail();
      }
      if (running() && !raf && !frozen) raf = requestAnimationFrame(frame);
    }
    function kick() {
      if (!raf && !frozen && running()) {
        lastTs = 0; dueTs = 0; rafPrev = 0; ivN = 0; perf.warm = 0; perf.acc = 0; perf.n = 0;
        raf = requestAnimationFrame(frame);
      }
    }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; lastTs = 0; dueTs = 0; rafPrev = 0; ivN = 0; }

    // Scroll freeze: while the page scrolls nothing is drawn (no WebGL, no logo style writes), so the
    // compositor and the GPU have the scroll to themselves. The hero is sliding away and its last frame just
    // moves with it; ~150 ms after the last scroll / wheel / touchmove the water carries on from where it was.
    var FREEZE_MS = 150;
    function onScrollish() {
      quietAt = performance.now() + FREEZE_MS;
      if (frozen || destroyed || reduced) return;
      frozen = true; freezes++;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      freezeTimer = setTimeout(thaw, FREEZE_MS + 5);
    }
    function thaw() {
      freezeTimer = 0;
      if (destroyed) return;
      var rem = quietAt - performance.now();
      if (rem > 1) { freezeTimer = setTimeout(thaw, rem + 5); return; }
      frozen = false; thawAt = performance.now();
      try { resyncPointer(); } catch (e) { /* keep the previous position */ }
      kick();
    }

    // Something broke while drawing: WebGL -> 2D sibling, 2D -> the static CSS backdrop.
    function fail() {
      if (destroyed) return;
      if (R && R.kind === 'gl') { to2D(true); return; }
      toStatic();
    }
    function to2D(disposeGL) {
      stop();
      if (R && R.kind === 'gl' && disposeGL) { try { R.dispose(); } catch (e) { /* ignore */ } glR = null; }
      R = null;
      var r2 = create2DRenderer(makeSibling());
      if (!r2) { toStatic(); return; }
      R = r2; dirty = true; bufDirty = true;
      setLogoClipNone();
      try {
        if (reduced) drawStatic();
        else { measure(); layout(); step(0); applyBuffer(); render(); kick(); }
      } catch (e) { toStatic(); }
    }
    function setLogoClipNone() { if (logo) { clipState = 1; setLogoClip(null); } }
    function toStatic() {
      stop();
      if (R && R.dispose) { try { R.dispose(); } catch (e) { /* ignore */ } }
      R = null;
      removeSibling();
      canvas.style.visibility = 'hidden';
      restoreLogo();                         // the whole logo, unclipped, on the CSS backdrop
      fireBreak();
    }

    // A single, composed still frame (prefers-reduced-motion): no intro, no loop, the whole logo.
    function drawStatic() {
      if (destroyed || !R) return;
      measure(); layout(true);
      introT = 99; t = 23.4; surge = null; lip.active = false; P.n = 0; kinds.fill(0);
      for (var b = 0; b < N; b++) { bands[b].nd.fill(0); bands[b].nv.fill(0); bands[b].nf.fill(0); }
      ptr.str = 0; ptr.lan = 0;
      updateSceneLights();
      computeCrests();
      var r = mulberry(7);
      for (var i = 0; i < G.n; i++) { newGlint(i, r); G.l[i] = G.m[i] * (0.35 + 0.3 * r()); }
      updateGlints(0, r);
      for (i = 0; i < G.n; i++) G.a[i] *= 0.8;
      if (logoR) {
        for (i = 0; i < 5; i++) {
          var mx = lcx + (r() - 0.5) * lw * 0.8;
          var k = spawn(K_MIST, mx, crestAt(bands[N - 1], mx) - 8, 0, 0, 1, (40 + r() * 30) * (mobile ? 0.6 : 1), 0.05, N - 1);
          if (k >= 0) P.a[k] = 0.05;
        }
      }
      updateLogo();
      updateTimeUniforms();
      scene.t = t;
      applyBuffer();
      render();
      P.n = 0; kinds.fill(0);
    }
    function safeStatic() { try { drawStatic(); } catch (e) { fail(); } }

    /* ---- observers & listeners ---- */
    function onResize() {
      if (destroyed || !R) return;
      dirty = true;
      if (reduced) { safeStatic(); return; }
      if (frozen && visible && !doc.hidden) return;   // redrawn at the new size the moment the scroll settles
      if (!raf) {
        // paused (offscreen / hidden): repaint the frozen frame at the new size right away
        try { measure(); layout(); step(0); applyBuffer(); render(); } catch (e) { fail(); }
      }
    }
    if (window.ResizeObserver) {
      ro = new ResizeObserver(function () { onResize(); });
      ro.observe(target);
      if (logo) ro.observe(logo);
      if (textEl) ro.observe(textEl);
    } else {
      on(window, 'resize', onResize, { passive: true });
    }
    if (window.IntersectionObserver) {
      // stops once the hero is above the top 120px (only its dark, faded bottom under the header remains)
      io = new IntersectionObserver(function (es) {
        visible = es[es.length - 1].isIntersecting;
        if (visible) kick(); else stop();
      }, { threshold: 0, rootMargin: '-120px 0px 0px 0px' });
      io.observe(host);
    }
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { if (!destroyed) onResize(); }, noop);
    on(doc, 'visibilitychange', function () { if (doc.hidden) stop(); else kick(); });
    var pasv = { passive: true };
    on(window, 'scroll', onScrollish, pasv);
    on(window, 'wheel', onScrollish, pasv);
    on(window, 'touchmove', onScrollish, pasv);
    if (interactive) {
      var pas = { passive: true };
      on(host, 'pointermove', guard(onMove), pas);
      on(host, 'pointerdown', guard(onMove), pas);
      on(host, 'pointerleave', guard(onLeave), pas);
      on(host, 'pointercancel', guard(onLeave), pas);
      on(host, 'click', guard(onClick), pas);
    }
    function guard(fn) { return function (e) { try { fn(e); } catch (err) { fail(); } }; }
    if (mq && !forcedRM) {
      var onMQ = function () {
        reduced = !!mq.matches;
        if (reduced) { stop(); safeStatic(); }
        else { introT = Math.max(introT, INTRO_END); held = false; lastTs = 0; dirty = true; kick(); }
      };
      if (mq.addEventListener) { mq.addEventListener('change', onMQ); disposers.push(function () { mq.removeEventListener('change', onMQ); }); }
      else if (mq.addListener) { mq.addListener(onMQ); disposers.push(function () { mq.removeListener(onMQ); }); }
    }
    // WebGL context loss: carry on in 2D on a sibling canvas, return to WebGL when restored
    if (glR) {
      on(canvas, 'webglcontextlost', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (R && R.kind === 'gl') { R.ok = false; to2D(false); }
      }, false);
      on(canvas, 'webglcontextrestored', function () {
        if (destroyed || !glR) return;
        try {
          glR.restore();
          if (!glR.ok) return;
          stop();
          R = glR;
          removeSibling();
          dirty = true; bufDirty = true;
          if (reduced) drawStatic(); else { measure(); layout(); step(0); applyBuffer(); render(); kick(); }
        } catch (err) { if (!R || R === glR) to2D(false); }
      }, false);
    }

    // Hold the intro on its (lit, composed) first frame until the page and its fonts
    // have loaded - capped at 1.5s - so the copy is measured once and nothing shifts mid-splash.
    function release() {
      if (!held || destroyed) return;
      held = false;
      dirty = true;
      kick();
    }
    function fontsThenRelease() {
      if (doc.fonts && doc.fonts.status === 'loading' && doc.fonts.ready) doc.fonts.ready.then(release, release);
      else release();
    }

    /* ---- go ---- */
    if (logo && !reduced) logo.style.willChange = 'transform';
    try {
      if (reduced) {
        drawStatic();
        fireBreak();
      } else {
        if (animIntro) {
          if (doc.readyState !== 'complete') { held = true; on(window, 'load', fontsThenRelease); }
          else if (doc.fonts && doc.fonts.status === 'loading' && doc.fonts.ready) { held = true; doc.fonts.ready.then(release, release); }
          if (held) later(release, 1500);
          if (logo) { logo.style.opacity = '0'; logoOpQ = 0; }
        } else {
          fireBreak();
        }
        measure(); layout();
        step(0);
        applyBuffer();
        render();
        kick();
      }
    } catch (e) {
      if (R && R.kind === 'gl') to2D(true); else toStatic();
    }

    /* ---- ?wave=info: a small fixed readout of what this browser runs, for support; nothing otherwise ---- */
    var info = null, infoTimer = 0, infoDrawn = 0, infoAt = 0;
    function infoText() {
      var now = performance.now(), dev = window.devicePixelRatio || 1;
      var fps = infoAt && now > infoAt ? (drawn - infoDrawn) * 1000 / (now - infoAt) : 0;
      infoDrawn = drawn; infoAt = now;
      var kind = !R ? 'static backdrop' : R.kind === 'gl' ? 'WebGL' : 'Canvas 2D';
      var gpu = !glSeen ? 'not asked (2D renderer requested)'
        : glSeen.none ? 'WebGL unavailable - hardware acceleration is probably off'
        : (glSeen.gpu || 'unknown') + (glSeen.soft ? '  [software rendering: no GPU]' : '') + (glSeen.failed ? '  [shaders failed]' : '');
      var state = destroyed ? 'stopped' : reduced ? 'still frame (reduced motion or paused)' : frozen ? 'paused while the page scrolls'
        : !visible ? 'paused (off screen)' : doc.hidden ? 'paused (tab hidden)' : raf ? 'running' : 'idle';
      return [
        'WAVE hero - ?wave=info',
        'tier     ' + (lite ? 'lite' : 'full') + ', ' + kind,
        'GPU      ' + gpu,
        'screen   DPR ' + +dev.toFixed(3) + ', hero ' + Math.round(W) + ' x ' + Math.round(H) + ' CSS px',
        'buffer   ' + pw + ' x ' + ph + ' px = ' + dpr.toFixed(2) + ' px per CSS px (the screen: ' + +dev.toFixed(3) + ')',
        'frames   cap ' + FPS[fpsI] + ' fps, drawing ' + Math.round(fps) + ' fps, browser frames ~' + Math.round(1000 / refIv) + ' Hz',
        'state    ' + state
      ].join('\n');
    }
    function showInfo() {
      try {
        if (!/[?&]wave=info(?:&|$)/.test(window.location.search)) return;
        var old = doc.getElementById('wave-info');
        if (old && old.parentNode) old.parentNode.removeChild(old);
        info = doc.createElement('div');
        info.id = 'wave-info';
        info.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483000;box-sizing:border-box;max-width:calc(100vw - 16px);' +
          'margin:0;padding:8px 10px;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#e8f6ff;' +
          'background:#030d19;border:1px solid #2b6a86;border-radius:6px;white-space:pre-wrap;overflow-wrap:anywhere;' +
          'text-align:left;pointer-events:auto;user-select:text;-webkit-user-select:text';
        info.textContent = infoText();
        doc.body.appendChild(info);
        infoTimer = setInterval(function () { if (info) info.textContent = infoText(); }, 1000);
      } catch (e) { hideInfo(); }
    }
    function hideInfo() {
      if (infoTimer) { clearInterval(infoTimer); infoTimer = 0; }
      if (info && info.parentNode) info.parentNode.removeChild(info);
      info = null;
    }
    showInfo();

    function cleanup() {
      destroyed = true;
      hideInfo();
      stop();
      if (freezeTimer) { clearTimeout(freezeTimer); freezeTimer = 0; }
      while (timers.length) clearTimeout(timers.pop());
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      for (var i = 0; i < disposers.length; i++) { try { disposers[i](); } catch (e) { /* ignore */ } }
      disposers.length = 0;
      restoreLogo();
      if (R && R.dispose) { try { R.dispose(); } catch (e) { /* ignore */ } }
      if (glR && glR !== R) { try { glR.dispose(); } catch (e) { /* ignore */ } }
      R = null; glR = null;
      removeSibling();
      canvas.style.pointerEvents = saved.pe;
      canvas.style.visibility = saved.vis;
      canvas.style.display = saved.display;
    }

    var api = {
      destroy: function () { if (!destroyed) cleanup(); },
      splash: function (xf, yf) {
        if (destroyed || reduced || !R) return;
        try { poke(clamp(+xf || 0, 0, 1) * W, clamp(+yf || 0, 0, 1) * H); } catch (e) { fail(); }
      }
    };
    if (opts.debug) {
      // diagnostics for QA only - not part of the production contract
      api.stats = function () {
        return {
          renderer: R ? R.kind : 'static', sibling: !!sibling, held: held, introT: +introT.toFixed(2), t: +t.toFixed(2), dpr: +dpr.toFixed(3),
          tier: lite ? 'lite' : 'full', halfSky: !!(R && R.halfSky), gpu: glR ? glR.gpu : '', softGL: glR ? glR.soft : null, frozen: frozen, freezes: freezes, drawn: drawn, lastScrollAt: quietAt - FREEZE_MS, thawAt: thawAt,
          dprScale: +dprScale.toFixed(3), scaleSteps: perf.steps, scaleLocked: perf.lock, fpsCap: FPS[fpsI], fpsLadder: FPS.slice(),
          refreshMs: +refIv.toFixed(2), resFloor: +resFloor.toFixed(3), deriv: !!(glR && glR.deriv), css: [+W.toFixed(1), +H.toFixed(1)],
          buffer: [pw, ph], running: !!raf, frameMs: perf.last, particles: P.n, drops: kinds[K_DROP], mists: kinds[K_MIST],
          rings: kinds[K_RING], bio: kinds[K_BIO], beads: kinds[K_BEAD], bands: N, broke: broke,
          surge: surge ? +(introT - surge.t0).toFixed(2) : null, nextSet: +nextSet.toFixed(2), nextWind: +nextWind.toFixed(2),
          logoClip: logo ? logo.style.clipPath : null, keep: [keepX0, keepY0, keepX1, keepY1], pokes: pokes,
          ptr: { x: +ptr.x.toFixed(1), y: +ptr.y.toFixed(1), sx: +ptr.sx.toFixed(1), sy: +ptr.sy.toFixed(1), vx: +ptr.vx.toFixed(1), vy: +ptr.vy.toFixed(1), inside: ptr.inside, str: +ptr.str.toFixed(2) },
          inKeep: (function () { var n = 0; for (var i = 0; i < P.n; i++) if (P.a[i] > 0.01 && P.x[i] > keepX0 && P.x[i] < keepX1 && P.y[i] > keepY0 && P.y[i] < keepY1) n++; return n; })()
        };
      };
      api._debug = {
        pause: function () { debugPaused = true; stop(); },
        resume: function () { debugPaused = false; kick(); },
        advance: function (sec) {
          if (destroyed || reduced || !R) return introT;
          if (dirty) { measure(); layout(); }
          var n = Math.max(1, Math.round(sec * 60));
          for (var i = 0; i < n; i++) step(1 / 60);
          applyBuffer(); render();
          return introT;
        },
        pointer: function (x, y, mouse) { ptr.x = x; ptr.y = y; ptr.inside = true; ptr.mouse = mouse !== false; ptr.lastMove = performance.now(); if (ptr.sx < -1000) { ptr.sx = x; ptr.sy = y; } },
        fail: function () { fail(); },
        time: function (T) { t = +T || 0; },
        scale: function (f) { dprScale = clamp(+f || 1, 0.2, 1); perf.lock = true; bufDirty = true; },   // pin the buffer scale
        // pin the frame rate and/or the buffer density (buffer px per CSS px) and stop the adaptive steps
        pin: function (fps, density, adaptive) {
          perf.pin = !adaptive;
          if (fps > 0) { FPS = [+fps]; fpsI = 0; }
          if (density > 0) { pinD = +density; bufDirty = true; }
        },
        freeze: function () { onScrollish(); },
        probe: function (x) {
          var FB = bands[N - 1];
          return { crest: +crestAt(FB, x).toFixed(1), base: +baseAt(FB, x).toFixed(1), sim: +simAt(FB, x).toFixed(1), surge: +surgeAt(0, x).toFixed(1), surgeOn: !!surge, ptrStr: +ptr.str.toFixed(2) };
        },
        bench: function (n) {               // n full frames (simulate + draw) at 60 Hz steps, returns ms
          var t0 = performance.now();
          for (var i = 0; i < n; i++) { step(1 / 60); applyBuffer(); render(); }
          return performance.now() - t0;
        }
      };
    }
    return api;
  }

  window.WaveBackground = { mount: mount };
})();
