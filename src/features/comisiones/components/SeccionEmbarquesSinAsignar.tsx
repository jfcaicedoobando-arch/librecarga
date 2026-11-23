import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAsignarVendedoraEmbarque, useEmbarquesSinVendedora } from "@/features/comisiones/hooks";

interface VendedoraOpt { id: string; nombre: string }

export function SeccionEmbarquesSinAsignar({ vendedoras }: { vendedoras: VendedoraOpt[] }) {
  const { data: embarques = [], isLoading, isError, isFetching, refetch } = useEmbarquesSinVendedora();
  const asignar = useAsignarVendedoraEmbarque();
  const [sel, setSel] = useState<Record<string, string>>({});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Embarques sin vendedora asignada{!isLoading && !isError && ` (${embarques.length})`}</CardTitle>
      </CardHeader>
      <CardContent>
        {isError ? (
          <ErrorStateInline title="No se pudieron cargar los embarques" message="Reintenta para consultar cuáles necesitan asignación." onRetry={() => void refetch()} retrying={isFetching} />
        ) : isLoading ? (
          <EmptyStateInline loading message="Cargando embarques…" />
        ) : embarques.length === 0 ? (
          <EmptyStateInline icon={CheckCircle2} message="Todos los embarques tienen vendedora asignada." />
        ) : (
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {embarques.map((e) => (
              <div key={e.id} className="flex items-center gap-2 border rounded p-2 text-sm">
                <div className="flex-1">
                  <p className="font-mono text-xs">{e.expediente}</p>
                  <p className="text-xs text-muted-foreground">{e.cliente_nombre}</p>
                </div>
                <Select value={sel[e.id] ?? ""} onValueChange={(v) => setSel((s) => ({ ...s, [e.id]: v }))}>
                  <SelectTrigger className="w-[200px]"><SelectValue placeholder="Vendedora" /></SelectTrigger>
                  <SelectContent>
                    {vendedoras.map((v) => <SelectItem key={v.id} value={v.id}>{v.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button
                  size="sm" variant="outline"
                  disabled={!sel[e.id] || asignar.isPending}
                  onClick={() => asignar.mutate({
                    embarqueId: e.id,
                    vendedoraId: sel[e.id],
                    etiqueta: `${e.expediente} → ${vendedoras.find((v) => v.id === sel[e.id])?.nombre ?? "vendedora"}`,
                  })}
                >

                  Asignar
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
