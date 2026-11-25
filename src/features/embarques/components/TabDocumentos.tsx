import { useCallback, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/shared/dialogs/ConfirmActionDialog";
import { DataTable } from "@/components/shared/DataTable";
import type { DocumentoEmbarqueRow } from "@/features/embarques/hooks";
import { useFocusSection } from "@/features/embarques/hooks/useFocusSection";
import { AgregarDocumentoDialog } from "./tabDocumentos/AgregarDocumentoDialog";
import { RechazarDocumentoDialog } from "./tabDocumentos/RechazarDocumentoDialog";
import { useDocumentoColumns } from "@/features/embarques/hooks/useDocumentoColumns";

interface Props {
  embarqueId: string;
  modo?: string;
  documentos: DocumentoEmbarqueRow[];
  canEdit: boolean;
  uploadingDocId: string | null;
  downloadingDocId: string | null;
  deletingDocId?: string | null;
  togglingNoAplicaDocId?: string | null;
  onUpload: (docId: string, file: File) => void;
  onDownload: (archivo: string, docId: string) => void;
  onDelete?: (doc: DocumentoEmbarqueRow) => Promise<boolean>;
  onToggleNoAplica?: (doc: DocumentoEmbarqueRow) => void;
  rechazandoDocId?: string | null;
  onRechazar?: (doc: DocumentoEmbarqueRow, motivo: string) => Promise<boolean>;
}

function nombreDelAdjunto(ruta?: string | null) {
  const partes = ruta?.split("/") ?? [];
  const nombre = partes.at(-1) || "Archivo adjunto";
  return partes[0] === "embarques" && partes.length === 4
    ? nombre.replace(/^[a-f0-9]{12}-(?=.)/, "")
    : nombre;
}

export function TabDocumentos({
  embarqueId, modo, documentos, canEdit, uploadingDocId, downloadingDocId, deletingDocId, togglingNoAplicaDocId,
  onUpload, onDownload, onDelete, onToggleNoAplica, rechazandoDocId, onRechazar,
}: Props) {
  const [docToDelete, setDocToDelete] = useState<DocumentoEmbarqueRow | null>(null);
  const [falloEliminar, setFalloEliminar] = useState(false);
  const eliminando = !!docToDelete && deletingDocId === docToDelete.id;
  const [docToReject, setDocToReject] = useState<DocumentoEmbarqueRow | null>(null);
  const [replacement, setReplacement] = useState<{ documento: DocumentoEmbarqueRow; archivo: File } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const { focus, registerRef, clearFocus } = useFocusSection(true);
  const tituloDocumentos = useRef<HTMLHeadingElement>(null);
  const filtrarFaltantes = focus === "faltantes";

  const documentosVisibles = useMemo(() => {
    if (!filtrarFaltantes) return documentos;
    return documentos.filter(d => (!d.archivo || d.archivo === '') && d.estado !== 'No aplica');
  }, [documentos, filtrarFaltantes]);

  const requestUpload = useCallback((docId: string, archivo: File) => {
    const documento = documentos.find(doc => doc.id === docId);
    if (documento?.archivo) {
      setReplacement({ documento, archivo });
      return;
    }
    onUpload(docId, archivo);
  }, [documentos, onUpload]);

  const columns = useDocumentoColumns({
    canEdit, uploadingDocId, downloadingDocId, deletingDocId, togglingNoAplicaDocId,
    onUpload: requestUpload, onDownload, onDelete, onToggleNoAplica,
    onRequestDelete: (doc) => { setFalloEliminar(false); setDocToDelete(doc); },
    rechazandoDocId,
    onRequestRechazo: onRechazar ? setDocToReject : undefined,
  });

  return (
    <>
      <Card ref={registerRef("faltantes")} data-focus="faltantes">
        <CardHeader className="flex flex-col items-start gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <CardTitle ref={tituloDocumentos} tabIndex={-1}>Documentos del embarque</CardTitle>
            {filtrarFaltantes && (
              <>
                <Badge variant="outline" className="max-w-full whitespace-normal border-primary text-primary">
                  Filtrando: documentos faltantes
                </Badge>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-body-sm" onClick={() => {
                  clearFocus();
                  tituloDocumentos.current?.focus();
                }} aria-label="Limpiar filtro de documentos faltantes">
                  <X className="mr-1 h-3 w-3" /> Limpiar
                </Button>
              </>
            )}
          </div>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Agregar documento
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={documentosVisibles}
            rowKey={(d) => d.id}
            emptyMessage={filtrarFaltantes
              ? (documentos.length ? 'Sin documentos pendientes.' : 'Aún no hay documentos registrados.')
              : (canEdit
                ? 'Sin documentos registrados. Usa "Agregar documento" para crear el primero.'
                : 'Sin documentos registrados')}
          />
        </CardContent>
      </Card>


      <AgregarDocumentoDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        embarqueId={embarqueId}
        modo={modo}
        documentos={documentos}
      />

      <RechazarDocumentoDialog
        open={!!docToReject}
        onOpenChange={(open) => { if (!open) setDocToReject(null); }}
        documentoNombre={docToReject?.nombre ?? ''}
        pendiente={!!docToReject && rechazandoDocId === docToReject.id}
        onConfirm={async (motivo) => Boolean(docToReject && await onRechazar?.(docToReject, motivo))}
      />

      <ConfirmActionDialog
        open={!!replacement}
        onOpenChange={(open) => { if (!open) setReplacement(null); }}
        title="¿Reemplazar archivo?"
        variant="destructive"
        confirmLabel="Reemplazar archivo"
        confirmDisabled={!canEdit}
        onConfirm={() => {
          if (!replacement || !canEdit) return;
          setReplacement(null);
          onUpload(replacement.documento.id, replacement.archivo);
        }}
        description={
          <>
            Se reemplazará “{nombreDelAdjunto(replacement?.documento.archivo)}” por “{replacement?.archivo.name}”
            en el documento “{replacement?.documento.nombre}”. El archivo anterior dejará de estar disponible.
            Descárgalo antes de continuar si necesitas conservarlo.
          </>
        }
      />

      <ConfirmActionDialog
        open={!!docToDelete}
        onOpenChange={(open) => { if (!open && !eliminando) setDocToDelete(null); }}
        title="¿Eliminar documento?"
        variant="destructive"
        confirmLabel="Eliminar"
        isPending={eliminando}
        onConfirm={async () => {
          if (!docToDelete || !onDelete || eliminando) return;
          setFalloEliminar(false);
          if (await onDelete(docToDelete)) setDocToDelete(null);
          else setFalloEliminar(true);
        }}
        description={
          <>El archivo <strong>{docToDelete?.nombre}</strong> será eliminado permanentemente. Esta acción no se puede deshacer.</>
        }
      >
        {falloEliminar && <p role="alert" className="text-body-sm text-destructive">
          No se pudo confirmar la eliminación del archivo. Vuelve a intentar.
        </p>}
      </ConfirmActionDialog>
    </>
  );
}
