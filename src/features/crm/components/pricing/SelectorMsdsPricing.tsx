import { useLayoutEffect, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prepararMsdsPricing } from "@/features/crm/services/pricing/msdsPricing";

interface Props { onArchivo: (file: File) => void; disabled?: boolean }

export function SelectorMsdsPricing({ onArchivo, disabled }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [validando, setValidando] = useState(false);
  const generacion = useRef(0);
  useLayoutEffect(() => () => { generacion.current += 1; }, []);
  const elegir = async (file: File) => {
    const actual = ++generacion.current;
    setValidando(true);
    setError(null);
    try {
      const pdf = await prepararMsdsPricing(file);
      if (actual === generacion.current) onArchivo(pdf);
    } catch (e) {
      if (actual === generacion.current) setError(e instanceof Error ? e.message : "No se pudo leer la MSDS.");
    } finally {
      if (actual === generacion.current) setValidando(false);
    }
  };
  return <div className="space-y-2">
    <Button type="button" variant="outline" size="sm" disabled={disabled || validando} onClick={() => input.current?.click()}>
      <FileUp className="mr-2 size-4" /> {validando ? "Validando PDF…" : "Adjuntar MSDS (PDF)"}
    </Button>
    <input ref={input} type="file" hidden accept="application/pdf,.pdf" aria-label="Hoja de seguridad MSDS"
      disabled={disabled || validando} onChange={(e) => {
        const file = e.target.files?.[0]; e.target.value = "";
        if (file && !disabled) void elegir(file);
      }} />
    {error && <p role="alert" className="text-body-sm text-destructive">{error}</p>}
  </div>;
}