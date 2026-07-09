import {
  StudyRegionMapPage,
  type StudyRegionMetadata,
} from './StudyRegionMapPage'

const grandCruNames = [
  'Altenberg de Bergbieten',
  'Altenberg de Bergheim',
  'Altenberg de Wolxheim',
  'Brand',
  'Bruderthal',
  'Eichberg',
  'Engelberg',
  'Florimont',
  'Frankstein',
  'Froehn',
  'Furstentum',
  'Geisberg',
  'Gloeckelberg',
  'Goldert',
  'Hatschbourg',
  'Hengst',
  'Kaefferkopf',
  'Kanzlerberg',
  'Kastelberg',
  'Kessler',
  'Kirchberg de Barr',
  'Kirchberg de Ribeauvillé',
  'Kitterlé',
  'Mambourg',
  'Mandelberg',
  'Marckrain',
  'Moenchberg',
  'Muenchberg',
  'Ollwiller',
  'Osterberg',
  'Pfersigberg',
  'Pfingstberg',
  'Praelatenberg',
  'Rangen',
  'Rosacker',
  'Saering',
  'Schlossberg',
  'Schoenenbourg',
  'Sommerberg',
  'Sonnenglanz',
  'Spiegel',
  'Sporen',
  'Steinert',
  'Steingrubler',
  'Steinklotz',
  'Vorbourg',
  'Wiebelsberg',
  'Wineck-Schlossberg',
  'Winzenberg',
  'Zinnkoepfle',
  'Zotzenberg',
]

const notableGrandCruProducers: Record<string, string[]> = {
  'Altenberg de Bergheim': ['Marcel Deiss'],
  Brand: ['Albert Boxler', 'Josmeyer'],
  Eichberg: ['Domaine Kuentz-Bas', 'Domaine Paul Ginglinger'],
  Engelberg: ['Domaine Pfister'],
  Florimont: ['Domaine Weinbach', 'Domaine Bott-Geyl'],
  Furstentum: ['Paul Blanck', 'Domaine Weinbach'],
  Geisberg: ['Kientzler', 'Trimbach'],
  Goldert: ['Zind-Humbrecht'],
  Hatschbourg: ['Domaine Schoffit'],
  Hengst: ['Josmeyer', 'Albert Mann', 'Barmes-Buecher'],
  Kaefferkopf: ['Meyer-Fonné', 'Jean-Baptiste Adam'],
  'Kirchberg de Barr': ['Domaine Stoeffler'],
  'Kirchberg de Ribeauvillé': ['Louis Sipp', 'Trimbach'],
  Mambourg: ['Marcel Deiss', 'Domaine Weinbach'],
  Mandelberg: ['Domaine Bott-Geyl'],
  Marckrain: ['Domaine Paul Blanck'],
  Pfersigberg: ['Paul Ginglinger', 'Domaine Zinck'],
  Rangen: ['Zind-Humbrecht', 'Schoffit'],
  Rosacker: ['Trimbach', 'Agathe Bursin'],
  Schlossberg: ['Domaine Weinbach', 'Albert Mann', 'Domaine Bott-Geyl'],
  Schoenenbourg: ['Hugel', 'Marcel Deiss', 'Dopff au Moulin'],
  Sommerberg: ['Albert Boxler'],
  Sporen: ['Marcel Deiss'],
  Steinert: ['Domaine Barmès-Buecher'],
  Vorbourg: ['René Muré'],
  'Wineck-Schlossberg': ['Domaine Meyer-Fonné'],
  Zinnkoepfle: ['Seppi Landmann'],
}

const appellations: StudyRegionMetadata[] = [
  {
    id: 'alsace',
    name: 'Alsace',
    country: 'France',
    region: 'Alsace',
    subregion: 'Alsace wine route',
    bank: 'Vosges foothills',
    aocType: 'Regional appellation',
    primaryStyle: 'Still white, red, rosé, and sweet wines',
    dominantGrapes: ['Riesling', 'Gewurztraminer', 'Pinot Gris'],
    importantGrapes: ['Pinot Blanc', 'Muscat', 'Sylvaner', 'Pinot Noir'],
    terroir: {
      keySoils: ['granite', 'limestone', 'marl', 'sandstone', 'volcanic soils'],
      climate: ['continental', 'Vosges rain shadow', 'long dry autumn'],
      learningPoint:
        'Alsace is protected by the Vosges rain shadow, giving dry autumns that help aromatic white grapes ripen while retaining acidity.',
    },
    tastingProfile: {
      fruit: ['lime', 'white peach', 'lychee'],
      nonFruit: ['petrol with Riesling age', 'rose', 'ginger', 'mineral'],
      structure: ['medium-plus to high acidity', 'aromatic intensity', 'dry to sweet'],
      ageingPotential: 'moderate to high, especially Riesling and Grand Cru wines',
    },
  },
  {
    id: 'cremant-d-alsace',
    name: "Crémant d'Alsace",
    country: 'France',
    region: 'Alsace',
    subregion: 'Alsace wine route',
    bank: 'Vosges foothills',
    aocType: 'Regional sparkling appellation',
    primaryStyle: 'Traditional-method sparkling wine',
    dominantGrapes: ['Pinot Blanc', 'Auxerrois', 'Riesling'],
    importantGrapes: ['Pinot Gris', 'Chardonnay', 'Pinot Noir'],
    terroir: {
      keySoils: ['limestone', 'marl', 'granite', 'sandstone'],
      climate: ['continental', 'Vosges rain shadow'],
      learningPoint:
        "Crémant d'Alsace shares the broad Alsace geography but is studied for traditional-method sparkling production.",
    },
    tastingProfile: {
      fruit: ['green apple', 'lemon', 'pear'],
      nonFruit: ['brioche', 'almond', 'white flowers'],
      structure: ['high acidity', 'fine mousse', 'dry'],
      ageingPotential: 'short to moderate',
    },
  },
  ...grandCruNames.map((name): StudyRegionMetadata => ({
    id: slug(`Alsace grand cru ${name}`),
    name: `Alsace Grand Cru ${name}`,
    country: 'France',
    region: 'Alsace',
    subregion: 'Alsace Grand Cru',
    bank: 'Vosges foothills',
    aocType: 'Grand cru appellation',
    primaryStyle: 'Still white, often dry to sweet depending on grape and producer',
    dominantGrapes: ['Riesling', 'Gewurztraminer', 'Pinot Gris'],
    importantGrapes: ['Muscat'],
    notableProducers: notableProducersForGrandCru(name),
    terroir: {
      keySoils: ['site-specific grand cru soils', 'limestone', 'granite', 'marl'],
      climate: ['continental', 'slope exposure', 'Vosges rain shadow'],
      learningPoint:
        'Alsace Grand Cru is a site-focused hierarchy; grape variety, soil, exposure, and producer style strongly shape the wine.',
    },
    tastingProfile: {
      fruit: ['lime', 'stone fruit', 'lychee'],
      nonFruit: ['mineral', 'spice', 'rose', 'petrol with age'],
      structure: ['medium-plus to high acidity', 'aromatic intensity', 'long finish'],
      ageingPotential: 'high for top Riesling, Pinot Gris, and Gewurztraminer examples',
    },
  })),
]

const grandCruPalette = [
  '#d85f73',
  '#f2a65a',
  '#f3df73',
  '#9bc66b',
  '#64b6ac',
  '#6a9edb',
  '#9b6bd3',
  '#d7839a',
]

const northernGrandCruNames = [
  'Steinklotz',
  'Altenberg de Bergbieten',
  'Engelberg',
  'Altenberg de Wolxheim',
  'Bruderthal',
  'Kirchberg de Barr',
  'Zotzenberg',
  'Wiebelsberg',
  'Kastelberg',
  'Moenchberg',
  'Muenchberg',
  'Winzenberg',
  'Frankstein',
  'Praelatenberg',
  'Gloeckelberg',
]

const centralGrandCruNames = [
  'Altenberg de Bergheim',
  'Kanzlerberg',
  'Kirchberg de Ribeauvillé',
  'Osterberg',
  'Geisberg',
  'Rosacker',
  'Schoenenbourg',
  'Froehn',
  'Sonnenglanz',
  'Sporen',
  'Mandelberg',
  'Furstentum',
  'Schlossberg',
  'Marckrain',
  'Mambourg',
  'Kaefferkopf',
  'Wineck-Schlossberg',
  'Sommerberg',
  'Florimont',
  'Brand',
  'Hengst',
]

const southernGrandCruNames = [
  'Steingrubler',
  'Pfersigberg',
  'Eichberg',
  'Hatschbourg',
  'Goldert',
  'Steinert',
  'Zinnkoepfle',
  'Vorbourg',
  'Pfingstberg',
  'Spiegel',
  'Kessler',
  'Saering',
  'Kitterlé',
  'Ollwiller',
  'Rangen',
]

const alsaceColors = Object.fromEntries(
  appellations.map((appellation, index) => [
    appellation.id,
    appellation.id === 'alsace'
      ? '#d9d96a'
      : appellation.id === 'cremant-d-alsace'
        ? '#8fc7d8'
        : grandCruPalette[index % grandCruPalette.length],
  ]),
)

const legendGroups = [
  {
    title: 'Alsace / Regional',
    ids: ['alsace', 'cremant-d-alsace'],
  },
  {
    title: 'Alsace / Northern Grand Cru',
    ids: grandCruIds(northernGrandCruNames),
  },
  {
    title: 'Alsace / Central Grand Cru',
    ids: grandCruIds(centralGrandCruNames),
  },
  {
    title: 'Alsace / Southern Grand Cru',
    ids: grandCruIds(southernGrandCruNames),
  },
]

export function AlsacePage() {
  return (
    <StudyRegionMapPage
      appellations={appellations}
      colors={alsaceColors}
      detailDataPath="/data/france/alsace/alsace-display-2026.geojson"
      emptyCardTitle="Alsace AOC Map"
      hullDataPath="/data/france/alsace/alsace-display-hulls-2026.geojson"
      labelMinZoom={9.15}
      legendAriaLabel="Alsace appellation legend"
      legendFitMaxZoomById={{ alsace: 7.8 }}
      legendGroups={legendGroups}
      sharedGeometryIds={{ 'cremant-d-alsace': 'alsace' }}
      sourceBadge="INAO/data.gouv.fr Alsace AOC viticole parcel delimitation extract. Online data are informational; official plans remain with town halls or INAO."
    />
  )
}

function slug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function grandCruIds(names: string[]) {
  return names.map((name) => slug(`Alsace grand cru ${name}`))
}

function notableProducersForGrandCru(name: string) {
  return notableGrandCruProducers[name] ?? []
}
