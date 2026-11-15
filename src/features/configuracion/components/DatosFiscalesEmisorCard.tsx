import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useOrgActiva } from "@/hooks/shared/useOrgActiva";
import { usePermissions } from "@/hooks/shared/usePermissions";
import { useFacturapiCredenciales } from "../hooks/useFacturapiCredenciales";
import { usePerfilFiscalEmisor } from "../hooks/usePerfilFiscalEmisor";
import { ESTADOS_PERFIL, mensajeProblemaPerfil } from "../domain/perfilFiscalEmisor";
import type { FacturapiAmbiente } from "../services/facturapiCredenciales";
import { ConfirmarPerfilFiscal } from "./ConfirmarPerfilFiscal";
import { PerfilFiscalDatos } from "./PerfilFiscalDatos";

function PerfilFiscalContenido({ orgId, ambiente }: { orgId: string; ambiente: FacturapiAmbiente }) {
  const { query, mutation } = usePerfilFiscalEmisor(orgId, ambiente);
  if (query.isPending) return <p role="status">Cargando datos fiscales…</p>;
  if (query.isError) return <div role="alert" className="space-y-2">
    <p>No se pudieron cargar los datos fiscales.</p>
    <Button variant="outline" size="sm" onClick={() => void query.refetch()}>Reintentar</Button>
  </div>;
  const data = query.data;
  const perfil = data.perfil;
  const busy = mutation.isPending || query.isFetching;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={ambiente === "live" ? "default" : "outline"}>{ambiente === "live" ? "Producción" : "Sandbox"}</Badge>
      <Badge variant="secondary">{ESTADOS_PERFIL[data.estado]}</Badge>
      {perfil && <span className="text-xs text-muted-foreground">Versión {perfil.version}</span>}
    </div>
    {!perfil && <p className="text-sm text-muted-foreground">Sincroniza para consultar el RFC, régimen y domicilio fiscal de la organización que emite tus facturas.</p>}
    {perfil && <PerfilFiscalDatos perfil={perfil} />}
    {data.problemas.length > 0 && <Alert><AlertDescription>
      <ul className="list-disc space-y-1 pl-4">{data.problemas.map((p) => <li key={p}>{mensajeProblemaPerfil(p)}</li>)}</ul>
    </AlertDescription></Alert>}
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" size="sm" disabled={busy} onClick={() => mutation.mutate({ accion: "sincronizar" })}>
        {mutation.isPending ? "Actualizando…" : "Sincronizar desde Facturapi"}
      </Button>
      <a href="https://dashboard.facturapi.io" target="_blank" rel="noopener noreferrer" className="text-sm underline">
        Abrir Facturapi
      </a>
    </div>
    <p className="text-xs text-muted-foreground">Los datos se corrigen en Facturapi → Configuración → Datos fiscales. Cada sincronización guarda una versión para revisar y confirmar.</p>
    {perfil && data.estado === "sin_confirmar" && <ConfirmarPerfilFiscal key={perfil.id} disabled={busy}
      onConfirmar={(fecha) => mutation.mutate({ accion: "confirmar", perfil_id: perfil.id, vigente_desde: fecha })} />}
    {data.estado === "confirmado" && <p className="text-sm">Confirmación registrada{perfil?.vigente_desde ? ` · Vigente desde ${perfil.vigente_desde}` : ""}.</p>}
  </div>;
}

export default function DatosFiscalesEmisorCard() {
  const { organizationId } = useOrgActiva();
  const { canEmitirFactura } = usePermissions();
  const cred = useFacturapiCredenciales(canEmitirFactura ? organizationId : null);
  if (!organizationId || !canEmitirFactura) return null;
  return <Card>
    <CardHeader>
      <CardTitle>Datos fiscales del emisor</CardTitle>
      <CardDescription>Perfil fiscal de tu organización. La sincronización importa los datos; Contabilidad confirma su coincidencia con la constancia fiscal.</CardDescription>
    </CardHeader>
    <CardContent>
      {cred.isPending ? <p role="status">Cargando configuración…</p> : cred.isError ? <div role="alert">
        <p>No se pudo consultar la conexión con Facturapi.</p>
        <Button variant="outline" size="sm" onClick={() => void cred.refetch()}>Reintentar</Button>
      </div> : !cred.data ? <p>Conecta Facturapi para sincronizar los datos fiscales del emisor.</p> :
        <PerfilFiscalContenido key={`${organizationId}:${cred.data.ambiente}`} orgId={organizationId} ambiente={cred.data.ambiente} />}
    </CardContent>
  </Card>;
}
