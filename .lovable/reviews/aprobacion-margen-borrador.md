# Borrador con margen bajo y aprobación administrativa

## Flujo solicitado
1. El coordinador logístico guarda el borrador aunque el margen esté debajo del mínimo de su organización.
2. Administración de esa misma organización recibe una notificación interna con el borrador, venta, costo, utilidad y margen por aprobar.
3. El borrador no puede iniciar operaciones mientras la aprobación esté pendiente.
4. Administración aprueba los importes revisados. El borrador queda habilitado para confirmarse como embarque, conservando los datos obligatorios y las validaciones actuales. No se crea un segundo embarque.
5. Si cambian los importes aprobados, se solicita una nueva aprobación; guardar datos operativos sin cambiar importes no la invalida.

## Controles técnicos
- Guardado y solicitud de aprobación deben persistirse de manera atómica, sin duplicar avisos por reintentos.
- Aprobación con usuario, fecha e importes revisados; permisos comprobados en el servidor y aislamiento por organización.
- Bloqueo de todas las rutas de inicio operativo, no sólo del botón de confirmar.
- Conservar trazabilidad de conceptos, validaciones fiscales, concurrencia e idempotencia.
- No considerar aprobadas automáticamente las ediciones del embarque por una aprobación anterior de la cotización.
- Reutilizar notificaciones y detalle del embarque existentes, sin crear un módulo nuevo.

## Alcance pendiente de autorización
El código actual bloquea el guardado en la pantalla, pero la función de confirmación no contiene este flujo de aprobación del margen del borrador. Quitar sólo el bloqueo de la pantalla permitiría continuar sin la aprobación solicitada.

Se necesita preparar un cambio nuevo de base y controles de aprobación junto con la pantalla. Por la restricción existente de no crear migraciones sin autorización, esa implementación queda detenida hasta recibirla. No se aplicarán cambios a la base activa ni se publicará la aplicación sin autorización adicional.

## Validación prevista
Pruebas focalizadas para guardado por coordinador, aviso a administradores de la misma organización, bloqueo sin aprobación, aprobación con datos obligatorios, invalidación por cambio de importes y reintentos sin duplicados. CI y RLS completos quedan a cargo de GitHub Actions.