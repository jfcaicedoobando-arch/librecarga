# Revisión de errores de Sentry (28/11/2026)

## Diagnóstico (11 abiertos, últimos 7 días)
- **Fallas de red en Embarques** (REACT-91, 9F, 87, 9B; 5 eventos, versión 13.824.110): el navegador perdió la conexión a mitad de una consulta. El aviso llega envuelto como "TypeError: Failed to fetch (servidor)" y el clasificador lo marca como "unknown" en vez de "network", así que no se filtra ni se agrupa como ruido.
- **Facturapi "Failed to send a request"** (REACT-9E): misma falla de red al llamar a la función de facturación. Es un intento, no se timbró nada duplicado (a verificar).
- **"La tarifa de Pricing ya no está vigente"** (REACT-9C, 3 eventos de Yvonne): es el error terrestre ya corregido; confirmar que los tres eventos son de la versión anterior al arreglo.
- **LC_PRICING_ACL_DRIFT** (REACT-8X): ya corregido en la base el 27/11; sólo resolverlo.
- **Faltan campos: Incoterm** (REACT-9D, 92) y **uso CFDI incompatible** (REACT-9A): avisos de validación esperados que el usuario sí ve; no son fallas.
- **REACT-99 SyntaxError**: se deja abierto como antes (robot/navegador viejo).

## Pasos
1. Revisar la versión de los eventos de REACT-9C y 9E para confirmar diagnóstico.
2. Clasificar como `network` el mensaje envuelto "Failed to fetch (host)" / "Failed to send a request to the Edge Function" en `classifyError.ts`, para que el filtro existente lo trate como ruido de red; agregar prueba.
3. Agregar el mensaje de uso CFDI incompatible y `ErrorEnvioSolicitudPricing` a la lista de avisos esperados (`expectedTelemetryError.ts` / `dropFiltersNegocio.ts`) con prueba.
4. Marcar como resueltos en Sentry los issues corregidos y referenciarlos.
5. Validaciones focalizadas (pruebas de observabilidad + lint); CI/RLS completos en GitHub Actions. Sin publicar ni tocar versión/changelog.

## Detalles técnicos
- No se cambian candados, mensajes en pantalla ni lógica de negocio; sólo telemetría.
