import { useEffect, useState } from "react";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Save } from "lucide-react";
import { useUpdateConfiguracionGlobal } from "@/features/configuracion";
import { useConfiguracionGlobal, filtrarConfigGlobalCategoria } from "@/features/configuracion/hooks/useConfiguracionGlobal";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import {
  parseConfigSafe,
  plataformaConfigSchema,
  seguridadConfigSchema,
} from "@/features/configuracion";

function enteroEnRango(min: number, max: number) {
  const error = `Escribe un número entero entre ${min} y ${max}.`;
  return z.string().trim().min(1, "Escribe un valor.").transform(Number)
    .pipe(z.number({ error }).int({ error }).min(min, { error }).max(max, { error }));
}

const seguridadPoliticasSchema = z.object({
  longitudPassword: enteroEnRango(6, 32),
  expiracionSesion: enteroEnRango(1, 720),
  maxIntentos: enteroEnRango(3, 20),
});

type BorradorPoliticas = z.input<typeof seguridadPoliticasSchema>;
type CampoPolitica = keyof BorradorPoliticas;

export default function TabSeguridadGlobal() {
  const { data, isSuccess, isError, isFetching, refetch } = useConfiguracionGlobal();
  const updateConfig = useUpdateConfiguracionGlobal();

  const [autoConfirmar, setAutoConfirmar] = useState(false);
  const [politicas, setPoliticas] = useState<BorradorPoliticas>({
    longitudPassword: "8",
    expiracionSesion: "24",
    maxIntentos: "5",
  });
  const [errores, setErrores] = useState<Partial<Record<CampoPolitica, string[]>>>({});
  const [registroPublico, setRegistroPublico] = useState(false);
  const [emailSoporte, setEmailSoporte] = useState("");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized || !isSuccess) return;
    const seg = parseConfigSafe(seguridadConfigSchema, filtrarConfigGlobalCategoria(data, "seguridad"));
    const plat = parseConfigSafe(plataformaConfigSchema, filtrarConfigGlobalCategoria(data, "plataforma"));
    setAutoConfirmar(seg.auto_confirmar_email);
    setPoliticas({
      longitudPassword: String(seg.longitud_minima_password),
      expiracionSesion: String(seg.expiracion_sesion_horas),
      maxIntentos: String(seg.max_intentos_login),
    });
    setRegistroPublico(seg.permitir_registro_publico);
    setEmailSoporte(plat.email_soporte);
    setInitialized(true);
  }, [data, initialized, isSuccess]);

  if (isError) return <ErrorStateInline title="No se pudo cargar la configuración global"
    message="Reintenta consultar las políticas antes de editarlas." onRetry={() => void refetch()} retrying={isFetching} />;
  if (!initialized) return <EmptyStateInline loading message="Cargando políticas de seguridad…" />;

  const cambiarPolitica = (campo: CampoPolitica, valor: string) => {
    setPoliticas((actuales) => ({ ...actuales, [campo]: valor }));
    setErrores((actuales) => ({ ...actuales, [campo]: undefined }));
  };

  const handleGuardar = () => {
    if (!isSuccess || isFetching || updateConfig.isPending) return;
    const parsed = seguridadPoliticasSchema.safeParse(politicas);
    if (!parsed.success) {
      setErrores(z.flattenError(parsed.error).fieldErrors);
      return;
    }
    const { longitudPassword, expiracionSesion, maxIntentos } = parsed.data;
    updateConfig.mutate([
      { categoria: "seguridad", clave: "auto_confirmar_email", valor: autoConfirmar },
      { categoria: "seguridad", clave: "longitud_minima_password", valor: longitudPassword },
      { categoria: "seguridad", clave: "expiracion_sesion_horas", valor: expiracionSesion },
      { categoria: "seguridad", clave: "max_intentos_login", valor: maxIntentos },
      { categoria: "seguridad", clave: "permitir_registro_publico", valor: registroPublico },
      { categoria: "plataforma", clave: "email_soporte", valor: emailSoporte },
    ]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seguridad Global</CardTitle>
        <CardDescription>Políticas de seguridad que aplican a toda la plataforma</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <Label htmlFor="config-global-confirmar-email" className="text-body font-medium">Auto-confirmar emails</Label>
              <p id="config-global-confirmar-email-info" className="text-body-sm text-muted-foreground mt-1">Los usuarios nuevos no necesitan verificar su email</p>
            </div>
            <Switch id="config-global-confirmar-email" aria-describedby="config-global-confirmar-email-info" checked={autoConfirmar} onCheckedChange={setAutoConfirmar} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <Label htmlFor="config-global-registro" className="text-body font-medium">Registro público</Label>
              <p id="config-global-registro-info" className="text-body-sm text-muted-foreground mt-1">Permitir que cualquiera se registre en la plataforma</p>
            </div>
            <Switch id="config-global-registro" aria-describedby="config-global-registro-info" checked={registroPublico} onCheckedChange={setRegistroPublico} />
          </div>

          <div className="p-3 rounded-lg border">
            <FormField label="Longitud mínima de contraseña" required error={errores.longitudPassword?.[0]}>
              <Input
                type="number"
                min={6}
                max={32}
                required
                value={politicas.longitudPassword}
                onChange={(e) => cambiarPolitica("longitudPassword", e.target.value)}
                className="w-24"
              />
            </FormField>
          </div>

          <div className="p-3 rounded-lg border">
            <FormField label="Expiración de sesión (horas)" required error={errores.expiracionSesion?.[0]}>
              <Input
                type="number"
                min={1}
                max={720}
                required
                value={politicas.expiracionSesion}
                onChange={(e) => cambiarPolitica("expiracionSesion", e.target.value)}
                className="w-24"
              />
            </FormField>
          </div>

          <div className="p-3 rounded-lg border">
            <FormField label="Intentos máximos de login" required hint="Antes de bloquear temporalmente la cuenta" error={errores.maxIntentos?.[0]}>
              <Input
                type="number"
                min={3}
                max={20}
                required
                value={politicas.maxIntentos}
                onChange={(e) => cambiarPolitica("maxIntentos", e.target.value)}
                className="w-24"
              />
            </FormField>
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="text-body font-medium mb-2">Contacto de soporte</h3>
          <div className="p-3 rounded-lg border max-w-md">
            <FormField label="Email de soporte" hint="Dirección de contacto para soporte técnico de la plataforma">
              <Input value={emailSoporte} onChange={(e) => setEmailSoporte(e.target.value)} placeholder="soporte@librecarga.com" type="email" />
            </FormField>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleGuardar} disabled={!isSuccess || isFetching || updateConfig.isPending}>
            <Save className="h-4 w-4 mr-2" /> Guardar políticas
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
