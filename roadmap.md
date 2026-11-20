# Roadmap: flujo de cotización + Handover

- [x] Corregir exclusivamente acceso a `calcular_demoras_embarque` y `pago_detalle`: migración 0091 aplicada y ambos avisos registrados como corregidos; 12 verificaciones SQL, 18 pruebas JS y 10 detalles de pagos reales idénticos antes/después.
- [ ] Cierre de 0091: baseline/postcheck/CI/RLS completos pendientes de GitHub Actions según política del usuario; no ejecutar suites completas localmente.

- [x] Aplicar comisión exclusiva del broker en sus empresas, conservar KAM operativo y comisiones normales sin broker; 10 casos SQL, 16 pruebas JS, ESLint y pantalla autenticada verificados.
- [x] Revisar comisiones KAM anteriores sólo Devengadas y sin liquidación: la base activa contiene 0 renglones elegibles, por lo que no hay históricos que modificar; liquidadas, pagadas y recuperaciones intactas.
- [x] Activar lectores de membresías y libro con permisos vigentes; 3 casos SQL, 25 movimientos reales idénticos y guardia de Pricing verificados; dos hallazgos registrados como corregidos.
- [x] Ajustar lector de demoras: replica permisos de lectura antes de acceder al embarque, con cálculo positivo, idempotencia, disparador de fechas y aislamiento probados en datos temporales; no se recalcularon costos/ventas reales.
- [ ] Baseline/postcheck/CI/RLS completos de 0089–0090 pendientes de GitHub Actions; no ejecutar suites completas localmente según política del usuario.

- [x] Mostrar vendedor externo automático en datos comerciales de oportunidad, usando el broker de la empresa vinculada; 17 pruebas JS y 7 casos SQL aislados. Verificación visual autenticada sin broker; no existe oportunidad activa del broker para verificar ese caso en pantalla.
- [x] Preparar sin aplicar los ajustes de los tres avisos automáticos de seguridad, según autorización; ver docs/releases/security-readers/review.md y candidate.sql. Hallazgos activos hasta revisión y autorización de activación.
- [ ] Cierre completo de base para vendedor externo: baseline/postcheck/CI/RLS pendientes de GitHub Actions según política de validación; no ejecutar suites completas localmente.

- [x] Preparar etiqueta de margen bajo en listado/detalle y registro transaccional del autorizador para cambios operativos; candidata 0084 sin aplicar, 25 pruebas JS/React y 53 casos SQL locales; verificación visual autenticada con respuestas simuladas.

- [x] Preparar guardado de borradores bajo margen, notificación a Administración y aprobación vigente antes de confirmar; SQL candidato sin registrar/aplicar, 45 pruebas JS y 38 casos SQL locales, pantalla verificada con respuestas simuladas.
- [ ] Activar este flujo: registrar candidata en historial y espejos, regenerar baseline y pasar CI/RLS/postchecks completos en GitHub Actions antes de aplicar/publicar. — requiere autorización adicional; base activa y publicación intactas.

- [x] Usar la moneda de la tarifa elegida: USD sin TC por moneda previa de CRM; MXN pide DOF de hoy, conservando validación de conversiones.

- [x] Conservar el borrador automático y «Aceptada» hasta confirmar el embarque; corregir Kuartz y validar la transición.

- [x] Mostrar la ficha de handover en el detalle de cotización para Administración y Vendedor/KAM; conservar acceso de Operaciones y aislamiento por empresa.

- [x] Fase 1: Tipo de operación y Sector económico en la solicitud; datos de la solicitud pasan solos a la cotización (mercancía, IMO, estibable, peso en kg, notas, tipo, sector).
- [x] Fase 2: obligatorios al enviar, tipo de solicitud automático, complejidad 36 h / 48 h automática, cambio del gerente con justificación (8 h para ampliar), avisos y más respuestas tras responder.
- [x] Fase 3 (autorización): solicitar/autorizar con margen mínimo, aviso a admin/gerente comercial, envío bloqueado sin autorización, handover al autorizar.
- [ ] Fase 3b: prospecto sólo borrador + "Pedir alta como cliente"; exigir oportunidad "En cotización" a clientes generales. — espera confirmación (choca con "Convertir a Cliente" tras aceptar).
- [x] Fase 4: botón "Cotizar y guardar tarifa" (coordinador/gerente de operaciones) para clientes especiales; sus cotizaciones se autorizan solas al enviar/aceptar y generan el handover.
- [x] Fase 5: Handover al aceptar la cotización: coordinador por turno + aviso con ficha al coordinador y gerente de operaciones. (Ahora se dispara al autorizar.)
- [x] Corregir vencimiento y transiciones históricas de cotizaciones de prospecto sin permitir enviar borradores nuevos.
- [x] Excluir gerentes de operaciones del coordinador fijo del cliente; conservarlos en la reasignación del handover.
- [x] Registrar 0042–0048 en `drizzle/replay.json` y regenerar baseline.
- [x] Prueba de cierre de otra empresa: pasa en reconstrucción completa (la falla era de una base parcial).
- [x] Lectura de liquidaciones para finanzas y gerencias (sólo SELECT).
