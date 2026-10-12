#!/usr/bin/env node
// SommelierMaps visual acceptance test. Usage: node acceptance.mjs http://localhost:4173 [--out DIR] [--only a,b,...]
// Only dependency: playwright (uses bundled Chromium; falls back to system Chrome).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

// ---------- config (edit here if selectors / ids change) ----------
const args = process.argv.slice(2);
const BASE = (args.find(a => /^https?:\/\//.test(a)) || '').replace(/\/$/, '');
if (!BASE) { console.error('usage: node acceptance.mjs <preview-url> [--out DIR] [--only a,c,h]'); process.exit(2); }
const argVal = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const OUT = path.resolve(argVal('--out') || './acceptance-shots');
const ONLY = (argVal('--only') || 'a,b,c,d,e,f,g,h').split(',');
const TEST_QUERY = 'test=1';            // app must expose window.__wineMap ONLY when this query param is present
const SHEET_CLOSE = '.mobile-close-button';
const SHEET = '.hover-region-card';
const OUTLINE_LAYER_RE = /(hover|select).*outline|outline.*(hover|select)/i;
const OUTLINE_FALLBACK_COLOR = '#a01845';
const REGIONS = { bordeaux: '/bordeaux', burgundy: '/burgundy', champagne: '/champagne', alsace: '/alsace' };
const BORDEAUX_GEOJSON = '/data/france/bordeaux/bordeaux-display-exclusive-2026.geojson';
const MEDOC_IDS = ['medoc', 'haut-medoc', 'saint-estephe', 'pauillac', 'saint-julien', 'margaux', 'listrac-medoc', 'moulis-en-medoc'];
const DESKTOP = { viewport: { width: 1440, height: 900 } };
const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
// ------------------------------------------------------------------

fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (id, name, pass, detail) => { results.push({ id, name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} (${id}) ${name}${detail ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); };
const errors = []; // for (e)
const testUrl = p => BASE + p + (p.includes('?') ? '&' : '?') + TEST_QUERY;
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });

const launchArgs = ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
let browser;
try { browser = await chromium.launch({ args: launchArgs }); }
catch { browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: launchArgs }); }

async function open(ctx, url, tag) {
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`[${tag}] pageerror: ${e.message.slice(0, 200)}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] console.error: ${m.text().slice(0, 200)}`); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return page;
}
async function waitMap(page, ms = 45000) {
  const ok = await page.waitForFunction(() => { const m = window.__wineMap; return m && m.isStyleLoaded() && m.loaded(); }, null, { timeout: ms }).then(() => true, () => false);
  if (ok) { await page.evaluate(() => new Promise(r => { const m = window.__wineMap; if (!m.isMoving()) setTimeout(r, 300); m.once('idle', r); setTimeout(r, 8000); })); await page.waitForTimeout(800); }
  return ok;
}
const settle = page => page.evaluate(() => new Promise(r => { const m = window.__wineMap; let done = false; const f = () => { if (!done) { done = true; setTimeout(r, 400); } }; m.once('idle', f); setTimeout(f, 6000); }));
// bbox + sample boundary vertices of a feature id from a geojson URL
async function featureGeom(page, url, ids) {
  return page.evaluate(async ([url, ids]) => {
    const g = await (await fetch(url)).json(); let b = [180, 90, -180, -90]; const verts = [];
    const walk = c => { if (typeof c[0] === 'number') { b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]; verts.push(c); } else c.forEach(walk); };
    for (const f of g.features) if (ids.includes(f.properties.id)) walk(f.geometry.coordinates);
    const step = Math.max(1, Math.floor(verts.length / 600));
    return { bbox: b, verts: verts.filter((_, i) => i % step === 0) };
  }, [url, ids]);
}
const appFillLayers = page => page.evaluate(() => { const m = window.__wineMap, s = m.getStyle(); return s.layers.filter(l => l.type === 'fill' && s.sources[l.source]?.type === 'geojson').map(l => l.id); });
// find a screen point where feature `id` is rendered (scan inside projected bbox)
async function pointOnFeature(page, bbox, id) {
  return page.evaluate(([bbox, id]) => {
    const m = window.__wineMap, s = m.getStyle(); const layers = s.layers.filter(l => l.type === 'fill' && s.sources[l.source]?.type === 'geojson').map(l => l.id);
    const a = m.project([bbox[0], bbox[3]]), c = m.project([bbox[2], bbox[1]]); const r = m.getCanvas().getBoundingClientRect();
    const cx = (a.x + c.x) / 2, cy = (a.y + c.y) / 2; let best = null;
    for (let y = a.y; y <= c.y; y += 3) for (let x = a.x; x <= c.x; x += 3) {
      if (m.queryRenderedFeatures([x, y], { layers }).some(f => f.properties.id === id)) { const d = (x - cx) ** 2 + (y - cy) ** 2; if (!best || d < best.d) best = { x, y, d }; }
    }
    return best && { x: r.left + best.x, y: r.top + best.y, lngLat: m.unproject([best.x, best.y]).toArray() };
  }, [bbox, id]);
}
// decode a PNG screenshot in-browser and run fn on its pixels
async function withPixels(page, buf, fnSrc, arg) {
  const p = await page.context().newPage();
  const out = await p.evaluate(async ([b64, fnSrc, arg]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height); return (new Function('return ' + fnSrc)())(d, arg);
  }, [buf.toString('base64'), fnSrc, arg]);
  await p.close(); return out;
}
const visibleSheet = page => page.evaluate(([cs, ss]) => {
  const btn = [...document.querySelectorAll(cs)].find(b => b.offsetParent && b.getBoundingClientRect().height > 0);
  if (!btn) return null; const sh = btn.closest(ss) || btn.parentElement; return { top: Math.round(sh.getBoundingClientRect().top) };
}, [SHEET_CLOSE, SHEET]);

try {
  // ---------- (f) production build must not expose window.__wineMap ----------
  if (ONLY.includes('f')) {
    const ctx = await browser.newContext(DESKTOP); const p = await open(ctx, BASE + '/bordeaux', 'f');
    await p.waitForSelector('.maplibregl-canvas', { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(6000);
    const t = await p.evaluate(() => typeof window.__wineMap); check('f', 'window.__wineMap undefined without ?' + TEST_QUERY, t === 'undefined', 'typeof=' + t);
    await ctx.close();
  }

  // ---------- desktop: (a) persistent selection outline, (g) waterways, (b) deep link ----------
  const dctx = await browser.newContext(DESKTOP);
  if (ONLY.some(x => 'abg'.includes(x))) {
    const p = await open(dctx, testUrl('/bordeaux'), 'desktop-bordeaux');
    if (!await waitMap(p)) { check('a', 'map test hook available', false, `window.__wineMap not exposed with ?${TEST_QUERY}`); }
    else {
      await shot(p, 'desktop-bordeaux');
      const geo = await featureGeom(p, BORDEAUX_GEOJSON, ['pauillac']);
      const medoc = await featureGeom(p, BORDEAUX_GEOJSON, MEDOC_IDS);
      const waterCheck = async label => {
        const r = await p.evaluate(bb => {
          const m = window.__wineMap; const a = m.project([bb[0], bb[3]]), c = m.project([bb[2], bb[1]]);
          const fs = m.queryRenderedFeatures([[a.x, a.y], [c.x, c.y]]).filter(f => f.layer.type === 'line' && (/water|hydro|river/i.test(f.layer.id) || /water/.test(f.sourceLayer || '')));
          const bad = fs.filter(f => f.properties.class !== 'river').map(f => `${f.layer.id}|${f.sourceLayer || 'geojson'}|class=${f.properties.class ?? 'none'}|${f.properties.name ?? ''}`);
          return { total: fs.length, bad: [...new Set(bad)] };
        }, medoc.bbox);
        if (ONLY.includes('g')) check('g', `waterway/hydro lines through Médoc are rivers only (${label})`, r.bad.length === 0, r);
      };
      await waterCheck('initial');
      if (ONLY.includes('a')) {
        const pt = await pointOnFeature(p, geo.bbox, 'pauillac');
        if (!pt) check('a', 'Pauillac clickable', false, 'Pauillac not rendered on screen');
        else {
          await p.mouse.move(pt.x, pt.y); await p.waitForTimeout(400); await p.mouse.click(pt.x, pt.y); await settle(p);
          await p.mouse.move(3, 450); await p.waitForTimeout(1200);
          const vp = DESKTOP.viewport; await p.mouse.move(vp.width / 2, vp.height - 3); await p.waitForTimeout(1200); // away from any feature
          const st = await p.evaluate(re => {
            const m = window.__wineMap; const rx = new RegExp(re, 'i');
            const layers = m.getStyle().layers.filter(l => l.type === 'line' && rx.test(l.id));
            return layers.map(l => ({ id: l.id, filter: JSON.stringify(m.getFilter(l.id) ?? null), color: l.paint?.['line-color'], rendered: m.queryRenderedFeatures({ layers: [l.id] }).map(f => f.properties.id).filter((v, i, a) => a.indexOf(v) === i).slice(0, 10) }));
          }, OUTLINE_LAYER_RE.source);
          const hit = st.find(l => l.filter.includes('pauillac') || l.rendered.includes('pauillac'));
          check('a', 'outline layer filter/rendered features include pauillac after mouse-away', !!hit, st);
          const color = typeof (hit || st[0])?.color === 'string' ? (hit || st[0]).color : OUTLINE_FALLBACK_COLOR;
          const pts = await p.evaluate(v => { const m = window.__wineMap, r = m.getCanvas().getBoundingClientRect(); return v.map(c => { const q = m.project(c); return [r.left + q.x, r.top + q.y]; }); }, geo.verts);
          const buf = await p.screenshot({ path: path.join(OUT, 'desktop-bordeaux-selected-pauillac.png') });
          const px = await withPixels(p, buf, `(d, a) => {
            const hex = a.color.replace('#',''); const t = [0,2,4].map(i => parseInt(hex.slice(i,i+2),16)); let on = 0, hits = 0;
            for (const [x,y] of a.pts) { const X = Math.round(x), Y = Math.round(y); if (X<3||Y<3||X>=d.width-3||Y>=d.height-3) continue; on++; let ok=false;
              for (let dy=-2; dy<=2 && !ok; dy++) for (let dx=-2; dx<=2 && !ok; dx++) { const i=((Y+dy)*d.width+(X+dx))*4; const dist=Math.hypot(d.data[i]-t[0],d.data[i+1]-t[1],d.data[i+2]-t[2]); if (dist<70) ok=true; }
              if (ok) hits++; }
            return { color: a.color, sampled: on, hits, ratio: on ? +(hits/on).toFixed(3) : 0 }; }`, { color: /^#[0-9a-f]{6}$/i.test(color) ? color : OUTLINE_FALLBACK_COLOR, pts });
          check('a', 'burgundy outline pixels on Pauillac boundary (>=25% of boundary samples)', px.ratio >= 0.25, px);
          await waterCheck('after selecting Pauillac');
        }
      }
    }
    await p.close();
  }

  // ---------- (b) deep link zoom + bbox in viewport, desktop & mobile; (d) × on deep link (mobile) ----------
  const mctx = await browser.newContext(MOBILE);
  if (ONLY.includes('b') || ONLY.includes('d')) {
    for (const [ctx, tag] of [[dctx, 'desktop'], [mctx, 'mobile']]) {
      const p = await open(ctx, testUrl('/bordeaux/pauillac/'), tag + '-pauillac');
      if (!await waitMap(p)) { check('b', `${tag} deep link: map test hook`, false, 'window.__wineMap missing'); await p.close(); continue; }
      await p.waitForTimeout(2500); await settle(p); await shot(p, `${tag}-deeplink-pauillac`);
      const geo = await featureGeom(p, BORDEAUX_GEOJSON, ['pauillac']);
      const r = await p.evaluate(bb => { const m = window.__wineMap, c = m.getCanvas().getBoundingClientRect(); const a = m.project([bb[0], bb[3]]), z = m.project([bb[2], bb[1]]);
        return { zoom: +m.getZoom().toFixed(2), bboxPx: [a.x, a.y, z.x, z.y].map(Math.round), canvas: [c.width, c.height].map(Math.round), inside: a.x >= 0 && a.y >= 0 && z.x <= c.width && z.y <= c.height }; }, geo.bbox);
      if (ONLY.includes('b')) check('b', `${tag} /bordeaux/pauillac/ zoom>=10 and Pauillac bbox inside viewport`, r.zoom >= 10 && r.inside, r);
      if (tag === 'mobile' && ONLY.includes('d')) {
        const s = await visibleSheet(p);
        if (!s) check('d', 'mobile deep link shows sheet with ×', false, 'no visible ' + SHEET_CLOSE);
        else { await p.tap(SHEET_CLOSE); await p.waitForTimeout(1200); const after = await visibleSheet(p); await shot(p, 'mobile-deeplink-pauillac-closed'); check('d', 'mobile deep link: × closes sheet', !after, { before: s, after }); }
      }
      await p.close();
    }
  }

  // ---------- (c) sheet doesn't hide tapped feature; (d) × closes on region pages ----------
  if (ONLY.includes('c') || ONLY.includes('d')) {
    for (const [region, route] of Object.entries(REGIONS)) {
      const p = await open(mctx, testUrl(route), 'mobile-' + region);
      if (!await waitMap(p)) { check('c', `mobile ${region}: map test hook`, false, 'window.__wineMap missing'); await p.close(); continue; }
      await shot(p, `mobile-${region}`);
      // pick the lowest rendered appellation point in the lower part of the screen (worst case for a bottom sheet)
      const pick = await p.evaluate(() => {
        const m = window.__wineMap, s = m.getStyle(), r = m.getCanvas().getBoundingClientRect();
        const layers = s.layers.filter(l => l.type === 'fill' && s.sources[l.source]?.type === 'geojson').map(l => l.id); let best = null;
        for (let y = r.height * 0.4; y < r.height * 0.85; y += 6) for (let x = r.width * 0.1; x < r.width * 0.9; x += 6) {
          const f = m.queryRenderedFeatures([x, y], { layers })[0]; if (f && (!best || y > best.y)) best = { x, y, id: f.properties.id };
        }
        if (!best) for (let y = r.height * 0.15; y < r.height * 0.4; y += 6) for (let x = 10; x < r.width - 10; x += 6) { const f = m.queryRenderedFeatures([x, y], { layers })[0]; if (f) { best = { x, y, id: f.properties.id }; break; } }
        return best && { ...best, sx: r.left + best.x, sy: r.top + best.y, lngLat: m.unproject([best.x, best.y]).toArray() };
      });
      if (!pick) { check('c', `mobile ${region}: found a feature to tap`, false, 'none rendered'); await p.close(); continue; }
      await p.touchscreen.tap(pick.sx, pick.sy); await p.waitForTimeout(600); await settle(p); await p.waitForTimeout(600);
      const s = await visibleSheet(p);
      const after = await p.evaluate(ll => { const m = window.__wineMap, r = m.getCanvas().getBoundingClientRect(), q = m.project(ll); return { x: Math.round(r.left + q.x), y: Math.round(r.top + q.y) }; }, pick.lngLat);
      await shot(p, `mobile-${region}-tap-${pick.id}`);
      if (ONLY.includes('c')) check('c', `mobile ${region}: tapped ${pick.id} stays above sheet`, s && after.y < s.top - 8 && after.y > 0, { tappedAt: [Math.round(pick.sx), Math.round(pick.sy)], afterTap: after, sheetTop: s?.top ?? 'no sheet' });
      if (ONLY.includes('d')) {
        if (!s) check('d', `mobile ${region}: sheet with × visible`, false, 'no sheet');
        else { await p.tap(SHEET_CLOSE); await p.waitForTimeout(1200); const gone = !(await visibleSheet(p)); await shot(p, `mobile-${region}-closed`); check('d', `mobile ${region}: × closes sheet`, gone); }
      }
      await p.close();
    }
  }

  // ---------- (h) home thumbnails coverage ----------
  if (ONLY.includes('h')) {
    const p = await open(dctx, BASE + '/', 'home'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1000);
    await p.screenshot({ path: path.join(OUT, 'desktop-home.png'), fullPage: true });
    const cards = await p.$$('.region-card');
    if (!cards.length) check('h', 'home has region cards', false);
    for (const [i, card] of cards.entries()) {
      const media = (await card.$('.region-card-media, svg, img')) || card; const name = (await card.innerText()).split('\n')[0].trim() || 'card' + i;
      const buf = await media.screenshot({ path: path.join(OUT, `home-thumb-${i}.png`) });
      const r = await withPixels(p, buf, `(d) => { const n = d.width*d.height, hist = new Map();
        for (let i=0;i<n*4;i+=4){ const k=(d.data[i]>>3)<<10|(d.data[i+1]>>3)<<5|(d.data[i+2]>>3); hist.set(k,(hist.get(k)||0)+1); }
        const bk=[...hist.entries()].sort((a,b)=>b[1]-a[1])[0][0]; const bg=[(bk>>10&31)*8+4,(bk>>5&31)*8+4,(bk&31)*8+4]; let fg=0;
        for (let i=0;i<n*4;i+=4){ if (Math.hypot(d.data[i]-bg[0],d.data[i+1]-bg[1],d.data[i+2]-bg[2])>28) fg++; }
        return { w:d.width, h:d.height, coverage:+(fg/n).toFixed(3) }; }`);
      check('h', `home thumbnail "${name}" non-background coverage > 15%`, r.coverage > 0.15, r);
    }
    await p.close();
  }
  await dctx.close(); await mctx.close();
} catch (e) { check('x', 'harness ran without crashing', false, e.stack?.slice(0, 400)); }

// ---------- (e) ----------
if (ONLY.includes('e')) check('e', 'no pageerrors / console errors on any page', errors.length === 0, [...new Set(errors)].slice(0, 15));
await browser.close();
const failed = results.filter(r => !r.pass);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ base: BASE, when: new Date().toISOString(), results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots + results.json in ${OUT}`);
process.exit(failed.length ? 1 : 0);
