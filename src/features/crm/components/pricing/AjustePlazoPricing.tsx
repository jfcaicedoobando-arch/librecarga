/**
 * Controles del gerente de operaciones: cambiar complejidad o ampliar plazo,
 * siempre con justificación (avisa al solicitante y administradores).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePlazoPricing } from "@/features/crm/hooks/usePlazoPricing";
import { puedeAmpliarPlazo } from "@/features/crm/services/pricing/plazoPricing";
import { ETIQUETA_COMPLEJIDAD, type SolicitudPricingRow } from "@/features/crm/services/pricing/tiposPricing";

export function AjustePlazoPricing({ solicitud: s }: { solicitud: SolicitudPricingRow }) {
  const m = usePlazoPricing();
  const [complejidad, setComplejidad] = useState(s.complejidad);
  const [horas, setHoras] = useState("");
  const [motivo, setMotivo] = useState("");
  if (s.estado !== "enviada") return null;
  const motivoOk = motivo.trim().length >= 10;
  const ampliable = puedeAmpliarPlazo(s, new Date());
  const nHoras = Number(horas);
  const horasValidas = Number.isInteger(nHoras) && nHoras >= 49 && nHoras <= 720;
  const errorHoras = horas !== "" && !horasValidas;
  const base = { id: s.id, oportunidadId: s.oportunidad_id, motivo: motivo.trim() };
  const limpiar = { onSuccess: () => { setMotivo(""); setHoras(""); } };
  return (
    <Card>
      <CardContent className="grid gap-3 py-4 md:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="aj-comp">Complejidad</Label>
          <Select value={complejidad} onValueChange={setComplejidad}>
            <SelectTrigger id="aj-comp"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ETIQUETA_COMPLEJIDAD).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {ampliable && (
          <div className="space-y-1">
            <Label htmlFor="aj-horas">Nuevo plazo (horas)</Label>
            <Input id="aj-horas" aria-describedby="aj-horas-ayuda" aria-invalid={errorHoras || undefined}
              type="number" min={49} max={720} step={1} value={horas} onChange={(e) => setHoras(e.target.value)} />
            <p id="aj-horas-ayuda" className={errorHoras ? "text-body-sm text-destructive" : "text-body-sm text-muted-foreground"}>
              {errorHoras ? "Escribe un número entero entre 49 y 720 horas." : "De 49 a 720 horas enteras."}
            </p>
          </div>
        )}
        <div className="space-y-1 md:col-span-3">
          <Label htmlFor="aj-motivo">Justificación (obligatoria)</Label>
          <Textarea id="aj-motivo" aria-describedby="aj-motivo-ayuda" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <p id="aj-motivo-ayuda" className="text-body-sm text-muted-foreground">Mínimo 10 caracteres.</p>
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-3">
          <Button size="sm" variant="outline" disabled={!motivoOk || complejidad === s.complejidad || m.isPending}
            onClick={() => m.mutate({ ...base, tipo: "complejidad", complejidad }, limpiar)}>Cambiar complejidad</Button>
          {ampliable && (
            <Button size="sm" variant="outline" disabled={!motivoOk || !horasValidas || m.isPending}
              onClick={() => m.mutate({ ...base, tipo: "plazo", horas: nHoras }, limpiar)}>Ampliar plazo</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
