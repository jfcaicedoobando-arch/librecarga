import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DatePickerMx } from "@/components/ui/date-picker-mx";
import { parseFlexible } from "@/components/ui/date-picker-mx-helpers";

interface Props { disabled: boolean; onConfirmar: (fecha: string | null) => void }

export function ConfirmarPerfilFiscal({ disabled, onConfirmar }: Props) {
  const [revisado, setRevisado] = useState(false);
  const [fecha, setFecha] = useState("");
  const [errorFecha, setErrorFecha] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const confirmar = () => {
    const input = container.current?.querySelector<HTMLInputElement>("#perfil-fiscal-vigencia");
    const raw = input?.value.trim() ?? "";
    const iso = raw ? parseFlexible(raw) : null;
    if ((raw && !iso) || input?.getAttribute("aria-invalid") === "true") {
      setErrorFecha(true);
      input?.focus();
      return;
    }
    setErrorFecha(false);
    onConfirmar(iso);
  };
  return (
    <div ref={container} className="space-y-3 border-t pt-4">
      <div className="flex items-start gap-2">
        <Checkbox id="perfil-fiscal-revisado" checked={revisado} disabled={disabled}
          onCheckedChange={(value) => setRevisado(value === true)} />
        <Label htmlFor="perfil-fiscal-revisado" className="leading-relaxed">
          Revisé estos datos y coinciden con la constancia de situación fiscal del emisor.
        </Label>
      </div>
      <div className="max-w-xs space-y-1">
        <Label htmlFor="perfil-fiscal-vigencia">Vigente desde (opcional)</Label>
        <DatePickerMx id="perfil-fiscal-vigencia" value={fecha} onChange={setFecha} disabled={disabled} />
        {errorFecha && <p role="alert" className="text-sm text-destructive">Corrige la fecha o deja el campo vacío.</p>}
        <p className="text-xs text-muted-foreground">Captura la fecha efectiva si la conoces.</p>
      </div>
      <Button size="sm" disabled={!revisado || disabled} onClick={confirmar}>
        Confirmar datos fiscales
      </Button>
    </div>
  );
}
