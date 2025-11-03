# HTTPS Setup for MCP Server

This guide explains how to set up HTTPS with a self-signed certificate for running the MCP server securely, which is required by some tools like Cursor when connecting to remote MCP services.

## Overview

The HTTPS setup uses:
- **Nginx** as a reverse proxy for SSL termination
- **Self-signed certificate** for local development
- **Docker Compose** for orchestration

## Quick Start

### 1. Start HTTPS-Enabled Server

```bash
docker-compose -f docker-compose.https.yml up -d
```

### 2. Verify Setup

```bash
# Check container status
docker-compose -f docker-compose.https.yml ps

# Test HTTPS connection (with self-signed cert)
curl -k https://localhost/health

# Test SSE endpoint
curl -k -N https://localhost/sse
```

### 3. View Logs

```bash
docker-compose -f docker-compose.https.yml logs -f
```

## Architecture

```
┌─────────────────┐
│   Client        │
│  (Cursor, etc)  │
└────────┬────────┘
         │ HTTPS (443)
         ▼
┌─────────────────┐
│  Nginx SSL      │
│  Reverse Proxy  │
└────────┬────────┘
         │ HTTP (3002)
         ▼
┌─────────────────┐
│   MCP Server    │
│  (SSE Backend)  │
└─────────────────┘
```

## Files Created

### SSL Certificates
- `ssl/server.crt` - SSL certificate (valid for 365 days)
- `ssl/server.key` - Private key
- `ssl/openssl.cnf` - Certificate configuration

### Configuration
- `nginx/nginx.conf` - Nginx reverse proxy configuration
- `docker-compose.https.yml` - HTTPS-enabled Docker Compose setup

### Certificate Details
- **CN (Common Name)**: localhost
- **SAN (Subject Alternative Names)**:
  - DNS: localhost, *.localhost
  - IP: 127.0.0.1, ::1
- **Validity**: 365 days from creation
- **Key Size**: 2048-bit RSA

## Trusting the Self-Signed Certificate

Since the certificate is self-signed, you'll need to trust it manually for each tool/browser.

### macOS - Trust Certificate System-Wide

```bash
# Add certificate to system keychain
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ssl/server.crt

# Verify certificate is trusted
security find-certificate -c localhost -a | grep localhost
```

To remove the certificate later:
```bash
sudo security delete-certificate -c localhost
```

### macOS - Trust for Specific Application

If you only want to trust for a specific browser:

**Chrome/Edge:**
1. Visit `https://localhost`
2. Click the "Not Secure" warning
3. Click "Certificate" → "Details" → "Export"
4. Open Keychain Access
5. Import the certificate
6. Double-click the certificate
7. Expand "Trust" section
8. Set "When using this certificate" to "Always Trust"

**Firefox:**
1. Visit `https://localhost`
2. Click "Advanced" → "Accept the Risk and Continue"
3. Or: Settings → Privacy & Security → Certificates → View Certificates → Import

### Linux - Trust Certificate

**Ubuntu/Debian:**
```bash
# Copy certificate
sudo cp ssl/server.crt /usr/local/share/ca-certificates/mcp-localhost.crt

# Update certificate store
sudo update-ca-certificates
```

**Fedora/RHEL:**
```bash
# Copy certificate
sudo cp ssl/server.crt /etc/pki/ca-trust/source/anchors/mcp-localhost.crt

# Update certificate store
sudo update-ca-trust
```

### Windows - Trust Certificate

**PowerShell (Run as Administrator):**
```powershell
# Import certificate to Trusted Root
Import-Certificate -FilePath "ssl\server.crt" -CertStoreLocation Cert:\LocalMachine\Root
```

Or use Certificate Manager:
1. Press `Win + R`, type `certmgr.msc`
2. Right-click "Trusted Root Certification Authorities" → "All Tasks" → "Import"
3. Follow the wizard to import `ssl/server.crt`

## Cursor Configuration

For Cursor (or other remote MCP clients), configure the connection:

```json
{
  "mcpServers": {
    "sequential-thinking-sse": {
      "url": "https://localhost/sse",
      "transport": "sse"
    }
  }
}
```

If Cursor requires certificate validation, ensure the certificate is trusted system-wide (see above).

## Regenerating Certificates

If you need to regenerate certificates (e.g., after expiry):

```bash
# Generate new certificate
openssl req -x509 -newkey rsa:2048 -keyout ssl/server.key -out ssl/server.crt -days 365 -nodes -config ssl/openssl.cnf -extensions v3_req

# Restart services
docker-compose -f docker-compose.https.yml restart nginx-ssl
```

## Custom Domain

To use a custom domain (e.g., `mcp.local` instead of `localhost`):

1. **Update `/etc/hosts`:**
   ```bash
   sudo nano /etc/hosts
   # Add: 127.0.0.1 mcp.local
   ```

2. **Update `ssl/openssl.cnf`:**
   ```ini
   CN = mcp.local
   [alt_names]
   DNS.1 = mcp.local
   DNS.2 = *.mcp.local
   ```

3. **Regenerate certificate** (see above)

4. **Update nginx configuration:**
   ```nginx
   server_name mcp.local;
   ```

5. **Restart services:**
   ```bash
   docker-compose -f docker-compose.https.yml restart
   ```

## Production Considerations

**For production use, consider:**

1. **Use Let's Encrypt** for publicly-trusted certificates:
   ```bash
   docker run -it --rm certbot/certbot certonly --standalone -d your-domain.com
   ```

2. **Update nginx configuration** to use Let's Encrypt certificates

3. **Set up certificate auto-renewal** with certbot cron job

4. **Enable stricter SSL settings** in nginx:
   ```nginx
   ssl_protocols TLSv1.3;
   ssl_prefer_server_ciphers off;
   add_header Strict-Transport-Security "max-age=63072000" always;
   ```

5. **Add authentication** to your MCP endpoints

## Troubleshooting

### Certificate Not Trusted
**Problem:** Browser/tool shows "Not Secure" warning

**Solution:** Follow the "Trusting the Self-Signed Certificate" section for your OS

### Connection Refused
**Problem:** Cannot connect to `https://localhost`

**Solution:**
```bash
# Check if nginx is running
docker-compose -f docker-compose.https.yml ps

# Check nginx logs
docker-compose -f docker-compose.https.yml logs nginx-ssl

# Verify port 443 is not in use
lsof -i :443
```

### SSE Not Working
**Problem:** SSE endpoint connects but doesn't receive events

**Solution:**
```bash
# Check backend server logs
docker-compose -f docker-compose.https.yml logs sequential-thinking-sse

# Verify nginx proxy settings
docker exec mcp-nginx-ssl nginx -t

# Test backend directly (bypassing nginx)
curl http://localhost:3002/sse
```

### Certificate Expired
**Problem:** Certificate shows as expired

**Solution:** Regenerate certificate (see "Regenerating Certificates" above)

## Security Notes

1. **Self-signed certificates are for development only** - Don't use in production
2. **Keep private keys secure** - Never commit `ssl/server.key` to git
3. **Rotate certificates regularly** - Even for development (recommended: every 90 days)
4. **Use strong passwords** - If you add password protection to private keys

## Managing the Service

### Start
```bash
docker-compose -f docker-compose.https.yml up -d
```

### Stop
```bash
docker-compose -f docker-compose.https.yml down
```

### Restart
```bash
docker-compose -f docker-compose.https.yml restart
```

### View Logs
```bash
# All services
docker-compose -f docker-compose.https.yml logs -f

# Specific service
docker-compose -f docker-compose.https.yml logs -f nginx-ssl
docker-compose -f docker-compose.https.yml logs -f sequential-thinking-sse
```

### Check Health
```bash
# Overall status
docker-compose -f docker-compose.https.yml ps

# Test health endpoint
curl -k https://localhost/health

# Test SSE endpoint
curl -k -N https://localhost/sse
```

## Environment Variables

You can customize the setup with environment variables:

```bash
# Change backend port
PORT=3003 docker-compose -f docker-compose.https.yml up -d

# Disable thought logging
DISABLE_THOUGHT_LOGGING=true docker-compose -f docker-compose.https.yml up -d
```

## Next Steps

1. ✅ Certificate created and installed
2. ✅ HTTPS server running on port 443
3. ✅ MCP configuration updated
4. 🔲 Trust certificate on your system (see above)
5. 🔲 Configure Cursor/other tools with HTTPS endpoint
6. 🔲 Test connection from your MCP client

---

For more information, see:
- [Nginx SSL Configuration](https://nginx.org/en/docs/http/configuring_https_servers.html)
- [OpenSSL Certificate Generation](https://www.openssl.org/docs/manmaster/man1/req.html)
- [Model Context Protocol Specification](https://modelcontextprotocol.io)
