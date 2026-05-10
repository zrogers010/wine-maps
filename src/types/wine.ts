export type AppellationId =
  | 'medoc'
  | 'haut-medoc'
  | 'saint-estephe'
  | 'pauillac'
  | 'saint-julien'
  | 'margaux'
  | 'moulis-en-medoc'
  | 'listrac-medoc'
  | 'entre-deux-mers'
  | 'entre-deux-mers-haut-benauge'
  | 'cadillac'
  | 'cotes-de-bordeaux-cadillac'
  | 'loupiac'
  | 'sainte-croix-du-mont'
  | 'premieres-cotes-de-bordeaux'
  | 'cotes-de-bordeaux-saint-macaire'
  | 'graves-de-vayres'
  | 'saint-emilion'
  | 'pomerol'
  | 'lalande-de-pomerol'
  | 'fronsac'
  | 'canon-fronsac'
  | 'montagne-saint-emilion'
  | 'lussac-saint-emilion'
  | 'puisseguin-saint-emilion'
  | 'saint-georges-saint-emilion'
  | 'pessac-leognan'
  | 'graves'
  | 'graves-superieures'
  | 'sauternes'
  | 'barsac'
  | 'cerons'

export type StudyLevel = 'Curious' | 'Advanced'

export type ExperienceMode = 'Explore' | 'Study' | 'Blind Tasting' | 'Compare'

export type LayerKey =
  | 'aocBoundaries'
  | 'vineyardParcels'
  | 'roadsBasemap'
  | 'rivers'
  | 'grapeEmphasis'
  | 'studyLabels'

export type LayerState = Record<LayerKey, boolean>

export interface FilterState {
  dominantGrape: string
  wineStyle: string
  bank: string
  subregion: string
  studyLevel: StudyLevel
}

export interface TerroirNotes {
  keySoils: string[]
  climate: string[]
  learningPoint: string
}

export interface TastingProfile {
  fruit: string[]
  nonFruit: string[]
  structure: string[]
  ageingPotential: string
}

export interface AppellationMetadata {
  id: AppellationId
  name: string
  country: string
  region: string
  subregion: string
  bank: string
  aocType: string
  primaryStyle: string
  dominantGrapes: string[]
  importantGrapes: string[]
  authorizedGrapesNote: string
  officialRulesNote: string
  commonPracticeNote: string
  classificationContext?: string
  terroir: TerroirNotes
  tastingProfile: TastingProfile
  examNotes: string[]
  notableChateaux?: string[]
  neighborComparisons: Partial<Record<AppellationId, string>>
}

export interface ChateauPoint {
  id: string
  name: string
  appellationId: AppellationId
  classificationNote: string
  coordinates: [number, number]
}

export interface AppellationFeatureProperties {
  id: AppellationId
  name: string
  aocType: string
  subregion: string
  bank: string
  primaryStyle: string
  dominantGrape: string
  placeholder: boolean
  dataStatus: string
}
