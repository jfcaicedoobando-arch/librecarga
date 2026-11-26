/**
 * Upload idempotente de documentos de embarque. Extraído de
 * `services/documentos.ts` para mantenerlo bajo 200 líneas (Power-of-10).
 *
 * El path incluye el hash del contenido y el registro de `documentos_embarque`
 * sólo se actualiza si cambia. Reintentos con el mismo archivo no duplican
 * ni reescriben filas. Reporta al log de idempotencia (vista /idempotencia)
 * con `fn='upload_documento_embarque'`.
 */
import { supabase } from '@/integrations/supabase/client';
import { captureAuthOperationScope } from '@/lib/auth/authOperationScope';
import { downloadFile, uploadFile } from '@/services/storage/index';
import { sanitizeFileName, sanitizeStorageKey } from '@/lib/storage';
import type { TablesInsert } from '@/integrations/supabase/types';
import { sha256Hex, hexToUuid } from '@/features/embarques/services/documentos/idempotencyHash';
import { registrarActividad } from '@/services/bitacora/registrar';

type DocumentoEstado = TablesInsert<'documentos_embarque'>['estado'];

export interface UploadDocumentoResult {
  path: string;
  fileName: string;
  /** true si el archivo ya estaba registrado con el mismo contenido (no-op). */
  cached: boolean;
}

async function buildScopedRequestId(embarqueId: string, docId: string, hash: string): Promise<string> {
  // La clave DEBE incluir embarqueId+docId+hash; si sólo dependiera del hash,
  // subir el mismo archivo a otro slot devolvería la respuesta cacheada del
  // docId anterior y nunca actualizaríamos la fila correcta (bug 8.220.0).
  const scopedHashBuf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${embarqueId}:${docId}:${hash}`),
  );
  const scopedHex = Array.from(new Uint8Array(scopedHashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hexToUuid(scopedHex);
}

async function leerSlot(embarqueId: string, docId: string, organizationId: string | null) {
  let query = supabase
    .from('documentos_embarque')
    .select('archivo, estado')
    .eq('id', docId).eq('embarque_id', embarqueId).is('deleted_at', null);
  if (organizationId) query = query.eq('organization_id', organizationId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function coincideContenido(path: string, hash: string): Promise<boolean> {
  try {
    return await sha256Hex(await downloadFile(path)) === hash;
  } catch {
    return false;
  }
}

async function commitDocumento(embarqueId: string, docId: string, path: string, scope: ReturnType<typeof captureAuthOperationScope>) {
  let query = supabase
    .from('documentos_embarque')
    .update({ archivo: path, estado: 'Recibido' as DocumentoEstado })
    .eq('id', docId).eq('embarque_id', embarqueId).is('deleted_at', null);
  if (scope.organizationId) query = query.eq('organization_id', scope.organizationId);
  try {
    const { data, error } = await query.select('id');
    if (error) throw error;
    if (data?.length) return;
    throw new Error('No se pudo actualizar el documento (sin permisos o el documento ya no existe).');
  } catch (error) {
    // Una respuesta perdida puede ocultar un commit. Retener el blob también
    // permite que el mismo intento termine cuando la lectura siga fallando.
    if (scope.isCurrent()) {
      const slot = await leerSlot(embarqueId, docId, scope.organizationId).catch(() => null);
      if (slot?.archivo === path && (slot.estado === 'Recibido' || slot.estado === 'Validado') && scope.isCurrent()) return;
    }
    throw error;
  }
}

/**
 * Post-commit best-effort: el commit YA determinó el éxito, así que un fallo
 * de idempotencia o bitácora sólo se observa, nunca se reporta como error.
 */
async function postCommitBestEffort({ requestId, embarqueId, docId, path, fileName, scope }: {
  requestId: string; embarqueId: string; docId: string; path: string; fileName: string;
  scope: ReturnType<typeof captureAuthOperationScope>;
}): Promise<void> {
  if (!scope.isCurrent()) return;
  try {
    await supabase.rpc('idempotency_store', {
      _key: requestId,
      _response: { path, fileName } as never,
    });
  } catch (e) {
    console.warn('[uploadDocumentoEmbarque] no se pudo guardar la respuesta de idempotencia', e);
  }
  if (!scope.isCurrent()) return;
  try {
    await registrarActividad({
      authScope: scope,
      ...(scope.organizationId ? { organizationId: scope.organizationId } : {}),
      modulo: 'documentos',
      accion: 'subir_documento_embarque',
      entidadId: docId,
      entidadNombre: fileName,
      detalles: { embarqueId },
    });
  } catch (e) {
    console.warn('[uploadDocumentoEmbarque] no se pudo registrar la bitácora del documento', e);
  }
}

export async function uploadDocumentoEmbarque(
  embarqueId: string,
  docId: string,
  file: File,
): Promise<UploadDocumentoResult> {
  const scope = captureAuthOperationScope();
  const hash = await sha256Hex(file);
  scope.assertCurrent();
  const path = `embarques/${sanitizeStorageKey(embarqueId)}/${sanitizeStorageKey(docId)}/${hash.slice(0, 12)}-${sanitizeFileName(file.name)}`;

  // 1) Si la fila ya apunta al mismo archivo (mismo contenido), no hacer nada.
  const actual = await leerSlot(embarqueId, docId, scope.organizationId);
  scope.assertCurrent();
  if (!actual) throw Object.assign(new Error('El documento ya no existe o fue eliminado.'), { code: 'NOT_FOUND' });
  if (actual.archivo === path && (actual.estado === 'Recibido' || actual.estado === 'Validado')
      && await coincideContenido(path, hash)) {
    scope.assertCurrent();
    return { path, fileName: file.name, cached: true };
  }

  // Un acuse cacheado no acredita que el blob exista o siga asociado al slot.
  const requestId = await buildScopedRequestId(embarqueId, docId, hash);
  scope.assertCurrent();
  const { error: errorClaim } = await supabase.rpc('idempotency_claim', {
    _key: requestId,
    _fn: 'upload_documento_embarque',
  });
  scope.assertCurrent();
  if (errorClaim) throw errorClaim;

  try {
    await uploadFile(path, file);
  } catch (error) {
    scope.assertCurrent();
    if (!await coincideContenido(path, hash)) throw error;
  }
  scope.assertCurrent();
  // Otra sesión puede volver a usar el path anterior en cualquier momento.
  // El cliente conserva las versiones por contenido para permitir recuperar el slot.
  await commitDocumento(embarqueId, docId, path, scope);

  await postCommitBestEffort({ requestId, embarqueId, docId, path, fileName: file.name, scope });
  return { path, fileName: file.name, cached: false };
}

