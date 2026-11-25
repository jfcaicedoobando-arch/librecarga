/**
 * Footer estándar de los modales tipo formulario.
 *
 * Resuelve de una sola vez el patrón de teclado que antes se copiaba a mano:
 *  - "Cancelar" es `type="button"` (nunca envía el formulario);
 *  - "Guardar" es `type="submit" form={formId}` para que viva en el footer
 *    sticky de `FormDialogShell` (fuera del `<form>`) y aun así envíe con Enter;
 *  - un solo estado `loading`/`disabled` para evitar dobles clics.
 *
 * Cuando el diálogo no tiene `<form>` (confirmaciones simples), se puede omitir
 * `formId` y pasar `onConfirm`: el botón vuelve a ser un `type="button"`.
 */
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useFormDialogCerrar } from "@/components/shared/formDialogCloseContext";
import { cn } from "@/lib/utils";

interface ActionsProps {
  cancel: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
  help?: ReactNode;
}

/** Agrupa los botones en el pie del modal y reserva un renglón para la ayuda. */
export function FormDialogFooterActions({ cancel, primary, secondary, help }: ActionsProps) {
  return (
    <div className="grid w-full min-w-0 gap-2">
      {help && <div className="min-w-0">{help}</div>}
      <div
        role="group"
        aria-label="Acciones del formulario"
        className={cn(
          "grid min-w-0 grid-cols-2 gap-2 sm:flex sm:justify-end",
          "max-sm:[&>button]:h-auto max-sm:[&>button]:min-h-11 max-sm:[&>button]:whitespace-normal max-sm:[&>button]:px-2",
          Boolean(secondary) && "max-sm:[&>button:last-child]:col-span-2",
        )}
      >
        {cancel}
        {secondary}
        {primary}
      </div>
    </div>
  );
}

interface Props {
  /** id del `<form>` del cuerpo. Si se omite, se usa `onConfirm`. */
  formId?: string;
  onCancel: () => void;
  onConfirm?: () => void;
  /** Texto del botón principal. */
  confirmLabel?: ReactNode;
  cancelLabel?: string;
  /** Operación en curso: muestra spinner y bloquea ambos botones. */
  loading?: boolean;
  /** Formulario incompleto o inválido: sólo bloquea el botón principal. */
  disabled?: boolean;
  variant?: "default" | "destructive";
  /** Contenido extra a la izquierda (avisos, contadores, botones auxiliares). */
  extra?: ReactNode;
}

export function FormDialogFooter({
  formId,
  onCancel,
  onConfirm,
  confirmLabel = "Guardar",
  cancelLabel = "Cancelar",
  loading = false,
  disabled = false,
  variant = "default",
  extra,
}: Props) {
  const cerrarGuardado = useFormDialogCerrar();

  return (
    <>
      {extra && <div className="mr-auto flex items-center gap-2">{extra}</div>}
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          if (cerrarGuardado) cerrarGuardado();
          else onCancel();
        }}
        disabled={loading}
      >
        {cancelLabel}
      </Button>
      <Button
        type={formId ? "submit" : "button"}
        form={formId}
        variant={variant}
        onClick={formId ? undefined : onConfirm}
        disabled={disabled}
        loading={loading}
      >
        {confirmLabel}
      </Button>
    </>
  );
}
