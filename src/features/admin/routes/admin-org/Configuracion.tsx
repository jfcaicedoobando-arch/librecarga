import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Building2, Receipt, Anchor, Wrench, Scale, ShoppingCart } from "lucide-react";
import { useConfiguracionState, TabEmpresa, OrgInfoCard, TabFacturacion, TabCatalogos, TabOperaciones, TabCompras } from "@/features/configuracion";
import { useAuth } from "@/lib/contexts/AuthContext";
import TabExportar from "@/features/admin/components/TabExportar";
import { MargenMinimoCard } from "@/features/configuracion";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { ListSkeleton } from "@/components/shared/states/ListSkeleton";
import { AsyncBoundary } from "@/components/shared/states/AsyncBoundary";
import { useDocumentTitle } from "@/hooks/shared";
import { useDirtyGuard } from "@/hooks/shared/useDirtyGuard";
import { usePermissions } from "@/hooks/shared/usePermissions";
import { useTabsParam } from "@/hooks/shared/useTabsParam";
import { Alert, AlertDescription } from "@/components/ui/alert";

const TABS_CONFIGURACION = ["empresa", "facturacion", "catalogos", "operaciones", "compras", "herramientas"] as const;


function getSaveButtonLabel(isSaving: boolean): string {
  return isSaving ? "Guardando…" : "Guardar Cambios";
}

function AvisoCambioRemoto({ visible, guardando, recargar }: { visible: boolean; guardando: boolean; recargar: () => void }) {
  if (!visible) return null;
  return (
    <Alert variant="info">
      <AlertDescription className="flex flex-wrap items-center gap-3">
        La configuración guardada cambió. Tu captura sigue disponible.
        <Button type="button" size="sm" variant="outline" disabled={guardando} onClick={recargar}>
          Descartar cambios y recargar
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export default function Configuracion() {
  useDocumentTitle("Configuración");
  const {
    s, set, isLoading, isError, refetch, isSaving, isDirty, handleSave, cambioRemoto, recargarGuardada,
  } = useConfiguracionState();
  const { effectiveRole } = useAuth();
  const esContador = effectiveRole === "contador";
  const { canEmitirFactura } = usePermissions();
  const { guardDialog } = useDirtyGuard(!esContador && isDirty && !isSaving, true);
  const { activeTab: tab, setActiveTab: setTab } = useTabsParam(
    esContador ? ["facturacion"] : TABS_CONFIGURACION,
    esContador ? "facturacion" : "empresa",
  );

  // P1-1: antes un fallo dejaba el esqueleto para siempre. Ahora hay error + retry.
  if (isLoading || isError) {
    return (
      <PageContainer>
        <PageHeader title="Configuración" description="Parámetros generales del sistema" />
        <AsyncBoundary
          isLoading={isLoading}
          isError={isError}
          onRetry={refetch}
          skeleton={<ListSkeleton rows={4} />}
          errorTitle="No se pudo cargar la configuración"
        >
          {null}
        </AsyncBoundary>
      </PageContainer>
    );
  }


  const mostrarGuardar = !esContador && tab === "empresa";

  return (
    <PageContainer>
      {guardDialog}
      <PageHeader
        title="Configuración"
        description="Parámetros generales del sistema"
        actions={mostrarGuardar ? (
          <Button onClick={handleSave} disabled={isSaving || !isDirty} title={!isDirty ? "No hay cambios pendientes" : undefined}>
            <Save className="h-4 w-4 mr-2" />
            {getSaveButtonLabel(isSaving)}
          </Button>
        ) : null}
      />

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList variant="seccion" className="flex-wrap h-auto gap-1">
          {!esContador && (
            <TabsTrigger variant="seccion" value="empresa" className="gap-1.5"><Building2 className="h-3.5 w-3.5" /> Empresa</TabsTrigger>
          )}
          <TabsTrigger variant="seccion" value="facturacion" className="gap-1.5"><Receipt className="h-3.5 w-3.5" /> Facturación</TabsTrigger>
          {!esContador && (
            <>
              <TabsTrigger variant="seccion" value="catalogos" className="gap-1.5"><Anchor className="h-3.5 w-3.5" /> Catálogos</TabsTrigger>
              <TabsTrigger variant="seccion" value="operaciones" className="gap-1.5"><Scale className="h-3.5 w-3.5" /> Operaciones</TabsTrigger>
              <TabsTrigger variant="seccion" value="compras" className="gap-1.5"><ShoppingCart className="h-3.5 w-3.5" /> Compras</TabsTrigger>
              <TabsTrigger variant="seccion" value="herramientas" className="gap-1.5"><Wrench className="h-3.5 w-3.5" /> Herramientas</TabsTrigger>
            </>
          )}
        </TabsList>

        {!esContador && (
          <TabsContent value="empresa" className="space-y-4">
            <OrgInfoCard />
            <AvisoCambioRemoto visible={cambioRemoto} guardando={isSaving} recargar={recargarGuardada} />
            <TabEmpresa
              nombre={s.nombre} setNombre={set("nombre")}
              subtitulo={s.subtitulo} setSubtitulo={set("subtitulo")}
              rfc={s.rfc} setRfc={set("rfc")}
              direccion={s.direccion} setDireccion={set("direccion")}
              email={s.email} setEmail={set("email")}
              telefono={s.telefono} setTelefono={set("telefono")}
              onVerPerfilFiscal={canEmitirFactura ? () => setTab("facturacion") : undefined}
            />
          </TabsContent>
        )}
        <TabsContent value="facturacion">
          <TabFacturacion />
        </TabsContent>
        {!esContador && (
          <>
            <TabsContent value="catalogos"><TabCatalogos /></TabsContent>
            <TabsContent value="operaciones" className="space-y-4"><MargenMinimoCard /><TabOperaciones /></TabsContent>
            <TabsContent value="compras"><TabCompras /></TabsContent>
            <TabsContent value="herramientas"><TabExportar /></TabsContent>
          </>
        )}
      </Tabs>
    </PageContainer>
  );
}
