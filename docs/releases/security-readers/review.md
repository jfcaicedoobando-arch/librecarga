# Revisión de seguridad de lectores

Autorización del 20/11/2026: revisar y activar únicamente los ajustes compatibles. La migración 0090 activa membresías/libro; la selección posterior autoriza exclusivamente demoras y detalle de pago, activados en 0091.

## Avisos incluidos

- `get_user_org_ids`: activada como SECURITY INVOKER; conserva cuerpo, firma y permisos de ejecución y respeta RLS de membresías (propias, administración de organización y superadministración). Su único consumidor de políticas es la lectura de organizaciones; las políticas de membresías no la llaman, por lo que no hay recursión. Pricing conserva sus guardias y actualiza sólo el valor `security_definer` de esta entrada; se comprobó con sesión real que no dispara `LC_PRICING_ACL_DRIFT`.
- `libro_pagos`: activada como SECURITY INVOKER; conserva argumentos y cálculos, y cambia la lectura a permisos del usuario. Las nueve tablas tienen SELECT autenticado y RLS. Una sesión interna real conserva exactamente los 25 renglones e importes del 01–20/11/2026 antes y después.
- `calcular_demoras_embarque`: replica las tres políticas SELECT y la restricción de empresa activa de superadministración antes de cargar el embarque. Conserva la comprobación posterior de membresía, los cálculos, bloqueos y escritura transaccional; no añade permisos de escritura a usuarios ni modifica auxiliares internos.
- `pago_detalle`: SECURITY INVOKER conserva cuerpo/firma y aplica RLS de las once tablas leídas. Mantiene las seis variantes y permisos de ejecución; diez detalles reales coinciden íntegramente antes/después.

## Estado y condiciones de activación

- `candidate.sql` no está en el historial de migraciones. Su primer bloque impide ejecutarlo por accidente.
- Los dos hallazgos seleccionados de 0091 quedaron corregidos y registrados, sin actuar sobre los demás. No se ejecutaron recálculos de demoras sobre datos reales.
- Doce verificaciones SQL usan el esquema real aislado, sin desactivar disparadores: costo MXN 300 y venta USD 60 idénticos, recálculo por fecha a MXN 400, idempotencia, dos organizaciones, superadministrador con empresa activa, seis variantes de pago y denegación anónima. Pasan 18 pruebas JS de ambos servicios.
- Reproducción focalizada: preparar una base local vacía con `_ci_bootstrap.sql` y `supabase/schema/baseline.sql` (extensión `pg_trgm` en `extensions`); cargar las definiciones vivas previas revisadas si el baseline difiere. Ejecutar `psql -X -v ON_ERROR_STOP=1 -v candidate=/dev-server/drizzle/migrations/0091_demoras_y_pago_detalle_acceso_protegido.sql -f scripts/db/tests/selected-readers-security.sql`. La prueba revierte su transacción y la migración falla si cambia la huella del cálculo revisado.
- Pendiente: CI/RLS/postchecks/baseline en GitHub Actions según política del usuario.
- No revocar la consulta de funciones que usan las reglas de acceso. No cambiar importes, tasas ni identidades.

## Recorrido focalizado de consumidores

- Embarques / Garantías y Demoras: `SeccionDemorasAuto` → `useRecalcularDemoras` → `recalcularDemorasEmbarque` usa el RPC protegido; la interfaz y sus permisos de edición no cambian.
- Fechas por contenedor: `TabDemoras` → `useTabDemorasController` → `actualizarDemorasContenedor` mantiene la actualización bajo RLS y el disparador de recálculo. El disparador de fechas se probó en base aislada; el de entrega se revisó en código, sin entregar embarques reales.
- Conteo y eliminación de demoras automáticas: siguen las consultas directas de `demorasEmbarque.ts`, con las políticas vigentes de conceptos. No se ejecutaron eliminaciones reales ni se ampliaron sus permisos.
- Tesorería / Pagos: `TesoreriaPagos` abre el panel compartido `DetallePagoSheet` → `usePagoDetalle` → `fetchPagoDetalle` → `pago_detalle`.
- Tesorería / Estado de cuenta: `estadoCuentaColumns` y `BotonVerPago` abren el mismo panel y la misma lectura protegida.
- Tesorería / Conciliación: tanto `movimientoColumns` / `BotonVerPago` como `PanelConciliacionMovimiento` / `EstadoConciliado` abren el mismo panel; no existe una consulta alternativa de detalle de pago en esas entradas.
- Cobros, pagos a proveedores, anticipos, devoluciones y los dos tipos de lote conservan las seis ramas existentes del RPC, verificadas con datos aislados.
- Traspasos: `DetallePagoSheet` deriva a `DetalleTraspasoSheet` y `fetchTraspasoDetalle`, que consulta directamente bajo RLS. No llama al RPC seleccionado y queda sin cambios.
- Tabuladores de Costeo: `navieraCondiciones.ts` y `demorasVenta.ts` conservan sus lecturas y escrituras independientes; se revisaron las políticas vigentes, sin modificar tarifas ni auxiliares internos.
- Cambio de sesión/empresa: la purga existente de caché y `useSuperAdminOrgs` permanecen intactos; la restricción del RPC también se verificó con superadministración dentro y fuera de la empresa activa.

Este recorrido adicional fue de código y políticas; no constituye una prueba visual completa de todas las pantallas ni una auditoría de los hallazgos no seleccionados.