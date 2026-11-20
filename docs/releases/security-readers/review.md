# Ajustes de seguridad preparados, sin aplicar

Autorización del 20/11/2026: preparar para revisión, sin modificar estos permisos en la base activa.

## Avisos incluidos

- `get_user_org_ids`: hoy recibe cualquier usuario y devuelve sus organizaciones. La candidata limita a la identidad autenticada; conserva ejecución de servicio. **No activar sola**: Pricing compara una huella de esta función. Antes de activar, revisar todos sus consumidores y actualizar la huella específica en la misma entrega aprobada; no deshabilitar la guardia.
- `libro_pagos`: ya impide pedir la organización ajena, pero ejecuta con permisos del dueño y no comprueba las reglas de cada tabla. La candidata conserva argumentos y cálculos, y cambia la lectura a permisos del usuario. Revisar con Contabilidad/Tesorería que las reglas vigentes permitan todos los renglones legítimos antes de activar.
- `calcular_demoras_embarque`: ya verifica membresía, pero busca primero cualquier embarque y permite al superadministrador trabajar fuera de la empresa activa. La candidata acota esa búsqueda a la organización activa antes de leer o cambiar importes; conserva cálculo, bloqueos y escritura transaccional.

## Estado y condiciones de activación

- `candidate.sql` no está en el historial de migraciones. Su primer bloque impide ejecutarlo por accidente.
- Los tres hallazgos siguen activos: preparar no equivale a corregir en producción.
- Pendiente: autorización de aplicación, compatibilidad de la huella de Pricing, pruebas focalizadas de lectores reales y CI/RLS/postchecks/baseline en GitHub Actions.
- No revocar la consulta de funciones que usan las reglas de acceso. No cambiar importes, tasas ni identidades.