# Despliegue de etapa 1 del perfil fiscal

Destino: proyecto LibreCarga `341dfc00-0308-4aba-9246-e4b2041e31f1`.
El usuario autorizó publicación y validación sandbox en Chino Cochino.
Este paquete prepara la aplicación; su presencia no demuestra un despliegue.

## Aplicación del esquema

`build-envelope.mjs` genera el SQL a partir de las fuentes inmutables 0066–0068
y verifica sus hashes. No abre conexiones. `envelope.json` fija esos hashes y
la huella del ledger observado. El remoto usa PostgreSQL 17.6; el replay local
se validó en PostgreSQL 17.9.

1. Ejecutar `preflight.sql`, exclusivamente de lectura. Exige el ledger exacto
   hasta 0065, dependencias conocidas y ausencia de los objetos nuevos.
2. Con CI aprobado para el candidato, ejecutar `application.sql` completo una
   sola vez. Bloquea el ledger, revalida el preflight y aplica 0066–0068 con sus
   tres entradas de journal en una transacción. Un error aborta el conjunto.
3. Ejecutar `postchecks.sql`, exclusivamente de lectura: ledger histórico
   intacto, hashes de funciones, ACL y políticas fiscales esperadas.

Ante un timeout, consultar el ledger y el catálogo antes de intentar de nuevo.
Una segunda ejecución completa debe rechazarse. No reparar ni borrar entradas
de historial para forzar su aceptación. El paquete no contiene fixtures,
grants de CI, credenciales, cambios financieros ni regeneración de demo.

## Edge y frontend

Desplegar `facturapi-perfil-fiscal` desde el mismo candidato, con JWT habilitado
y sus dependencias compartidas. Publicar el frontend después del backend.
Las llaves se resuelven con la conexión existente de cada organización y
ambiente; no guardar nuevas llaves ni introducir una llave global.

## Recorrido de aceptación en sandbox

Con una sesión fiscal existente de Chino Cochino: consultar, sincronizar,
resolver cualquier RFC empresarial pendiente con el dato del emisor de prueba,
confirmar y recargar. Comprobar versión, persistencia, ambiente y organización.
Verificar también rechazo de acceso con contexto ajeno y que la conexión
Facturapi conserve su configuración y timestamp. No emitir CFDI ni activar
las rutas públicas de demo. La confirmación de prueba no certifica datos ante
el SAT ni activa la retención de ISR de la etapa 2.

Conservar resultados y capturas sin secretos en `test-results/deploy90/` y
registrar el resultado de publicación en el PR de la entrega.
