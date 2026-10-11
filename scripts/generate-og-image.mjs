#!/usr/bin/env node
/**
 * Generate a simple default OG image SVG (1200x630px)
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outputDir = path.resolve(__dirname, '../public/images')

// SVG template
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <!-- Background gradient -->
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#ead9bd;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#fbf2df;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <rect width="1200" height="630" fill="url(#bg)"/>
  
  <!-- Wine-colored accent -->
  <circle cx="200" cy="120" r="80" fill="#8d2439" opacity="0.15"/>
  <circle cx="1000" cy="500" r="120" fill="#8d2439" opacity="0.1"/>
  
  <!-- Title -->
  <text x="600" y="240" font-family="Georgia, serif" font-size="72" font-weight="bold" fill="#5a1022" text-anchor="middle">
    SommelierMaps
  </text>
  
  <!-- Tagline -->
  <text x="600" y="320" font-family="Arial, sans-serif" font-size="32" fill="#5b4c4f" text-anchor="middle">
    Interactive Wine Region Maps
  </text>
  
  <text x="600" y="370" font-family="Arial, sans-serif" font-size="32" fill="#5b4c4f" text-anchor="middle">
    for WSET Study
  </text>
  
  <!-- Footer -->
  <text x="600" y="540" font-family="Arial, sans-serif" font-size="22" fill="#80696e" text-anchor="middle">
    Bordeaux · Burgundy · Champagne · Alsace
  </text>
</svg>`

// Write SVG
fs.mkdirSync(outputDir, { recursive: true })
const svgPath = path.join(outputDir, 'og-default.svg')
fs.writeFileSync(svgPath, svg)

console.log('✅ Generated og-default.svg at', svgPath)
console.log('ℹ️  Convert to PNG (1200x630px) for production use')
console.log('ℹ️  For now, using SVG as fallback OG image')
