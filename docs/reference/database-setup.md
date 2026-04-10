# Manual de configuración de base de datos

El proyecto usa Prisma con SQLite para desarrollo local. La base vive en `prisma/dev.db`.

## Requisitos previos

- Estar en la raíz del proyecto `WMS-Mangueras-y-conexiones`.
- Tener Node.js y npm instalados.

## Verificar configuración

Confirma que `prisma/schema.prisma` apunte a SQLite:

```prisma
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}
```

## Generar Prisma Client

```powershell
npx prisma generate
```

O usando el script del proyecto:

```powershell
npm run prisma:generate
```

## Crear base y tablas

Opción recomendada para entorno local:

```powershell
npm run db:setup
```

Alternativas:

```powershell
npm run db:migrate
npm run db:push
npm run db:seed
```

## Verificar la base

Después del setup debe existir `prisma/dev.db`.

Para inspeccionarla:

```powershell
npx prisma studio
```

O:

```powershell
npm run db:studio
```

Prisma Studio abre en `http://localhost:5555`.

## Datos de ejemplo

El seed crea:

- 2 almacenes
- ubicaciones operativas y de staging
- productos de ejemplo
- inventario inicial por ubicación

Esto sirve para validar catálogo, recepción, picking y producción en local.

## Troubleshooting

Si aparecen errores de permisos o bloqueo del archivo:

1. Cierra procesos que estén usando la base.
2. Cierra Prisma Studio si está abierto.
3. Reintenta `npm run db:setup`.

Si Prisma Client queda desactualizado:

```powershell
npx prisma generate
```
