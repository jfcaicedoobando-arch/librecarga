# Revisión de seguridad de lectores

Autorización del 20/11/2026: revisar y activar únicamente los ajustes compatibles. La migración 0090 activa dos ajustes; demoras sigue pendiente.

## Avisos incluidos

- `get_user_org_ids`: activada como SECURITY INVOKER; conserva cuerpo, firma y permisos de ejecución y respeta RLS de membresías (propias, administración de organización y superadministración). Su único consumidor de políticas es la lectura de organizaciones; las políticas de membresías no la llaman, por lo que no hay recursión. Pricing conserva sus guardias y actualiza sólo el valor `security_definer` de esta entrada; se comprobó con sesión real que no dispara `LC_PRICING_ACL_DRIFT`.
- `libro_pagos`: activada como SECURITY INVOKER; conserva argumentos y cálculos, y cambia la lectura a permisos del usuario. Las nueve tablas tienen SELECT autenticado y RLS. Una sesión interna real conserva exactamente los 25 renglones e importes del 01–20/11/2026 antes y después.
- `calcular_demoras_embarque`: ya verifica membresía, pero busca primero cualquier embarque y permite al superadministrador trabajar fuera de la empresa activa. La candidata acota esa búsqueda a la organización activa antes de leer o cambiar importes; conserva cálculo, bloqueos y escritura transaccional.

## Estado y condiciones de activación

- `candidate.sql` no está en el historial de migraciones. Su primer bloque impide ejecutarlo por accidente.
- Dos hallazgos corregidos y registrados; `calcular_demoras_embarque` permanece activo, sin ignorar. Su lectura precede al control de membresía y modifica costos/ventas; no se activa un cambio de permisos sin verificar lectores legítimos y el cálculo transaccional. No se ejecutaron recálculos de demoras sobre datos reales.
- Pendiente: validación focalizada de demoras con sus lectores y escritura transaccional, y CI/RLS/postchecks/baseline en GitHub Actions según política del usuario.
- No revocar la consulta de funciones que usan las reglas de acceso. No cambiar importes, tasas ni identidades.