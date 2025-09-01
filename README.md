# Traefik Dynamic Proxy Admin Panel

A comprehensive admin panel for managing Traefik dynamic configurations with authentication support including shared links and SSO integration.

## Features

- **Dynamic Traefik Configuration**: Automatically generates Traefik configurations from database
- **Service Management**: Full CRUD operations for proxy services
- **Multiple Authentication Methods**:
  - No authentication
  - Shared links with expiry
  - SSO integration with group/user authorization
- **Session Management**: Memory-cached sessions with admin oversight
- **Real-time Updates**: Live configuration updates for Traefik
- **Modern UI**: Built with Next.js 15, TypeScript, and shadcn/ui

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Admin Panel   │────▶│   PostgreSQL    │     │     Traefik     │
│   (Next.js)     │     │   Database      │     │    Reverse      │
└─────────────────┘     └─────────────────┘     │     Proxy       │
                                                 └─────────────────┘
                                                          │
                              ┌───────────────────────────┘
                              ▼
                        ┌─────────────────┐
                        │  Target Services │
                        │ (HTTP/HTTPS)     │
                        └─────────────────┘
```

## Quick Start

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd traefik-proxy-admin
pnpm install
```

### 2. Set up PostgreSQL

```bash
# Start PostgreSQL with Docker Compose
docker-compose up -d

# Generate and run database migrations
pnpm db:generate
pnpm db:push
```

### 3. Environment Configuration

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 4. Start the Development Server

```bash
pnpm dev
```

The admin panel will be available at `http://localhost:3000`

## Database Schema

### Services Table
- Service configuration (name, subdomain, target IP/port)
- Authentication method (none, shared_link, sso)
- Enable/disable status
- SSO user/group authorization

### Shared Links Table
- One-time or expiring shared links
- Session duration configuration
- Usage tracking

### Sessions Table
- Active user sessions
- Memory-cached for performance
- Automatic cleanup of expired sessions

### App Config Table
- Application-wide configuration
- SSO provider settings
- Global domain and certificate configuration
- Global middleware settings

## API Endpoints

### Traefik Configuration
- `GET /api/traefik/config` - Dynamic Traefik configuration

### Service Management
- `GET /api/services` - List all services
- `POST /api/services` - Create new service
- `PUT /api/services/[id]` - Update service
- `DELETE /api/services/[id]` - Delete service
- `POST /api/services/share-link` - Generate shared link

### Authentication
- `GET /api/auth/verify` - Forward-auth endpoint for Traefik
- `POST /api/auth/shared-link` - Authenticate with shared link
- `GET /api/auth/sso/login` - Initiate SSO login
- `GET /api/auth/sso/callback` - SSO callback handler

### Session Management
- `GET /api/sessions` - List active sessions
- `DELETE /api/sessions` - Delete all sessions
- `DELETE /api/sessions/[id]` - Delete specific session

### Global Configuration
- `GET /api/config` - Get global Traefik configuration
- `PUT /api/config` - Update global configuration

## Global Configuration

The admin panel now supports configurable global settings that affect all services:

### Domain Configuration
- **Base Domain**: Set the root domain (e.g., `exposed.example.com`)
- Services become accessible as `{subdomain}.{baseDomain}`
- Supports wildcard certificates for privacy (no service names in CT logs)

### Certificate Management
- **Cert Resolver**: Configurable Traefik certificate resolver name
- Supports DNS challenge mode for wildcard certificates
- Example: `letsencrypt-dns` for `*.exposed.example.com`

### Middleware Configuration
- **Global Middlewares**: Applied to all services automatically
- **Per-Service Middlewares**: Additional middlewares per service
- Order: Global → Auth (if enabled) → HTTPS redirect → Service-specific

## Traefik Configuration

Configure Traefik to use this service as a configuration provider:

```yaml
# traefik.yml
providers:
  http:
    endpoints:
      - "http://localhost:3000/api/traefik/config"
    pollInterval: "10s"

# Forward authentication
api:
  dashboard: true

entryPoints:
  web:
    address: ":80"
  websecure:
    address: ":443"

# Configure your certificate resolver for wildcard certificates
certificatesResolvers:
  letsencrypt-dns:  # Match this name in admin panel
    acme:
      email: your-email@example.com
      storage: acme.json
      dnsChallenge:
        provider: cloudflare  # Your DNS provider
        delayBeforeCheck: 10
```

### Example Global Configuration
```json
{
  "baseDomain": "exposed.example.com",
  "certResolver": "letsencrypt-dns",
  "globalMiddlewares": ["compression", "security-headers", "rate-limit"]
}
```

This configuration will:
- Make services accessible as `{service}.exposed.example.com`
- Use wildcard certificate `*.exposed.example.com`
- Apply compression, security headers, and rate limiting to all services

## Authentication Methods

### 1. No Authentication
Services are publicly accessible without any authentication.

### 2. Shared Links
- Generate time-limited, one-use links
- Configurable session duration
- Automatic session creation upon link usage

### 3. SSO Integration
- Configurable OAuth2/OIDC providers
- Group and user-based authorization
- Automatic session management

## SSO Configuration

SSO settings are managed through the admin panel and stored in the `app_config` table:

```json
{
  "enabled": true,
  "idpUrl": "https://your-idp.com",
  "clientId": "your-client-id",
  "clientSecret": "your-client-secret",
  "redirectUri": "http://localhost:3000/api/auth/sso/callback",
  "scopes": ["openid", "profile", "groups"]
}
```

## Session Management

- Sessions are stored in PostgreSQL and cached in memory for performance
- Automatic cleanup of expired sessions
- Admin interface for viewing and managing active sessions
- Real-time session validation for Traefik forward-auth

## Development

### Database Commands

```bash
# Generate new migration
pnpm db:generate

# Push schema changes
pnpm db:push

# View database in Drizzle Studio
pnpm db:studio
```

### Project Structure

```
src/
├── components/ui/          # shadcn/ui components
├── db/                    # Database schema and connection
├── lib/                   # Utility functions
│   ├── traefik-config.ts  # Traefik configuration generation
│   ├── session-manager.ts # Session management with memory cache
│   ├── shared-links.ts    # Shared link utilities
│   ├── sso-config.ts      # SSO configuration and handlers
│   └── utils.ts           # General utilities
app/
├── api/                   # API routes
│   ├── services/          # Service CRUD operations
│   ├── sessions/          # Session management
│   ├── traefik/           # Traefik configuration endpoint
│   └── auth/              # Authentication endpoints
├── sessions/              # Session management UI
├── auth/                  # Authentication pages
└── page.tsx               # Main admin panel
```

## Security Considerations

- All authentication tokens are stored securely with httpOnly cookies
- CSRF protection through state parameters in SSO flows
- Session tokens are cryptographically secure random values
- Forward-auth validation prevents unauthorized access
- Automatic session cleanup prevents token accumulation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

[Add your license here]