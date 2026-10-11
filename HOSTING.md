# Hosting Configuration for SommelierMaps

## Prerendered Routes

This app generates static HTML files for all routes at build time. The build output includes:

```
dist/
  index.html (home page)
  bordeaux/
    index.html (region page)
    pauillac/
      index.html (appellation page)
    saint-julien/
      index.html
    ...
  burgundy/
    index.html
    chablis/
      index.html
    ...
  sitemap.xml
  robots.txt
```

## Hosting Requirements

### Static File Serving

The hosting provider must serve nested `/region/appellation/index.html` files correctly for clean URLs like `/bordeaux/pauillac`.

Most static hosting providers handle this automatically:

- **Vercel**: Works out of the box. No configuration needed.
- **Netlify**: Works out of the box. No configuration needed.
- **GitHub Pages**: Works out of the box. No configuration needed.
- **Cloudflare Pages**: Works out of the box. No configuration needed.
- **AWS S3 + CloudFront**: Requires CloudFront to be configured to append `/index.html` to directory requests.

### Rewrite Rules (if needed)

If your hosting provider requires explicit rewrite rules, use:

**Vercel** (`vercel.json`):
```json
{
  "cleanUrls": true
}
```

**Netlify** (`netlify.toml`):
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

**Apache** (`.htaccess`):
```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

**Nginx**:
```nginx
location / {
  try_files $uri $uri/ $uri/index.html /index.html;
}
```

## Testing Locally

To test the prerendered build locally:

```bash
npm run build
npm run preview
```

Then visit:
- http://localhost:4173/ (home)
- http://localhost:4173/bordeaux (region)
- http://localhost:4173/bordeaux/pauillac (appellation)

## SEO Notes

All routes are prerendered with:
- Unique `<title>` tags
- Meta descriptions
- Canonical URLs
- Open Graph tags
- Twitter Card tags
- Hidden SEO content (H1 + summary) for crawlers

Search engines will index the prerendered HTML without needing JavaScript execution.
