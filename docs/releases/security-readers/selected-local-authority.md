# Segunda selección: autoridad local

## Resultado

- Nueva selección de 29 avisos: 5 corregidos, 24 activos. No se descartaron avisos ni se modificaron los ajenos a la selección.
- Aplicada 0094: la definición revisada de cada función se verifica antes de cambiar exclusivamente sus bloques de acceso.
- Vínculos de cotizaciones, duplicación de embarques y creación de proformas comprueban los roles existentes dentro de la organización correspondiente, además de sus guards anteriores.
- Eliminar pagos conserva la lista exacta de escritores financieros, aplicada a la membresía local; un pago ya eliminado sólo devuelve confirmación después de autorizar al solicitante.
- Los costos actuales e históricos de una cotización respetan las comprobaciones de lectura del costo actual y filtran sus filas por organización. No se cambia la política del histórico ni auxiliares compartidos.
- Se conserva el orden de idempotencia de duplicación, las firmas, permisos de ejecución, cálculos, bloqueos fiscales y registros históricos. No se tocaron remitentes, destinatarios, saldos, liquidaciones, timbrado ni datos reales.

## Avisos corregidos

| Aviso | Función |
|---|---|
| `lov_db_function_definer_returns_protected_v1_0e55541183f14029` | `obtener_costos_cotizacion_version` |
| `lov_db_function_definer_returns_protected_v1_15f24c675c123d9f` | `crm_vincular_cotizacion` |
| `lov_db_function_definer_returns_protected_v1_2e2a05b1ac89c3bc` | `duplicar_embarque_completo` |
| `lov_db_function_definer_returns_protected_v1_9a0e2ea5bd869d3c` | `crear_proforma_atomica` |
| `lov_db_function_definer_returns_protected_v1_e1a44beb40d6b2ff` | `eliminar_pago_cliente` |

## Validación focalizada

- 12 verificaciones SQL en base local aislada: 6 comparaciones antes/después de resultados autorizados; 5 rechazos de autoridad global superior a la membresía; 1 comprobación de ausencia de escrituras residuales.
- Proforma positiva real en subtransacción: total MXN 100 idéntico antes/después. Reversión de pago también ejecutada y revertida, sin dejar cambios. La duplicación compara la entrada autorizada con cero copias; el vínculo CRM conserva el rechazo comercial de origen no elegible. No afirmar validación integral de ambas operaciones.
- Fixture nuevo complementario, sin alterar fixtures anteriores, sin desactivar triggers ni eliminar constraints. Conserva unicidad de usuarios y usa roles modernos.
- Archivo aplicado idéntico al candidato probado; definiciones vivas se comparan con las cinco salidas esperadas.
- Auxiliares y políticas fijados por Pricing no cambian. Las funciones seleccionadas no pertenecen a ese catálogo fijado.
- Postcheck, regeneración completa de baseline, CI/RLS globales y recorridos visuales quedan pendientes de GitHub Actions según la política local; no se certifica una release completa.

## Pendientes

Los otros 24 avisos siguen activos. Para limitar correos se necesita confirmar destinatarios permitidos, contactos de prospectos y la copia automática al remitente. Los lectores financieros, acciones fiscales, tokens, deduplicación y control de frecuencia requieren su revisión focalizada correspondiente; no se declaran todos pendientes exclusivamente de aprobación comercial.