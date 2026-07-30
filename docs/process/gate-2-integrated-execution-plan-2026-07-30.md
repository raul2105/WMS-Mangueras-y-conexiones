# Plan integrado de ejecución — Gate 2

Fecha: 2026-07-30

## Principios vigentes

- AWS es la única base de datos: no se crean bases efímeras ni datos de prueba
  automáticos contra RDS.
- No se avanza por calendario; cada gate exige evidencia suficiente.
- `home/{rol}` es el contrato único de entrada por rol.
- Implementación, despliegue, validación técnica y validación operativa son
  estados distintos.

## Bloque 1 — Entrada comercial homogénea

Objetivo: eliminar las dos consolas raíz de Ventas sin afectar los demás roles.

Decisión:

- `/home/sales` es la entrada canónica del Ejecutivo de Ventas.
- La ruta raíz heredada `/sales` se elimina. Un acceso directo recibe 404 para
  evitar una segunda entrada o una redirección ambigua.
- La consola comercial nueva se reutiliza dentro de `/home/sales`.
- `/sales/customers` y demás rutas de capacidad comercial permanecen como
  módulos, no como homes.

Gate de salida:

- login directo de Ventas llega a `/home/sales`;
- el home muestra la consola comercial nueva;
- navegación comercial vuelve a `/home/sales`;
- Gerencia, Administración y Almacén conservan su propio `home/{rol}`.

## Bloque 2 — KAN-128: precisión de disponibilidad y promesa

Alcance único:

- disponibilidad visible;
- promesa comercial;
- información de `Nuevo Pedido`;
- prevención de compromisos con cantidades incorrectas.

Pendientes:

1. Corregir la fecha comercial canónica para que CloudFront y localhost no
   desplacen la fecha de compromiso por zona horaria.
2. Revalidar en lectura AWS la relación disponibilidad → pedido confirmado →
   reserva → handoff para `PI-2026-0010`.
3. Mantener el smoke E2E AWS de solo lectura como vigilancia y documentar la
   evidencia funcional controlada por separado.

Gate de salida:

- cantidades y reserva coinciden con AWS;
- fecha de promesa es igual entre entornos;
- un pedido no puede confirmarse con promesa insuficiente;
- RBAC comercial y de almacén es consistente.

## Bloque 3 — Cadena de producto posterior

Sólo inicia tras el cierre de KAN-128:

`KAN-133 → KAN-127 → KAN-131 → KAN-134 → KAN-132 → KAN-130 → KAN-125`

- KAN-133: proceso y estados canónicos.
- KAN-127: contrato, transiciones, permisos y auditoría.
- KAN-131: cola por rol; una única siguiente acción sin mezclar estado y RBAC.
- KAN-134: ensambles dentro del mismo flujo.
- KAN-132: preparado para entrega y bloqueo de entrega prematura.
- KAN-130: certificación E2E integral.
- KAN-125: cierre de capacidad integral con evidencia operativa.

## Controles permanentes

- `main` protegida mediante PR, conversaciones resueltas, Quality Gate y E2E
  AWS de solo lectura.
- PR #85 continúa fuera de esta ruta hasta actualizarse sobre `main` y aportar
  evidencia comercial/RBAC actual.
- KAN-54 continúa en revisión integral; no se cierran ni reabren hijos por
  automatismo.
