# Revisión de errores de Sentry (últimos 30 días)

7 errores abiertos de Libre Carga (más 1 de otro proyecto, LiftGo, fuera de alcance).

## Diagnóstico

| Error | Pantalla | Veces | Lectura |
|---|---|---|---|
| 91 / 8B "Failed to fetch" | Oportunidad CRM / Buzón compras | 1 c/u | Corte de internet del usuario; no es bug |
| 90 "Unexpected token '{'" | Inicio | 1, 0 usuarios | Navegador viejo o bot; no reproducible |
| 8H "runtime.sendMessage" | Guía de puertos | 1 | Extensión del navegador; ajeno al ERP |
| 7X carga de módulo fallida | Demoras de venta | 4, 1 usuario | Versión vieja abierta tras publicar; ya hay recuperación automática |
| 8V margen 3.62 < mínimo 9 | Cotización | 2 | Regla de negocio funcionando, pero se reporta como error |
| 8Z correo no pertenece a contactos | Cotización | 1 | Validación correcta, pero se reporta como error |

Ningún error indica una falla real de cálculo, fiscal o de datos.

## Propuesta

1. Investigar 8V y 8Z: confirmar que el usuario ve un mensaje claro en español y que son rechazos esperados.
2. Si son esperados, dejar de enviarlos a Sentry como errores (solo avisos de validación), sin cambiar las reglas.
3. Marcar como resueltos 91, 8B, 90, 8H y 7X con nota explicativa.
4. Prueba focalizada del filtro de avisos de validación.

## Detalles técnicos
- Revisar el punto donde se capturan errores de RPC (`LC_*`) hacia Sentry y excluir códigos de validación conocidos y el 400 del servicio de correo.
- No se tocan reglas de margen ni de destinatarios de correo.
