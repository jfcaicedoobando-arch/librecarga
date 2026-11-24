/**
 * Pestañas por modo de la bandeja de Pricing. Un ejecutivo con un solo modo
 * asignado abre por defecto la pestaña de ese modo.
 */
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
const MODOS_BANDEJA = ["todos", "Marítimo", "Aéreo", "Terrestre"] as const;

export function TabsModoPricing({ valor, onCambiar }: { valor: string; onCambiar: (v: string) => void }) {
  return (
    <Tabs value={valor} onValueChange={onCambiar}>
      <TabsList aria-label="Modo de transporte">
        {MODOS_BANDEJA.map((m) => <TabsTrigger key={m} value={m}>{m === "todos" ? "Todas" : m}</TabsTrigger>)}
      </TabsList>
    </Tabs>
  );
}
