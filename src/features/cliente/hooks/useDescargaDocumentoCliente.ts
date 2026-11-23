import { useRef, useState } from "react";
import { notifyError } from "@/lib/ui/appFeedback";
import type { DocumentoCliente } from "@/features/cliente/domain/documentosCliente";
import { urlDocumentoCliente } from "@/features/cliente/services/clienteDocumentos";

export function useDescargaDocumentoCliente(clienteId: string) {
  const [solicitud, setSolicitud] = useState<{ clienteId: string; tipo: string; url?: string } | null>(null);
  const intentoActual = useRef(0);

  const preparar = async (doc: DocumentoCliente) => {
    const intento = ++intentoActual.current;
    const base = { clienteId, tipo: doc.tipo };
    setSolicitud(base);
    try {
      const url = await urlDocumentoCliente(doc.archivo);
      if (intento === intentoActual.current) setSolicitud({ ...base, url });
    } catch (error) {
      if (intento !== intentoActual.current) return;
      setSolicitud(null);
      notifyError(undefined, {
        title: "No se pudo generar la liga de descarga",
        description: "Vuelve a intentarlo; si persiste, el archivo pudo haberse movido.",
        error,
        method: "DOWNLOAD_CLIENTE_DOCUMENTO",
      });
    }
  };

  return { descargar: preparar, descarga: solicitud?.clienteId === clienteId ? solicitud : null };
}
