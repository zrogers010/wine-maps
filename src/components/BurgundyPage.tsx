import { useEffect, useRef, useState } from 'react'
import { area, pointOnFeature } from '@turf/turf'
import maplibregl, {
  type ExpressionSpecification,
  type FilterSpecification,
  type GeoJSONSourceSpecification,
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
  type MapMouseEvent,
} from 'maplibre-gl'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import appellationData from '../data/france/burgundy/appellations.json'
import {
  flyToBounds,
  LEGEND_PREVIEW_PADDING,
  OVERVIEW_PADDING,
  OverviewControl,
} from '../utils/camera'
import { getFeatureCollectionBounds } from '../utils/geo'
import { createAtlasMapStyle } from '../utils/mapStyles'
import { attachCameraHashSync, readCameraFromHash } from '../utils/urlHash'
import { trackAppellationSelect } from '../utils/analytics'
import { MapLoadingVeil } from './MapLoadingVeil'
import {
  addSelectedOutlineLayers,
  boundsForIds,
  exposeMapForTests,
  fitSelection,
  keepAboveSheet,
  pickAppellationAt,
  setSelectedOutline,
} from '../utils/selection'

type SourceFeatureId = string | number

interface BurgundyAppellationMetadata {
  id: string
  name: string
  country: string
  region: string
  subregion: string
  bank: string
  aocType: string
  primaryStyle: string
  dominantGrapes: string[]
  importantGrapes: string[]
  officialRulesNote: string
  commonPracticeNote: string
  classificationContext?: string
  terroir: {
    keySoils: string[]
    climate: string[]
    learningPoint: string
  }
  tastingProfile: {
    fruit: string[]
    nonFruit: string[]
    structure: string[]
    ageingPotential: string
  }
  examNotes: string[]
}

interface HoveredBurgundyRegion {
  id: string
  commune?: string
  insee?: string
  cruLevel?: string
  climat?: string
}

interface GrandCruMeta {
  name: string
  villageId: string
  subregion: string
  style: 'Red' | 'White'
  note: string
}

const appellations = appellationData as BurgundyAppellationMetadata[]
const burgundySourceId = 'burgundy-appellations'
const burgundyLowZoomSourceId = 'burgundy-low-zoom-hulls'
const burgundyLabelSourceId = 'burgundy-labels'
const burgundyGrandCruLabelSourceId = 'burgundy-grand-cru-labels'
const burgundyGrandCruLabelLayerId = 'burgundy-grand-cru-labels'
const burgundyPremierCruTintLayerId = 'burgundy-premier-cru-tint'
const burgundyLowZoomLayerId = 'burgundy-low-zoom-fill'
const burgundyLowZoomShadeLayerId = 'burgundy-low-zoom-shade'
const burgundyLowZoomBorderLayerId = 'burgundy-low-zoom-border'
const burgundyFillLayerId = 'burgundy-fill'
const burgundyAppellationShadeLayerId = 'burgundy-appellation-shade'
const burgundyCommuneShadeLayerId = 'burgundy-commune-shade'
const burgundyCommuneLineLayerId = 'burgundy-commune-lines'
const burgundyLineLayerId = 'burgundy-lines'
const burgundyLabelLayerId = 'burgundy-labels'
const zoomTransitionStart = 9.8
const detailedHoverStart = 10.5
const zoomTransitionEnd = 10.8

const burgundyIds = [
  'petit-chablis',
  'chablis',
  'chablis-grand-cru',
  'gevrey-chambertin',
  'morey-saint-denis',
  'chambolle-musigny',
  'vougeot',
  'vosne-romanee',
  'nuits-saint-georges',
  'aloxe-corton',
  'beaune',
  'pommard',
  'volnay',
  'meursault',
  'puligny-montrachet',
  'chassagne-montrachet',
]

const burgundyColors: Record<string, string> = {
  // Chablis - cool mineral tones
  'petit-chablis': '#b8c4a8',
  chablis: '#9ab0a4',
  'chablis-grand-cru': '#7a9289',
  
  // Côte de Nuits villages - earthy burgundy tones
  'gevrey-chambertin': '#9d7582',
  'morey-saint-denis': '#a8828f',
  'chambolle-musigny': '#b58fa0',
  vougeot: '#8d6c78',
  'vosne-romanee': '#a17d8d',
  'nuits-saint-georges': '#9a7786',
  
  // Côte de Beaune villages - warmer earth tones
  'aloxe-corton': '#a88d7a',
  beaune: '#b39682',
  pommard: '#9d7f6d',
  volnay: '#aa8975',
  meursault: '#c8a88c',
  'puligny-montrachet': '#d4b498',
  'chassagne-montrachet': '#bfa285',
}

const grandCruMeta: Record<string, GrandCruMeta> = {
  chambertin: { name: 'Chambertin', villageId: 'gevrey-chambertin', subregion: 'Côte de Nuits', style: 'Red', note: 'Powerful, structured flagship Grand Cru of Gevrey; "the king of wines".' },
  'chambertin-clos-de-beze': { name: 'Chambertin-Clos de Bèze', villageId: 'gevrey-chambertin', subregion: 'Côte de Nuits', style: 'Red', note: 'Historic monastic climat; may also be labelled Chambertin.' },
  'chapelle-chambertin': { name: 'Chapelle-Chambertin', villageId: 'gevrey-chambertin', subregion: 'Côte de Nuits', style: 'Red', note: 'Lighter, perfumed Chambertin satellite on shallow soils.' },
  'charmes-chambertin': { name: 'Charmes-Chambertin', villageId: 'gevrey-chambertin', subregion: 'Côte de Nuits', style: 'Red', note: 'Largest Chambertin satellite; supple, accessible style.' },
  'griotte-chambertin': { name: 'Griotte-Chambertin', villageId: 'gevrey-chambertin', subregion: 'Côte de Nuits', style: 'Red', note: 'Tiny amphitheater climat; named for cherry character.' },
  'latricieres-chambertin': { name: 'Latricières-Chambertin', villageId: 'gevrey-chambertin', subregion: 'Côte de Nuits', style: 'Red', note: 'Cooler southern neighbor of Chambertin; finesse over power.' },
  'mazis-chambertin': { name: 'Mazis-Chambertin', villageId: 'gevrey-chambertin', subregion: 'Côte de Nuits', style: 'Red', note: 'Northernmost Chambertin satellite; firm and savory.' },
  'mazoyeres-chambertin': { name: 'Mazoyères-Chambertin', villageId: 'gevrey-chambertin', subregion: 'Côte de Nuits', style: 'Red', note: 'Usually sold as Charmes-Chambertin; lower-slope climat.' },
  'ruchottes-chambertin': { name: 'Ruchottes-Chambertin', villageId: 'gevrey-chambertin', subregion: 'Côte de Nuits', style: 'Red', note: 'Small, high, rocky climat; taut mineral style.' },
  'clos-de-la-roche': { name: 'Clos de la Roche', villageId: 'morey-saint-denis', subregion: 'Côte de Nuits', style: 'Red', note: 'Largest and firmest Morey Grand Cru; Chambertin-like depth.' },
  'clos-saint-denis': { name: 'Clos Saint-Denis', villageId: 'morey-saint-denis', subregion: 'Côte de Nuits', style: 'Red', note: 'Silky, elegant Grand Cru that names the village.' },
  'clos-des-lambrays': { name: 'Clos des Lambrays', villageId: 'morey-saint-denis', subregion: 'Côte de Nuits', style: 'Red', note: 'Near-monopole promoted in 1981; aromatic, stemmy elegance.' },
  'clos-de-tart': { name: 'Clos de Tart', villageId: 'morey-saint-denis', subregion: 'Côte de Nuits', style: 'Red', note: 'Historic walled monopole held intact since 1141.' },
  'bonnes-mares': { name: 'Bonnes-Mares', villageId: 'chambolle-musigny', subregion: 'Côte de Nuits', style: 'Red', note: 'Straddles Chambolle and Morey; sturdier of Chambolle\u2019s two Grands Crus.' },
  musigny: { name: 'Musigny', villageId: 'chambolle-musigny', subregion: 'Côte de Nuits', style: 'Red', note: 'Silk-and-lace pinnacle of Chambolle; rare white also allowed.' },
  'clos-de-vougeot': { name: 'Clos de Vougeot', villageId: 'vougeot', subregion: 'Côte de Nuits', style: 'Red', note: 'Famous 50 ha walled clos with ~80 owners; quality varies by parcel position.' },
  echezeaux: { name: 'Échezeaux', villageId: 'vosne-romanee', subregion: 'Côte de Nuits', style: 'Red', note: 'Large Flagey-Échezeaux Grand Cru; perfumed, variable by producer.' },
  'grands-echezeaux': { name: 'Grands-Échezeaux', villageId: 'vosne-romanee', subregion: 'Côte de Nuits', style: 'Red', note: 'Smaller, deeper neighbor of Échezeaux beside Clos de Vougeot.' },
  'romanee-conti': { name: 'Romanée-Conti', villageId: 'vosne-romanee', subregion: 'Côte de Nuits', style: 'Red', note: 'DRC monopole; the most celebrated vineyard in Burgundy.' },
  'la-tache': { name: 'La Tâche', villageId: 'vosne-romanee', subregion: 'Côte de Nuits', style: 'Red', note: 'DRC monopole; opulent, spicy Vosne power.' },
  richebourg: { name: 'Richebourg', villageId: 'vosne-romanee', subregion: 'Côte de Nuits', style: 'Red', note: 'Rich, velvety upper-slope Grand Cru above Romanée-Conti.' },
  'la-romanee': { name: 'La Romanée', villageId: 'vosne-romanee', subregion: 'Côte de Nuits', style: 'Red', note: 'Smallest AOC in France (~0.85 ha); Comte Liger-Belair monopole.' },
  'la-grande-rue': { name: 'La Grande Rue', villageId: 'vosne-romanee', subregion: 'Côte de Nuits', style: 'Red', note: 'Lamarche monopole strip between La Tâche and Romanée-Conti; promoted 1992.' },
  'romanee-saint-vivant': { name: 'Romanée-Saint-Vivant', villageId: 'vosne-romanee', subregion: 'Côte de Nuits', style: 'Red', note: 'Lower-slope Vosne Grand Cru; the most delicate and perfumed of the group.' },
  corton: { name: 'Corton', villageId: 'aloxe-corton', subregion: 'Côte de Beaune', style: 'Red', note: 'Only red Grand Cru of the Côte de Beaune; many named climats (Clos du Roi, Bressandes…).' },
  'corton-charlemagne': { name: 'Corton-Charlemagne', villageId: 'aloxe-corton', subregion: 'Côte de Beaune', style: 'White', note: 'Steely, powerful Chardonnay from the upper hill of Corton.' },
  charlemagne: { name: 'Charlemagne', villageId: 'aloxe-corton', subregion: 'Côte de Beaune', style: 'White', note: 'Rarely used historic name; wines sold as Corton-Charlemagne.' },
  montrachet: { name: 'Montrachet', villageId: 'puligny-montrachet', subregion: 'Côte de Beaune', style: 'White', note: 'The greatest dry white vineyard in the world; shared by Puligny and Chassagne.' },
  'chevalier-montrachet': { name: 'Chevalier-Montrachet', villageId: 'puligny-montrachet', subregion: 'Côte de Beaune', style: 'White', note: 'Thin upper-slope soils above Montrachet; racy, mineral.' },
  'batard-montrachet': { name: 'Bâtard-Montrachet', villageId: 'puligny-montrachet', subregion: 'Côte de Beaune', style: 'White', note: 'Richer, deeper-soiled Grand Cru below Montrachet.' },
  'bienvenues-batard-montrachet': { name: 'Bienvenues-Bâtard-Montrachet', villageId: 'puligny-montrachet', subregion: 'Côte de Beaune', style: 'White', note: 'Small enclave within Bâtard on the Puligny side.' },
  'criots-batard-montrachet': { name: 'Criots-Bâtard-Montrachet', villageId: 'chassagne-montrachet', subregion: 'Côte de Beaune', style: 'White', note: 'Smallest Montrachet Grand Cru, entirely in Chassagne.' },
}

const grandCruColors: Record<string, string> = {
  // Gevrey Chambertin group - deep burgundy reds
  chambertin: '#8b4e5f',
  'chambertin-clos-de-beze': '#944f5e',
  'chapelle-chambertin': '#9d5563',
  'charmes-chambertin': '#a65a68',
  'griotte-chambertin': '#995265',
  'latricieres-chambertin': '#8a4b5d',
  'mazis-chambertin': '#924d60',
  'mazoyeres-chambertin': '#a65a68',
  'ruchottes-chambertin': '#8c4d5f',
  
  // Morey group - purple-reds
  'clos-de-la-roche': '#7a4f6b',
  'clos-saint-denis': '#845873',
  'clos-des-lambrays': '#8e5f7a',
  'clos-de-tart': '#7d526e',
  
  // Chambolle/Vougeot/Vosne group - rose-mauves
  'bonnes-mares': '#a97286',
  musigny: '#b5808f',
  'clos-de-vougeot': '#9c6a7c',
  echezeaux: '#a87385',
  'grands-echezeaux': '#9f6d7e',
  'romanee-conti': '#a67588',
  'la-tache': '#9e6f80',
  richebourg: '#b17a8c',
  'la-romanee': '#a87487',
  'la-grande-rue': '#a47185',
  'romanee-saint-vivant': '#ad788a',
  
  // Beaune reds - warm terracotta
  corton: '#a87562',
  
  // Beaune whites - golden beiges
  'corton-charlemagne': '#c4a07a',
  charlemagne: '#cca882',
  montrachet: '#d4b28a',
  'chevalier-montrachet': '#d8b68f',
  'batard-montrachet': '#dcba93',
  'bienvenues-batard-montrachet': '#e0be97',
  'criots-batard-montrachet': '#dbb990',
}

const legendGroups = [
  {
    title: 'Chablis',
    ids: ['petit-chablis', 'chablis', 'chablis-grand-cru'],
  },
  {
    title: 'Côte de Nuits',
    ids: [
      'gevrey-chambertin',
      'morey-saint-denis',
      'chambolle-musigny',
      'vougeot',
      'vosne-romanee',
      'nuits-saint-georges',
    ],
  },
  {
    title: 'Côte de Beaune',
    ids: [
      'aloxe-corton',
      'beaune',
      'pommard',
      'volnay',
      'meursault',
      'puligny-montrachet',
      'chassagne-montrachet',
    ],
  },
  {
    title: 'Grands Crus / Côte de Nuits',
    ids: Object.keys(grandCruMeta).filter(
      (id) => grandCruMeta[id].subregion === 'Côte de Nuits',
    ),
  },
  {
    title: 'Grands Crus / Côte de Beaune',
    ids: Object.keys(grandCruMeta).filter(
      (id) => grandCruMeta[id].subregion === 'Côte de Beaune',
    ),
  },
]

export function BurgundyPage({ initialSelectedId }: { initialSelectedId?: string } = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const overviewBoundsRef = useRef<[[number, number], [number, number]] | null>(null)
  const lowZoomHullGeoJsonRef = useRef<FeatureCollection | null>(null)
  const detailGeoJsonRef = useRef<FeatureCollection | null>(null)
  const hoveredFeatureIdRef = useRef<SourceFeatureId | null>(null)
  const hoveredRegionKeyRef = useRef<string | null>(null)
  const hoverLeaveTimeoutRef = useRef<number | null>(null)
  const lastSelectedIdRef = useRef<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [hoveredRegion, setHoveredRegion] = useState<HoveredBurgundyRegion | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null)
  const deepLinkIdRef = useRef<string | null>(initialSelectedId ?? null)
  const [legendHoveredId, setLegendHoveredId] = useState<string | null>(null)
  const [subregionHoveredIds, setSubregionHoveredIds] = useState<string[] | null>(null)

  const selectedRegion = selectedId ? { id: selectedId } : null
  const activeRegion = hoveredRegion ?? selectedRegion ?? (legendHoveredId ? { id: legendHoveredId } : null)
  const activeGrandCru = activeRegion ? grandCruMeta[activeRegion.id] : undefined
  const activeAppellation = activeRegion
    ? appellations.find(
        (appellation) =>
          appellation.id === (activeGrandCru?.villageId ?? activeRegion.id),
      )
    : null

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return
    }

    let cancelled = false
    const hashCamera = readCameraFromHash()
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: createAtlasMapStyle(),
      center: hashCamera?.center ?? [4.87, 46.98],
      zoom: hashCamera?.zoom ?? 9.2,
      minZoom: 6.8,
      maxZoom: 14,
      attributionControl: false,
      fadeDuration: 180,
    })

    attachCameraHashSync(map, '/burgundy')

    // Gentler wheel steps make trackpad/mouse zooming feel fluid instead of jumpy.
    map.scrollZoom.setWheelZoomRate(1 / 700)
    map.scrollZoom.setZoomRate(1 / 140)

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left')
    map.addControl(
      new OverviewControl(() => {
        const bounds = overviewBoundsRef.current
        if (bounds) {
          flyToBounds(map, bounds, { padding: OVERVIEW_PADDING })
        }
      }),
      'bottom-left',
    )
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
      }),
      'bottom-right',
    )

    map.on('load', async () => {
      const [burgundyGeoJson, burgundyLowZoomGeoJson] = await Promise.all([
        loadGeoJson('/data/france/burgundy/burgundy-display-exclusive-2026.geojson'),
        loadGeoJson('/data/france/burgundy/burgundy-display-hulls-2026.geojson'),
      ])

      if (cancelled) {
        return
      }

      lowZoomHullGeoJsonRef.current = burgundyLowZoomGeoJson
      detailGeoJsonRef.current = burgundyGeoJson

      map.addSource(burgundySourceId, {
        type: 'geojson',
        data: burgundyGeoJson,
      } satisfies GeoJSONSourceSpecification)

      map.addSource(burgundyGrandCruLabelSourceId, {
        type: 'geojson',
        data: createGrandCruLabelPoints(burgundyGeoJson),
      } satisfies GeoJSONSourceSpecification)

      map.addSource(burgundyLowZoomSourceId, {
        type: 'geojson',
        data: burgundyLowZoomGeoJson,
      } satisfies GeoJSONSourceSpecification)

      map.addSource(burgundyLabelSourceId, {
        type: 'geojson',
        data: createLabelPoints(burgundyLowZoomGeoJson),
      } satisfies GeoJSONSourceSpecification)

      map.addLayer({
        id: burgundyLowZoomLayerId,
        type: 'fill',
        source: burgundyLowZoomSourceId,
        paint: {
          'fill-color': burgundyFillColorExpression(),
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            zoomTransitionStart,
            0.72,
            zoomTransitionEnd,
            0,
          ],
        },
      })

      map.addLayer({
        id: burgundyLowZoomShadeLayerId,
        type: 'fill',
        source: burgundyLowZoomSourceId,
        filter: filterNone(),
        paint: {
          'fill-color': '#1c0f12',
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            zoomTransitionStart,
            0.14,
            zoomTransitionEnd,
            0,
          ],
        },
      })

      map.addLayer({
        id: burgundyLowZoomBorderLayerId,
        type: 'line',
        source: burgundyLowZoomSourceId,
        paint: {
          'line-color': 'rgba(96, 65, 45, 0.52)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.65, 11, 1.15],
          'line-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            zoomTransitionStart,
            0.54,
            zoomTransitionEnd,
            0,
          ],
        },
      })

      map.addLayer({
        id: burgundyFillLayerId,
        type: 'fill',
        source: burgundySourceId,
        paint: {
          'fill-color': burgundyFillColorExpression(),
          // Fade in across the same span the hulls fade out for one smooth crossfade.
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            zoomTransitionStart,
            0,
            zoomTransitionEnd,
            [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              0.86,
              0.68,
            ],
            13.5,
            [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              0.66,
              0.52,
            ],
          ],
        },
      })

      map.addLayer({
        id: burgundyAppellationShadeLayerId,
        type: 'fill',
        source: burgundySourceId,
        filter: filterNone(),
        paint: {
          'fill-color': '#1c0f12',
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            zoomTransitionStart,
            0,
            zoomTransitionEnd,
            0.08,
          ],
        },
      })

      map.addLayer({
        id: burgundyCommuneShadeLayerId,
        type: 'fill',
        source: burgundySourceId,
        filter: filterNone(),
        paint: {
          'fill-color': '#1c0f12',
          'fill-opacity': 0.2,
        },
      })

      map.addLayer({
        id: burgundyCommuneLineLayerId,
        type: 'line',
        source: burgundySourceId,
        paint: {
          'line-color': 'rgba(68, 48, 36, 0.64)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.45, 11, 0.85],
          'line-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            zoomTransitionStart,
            0,
            zoomTransitionEnd,
            0.34,
          ],
        },
      })

      map.addLayer({
        id: burgundyLineLayerId,
        type: 'line',
        source: burgundySourceId,
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            '#261318',
            'rgba(255, 255, 255, 0.32)',
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            2.4,
            0.35,
          ],
          'line-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            zoomTransitionStart,
            0,
            zoomTransitionEnd,
            [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              0.9,
              0.36,
            ],
          ],
        },
      })

      // Subtle dark tint distinguishes Premier Cru eligibility parcels from
      // plain village parcels once climat-level detail is legible.
      map.addLayer({
        id: burgundyPremierCruTintLayerId,
        type: 'fill',
        source: burgundySourceId,
        filter: ['==', ['get', 'cruLevel'], 'premier-cru'],
        paint: {
          'fill-color': '#43112b',
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            zoomTransitionEnd,
            0,
            12.2,
            0.16,
          ],
        },
      })

      map.addLayer({
        id: burgundyGrandCruLabelLayerId,
        type: 'symbol',
        source: burgundyGrandCruLabelSourceId,
        minzoom: 11.3,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 11.3, 9.5, 13.5, 12.5],
          'text-letter-spacing': 0.04,
          'text-variable-anchor': ['center', 'top', 'bottom'],
          'text-radial-offset': 0.2,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#4d1024',
          'text-halo-color': 'rgba(255, 250, 236, 0.95)',
          'text-halo-width': 1.9,
          'text-opacity': 0.96,
        },
      })

      map.addLayer({
        id: burgundyLabelLayerId,
        type: 'symbol',
        source: burgundyLabelSourceId,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 9, 11, 13],
          'text-letter-spacing': 0.02,
          'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right'],
          'text-radial-offset': 0.25,
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        },
        paint: {
          'text-color': '#2d211d',
          'text-halo-color': 'rgba(255, 250, 236, 0.96)',
          'text-halo-width': 2.4,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.74, 9, 0.9, 11, 0.97],
        },
      })

      map.moveLayer(burgundyLabelLayerId)
      map.moveLayer(burgundyLowZoomLayerId, burgundyLabelLayerId)
      map.moveLayer(burgundyLowZoomShadeLayerId, burgundyLabelLayerId)
      map.moveLayer(burgundyLowZoomBorderLayerId, burgundyLabelLayerId)

      map.on('mousemove', burgundyLowZoomLayerId, handleHullMouseMove)
      map.on('mouseleave', burgundyLowZoomLayerId, handleMouseLeave)
      map.on('mousemove', burgundyFillLayerId, handleMouseMove)
      map.on('mouseleave', burgundyFillLayerId, handleDetailMouseLeave)
      map.on('click', handleClick)

      // Persistent selection outline: village hulls at low zoom, parcels once zoomed in.
      const hullIds = burgundyLowZoomGeoJson.features
        .map((feature) => feature.properties?.id)
        .filter((id): id is string => typeof id === 'string')
      addSelectedOutlineLayers(map, burgundyLowZoomSourceId, 'burgundy-hull', [
        'interpolate', ['linear'], ['zoom'], zoomTransitionStart, 1, zoomTransitionEnd, 0,
      ])
      addSelectedOutlineLayers(map, burgundySourceId, 'burgundy', [
        'interpolate', ['linear'], ['zoom'],
        zoomTransitionStart, ['case', ['in', ['get', 'id'], ['literal', hullIds]], 0, 1],
        zoomTransitionEnd, 1,
      ])
      for (const layerId of ['burgundy-hull-selection-halo', 'burgundy-hull-selected-outline', 'burgundy-selection-halo', 'burgundy-selected-outline']) {
        map.moveLayer(layerId, burgundyLabelLayerId)
      }

      const overviewBounds = getFeatureCollectionBounds(burgundyGeoJson)
      overviewBoundsRef.current = overviewBounds

      const deepLinkBounds = deepLinkIdRef.current
        ? boundsForIds([burgundyGeoJson, burgundyLowZoomGeoJson], [deepLinkIdRef.current])
        : null

      if (deepLinkBounds) {
        // /burgundy/<id>/: frame the appellation once the card has been laid out.
        requestAnimationFrame(() => fitSelection(map, deepLinkBounds))
      } else if (!hashCamera) {
        // A camera deep link takes precedence over the intro overview flight.
        map.fitBounds(overviewBounds, {
          padding: OVERVIEW_PADDING,
          duration: 1100,
          essential: true,
        })
      }

      setIsReady(true)
    })

    mapRef.current = map

    exposeMapForTests(map)

    return () => {
      cancelled = true
      if (hoverLeaveTimeoutRef.current !== null) {
        window.clearTimeout(hoverLeaveTimeoutRef.current)
        hoverLeaveTimeoutRef.current = null
      }
      clearHoverState()
      map.remove()
      mapRef.current = null
    }

    function handleHullMouseMove(event: MapLayerMouseEvent) {
      const feature = event.features?.[0]
      const id = getFeatureId(feature?.properties)

      if (!id || !isLowZoomHullActive(map)) {
        return
      }

      if (hoverLeaveTimeoutRef.current !== null) {
        window.clearTimeout(hoverLeaveTimeoutRef.current)
        hoverLeaveTimeoutRef.current = null
      }

      map.getCanvas().style.cursor = 'pointer'

      if (hoveredFeatureIdRef.current !== null) {
        setFeatureHover(map, hoveredFeatureIdRef.current, false)
        hoveredFeatureIdRef.current = null
      }

      const nextRegion = { id }
      const nextRegionKey = hoveredRegionKey(nextRegion)

      if (hoveredRegionKeyRef.current !== nextRegionKey) {
        hoveredRegionKeyRef.current = nextRegionKey
        setHoveredRegion(nextRegion)
      }
    }

    function handleMouseMove(event: MapLayerMouseEvent) {
      const feature = event.features?.[0]
      const id = getFeatureId(feature?.properties)
      const sourceFeatureId = getSourceFeatureId(feature)

      if (!id || sourceFeatureId === null) {
        return
      }

      if (!isDetailedZoomActive(map)) {
        return
      }

      if (hoverLeaveTimeoutRef.current !== null) {
        window.clearTimeout(hoverLeaveTimeoutRef.current)
        hoverLeaveTimeoutRef.current = null
      }

      map.getCanvas().style.cursor = 'pointer'

      if (hoveredFeatureIdRef.current !== sourceFeatureId) {
        if (hoveredFeatureIdRef.current !== null) {
          setFeatureHover(map, hoveredFeatureIdRef.current, false)
        }

        hoveredFeatureIdRef.current = sourceFeatureId
        setFeatureHover(map, sourceFeatureId, true)
      }

      const nextRegion = getHoveredRegion(feature?.properties, id)
      const nextRegionKey = hoveredRegionKey(nextRegion)

      if (hoveredRegionKeyRef.current !== nextRegionKey) {
        hoveredRegionKeyRef.current = nextRegionKey
        setHoveredRegion(nextRegion)
      }
    }

    function handleMouseLeave() {
      map.getCanvas().style.cursor = ''

      if (hoverLeaveTimeoutRef.current !== null) {
        window.clearTimeout(hoverLeaveTimeoutRef.current)
      }

      hoverLeaveTimeoutRef.current = window.setTimeout(() => {
        clearHoverState()
        hoverLeaveTimeoutRef.current = null
      }, 90)
    }

    function handleDetailMouseLeave() {
      if (isLowZoomHullActive(map)) {
        return
      }

      handleMouseLeave()
    }

    // Select the topmost appellation rendered under the pointer; never zoom.
    function handleClick(event: MapMouseEvent) {
      const id = pickAppellationAt(map, event.point, [burgundyFillLayerId, burgundyLowZoomLayerId])

      if (!id) {
        return
      }

      if (id !== lastSelectedIdRef.current) {
        lastSelectedIdRef.current = id
        trackAppellationSelect('burgundy', id)
      }
      setSelectedId(id)
      keepAboveSheet(map, event.lngLat)
    }

    function clearHoverState() {
      if (hoveredFeatureIdRef.current !== null) {
        setFeatureHover(map, hoveredFeatureIdRef.current, false)
        hoveredFeatureIdRef.current = null
      }

      hoveredRegionKeyRef.current = null
      setHoveredRegion(null)
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !isReady) {
      return
    }

    setSelectedOutline(map, 'burgundy-hull', selectedId)
    setSelectedOutline(map, 'burgundy', selectedId)
  }, [isReady, selectedId])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !isReady) {
      return
    }

    map.setFilter(
      burgundyLowZoomShadeLayerId,
      lowZoomHullShadeFilter(hoveredRegion, legendHoveredId),
    )
    map.setFilter(
      burgundyAppellationShadeLayerId,
      hoveredRegion
        ? hoveredRegion.climat && hoveredRegion.cruLevel === 'premier-cru'
          ? ([
              'all',
              ['==', ['get', 'id'], hoveredRegion.id],
              ['==', ['get', 'climat'], hoveredRegion.climat],
            ] as FilterSpecification)
          : ['==', ['get', 'id'], hoveredRegion.id]
        : legendHoveredId
          ? ['==', ['get', 'id'], legendHoveredId]
          : filterNone(),
    )
    map.setFilter(
      burgundyCommuneShadeLayerId,
      hoveredRegion ? communeShadeFilter(hoveredRegion) : filterNone(),
    )
  }, [hoveredRegion, isReady, legendHoveredId])

  useEffect(() => {
    const map = mapRef.current
    const lowZoomHullGeoJson = lowZoomHullGeoJsonRef.current

    if (!map || !isReady || !lowZoomHullGeoJson || !subregionHoveredIds?.length) {
      return
    }

    const features = lowZoomHullGeoJson.features.filter(
      (feature) =>
        typeof feature.properties?.id === 'string' &&
        subregionHoveredIds.includes(feature.properties.id),
    )

    if (features.length === 0) {
      return
    }

    flyToBounds(
      map,
      getFeatureCollectionBounds({
        type: 'FeatureCollection',
        features,
      }),
      {
        padding: LEGEND_PREVIEW_PADDING,
        maxZoom: 10.15,
        speed: 1.4,
      },
    )
  }, [isReady, subregionHoveredIds])

  useEffect(() => {
    const map = mapRef.current
    const lowZoomHullGeoJson = lowZoomHullGeoJsonRef.current
    const detailGeoJson = detailGeoJsonRef.current

    if (!map || !isReady || !lowZoomHullGeoJson || !legendHoveredId) {
      return
    }

    const hullFeature = lowZoomHullGeoJson.features.find(
      (candidate) => candidate.properties?.id === legendHoveredId,
    )
    // Grand Crus have no low-zoom hull; frame their detail parcels instead.
    const features = hullFeature
      ? [hullFeature]
      : (detailGeoJson?.features.filter(
          (candidate) => candidate.properties?.id === legendHoveredId,
        ) ?? [])

    if (features.length === 0) {
      return
    }

    flyToBounds(
      map,
      getFeatureCollectionBounds({
        type: 'FeatureCollection',
        features,
      }),
      {
        padding: LEGEND_PREVIEW_PADDING,
        maxZoom: hullFeature ? 11.8 : 13.4,
        speed: 1.5,
      },
    )
  }, [isReady, legendHoveredId])

  return (
    <div className="map-only-shell">
      <div className="map-container" ref={containerRef} />
      <MapLoadingVeil isReady={isReady} regionName="Burgundy" />
      <BurgundyHoverCard
        appellation={activeAppellation}
        grandCru={activeGrandCru}
        region={activeRegion}
        onClose={() => {
          lastSelectedIdRef.current = null
          setSelectedId(null)
          setHoveredRegion(null)
        }}
      />
      <div className="map-source-badge">
        INAO/data.gouv.fr AOC viticole parcel delimitation extract. Online data
        are informational; official plans remain with town halls or INAO.
      </div>
      <aside 
        className={`region-legend${selectedId ? ' is-hidden' : ''}`} 
        aria-label="Burgundy appellation legend"
      >
        {legendGroups.map((group) => (
          <section className="region-legend-group" key={group.title}>
            <h2
              onMouseEnter={() => setSubregionHoveredIds(group.ids)}
              onMouseLeave={() => setSubregionHoveredIds(null)}
            >
              {group.title}
            </h2>
            <div className="region-legend-list">
              {group.ids.map((id) => {
                const name =
                  appellations.find((candidate) => candidate.id === id)?.name ??
                  grandCruMeta[id]?.name

                if (!name) {
                  return null
                }

                return (
                  <div
                    className="region-legend-row"
                    key={id}
                    onMouseEnter={() => setLegendHoveredId(id)}
                    onMouseLeave={() => setLegendHoveredId(null)}
                  >
                    <span
                      className="region-legend-swatch"
                      style={{
                        backgroundColor: burgundyColors[id] ?? grandCruColors[id],
                      }}
                    />
                    <span>{name}</span>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </aside>
    </div>
  )
}

function BurgundyHoverCard({
  appellation,
  grandCru,
  region,
  onClose,
}: {
  appellation: BurgundyAppellationMetadata | null | undefined
  grandCru: GrandCruMeta | undefined
  region: HoveredBurgundyRegion | null
  onClose?: () => void
}) {
  const isMobileOpen = Boolean(region)

  const handleClose = () => {
    if (onClose) {
      onClose()
    }
  }

  if (!appellation || !region) {
    return (
      <aside className="hover-region-card is-empty">
        <span className="hover-card-kicker">Burgundy AOC Map</span>
        <strong>Tap or hover the map or legend to explore an appellation</strong>
      </aside>
    )
  }

  if (grandCru) {
    return (
      <aside className={`hover-region-card${isMobileOpen ? ' mobile-open' : ''}`}>
        <button 
          className="mobile-close-button"
          onClick={handleClose}
          aria-label="Close"
        >
          ×
        </button>
        <span className="hover-card-kicker">
          Burgundy / {grandCru.subregion} / Grand Cru
        </span>
        <h2>{grandCru.name}</h2>
        {region.commune ? (
          <div className="hover-card-commune">
            {region.commune}
            {region.insee ? <span>{region.insee}</span> : null}
          </div>
        ) : null}
        <div className="hover-card-meta">
          <span>Grand Cru AOC</span>
          <span>{grandCru.style === 'Red' ? 'Dry red' : 'Dry white'}</span>
        </div>
        <ul className="hierarchy-list">
          <li>
            <span>Region</span>
            <strong>Burgundy</strong>
          </li>
          <li>
            <span>Subregion</span>
            <strong>{grandCru.subregion}</strong>
          </li>
          <li>
            <span>Village</span>
            <strong>{appellation.name}</strong>
          </li>
          <li>
            <span>Grand Cru</span>
            <strong>{grandCru.name}</strong>
          </li>
        </ul>
        <dl>
          <div>
            <dt>Grape</dt>
            <dd>{grandCru.style === 'Red' ? 'Pinot Noir' : 'Chardonnay'}</dd>
          </div>
          <div>
            <dt>Soil characteristics</dt>
            <dd>{appellation.terroir.keySoils.join(', ')}</dd>
          </div>
        </dl>
        <p>{grandCru.note}</p>
      </aside>
    )
  }

  const isPremierCru = region.cruLevel === 'premier-cru'

  return (
    <aside className={`hover-region-card${isMobileOpen ? ' mobile-open' : ''}`}>
      <button 
        className="mobile-close-button"
        onClick={handleClose}
        aria-label="Close"
      >
        ×
      </button>
      <span className="hover-card-kicker">
        {appellation.region} / {appellation.subregion}
      </span>
      <h2>
        {appellation.name}
        {isPremierCru && region.climat ? ` ${region.climat}` : ''}
      </h2>
      {region.commune ? (
        <div className="hover-card-commune">
          {region.commune}
          {region.insee ? <span>{region.insee}</span> : null}
        </div>
      ) : null}
      <div className="hover-card-meta">
        <span>{isPremierCru ? 'Premier Cru' : appellation.aocType}</span>
        <span>{appellation.primaryStyle}</span>
      </div>
      <ul className="hierarchy-list">
        <li>
          <span>Country</span>
          <strong>{appellation.country}</strong>
        </li>
        <li>
          <span>Region</span>
          <strong>{appellation.region}</strong>
        </li>
        <li>
          <span>Subregion</span>
          <strong>{appellation.subregion}</strong>
        </li>
        <li>
          <span>Appellation / AOC</span>
          <strong>{appellation.name}</strong>
        </li>
        {isPremierCru ? (
          <li>
            <span>Premier Cru climat</span>
            <strong>{region.climat ?? 'Premier Cru (climat unnamed)'}</strong>
          </li>
        ) : null}
        {region.commune ? (
          <li>
            <span>Commune</span>
            <strong>{region.commune}</strong>
          </li>
        ) : null}
      </ul>
      <dl>
        <div>
          <dt>Dominant grape focus</dt>
          <dd>{appellation.dominantGrapes.join(', ')}</dd>
        </div>
        <div>
          <dt>Soil characteristics</dt>
          <dd>{appellation.terroir.keySoils.join(', ')}</dd>
        </div>
      </dl>
      <div className="study-cues-compact" aria-label="Typical exam cues">
        <h3>Varietals</h3>
        {studyCuesForAppellation(appellation).map((cue) => (
          <div className="study-cue-row" key={cue.label}>
            <strong>{cue.label}</strong>
            <span className="study-cue-details">
              <span>
                <b>Visual:</b> {cue.visual}
              </span>
              <span>
                <b>Taste:</b> {cue.tasting}
              </span>
            </span>
          </div>
        ))}
      </div>
      <p>{appellation.terroir.learningPoint}</p>
    </aside>
  )
}

async function loadGeoJson(path: string): Promise<FeatureCollection> {
  try {
    const response = await fetch(path)

    if (!response.ok) {
      console.warn(`GeoJSON file not available: ${path}`)
      return {
        type: 'FeatureCollection',
        features: [],
      }
    }

    return (await response.json()) as FeatureCollection
  } catch (error) {
    console.warn(`Error loading GeoJSON from ${path}:`, error)
    return {
      type: 'FeatureCollection',
      features: [],
    }
  }
}

function createLabelPoints(geoJson: FeatureCollection): FeatureCollection {
  const largestFeatureById = new Map<string, Feature<Geometry>>()

  for (const feature of geoJson.features) {
    const id = getFeatureId(feature.properties)

    if (!id) {
      continue
    }

    const largestFeature = largestFeatureById.get(id)
    if (!largestFeature || area(feature) > area(largestFeature)) {
      largestFeatureById.set(id, feature as Feature<Geometry>)
    }
  }

  return {
    type: 'FeatureCollection',
    features: [...largestFeatureById.entries()].map(([id, feature]) => ({
      type: 'Feature',
      id,
      properties: {
        id,
        name: getMetadataName(id),
      },
      geometry: {
        type: 'Point',
        coordinates: pointOnFeature(feature).geometry.coordinates,
      },
    })),
  }
}

function burgundyFillColorExpression(): ExpressionSpecification {
  return [
    'match',
    ['get', 'id'],
    ...Object.entries({ ...burgundyColors, ...grandCruColors }).flatMap(
      ([id, color]) => [id, color],
    ),
    '#8c6f4f',
  ] as unknown as ExpressionSpecification
}

function setFeatureHover(map: MapLibreMap, id: SourceFeatureId, isHovered: boolean) {
  map.setFeatureState({ source: burgundySourceId, id }, { hover: isHovered })
}

function getHoveredRegion(properties: unknown, id: string): HoveredBurgundyRegion {
  return {
    id,
    commune: getStringProperty(properties, 'commune'),
    insee: getStringProperty(properties, 'insee'),
    cruLevel: getStringProperty(properties, 'cruLevel'),
    climat: getStringProperty(properties, 'climat'),
  }
}

function hoveredRegionKey(region: HoveredBurgundyRegion) {
  return [
    region.id,
    region.insee ?? '',
    region.commune ?? '',
    region.cruLevel ?? '',
    region.climat ?? '',
  ].join('|')
}

function createGrandCruLabelPoints(geoJson: FeatureCollection): FeatureCollection {
  const largestFeatureById = new Map<string, Feature<Geometry>>()

  for (const feature of geoJson.features) {
    const id = getFeatureId(feature.properties)

    if (!id || !(id in grandCruMeta)) {
      continue
    }

    const largestFeature = largestFeatureById.get(id)
    if (!largestFeature || area(feature) > area(largestFeature)) {
      largestFeatureById.set(id, feature as Feature<Geometry>)
    }
  }

  return {
    type: 'FeatureCollection',
    features: [...largestFeatureById.entries()].map(([id, feature]) => ({
      type: 'Feature',
      id,
      properties: {
        id,
        name: grandCruMeta[id].name,
      },
      geometry: {
        type: 'Point',
        coordinates: pointOnFeature(feature).geometry.coordinates,
      },
    })),
  }
}

function communeShadeFilter(region: HoveredBurgundyRegion): FilterSpecification {
  if (region.insee) {
    return [
      'all',
      ['==', ['get', 'id'], region.id],
      ['==', ['get', 'insee'], region.insee],
    ]
  }

  if (region.commune) {
    return [
      'all',
      ['==', ['get', 'id'], region.id],
      ['==', ['get', 'commune'], region.commune],
    ]
  }

  if (burgundyIds.includes(region.id)) {
    return filterNone()
  }

  return ['==', ['get', 'id'], region.id]
}

function lowZoomHullShadeFilter(
  region: HoveredBurgundyRegion | null,
  legendHoveredId: string | null,
): FilterSpecification {
  const activeId = region?.id ?? legendHoveredId

  if (!activeId || !burgundyIds.includes(activeId)) {
    return filterNone()
  }

  return ['==', ['get', 'id'], activeId]
}

function isLowZoomHullActive(map: MapLibreMap) {
  return map.getZoom() < detailedHoverStart
}

function isDetailedZoomActive(map: MapLibreMap) {
  return map.getZoom() >= detailedHoverStart
}

function getMetadataName(id: string) {
  return appellations.find((appellation) => appellation.id === id)?.name ?? id
}

function getFeatureId(properties: unknown) {
  if (!properties || typeof properties !== 'object' || !('id' in properties)) {
    return null
  }

  const id = (properties as { id?: unknown }).id
  return typeof id === 'string' ? id : null
}

function getSourceFeatureId(feature: { id?: unknown } | undefined) {
  if (feature?.id === undefined) {
    return null
  }

  return typeof feature.id === 'string' || typeof feature.id === 'number'
    ? feature.id
    : null
}

function getStringProperty(properties: unknown, key: string) {
  if (!properties || typeof properties !== 'object' || !(key in properties)) {
    return undefined
  }

  const value = (properties as Record<string, unknown>)[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function filterNone(): FilterSpecification {
  return ['==', ['get', 'id'], '__none__']
}

interface StudyCue {
  label: string
  visual: string
  tasting: string
}

function studyCuesForAppellation(appellation: BurgundyAppellationMetadata): StudyCue[] {
  const grapeCues = [...new Set([...appellation.dominantGrapes, ...appellation.importantGrapes])]
    .slice(0, 2)
    .map((grape) => grapeStudyCue(grape, appellation))

  return [...grapeCues, wineStyleStudyCue(appellation)]
}

function grapeStudyCue(
  grape: string,
  appellation: BurgundyAppellationMetadata,
): StudyCue {
  if (grape === 'Chardonnay') {
    return {
      label: grape,
      visual: 'pale lemon to medium gold',
      tasting: [
        ...appellation.tastingProfile.fruit.slice(0, 2),
        ...appellation.tastingProfile.nonFruit.slice(0, 2),
        ...appellation.tastingProfile.structure.slice(0, 1),
      ].join(', '),
    }
  }

  if (grape === 'Pinot Noir') {
    return {
      label: grape,
      visual: 'pale ruby to medium ruby, garnet with age',
      tasting: [
        ...appellation.tastingProfile.fruit.slice(0, 2),
        ...appellation.tastingProfile.nonFruit.slice(0, 2),
        ...appellation.tastingProfile.structure.slice(0, 1),
      ].join(', '),
    }
  }

  return {
    label: grape,
    visual: 'variety-dependent color and intensity cue',
    tasting: 'use fruit, structure, and aroma markers with local context',
  }
}

function wineStyleStudyCue(appellation: BurgundyAppellationMetadata): StudyCue {
  const style = appellation.primaryStyle.toLowerCase()
  const tasting = [
    ...appellation.tastingProfile.fruit.slice(0, 2),
    ...appellation.tastingProfile.nonFruit.slice(0, 2),
    ...appellation.tastingProfile.structure.slice(0, 1),
  ].join(', ')

  if (style.includes('white')) {
    return {
      label: 'Dry white Burgundy',
      visual: 'pale lemon to medium gold, deeper with age or oak',
      tasting,
    }
  }

  if (style.includes('red')) {
    return {
      label: 'Dry red Burgundy',
      visual: 'pale ruby to medium ruby, garnet with age',
      tasting,
    }
  }

  return {
    label: appellation.primaryStyle,
    visual: 'note intensity, hue, rim variation, clarity, and viscosity',
    tasting,
  }
}
