/**
 * Bloque R — Campos adicionales del formulario de póliza: montos (suma
 * asegurada, deducible), cobertura, certificado, contacto y notas.
 */
import { Input } from "@/components/ui/input";
import type { Ref } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SeguroEmbarqueInput } from "@/features/embarques/services/seguros";

type FormState = Omit<SeguroEmbarqueInput, "embarque_id">;

interface Props {
  form: FormState;
  setField: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  sumaRequerida: boolean;
  sumaInvalida: boolean;
  sumaRef: Ref<HTMLInputElement>;
}

export function SeguroFormCamposAdicionales({ form, setField, sumaRequerida, sumaInvalida, sumaRef }: Props) {
  return (
    <>
      <div>
        <Label htmlFor="seguro-suma">Suma asegurada</Label>
        <Input id="seguro-suma" ref={sumaRef} type="number" min={0} step={0.01} value={form.suma_asegurada}
          aria-required={sumaRequerida || undefined} aria-invalid={sumaInvalida || undefined}
          aria-describedby={sumaRequerida ? "seguro-suma-requisito" : undefined}
          onChange={(e) => setField("suma_asegurada", Number(e.target.value))} />
        {sumaRequerida && (
          <p id="seguro-suma-requisito" role={sumaInvalida ? "alert" : undefined}
            className={sumaInvalida ? "text-body-sm text-destructive mt-1" : "text-body-sm text-muted-foreground mt-1"}>
            Captura una suma asegurada mayor a cero.
          </p>
        )}
        {form.suma_asegurada < 0 && (
          <p className="text-body-sm text-destructive mt-1">La suma asegurada no puede ser negativa.</p>
        )}
      </div>
      <div>
        <Label htmlFor="seguro-deducible">Deducible</Label>
        <Input id="seguro-deducible" type="number" min={0} step={0.01} value={form.deducible}
          onChange={(e) => setField("deducible", Number(e.target.value))} />
        {form.deducible < 0 && (
          <p className="text-body-sm text-destructive mt-1">El deducible no puede ser negativo.</p>
        )}
      </div>

      <div className="sm:col-span-2">
        <Label htmlFor="seguro-cobertura">Cobertura</Label>
        <Textarea id="seguro-cobertura" rows={2} value={form.cobertura_descripcion ?? ""}
          onChange={(e) => setField("cobertura_descripcion", e.target.value || null)} />
      </div>

      <div>
        <Label htmlFor="seguro-certificado">Certificado (URL)</Label>
        <Input id="seguro-certificado" value={form.certificado_url ?? ""}
          onChange={(e) => setField("certificado_url", e.target.value || null)} />
      </div>
      <div>
        <Label htmlFor="seguro-contacto">Contacto</Label>
        <Input id="seguro-contacto" value={form.contacto ?? ""} onChange={(e) => setField("contacto", e.target.value || null)} />
      </div>

      <div className="sm:col-span-2">
        <Label htmlFor="seguro-notas">Notas</Label>
        <Textarea id="seguro-notas" rows={2} value={form.notas ?? ""}
          onChange={(e) => setField("notas", e.target.value || null)} />
      </div>
    </>
  );
}
