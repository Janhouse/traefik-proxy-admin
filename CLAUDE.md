# Traefik Dynamic Proxy Admin Panel

This is a comprehensive admin panel for managing Traefik dynamic configurations with authentication support including shared links and SSO integration.

## Project Overview

**Purpose**: Provides a web-based admin interface for dynamically configuring Traefik reverse proxy services with authentication and session management.

**Tech Stack**:
- Next.js 15 with App Router and TypeScript
- Drizzle ORM with PostgreSQL database
- shadcn/ui component library
- Tailwind CSS with dark mode support
- Docker Compose for PostgreSQL

## Key Features

### Dynamic Service Management
- CRUD operations for proxy services (IP, port, subdomain configuration)
- Real-time Traefik configuration generation via HTTP provider
- Configurable global domain settings (e.g., `exposed.example.com` where services become `subdomain.basedomain`)
- Wildcard certificate support to prevent service name leakage in Certificate Transparency logs

### Authentication Methods
- **None**: Public access without authentication
- **Shared Links**: Time-limited, one-use links with configurable session duration
- **SSO Integration**: OAuth2/OIDC with group/user authorization

### Session Management
- Memory-cached sessions with database persistence for performance
- Admin interface for viewing and managing active sessions
- Real-time session validation for Traefik forward-auth
- Automatic cleanup of expired sessions

### Global Configuration
- Configurable base domain for all services
- Certificate resolver configuration for DNS challenge mode
- Global and per-service middleware management with proper ordering

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

## Database Schema

### Key Tables
- **services**: Service configurations with auth methods and middleware settings
- **shared_links**: Time-limited authentication links
- **sessions**: Active user sessions with memory caching
- **app_config**: Global application configuration

## API Endpoints

### Traefik Integration
- `GET /api/traefik/config` - Dynamic Traefik configuration endpoint

### Service Management
- `GET /api/services` - List all services
- `POST /api/services` - Create new service
- `PUT /api/services/[id]` - Update service
- `DELETE /api/services/[id]` - Delete service

### Authentication & Sessions
- `GET /api/auth/verify` - Forward-auth endpoint for Traefik
- `GET /api/sessions` - List active sessions
- `DELETE /api/sessions` - Delete all sessions

### Global Configuration
- `GET /api/config` - Get global Traefik configuration
- `PUT /api/config` - Update global configuration

## Development Commands

```bash
# Database operations
pnpm db:generate    # Generate new migration
pnpm db:push        # Push schema changes
pnpm db:studio      # View database in Drizzle Studio

# Development
pnpm dev           # Start development server
pnpm build         # Build for production
pnpm lint          # Run linting
```

## Important Files

### Core Configuration
- `lib/traefik-config.ts` - Traefik configuration generation logic
- `lib/app-config.ts` - Global configuration management
- `lib/session-manager.ts` - Session management with memory caching
- `db/schema.ts` - Database schema definitions

### API Routes
- `app/api/traefik/config/route.ts` - Traefik configuration endpoint
- `app/api/services/` - Service CRUD operations
- `app/api/auth/verify/route.ts` - Forward-auth validation
- `app/api/config/route.ts` - Global configuration management

### UI Components
- `app/page.tsx` - Main admin panel with service management
- `app/config/page.tsx` - Global configuration page
- `app/sessions/page.tsx` - Session management interface
- `components/confirm-dialog.tsx` - Reusable confirmation dialogs
- `components/unsaved-changes-guard.tsx` - Unsaved changes protection

## Security Features

- All authentication tokens stored securely with httpOnly cookies
- CSRF protection through state parameters in SSO flows
- Session tokens are cryptographically secure random values
- Forward-auth validation prevents unauthorized access
- Automatic session cleanup prevents token accumulation

## Deployment

The application requires:
1. PostgreSQL database
2. Environment variables for database connection and SSO configuration
3. Traefik configured to use the HTTP provider endpoint

See README.md for detailed setup instructions.

## Configuration Examples

### Global Configuration
```json
{
  "baseDomain": "exposed.example.com",
  "certResolver": "letsencrypt-dns",
  "globalMiddlewares": ["compression", "security-headers", "rate-limit"]
}
```

This creates services accessible as `{service}.exposed.example.com` with wildcard certificates and standard security middlewares.

### Traefik Provider Configuration
```yaml
providers:
  http:
    endpoints:
      - "http://localhost:3000/api/traefik/config"
    pollInterval: "10s"
```

This configures Traefik to poll the admin panel for dynamic configuration updates.

Project uses pnpm instead of npm
