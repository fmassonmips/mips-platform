/**
 * Minimal inline-SVG line chart (no library: the CSP only allows our own scripts).
 *
 * MIPS.lineChart({
 *   title, subtitle,
 *   periods: ['2026-01', ...],
 *   series: [{ label, color, values: [number|null, ...] }],   // null = month not imported (gap)
 *   format: (v) => string,                                    // tooltip / table / end label value
 *   integer: true,                                            // counts: whole-number axis steps
 * }) -> HTMLElement
 *
 * The SVG is drawn at its container's real pixel width (and redrawn on
 * resize), so text stays at its CSS size instead of scaling with the chart.
 *
 * Rules (dataviz method): one y-axis starting at 0, 2px lines, end dots with a
 * surface ring, a legend for >= 2 series plus direct end labels when they do
 * not collide, crosshair + tooltip on hover (and arrow keys), and a table view.
 * Text always uses text colours; the series colour is only on marks and swatches.
 */
(function () {
    'use strict';

    const NS = 'http://www.w3.org/2000/svg';
    const H = 240;
    const M = { top: 14, right: 104, bottom: 28, left: 56 };
    const PH = H - M.top - M.bottom;
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function s(tag, attrs, parent) {
        const n = document.createElementNS(NS, tag);
        Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, String(v)));
        if (parent) { parent.appendChild(n); }
        return n;
    }

    function h(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) { n.className = cls; }
        if (text !== undefined) { n.textContent = text; }
        return n;
    }

    function monthLabel(p) {
        const [y, m] = p.split('-');
        return MONTHS[Number(m) - 1] + ' ' + y.slice(2);
    }

    /** Compact axis numbers: 950, 12K, 4.2M. */
    function compact(v) {
        const a = Math.abs(v);
        if (a >= 1e9) { return +(v / 1e9).toFixed(1) + 'B'; }
        if (a >= 1e6) { return +(v / 1e6).toFixed(1) + 'M'; }
        if (a >= 1e3) { return +(v / 1e3).toFixed(1) + 'K'; }
        return String(Math.round(v));
    }

    /** Round max up to a clean step so ticks are 0, step, 2*step... */
    function niceScale(max, ticks, integer) {
        if (!(max > 0)) { return { max: ticks, step: 1 }; }
        const raw = max / ticks;
        const mag = Math.pow(10, Math.floor(Math.log10(raw)));
        let step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((x) => x >= raw);
        if (integer) { step = Math.max(1, Math.ceil(step)); }
        return { max: step * Math.ceil(max / step), step: step };
    }

    function lineChart(opt) {
        const n = opt.periods.length;
        const fmt = opt.format || ((v) => String(v));
        const all = opt.series.flatMap((x) => x.values).filter((v) => v !== null);
        const scale = niceScale(Math.max(0, ...all), 4, opt.integer);
        const y = (v) => M.top + PH - (v / scale.max) * PH;

        const fig = h('figure', 'viz');
        fig.appendChild(h('figcaption', 'viz-title', opt.title));
        if (opt.subtitle) { fig.appendChild(h('p', 'viz-subtitle', opt.subtitle)); }

        if (opt.series.length >= 2) {
            const legend = h('ul', 'viz-legend');
            opt.series.forEach((se) => {
                const li = h('li');
                const sw = h('span', 'viz-swatch');
                sw.style.setProperty('--c', se.color);
                li.append(sw, document.createTextNode(se.label));
                legend.appendChild(li);
            });
            fig.appendChild(legend);
        }

        const wrap = h('div', 'viz-plot');
        const tip = h('div', 'viz-tip');
        tip.hidden = true;
        let drawnWidth = 0;

        function draw(W) {
        const PW = W - M.left - M.right;
        const x = (i) => M.left + (n === 1 ? PW / 2 : (i * PW) / (n - 1));
        wrap.replaceChildren();
        const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opt.title + '. Values in the table below.' }, wrap);
        // Month labels: thin them out when the plot is too narrow for all twelve.
        const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(PW / 46))));

        // Grid + y ticks (hairline, recessive).
        for (let t = 0; t <= scale.max + 1e-9; t += scale.step) {
            s('line', { x1: M.left, x2: M.left + PW, y1: y(t), y2: y(t), class: t === 0 ? 'viz-baseline' : 'viz-grid' }, svg);
            s('text', { x: M.left - 8, y: y(t) + 4, 'text-anchor': 'end', class: 'viz-tick' }, svg).textContent = compact(t);
        }
        opt.periods.forEach((p, i) => {
            if ((n - 1 - i) % every === 0) {
                s('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', class: 'viz-tick' }, svg).textContent = monthLabel(p);
            }
        });

        // Lines (broken at gaps) + single-series area wash.
        opt.series.forEach((se) => {
            let d = '';
            let pen = false;
            se.values.forEach((v, i) => {
                if (v === null) { pen = false; return; }
                d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
                pen = true;
            });
            if (opt.series.length === 1) {
                // Wash under each continuous run.
                let run = [];
                const flush = () => {
                    if (run.length > 1) {
                        const a = run.map(([i, v]) => `${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' L');
                        s('path', { d: `M${x(run[0][0])} ${y(0)} L${a} L${x(run[run.length - 1][0])} ${y(0)} Z`, class: 'viz-area', fill: se.color }, svg);
                    }
                    run = [];
                };
                se.values.forEach((v, i) => { if (v === null) { flush(); } else { run.push([i, v]); } });
                flush();
            }
            s('path', { d: d, class: 'viz-line', stroke: se.color }, svg);
            // A lone point between gaps would be invisible as a line: draw it.
            se.values.forEach((v, i) => {
                const isolated = v !== null && (i === 0 || se.values[i - 1] === null) && (i === n - 1 || se.values[i + 1] === null);
                if (isolated) { s('circle', { cx: x(i), cy: y(v), r: 3, class: 'viz-point', fill: se.color }, svg); }
            });
        });

        // End dots + direct labels (skipped when they would collide).
        const ends = opt.series.map((se) => {
            let i = se.values.length - 1;
            while (i >= 0 && se.values[i] === null) { i--; }
            return i < 0 ? null : { se: se, i: i, v: se.values[i] };
        }).filter(Boolean);
        ends.forEach((e) => s('circle', { cx: x(e.i), cy: y(e.v), r: 4, class: 'viz-dot', fill: e.se.color }, svg));
        const ys = ends.map((e) => y(e.v)).sort((a, b) => a - b);
        const collide = ys.some((v, i) => i > 0 && v - ys[i - 1] < 13);
        if (!collide && opt.series.length <= 4) {
            ends.forEach((e) => {
                const t = s('text', { x: x(e.i) + 9, y: y(e.v) + 4, class: 'viz-end' }, svg);
                t.textContent = opt.series.length === 1 ? fmt(e.v) : e.se.label;
            });
        }

        // Hover layer: crosshair + tooltip; arrow keys for keyboard users.
        const cross = s('line', { y1: M.top, y2: M.top + PH, class: 'viz-cross', visibility: 'hidden' }, svg);
        const hoverDots = opt.series.map((se) => s('circle', { r: 4, class: 'viz-dot', fill: se.color, visibility: 'hidden' }, svg));
        const hit = s('rect', { x: M.left - 12, y: M.top, width: PW + 24, height: PH, class: 'viz-hit', tabindex: 0,
            'aria-label': 'Move with left and right arrow keys to read each month' }, svg);
        wrap.appendChild(tip);
        let current = -1;

        function show(i) {
            current = i;
            cross.setAttribute('x1', x(i));
            cross.setAttribute('x2', x(i));
            cross.setAttribute('visibility', 'visible');
            opt.series.forEach((se, k) => {
                const v = se.values[i];
                hoverDots[k].setAttribute('visibility', v === null ? 'hidden' : 'visible');
                if (v !== null) { hoverDots[k].setAttribute('cx', x(i)); hoverDots[k].setAttribute('cy', y(v)); }
            });
            tip.replaceChildren(h('div', 'viz-tip-title', monthLabel(opt.periods[i])));
            opt.series.forEach((se) => {
                const row = h('div', 'viz-tip-row');
                const sw = h('span', 'viz-swatch');
                sw.style.setProperty('--c', se.color);
                row.append(sw, h('span', 'viz-tip-label', se.label), h('span', 'viz-tip-value', se.values[i] === null ? 'not imported' : fmt(se.values[i])));
                tip.appendChild(row);
            });
            tip.hidden = false;
            tip.style.left = Math.min(Math.max(x(i) - tip.offsetWidth / 2, 0), W - tip.offsetWidth) + 'px';
            tip.style.top = (M.top - 4) + 'px';
        }
        function hide() {
            current = -1;
            cross.setAttribute('visibility', 'hidden');
            hoverDots.forEach((d) => d.setAttribute('visibility', 'hidden'));
            tip.hidden = true;
        }
        hit.addEventListener('mousemove', (ev) => {
            const px = ev.clientX - svg.getBoundingClientRect().left;
            const i = Math.round(((px - M.left) / PW) * (n - 1));
            show(Math.max(0, Math.min(n - 1, i)));
        });
        hit.addEventListener('mouseleave', hide);
        hit.addEventListener('blur', hide);
        hit.addEventListener('keydown', (ev) => {
            if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
                ev.preventDefault();
                show(Math.max(0, Math.min(n - 1, (current < 0 ? n - 1 : current) + (ev.key === 'ArrowRight' ? 1 : -1))));
            }
        });
        }

        // Draw once attached (real width known), then on every resize.
        new ResizeObserver((entries) => {
            const w = Math.floor(entries[0].contentRect.width);
            if (w > 0 && w !== drawnWidth) {
                drawnWidth = w;
                draw(Math.max(w, 280));
            }
        }).observe(wrap);
        fig.appendChild(wrap);

        // Table view: the accessible and exact version of the chart.
        const details = h('details', 'viz-table');
        details.appendChild(h('summary', null, 'Table'));
        const table = h('table', 'data');
        const head = h('tr');
        head.append(h('th', null, 'Month'), ...opt.series.map((se) => h('th', 'num', se.label)));
        table.appendChild(h('thead')).appendChild(head);
        const body = table.appendChild(h('tbody'));
        opt.periods.forEach((p, i) => {
            const tr = h('tr');
            tr.append(h('td', null, monthLabel(p)), ...opt.series.map((se) => h('td', 'num', se.values[i] === null ? '—' : fmt(se.values[i]))));
            body.appendChild(tr);
        });
        const scroller = h('div', 'table-wrap');
        scroller.appendChild(table);
        details.appendChild(scroller);
        fig.appendChild(details);
        return fig;
    }

    window.MIPS = Object.assign(window.MIPS || {}, { lineChart: lineChart, compact: compact });
})();
