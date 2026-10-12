# AWS Copilot Deployment Runbook for SommelierMaps

This runbook covers deploying the SommelierMaps static site as an AWS Copilot application with a Load Balanced Web Service.

## Prerequisites

1. **AWS CLI** configured with credentials for your target account
2. **AWS Copilot CLI** installed ([installation guide](https://aws.github.io/copilot-cli/docs/getting-started/install/))
3. **Docker** installed and running locally
4. **DigitalOcean DNS** access for DNS record creation

## Configuration

- **App name**: `sommeliermaps`
- **Environment**: `prod`
- **Service name**: `web`
- **Region**: `us-east-1`
- **Domains**: `www.sommeliermaps.com` (canonical), `sommeliermaps.com`

## Step 1: Initialize the Copilot Application

First time only - creates the application structure:

```bash
# From the project root directory
copilot app init sommeliermaps
```

This creates:
- A Copilot application named `sommeliermaps`
- An S3 bucket for Copilot state
- ECR repositories for container images

## Step 2: Initialize and Deploy the Environment

Create the `prod` environment with networking infrastructure:

```bash
copilot env init \
  --name prod \
  --profile default \
  --region us-east-1
```

Deploy the environment (VPC, subnets, ALB, etc.):

```bash
copilot env deploy --name prod
```

This creates:
- VPC with public subnets
- Application Load Balancer
- Security groups
- CloudFormation stacks

**Note**: Environment deployment takes 5-10 minutes.

## Step 3: Import or Create ACM Certificate

Since DNS is managed in DigitalOcean (not Route53), the certificate must use **DNS validation**.

### Option A: Create Certificate via AWS Console

1. Go to **ACM** in the AWS Console (us-east-1 region)
2. Click **Request a certificate**
3. Choose **Public certificate**
4. Add domain names:
   - `www.sommeliermaps.com`
   - `sommeliermaps.com`
5. Choose **DNS validation**
6. Click **Request**
7. Note the certificate ARN (e.g., `arn:aws:acm:us-east-1:123456789012:certificate/...`)

### Option B: Create Certificate via AWS CLI

```bash
aws acm request-certificate \
  --domain-name www.sommeliermaps.com \
  --subject-alternative-names sommeliermaps.com \
  --validation-method DNS \
  --region us-east-1
```

Note the certificate ARN from the output.

### Validate the Certificate

1. In ACM, click on the certificate
2. Expand the domain validation sections
3. For each domain, note the CNAME record name and value
4. Go to **DigitalOcean DNS** for `sommeliermaps.com`
5. Add the CNAME validation records:
   ```
   Type: CNAME
   Name: _<validation-hash>.www.sommeliermaps.com
   Value: _<validation-hash>.acm-validations.aws.
   
   Type: CNAME
   Name: _<validation-hash>.sommeliermaps.com
   Value: _<validation-hash>.acm-validations.aws.
   ```
6. Wait for validation (can take 5-30 minutes)
7. Verify the certificate status is **Issued** in ACM

## Step 4: Configure Custom Domain in Manifest

Edit `copilot/web/manifest.yml` and uncomment the certificate configuration:

```yaml
environments:
  prod:
    http:
      alias:
        - name: www.sommeliermaps.com
          certificate_arn: arn:aws:acm:us-east-1:123456789012:certificate/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        - name: sommeliermaps.com
          certificate_arn: arn:aws:acm:us-east-1:123456789012:certificate/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Replace the `certificate_arn` values with your actual ARN (same ARN for both domains if they're in the same certificate).

## Step 5: Deploy the Web Service

### First Deployment

```bash
# Deploy without Google Analytics (optional)
copilot svc deploy \
  --name web \
  --env prod
```

### Deploy with Google Analytics

If you have a GA4 measurement ID:

```bash
# Set the build arg for Google Analytics
export VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX

copilot svc deploy \
  --name web \
  --env prod \
  --build-arg VITE_GA_MEASUREMENT_ID=${VITE_GA_MEASUREMENT_ID}
```

**Note**: 
- If `VITE_GA_MEASUREMENT_ID` is not set or empty, analytics will be disabled
- This is safe - the site works without analytics
- First deployment takes 10-15 minutes

### Deployment Process

The deploy command will:
1. Build the Docker image locally (or via CodeBuild if configured)
2. Push to ECR
3. Create/update the ECS service
4. Create/update the ALB target group
5. Configure health checks
6. Deploy the container

## Step 6: Configure DNS Records

After successful deployment, get the ALB DNS name:

```bash
copilot svc show --name web --env prod
```

Look for the ALB endpoint (e.g., `somme-Publi-XXXXX.us-east-1.elb.amazonaws.com`).

### Add DNS Records in DigitalOcean

1. Go to **DigitalOcean → Networking → Domains** → `sommeliermaps.com`
2. Add the following records:

   **For www (canonical)**:
   ```
   Type: CNAME
   Hostname: www
   Value: <your-alb-dns-name> (e.g., somme-Publi-XXXXX.us-east-1.elb.amazonaws.com)
   TTL: 3600
   ```

   **For apex domain**:
   
   DigitalOcean supports ALIAS-like behavior for apex domains:
   ```
   Type: A (with ALIAS support if available)
   Hostname: @
   Value: <resolve ALB IP or use CNAME flattening>
   TTL: 3600
   ```
   
   If DigitalOcean doesn't support apex ALIAS:
   - Option 1: Use DigitalOcean's apex CNAME flattening (if supported)
   - Option 2: Set up a redirect service from apex to www
   - Option 3: Resolve the ALB IPs manually (not recommended - IPs can change)

3. Wait for DNS propagation (5-60 minutes)

## Step 7: Verify Deployment

Test the deployment:

```bash
# Health check
curl https://www.sommeliermaps.com/healthz
# Should return: healthy

# Home page
curl -I https://www.sommeliermaps.com/
# Should return: 200 OK

# Prerendered route
curl -I https://www.sommeliermaps.com/bordeaux
# Should return: 200 OK

# Sitemap
curl https://www.sommeliermaps.com/sitemap.xml
# Should return: XML sitemap

# Robots
curl https://www.sommeliermaps.com/robots.txt
# Should return: robots.txt content
```

### Browser Testing

1. Visit `https://www.sommeliermaps.com/`
2. Check that it loads correctly
3. Navigate to a region (e.g., `/bordeaux`)
4. Navigate to an appellation (e.g., `/bordeaux/pauillac`)
5. Verify prerendered content is served (check page source)

## Subsequent Deployments

For code updates:

```bash
# Standard deployment
copilot svc deploy --name web --env prod

# With updated GA ID
copilot svc deploy --name web --env prod --build-arg VITE_GA_MEASUREMENT_ID=G-NEWID
```

## Monitoring and Logs

### View service status

```bash
copilot svc status --name web --env prod
```

### View logs

```bash
# Stream logs
copilot svc logs --name web --env prod --follow

# Recent logs
copilot svc logs --name web --env prod --since 1h
```

### View service details

```bash
copilot svc show --name web --env prod
```

## Troubleshooting

### Build fails with missing data files

The build requires JSON files under `src/data/` but excludes large geospatial files (`.geojson`, `.pmtiles`, etc.) via `.dockerignore`.

**If the build fails**:
1. Check which JSON files are required: `src/data/regions.json`, `src/data/france/{region}/appellations.json`
2. Ensure these JSON files are committed to git
3. Large data files under `data/raw/` and `public/data/` are intentionally excluded

### Container fails health check

Check logs for errors:
```bash
copilot svc logs --name web --env prod
```

Verify healthcheck locally:
```bash
docker build -t sommeliermaps-test .
docker run -p 8080:80 sommeliermaps-test
curl http://localhost:8080/healthz
```

### Certificate validation stuck

- Verify CNAME records are correct in DigitalOcean
- Check for typos in the record names and values
- Wait up to 30 minutes for DNS propagation
- Validation records must be exact matches (including trailing dots)

### Custom domain not working

1. Verify certificate is **Issued** in ACM
2. Check DNS records are correct in DigitalOcean
3. Wait for DNS propagation (use `dig www.sommeliermaps.com` to check)
4. Verify ALB listener rules include the custom domains

## Cost Estimates

Approximate monthly costs for this configuration:

- **ALB**: ~$20/month (730 hours)
- **ECS Fargate**: ~$3-5/month (0.25 vCPU, 512 MB, 1 task)
- **ECR**: ~$0-1/month (< 10 GB storage)
- **Data transfer**: Variable (depends on traffic)
- **ACM Certificate**: Free

**Total estimated**: ~$24-30/month

## Cleanup

To delete the entire stack:

```bash
# Delete the service
copilot svc delete --name web --env prod

# Delete the environment
copilot env delete --name prod

# Delete the application
copilot app delete
```

**Warning**: This is irreversible and will delete all resources.

## Notes

1. **Build Data**: The Docker build works from a clean clone because only committed JSON files are needed. Large geospatial source files (`data/raw/`, `public/data/`, `*.geojson`) are gitignored and not required for production builds.

2. **Analytics**: The `VITE_GA_MEASUREMENT_ID` build arg is optional. When omitted or empty, the site works normally but analytics tracking is disabled. This prevents accidentally discarding real analytics data during development.

3. **Canonical URL**: The canonical URL is `www.sommeliermaps.com`. Consider adding a redirect from the apex domain to www at the application level or via CloudFront if needed.

4. **Cache Headers**: The nginx configuration sets appropriate cache headers:
   - Hashed assets (JS/CSS): 1 year cache
   - HTML/sitemap/robots: no-cache
   - PMTiles: 1 year cache with Range request support

5. **PMTiles Support**: The nginx config includes MIME type and Range request support for `.pmtiles` files (for future vector tile datasets).

6. **Environment Variables**: Build-time variables must be passed as `--build-arg`. Runtime environment variables are not needed for static sites.
