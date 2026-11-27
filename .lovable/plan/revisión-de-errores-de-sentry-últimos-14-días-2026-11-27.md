# Revisión de errores de Sentry (últimos 14 días)

Hay 11 errores abiertos. Casi todos son **avisos de reglas de negocio funcionando bien** (el sistema dijo "no" correctamente), pero se están reportando a Sentry como si fueran fallas. Es como si la alarma de la casa sonara cada vez que alguien toca el timbre.

## Avisos esperados (el candado funcionó)
| Error | Dónde | Qué significa |
|---|---|---|
| REACT-7T Concepto ya proformado | Editar embarque | Se intentó cambiar un concepto ya incluido en proforma |
| REACT-98 Periodo contable cerrado | Factura de proveedor | Fecha 28/08/2026 en periodo cerrado |
| REACT-96 Proveedor pendiente de aprobación | Por capturar | Proveedor provisional sin aprobar |
| REACT-95 Cuenta inactiva | Tesorería | Traspaso con cuenta inactiva |
| REACT-92 / 93 Faltan Submodalidad/Commodity | Solicitud Pricing | Validación de campos obligatorios (5 veces, 2 usuarios) |
| REACT-97 not_found | Rastreo público | Liga de rastreo inválida o vencida |

## Posibles fallas reales
- **REACT-99 SyntaxError** en la página de inicio pública: un navegador (0 usuarios identificados, probablemente un robot o navegador viejo) no pudo cargar la página. Sin impacto confirmado.
- **REACT-94 HTTP 500** (24/11, 1 vez): una llamada al servidor falló; hay que leer el detalle para saber cuál.
- **LIFTGO-R**: pertenece a otro proyecto (LiftGo), no a este ERP.

## Propuesta
1. Revisar el detalle de REACT-94 y REACT-99; corregir sólo si hay causa en el código.
2. Dejar de enviar a Sentry los avisos de reglas de negocio conocidos (códigos `LC_*`, validaciones de Pricing, proveedor pendiente, not_found de rastreo): el usuario sigue viendo el mensaje, sólo deja de "sonar la alarma". Sin cambios en base de datos ni en los candados.
3. Agregar una prueba pequeña que confirme qué errores se filtran y cuáles siguen reportándose.
4. Marcar como resueltos en Sentry los issues atendidos y anotarlos en el CHANGELOG sólo si lo autorizas (regla de no tocar versión sin permiso).

## Detalle técnico
- Filtro en `beforeSend` del init de Sentry existente, por prefijo `LC_` y lista cerrada de mensajes/nombres (`ErrorEnvioSolicitudPricing`).
- Validación focalizada: prueba del filtro + lint; CI/RLS completos quedan para GitHub Actions.
