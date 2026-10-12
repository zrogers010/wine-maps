# AWS Copilot Deployment Configuration

This directory contains the AWS Copilot configuration for deploying SommelierMaps as a containerized static site.

## Structure

```
copilot/
  web/
    manifest.yml    # Service configuration for the Load Balanced Web Service
```

## Quick Start

See the full deployment runbook at [`../scripts/deploy.md`](../scripts/deploy.md).

## Service: web

- **Type**: Load Balanced Web Service
- **Runtime**: Nginx serving prerendered static site
- **Size**: 0.25 vCPU, 512 MB RAM
- **Scaling**: 1 task (no auto-scaling)
- **Health Check**: `/healthz`
- **Custom Domains**: www.sommeliermaps.com (canonical), sommeliermaps.com

## Build Process

The Dockerfile uses a multi-stage build:

1. **Builder stage**: Node.js 20 Alpine
   - Install npm dependencies
   - Run `npm run build` (includes TypeScript compilation, Vite build, and prerendering)
   - Generate sitemap.xml and robots.txt

2. **Runtime stage**: Nginx 1.27 Alpine
   - Copy built static assets from builder
   - Configure nginx for:
     - Prerendered route serving (route/index.html)
     - SPA fallback
     - Long cache for hashed assets
     - No cache for HTML/sitemap/robots
     - gzip compression
     - `/healthz` endpoint
     - PMTiles MIME type and Range request support

## Environment Variables

### Build-time

- `VITE_GA_MEASUREMENT_ID` (optional): Google Analytics 4 measurement ID
  - Pass via `--build-arg` during deployment
  - Analytics disabled if not set or empty

### Runtime

No runtime environment variables are needed (static site).

## DNS Configuration

DNS is managed in **DigitalOcean**, not Route53. The ACM certificate must use DNS validation.

After deployment, create CNAME records in DigitalOcean pointing to the ALB DNS name.

See the full runbook for detailed DNS setup instructions.
