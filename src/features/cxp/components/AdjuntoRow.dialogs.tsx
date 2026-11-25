import { ConfirmActionDialog } from "@/components/shared/dialogs/ConfirmActionDialog";
import type { TipoAdjuntoCfdi } from "@/features/cxp/services";

export function ConfirmReplaceDialog({
  file, tipo, onCancel, onConfirm,
}: {
  file: File | null;
  tipo: TipoAdjuntoCfdi;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  if (!file) return null;

  return (
    <ConfirmActionDialog
      open
      onOpenChange={(open) => { if (!open) onCancel(); }}
      title={`¿Reemplazar el ${tipo} actual?`}
      description={<>El archivo existente se sobreescribirá con <strong>{file.name}</strong>. Esta acción no se puede deshacer.</>}
      confirmLabel="Reemplazar"
      variant="destructive"
      onConfirm={() => onConfirm(file)}
    />
  );
}

export function ConfirmRemoveDialog({
  open, tipo, onOpenChange, onConfirm,
}: {
  open: boolean;
  tipo: TipoAdjuntoCfdi;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`¿Quitar el ${tipo} adjunto?`}
      description={`La factura permanecerá, pero ya no tendrá el archivo ${tipo}. Podrás adjuntar uno nuevo después.`}
      confirmLabel="Quitar"
      variant="destructive"
      onConfirm={onConfirm}
    />
  );
}
