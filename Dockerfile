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
gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/atom+xml image/svg+xml;

# Upstream configuration for better error handling
upstream app {
    server 127.0.0.1:8080;
}

server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Security headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Healthcheck endpoint
    location /healthz {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }

    # Long cache for hashed assets (JS, CSS with content hashes in filenames)
    location ~* \.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|ico|webp)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Special handling for .pmtiles (PMTiles format with Range request support)
    location ~* \.pmtiles$ {
        types {
            application/vnd.pmtiles pmtiles;
        }
        add_header Accept-Ranges bytes;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # No cache for HTML, sitemap, and robots (always check for updates)
    location ~* \.(html|xml|txt)$ {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # Root location - try prerendered HTML first, then SPA fallback
    location / {
        # Try the exact file, then with /index.html suffix, then fall back to SPA
        try_files \$uri \$uri/index.html /index.html;
    }

    # Specific handlers for sitemap and robots
    location = /sitemap.xml {
        try_files \$uri =404;
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location = /robots.txt {
        try_files \$uri =404;
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
EOF

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Run nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
