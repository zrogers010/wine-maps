# SommelierMaps Region Template

This document locks the current Bordeaux / Médoc map style and interaction
model as the template for future regions.

## Current Baseline

The first supported geography is:

- Country: France
- Wine region: Bordeaux
- Subregion / bank: Médoc / Left Bank
- Appellation layer: Médoc AOC family, including commune AOCs
- Commune layer: INAO source commune / INSEE feature grouping
- Producer points: curated notable château locations

The second supported geography is Bordeaux / Entre-Deux-Mers on the same map,
with its own top-right legend group and distinct top-left card metadata.

Saint-Émilion and other Right Bank areas should be added as additional Bordeaux
region groups, not as part of the Médoc or Entre-Deux-Mers legends.

## Visual Style

- Keep the app map-first: white/light background, no marketing shell.
- Use a clean land/sea basemap with bright water and low visual noise.
- Use distinct pastel appellation fills with thin internal parcel/commune lines.
- Keep appellation labels above château dots and château labels.
- Appellation labels should use collision-aware placement. Do not force labels to
  overlap just to show every name at once; smaller text or placement fallback is
  preferred.
- Keep château dots small and secondary to appellation names.
- At close zooms, let AOC fills fade slightly, but never enough to lose color.
- Avoid thick borders; use subtle boundaries plus hover emphasis.

## Zoom-Level Geometry

- Use two display levels for region groups where the raw source is visually too
  fragmented at atlas zoom.
- Low zoom: render a filled, non-overlapping outer hull for each appellation.
- Transition zoom: crossfade the hulls out and detailed source geometry in.
- Close zoom: detailed AOC/commune parcel geometry becomes the active hover
  target.
- Legend hover should shade the low-zoom hull when hull mode is active, not the
  detailed parcel fragments underneath.
- Keep the exact/source-derived display data available for close zoom and for
  provenance; hulls are cartographic display helpers, not official boundaries.

## Interaction Model

- Hovering a map feature highlights the exact parcel under the cursor.
- Hovering a map feature shades its commune darkest.
- Hovering a map feature shades its appellation medium-dark for context.
- Hovering the legend shades the whole appellation and shows the region card.
- Legend hover should not invent a commune; it is appellation-level context.
- The top-left card should stay compact and geography-focused.
- Each major geography gets its own top-right legend section while staying on
  the same map.

## Top-Left Card Format

The card should show:

- Region / subregion kicker.
- Appellation name.
- Appellation type and wine style.
- Geography hierarchy rows:
  - Appellation / AOC
  - Commune in source data
- Key wine-study facts.
- Notable châteaux at the bottom only when relevant.

For direct map hover, notable châteaux should only show when the hovered commune
contains curated château points. For legend hover, notable châteaux should list
all curated château points in that appellation.

## Data Model

Each region group should have:

- A runtime display GeoJSON in `public/data`.
- A raw/source extract script when official source data needs processing.
- A local metadata JSON file for appellation study content.
- Optional curated producer/château points.
- Stable app-facing IDs, separate from source data IDs.
- A distinct legend group title and ordering.

Use official or clearly sourced boundary data where possible. If placeholder
data is needed, mark it clearly and avoid fake precision.

## Expansion Path

Recommended order:

1. Finish Bordeaux / Médoc.
2. Add remaining Bordeaux areas:
   - Graves / Pessac-Léognan
   - Sauternes / Barsac
   - Saint-Émilion and satellites
   - Pomerol
   - Entre-Deux-Mers
   - Côtes de Bordeaux
3. Add other French regions:
   - Burgundy
   - Champagne
   - Rhône
   - Loire
   - Alsace
   - Provence
4. Add other countries after the France data model feels stable.

Each new area should preserve this style and interaction model unless there is a
strong cartographic reason to adapt it.
