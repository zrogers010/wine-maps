# Multi-stage build for SommelierMaps static site
# Stage 1: Build the Vite app
FROM node:20-alpine AS builder

# Install build dependencies
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --prefer-offline --no-audit

# Copy source code
COPY . .

# Build argument for optional Google Analytics
ARG VITE_GA_MEASUREMENT_ID
ENV VITE_GA_MEASUREMENT_ID=${VITE_GA_MEASUREMENT_ID}

# Build the app (includes prerendering)
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:1.27-alpine

# Copy custom nginx configuration
COPY <<EOF /etc/nginx/conf.d/default.conf
# Gzip compression
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/atom+xml application/geo+json image/svg+xml;

# Map GeoJSON files to proper MIME type
map \$uri \$geojson_type {
    ~*\.geojson\$ application/geo+json;
    default "";
}

server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Healthcheck endpoint
    location /healthz {
        access_log off;
        default_type text/plain;
        return 200 "healthy\n";
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-XSS-Protection "1; mode=block" always;
    }

    # Long cache for hashed assets only (JS/CSS in /assets/ with content hashes)
    location ^~ /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-XSS-Protection "1; mode=block" always;
        access_log off;
    }

    # Runtime data files (GeoJSON) with strict 404 for missing files
    # 1-hour cache with revalidation (filenames are not content-hashed)
    location /data/ {
        types {
            application/geo+json geojson;
        }
        try_files \$uri =404;
        add_header Cache-Control "public, max-age=3600, must-revalidate";
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-XSS-Protection "1; mode=block" always;
    }

    # PMTiles with Range request support (for future vector tiles)
    location ~* \.pmtiles\$ {
        types {
            application/vnd.pmtiles pmtiles;
        }
        add_header Accept-Ranges bytes;
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-XSS-Protection "1; mode=block" always;
    }

    # Sitemap and robots with no-cache
    location = /sitemap.xml {
        try_files \$uri =404;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-XSS-Protection "1; mode=block" always;
    }

    location = /robots.txt {
        try_files \$uri =404;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-XSS-Protection "1; mode=block" always;
    }

    # Root location - try prerendered HTML first, then SPA fallback
    # All HTML (including SPA index.html) gets no-cache
    location / {
        try_files \$uri \$uri/index.html /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-XSS-Protection "1; mode=block" always;
    }
}
EOF

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Run nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
