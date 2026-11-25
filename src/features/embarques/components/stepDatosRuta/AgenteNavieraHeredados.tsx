/**
 * v13.303.35 — Selectores de Agente y Naviera para embarques.
 *
 * Ambos vienen precargados desde la tarifa vinculada de la cotización.
 * Muestran badge "Cotización" cuando el valor coincide con el heredado y
 * permiten un override manual (con opción de restaurar).
 */
import { useCallback, useId, useMemo, useRef } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/shared/FormField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNavieras } from "@/features/catalogos/hooks/useNavieras";
import { useCosteoAgentes } from "@/features/costeo/hooks/useCosteoAgentes";
import { opcionesConValorGuardado } from "@/features/embarques/domain/opcionesCatalogo";
import type { EmbarqueFormValues } from "@/features/embarques/hooks";
import { useSyncNombreDesdeCatalogo } from "./agenteNavieraHeredados.helpers";

const NONE = "__none__";

function EstadoHerencia({ id, heredado, campo, onRestaurar }: {
  id: string;
  heredado: boolean;
  campo: "agente" | "naviera";
  onRestaurar?: () => void;
}) {
  if (heredado) return <Badge id={id} variant="secondary" className="text-2xs font-normal">Cotización</Badge>;
  if (!onRestaurar) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p id={id} className="text-label text-muted-foreground">
        Cambiaste {campo === "agente" ? "el agente heredado" : "la naviera heredada"} de la cotización.
      </p>
      <Button type="button" variant="ghost" size="sm" onClick={onRestaurar}>
        <Undo2 className="h-3 w-3" /> Restaurar {campo}
      </Button>
    </div>
  );
}


export function AgenteEmbarqueSelector({ cotizacionAgenteId }: { cotizacionAgenteId?: string | null }) {
  const { setValue, watch } = useFormContext<EmbarqueFormValues>();
  const herenciaId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { data: agentes = [] } = useCosteoAgentes();
  const currentId = watch("agenteId");
  const nombreGuardado = watch("agente");
  const heredado = !!cotizacionAgenteId && currentId === cotizacionAgenteId;
  const overriden = !!cotizacionAgenteId && currentId !== cotizacionAgenteId;

  useSyncNombreDesdeCatalogo(
    "agente",
    currentId,
    nombreGuardado,
    useCallback((id: string) => agentes.find((a) => a.id === id)?.nombre, [agentes]),
    useCallback((campo, nombre) => setValue(campo, nombre, { shouldValidate: true, shouldDirty: false }), [setValue]),
  );

  const opciones = useMemo(
    () =>
      opcionesConValorGuardado(
        agentes.filter((a) => a.activo).map((a) => ({ id: a.id, label: a.nombre })),
        currentId,
        nombreGuardado,
      ),
    [agentes, currentId, nombreGuardado],
  );

  const restaurar = overriden && cotizacionAgenteId ? () => {
    const original = agentes.find((a) => a.id === cotizacionAgenteId);
    setValue("agenteId", cotizacionAgenteId, { shouldValidate: true, shouldDirty: true });
    setValue("agente", original?.nombre ?? "", { shouldValidate: true, shouldDirty: true });
    triggerRef.current?.focus();
  } : undefined;

  return (
    <Controller
      name="agenteId"
      render={({ field, fieldState }) => (
        <FormField label="Agente" error={fieldState.error?.message}>
          <Select
            value={field.value ?? NONE}
            onValueChange={(v) => {
              const id = v === NONE ? null : v;
              field.onChange(id);
              const nombre = id ? (agentes.find((a) => a.id === id)?.nombre ?? "") : "";
              setValue("agente", nombre, { shouldValidate: true, shouldDirty: true });
            }}
          >
            <SelectTrigger ref={triggerRef} aria-describedby={cotizacionAgenteId ? herenciaId : undefined}>
              <SelectValue placeholder="Sin agente asignado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sin agente</SelectItem>
              {opciones.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <EstadoHerencia id={herenciaId} heredado={heredado} campo="agente" onRestaurar={restaurar} />
        </FormField>
      )}
    />
  );
}

type NavieraEmbarqueSelectorProps = { cotizacionNavieraId?: string | null; className?: string; error?: string };

export function NavieraEmbarqueSelector({ cotizacionNavieraId, className, error }: NavieraEmbarqueSelectorProps) {
  const { setValue, watch } = useFormContext<EmbarqueFormValues>();
  const herenciaId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { data: navieras = [] } = useNavieras();
  const currentId = watch("navieraId");
  const nombreGuardado = watch("naviera");
  const heredado = !!cotizacionNavieraId && currentId === cotizacionNavieraId;
  const overriden = !!cotizacionNavieraId && currentId !== cotizacionNavieraId;

  useSyncNombreDesdeCatalogo(
    "naviera",
    currentId,
    nombreGuardado,
    useCallback((id: string) => navieras.find((n) => n.id === id)?.name, [navieras]),
    useCallback((campo, nombre) => setValue(campo, nombre, { shouldValidate: true, shouldDirty: false }), [setValue]),
  );

  const opciones = useMemo(
    () =>
      opcionesConValorGuardado(
        navieras.map((n) => ({ id: n.id, label: n.name })),
        currentId,
        nombreGuardado,
      ),
    [navieras, currentId, nombreGuardado],
  );

  const restaurar = overriden && cotizacionNavieraId ? () => {
    const original = navieras.find((n) => n.id === cotizacionNavieraId);
    setValue("navieraId", cotizacionNavieraId, { shouldValidate: true, shouldDirty: true });
    setValue("naviera", original?.name ?? "", { shouldValidate: true, shouldDirty: true });
    triggerRef.current?.focus();
  } : undefined;

  return (
    <Controller
      name="navieraId"
      render={({ field, fieldState }) => (
        <FormField label="Naviera" required className={className}
          error={fieldState.error?.message ?? (nombreGuardado?.trim() ? undefined : error)}>
          <Select
            value={field.value ?? NONE}
            onValueChange={(v) => {
              const id = v === NONE ? null : v;
              field.onChange(id);
              const nombre = id ? (navieras.find((n) => n.id === id)?.name ?? "") : "";
              setValue("naviera", nombre, { shouldValidate: true, shouldDirty: true });
            }}
          >
            <SelectTrigger ref={triggerRef} aria-required aria-describedby={cotizacionNavieraId ? herenciaId : undefined}>
              <SelectValue placeholder="Seleccionar naviera" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sin naviera</SelectItem>
              {opciones.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <EstadoHerencia id={herenciaId} heredado={heredado} campo="naviera" onRestaurar={restaurar} />
        </FormField>
      )}
    />
  );
}
