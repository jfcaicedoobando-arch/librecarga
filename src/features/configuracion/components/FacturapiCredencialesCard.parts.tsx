import { AlertTriangle, CheckCircle2, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import type { FacturapiAmbiente } from "@/features/configuracion/services/facturapiCredenciales";

export function HeaderBadges({ configurado, ambiente }: { configurado: boolean; ambiente: FacturapiAmbiente }) {
  return (
    <>
      {configurado ? (
        <Badge variant="secondary" className="ml-2 gap-1">
          <CheckCircle2 className="h-3 w-3" /> Configurado
        </Badge>
      ) : (
        <Badge variant="outline" className="ml-2 gap-1">
          <AlertTriangle className="h-3 w-3" /> Sin configurar
        </Badge>
      )}
      <Badge variant={ambiente === "live" ? "default" : "outline"} className="ml-1">
        {ambiente === "live" ? "Producción" : "Sandbox"}
      </Badge>
    </>
  );
}

export function EstadoLecturaCredenciales({ error, ultimoAmbiente, reintentar, reintentando }: {
  error: boolean;
  ultimoAmbiente?: FacturapiAmbiente;
  reintentar: () => void;
  reintentando: boolean;
}) {
  const ambiente = ultimoAmbiente === "live" ? "Producción" : "Sandbox";
  return (
    <Card>
      <CardHeader><CardTitle>FacturApi (Timbrado SAT)</CardTitle></CardHeader>
      <CardContent>
        {error ? (
          <ErrorStateInline
            title="No pudimos cargar la configuración de FacturApi"
            message={ultimoAmbiente
              ? `Última lectura disponible · ${ambiente}. Reintenta para editar.`
              : "Reintenta para consultar y editar la configuración."}
            onRetry={reintentar}
            retrying={reintentando}
          />
        ) : <EmptyStateInline loading message="Cargando configuración…" />}
      </CardContent>
    </Card>
  );
}

export function AccesoAsistenteFacturapi({ configurado, abrir }: { configurado: boolean; abrir: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded border border-dashed p-3 bg-muted/30">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">
          {configurado ? "Reconfigurar conexión" : "Asistente paso a paso"}
        </p>
        <p className="text-label text-muted-foreground">
          {configurado
            ? "Vuelve a ejecutar el asistente si cambiaste de ambiente o rotaste tus llaves."
            : "Te guiamos en 3 pasos para vincular tu cuenta de FacturApi."}
        </p>
      </div>
      <Button type="button" onClick={abrir}>
        <Wand2 className="h-4 w-4 mr-1" />
        {configurado ? "Reconfigurar" : "Conectar FacturApi"}
      </Button>
    </div>
  );
}
