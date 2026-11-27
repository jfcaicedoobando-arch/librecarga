/** Read-only verification/listing of test-only history; never connects to a DB. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const DIR = 'scripts/ci/drizzle-history';
const COMMIT = 'ec96cf2e4bbb4443be463f1496da0189df2d1bef';
const ARCHIVE = `archive/${COMMIT}`;
const AUTHORITY_PREIMAGES = 'preconditions/authority-0092-0094.sql';
const AUTHORITY_PREIMAGES_SHA256 = 'f44cca1dbe2e9fecb0202920c3a95f9061a58155fb424957a2bed354e54b23f5';
// Explicit historical order: the archived idx 22 predates the current idx 22.
export const HISTORY = [
  { file: '0021_refacturar_proforma_rpc.sql', sha256: '8f5c299f5c593fe398e620056d8a2971a9f9ed4e90940310df173023fa9572e5', eligibleName: '20261026184800_replay_refacturar_proforma_rpc.sql' },
  { file: `${ARCHIVE}/0022_refacturar_proforma_abre_edicion.sql`, sha256: '8b4272fdc0abdbbbedac41c46e28694f611a59c240e0509bdf02ec2f8b9446fa' },
  { file: '0022_cotizacion_comercial.sql', sha256: '5cc034df0035d1f9b1722aa9bfad12ff68965bde22273500f55903bf9b60ed38', eligibleName: '20261026184900_replay_cotizacion_comercial.sql' },
  { file: '0023_margen_minimo_utilidad_rpc.sql', sha256: 'b106eb27b920f2d34825e9141a46d2ed51943c4ccad69cca8c2f970d2348c86a', eligibleName: '20261026185000_replay_margen_minimo_utilidad_rpc.sql' },
  // Current 0026–0048 follow the earlier isolated sources in journal order.
  { file: '0026_comisiones_recalcular_al_asignar_vendedora.sql', sha256: '5076f939bde9c6fe4bd2798f5690c8163c636165ec9ced561af170bb986f5e03', eligibleName: '20261106000000_replay_comisiones_recalcular_al_asignar_vendedora.sql' },
  { file: '0027_clientes_tipo_cliente.sql', sha256: '5a325b83b2365e11ceb2d0ce3c5796a645b6ae4e991752b0b782d6c589b13be4', eligibleName: '20261106010000_replay_clientes_tipo_cliente.sql' },
  { file: '0028_pricing_tipo_operacion_sector.sql', sha256: 'ea21108f86701bccffa72615886df94d9538825a37d938cda5e2b496186f5eb0', eligibleName: '20261106020000_replay_pricing_tipo_operacion_sector.sql' },
  { file: '0029_cotizacion_handover.sql', sha256: '05945750400de4633ecfc21823d1d8989feda8385645d0e8130240d9d7a7757c', eligibleName: '20261106030000_replay_cotizacion_handover.sql' },
  { file: '0030_pricing_reglas_plazos.sql', sha256: '4a8714a7515e5a7074f173be388f9e88f12f147b0109237dfd956d5a61123271', eligibleName: '20261106040000_replay_pricing_reglas_plazos.sql' },
  { file: '0031_cotizacion_autorizacion.sql', sha256: 'a816f3bf9741eb94f98ab36ea6e5f6cc882ac4e5ffb4228d49fb8bd2a1e191be', eligibleName: '20261106050000_replay_cotizacion_autorizacion.sql' },
  { file: '0032_cliente_especial_sin_autorizacion.sql', sha256: '4fc32a90805b39d55b133317177931ce5613154b475fd9ef7e916708ca6e8a35', eligibleName: '20261106060000_replay_cliente_especial_sin_autorizacion.sql' },
  { file: '0033_handover_embarque_al_aceptar.sql', sha256: 'f0dc291eb349afcc3a3c770d19e3717b56b528e02010680375eab599fd0bfb59', eligibleName: '20261106070000_replay_handover_embarque_al_aceptar.sql' },
  { file: '0034_prospecto_solo_borrador.sql', sha256: 'b4daeecf283e43b5e85ab0fc1dec0f1c322c4a0150549c5d4bbb23b48210e0b5', eligibleName: '20261106080000_replay_prospecto_solo_borrador.sql' },
  // Forward fix after 0029's table and the complete immutable history.
  { file: '0035_cotizacion_aceptada_hasta_confirmar_embarque.sql', sha256: '9565c53c94e45d33bdf96242937dbaa0036dd7b122f0b7018739b0fe5128c277', eligibleName: '20261106090000_replay_cotizacion_aceptada_hasta_confirmar_embarque.sql' },
  { file: '0036_cotizacion_handover_tenant_scope.sql', sha256: 'a72308bf9b13502051fa0b212c43c81a4a69589cd5dc4ac0bec249f805c5ce1a', eligibleName: '20261106100000_cotizacion_handover_tenant_scope.sql' },
  { file: '0037_cotizacion_especial_trigger_permissions.sql', sha256: 'e398f843fa18c56f4cfd222d6329c24c3e259c406b817dbac2d7bab5fbb62eb0', eligibleName: '20261106110000_cotizacion_especial_trigger_permissions.sql' },
  { file: '0038_coordinador_fijo_por_cliente.sql', sha256: '6df25cd241868aea34f5d245db90ddc7de931b0fcce5268795eaf22706802c93', eligibleName: '20261106120000_coordinador_fijo_por_cliente.sql' },
  { file: '0039_cotizacion_margen_moneda_homogenea.sql', sha256: '4d20a86450c946c2d73845dbf41ff93d4fb93490243f8967737d1165bd163f79', eligibleName: '20261106130000_cotizacion_margen_moneda_homogenea.sql' },
  { file: '0040_coordinador_permission_boundary.sql', sha256: 'b50b05b0f00dad9cac4ad6257ef8fa7676eca1a51e686513947e53425723fa6a', eligibleName: '20261106140000_coordinador_permission_boundary.sql' },
  { file: '0041_prospecto_housekeeping_historicos.sql', sha256: '4bc3ec9e2f34c10bd7091e8f1b9eb5e3458dce2b3f6d7664d8eec129fd27fd53', eligibleName: '20261108174500_prospecto_housekeeping_historicos.sql' },
  // Forward fixes 2026-11-08: legacy changes that never reached production.
  { file: '0042_periodo_cerrado_campos_derivados.sql', sha256: 'f342ee211925de673df88f4bcc6343e0ca0a33c2cab34659fe0972b49d929d65', eligibleName: '20261108190000_periodo_cerrado_campos_derivados.sql' },
  { file: '0043_bitacora_no_falsificable.sql', sha256: '54de7ba7ff1cee2d1850a3db1557e991780b963351e0724d5729549eea8964ac', eligibleName: '20261108191000_bitacora_no_falsificable.sql' },
  { file: '0044_efe_xml_hash_unico_vivo.sql', sha256: 'c8b73a21472318ffffaa5a9dcb7d5ce5160d80bee15668c82962c0b8d5bbe44f', eligibleName: '20261108192000_efe_xml_hash_unico_vivo.sql' },
  { file: '0045_provision_owner_sin_membresia.sql', sha256: 'bd14472b11d4009f5439daf045e3703d0fe3910cb73dce650c160956e62c23b6', eligibleName: '20261108193000_provision_owner_sin_membresia.sql' },
  { file: '0046_cerrar_funciones_internas_abiertas.sql', sha256: 'fbb3f321e91f0ffb29098ff38e16c9ac0424d1f7c21ed9a5e97950e015d15001', eligibleName: '20261108194000_cerrar_funciones_internas_abiertas.sql' },
  { file: '0047_rls_auth_uid_initplan_backport.sql', sha256: '49f067b89ca5bdbc31299d621e05279639862799d0892d71cbce3cb8ea09d22a', eligibleName: '20261108195000_rls_auth_uid_initplan_backport.sql' },
  { file: '0048_limpieza_indices_duplicados.sql', sha256: '9e135244f1f96d2b03e2abc35c3deb1efa3d44f3ee85162f52cf16eecfba7645', eligibleName: '20261108200000_limpieza_indices_duplicados.sql' },
  { file: '0049_liquidaciones_lectura_finanzas_gerentes.sql', sha256: '7ba8e14da36f37a6559f05cf427a7d1e1e9dc495fed332b9f387f75c5d589d64', eligibleName: '20261108201000_liquidaciones_lectura_finanzas_gerentes.sql' },
  { file: '0050_registrar_evento_tracking_embarque.sql', sha256: 'da871c7f6eb9dfd3811302783470944a3c397167b09341efd7d617bb33db6753', eligibleName: '20261111044000_registrar_evento_tracking_embarque.sql' },
  { file: '0051_procesamiento_facturapi_webhook.sql', sha256: '0dd5e001a5a86dbb87e8f5c200fe2226ae2b948aebcc23ec9e795365de64e938', eligibleName: '20261111045200_procesamiento_facturapi_webhook.sql' },
  { file: '0052_envios_proforma_recuperables.sql', sha256: '872fa26220264cf26cf2a85c0ae41b274e9361979540d76a8656502b0700faba', eligibleName: '20261111053500_envios_proforma_recuperables.sql' },
  { file: '0053_provision_membresia_atomica.sql', sha256: '4b519d836748bf04174aae1353f1ab160996904ff6d180b001e587c4b492231e', eligibleName: '20261111054500_provision_membresia_atomica.sql' },
  { file: '0054_conteos_sidebar.sql', sha256: '3a3ffebc64c70e50b1619e24a2b7746975ff677477360d5b9fffe2ddee0ce1f8', eligibleName: '20261111153000_conteos_sidebar.sql' },
  { file: '0055_embarques_paginacion_filtros.sql', sha256: '5cfc15700522c72741948cd7de594b9e573a1d0dbbd30a43cb67411be62ba9d1', eligibleName: '20261111160000_embarques_paginacion_filtros.sql' },
  { file: '0056_facturacion_bandejas_ligeras.sql', sha256: '454907329cdf6a2b40f3937ebc9b0b3980af07bb1c9326e88e39d7d5493bad62', eligibleName: '20261111162000_facturacion_bandejas_ligeras.sql' },
  // Reviewed literal sources 0057–0064, used only in disposable CI replay.
  { file: '0057_pricing_vinculo_huella_rls_initplan.sql', sha256: '418eb056e2e30a488be88bf711259f462216fd1f16cb29feb1392237d5e5a7fd', eligibleName: '20261114000000_replay_pricing_vinculo_huella_rls_initplan.sql' },
  { file: '0058_pricing_faltantes_texto.sql', sha256: '3b0196cb6c7c9bcfd88a6b0622e90db76a17bcf36a0e8100313c3f6a69739686', eligibleName: '20261114010000_replay_pricing_faltantes_texto.sql' },
  { file: '0059_broker_rol.sql', sha256: 'd80bad1a5b76ba0e876b8b7c4622d2a26f7eda8bb3ea663b1d494f1cff86762c', eligibleName: '20261114020000_replay_broker_rol.sql' },
  { file: '0060_brokers_fase1.sql', sha256: 'fcf2fcc01c4c71d80224d962976f784bc682489b1a1531dee93834f1a4091084', eligibleName: '20261114030000_replay_brokers_fase1.sql' },
  { file: '0061_broker_fuente_lead.sql', sha256: 'f1fbf03a094b69149fc3d14286a3b7ecb2f7be64c718fbd1691a0109ffd2c60f', eligibleName: '20261114040000_replay_broker_fuente_lead.sql' },
  { file: '0062_brokers_fase2.sql', sha256: '057122277de7e92edcfcad6c67511f384207b9769b9275fb999af88a66807e84', eligibleName: '20261114050000_replay_brokers_fase2.sql' },
  { file: '0063_brokers_fase2_lecturas.sql', sha256: '8a8df55a3159251618bb2e6b2c82769827e959b7b7d06015f70b47c0eca9e1a7', eligibleName: '20261114060000_replay_brokers_fase2_lecturas.sql' },
  { file: '0064_brokers_fase3_comisiones.sql', sha256: 'f4a4e3b36bdeb884554a340ed686bf1d9c746b8e851c6ce39e4a5aac2cdbcc51', eligibleName: '20261114070000_replay_brokers_fase3_comisiones.sql' },
  { file: '0065_brokers_tenant_scope.sql', sha256: '5b8a4cf0909e4df7c578bdd601a56cdb49bd8cc41738bc21e55081bd5e849b89', eligibleName: '20261114221500_brokers_tenant_scope.sql' },
  { file: '0066_facturas_filtros_globales.sql', sha256: 'ac331d449940dae8b2b2e80d1771e66d3c3d6157c9925080b18daa5c7fee4d2f', eligibleName: '20261115100000_facturas_filtros_globales.sql' },
  { file: '0067_broker_trigger_acl.sql', sha256: 'c1e04873d1bdb4a5d89fbb4837f6a0dcc33c07bb241b9d7963ba63e80aebdad9', eligibleName: '20261115110000_broker_trigger_acl.sql' },
  { file: '0068_perfil_fiscal_emisor.sql', sha256: 'b9ff6b1ea3bcfd3add4fe4829a4ff8f7731a8181181e8fd06a8acb5ade3c7cd1', eligibleName: '20261115120000_perfil_fiscal_emisor.sql' },
  { file: '0069_isr_resico_contrato.sql', sha256: '7975e33aa3d03aaaa4838aef8cf56aeb77472843aa67347f2d9b540358f83aae', eligibleName: '20261115130000_isr_resico_contrato.sql' },
  { file: '0070_factura_resico_totales_agrupados.sql', sha256: '04a26c4b1d084b4a98d7d41f5a71db0f15d6f30a34933e4c6b4c7899be3f956c', eligibleName: '20261115140000_factura_resico_totales_agrupados.sql' },
  { file: '0071_isr_resico_cotizacion_embarque.sql', sha256: '685e1ec8bc30f56771d8284089f37fa0a363df8d71a2b0d0da389f0411f14104', eligibleName: '20261115150000_isr_resico_cotizacion_embarque.sql' },
  { file: '0072_isr_resico_revision_embarque.sql', sha256: '5204233d11421deda09b914b71e746b2607e89ac5a849f00e0633e26b58a3871', eligibleName: '20261115160000_isr_resico_revision_embarque.sql' },
  { file: '0073_isr_resico_proforma_normal.sql', sha256: 'dd198ea737366b1a53d121c426b90603df582fc2c9f7334fff9a62682ad6ae8f', eligibleName: '20261115170000_isr_resico_proforma_normal.sql' },
  { file: '0074_isr_resico_consolidacion_proformas.sql', sha256: '331b1e84456ee357c4c67dc8c490762316d8ebb3ba2bb9f62031ac4c63e86fbd', eligibleName: '20261115180000_isr_resico_consolidacion_proformas.sql' },
  { file: '0075_isr_resico_conversion_proforma.sql', sha256: 'c9d7455fbc7373c50577ac5fb6e715d28467b4508c2effd4ecf75f93a9ae7b9e', eligibleName: '20261115190000_isr_resico_conversion_proforma.sql' },
  { file: '0076_isr_resico_factura_manual.sql', sha256: '3ac5dcd38f14c52fe11199a0791be62c6796d71f3defd133b5be8ea2de827c8b', eligibleName: '20261115200000_isr_resico_factura_manual.sql' },
  { file: '0077_isr_resico_intentos_timbrado.sql', sha256: 'b88e723859b4a9398edcf50f19c0b348b93f22d7d3a952f213dd7c872efcbd80', eligibleName: '20261115210000_isr_resico_intentos_timbrado.sql' },
  { file: '0078_isr_resico_recuperar_timbrado.sql', sha256: '8430edc3ef77b9b76072095a7ce1a4f8a87338291146a2ba7d376956bb3e9283', eligibleName: '20261115220000_isr_resico_recuperar_timbrado.sql' },
  { file: '0079_isr_resico_cobranza.sql', sha256: '1fc2d8d6ce3704a4523d8f71f287adedd931f6c4aceb85ace433d3d382461ef0', eligibleName: '20261115230000_isr_resico_cobranza.sql' },
  { file: '0080_isr_resico_timbrado_notas.sql', sha256: 'fe4f54521ba3e3d057e401cbf4608a5cc7d57e49cb040f1000940880c410e4d4', eligibleName: '20261116000000_isr_resico_timbrado_notas.sql' },
  { file: '0081_isr_resico_timbrado_rep.sql', sha256: '8d3027e3b135952bfd035470929b63f77ac82f07b719e17b22781f009a210a21', eligibleName: '20261116000100_isr_resico_timbrado_rep.sql' },
  { file: '0082_isr_resico_reemplazo.sql', sha256: 'af04b637e4ad3918e3ec0e4143c34bee3a4d902e1a039c91ebe017df9ef2f4fb', eligibleName: '20261116000200_isr_resico_reemplazo.sql' },
  { file: '0083_selected_security_internal_helpers_snapshot_writes.sql', sha256: '60296254ddc720ad9274b2b02159299456cb550121729dd4ca077c5332608f5d', eligibleName: '20261120010000_replay_selected_security_internal_helpers_snapshot_writes.sql' },
  { file: '0084_brokers_tabulador_comisiones.sql', sha256: '4398728bdeebc6531f5802ab90e36dd2979bd70c9f02ae85f537f262e14d5e48', eligibleName: '20261120010100_replay_brokers_tabulador_comisiones.sql' },
  { file: '0085_broker_alta_prospecto_propiedades_empresa.sql', sha256: '053f6b4451d3a09db4709689809b1ea79626a20549dea21fcc1b4b156a61aa38', eligibleName: '20261120010200_replay_broker_alta_prospecto_propiedades_empresa.sql' },
  { file: '0086_empresa_prospecto_externo.sql', sha256: '96941879ff2d3bc1a7e99c1fcd046a9309df757d54d5b7449ea85bd514e08e75', eligibleName: '20261120010300_replay_empresa_prospecto_externo.sql' },
  { file: '0087_oportunidad_vendedor_externo.sql', sha256: 'fc4517a9f841603d94f63e429a164cccdb569d1fd7332504432caa0f53f43bfe', eligibleName: '20261120010400_replay_oportunidad_vendedor_externo.sql' },
  { file: '0088_oportunidad_vendedor_externo_guard_null.sql', sha256: 'f32350bb0c10024ea0d01a1a44cf16a43b99f0affea43317810ff105b3584f32', eligibleName: '20261120010500_replay_oportunidad_vendedor_externo_guard_null.sql' },
  { file: '0089_brokers_comision_exclusiva_sin_kam.sql', sha256: '2144d011267284843d8ce8c9ea46896bed523d1346962fe981582397ed6916f3', eligibleName: '20261120010600_replay_brokers_comision_exclusiva_sin_kam.sql' },
  { file: '0090_lectores_membresias_y_libro_respetan_rls.sql', sha256: '70fc855d14638ef45bbf16cc61afb5538f51da01db6a1508b629cf03ac3cf59e', eligibleName: '20261120010700_replay_lectores_membresias_y_libro_respetan_rls.sql' },
  { file: '0091_demoras_y_pago_detalle_acceso_protegido.sql', sha256: '6cd632a9dee6233f43e4c5d606b560bfb7c172298ebac71306d096a0d586faf0', eligibleName: '20261120010800_replay_demoras_y_pago_detalle_acceso_protegido.sql' },
  { file: '0092_auxiliares_seleccionados_acceso_protegido.sql', sha256: 'ad83fb3851f436fa2d4469126b386010eb3afed6699a83d16aa0c612921a8c79', eligibleName: '20261120010900_replay_auxiliares_seleccionados_acceso_protegido.sql' },
  { file: '0093_actividad_embarque_bitacora_misma_organizacion.sql', sha256: 'd52a1a33ce842b6eb7887747df3922476235fe718a652d4977690c478e7a6fff', eligibleName: '20261120011000_replay_actividad_embarque_bitacora_misma_organizacion.sql' },
  { file: '0094_autoridad_local_avisos_seleccionados.sql', sha256: '54b2177cafedd41c05dfb255336480896eb7bb586362d3fd7d0930be4f3a271b', eligibleName: '20261120011100_replay_autoridad_local_avisos_seleccionados.sql' },
  { file: '0095_pricing_sla_horas_habiles.sql', sha256: '611bd54dbb6de477a293099f946d86bf94a5b1ff2fcab35d5bf73a319a951fc8', eligibleName: '20261123200000_replay_pricing_sla_horas_habiles.sql' },
  { file: '0096_pricing_submodalidad_incoterms_modo.sql', sha256: '804a63bcdce6e9aac0c126303d7fe14c7371be7189b68ca109b555fa247ad192', eligibleName: '20261123200100_replay_pricing_submodalidad_incoterms_modo.sql' },
  { file: '0097_pricing_plazos_por_modo.sql', sha256: '6320a8c282720b1ef4526c8f6bdee59f1b9e96a3e5d5db0ea799ab86fdb79d43', eligibleName: '20261123200200_replay_pricing_plazos_por_modo.sql' },
  { file: '0098_pricing_lcl_imo_modalidad_negocio.sql', sha256: 'edbf9d524ee7317c0def6cdddd6c57f865a653978e33aacb025596f5651c9bb7', eligibleName: '20261123200300_replay_pricing_lcl_imo_modalidad_negocio.sql' },
  { file: '0099_recargos_base_por_unidad_o_embarque.sql', sha256: '3ecec21d9118c5a056ba41b5fa3126984619d26706e1b2ab7ec0dabe712a4021', eligibleName: '20261123200400_replay_recargos_base_por_unidad_o_embarque.sql' },
  { file: '0100_tarifario_aereo_terrestre_base.sql', sha256: '6d3af90a1789af2154a484f7c4b11b5fc0973cddb3fbcf9e7dc6ff00433b478e', eligibleName: '20261123200500_replay_tarifario_aereo_terrestre_base.sql' },
  { file: '0101_tarifa_multimodo_moneda.sql', sha256: '543986869b63ec4fa25ec34426b808e73398fdf7233ae1dcf7b9df97205c02ef', eligibleName: '20261123200600_replay_tarifa_multimodo_moneda.sql' },
  { file: '0102_pricing_banderas_aereas.sql', sha256: '88d10454835d9bab3c0e5793ab33f3cc693bef33b15f70c5a96eb77563a317ff', eligibleName: '20261123200700_replay_pricing_banderas_aereas.sql' },
  { file: '0103_cotizacion_banderas_aereas.sql', sha256: 'a3c832d6f963f47d679f5ebd459567bb70f7317012cccdbefb5576953192e1bc', eligibleName: '20261123200800_replay_cotizacion_banderas_aereas.sql' },
  { file: '0104_costeo_tarifa_tramos_tenant_scope.sql', sha256: '81588859e3f96db447c1c4434b602dbbd9a8ffaac829e50fb9afd7621eeaf39c', eligibleName: '20261123200900_replay_costeo_tarifa_tramos_tenant_scope.sql' },
  { file: '0105_tarifa_aerea_escalas_reorden.sql', sha256: '5603a48d33b5f7f4e260b8b4d3c5b7294444a02c0790d310ed95fe909b27d0de', eligibleName: '20261123201000_replay_tarifa_aerea_escalas_reorden.sql' },
  { file: '0106_recargo_minimo_proveedor.sql', sha256: '7f171df29599c839bae60d23610e4d1960d877f93da9ded91db6bb7328fe6438', eligibleName: '20261123201100_replay_recargo_minimo_proveedor.sql' },
  { file: '0107_pricing_solicitud_terrestre.sql', sha256: '05e74bac735c09c4a9c37c25a2392bff0902d77db2ba49cf3903972cd6f03da3', eligibleName: '20261123201200_replay_pricing_solicitud_terrestre.sql' },
  { file: '0108_pricing_fase5_operacion.sql', sha256: '94ee8ac23a955fa078d9ce0b724e72a3456e13a008aff71eb2503a240ad62c31', eligibleName: '20261123201300_replay_pricing_fase5_operacion.sql' },
  { file: '0109_pricing_modos_tenant_scope.sql', sha256: '7931d640d25178d77af48ae1bbffcde9b34e34a1b7c4dd53399a89994882ffec', eligibleName: '20261123201400_replay_pricing_modos_tenant_scope.sql' },
  { file: '0110_pricing_msds_pdf_obligatoria.sql', sha256: '9ba1b18abea257c07bc4ac483686e5d3b83388197be83aecd096c1ed7cb3f851', eligibleName: '20261123201500_replay_pricing_msds_pdf_obligatoria.sql' },
  { file: '0111_pricing_fase6_recotizar_costo_real.sql', sha256: '646fc37d2b6428798cbeb98a2d70cfd3ce74f13918ca56717c0e24aa0eec9fe2', eligibleName: '20261123201600_replay_pricing_fase6_recotizar_costo_real.sql' },
  { file: '0112_pricing_recotizar_vigencia_columnas.sql', sha256: '8c2f7367c80ae13a0747c173c0005de23b890cc3305d072445615f1fc9b3095b', eligibleName: '20261123201700_replay_pricing_recotizar_vigencia_columnas.sql' },
  { file: '0113_pricing_motivo_perdida.sql', sha256: 'c0a04ba208d3e81a57df6bda6f4d10a4f56ebedc9126f30176949fb006bff261', eligibleName: '20261123201800_replay_pricing_motivo_perdida.sql' },
  { file: '0114_recargos_local_internacional.sql', sha256: '607db7123b62df949c0162ede35608a688ae0525b2d9fba1c37bb81b7397e850', eligibleName: '20261124200000_replay_recargos_local_internacional.sql' },
  { file: '0115_correcciones_auditoria_negocio.sql', sha256: '7d8e621253101972e0acca55f52d1459969bb50b3e69cbb99749590313bb65c9', eligibleName: '20261126222900_replay_correcciones_auditoria_negocio.sql' },
  { file: '0116_pricing_vinculo_repin_politicas.sql', sha256: '197429e356f262228762eb7148d69b91d64ed9689b9e67817163b33c8cc8cbe8', eligibleName: '20261127204631_replay_pricing_vinculo_repin_politicas.sql' },
  { file: '0117_ct071_omitir_egreso_conciliado.sql', sha256: 'e5446087622f73c236a5cfc1b428da294b8cb3c28a9e235e5d369cff89df7d77', eligibleName: '20261127220000_replay_ct071_omitir_egreso_conciliado.sql' },
  { file: '0118_ct071_confirmacion_tesorero.sql', sha256: 'b6f5ba0171bc53231ed49b5191a69e8bdea37c9f713d6ff8a22876e5a7baf858', eligibleName: '20261127230000_replay_ct071_confirmacion_tesorero.sql' },
];
const NONDEPLOYABLE_SQL = [
  ['archive/2026-11-23/0104_tarifa_aerea_escalas.sql', 'b4cc96958bfc3c374247d46a15bb0df8bb8fc97e08cae1dbd9ab47e30854589f'],
  ['archive/2026-11-23/0105_pricing_complejidad_baja_tarifa_vigente.sql', '5450e71c06e72e4e1551a6316dc718af2a88bf244a89778f1994ea1976907276'],
  ['corrections/0107_pricing_tarifa_vigente_acl.sql', '649d85ce3a01aab000650f1a2712311c5ae5e210f41e37c5a6bea4575c2401fd'],
];
const PRICING_TARIFA_ACL = 'corrections/0107_pricing_tarifa_vigente_acl.sql';
const ARCHIVED_METADATA = [
  [`${ARCHIVE}/meta/0022_snapshot.json`, '002a1cff39197fe3431f23193a4229e1c845cbcd0ab5eaa074efded812b0081d'],
  [`${ARCHIVE}/meta/_journal.json`, '10745ad2cc8bcbf4a6559dda414296966a372ca162fbd6e1ac3d6b382eb96288'],
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function pinned(root, file, expected) {
  const bytes = fs.readFileSync(path.join(root, DIR, file));
  if (hash(bytes) !== expected) throw new Error(`Isolated history hash mismatch: ${file}`);
  return bytes.toString('utf8');
}

function rejectEligibleCopies(root) {
  const forbidden = new Set(HISTORY.map(item => item.sha256));
  forbidden.add(AUTHORITY_PREIMAGES_SHA256);
  const archivedAndCorrections = new Set(NONDEPLOYABLE_SQL.map(([, expected]) => expected));
  for (const expected of archivedAndCorrections) forbidden.add(expected);
  const drizzleDir = path.join(root, 'drizzle/migrations');
  for (const file of fs.readdirSync(drizzleDir).filter(file => file.endsWith('.sql'))) {
    if (archivedAndCorrections.has(hash(fs.readFileSync(path.join(drizzleDir, file))))) {
      throw new Error(`Test-only replay must not be deployment-eligible: ${file}`);
    }
  }
  const dir = path.join(root, 'supabase/migrations');
  for (const file of fs.readdirSync(dir).filter(file => file.endsWith('.sql'))) {
    if (forbidden.has(hash(fs.readFileSync(path.join(dir, file))))) {
      throw new Error(`Test-only replay must not be deployment-eligible: ${file}`);
    }
  }
}

/** Returns only the current journal sources; recovered history is verified too. */
export function readIsolatedDrizzleReplay(root = process.cwd()) {
  const mapping = JSON.parse(fs.readFileSync(path.join(root, 'drizzle/replay.json'), 'utf8'));
  rejectEligibleCopies(root);
  const out = new Map();
  for (const item of HISTORY) {
    const sql = pinned(root, item.file, item.sha256);
    if (!item.eligibleName) continue;
    const source = fs.readFileSync(path.join(root, 'drizzle/migrations', item.file));
    if (hash(source) !== item.sha256) throw new Error(`Immutable source changed: ${item.file}`);
    if (fs.existsSync(path.join(root, 'supabase/migrations', item.eligibleName))) {
      throw new Error(`Test-only replay must not be deployment-eligible: ${item.eligibleName}`);
    }
    const entries = mapping.filter(entry => entry.file === item.file);
    if (entries.length !== 1 || entries[0].scope !== 'isolated-ci'
      || entries[0].sha256 !== item.sha256 || entries[0].composition
      || JSON.stringify(entries[0].replays) !== JSON.stringify([item.file])) {
      throw new Error(`Isolated history mapping mismatch: ${item.file}`);
    }
    out.set(item.file, sql);
  }
  if (mapping.filter(entry => entry.scope === 'isolated-ci').length !== out.size) {
    throw new Error('Unreviewed isolated history mapping');
  }
  for (const [file, expected] of [...ARCHIVED_METADATA, ...NONDEPLOYABLE_SQL]) pinned(root, file, expected);
  return out;
}

export function listIsolatedHistory(root = process.cwd()) {
  readIsolatedDrizzleReplay(root);
  pinned(root, AUTHORITY_PREIMAGES, AUTHORITY_PREIMAGES_SHA256);
  return HISTORY.flatMap(({ file }) => file.startsWith('0092_')
    ? [`${DIR}/${AUTHORITY_PREIMAGES}`, `${DIR}/${file}`]
    : file === '0107_pricing_solicitud_terrestre.sql'
      ? [`${DIR}/${file}`, `${DIR}/${PRICING_TARIFA_ACL}`]
      : [`${DIR}/${file}`]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv[2] !== 'list') throw new Error('Usage: node control.mjs list');
  console.log(listIsolatedHistory().join('\n'));
}
