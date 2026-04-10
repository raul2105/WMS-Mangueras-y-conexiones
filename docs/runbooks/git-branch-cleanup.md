# Runbook de limpieza manual de ramas Git

Este runbook define como limpiar ramas locales y remotas sin eliminar trabajo activo.

## Frecuencia sugerida

- Ejecutar manualmente una vez por semana o quincena.

## Reglas de seguridad

- No eliminar ramas con PR abierto.
- No eliminar ramas no mergeadas sin confirmacion del autor.
- No eliminar main ni develop.
- Tomar snapshot de listado antes de borrar.

## Paso 1: actualizar referencias

En tu clon local:

1. git checkout main
2. git pull
3. git fetch --all --prune

## Paso 2: listar ramas remotas candidatas

Ramas remotas ya mergeadas en main:

1. git branch -r --merged origin/main

Filtrar ramas de trabajo:

1. git branch -r --merged origin/main | findstr /R "origin/feature/ origin/hotfix/ origin/docs/"

## Paso 3: validar ramas con PR cerrado o mergeado

Para cada rama candidata:

1. Confirmar en GitHub que el PR esta merged.
2. Confirmar que no existe trabajo pendiente fuera de main.

## Paso 4: borrar ramas remotas seguras

Borrar una rama remota especifica:

1. git push origin --delete feature/123-ajuste-kardex

## Paso 5: limpiar ramas locales

Ramas locales mergeadas en main:

1. git branch --merged main

Borrar local segura:

1. git branch -d feature/123-ajuste-kardex

Forzar borrado local solo si ya se valido merge remoto:

1. git branch -D feature/123-ajuste-kardex

## Paso 6: registro operativo

Registrar fecha, responsable y ramas eliminadas en la bitacora del equipo.

## Checklist rapido

- [ ] Actualice refs con fetch --prune.
- [ ] Liste candidatas mergeadas.
- [ ] Valide PR merged en GitHub.
- [ ] Elimine remotas seguras.
- [ ] Elimine locales seguras.
- [ ] Registre la limpieza.
