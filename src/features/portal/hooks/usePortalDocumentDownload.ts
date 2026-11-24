import { useCallback, useRef, useState } from "react";
import { createDocumentoSignedUrl } from "@/features/search/services";
import { notifyError } from "@/lib/ui/appFeedback";
import { descargarBlob } from "@/lib/downloadBlob";

/**
 * Encapsula la descarga de documentos del portal (signed URL + blob fallback).
 */
export function usePortalDocumentDownload() {
  const enCurso = useRef(new Set<string>());
  const [downloadingIds, setDownloadingIds] = useState<ReadonlySet<string>>(new Set());

  const handleDownload = useCallback(async (archivo: string, docId: string) => {
    if (enCurso.current.has(docId)) return;
    enCurso.current.add(docId);
    setDownloadingIds(new Set(enCurso.current));
    try {
      const signedUrl = await createDocumentoSignedUrl(archivo, 300);
      const filename = archivo.split("/").pop() || "documento";
      try {
        const response = await fetch(signedUrl);
        if (!response.ok) throw new Error("Download failed");
        const blob = await response.blob();
        descargarBlob(blob, filename);
      } catch {
        window.open(signedUrl, "_blank");
      }
    } catch (error) {
      notifyError(undefined, { title: "Error al descargar", error,
        method: "USE_PORTAL_DOCUMENT_DOWNLOAD", context: { documentoId: docId } });
    } finally {
      enCurso.current.delete(docId);
      setDownloadingIds(new Set(enCurso.current));
    }
  }, []);

  return { downloadingIds, handleDownload };
}
