#!/usr/bin/env node
/**
 * Builds src/data/prerender-routes.json: every appellation id that the maps can
 * select (from the runtime GeoJSON in public/data) but that has no entry in
 * src/data/france/<region>/appellations.json — Alsace and the Burgundy Grand
 * Crus. scripts/prerender.mjs reads it so those deep links get real HTML,
 * titles and canonical URLs. The output is committed so builds need no data.
 *
 *   node scripts/generate-route-list.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, sep, c) => sep + c.toUpperCase())

const sources = {
  burgundy: {
    file: 'public/data/france/burgundy/burgundy-display-exclusive-2026.geojson',
    describe: (p, villageNames) => {
      if (p.cruLevel !== 'grand-cru') return null
      const village = villageNames[p.villageId] ?? (p.commune ? titleCase(p.commune) : null)
      const nuits = ['gevrey-chambertin', 'morey-saint-denis', 'chambolle-musigny', 'vougeot', 'vosne-romanee', 'nuits-saint-georges']
      return {
        classification: 'Grand Cru',
        village,
        subregion: nuits.includes(p.villageId) ? 'Côte de Nuits' : 'Côte de Beaune',
      }
    },
  },
  alsace: {
    file: 'public/data/france/alsace/alsace-display-2026.geojson',
    describe: (p) => ({
      classification: /grand-cru/.test(p.id) ? 'Grand Cru' : 'Regional AOC',
      village: /grand-cru/.test(p.id) && p.nomcom ? titleCase(p.nomcom) : null,
      subregion: /grand-cru/.test(p.id) ? 'Alsace Grand Cru' : 'Alsace',
    }),
  },
}

const out = {}
for (const [region, cfg] of Object.entries(sources)) {
  const file = path.join(root, cfg.file)
  if (!fs.existsSync(file)) throw new Error(`missing ${cfg.file} (extract the runtime data into public/ first)`)
  const known = new Set()
  const villageNames = {}
  const metaFile = path.join(root, `src/data/france/${region}/appellations.json`)
  if (fs.existsSync(metaFile)) {
    for (const a of JSON.parse(fs.readFileSync(metaFile, 'utf8'))) {
      known.add(a.id)
      villageNames[a.id] = a.name
    }
  }
  const seen = new Map()
  for (const feature of JSON.parse(fs.readFileSync(file, 'utf8')).features) {
    const p = feature.properties ?? {}
    if (typeof p.id !== 'string' || known.has(p.id) || seen.has(p.id)) continue
    const extra = cfg.describe(p, villageNames)
    if (!extra) continue
    seen.set(p.id, { id: p.id, name: String(p.name ?? p.id).replace(/\bgrand cru\b/, 'Grand Cru'), ...extra })
  }
  out[region] = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  console.log(`${region}: ${out[region].length} routes`)
}
fs.writeFileSync(path.join(root, 'src/data/prerender-routes.json'), JSON.stringify(out, null, 2) + '\n')
console.log('wrote src/data/prerender-routes.json')
