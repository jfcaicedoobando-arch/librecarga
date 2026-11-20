# Aprobación del margen de borradores — preparación

## Estado

Implementación preparada, **no activada en la base del proyecto**. No se publicaron cambios, no se alteraron usuarios, credenciales ni registros operativos. No se modificaron la versión ni el changelog.

`0083_embarque_margen_borrador.sql` es una candidata revisable: no pertenece todavía al ledger, al replay ni a la baseline vigente. Su número es provisional. SHA-256:

```text
000cb6db1b217716732a141d440063315f7ad494677d37bea141ed1dc1fe87ba
```

## Flujo preparado

- Coordinación guarda el borrador bajo el margen mínimo de su organización.
- Triggers diferidos toman las partidas finales del guardado y registran solicitud y notificaciones internas a `admin` / `admin_org` de la misma organización en la misma transacción.
- Administración aprueba el snapshot exacto revisado con motivo; un superadministrador también exige la organización activa correcta.
- La aprobación habilita confirmar **ese mismo borrador**, sin crear otro embarque ni saltarse los datos obligatorios de la confirmación existente.
- Cambiar importes, monedas, cliente, mínimo o FX utilizado hace que el snapshot aprobado ya no sea válido. La autorización anterior queda trazada en bitácora. Cambios del proveedor, notas o FX no utilizado no invalidan el margen.
- Un trigger de inicio operativo protege todas las rutas de transición, y su comprobación diferida impide cambiar los importes después del avance dentro de la misma transacción. Los escritores de conceptos toman el mismo bloqueo del embarque que la aprobación.
- La tabla de aprobación no permite lectura/escritura directa de usuarios; las RPC verifican rol y organización. No se permite leer costos a portales externos ni a soporte sin esa capacidad.
- Sin la RPC candidata desplegada, el frontend mantiene el candado de guardado actual. Una falla de red, permiso o respuesta inválida nunca se interpreta como autorización para liberarlo.
- Las ediciones de embarques ya operativos conservan su regla comercial previa. No se hereda automáticamente la aprobación de la cotización ni se aprueban históricos.

## Validación focalizada ejecutada

- 45 pruebas JS/React en servicios, hook de aprobación, guardado, margen y telemetría esperada.
- 38 casos SQL en PostgreSQL temporal local, incluyendo dos conexiones simultáneas, aislamiento de organización, negativa de permisos, idempotencia, rollback si falla el aviso, snapshots obsoletos, mismo margen con importes distintos e invalidación por FX.
- ESLint focalizado y señal del preview `build OK`.
- Pantalla autenticada verificada en escritorio y móvil **con respuestas de las RPC candidatas simuladas**: pendiente → motivo → aprobada; sin errores de ejecución ni desbordamiento horizontal móvil. No se registró una aprobación real. Esta comprobación no sustituye la prueba integrada contra el ERP con el esquema desplegado.

Prueba SQL aislada reproducible:

```bash
bash scripts/tests/embarque-margen-borrador.sh
```

## Pendientes antes de activar

1. Obtener autorización para la integración y aplicación; la autorización recibida fue sólo para preparar.
2. Revisar la candidata contra el esquema efectivo, asignar su número final, registrar migración nueva y sus hashes/replay/espejos, y regenerar baseline. No editar migraciones históricas.
3. Ejecutar CI, RLS y `db:postcheck` completos en GitHub Actions; **no se ejecutaron las suites globales localmente**.
4. Aplicar el SQL autorizado completo en una transacción por la herramienta de migraciones de Cloud; no instalar sólo las RPC sin los triggers.
5. Verificar el flujo real con Coordinación y Administración en la misma organización, y decidir aparte la publicación del frontend.

La baseline y los postchecks globales no se reportan como completos: no se cambió el esquema efectivo y la candidata todavía no está integrada en el historial de despliegue.