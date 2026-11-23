/* WAVE Portal charts: single-series line chart with a hover/keyboard readout, ranked bars,
   and a segmented bar. Colors were validated against the portal's card surface (#091e30). */
(function () {
  'use strict';
  var W = window.W, html = W.html;
  var NS = 'http://www.w3.org/2000/svg';
  W.SERIES = ['#3987e5', '#d95926', '#199e70'];   // categorical slots 1-3 (dark mode)
  var OTHER = '#5b6f80';

  function svgEl(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function niceMax(v) {
    if (v <= 0) return 4;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    var step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * p;
  }
  function tick(v) { return v >= 10000 ? W.compact(v) : W.num(v); }

  // points: [{ x: 'YYYY-MM-DD', y: number }]. Renders at the container's width and redraws on resize.
  W.lineChart = function (box, points, opts) {
    opts = opts || {};
    var color = opts.color || W.SERIES[0];
    box.classList.add('chart-box');
    function draw() {
      box.textContent = '';
      var width = Math.max(280, box.clientWidth), height = opts.height || 220;
      var m = { t: 12, r: 14, b: 26, l: 44 };
      var iw = width - m.l - m.r, ih = height - m.t - m.b;
      var max = niceMax(Math.max.apply(null, points.map(function (p) { return p.y; }).concat([1])));
      var x = function (i) { return m.l + (points.length < 2 ? iw / 2 : (i / (points.length - 1)) * iw); };
      var y = function (v) { return m.t + ih - (v / max) * ih; };
      var svg = svgEl('svg', { width: width, height: height, viewBox: '0 0 ' + width + ' ' + height, class: 'chart', role: 'img', tabindex: '0',
        'aria-label': (opts.label || 'Chart') + '. ' + points.length + ' days. Use the arrow keys to read each day.' });
      for (var g = 0; g <= 4; g++) {
        var gy = m.t + (ih / 4) * g, val = max - (max / 4) * g;
        svg.appendChild(svgEl('line', { x1: m.l, x2: width - m.r, y1: gy, y2: gy, stroke: g === 4 ? '#28506b' : '#1c3a50', 'stroke-width': 1 }));
        var t = svgEl('text', { x: m.l - 8, y: gy + 4, 'text-anchor': 'end' });
        t.textContent = tick(val);
        svg.appendChild(t);
      }
      var every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(iw / 80))));
      points.forEach(function (p, i) {
        if (i % every && i !== points.length - 1) return;
        if (i !== points.length - 1 && points.length - 1 - i < every / 2) return;
        var t = svgEl('text', { x: x(i), y: height - 6, 'text-anchor': i === 0 ? 'start' : (i === points.length - 1 ? 'end' : 'middle') });
        t.textContent = W.date(p.x).replace(/, \d{4}$/, '');
        svg.appendChild(t);
      });
      var line = points.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.y).toFixed(1); }).join(' ');
      if (points.length) {
        svg.appendChild(svgEl('path', { d: line + ' L' + x(points.length - 1).toFixed(1) + ' ' + y(0) + ' L' + x(0).toFixed(1) + ' ' + y(0) + ' Z', fill: color, 'fill-opacity': '0.1' }));
        svg.appendChild(svgEl('path', { d: line, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      }
      var cross = svgEl('line', { y1: m.t, y2: m.t + ih, stroke: '#a6bfce', 'stroke-width': 1, visibility: 'hidden' });
      var dot = svgEl('circle', { r: 4, fill: color, stroke: '#091e30', 'stroke-width': 2, visibility: 'hidden' });
      svg.appendChild(cross); svg.appendChild(dot);
      box.appendChild(svg);
      var tip = document.createElement('div');
      tip.className = 'chart-tip';
      tip.hidden = true;
      var tv = document.createElement('strong'), tl = document.createElement('span');
      tip.appendChild(tv); tip.appendChild(tl);
      box.appendChild(tip);

      var current = -1;
      function show(i) {
        if (!points.length) return;
        current = Math.max(0, Math.min(points.length - 1, i));
        var p = points[current], px = x(current), py = y(p.y);
        cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
        dot.setAttribute('cx', px); dot.setAttribute('cy', py); dot.setAttribute('visibility', 'visible');
        tv.textContent = W.num(p.y) + ' ' + (opts.unit || '');
        tl.textContent = new Date(p.x + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        tip.hidden = false;
        var left = Math.min(Math.max(px - tip.offsetWidth / 2, 0), width - tip.offsetWidth);
        tip.style.left = left + 'px';
        tip.style.top = Math.max(0, py - tip.offsetHeight - 12) + 'px';
      }
      function hide() { current = -1; cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.hidden = true; }
      svg.addEventListener('pointermove', function (e) {
        var r = svg.getBoundingClientRect();
        var px = (e.clientX - r.left) * (width / r.width);
        show(Math.round(((px - m.l) / iw) * (points.length - 1)));
      });
      svg.addEventListener('pointerleave', hide);
      svg.addEventListener('blur', hide);
      svg.addEventListener('focus', function () { show(points.length - 1); });
      svg.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); show((current < 0 ? points.length - 1 : current) + (e.key === 'ArrowLeft' ? -1 : 1)); }
        if (e.key === 'Home') { e.preventDefault(); show(0); }
        if (e.key === 'End') { e.preventDefault(); show(points.length - 1); }
      });
    }
    draw();
    var last = box.clientWidth;
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { if (Math.abs(box.clientWidth - last) > 8) { last = box.clientWidth; draw(); } });
      ro.observe(box);
    }
  };

  // Table view of the same numbers (identity never depends on the chart alone).
  W.chartTable = function (points, valueLabel) {
    return html`<details class="table-view"><summary>Show as a table</summary><div class="table-wrap"><table class="data"><thead><tr><th>Day</th><th class="num">${valueLabel}</th></tr></thead>
      <tbody>${points.slice().reverse().map(function (p) { return html`<tr><td>${W.date(p.x)}</td><td class="num">${W.num(p.y)}</td></tr>`; })}</tbody></table></div></details>`;
  };

  // rows: [{ label, value }], largest first; one hue, values printed at the bar ends.
  W.rankedBars = function (rows, opts) {
    opts = opts || {};
    if (!rows.length) return html`<p class="muted">${opts.empty || 'No data yet.'}</p>`;
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    return html`<div class="bars">${rows.map(function (r) {
      return html`<div class="bar-row"><span class="lbl" title="${r.label}">${r.label}</span><span class="n">${W.num(r.value)}</span>
        <span class="track"><span class="fill" style="width:${Math.max(1, (r.value / max) * 100).toFixed(1)}%"></span></span></div>`;
    })}</div>`;
  };

  // One whole split into up to 3 named parts (+ Other), with shares printed where they fit.
  W.segmentedBar = function (parts, label) {
    var total = parts.reduce(function (s, p) { return s + p.value; }, 0);
    if (!total) return html`<p class="muted">No data yet.</p>`;
    parts = parts.slice().sort(function (a, b) { return b.value - a.value; });
    if (parts.length > 3) {
      var rest = parts.slice(3).reduce(function (s, p) { return s + p.value; }, 0);
      parts = parts.slice(0, 3).concat([{ label: 'Other', value: rest }]);
    }
    parts.forEach(function (p, i) { p.color = p.label === 'Other' ? OTHER : W.SERIES[i]; p.share = Math.round((p.value / total) * 100); });
    var aria = label + ': ' + parts.map(function (p) { return p.label + ' ' + p.share + '%'; }).join(', ');
    return html`<div class="seg" role="img" aria-label="${aria}">${parts.map(function (p) {
      return p.value ? html`<span class="seg-part" style="flex:${p.value} 1 0;background:${p.color}" title="${p.label}: ${p.share}% (${W.num(p.value)})">${p.share >= 12 ? p.share + '%' : ''}</span>` : '';
    })}</div>
    <div class="legend">${parts.map(function (p) { return html`<span><i style="background:${p.color}"></i>${p.label}${p.share < 12 ? ' ' + p.share + '%' : ''}</span>`; })}</div>`;
  };

  // A stat tile with an optional change vs the previous period. goodWhen: 'up' | 'down' | 'neutral'.
  W.statTile = function (label, value, cur, prev, goodWhen, sub) {
    var delta = '';
    if (prev != null && prev !== 0 && cur != null) {
      var pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
      var up = pct > 0, flat = pct === 0;
      var good = goodWhen === 'neutral' || flat ? null : (goodWhen === 'up' ? up : !up);
      delta = html`<div class="sub"><span class="${good == null ? '' : (good ? 'delta-up' : 'delta-down')}">${flat ? '→ no change' : (up ? '▲ ' : '▼ ') + Math.abs(pct) + '%'}</span> ${sub || 'vs previous period'}</div>`;
    } else if (sub && prev == null) {
      delta = '';
    }
    return html`<div class="tile"><div class="label">${label}</div><div class="value">${value}</div>${delta}</div>`;
  };
})();
