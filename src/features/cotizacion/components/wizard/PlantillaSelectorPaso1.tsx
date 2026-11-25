import { useState } from "react";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { notifyError } from "@/lib/ui/appFeedback";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/shared/dialogs/ConfirmActionDialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ChevronsUpDown, Sparkles } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import {
  useCotizacionPlantillas,
  useAplicarPlantilla,
  type CotizacionPlantilla,
} from "@/features/cotizacion/hooks/useCotizacionPlantillas";
import type { CotizacionFormValues } from "@/features/cotizacion/domain/mappers/cotizacionForm";

interface Props {
  organizationId: string | null;
  form: UseFormReturn<CotizacionFormValues>;
  plantillaId?: string | null;
  /** Se llama después de aplicar la plantilla — típicamente para saltar al paso 2. */
  onApplied?: () => void;
}

const nombresDeCampo: Partial<Record<keyof CotizacionFormValues, string>> = {
  clienteId: "Cliente",
  origen: "Origen",
  destino: "Destino",
  puertoOrigenId: "Puerto de origen",
  puertoDestinoId: "Puerto de destino",
  descripcionMercancia: "Descripción de la mercancía",
  validezPropuesta: "Vigencia de la propuesta",
  modo: "Modo de transporte",
  tipo: "Tipo de operación",
  tipoMovimiento: "Tipo de movimiento",
  tipoEmbarque: "Tipo de embarque",
  tipoContenedor: "Tipo de contenedor",
  numContenedores: "Número de contenedores",
  notas: "Notas",
};

function camposQueCambiaria(
  form: UseFormReturn<CotizacionFormValues>,
  valores: Partial<CotizacionFormValues> | undefined,
) {
  const actual = form.getValues();
  const base = form.formState.defaultValues;
  return Object.keys(valores ?? {}).filter((campo): campo is keyof CotizacionFormValues =>
    Object.hasOwn(actual, campo)
  ).filter((campo) => {
    const valorActual = JSON.stringify(actual[campo]);
    const modificado = base && valorActual !== JSON.stringify(base[campo]);
    return (modificado || form.getFieldState(campo).isDirty) && valorActual !== JSON.stringify(valores?.[campo]);
  });
}

export function PlantillaSelectorPaso1({ organizationId, form, plantillaId, onApplied }: Props) {
  const [open, setOpen] = useState(false);
  const [idAplicado, setIdAplicado] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<{ plantilla: CotizacionPlantilla; campos: string[] } | null>(null);
  const { data: plantillas = [], isLoading, isError, isFetching, refetch } = useCotizacionPlantillas(organizationId);
  const aplicar = useAplicarPlantilla();

  if (!organizationId) return null;
  if (isError) return (
    <div className="max-w-6xl mx-auto px-4 pt-4">
      <ErrorStateInline title="No se pudieron cargar las plantillas" message="Reintenta o continúa capturando la cotización."
        onRetry={() => void refetch()} retrying={isFetching} />
    </div>
  );
  if (!isLoading && plantillas.length === 0) return null;

  const preseleccionada = plantillas.find((p) => p.id === plantillaId && p.id !== idAplicado);

  const handleAplicar = async (id: string, nombre: string) => {
    try {
      const payload = await aplicar.mutateAsync(id);
      if (payload?.values) {
        const current = form.getValues();
        form.reset({ ...current, ...payload.values }, { keepDefaultValues: true });
        await form.trigger();
      }
      setOpen(false);
      setPendiente(null);
      setIdAplicado(id);
      notifySuccess(undefined, { title: `Plantilla "${nombre}" aplicada` });
      onApplied?.();
    } catch (err) {
      notifyError(undefined, {
        title: "No se pudo aplicar la plantilla",
        error: err,
        method: "PlantillaSelectorPaso1.aplicar",
      });
    }
  };

  const solicitarAplicacion = (plantilla: CotizacionPlantilla) => {
    const valores = plantilla.payload?.values;
    const campos = camposQueCambiaria(form, valores);
    if (campos.length === 0 && (valores || !form.formState.isDirty)) {
      void handleAplicar(plantilla.id, plantilla.nombre);
      return;
    }
    setOpen(false);
    setPendiente({
      plantilla,
      campos: campos.map((campo) => nombresDeCampo[campo] ?? campo.replace(/([A-Z])/g, " $1")),
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 pt-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed bg-muted/30 px-4 py-2.5">
        <Sparkles className="h-4 w-4 text-primary shrink-0" aria-hidden />
        <div className="flex-1 text-body">
          <span className="font-medium">¿Ruta frecuente?</span>{" "}
          <span className="text-muted-foreground">
            Empieza desde una plantilla guardada.
          </span>
        </div>
        {preseleccionada && (
          <Button
            size="sm"
            className="h-auto min-h-10 max-w-full whitespace-normal py-1 text-left md:min-h-9"
            loading={aplicar.isPending}
            onClick={() => solicitarAplicacion(preseleccionada)}
          >
            Aplicar {preseleccionada.nombre}
          </Button>
        )}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" loading={aplicar.isPending} disabled={isLoading}>
              {isLoading ? "Cargando plantillas…" : "Elegir plantilla"}
              <ChevronsUpDown className="h-3.5 w-3.5 ml-1 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" collisionPadding={8} aria-label="Plantillas de cotización"
            className="flex max-h-[var(--radix-popover-content-available-height)] w-[360px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-0">
            <Command className="min-h-0 flex-1">
              <CommandInput placeholder="Buscar plantilla…" />
              <CommandList className="min-h-0 flex-1 overflow-y-auto">
                <CommandEmpty>Sin plantillas.</CommandEmpty>
                <CommandGroup heading="Más usadas">
                  {plantillas.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={`${p.nombre} ${p.descripcion ?? ""}`}
                      onSelect={() => solicitarAplicacion(p)}
                    >
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <span className="font-medium truncate">{p.nombre}</span>
                        {p.descripcion && (
                          <span className="text-body-sm text-muted-foreground truncate">
                            {p.descripcion}
                          </span>
                        )}
                      </div>
                      <span className="text-label text-muted-foreground shrink-0">
                        {p.veces_usada > 0 ? `${p.veces_usada}×` : "Nueva"}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <ConfirmActionDialog
        open={pendiente !== null}
        onOpenChange={(open) => { if (!open && !aplicar.isPending) setPendiente(null); }}
        title="¿Reemplazar datos con la plantilla?"
        description={pendiente?.campos.length
          ? `La plantilla reemplazará estos datos de tu captura: ${pendiente.campos.join(", ")}.`
          : "La plantilla puede reemplazar datos de tu captura."}
        confirmLabel="Aplicar plantilla"
        cancelLabel="Conservar captura"
        isPending={aplicar.isPending}
        onConfirm={() => pendiente && !aplicar.isPending
          ? handleAplicar(pendiente.plantilla.id, pendiente.plantilla.nombre)
          : undefined}
      />
    </div>
  );
}
