/**
 * Tarjeta para que administración o gerencia comercial ajuste el margen
 * mínimo de utilidad estimada sin tocar código.
 */
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/shared/FormField";
import { useAuth } from "@/lib/contexts/AuthContext";
import { puedeAutorizarMargenBajo } from "@/lib/domain/margenMinimo";
import { useGuardarMargenMinimo, useMargenMinimo } from "@/features/configuracion/hooks/useMargenMinimo";

export default function MargenMinimoCard() {
  const { effectiveRole } = useAuth();
  const actual = useMargenMinimo();
  const guardar = useGuardarMargenMinimo();
  const [valor, setValor] = useState(String(actual));

  useEffect(() => { setValor(String(actual)); }, [actual]);

  const puedeEditar = puedeAutorizarMargenBajo(effectiveRole);
  const pct = Number(valor);
  const error = !valor.trim() ? "Ingresa un margen mínimo."
    : !Number.isFinite(pct) || pct < 0 || pct > 100 ? "Debe estar entre 0 y 100."
    : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Margen comercial mínimo</CardTitle>
        <CardDescription>
          Si al editar un embarque el margen de utilidad estimada queda por debajo de este porcentaje,
          se requiere autorización de administración o gerencia comercial. Por encima no se pide nada.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-4">
        <FormField label="Margen mínimo (%)" hint="Valor por defecto: 8%" error={error}>
          <Input
            type="number" min={0} max={100} step={0.5} className="w-28"
            value={valor} disabled={!puedeEditar}
            onChange={(e) => setValor(e.target.value)}
          />
        </FormField>
        {puedeEditar && (
          <Button onClick={() => guardar.mutate(pct)} disabled={!!error || guardar.isPending || pct === actual}>
            <Save className="h-4 w-4 mr-2" /> Guardar margen
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
