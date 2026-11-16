# Plan de retención de ISR RESICO en LibreCarga

Propuesta inicial del 13 de noviembre de 2026. Las etapas 1 y 2 están publicadas en LibreCarga 13.824.91. La etapa 1 integró el perfil fiscal por organización en el [PR #494](https://github.com/jfcaicedoobando-arch/librecarga/pull/494). La etapa 2 incorporó la evaluación, la persistencia controlada y el cuadre documental en el [PR #495](https://github.com/jfcaicedoobando-arch/librecarga/pull/495). El alcance va desde la cotización hasta el cobro para organizaciones que emiten como persona física RESICO.

El resultado esperado es que el cliente vea el importe correcto a pagar desde los documentos comerciales y que ese mismo desglose llegue al CFDI, a cuentas por cobrar y al complemento de pago. La retención se calcula con los datos fiscales de la organización emisora y del receptor.

## Dónde se registra el régimen

Actualmente, el régimen del emisor se captura en **Facturapi → Configuración → Datos fiscales**, dentro de la organización que factura. Esta es la ruta documentada por [Facturapi](https://docs.facturapi.io/docs/getting-started/organization-onboarding/).

En LibreCarga, el perfil se consulta, sincroniza y confirma en **Configuración → Facturación → Datos fiscales del emisor**. La confirmación se guarda por organización, ambiente y versión del perfil.

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
| Perfil emisor | [Etapa 1 publicada](https://github.com/jfcaicedoobando-arch/librecarga/pull/494) | Mantener sincronización y confirmación por organización y ambiente |
| Receptor | [ClienteFiscalSelects](../src/features/cliente/components/ClienteFiscalSelects.tsx) | Reutilizar los datos del cliente y validar identidad/tipo de persona |
| Selector ISR | [Etapa 2 publicada](https://github.com/jfcaicedoobando-arch/librecarga/pull/495) | El editor de factura ofrece 0%, 1.25% y 10% y puede estimar el ISR con el perfil confirmado |
| Cotización | [conceptos de venta](../src/features/cotizacion/domain/cotizacion.conceptos.ts), [resumen](../src/features/cotizacion/components/ResumenTotalesCotizacion.tsx) | Propagar evaluación fiscal y desglosar retención por moneda |
| Embarque y proforma | La migración 0069 agrega tasa, monto y evaluación a conceptos de venta y conceptos consolidados | Llevar el cálculo aprobado y la procedencia por renglón a ambos caminos de conversión |
| Factura | `conceptos_factura` ya guarda tasas e importes; `recalc_factura_totales` descuenta las retenciones | Reutilizar columnas y validar aplicación automática en servidor |
| Timbrado | [helpers de emisión](../supabase/functions/facturapi-emitir/helpers.ts) construyen impuestos con `withholding: true` | Verificar perfil, cálculo, payload y XML con tasa 0.0125 |
| Cobros y REP | `calc_pago_retenciones` prorratea; [pruebas REP](../supabase/functions/facturapi-emitir-rep/helpers_test.ts) ya contienen una tasa 0.0125 | Probar el flujo completo, pagos parciales y notas de crédito |

Las funciones y columnas SQL citadas se encuentran en el [baseline versionado](../supabase/schema/baseline.sql). Su existencia no certifica la definición remota actual.

La edición de un concepto «No objeto» pone sus retenciones en cero y el emisor rechaza retenciones con ObjetoImp 01. Si la evaluación RESICO requiere ISR en un concepto así clasificado, la línea queda pendiente de revisión fiscal.

El cuadre de la etapa 2 usa bases exactas e impuestos agrupados en la cabecera de facturas pendientes de timbrado con ISR de 1.25%. El detalle por renglón conserva sus importes. Las etapas siguientes llevarán ese cálculo a los documentos comerciales que alimentan la factura.

## Etapa 1 Perfil fiscal del emisor

**Publicada con la migración 0068.** Se verificaron consulta, sincronización y confirmación con Chino Cochino sandbox. Cada emisor tiene su propia organización y credenciales. Sus empleados autorizados comparten ese perfil. [PR #494](https://github.com/jfcaicedoobando-arch/librecarga/pull/494)

La tarjeta **Configuración → Facturación → Datos fiscales del emisor** muestra RFC, razón social, tipo de persona, régimen, código postal, ambiente, última sincronización y estado de confirmación. Incluye **Sincronizar desde Facturapi** y acceso a la configuración del proveedor.

El adaptador consulta `GET /organizations/me` con la credencial de la organización y del ambiente solicitados y comprueba que la identidad corresponde a la conexión vinculada. [Referencia de Facturapi](https://docs.facturapi.io/api/)

`perfiles_fiscales_emisor` guarda identidad, datos fiscales, ambiente, versión, sincronización y confirmación por organización. La confirmación conserva la fecha efectiva cuando se registra y las versiones utilizadas por documentos permanecen disponibles.

Sincronizar datos no equivale a verificarlos ante el SAT. Un usuario con permiso fiscal confirmará su correspondencia con la constancia fiscal. Se reutilizará el límite de permisos de emisión fiscal para administrar este perfil, con validación efectiva en servidor. Las lecturas operativas expondrán solo los datos necesarios para calcular y mostrar impuestos.

Sandbox y producción conservarán su procedencia separada. Una configuración de prueba no habilitará un emisor de producción. Una discordancia entre RFC de Empresa, identidad vinculada y perfil recibido impedirá confirmar el perfil hasta corregirla.

**Criterio de salida:** dos organizaciones distintas pueden sincronizar sus respectivos perfiles sin leer ni modificar los datos de la otra, y el régimen confirmado se muestra sin exponer llaves ni certificados.

## Etapa 2 Regla central y almacenamiento

**Publicada con las migraciones 0069 y 0070.** La evaluación devuelve `aplica`, `no_aplica` o `pendiente` y conserva su versión. La estimación de factura consulta al servidor. Los controles de la 0069 mantienen bloqueadas las transiciones de documentos evaluados que todavía perderían datos fiscales.

La 0070 suma las bases exactas y redondea cada grupo de impuesto y tasa en la cabecera de la factura. Después del despliegue coincidieron los nueve totales de vistas previas de Facturapi sandbox con Chino Cochino, incluido **$230.42** para dos renglones de $100.40. Chino Cochino usa un emisor persona moral 601. El caso persona física 626 con receptor persona moral pasó en PostgreSQL 17.9 aislado con datos sintéticos. [PR #495](https://github.com/jfcaicedoobando-arch/librecarga/pull/495)

El resultado de la evaluación incluye tasa, motivo, base y versión del perfil y de la regla. El servidor calcula con los registros de la organización y del cliente. El selector conserva la tasa `isr_1_25` al guardar y reabrir la factura.

La 0069 define el almacenamiento de tasa, importe y evaluación en `conceptos_venta`, el JSON de cotizaciones y `proforma_conceptos_consolidados`. Las etapas siguientes propagan esos datos al documento de destino y reutilizan `conceptos_factura` y sus snapshots.

Los documentos legados sin evaluación se identificarán como tales. No asignarles automáticamente una evaluación «no aplica», ni recalcularlos en masa. Mantener `conceptos_factura.total` como importe base del renglón y diferenciarlo del total neto del documento.

Las etapas siguientes llevarán a cada documento los importes aprobados y el cuadre por grupos validado en la 0070. Reutilizarán los vectores de prueba en PostgreSQL, interfaz, PDF y Edge. El precio que ya incorpora un descuento seguirá siendo la base de cálculo correspondiente.

**Criterio de salida:** la tasa 0.0125 sobrevive a guardar, abrir y editar; el backend rechaza manipulaciones y todos los cálculos coinciden al centavo en los casos admitidos.

## Etapa 3 Cotización y embarque

**Avance local.** La 0071 ya tiene pruebas de evaluación, autorización, revisión de cotización y conversión a embarque con datos sintéticos. Pantalla y PDF reproducen $230.42, y PostgreSQL 17.9 comprueba los mismos grupos de impuestos en el embarque. La 0072 incorpora la revisión autorizada cuando cambia el cliente o la base del embarque con evaluación guardada. La revisión conserva el antes y el después, los conceptos originales, el motivo y el actor.

### Entrega 3A Evaluación y desglose de la cotización

1. Integrar `evaluar_isr_resico` en el flujo de conceptos y el guardado de cotización. El servidor recalcula al cambiar cliente, perfil fiscal, cantidad, precio o clasificación de IVA. La interfaz descarta respuestas de evaluaciones anteriores cuando cambia alguno de esos datos o la organización activa.
2. Guardar borradores con evaluación pendiente y mostrar el motivo junto al total provisional. Antes de enviar o aceptar un documento nuevo como definitivo, comprobar en el servidor que la evaluación está resuelta y corresponde a sus datos actuales. El guard de cotización debe convivir con la autorización comercial y las reglas vigentes de prospectos.
3. Guardar el desglose aprobado con la versión fiscal y la procedencia de los conceptos. Usar ese mismo desglose en pantalla, PDF de cotización y PDF adjunto por correo. Adaptar `conceptosTables.ts` y la caja de totales para que esos consumidores lean los importes aprobados. Una cotización enviada o aceptada conserva sus importes hasta una revisión explícita si cambia el perfil, el receptor o la operación.

Mostrar subtotal, IVA, ISR retenido, IVA retenido cuando corresponda y total neto por moneda. Mantener MXN y USD separados y usar el tipo de cambio explícito cuando proceda. La moneda elegida en una tarifa se conserva en el formulario y en el guardado, independientemente de la moneda del CRM.

### Entrega 3B Conversión y edición del embarque

1. Ampliar `crear_embarque_borrador_core` y `_crear_embarque_replicar_conceptos` para copiar la evaluación aprobada, la moneda y el concepto origen. Cuando haya prorrateo por contenedor, comprobar que las partes conservan la base y el impuesto documental al centavo. Reintentar la conversión debe recuperar el mismo conjunto de conceptos.
2. Conservar evaluación e ISR al abrir y editar el embarque. Usar la misma regla para ventas manuales, tarifas y demoras. Si cambia el cliente o la base aprobada, presentar la diferencia y recalcular mediante la revisión correspondiente. La creación del handover, la asignación y la promoción de la cotización siguen las transiciones existentes.
3. Actualizar los controles de la 0069 para permitir el recorrido comercial que ya preserve el desglose. Las proformas y facturas del flujo automático seguirán sujetas a los controles de sus etapas.

El margen se calcula sobre la venta base y los costos. Una venta de $10,000 con costo de $8,000 conserva una utilidad de $2,000. Reutilizar `useMargenMinimo` para la autorización comercial.

**Criterio de salida.** Con una organización sintética PF 626 y un receptor persona moral, guardar, reabrir, aprobar y convertir una cotización. Pantalla, PDF y embarque muestran el mismo ISR y total neto por moneda. El caso de dos renglones reproduce $230.42 y el margen conserva los $2,000 del ejemplo. Validar además receptor persona física, emisor 601, datos pendientes, cambio de cliente durante una evaluación, prorrateo y reintento de conversión.

## Etapa 4 Proforma y conversión a factura

**Avance local 4A.** La 0073 guarda el desglose por moneda y los renglones de la proforma normal. Las pruebas cubren $2.51 de ISR y $230.42 de neto, USD sin duplicar su equivalente en MXN, respuesta por token, cancelación y regeneración.

**Avance local 4B.** La 0074 consolida proformas fiscales del mismo embarque y conserva las bases exactas y el origen de cada renglón. En el caso de prueba, dos proformas suman $230.40 y el cálculo agrupado da $230.42. El sistema exige aprobar los $0.02 de diferencia antes de publicar el consolidado. PostgreSQL 17.9 validó los permisos, la trazabilidad y los importes del portal y correo. Las pruebas de interfaz y PDF reprodujeron la revisión y los importes guardados.

**Avance local 4C.** La 0075 convierte la proforma aceptada en un borrador por moneda. PostgreSQL 17.9 comprobó $230.42 MXN con $2.51 de ISR y un borrador separado de $114.75 USD. Los borradores conservan la revisión del perfil y el origen de los conceptos. La conversión exige revisar si cambió el RFC del receptor. El timbrado de estos borradores pasa por la validación de la etapa 5A.

1. **Proforma normal.** Extender `crear_proforma_atomica` para calcular desde los conceptos elegibles y guardar el desglose aprobado por moneda. Distinguir importes en moneda original de la equivalencia en MXN que ya calcula la proforma.
2. **Consolidación.** Extender `consolidar_proformas` para conservar conceptos origen, bases exactas y grupos compatibles de IVA y retenciones. Recalcular el documento consolidado por moneda, impuesto y tasa. Si el redondeo cambia el importe frente a los documentos aprobados, mostrar la diferencia y obtener nueva aprobación antes de convertir.
3. **Factura desde proforma.** Completar ambas ramas de `_convertir_proformas_insertar_conceptos` y la cabecera de `convertir_proformas_a_factura`. Conservar aceptación, idempotencia, separación por moneda y trazabilidad hasta el concepto de origen. Validar que perfil y receptor siguen siendo compatibles con la versión aprobada.
4. **Documentos y estados.** Mostrar el desglose guardado en proforma, PDF y portal del cliente. Adaptar los controles de asignación, envío, respuesta, consolidación y refacturación de la 0069 como un conjunto. La cancelación conserva el histórico y libera los conceptos para generar una proforma nueva.

Probar la conversión en entorno aislado y emitir los borradores evaluados después de revalidar su perfil y cálculo en la etapa 5A.

**Criterio de salida.** El PDF y el portal muestran el desglose aprobado de cada proforma, normal o consolidada. La factura borrador conserva la versión fiscal y los totales por moneda de la proforma que se convierte. Los reintentos conservan los vínculos, las canceladas siguen siendo terminales y una diferencia de identidad o de importe requiere revisión.

## Etapa 5 Factura, timbrado y cobro

### Entrega 5A Factura y timbrado

**Avance local 5A.** La 0076 calcula el ISR al guardar la factura manual con la automatización activa. PostgreSQL 17.9 comprobó $230.42 de neto y $2.51 de ISR, y conservó $8.03 de IVA retenido cuando ya estaba registrado en el borrador. La factura manual y la convertida verifican el perfil, el receptor y el desglose antes de emitir. El módulo de emisión coteja la identidad de la llave de la organización con respuestas simuladas de Facturapi.

La 0077 registra el intento antes de emitir. Las pruebas en PostgreSQL 17.9 conservan la reserva ante un timeout o un descuadre, separan el rechazo definitivo de esos casos y conservan los datos aprobados aunque el catálogo del cliente cambie. La confirmación repetida con la misma evidencia devuelve el mismo resultado.

La 0078 conecta emisión, recuperación y webhook al intento guardado. El adaptador envía una sola solicitud con el mismo identificador de correlación e idempotencia. Contrasta la respuesta y el XML con el perfil y los importes aprobados antes de confirmar. La recuperación usa la llave de la organización y el ambiente original del intento. El webhook recibe las notificaciones de ese ambiente en su URL registrada con `amb` y consulta el comprobante antes de guardar el resultado. La prueba de emisión con Facturapi simulado reprodujo $230.42 y $2.51 de ISR. PostgreSQL 17.9 comprobó la confirmación idempotente y el registro del webhook únicamente cuando existe evidencia del timbrado en la organización.

1. Usar la evaluación del servidor en la factura manual y en la convertida. Antes de emitir, verificar que la identidad y el régimen devueltos por Facturapi coinciden con el perfil usado, con la credencial del emisor y el ambiente de la operación. Comparar subtotal, IVA, ISR retenido, IVA retenido y neto con el cuadre documental de la 0070.
2. Enviar la retención de tasa `0.0125` mediante el adaptador existente y cotejar el desglose del XML, el PDF y la respuesta del proveedor. Congelar la versión fiscal del documento emitido. Una discrepancia previa devuelve el borrador a revisión. Una respuesta incierta, o un desacuerdo después de emitir, conserva el intento y sus identificadores para conciliación e impide una segunda emisión automática.

### Entrega 5B Cobranza y documentos derivados

**Avance local 5B.** La 0079 usa el neto de la factura y resta los importes de las notas de crédito vigentes. Prorratea ambos impuestos en moneda de la factura y aplica el residuo en la liquidación. PostgreSQL 17.9 verificó una factura de $222.39 con $2.51 de ISR y $8.03 de IVA retenido, notas antes y después de un cobro, una parcialidad recibida en USD, saldo cero y reemplazo de un pago con REP cancelado. La nota de crédito guarda el cuadre por impuesto y tasa. El atajo de saldo completo conserva los renglones de origen, y el servidor valida sus tasas y reserva el saldo durante el timbrado.

El REP y la nota de crédito usan el receptor guardado en el CFDI original y verifican la llave del mismo ambiente y organización. Las pruebas con respuestas simuladas cubren el receptor histórico, el cálculo del saldo y la parcialidad después de una cancelación, y el cuadre de un egreso de dos renglones.

La 0080 concilia y recupera notas de crédito. La nota conserva la reserva hasta comprobar el XML y el UUID de la factura relacionada. Se revisan el subtotal, el IVA, ambas retenciones, el total y la identidad fiscal antes de aplicar el crédito a cartera. Un XML discordante conserva el mismo intento. Se verificó la recuperación, el rechazo definitivo y el registro idempotente con datos sintéticos. La cancelación usa el ambiente guardado en la nota y, si se solicita una sustitución, exige que el comprobante sustituto pertenezca a esa organización y ambiente.

El verificador del REP ya comprueba el intento, la identidad fiscal, la parcialidad y los saldos en un XML de Pagos 2.0. Valida los impuestos en moneda de la factura y del pago, además de los totales en MXN. Las pruebas con XML sintético obtuvieron $1.81 de IVA retenido en la parcialidad de $50 MXN y $1.44 en la parcialidad de $2 USD aplicada por $40 MXN. Cartera estimaba $1.80 y $1.45. Falta integrar el verificador a la emisión y recuperación, y registrar en cartera las retenciones del XML verificado.

1. Usar el neto aprobado en cartera y distinguir efectivo recibido de ISR retenido. Revisar `calc_pago_retenciones` con pagos parciales PPD, complemento de pago (REP), liquidación final, otra moneda y residuos de centavos. El pago toma los datos fiscales de la factura origen.
2. Preservar tasas y `concepto_factura_id` en notas de crédito, limitar el crédito disponible y comprobar el efecto en cartera antes y después de un pago. Probar coexistencia de retenciones de ISR e IVA, cancelación y sustitución a partir de los datos fiscales de los CFDI originales.

**Criterio de salida.** Factura manual y convertida concilian con XML, PDF y respuesta de Facturapi sandbox. Dos pagos parciales y su liquidación, con una nota de crédito en los casos previstos, concilian al centavo con REP y saldo de cartera. Un intento interrumpido se recupera sin duplicar CFDI.

## Etapa 6 Pruebas y liberación

### Entornos y credenciales

| Entorno | Validación |
| --- | --- |
| PostgreSQL 17.9 aislado y pruebas de UI/PDF | Reutilizar `test_rls_isr_resico.sql` y los vectores de redondeo. Simular emisor PF 626, receptor persona moral, emisor 601 y una segunda organización. Suficiente para desarrollar y cerrar las etapas 3 y 4 en QA. |
| Chino Cochino en Facturapi sandbox | Repetir los nueve totales PDF con el perfil 601 y la credencial de su organización cuando cambie el cuadre. |
| Emisor PF 626 en Facturapi sandbox | Conseguir una identidad de prueba reconocida por Facturapi y su llave sandbox independiente. Es la dependencia pendiente para el timbrado y los documentos derivados de la etapa 5 y la habilitación de la etapa 6. |

### Matriz de regresión

| Grupo | Casos necesarios |
| --- | --- |
| Elegibilidad | PF 626 → PM; PF 626 → PF; PM 626; PF de otro régimen; receptor 626; RFC genérico/extranjero; perfil pendiente o discordante |
| Precisión | Varias líneas, cantidades fraccionarias donde se admiten, precios con decimales, límites de redondeo y consolidación |
| Clasificación | IVA 16%, 8%, 0%, exento; conflicto con No objeto; ISR junto con IVA retenido; tratamiento sin resolver |
| Recorrido | Cotización, embarque manual/automático, proforma normal/consolidada, factura manual y convertida, PDF y portal |
| Documentos derivados | NC parcial/total con linaje, PUE/PPD, dos pagos parciales, pago final, NC antes/después del pago, cancelación y refacturación |
| Historial | Cambios de régimen, RFC o receptor; borradores pendientes; documentos aprobados y timbrados que conservan su versión |
| Acceso y concurrencia | Aislamiento por organización, roles, manipulación de campos, edición simultánea e intentos repetidos sin duplicados |

Ejecutar pruebas de dominio, UI, PDF con el renderizador real, Deno y PostgreSQL aislado según el cambio de cada entrega. Cubrir navegación por teclado, pantallas estrechas y totales en PDFs multipágina. Verificar con CI las rutas modificadas y usar datos sintéticos en la prueba integral.

### Habilitación por organización

1. Para cada cambio de esquema, preparar una migración Drizzle nueva a partir de las definiciones vigentes comprobadas. Actualizar tipos, espejos, baseline y manifiestos aplicables. Validar el replay y mantener la 0069, la 0070 y la historia de `supabase/migrations` intactas.
2. Desplegar esquema compatible, backend, Edge y consumidores completos. Habilitar la automatización en una organización piloto cuando su perfil esté confirmado y la prueba integral en sandbox haya conciliado desde cotización hasta cobro. Verificar permisos y que cada organización sigue usando sus credenciales del ambiente correspondiente.
3. Revisar en el piloto las discrepancias de perfil, importes, timbrados pendientes y conciliaciones antes de ampliar la habilitación. Si hay una discrepancia fiscal, pausar nuevas operaciones automáticas del flujo afectado y conservar la consulta, los snapshots, la recuperación y la conciliación de los documentos emitidos.

**Criterio de salida.** El piloto puede completar y conciliar el recorrido fiscal. Aislamiento, reintentos, cancelaciones y documentos históricos pasan los controles. La habilitación adicional se realiza por organización.

## Siguiente entrega

Continuar con **5B** para conciliar y recuperar los REP con sus importes y XML, y verificar la sustitución de facturas. La validación integral de 5A y 5B requiere cotejar la respuesta de Facturapi, el XML y el PDF con una identidad PF 626 aceptada por Facturapi sandbox y la llave de prueba de esa organización.
