import type { Ref } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ErrorCorreoProforma {
  campo: "to" | "cc";
  texto: string;
}

export function CampoCorreoProforma({ campo, ref, error, value, onChange }: {
  campo: ErrorCorreoProforma["campo"];
  ref: Ref<HTMLInputElement>;
  error: ErrorCorreoProforma | null;
  value: string;
  onChange: (value: string) => void;
}) {
  const para = campo === "to";
  const id = para ? "dest" : "cc";
  const mensaje = error?.campo === campo ? error.texto : undefined;
  return (
    <div>
      <Label htmlFor={id}>{para ? "Para *" : "CC (opcional)"}</Label>
      <Input id={id} ref={ref} aria-invalid={!!mensaje} aria-describedby={mensaje ? `${id}-error` : undefined}
        list="proforma-emails-sugeridos" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={para ? "cliente@empresa.com, otro@empresa.com" : "contabilidad@empresa.com"} />
      {mensaje && <p id={`${id}-error`} role="alert" className="text-body-sm text-destructive">{mensaje}</p>}
    </div>
  );
}
