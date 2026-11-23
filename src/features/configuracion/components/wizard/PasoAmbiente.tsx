/**
 * Paso 1 del wizard FacturApi: elegir ambiente activo (sandbox vs producción).
 */
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import type { FacturapiAmbiente } from "@/features/configuracion/services/facturapiCredenciales";

interface Props {
  ambiente: FacturapiAmbiente;
  onChange: (a: FacturapiAmbiente) => void;
}

export function PasoAmbiente({ ambiente, onChange }: Props) {
  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          El ambiente define contra qué API de FacturApi se timbra.{" "}
          <strong>Sandbox</strong> es para pruebas (no genera CFDI válidos ante el SAT).{" "}
          <strong>Producción</strong> emite CFDI reales y consume folios.
          Empieza siempre en Sandbox y cambia a Producción cuando todo funcione.
        </AlertDescription>
      </Alert>

      <div className="rounded border p-4 space-y-3">
        <p id="facturapi-ambiente-title" className="text-sm font-medium">Ambiente para timbrar</p>
        <RadioGroup value={ambiente} aria-labelledby="facturapi-ambiente-title"
          onValueChange={(value) => onChange(value === "live" ? "live" : "sandbox")}>
          <Label htmlFor="facturapi-ambiente-sandbox" className="flex min-h-11 items-center gap-3 rounded-md border p-3">
            <RadioGroupItem id="facturapi-ambiente-sandbox" value="sandbox" />
            Sandbox (pruebas)
          </Label>
          <Label htmlFor="facturapi-ambiente-live" className="flex min-h-11 items-center gap-3 rounded-md border p-3">
            <RadioGroupItem id="facturapi-ambiente-live" value="live" />
            Producción · emite CFDI reales
          </Label>
        </RadioGroup>
        <p className="text-label text-muted-foreground">
          Selección actual: <strong>{ambiente === "live" ? "Producción" : "Sandbox"}</strong>.
          Podrás cambiarlo después desde la tarjeta de FacturApi.
        </p>
      </div>
    </div>
  );
}
