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

## React Form State Best Practices

This project has encountered recurring issues with form components (especially Select dropdowns) not displaying their selected values correctly. Based on fixes applied in commits `4552b2a` (Fix auto disable selection) and `2d2c181` (Host header override), follow these patterns to prevent form state issues:

### Common Form State Problems

1. **Select Components Not Showing Selected Values**: Dropdowns appear blank even when form data has correct values
2. **Race Conditions**: Form initializes before data is loaded, causing mismatched state
3. **Value Type Mismatches**: UI expects strings, backend provides null/undefined, causing rendering issues

### Proven Solutions

#### 1. Use `useCallback` for Default Data Creation

**❌ Wrong:**
```typescript
const defaultFormData: ServiceFormData = {
  name: "",
  enableDurationMinutes: defaultDuration || null,
  domainId: "",
};
```

**✅ Correct:**
```typescript
const getDefaultFormData = useCallback((): ServiceFormData => ({
  name: "",
  enableDurationMinutes: defaultDuration ?? null,  // Use ?? instead of ||
  domainId: "",
}), [defaultDuration]);  // Include dependencies
```

#### 2. Handle Select Component Value Mapping

**❌ Wrong:**
```typescript
<Select
  value={formData.enableDurationMinutes?.toString() || "null"}
  onValueChange={(value) => {
    const duration = value === "null" ? null : parseInt(value);
    setFormData({ ...formData, enableDurationMinutes: duration });
  }}
>
```

**✅ Correct:**
```typescript
<Select
  value={formData.enableDurationMinutes === null || isNaN(formData.enableDurationMinutes as number)
    ? "forever"
    : formData.enableDurationMinutes?.toString() || "forever"}
  onValueChange={(value) => {
    // Ignore empty string changes - spurious event from Select component
    if (value === "") {
      return;
    }

    let duration: number | null;
    if (value === "forever") {
      duration = null;
    } else {
      const parsed = parseInt(value);
      duration = isNaN(parsed) ? null : parsed;
    }
    setFormData({ ...formData, enableDurationMinutes: duration });
  }}
>
```

#### 3. Handle Async Data Dependencies

**❌ Wrong:**
```typescript
<Select
  value={formData.domainId}
  disabled={submitting}
>
```

**✅ Correct:**
```typescript
<Select
  value={formData.domainId || ""}
  disabled={submitting || domains.length === 0}  // Disable until data loads
  onValueChange={(value) => {
    // Ignore spurious empty string events
    if (value === "") {
      return;
    }
    updateFormData({ domainId: value });
  }}
>
```

### Key Principles

1. **Always handle empty string events**: Select components emit spurious `""` values, ignore them
2. **Map null/undefined to UI-friendly strings**: Use "forever", "none", etc. for display
3. **Use `??` instead of `||`**: Proper null coalescing prevents `0` and `false` issues
4. **Disable components during loading**: Prevent interaction until required data is available
5. **Use proper dependencies in useCallback/useEffect**: Ensure fresh data when dependencies change
6. **Handle async timing**: Don't assume data is available when components render

### Testing Form State

Always test these scenarios:
- Fresh page load (new item creation)
- Edit existing items (form population)
- Data loading states (async dependencies)
- Edge cases (null, undefined, empty string values)

Following these patterns will prevent the recurring form state issues this project has experienced.
