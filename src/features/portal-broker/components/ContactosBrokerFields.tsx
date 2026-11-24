/** Captura de contactos del prospecto externo (al menos uno con nombre). */
import { useLayoutEffect, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { contactoVacio, type ContactoBroker, type ProblemaAlta } from "../domain/altaProspecto";

interface Props {
  value: ContactoBroker[];
  onChange: (v: ContactoBroker[]) => void;
  problema: ProblemaAlta | null;
}

const CAMPOS: { k: keyof ContactoBroker; label: string; type?: string }[] = [
  { k: "nombre", label: "Nombre" },
  { k: "puesto", label: "Puesto" },
  { k: "email", label: "Correo", type: "email" },
  { k: "movil", label: "Teléfono móvil", type: "tel" },
  { k: "fijo", label: "Teléfono fijo", type: "tel" },
];

export default function ContactosBrokerFields({ value, onChange, problema }: Props) {
  const grupo = useRef<HTMLDivElement>(null);
  const agregar = useRef<HTMLButtonElement>(null);
  const contactoAEnfocar = useRef<number | null>(null);

  useLayoutEffect(() => {
    const indice = contactoAEnfocar.current;
    if (indice === null) return;
    contactoAEnfocar.current = null;
    const nombre = grupo.current?.querySelector<HTMLInputElement>(`#broker-contacto-${indice}-nombre`);
    (nombre ?? agregar.current)?.focus();
  }, [value.length]);

  const set = (i: number, k: keyof ContactoBroker, v: string) =>
    onChange(value.map((c, j) => (j === i ? { ...c, [k]: v } : c)));

  return (
    <div ref={grupo} role="group" aria-label="Contactos" className="space-y-3"
      aria-describedby={problema?.campo === "contactos" ? "broker-contactos-error" : undefined}>
      {problema?.campo === "contactos" && <p id="broker-contactos-error" className="text-body-sm text-destructive">{problema.mensaje}</p>}
      {value.map((c, i) => (
        <fieldset key={i} className="grid gap-2 sm:grid-cols-2 rounded-md border p-3">
          <legend className="px-1 text-body-sm font-medium">Contacto {i + 1}</legend>
          {CAMPOS.map((f) => {
            const id = `broker-contacto-${i}-${f.k}`;
            const correoInvalido = problema?.campo === "email" && problema.contacto === i && f.k === "email";
            return (
              <div key={f.k} className="space-y-1">
                <Label htmlFor={id}>{f.label}</Label>
                <Input
                  id={id}
                  aria-label={`${f.label} del contacto ${i + 1}`}
                  aria-invalid={correoInvalido || undefined}
                  aria-describedby={correoInvalido ? `${id}-error` : undefined}
                  type={f.type}
                  value={c[f.k]}
                  onChange={(e) => set(i, f.k, e.target.value)}
                />
                {correoInvalido && <p id={`${id}-error`} className="text-body-sm text-destructive">{problema.mensaje}</p>}
              </div>
            );
          })}
          {value.length > 1 && (
            <Button type="button" variant="ghost" size="sm" aria-label={`Quitar contacto ${i + 1}`} onClick={() => {
              contactoAEnfocar.current = Math.min(i, value.length - 2);
              onChange(value.filter((_, j) => j !== i));
            }}>
              <Trash2 className="h-4 w-4" /> Quitar
            </Button>
          )}
        </fieldset>
      ))}
      <Button ref={agregar} type="button" variant="outline" size="sm" onClick={() => {
        contactoAEnfocar.current = value.length;
        onChange([...value, contactoVacio()]);
      }}>
        <Plus className="h-4 w-4" /> Agregar contacto
      </Button>
    </div>
  );
}
