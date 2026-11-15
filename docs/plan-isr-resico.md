# Plan de retención de ISR RESICO en LibreCarga

Propuesta inicial del 13 de noviembre de 2026. La etapa 1 se publicó el 15 de noviembre en LibreCarga 13.824.90 mediante el [PR #494](https://github.com/jfcaicedoobando-arch/librecarga/pull/494). La etapa 2 se implementó localmente sobre esa versión. El alcance del plan comprende desde la cotización hasta el cobro de organizaciones que emiten como persona física RESICO.

El resultado esperado es que el cliente vea el importe correcto a pagar desde los documentos comerciales y que ese mismo desglose llegue al CFDI, a cuentas por cobrar y al complemento de pago. La retención se calcula con los datos fiscales de la organización emisora y del receptor.

## Dónde se registra el régimen

Actualmente, el régimen del emisor se captura en **Facturapi → Configuración → Datos fiscales**, dentro de la organización que factura. Esta es la ruta documentada por [Facturapi](https://docs.facturapi.io/docs/getting-started/organization-onboarding/).

Antes de la etapa 1, `TabEmpresa` capturaba RFC y datos de contacto y el interruptor «Datos fiscales» guardaba únicamente `datos_fiscales_completos`; ese indicador no acreditaba el régimen del emisor. La etapa 1 integrada añade **Configuración → Facturación → Datos fiscales del emisor**, con sincronización y confirmación versionadas. Su disponibilidad para los usuarios requiere desplegar el backend y el frontend preparados.

El campo **Régimen Fiscal SAT** del módulo **Clientes** corresponde al receptor de la factura. El régimen del emisor debe pertenecer a la organización de LibreCarga; todos sus empleados comparten ese perfil fiscal.

## Regla y alcance fiscal

El artículo 113-J establece la retención del **1.25%**, sin considerar IVA, sobre pagos de personas morales a personas físicas comprendidas en el artículo 113-E por las actividades señaladas. La retención mostrada en una cotización o factura y la retención correspondiente al pago son momentos distintos. [SAT, artículo 113-J](https://wwwmat.sat.gob.mx/articulo/59511/articulo-113-j).

La automatización propuesta para las operaciones ordinarias cubiertas por esa regla será:

| Emisor | Receptor | Resultado de la regla RESICO |
| --- | --- | --- |
| Persona física, régimen 626, perfil confirmado | Persona moral nacional identificada | Aplicar ISR 1.25% a la base elegible |
| Persona física, régimen 626 | Persona física identificada | No aplicar ISR RESICO |
| Persona moral, incluso con régimen 626 | Cualquier receptor identificado | No aplicar esta regla de persona física |
| Persona física con otro régimen | Receptor identificado | No aplicar esta regla; conservar el tratamiento fiscal que corresponda |
| Perfil incompleto, identidad contradictoria o receptor sin identificar | Cualquiera | Pendiente de revisión |
| RFC genérico, extranjero o supuesto especial sin política definida | Cualquiera | Revisión fiscal explícita antes de emitir |

El régimen 626 del receptor no activa la retención. La estructura del RFC ayuda a comprobar el tipo de persona, pero no demuestra el régimen del emisor. Los casos fuera de la regla automática necesitan una resolución fiscal documentada; «pendiente» no equivale a tasa cero.

Ejemplo en MXN, con IVA 16% y sin otra retención:

| Concepto | Importe |
| --- | ---: |
| Subtotal | $10,000.00 |
| IVA | $1,600.00 |
| ISR retenido 1.25% | −$125.00 |
| Total a pagar | **$11,475.00** |

Esta entrega incluye la convivencia con las retenciones de IVA existentes. La clasificación automática de flete terrestre para aplicar IVA retenido del 4%, incluida en el borrador inicial, queda como desarrollo independiente.

## Lo que ya existe y lo que falta

| Área | Evidencia en el código | Trabajo necesario |
| --- | --- | --- |
| Perfil emisor | [Tarjeta fiscal](../src/features/configuracion/components/DatosFiscalesEmisorCard.tsx), [adaptador](../supabase/functions/facturapi-perfil-fiscal/handler.ts), [migración 0068](../drizzle/migrations/0068_perfil_fiscal_emisor.sql) | Etapa 1 publicada y validada en Chino Cochino sandbox |
| Receptor | [ClienteFiscalSelects](../src/features/cliente/components/ClienteFiscalSelects.tsx) | Reutilizar los datos del cliente y validar identidad/tipo de persona |
| Selector ISR | [retenciones.ts](../src/features/facturacion/constants/retenciones.ts) ofrece 0%, 1.25% y 10% | Etapa 2 conserva la selección de 1.25% al reabrir y editar |
| Cotización | [conceptos de venta](../src/features/cotizacion/domain/cotizacion.conceptos.ts), [resumen](../src/features/cotizacion/components/ResumenTotalesCotizacion.tsx) | Propagar evaluación fiscal y desglosar retención por moneda |
| Embarque y proforma | `conceptos_venta` carece de columnas de retención; la conversión normal y consolidada no las copia | Persistir cálculo y procedencia, completar ambos caminos de conversión |
| Factura | `conceptos_factura` ya guarda tasas e importes; `recalc_factura_totales` descuenta las retenciones | Reutilizar columnas y validar aplicación automática en servidor |
| Timbrado | [helpers de emisión](../supabase/functions/facturapi-emitir/helpers.ts) construyen impuestos con `withholding: true` | Verificar perfil, cálculo, payload y XML con tasa 0.0125 |
| Cobros y REP | `calc_pago_retenciones` prorratea; [pruebas REP](../supabase/functions/facturapi-emitir-rep/helpers_test.ts) ya contienen una tasa 0.0125 | Probar el flujo completo, pagos parciales y notas de crédito |

Las funciones y columnas SQL citadas se encuentran en el [baseline versionado](../supabase/schema/baseline.sql). Su existencia no certifica la definición remota actual.

La edición de un concepto «No objeto» pone sus retenciones en cero y el emisor rechaza retenciones con ObjetoImp 01. Si la evaluación RESICO requiere ISR en un concepto así clasificado, la línea queda pendiente de revisión fiscal.

El cuadre de facturas con ISR de 1.25% conserva los importes por renglón para el desglose y calcula la cabecera sobre bases exactas. PostgreSQL y [cuadreFacturapi.ts](../supabase/functions/facturapi-emitir/cuadreFacturapi.ts) usan esa misma aritmética para borradores y facturas por timbrar sin UUID ni snapshot fiscal.

## Etapa 1 Perfil fiscal del emisor

**Estado al 2026-11-15:** publicada con la migración 0068. Se comprobaron consulta, sincronización, confirmación y persistencia en Chino Cochino sandbox. Cada emisor tiene su propia organización y credenciales. Sus empleados autorizados comparten ese perfil. [PR #494](https://github.com/jfcaicedoobando-arch/librecarga/pull/494)

Agregar una tarjeta **Configuración → Facturación → Datos fiscales del emisor** con RFC, razón social, tipo de persona, régimen, código postal, ambiente, última sincronización y estado de confirmación. Incluir la acción **Sincronizar desde Facturapi** y acceso a la configuración del proveedor para corregir los datos en su origen.

La [API de Facturapi](https://docs.facturapi.io/api/) permite consultar la organización autenticada mediante `GET /organizations/me`. Extender el adaptador de conexión existente para obtener sus datos fiscales con las credenciales guardadas en el servidor y comprobar que corresponden a la organización vinculada.

Propuesta de persistencia: una tabla versionada `perfiles_fiscales_emisor`, con `organization_id`, ambiente, identificador de Facturapi, RFC, razón social, tipo de persona, régimen SAT, código postal, versión, origen, fecha de sincronización y confirmación. La fecha efectiva de un cambio fiscal debe registrarse expresamente cuando corresponda; no se deduce de la fecha de descarga. Las versiones utilizadas por documentos permanecen disponibles.

Sincronizar datos no equivale a verificarlos ante el SAT. Un usuario con permiso fiscal confirmará su correspondencia con la constancia fiscal. Se reutilizará el límite de permisos de emisión fiscal para administrar este perfil, con validación efectiva en servidor. Las lecturas operativas expondrán solo los datos necesarios para calcular y mostrar impuestos.

Sandbox y producción conservarán su procedencia separada. Una configuración de prueba no habilitará un emisor de producción. Una discordancia entre RFC de Empresa, identidad vinculada y perfil recibido impedirá confirmar el perfil hasta corregirla.

**Criterio de salida:** dos organizaciones distintas pueden sincronizar sus respectivos perfiles sin leer ni modificar los datos de la otra, y el régimen confirmado se muestra sin exponer llaves ni certificados.

## Etapa 2 Regla central y almacenamiento

**Implementada localmente en la migración 0069.** La evaluación usa el perfil confirmado de la organización activa, el ambiente de su conexión y el cliente registrado. Devuelve `aplica`, `no_aplica` o `pendiente`, con motivo, base, tasa, importe y versión. Para aplicar a una operación PF 626 con receptor moral se exige fecha de vigencia del perfil. El emisor 601 confirmado queda fuera de la regla aun sin fecha de vigencia.

En el editor de conceptos de una factura borrador, **Estimar ISR RESICO** muestra la decisión del servidor para los importes que se están editando. Cotizaciones, conceptos de venta y conceptos consolidados ya pueden guardar evaluaciones calculadas por el servidor cuando la escritura solicita ese cálculo. Los controles detienen el envío o la conversión de esos borradores hasta que las etapas 3 a 5 puedan conservar el desglose.

La [migración 0070](../drizzle/migrations/0070_factura_resico_totales_agrupados.sql) suma las bases exactas de los conceptos vigentes y redondea el subtotal una vez. Agrupa IVA trasladado, ISR retenido e IVA retenido por impuesto y tasa, y redondea cada grupo a dos decimales. El control previo a Facturapi exige coincidencia exacta del subtotal, IVA, ambas retenciones y total con la cabecera guardada.

Con dos renglones de 100.40, el subtotal es 200.80, el IVA agrupado 32.13 y el ISR retenido 2.51. El total de 230.42 coincide con la vista previa de Facturapi sandbox de Chino Cochino. Los nueve casos probados incluyeron bases con más de dos decimales, cantidad fraccionaria, tasas mixtas y retenciones de ISR e IVA simultáneas. Los totales comparados se obtuvieron de vistas previas PDF. El perfil del emisor disponible en Chino Cochino es persona moral 601. La elegibilidad PF 626 se comprobó en la base aislada. [Referencia de Facturapi](https://docs.facturapi.io/api/)

Crear una evaluación fiscal común con tres resultados: `aplica`, `no_aplica` y `pendiente`. Devolver tasa, motivo, base e identificador de versión del perfil/regla. La UI podrá mostrar una previsualización; las escrituras calcularán y validarán en el servidor usando los registros de la organización y del cliente, sin confiar en tasas o importes enviados por el navegador.

Añadir `isr_1_25` al catálogo y su conversión de ida y vuelta. Conservar las opciones existentes para sus casos válidos. Cuando la regla determine ISR RESICO, impedir su eliminación o sustitución arbitraria por 10%; un caso especial se resuelve mediante revisión fiscal registrada.

Extender `conceptos_venta` con tasa e importe ISR y metadatos de evaluación. Llevar el mismo contrato en el JSON de cotizaciones y en `proforma_conceptos_consolidados`. Conservar por documento una copia de los datos fiscales usados, versión de regla y resultado por línea. Reutilizar los campos de `conceptos_factura` y los snapshots existentes donde corresponda.

Los documentos legados sin evaluación se identificarán como tales. No asignarles automáticamente una evaluación «no aplica», ni recalcularlos en masa. Mantener `conceptos_factura.total` como importe base del renglón y diferenciarlo del total neto del documento.

Al integrar la conversión y el timbrado del flujo automático, conservar las bases exactas y aplicar el mismo cuadre documental a los importes aprobados. Incluir el contraste con el CFDI emitido en las pruebas de la etapa 5.

**Criterio de salida:** la tasa 0.0125 sobrevive a guardar, abrir y editar; el backend rechaza manipulaciones y todos los cálculos coinciden al centavo en los casos admitidos.

## Etapa 3 Cotización y embarque

Incorporar la evaluación al agregar o modificar conceptos, cambiar receptor o cambiar el perfil fiscal. Una cotización en preparación podrá guardarse con datos pendientes y mostrará un total provisional. Resolver el estado fiscal antes de enviar o aceptar documentos nuevos como importes definitivos.

Mostrar subtotal, IVA, ISR retenido y total neto por moneda en pantalla y en el [PDF de cotización](../src/generators/cotizacionPdf.tsx). Conservar MXN y USD separados, el tipo de cambio explícito cuando proceda y las restricciones operativas actuales de moneda. La moneda elegida en una tarifa seguirá siendo independiente de la moneda del CRM.

Al crear el embarque, copiar la evaluación y el origen de cada concepto. Cubrir también conceptos manuales, costeo de tarifas y demoras automáticas: todos deben pasar por la misma evaluación al proformar, aunque su captura inicial todavía esté pendiente.

Los cambios fiscales no modificarán silenciosamente una cotización enviada o aceptada. Se presentará la diferencia y se utilizará una revisión explícita con las autorizaciones que correspondan. Conservar los contratos de handover, asignación y promoción operativa del embarque.

El margen seguirá calculándose sobre la venta base y los costos. En una venta de $10,000 con costo de $8,000, la utilidad comercial permanece en $2,000. El umbral comercial existente se seguirá leyendo con `useMargenMinimo`.

**Criterio de salida:** la cotización y el embarque muestran el mismo ISR y total neto por moneda, sin alterar la utilidad comercial ni las transiciones operativas.

## Etapa 4 Proforma y conversión a factura

Actualizar `crear_proforma_atomica` para calcular desde los conceptos elegibles en el servidor y guardar el desglose por moneda. Completar `consolidar_proformas`, sus snapshots y las dos ramas de `_convertir_proformas_insertar_conceptos`. La consolidación conservará bases, tasas, redondeo y procedencia por renglón; agrupar líneas no deberá cambiar el impuesto.

Mostrar el mismo desglose en la proforma, el [PDF](../src/generators/proformaPdf.tsx), el portal del cliente y los resúmenes operativos. La conversión validará que el perfil y receptor siguen siendo compatibles con la versión aprobada. Una diferencia exigirá revisión y, cuando cambie lo autorizado, nueva aprobación antes de emitir.

Las proformas canceladas seguirán siendo terminales. La refacturación mantendrá el contrato vigente: liberar conceptos y abrir la generación de una nueva proforma, conservando la anterior como histórico.

**Criterio de salida:** proforma normal, consolidada y factura resultante conservan el impuesto y el total aprobados, incluido el origen de cada concepto.

## Etapa 5 Factura cobro y documentos relacionados

Aplicar la misma evaluación a facturas capturadas directamente y a las convertidas desde proforma. Antes de iniciar una emisión nueva, comprobar identidad y régimen vigentes en Facturapi contra el perfil usado y validar tasa, importes y totales. Una discrepancia exige corregir/revisar el borrador, sin timbrar con datos distintos de los mostrados.

Enviar el ISR como impuesto retenido con tasa 0.0125 mediante el adaptador existente. Verificar el desglose del XML, PDF y respuesta del proveedor. Conservar idempotencia, recuperación de intentos pendientes y reconciliación: una respuesta incierta o un total inesperado no autoriza a emitir una segunda factura.

Cuentas por cobrar usará el total neto. Distinguir el importe bancario recibido del ISR retenido por el cliente y evitar descontarlo dos veces. Probar pagos parciales PPD, complemento de pago, liquidación final y residuos de centavos. El perfil fiscal actual no sustituirá los datos de una factura histórica al registrar un pago.

En notas de crédito, conservar las tasas del documento origen, limitar el crédito disponible y preservar `concepto_factura_id`. Validar el efecto conjunto en cartera, retención pendiente y pagos. Probar también cancelación y sustitución sin reinterpretar los impuestos del CFDI histórico.

**Criterio de salida:** factura, cobros, REP, notas de crédito y saldo pendiente concilian tanto con ISR solo como con las combinaciones de IVA retenido ya soportadas.

## Etapa 6 Pruebas y liberación

| Grupo | Casos necesarios |
| --- | --- |
| Elegibilidad | PF 626 → PM; PF 626 → PF; PM 626; PF de otro régimen; receptor 626; RFC genérico/extranjero; perfil pendiente o discordante |
| Precisión | Varias líneas, cantidades fraccionarias donde se admiten, precios con decimales, límites de redondeo y consolidación |
| Clasificación | IVA 16%, 8%, 0%, exento; conflicto con No objeto; ISR junto con IVA retenido; tratamiento sin resolver |
| Recorrido | Cotización, embarque manual/automático, proforma normal/consolidada, factura manual y convertida, PDF y portal |
| Documentos derivados | NC parcial/total con linaje, PUE/PPD, dos pagos parciales, pago final, NC antes/después del pago, cancelación y refacturación |
| Historial | Cambios de régimen, RFC o receptor; borradores pendientes; documentos aprobados y timbrados que conservan su versión |
| Acceso y concurrencia | Aislamiento por organización, roles, manipulación de campos, edición simultánea e intentos repetidos sin duplicados |

Ejecutar pruebas focales de dominio/UI, Deno y base de datos aislada; después los checks requeridos por las rutas modificadas. Contrastar CFDI y REP en Facturapi sandbox. Las pruebas y fixtures no se ejecutarán sobre la base productiva ni usarán documentos reales de clientes.

Preparar una migración Drizzle nueva a partir de las definiciones vigentes comprobadas. Actualizar tipos, espejos, baseline y manifiestos conforme a las guías del repositorio. Los archivos históricos de `supabase/migrations` permanecen inmutables.

Desplegar esquema compatible, validaciones de backend y consumidores completos antes de habilitar la automatización por organización. Una organización activa deberá tener perfil confirmado y completar las pruebas del recorrido; la fase intermedia no debe producir proformas sin ISR y facturas con ISR inesperado.

La desactivación de la función detendrá nuevos documentos del flujo afectado si no puede garantizarse el cálculo. Conservará la lectura, recuperación y conciliación de documentos existentes, así como sus snapshots. No se revertirán datos fiscales mediante un recálculo masivo.

La aplicación remota se preparará con su paquete de cambios y validaciones para la autorización de despliegue correspondiente. La entrega de este plan no ejecuta migraciones ni publica una versión del ERP.

## Orden de trabajo

1. Perfil fiscal, sincronización y confirmación de identidad.
2. Contrato fiscal y de redondeo, persistencia y guards del servidor.
3. Cotización y embarque con desglose y conservación de versiones.
4. Proformas normales y consolidadas, conversión y documentos visibles al cliente.
5. Facturas, cobros, REP, notas de crédito y regresiones de historial.
6. Validación integral en entorno aislado, revisión fiscal de los casos previstos y liberación por organización.

La etapa 1 está publicada. La etapa 2 incluye motor, estimación en borrador y persistencia controlada. El siguiente desarrollo lleva la evaluación y el desglose a la cotización y el embarque.
