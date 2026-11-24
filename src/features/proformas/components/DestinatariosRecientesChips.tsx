/**
 * Fila de chips con los correos "Recientes" del cliente en el modal de envío.
 * Extraído de `EnviarProformaDialog` para respetar Power-of-10 #4 (≤200 líneas).
 */
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { notifyInfo } from "@/lib/ui/appFeedback";

interface Props {
  consulta?: { isLoading: boolean; isError: boolean; isFetching: boolean; refetch: () => unknown };
  sugerencias: string[];
  ocultos: string[];
  onAgregar: (email: string) => void;
  onOcultar: (email: string) => void;
  onRestaurar: (email: string) => void;
  onRestaurarVarios: (emails: string[]) => void;
}

const focoVisible = "rounded outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function DestinatariosRecientesChips({
  consulta,
  sugerencias,
  ocultos,
  onAgregar,
  onOcultar,
  onRestaurar,
  onRestaurarVarios,
}: Props) {
  return (
    <>
      {consulta?.isLoading && <p role="status" className="mt-1.5 text-body-sm text-muted-foreground">Consultando destinatarios recientes…</p>}
      {consulta?.isError && <ErrorStateInline title="No se pudieron consultar los destinatarios recientes"
        message="Reintenta la consulta o continúa con el correo que capturaste."
        onRetry={() => void consulta.refetch()} retrying={consulta.isFetching} className="mt-1.5 py-3" />}
      {sugerencias.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-body-sm text-muted-foreground">
          <span>Recientes:</span>
          {sugerencias.slice(0, 6).map((e) => (
            <span
              key={e}
              className="group inline-flex items-center gap-0.5 rounded border pl-1.5 pr-0.5 py-0.5 hover:bg-accent hover:text-accent-foreground"
            >
              <button type="button" onClick={() => onAgregar(e)} className={focoVisible}>
                {e}
              </button>
              <button
                type="button"
                onClick={() => {
                  onOcultar(e);
                  notifyInfo(undefined, {
                    title: "Correo ocultado",
                    description: e,
                    action: { label: "Deshacer", onClick: () => onRestaurar(e) },
                  });
                }}
                aria-label={`Ocultar ${e}`}
                className={`${focoVisible} p-0.5 opacity-60 hover:opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {ocultos.length > 0 && (
        <Button
          variant="link"
          size="sm"
          onClick={() => onRestaurarVarios(ocultos)}
          className="mt-1 h-auto p-0 text-body-sm text-muted-foreground underline-offset-2"
        >
          Restaurar ocultos ({ocultos.length})
        </Button>
      )}
    </>
  );
}
