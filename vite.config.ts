import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

/**
 * Serve /tiles/* from ./tiles at project root with HTTP Range support for PMTiles
 * and symlink resolution for Mac dev layout
 */
function tileServerPlugin(): Plugin {
  return {
    name: 'tile-server',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/tiles/')) {
          return next()
        }

        const projectRoot = process.cwd()
        const filePath = path.join(projectRoot, req.url)

        // Follow symlinks (realpath resolves them)
        let realPath: string
        try {
          realPath = fs.realpathSync(filePath)
        } catch {
          res.statusCode = 404
          res.end('Not found')
          return
        }

        // Check file exists
        if (!fs.existsSync(realPath) || !fs.statSync(realPath).isFile()) {
          res.statusCode = 404
          res.end('Not found')
          return
        }

        const stat = fs.statSync(realPath)
        const fileSize = stat.size
        const ext = path.extname(realPath)

        // Content type
        const contentTypes: Record<string, string> = {
          '.pmtiles': 'application/vnd.pmtiles',
          '.json': 'application/json',
        }
        res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream')
        res.setHeader('Accept-Ranges', 'bytes')

        // Handle Range requests (required for PMTiles)
        const rangeHeader = req.headers.range
        if (rangeHeader) {
          const [unit, range] = rangeHeader.split('=')
          if (unit !== 'bytes') {
            res.statusCode = 416
            res.end('Range Not Satisfiable')
            return
          }

          const [startStr, endStr] = range.split('-')
          const start = parseInt(startStr, 10)
          const end = endStr ? parseInt(endStr, 10) : fileSize - 1

          if (start >= fileSize || end >= fileSize || start > end) {
            res.statusCode = 416
            res.setHeader('Content-Range', `bytes */${fileSize}`)
            res.end('Range Not Satisfiable')
            return
          }

          res.statusCode = 206
          res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`)
          res.setHeader('Content-Length', String(end - start + 1))

          const stream = fs.createReadStream(realPath, { start, end })
          stream.pipe(res)
        } else {
          // Full file
          res.statusCode = 200
          res.setHeader('Content-Length', String(fileSize))
          fs.createReadStream(realPath).pipe(res)
        }
      })
    },
    configurePreviewServer(server) {
      // Same middleware for preview server
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/tiles/')) {
          return next()
        }

        const projectRoot = process.cwd()
        const filePath = path.join(projectRoot, req.url)

        let realPath: string
        try {
          realPath = fs.realpathSync(filePath)
        } catch {
          res.statusCode = 404
          res.end('Not found')
          return
        }

        if (!fs.existsSync(realPath) || !fs.statSync(realPath).isFile()) {
          res.statusCode = 404
          res.end('Not found')
          return
        }

        const stat = fs.statSync(realPath)
        const fileSize = stat.size
        const ext = path.extname(realPath)

        const contentTypes: Record<string, string> = {
          '.pmtiles': 'application/vnd.pmtiles',
          '.json': 'application/json',
        }
        res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream')
        res.setHeader('Accept-Ranges', 'bytes')

        const rangeHeader = req.headers.range
        if (rangeHeader) {
          const [unit, range] = rangeHeader.split('=')
          if (unit !== 'bytes') {
            res.statusCode = 416
            res.end('Range Not Satisfiable')
            return
          }

          const [startStr, endStr] = range.split('-')
          const start = parseInt(startStr, 10)
          const end = endStr ? parseInt(endStr, 10) : fileSize - 1

          if (start >= fileSize || end >= fileSize || start > end) {
            res.statusCode = 416
            res.setHeader('Content-Range', `bytes */${fileSize}`)
            res.end('Range Not Satisfiable')
            return
          }

          res.statusCode = 206
          res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`)
          res.setHeader('Content-Length', String(end - start + 1))

          const stream = fs.createReadStream(realPath, { start, end })
          stream.pipe(res)
        } else {
          res.statusCode = 200
          res.setHeader('Content-Length', String(fileSize))
          fs.createReadStream(realPath).pipe(res)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tileServerPlugin()],
})
