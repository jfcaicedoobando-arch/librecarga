import { useMemo, useRef, useState } from "react";
import { FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import type { DocumentoEmbarqueRow } from "@/features/embarques/hooks";
import { useCreateDocumentoEmbarque } from "@/features/embarques/hooks";
import { getDocsForMode } from "@/features/embarques/constants/embarqueConstants";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { getErrorMessage } from "@/lib/errors";
import { FormDialogCancelarBoton } from "@/components/shared/FormDialogCancelarBoton";

const OTRO_VALUE = "__otro__";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  embarqueId: string;
  modo?: string;
  documentos: DocumentoEmbarqueRow[];
}

export function AgregarDocumentoDialog({ open, onOpenChange, embarqueId, modo, documentos }: Props) {
  const [nombreSel, setNombreSel] = useState<string>("");
  const [nombreLibre, setNombreLibre] = useState("");
  const [notasNuevo, setNotasNuevo] = useState("");
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const tipoRef = useRef<HTMLButtonElement>(null);
  const nombreRef = useRef<HTMLInputElement>(null);
  const faltaTipo = intentoGuardar && !nombreSel;
  const faltaNombre = intentoGuardar && nombreSel === OTRO_VALUE && !nombreLibre.trim();
  const createDoc = useCreateDocumentoEmbarque();

  const sugerencias = useMemo(() => {
    const ya = new Set(documentos.map((d) => d.nombre));
    return getDocsForMode(modo ?? "").filter((n) => !ya.has(n));
  }, [documentos, modo]);

  const resetForm = () => {
    setNombreSel("");
    setNombreLibre("");
    setNotasNuevo("");
    setIntentoGuardar(false);
  };
  const cerrar = () => { resetForm(); onOpenChange(false); };

  const handleCrear = async () => {
    const nombreFinal = nombreSel === OTRO_VALUE ? nombreLibre.trim() : nombreSel.trim();
    if (!nombreFinal) {
      setIntentoGuardar(true);
      (nombreSel === OTRO_VALUE ? nombreRef.current : tipoRef.current)?.focus();
      return;
    }
    try {
      await createDoc.mutateAsync({ embarqueId, nombre: nombreFinal, notas: notasNuevo.trim() || undefined });
      notifySuccess(undefined, { title: "Documento agregado" });
      resetForm();
      onOpenChange(false);
    } catch (err) {
      notifyError(undefined, { title: "No se pudo agregar el documento", description: getErrorMessage(err), error: err, method: "HANDLE_CREAR" });
    }
  };

  return (
    <FormDialogShell
      open={open}
      onOpenChange={(o) => { if (o) onOpenChange(true); else cerrar(); }}
      icon={FilePlus}
      title="Agregar documento"
      description="Crea una nueva entrada en el checklist para luego adjuntar el archivo."
      size="lg"
      busy={createDoc.isPending}
      footer={
        <>
          <FormDialogCancelarBoton onCancelar={cerrar} disabled={createDoc.isPending} />
          <Button onClick={handleCrear} loading={createDoc.isPending}>
            Agregar
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <Label htmlFor="doc-nombre">Tipo de documento</Label>
        <Select value={nombreSel} onValueChange={setNombreSel}>
          <SelectTrigger id="doc-nombre" ref={tipoRef} aria-required="true"
            aria-invalid={faltaTipo || undefined}
            aria-describedby={faltaTipo ? "doc-tipo-error" : undefined}>
            <SelectValue placeholder="Selecciona un documento estándar" />
          </SelectTrigger>
          <SelectContent>
            {sugerencias.map((n) => (
              <SelectItem key={n} value={n}>{n}</SelectItem>
            ))}
            <SelectItem value={OTRO_VALUE}>Otro (nombre personalizado)…</SelectItem>
          </SelectContent>
        </Select>
        {faltaTipo && <p id="doc-tipo-error" role="alert" className="text-body-sm text-destructive">Selecciona el tipo de documento.</p>}
      </div>
      {nombreSel === OTRO_VALUE && (
        <div className="space-y-1.5">
          <Label htmlFor="doc-nombre-libre">Nombre personalizado</Label>
          <Input
            id="doc-nombre-libre"
            ref={nombreRef}
            aria-required="true"
            aria-invalid={faltaNombre || undefined}
            aria-describedby={faltaNombre ? "doc-nombre-libre-error" : undefined}
            value={nombreLibre}
            onChange={(e) => setNombreLibre(e.target.value)}
            placeholder="Ej. Pedimento, Certificado fitosanitario…"
            maxLength={120}
          />
          {faltaNombre && <p id="doc-nombre-libre-error" role="alert" className="text-body-sm text-destructive">Captura el nombre personalizado.</p>}
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="doc-notas">Notas (opcional)</Label>
        <Textarea
          id="doc-notas"
          value={notasNuevo}
          onChange={(e) => setNotasNuevo(e.target.value)}
          placeholder="Referencias, instrucciones, etc."
          rows={3}
        />
      </div>
    </FormDialogShell>
  );
}
