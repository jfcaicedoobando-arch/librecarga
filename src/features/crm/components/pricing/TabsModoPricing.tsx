/**
 * Pestañas por modo de la bandeja de Pricing. Un ejecutivo con un solo modo
 * asignado abre por defecto la pestaña de ese modo.
 */
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useModosEjecutivo } from "@/features/crm/hooks/useFlujoPricing";

export const MODOS_BANDEJA = ["todos", "Marítimo", "Aéreo", "Terrestre"] as const;

export function modoPorDefecto(modosPropios: string[]): string {
  return modosPropios.length === 1 ? modosPropios[0] : "todos";
}

export function useModoPropioPricing(): string {
  const { user } = useAuth();
  const { data } = useModosEjecutivo();
  return modoPorDefecto((data ?? []).filter((m) => m.user_id === user?.id).map((m) => m.modo));
}

export function TabsModoPricing({ valor, onCambiar }: { valor: string; onCambiar: (v: string) => void }) {
  return (
    <Tabs value={valor} onValueChange={onCambiar}>
      <TabsList aria-label="Modo de transporte">
        {MODOS_BANDEJA.map((m) => <TabsTrigger key={m} value={m}>{m === "todos" ? "Todas" : m}</TabsTrigger>)}
      </TabsList>
    </Tabs>
  );
}
