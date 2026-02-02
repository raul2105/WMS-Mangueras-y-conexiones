# Database Setup Manual (WMS Rigentec)

This project uses Prisma + SQLite for local development. The database lives at `prisma/dev.db`.

## Prerequisites
- Ensure you are in the project root: `WMS-Mangueras-y-conexiones`
- Ensure Node.js and NPM are installed.

## 1. Verify Configuration
Check `prisma/schema.prisma` serves the SQLite provider:
```prisma
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db" 
}
```

## 2. Generate Prisma Client
Run this to create the TypeScript types:
```powershell
npx prisma generate
```

Alternatively, you can use the npm script:
```powershell
npm run prisma:generate
```

## 3. Run Migration
Run this command to create the database file (`dev.db`) and tables:
```powershell
npx prisma migrate dev --name init
```
*If this fails, try this alternative which skips migration history:*
```powershell
npx prisma db push
```

Recommended (one-click / non-interactive):
```powershell
npm run db:setup
```

If you specifically want migration files (interactive):
```powershell
npm run db:migrate
```

Seed sample data (optional):
```powershell
npm run db:seed
```

## 4. Verify Database
You should see a `prisma/dev.db` file appear. You can explore it using:
```powershell
npx prisma studio
```
This will open a web interface at `http://localhost:5555`.

Or:
```powershell
npm run db:studio
```

## VS Code one-click tasks
Use **Terminal → Run Task…** and pick:
- `DB: Setup (push + seed)`
- `DB: Seed`
- `DB: Studio`

## Troubleshooting
If you see errors about "Remove-Item" or "Permission denied":
1. Close any VS Code terminals or processes using the db.
2. Delete the `prisma/dev.db` file (if it exists) manually.
3. Try running the command again.
