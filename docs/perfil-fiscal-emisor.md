# Perfil fiscal del emisor — etapa 1 integrada

Integración local del 2026-11-15, versión candidata **13.824.90**, sobre
`38015309fbca49e72fe2f12da160e4b8029dfacc`. Rama `codex/perfil-fiscal-integrado`.
Esta etapa prepara la identidad fiscal; **no activa el cálculo de ISR** ni
modifica facturas, proformas, cobros o CFDI existentes.

## Uso y aislamiento

La tarjeta **Configuración → Facturación → Datos fiscales del emisor** permite
consultar, sincronizar y confirmar RFC, razón social, tipo de persona, régimen
y código postal. Un usuario fiscal autorizado revisa la constancia fiscal y
confirma su correspondencia; puede indicar una fecha efectiva válida. La
sincronización no certifica los datos ante el SAT.

Cada emisor conserva su organización y sus credenciales de Facturapi. Sus
empleados fiscales autorizados comparten ese perfil. El adaptador resuelve la
llave por organización y ambiente desde la conexión existente, sin fallback a
una llave global. La UI no recibe llaves, certificados ni la respuesta completa
del proveedor. Los datos importados se corrigen en Facturapi y el RFC de Empresa
se corrige en LibreCarga.

El proveedor se consulta con `GET /organizations/me`, documentado en la
[API oficial de Facturapi](https://docs.facturapi.io/api/). Se compara la identidad
obtenida con la vinculada; una discrepancia no reemplaza silenciosamente el ID.

## Contrato integrado

- `perfiles_fiscales_emisor`: versiones por organización y ambiente. RLS exige
  organización activa y rol fiscal. No hay DML directo para authenticated/anon.
- `facturapi-perfil-fiscal`: JWT, rol fiscal y RPC con organización activa antes
  de resolver credenciales o contactar al proveedor. Acciones `consultar`,
  `sincronizar` y `confirmar`; errores públicos sin datos sensibles.
- `registrar_perfil_fiscal_emisor`: ejecución exclusiva de service_role;
  revalida actor, RFC y conexión, bloquea la fila de credenciales y comprueba
  timestamp/versión esperados antes de insertar.
- `obtener_perfil_fiscal_emisor` y `confirmar_perfil_fiscal_emisor`: JWT fiscal
  ligado a la organización activa. Confirmar exige la versión vigente y una
  conexión coherente; un cambio de RFC o credenciales exige nueva revisión.
- `_perfil_fiscal_emisor_resultado`: helper privado del backend. Los consumidores
  futuros deben comprobar el estado calculado, no sólo `confirmado_at` histórico.
- La caché separa organización, ambiente y usuario. Las respuestas y avisos
  tardíos no se muestran en otro contexto. Fechas imposibles se rechazan en
  UI/Edge; una fecha futura se rechaza en SQL.

## Migraciones y compatibilidad

La **0065 de brokers que ya está en main permanece intacta**. Las migraciones
locales previas, que no se habían publicado, se acomodan de esta forma:

| Migración candidata | Contenido |
|---|---|
| `0066_facturas_filtros_globales.sql` | Corrección previa de filtros y paginación de facturas |
| `0067_broker_trigger_acl.sql` | Corrección previa de ACL de funciones de trigger |
| `0068_perfil_fiscal_emisor.sql` | Perfil fiscal de esta etapa |

El borrador `0059_perfil_fiscal_emisor.sql` de la carpeta original no se aplica.
Se conservó su implementación y se agregó la política restrictiva de tenant de
0068. Sus copias en `scripts/ci/drizzle-history` son exclusivamente de replay
aislado; no se agregó otra ruta de despliegue en `supabase/migrations`.

El manifest de 13.824.90 preserva sus entradas históricas e inventaría los mismos
1542 archivos Supabase. **No aplica las migraciones Drizzle**. Journal, snapshots,
hashes y admisiones de 0066–0068 están registrados por separado.

## Validación realizada

- PostgreSQL **17.9 nativo**, clúster vacío en loopback: bootstrap/squash,
  348 migraciones Supabase y 47 fuentes Drizzle aisladas, incluida 0068.
  Sólo se conserva la exclusión de datos previamente autorizada.
- Suite fiscal aprobada **antes y después** de los grants de CI: dos
  organizaciones, empleados fiscales, anon, operador, usuario sin identidad,
  superadministrador con/sin tenant, versiones y cambios de conexión/RFC.
- Tres carreras reales de dos conexiones: un ganador y un conflicto al
  sincronizar la misma versión; credenciales modificadas durante la espera;
  confirmación obsoleta rechazada y confirmación de la última versión aprobada.
- **69/69 suites RLS y 239/239 guards** aprobados. Integridad sin hallazgos.
  La validación de evidencia comprueba las 69 rutas exactas, sin faltantes,
  duplicados ni suites adicionales. El snapshot posterior a todas las pruebas
  coincide byte por byte con la baseline.
- Frontend fiscal: **23 pruebas** focales. Regresión de los flujos existentes:
  **133 pruebas en 19 suites** sobre el código actualizado, sin skips ni fallos
  (Embarques, Facturación, DataTable y antigüedad de CxC/CxP).
  Edge y runner sandbox: **22 pruebas** (8 de handler, 4 de proveedor,
  7 de sincronización y 3 del runner), sin permitir red durante las pruebas
  unitarias y con sanitizadores de operaciones y recursos habilitados.
- Contratos de historia/modelo: **125 pruebas**. Auditores de migraciones,
  espejos, funciones canónicas, columnas, RPC y manifest aprobados.
- Contratos del catálogo, evidencia y aislamiento de CI y preservación SQL de
  checkouts Windows: **47 pruebas** aprobadas. Los tres contratos que lanzan
  Bash requirieron incorporar el runtime Bash local al PATH de Windows;
  se repitieron con ese entorno y pasaron, sin cambiar los tests.
- TypeScript y compilación de producción aprobados. La compilación conserva
  avisos de tamaño de chunks; no hubo errores de compilación.
- Lectura **real de Facturapi sandbox** con el adaptador del producto:
  `org_match=true`, régimen `601`, persona moral y RFC enmascarado. Se usó la
  llave sandbox de la organización ya configurada, sin cambiarla ni enviarla
  a logs. No se emitieron documentos ni se escribieron datos remotos.

El emisor sandbox disponible es persona moral 601; los casos PF/626 de esta
etapa se comprobaron con fixtures locales. El GET real prueba la lectura y la
identidad del proveedor; no sustituye el recorrido UI → Edge desplegada →
persistencia remota, que se verificará tras desplegar el candidato.

El baseline se generó con `pg_dump 17.9`. Los tipos fiscales se obtuvieron con
el generador oficial de Supabase sobre esa base, en transacción de sólo lectura:
una tabla, cuatro funciones y la dependencia `ComputedFields: never` de la fila
de credenciales. No se alteraron sus campos Row/Insert/Update/relaciones ni enums
ajenos. El extractor verificable está en
`scripts/qa/incorporar-tipos-perfil-fiscal.mjs`.

Evidencias locales ignoradas por Git: `test-results/resico/` (replay, sandbox,
baseline, tipos generados, RLS, guards, auditorías y compilación) y
`test-results/perfil-fiscal/` (Deno, concurrencia y contratos). El runner sandbox
reutilizable es `scripts/qa/perfil-fiscal-sandbox-readonly.ts`; requiere una llave
de prueba y el ID esperado por variables de entorno, nunca por argumentos CLI.

No se declara aprobado el CI remoto ni todo `database-full.sh`: las extensiones
de pruebas que exigen contenedores propios de GitHub Actions y los checkpoints
históricos de demo no se ejecutaron. La demo sigue deshabilitada. Las dos deudas
preexistentes de espejos continúan acotadas por sus huellas originales.

## Entrega al entorno destino

1. Comparar el ledger Drizzle y el catálogo con el commit candidato; aplicar
   únicamente los forwards pendientes. La lectura remota del 2026-11-15 confirmó
   que la tabla y las cuatro funciones fiscales todavía no estaban instaladas;
   repetir el preflight al desplegar, porque el estado puede cambiar.
2. Aplicar esquema compatible y comprobar ACL/RLS. Nunca ejecutar los fixtures
   ni los grants amplios del harness contra el backend compartido.
3. Desplegar `facturapi-perfil-fiscal` con JWT habilitado y las credenciales por
   organización ya existentes. No crear una llave global para esta función.
4. Publicar la UI después del backend. En sandbox, probar consulta,
   sincronización, confirmación y cambio de contexto con un usuario fiscal.

Esta integración no realizó esos despliegues. Si se retira el frontend,
conservar la tabla y las versiones; no borrar datos fiscales como rollback.
El siguiente desarrollo es la etapa 2 del [plan RESICO](plan-isr-resico.md).
