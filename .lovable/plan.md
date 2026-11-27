# Corregir error «falta el vínculo con el CRM» al cotizar desde Pricing

## Qué pasa
La cotización de Yvonne sí se guardó, pero el paso que la liga a la oportunidad y a la solicitud de Pricing la rechazó con el candado `LC_PRICING_ACL_DRIFT`.

Ese paso guarda una "foto" exacta de los permisos de varias tablas y se niega a trabajar si la foto ya no coincide. Es como un cerrajero que no abre la puerta porque la cerradura cambió de color, aunque la llave sea la misma.

Revisé la base. Sólo dos permisos difieren de la foto, y en los dos el cambio es de forma: `auth.uid()` pasó a escribirse `(SELECT auth.uid())`, una optimización de rendimiento. Quién puede entrar no cambió:
- `cotizaciones` → «Cliente read own cotizaciones»
- `crm_solicitudes_pricing` → «crm_sol_pricing_editar»

Este candado afecta a todos los usuarios que cotizan desde una solicitud de Pricing, no sólo a Yvonne.

## Arreglo
1. Crear una migración nueva que vuelva a declarar `crm_vincular_cotizacion_cliente_pricing` con la definición que hay ahora en la base. Sólo cambia el texto de esas dos entradas en la foto, para que coincida con el texto actual. El resto de la foto, los demás candados, los permisos de ejecución y la lógica se quedan igual.
2. Actualizar `supabase/schema/crm/crm_vincular_cotizacion_cliente_pricing.sql` y la baseline (`db:postcheck`).
3. Volver a ligar la cotización `019ed164-…` de Yvonne con la oportunidad `26f3373d-…`, la solicitud `8a69d9b6-…` y la tarifa `a4594d49-…`. Ella puede reintentarlo desde la pantalla, o yo puedo hacerlo con la misma función usando su contexto de usuario.

## Verificación
- Una consulta que compare la foto con los permisos actuales y no encuentre diferencias.
- Un ensayo que se deshace al final: ligar una cotización como usuario admin_org de Elogistix sin que aparezca `LC_PRICING_ACL_DRIFT`.
- `db:postcheck` en verde. CI/RLS completos quedan pendientes en GitHub Actions.

## Detalles técnicos
- La comparación se hace en el bloque `$policies$` dentro de la función (migración 0115). Ninguna otra función usa una foto de este tipo.
- Si se mantiene la regla de AGENTS.md «actualizar sólo la entrada fijada», no se agrega ningún permiso ni se amplía ninguno.
