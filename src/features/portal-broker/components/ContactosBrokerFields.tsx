/** Captura de contactos del prospecto externo (al menos uno con nombre). */
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { contactoVacio, type ContactoBroker } from "../domain/altaProspecto";

interface Props {
  value: ContactoBroker[];
  onChange: (v: ContactoBroker[]) => void;
}

const CAMPOS: { k: keyof ContactoBroker; label: string; type?: string }[] = [
  { k: "nombre", label: "Nombre" },
  { k: "puesto", label: "Puesto" },
  { k: "email", label: "Correo", type: "email" },
  { k: "movil", label: "Teléfono móvil", type: "tel" },
  { k: "fijo", label: "Teléfono fijo", type: "tel" },
];

export default function ContactosBrokerFields({ value, onChange }: Props) {
  const set = (i: number, k: keyof ContactoBroker, v: string) =>
    onChange(value.map((c, j) => (j === i ? { ...c, [k]: v } : c)));

  return (
    <div className="space-y-3">
      {value.map((c, i) => (
        <fieldset key={i} className="grid gap-2 sm:grid-cols-2 rounded-md border p-3">
          <legend className="px-1 text-body-sm font-medium">Contacto {i + 1}</legend>
          {CAMPOS.map((f) => (
            <div key={f.k} className="space-y-1">
              <Label htmlFor={`broker-contacto-${i}-${f.k}`}>{f.label}</Label>
              <Input
                id={`broker-contacto-${i}-${f.k}`}
                aria-label={`${f.label} del contacto ${i + 1}`}
                type={f.type}
                value={c[f.k]}
                onChange={(e) => set(i, f.k, e.target.value)}
              />
            </div>
          ))}
          {value.length > 1 && (
            <Button type="button" variant="ghost" size="sm" aria-label={`Quitar contacto ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" /> Quitar
            </Button>
          )}
        </fieldset>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, contactoVacio()])}>
        <Plus className="h-4 w-4" /> Agregar contacto
      </Button>
    </div>
  );
}
