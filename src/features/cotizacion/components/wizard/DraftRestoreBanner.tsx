/**
 * Banner de restauración de borrador (P0 — v13.293.0).
 * Se muestra al entrar a "Nueva cotización" si existe un borrador válido
 * (guardado hace <24 h) para el usuario actual.
 */
import { useMemo, useState } from "react";
import { ConfirmActionDialog } from "@/components/shared/dialogs/ConfirmActionDialog";
import { RotateCcw, X, FileClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelativo } from "@/lib/date/relativo";

interface Props {
  savedAt: number;
  onRestore: () => void;
  onDiscard: () => void;
  tieneBorradorEnErp?: boolean;
}

export function DraftRestoreBanner({ savedAt, onRestore, onDiscard, tieneBorradorEnErp }: Props) {
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const relative = useMemo(() => formatRelativo(new Date(savedAt)), [savedAt]);
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 mb-4"
    >
      <FileClock className="h-5 w-5 [color:hsl(var(--primary))] shrink-0" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-body font-medium">Tienes un borrador sin terminar</p>
        <p className="text-body-sm text-muted-foreground">
          Guardado automáticamente {relative}. ¿Retomar donde te quedaste?
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button size="sm" variant="outline" onClick={() => setConfirmarDescarte(true)}>
          <X className="h-4 w-4 mr-1" /> Descartar
        </Button>
        <Button size="sm" onClick={onRestore}>
          <RotateCcw className="h-4 w-4 mr-1" /> Restaurar
        </Button>
      </div>
      <ConfirmActionDialog
        open={confirmarDescarte}
        onOpenChange={setConfirmarDescarte}
        title="¿Eliminar el borrador de este navegador?"
        description={tieneBorradorEnErp
          ? "Se perderá la captura local. El borrador que ya guardaste en LibreCarga seguirá en Cotizaciones."
          : "Se perderá la captura local que aún no se ha guardado en LibreCarga."}
        confirmLabel="Eliminar borrador local"
        cancelLabel="Conservar borrador"
        variant="destructive"
        onConfirm={() => { setConfirmarDescarte(false); onDiscard(); }}
      />
    </div>
  );
}
