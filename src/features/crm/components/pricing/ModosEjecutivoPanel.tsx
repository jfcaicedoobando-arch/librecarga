/**
 * Gerencia/Administración define qué modos atiende cada ejecutivo de Pricing.
 * Si un modo no tiene a nadie, los avisos llegan a todo Pricing.
 */
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { useUsuariosOrgCrm } from "@/features/crm/hooks/usePricingCrm";
import { useGuardarModosEjecutivo, useModosEjecutivo } from "@/features/crm/hooks/useFlujoPricing";

const MODOS = ["Marítimo", "Aéreo", "Terrestre"] as const;
const ROLES = new Set(["ejecutivo_pricing", "gerente_operaciones"]);

export function ModosEjecutivoPanel() {
  const usuarios = useUsuariosOrgCrm();
  const modos = useModosEjecutivo();
  const guardar = useGuardarModosEjecutivo();
  const ejecutivos = (usuarios.data ?? []).filter((u) => ROLES.has(u.role));
  const de = (id: string) => (modos.data ?? []).filter((m) => m.user_id === id).map((m) => m.modo);
  const alternar = (id: string, modo: string, activo: boolean) => {
    const actuales = de(id);
    guardar.mutate({ userId: id, modos: activo ? [...actuales, modo] : actuales.filter((x) => x !== modo) });
  };
  return (
    <Collapsible className="rounded-lg border bg-card">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between">
          Modos que atiende cada ejecutivo <ChevronDown className="h-4 w-4" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 p-3">
        <p className="text-body-sm text-muted-foreground">
          Los avisos de una solicitud llegan a quien atiende su modo. Si nadie lo atiende, se avisa a todo Pricing.
        </p>
        {usuarios.isLoading || modos.isLoading ? <p role="status" className="text-body-sm">Cargando…</p> : null}
        {!usuarios.isLoading && ejecutivos.length === 0 && <p className="text-body-sm">No hay ejecutivos de Pricing en esta empresa.</p>}
        {ejecutivos.map((u) => (
          <div key={u.user_id} className="flex flex-wrap items-center gap-4">
            <span className="w-56 text-body-sm font-medium">{u.nombre}</span>
            {MODOS.map((modo) => {
              const id = `modo-${u.user_id}-${modo}`;
              return (
                <label key={modo} htmlFor={id} className="flex items-center gap-2 text-body-sm">
                  <Checkbox id={id} checked={de(u.user_id).includes(modo)} disabled={guardar.isPending}
                    onCheckedChange={(v) => alternar(u.user_id, modo, v === true)} />
                  {modo}
                </label>
              );
            })}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
