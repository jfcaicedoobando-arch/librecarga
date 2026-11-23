import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerMx } from "@/components/ui/date-picker-mx";
import { MapPin } from "lucide-react";
import { todayLocalISO } from "@/lib/date/today";
import { formatDate } from "@/lib/formatters";

const llegadaSchema = (hoy: string, etd?: string) => z.object({
  fecha: z.string().min(1, "Fecha requerida")
    .refine((v) => !v || !etd || v >= etd, "La llegada real debe ser igual o posterior a la ETD.")
    .refine((v) => v <= hoy, "La llegada real no puede ser futura."),
  ubicacion: z.string().max(120, "Máximo 120 caracteres").optional().default(""),
});
type LlegadaInput = z.input<ReturnType<typeof llegadaSchema>>;
type LlegadaForm = z.output<ReturnType<typeof llegadaSchema>>;

interface Props {
  destinoDefault: string;
  etd?: string | null;
  isPending: boolean;
  onSubmit: (v: LlegadaForm) => void | Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function MarcarLlegadaForm({
  destinoDefault,
  etd,
  isPending,
  onSubmit,
  onCancel,
  onDirtyChange,
}: Props) {
  const hoy = todayLocalISO();
  const fechaSalida = etd?.slice(0, 10);
  const salidaFutura = Boolean(fechaSalida && fechaSalida > hoy);
  const { control, handleSubmit, formState: { errors, isValid, isDirty } } = useForm<LlegadaInput, unknown, LlegadaForm>({
    resolver: zodResolver(llegadaSchema(hoy, fechaSalida)),
    defaultValues: {
      fecha: salidaFutura ? "" : hoy,
      ubicacion: destinoDefault,
    },
    mode: "onChange",
  });
  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" /> Registrar llegada real
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <div className="md:col-span-2 space-y-2 text-body-sm text-muted-foreground">
            <p>
              Si el embarque está En Tránsito o En Proceso, pasará a Arribo.
              En etapas posteriores compatibles conservará su estado.
            </p>
            <p>
              Completa los documentos pendientes antes de registrar la llegada.
              La fecha debe ser igual o posterior a la salida estimada (ETD{fechaSalida ? ` ${formatDate(fechaSalida)}` : ""}).
              Una llegada real ya registrada no puede sustituirse desde este formulario.
            </p>
          </div>
          {salidaFutura && (
            <p role="status" className="md:col-span-2 text-body-sm text-warning">
              La salida estimada es futura. La llegada real se puede registrar a partir de esa fecha.
            </p>
          )}
          <div className="space-y-2">
            <label htmlFor="marcar-llegada-fecha" className="text-body font-medium">Fecha de llegada real *</label>
            <Controller
              control={control}
              name="fecha"
              render={({ field }) => (
                <DatePickerMx
                  id="marcar-llegada-fecha"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  className="w-full"
                  min={salidaFutura ? undefined : fechaSalida}
                  max={hoy}
                  disabled={isPending || salidaFutura}
                  errorText={errors.fecha?.message ?? null}
                />
              )}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="marcar-llegada-ubicacion" className="text-body font-medium">Ubicación de llegada</label>
            <Controller
              control={control}
              name="ubicacion"
              render={({ field }) => (
                <Input id="marcar-llegada-ubicacion" {...field} placeholder="Punto de arribo" maxLength={120} disabled={isPending} />
              )}
            />
            {errors.ubicacion && <p className="text-body-sm text-destructive">{errors.ubicacion.message}</p>}
          </div>
          <div className="md:col-span-2 flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isPending}>
              Volver
            </Button>
            <Button type="submit" size="sm" disabled={!isValid || isPending || salidaFutura}>
              {isPending ? "Guardando…" : "Registrar llegada real"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
