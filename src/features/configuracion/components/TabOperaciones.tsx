/**
 * Tab "Operaciones" en /configuracion (por organización, Fase 2).
 * Cada empresa define sus propios umbrales de varianza para la
 * reconciliación Cotizado / Refrescado / Real.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { useConfigValue, useUpdateConfiguracion } from "@/features/configuracion/hooks/useConfiguracion";
import { UMBRALES_DEFAULT } from "@/lib/domain/versionadoCotizacion";

export default function TabOperaciones() {
  const alertaActual = useConfigValue<number>(
    "operaciones",
    "reconciliacion_varianza_alerta_pct",
    UMBRALES_DEFAULT.alerta_pct,
  );
  const criticaActual = useConfigValue<number>(
    "operaciones",
    "reconciliacion_varianza_critica_pct",
    UMBRALES_DEFAULT.critica_pct,
  );
  const updateConfig = useUpdateConfiguracion();

  const [alerta, setAlerta] = useState(String(alertaActual));
  const [critica, setCritica] = useState(String(criticaActual));
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized) return;
    setAlerta(String(alertaActual));
    setCritica(String(criticaActual));
    setInitialized(true);
  }, [alertaActual, criticaActual, initialized]);

  const alertaPct = Number(alerta);
  const criticaPct = Number(critica);
  const errorAlerta = !alerta.trim() || !Number.isFinite(alertaPct) || alertaPct < 0
    ? "Captura un umbral de alerta mayor o igual a cero."
    : undefined;
  const errorCritica = !critica.trim() || !Number.isFinite(criticaPct)
    ? "Captura el umbral crítico."
    : !errorAlerta && criticaPct <= alertaPct ? "El umbral crítico debe ser mayor que el de alerta." : undefined;
  const valido = !errorAlerta && !errorCritica;

  const handleGuardar = () => {
    if (!valido) return;
    updateConfig.mutate([
      { categoria: "operaciones", clave: "reconciliacion_varianza_alerta_pct", valor: alertaPct },
      { categoria: "operaciones", clave: "reconciliacion_varianza_critica_pct", valor: criticaPct },
    ]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reconciliación de embarques</CardTitle>
        <CardDescription>
          Define los umbrales de tu empresa para clasificar varianzas Cotizado → Real.
          Aplican a la matriz de reconciliación de cada embarque.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
          <div className="p-3 rounded-lg border">
            <FormField label="Umbral de alerta (%)" hint="A partir de este % la varianza se marca como alerta" error={errorAlerta}>
              <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={alerta}
              onChange={(e) => setAlerta(e.target.value)}
                className="w-28"
              />
            </FormField>
          </div>

          <div className="p-3 rounded-lg border">
            <FormField label="Umbral crítico (%)" hint="A partir de este % la varianza se marca como crítica" error={errorCritica}>
              <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={critica}
              onChange={(e) => setCritica(e.target.value)}
                className="w-28"
              />
            </FormField>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleGuardar} disabled={updateConfig.isPending || !valido}>
            <Save className="h-4 w-4 mr-2" /> Guardar umbrales
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
