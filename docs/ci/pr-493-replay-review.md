# PR493: completar replay aislado0057–0064

Las fuentes ya presentes en `drizzle/migrations` no se modifican. Sus copias en
`scripts/ci/drizzle-history` conservan todos los bytes y se ejecutan en el orden
del journal existente, sólo en bases desechables de verificación.

-0057 actualiza exclusivamente la huella literal de políticas de
  `crm_vincular_cotizacion_cliente_pricing` después de0047 y comprueba su igualdad.
-0058 conserva el envío de Pricing y corrige los appends de texto de faltantes.
-0059 y0061 agregan los valores enum broker y Broker en pasos separados de su uso.
-0060 crea la identidad broker, su vínculo con empresas y la lectura del portal.
-0062 agrega solicitudes, autorización y alta atómica del prospecto con KAM por turno.
-0063 agrega las lecturas de solicitudes del portal y la bandeja interna.
-0064 agrega comisiones y liquidaciones de brokers, triggers de reparto y RPC de
  porcentajes/pago, sin redefinir `calcular_comision_pago`.

Ninguna fuente redefine `crear_embarque_borrador_core` ni
`sync_cotizacion_embarque_link`, los dos destinos del modelo dinámico0035.
Se fijan sus hashes en el historial, el mapa de replay y el modelo, manteniendo
los rechazos por bytes alterados, orden distinto o copias elegibles para deploy.
La revisión acredita esta composición de pruebas; no acredita aplicación remota.

La tabla0052 `proforma_email_intentos` obtiene su organización de `proformas`.
La prueba histórica de limpieza demo ahora detecta explícitamente esa forma
incompatible con el guard antiguo, exige su rechazo y comprueba además el bloqueo
incondicional vigente antes del lock y de cualquier escritura. No se agrega una
excepción global ni se modifica el seed o su migración.

## Corrección forward 0065

La reconstrucción real detectó que las cuatro tablas de Brokers carecían del
candado Ola16 de super admin por tenant activo.0065 agrega cuatro políticas
RESTRICTIVE FOR ALL TO authenticated con el mismo predicado y WITH CHECK de0036.
El predicado mantiene las políticas permisivas previas como requisito y sólo
acota al super admin mediante `rls_tenant_scope_ok`; el broker externo conserva
sus organizaciones y RPC. No modifica roles, grants, funciones ni datos.

Se registra una nueva migración y su copia aislada; el journal anterior queda
intacto. La suite obligatoria `brokers_tenant_scope` verifica las cuatro políticas
y acceso real sin tenant, con tenant activo, admin de organización y broker.
El deployment web no aplica esta migración a una base remota.
