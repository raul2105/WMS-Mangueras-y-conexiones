# Copilot Instructions for WMS-SCMayher

## Global Operational Policy (User-Level, Multi-Project)
- Treat this policy as user-level guidance that must be applied across projects in VS Code, not only this repository.
- Keep operational sync between Jira, GitHub, local environment, and cloud deploy platforms (AWS/GCP).
- Source of truth by context:
  - GitHub: real technical execution state.
  - Jira: progress, priority, and operational tracking.
  - Local: immediate validation/testing and preparation.
  - AWS/GCP: real deployed/runtime state.
- If discrepancies are detected across Jira/GitHub/local/cloud, report them explicitly and state which source is correct for the current context.
- Perform deploy automatically when it is a natural and necessary consequence to complete the task (behavior/config/infrastructure/integration/runtime-impacting changes).
- Do not deploy automatically for minor local-only edits, internal docs, or changes without real runtime impact.
- Before deploy, validate: target environment, impact, security, cost, risk, and consistency.
- After deploy, validate: availability, expected responses, visible errors, runtime health, and alignment with the implemented change.
- Use simple, operational, step-by-step language for AWS/GCP topics unless deep architecture is explicitly requested.
- If critical context is missing or risk/ambiguity is high, stop before sensitive actions and report the blocker clearly.

## Required Output Format for Relevant Tasks
1. Objetivo
2. Pasos para implementarlo
3. Deploy realizado si aplicó
4. Validación posterior
5. Riesgos o cuidados
6. Estado de sincronía entre Jira, GitHub, local y cloud
7. Recomendación práctica

## Project Overview
This is a Warehouse Management System (WMS) for SCMayher, built with Next.js 16, React 19, TypeScript, and Prisma ORM with SQLite. The system manages inventory control and assembly for hoses and connections (mangueras y conexiones).

## Tech Stack
- **Framework**: Next.js 16.1.6 with App Router
- **Language**: TypeScript (strict mode enabled)
- **Database**: Prisma 6.0 with SQLite (file: `prisma/dev.db`)
- **Styling**: Tailwind CSS 4
- **UI Components**: React 19.2.3
- **Additional**: Barcode scanning with @zxing/library

## Project Structure
```
/app              - Next.js App Router pages and layouts
/components       - Reusable React components
/prisma           - Database schema and migrations
  schema.prisma   - Database models (Product, Category, Inventory, etc.)
  seed.cjs        - Database seeding script
/scripts          - Utility scripts (CSV import, etc.)
/lib              - Shared utilities and helpers
/public           - Static assets
```

## Key Commands

### Development
```bash
npm run dev              # Start dev server on port 3002
npm run build            # Build for production
npm run start            # Start production server on port 3002
npm run lint             # Run ESLint
```

### Database Operations
```bash
npm run prisma:generate  # Generate Prisma Client
npm run db:setup         # Push schema and seed (recommended for setup)
npm run db:migrate       # Create migration files (interactive)
npm run db:push          # Push schema without migration files
npm run db:seed          # Seed sample data
npm run db:studio        # Open Prisma Studio on localhost:5555
npm run db:reset         # Reset database (force)
```

### Data Import
```bash
npm run import:products  # Import products from CSV file
```

## Coding Conventions

### TypeScript
- Use strict mode (already configured in tsconfig.json)
- Use React.FC or explicit typing for component props
- Prefer `type` over `interface` for prop definitions
- Use path aliases: `@/*` maps to project root

### React/Next.js
- Use App Router conventions (not Pages Router)
- Server Components by default, add `'use client'` only when needed
- Use Next.js built-in components: `<Link>`, `<Image>`, etc.
- Follow file-based routing in `/app` directory
- Layout files should export `metadata` for SEO

### Styling
- Use Tailwind CSS utility classes
- Follow existing glass-morphism design pattern (see `app/layout.tsx`)
- Color scheme: Dark theme with slate-900 background, cyan-400 to blue-500 gradients
- Responsive design: Mobile-first approach with `md:` breakpoints

### Database
- All database operations use Prisma Client
- Import from: `import { PrismaClient } from '@prisma/client'`
- Use transactions for multi-step operations
- Follow the existing schema conventions:
  - UUID for IDs (`@default(uuid())`)
  - Timestamps: `createdAt` and `updatedAt`
  - Soft deletes where applicable
  - JSON strings for flexible attributes

### Product Types
The system handles these product types:
- `HOSE` - Mangueras (hoses)
- `FITTING` - Conexiones (fittings)
- `ASSEMBLY` - Ensambles (assemblies)
- `ACCESSORY` - Accesorios (accessories)

### Code Organization
- Keep components focused and single-responsibility
- Extract reusable logic to `/lib` utilities
- Use async/await for asynchronous operations
- Handle errors gracefully with try-catch blocks
- Add loading and error states for async UI

## Database Schema Key Models

### Product
- Core model for inventory items
- Fields: sku (unique), referenceCode, name, description, type, brand, base_cost, price
- Attributes stored as JSON string for flexibility
- Relations: category, inventory, movements

### Category
- Product categorization
- One-to-many with Products

### Inventory
- Current stock levels per location
- Many-to-one with Product

### InventoryMovement
- Historical record of stock changes
- Types: IN, OUT, ADJUSTMENT, TRANSFER, ASSEMBLY

## Common Patterns

### API Routes
- Use Route Handlers in `/app/api` directory
- Export named functions: GET, POST, PUT, DELETE
- Return NextResponse objects
- Handle errors with appropriate status codes

### Data Fetching
- Server Components: Fetch directly in component
- Client Components: Use React hooks (useState, useEffect)
- Revalidate data with Next.js caching strategies

### Forms
- Use controlled components with React state
- Validate on client and server side
- Show loading states during submission
- Display success/error messages clearly

## Language
- UI text is in Spanish (es)
- Code comments can be in English
- Variable names in English following JS conventions
- User-facing content in Spanish

## Testing
- No formal test infrastructure currently set up
- Manual testing through the UI and Prisma Studio
- Verify database changes via `npm run db:studio`

## Important Notes
- Port 3002 is used (not default 3000)
- SQLite database is local only (`prisma/dev.db`)
- CSV import functionality for bulk product creation
- Barcode scanning feature for warehouse operations
- The app uses Spanish language for all UI elements

## When Making Changes
1. Generate Prisma Client after schema changes: `npm run prisma:generate`
2. Run `npm run dev` to test changes locally
3. Check ESLint with `npm run lint` before committing
4. If database schema changes, run `npm run db:push` or create migrations
5. Test critical flows: product creation, inventory updates, movements

## Troubleshooting
- If Prisma Client is out of sync: `npm run prisma:generate`
- If database is locked or corrupted: Close all connections, delete `dev.db`, run `npm run db:setup`
- For permission errors on Windows: Close all terminals and VS Code instances using the db
- Use Prisma Studio (`npm run db:studio`) to inspect database state
