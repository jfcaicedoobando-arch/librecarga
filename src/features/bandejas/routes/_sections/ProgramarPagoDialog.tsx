/**
 * Diálogo para programar pago en lote — extraído de CxpPorPagar.tsx (v13.317.9).
 *
 * Accesibilidad/teclado (v13.551.0): usa `FormDialogShell` con `<form>` real,
 * por lo que Enter en el campo de fecha confirma la programación.
 */
import { CalendarClock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { DatePickerMx } from "@/components/ui/date-picker-mx";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { FormDialogFooter } from "@/components/shared/FormDialogFooter";

export interface FalloProgramacion {
  id: string;
  folio: string | null;
  error: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cantidad: number;
  fechaProgramada: string;
  onFechaChange: (v: string) => void;
  isRunning: boolean;
  progreso?: { hecho: number; total: number } | null;
  fallos?: FalloProgramacion[];
  onConfirmar: () => void;
}

const FORM_ID = "form-programar-pago";

export function ProgramarPagoDialog({
  open, onOpenChange, cantidad, fechaProgramada, onFechaChange, isRunning, progreso, fallos = [], onConfirmar,
}: Props) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isRunning || !fechaProgramada || !cantidad) return;
    onConfirmar();
  };

  return (
    <FormDialogShell
      open={open}
      onOpenChange={onOpenChange}
      busy={isRunning}
      icon={CalendarClock}
      title="Programar pago"
      description={`Selecciona la fecha en la que Tesorería deberá ejecutar el pago para las ${cantidad} facturas seleccionadas.`}
      formId={FORM_ID}
      onSubmit={handleSubmit}
      footer={
        <FormDialogFooter
          formId={FORM_ID}
          onCancel={() => onOpenChange(false)}
          confirmLabel={
            isRunning
              ? `Programando (${progreso?.hecho ?? 0}/${progreso?.total ?? cantidad})...`
              : fallos.length > 0 ? "Reintentar facturas pendientes" : "Confirmar programación"
          }
          loading={isRunning}
          disabled={isRunning || !fechaProgramada || !cantidad}
        />
      }
    >
      <div className="space-y-2">
        <Label htmlFor="programar-fecha">Fecha de pago</Label>
        <DatePickerMx
          id="programar-fecha"
          disabled={isRunning}
          value={fechaProgramada}
          onChange={(v) => v && onFechaChange(v)}
          className="w-full"
        />
      </div>
      {fallos.length > 0 && (
        <div role="alert" className="mt-4 rounded-md border border-destructive/30 p-3 text-body-sm">
          <p className="font-medium">Facturas que quedaron sin programar</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {fallos.map(({ id, folio, error }) => (
              <li key={id}><strong>{folio || `Factura …${id.slice(-8)}`}</strong> · {error}</li>
            ))}
          </ul>
        </div>
      )}
    </FormDialogShell>
  );
}
