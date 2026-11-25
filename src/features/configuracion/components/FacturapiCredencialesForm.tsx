/**
 * Sub-componente presentacional del formulario de credenciales FacturApi.
 * v13.137.18 — Self-service: el admin de la org pega aquí sus API keys (sandbox/live).
 * La key real viaja al servidor vía RPC y se guarda cifrada en vault.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { FacturapiAmbiente } from "@/features/configuracion/services/facturapiCredenciales";
import { DatePickerMx } from "@/components/ui/date-picker-mx";
import { FacturapiApiKeyRow } from "@/features/configuracion/components/FacturapiApiKeyRow";

type Props = {
  orgId: string;
  ambiente: FacturapiAmbiente;
  setAmbiente: (v: FacturapiAmbiente) => void;
  facturapiOrgId: string;
  setFacturapiOrgId: (v: string) => void;
  sandboxLast4: string | null;
  liveLast4: string | null;
  datosFiscales: boolean;
  setDatosFiscales: (v: boolean) => void;
  csdCargado: boolean;
  setCsdCargado: (v: boolean) => void;
  csdVence: string;
  setCsdVence: (v: string) => void;
};

export default function FacturapiCredencialesForm(props: Props) {
  const {
    orgId, ambiente, setAmbiente, facturapiOrgId, setFacturapiOrgId,
    sandboxLast4, liveLast4,
    datosFiscales, setDatosFiscales, csdCargado, setCsdCargado,
    csdVence, setCsdVence,
  } = props;

  return (
    <>
      <Alert>
        <AlertDescription className="text-xs">
          <strong>1.</strong> Crea tu cuenta en{" "}
          <a href="https://facturapi.io" target="_blank" rel="noreferrer" className="underline">facturapi.io</a>
          {" "}y sube tu CSD.{" "}
          <strong>2.</strong> Copia tu <em>Secret key</em> (Sandbox para pruebas, Live para producción).{" "}
          <strong>3.</strong> Pégala abajo y prueba la conexión. Cuando todo funcione, cambia el ambiente a Producción.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <fieldset className="space-y-2">
          <legend id="facturapi-ambiente-avanzado" className="text-body font-medium">Ambiente activo</legend>
          <RadioGroup value={ambiente} aria-labelledby="facturapi-ambiente-avanzado"
            aria-describedby="facturapi-ambiente-ayuda" onValueChange={(value) => {
              if (value === "live" || value === "sandbox") setAmbiente(value);
            }}>
            <Label htmlFor="facturapi-avanzado-sandbox" className="flex items-center gap-2 rounded border p-3">
              <RadioGroupItem id="facturapi-avanzado-sandbox" value="sandbox" /> Sandbox (pruebas)
            </Label>
            <Label htmlFor="facturapi-avanzado-live" className="flex items-center gap-2 rounded border p-3">
              <RadioGroupItem id="facturapi-avanzado-live" value="live" /> Producción
            </Label>
          </RadioGroup>
          <p id="facturapi-ambiente-ayuda" className="text-label text-muted-foreground">
            Define qué API key usar al timbrar. Empieza siempre en Sandbox.
          </p>
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor="facturapi_org_id">Organization ID en FacturApi (opcional)</Label>
          <Input
            id="facturapi_org_id"
            value={facturapiOrgId}
            onChange={(e) => setFacturapiOrgId(e.target.value)}
            placeholder="se autocompleta al probar la conexión"
          />
        </div>
      </div>

      <div className="space-y-3">
        <FacturapiApiKeyRow orgId={orgId} ambiente="sandbox" last4={sandboxLast4} label="Sandbox" prefijo="sk_test_" />
        <FacturapiApiKeyRow orgId={orgId} ambiente="live" last4={liveLast4} label="Producción" prefijo="sk_live_" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t">
        <div className="flex items-center justify-between rounded border p-3">
          <div>
            <Label htmlFor="facturapi-datos-fiscales" className="text-sm">Datos fiscales</Label>
            <p className="text-label text-muted-foreground">RFC, régimen, domicilio</p>
          </div>
          <Switch id="facturapi-datos-fiscales" checked={datosFiscales} onCheckedChange={setDatosFiscales} />
        </div>
        <div className="flex items-center justify-between rounded border p-3">
          <div>
            <Label htmlFor="facturapi-csd-cargado" className="text-sm">CSD cargado</Label>
            <p className="text-label text-muted-foreground">En FacturApi</p>
          </div>
          <Switch id="facturapi-csd-cargado" checked={csdCargado} onCheckedChange={setCsdCargado} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="csd_vence" className="text-sm">CSD vence</Label>
          <DatePickerMx id="csd_vence" value={csdVence} onChange={setCsdVence} />
        </div>
      </div>
    </>
  );
}
