/**
 * ContactosClienteList — Lista de contactos del cliente para elegir
 * destinatario al enviar un CFDI. Extraído de DialogEnviarCfdi para
 * mantener el archivo padre bajo el límite Power-of-10 (200 líneas).
 */
import { User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ContactoEnvio, DatosEnvioCliente } from "@/features/facturacion/services/contactosClienteEnvio";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";

interface ContactoItemProps {
  contacto: ContactoEnvio;
  seleccionado: boolean;
  onPick: (email: string) => void;
}

function ContactoItem({ contacto: c, seleccionado, onPick }: ContactoItemProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      aria-label={`Usar contacto ${c.nombre ?? c.email}`}
      aria-pressed={seleccionado}
      onClick={() => onPick(c.email)}
      className={`flex h-auto w-full flex-col items-stretch justify-start whitespace-normal text-left rounded-md border px-3 py-2 text-body-sm font-normal transition-colors ${
        seleccionado ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-medium">
          <User className="h-3 w-3 text-muted-foreground" />
          {c.nombre ?? "(Sin nombre)"}
          {c.esFacturacion && (
            <Badge variant="secondary" className="h-4 px-1 text-2xs">Facturación</Badge>
          )}
        </div>
        {c.tipo && !c.esFacturacion && (
          <span className="text-2xs text-muted-foreground">{c.tipo}</span>
        )}
      </div>
      <div className="text-muted-foreground mt-0.5 truncate">{c.email}</div>
    </Button>
  );
}

interface ContactosListProps {
  cargando: boolean;
  datos: DatosEnvioCliente | undefined;
  error: boolean;
  reintentando: boolean;
  onRetry: () => void;
  emailSeleccionado: string;
  onPick: (email: string) => void;
}

export function ContactosClienteList({
  cargando,
  datos,
  error,
  reintentando,
  onRetry,
  emailSeleccionado,
  onPick,
}: ContactosListProps) {
  if (cargando) {
    return (
      <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
        <EmptyStateInline loading message="Cargando contactos…" className="py-2" />
      </div>
    );
  }
  const contactos = datos?.contactos ?? [];
  const emailCliente = datos?.emailCliente;
  const consultaIncompleta = error || datos?.consultaIncompleta;
  const aviso = consultaIncompleta && (
    <ErrorStateInline
      title={contactos.length > 0 || emailCliente ? "Consulta de contactos incompleta" : "No pudimos consultar los contactos"}
      message="Reintenta para completar la consulta de correos del cliente."
      onRetry={onRetry}
      retrying={reintentando}
    />
  );

  if (contactos.length === 0) {
    if (consultaIncompleta) {
      return <>
        {aviso}
        {emailCliente && <Button type="button" variant="link" size="sm" onClick={() => onPick(emailCliente)}>
          Usar correo de la ficha
        </Button>}
      </>;
    }
    return (
      <p className="text-body-sm text-muted-foreground">
        Este cliente no tiene contactos con email registrados.
        {emailCliente && " Se usará el email de la ficha del cliente."}
      </p>
    );
  }
  const seleccionadoLower = emailSeleccionado.trim().toLowerCase();
  return (
    <>
      {aviso}
      <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
        {contactos.map((c) => (
          <ContactoItem
            key={c.id}
            contacto={c}
            seleccionado={seleccionadoLower === c.email.toLowerCase()}
            onPick={onPick}
          />
        ))}
      </div>
    </>
  );
}
