import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { FormField } from "@/components/shared/FormField";
import { FormDialogSection } from "@/components/shared/FormDialogSection";
import { useNuevaOrganizacionUsuarios } from "@/features/admin/hooks/useNuevaOrganizacionUsuarios";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";

const LIMITE_OPCIONES_ADMIN = 50;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nombre: string;
  onNombreChange: (v: string) => void;
  rfc: string;
  onRfcChange: (v: string) => void;
  ownerUserId: string;
  onOwnerUserIdChange: (v: string) => void;
  onCreate: () => void;
  isPending: boolean;
}

export function NuevaOrganizacionDialog({
  open, onOpenChange, nombre, onNombreChange, rfc, onRfcChange,
  ownerUserId, onOwnerUserIdChange, onCreate, isPending,
}: Props) {
  const { data: users = [], isLoading, isError, isFetching, refetch } = useNuevaOrganizacionUsuarios(open);

  const [query, setQuery] = useState("");
  useEffect(() => { if (!open) setQuery(""); }, [open]);

  const filtered = users.filter((u) =>
    query.trim() === "" || u.email.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const selectorBloqueado = isPending || isLoading || isError;
  const canSubmit = nombre.trim().length > 0 && ownerUserId.length > 0 && !selectorBloqueado;

  return (
    <FormDialogShell
      open={open}
      onOpenChange={onOpenChange}
      busy={isPending}
      icon={Building2}
      title="Nueva organización"
      description="Crea una organización y asigna a su administrador inicial en un solo paso."
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancelar</Button>
          <Button onClick={onCreate} disabled={!canSubmit} loading={isPending}>
            {isPending ? "Creando organización…" : "Crear"}
          </Button>
        </>
      }
    >
      <FormDialogSection flat>
        <FormField label="Nombre" required>
          <Input
            value={nombre}
            onChange={(e) => onNombreChange(e.target.value)}
            placeholder="Nombre de la empresa"
            disabled={isPending}
          />
        </FormField>
        <FormField label="RFC" hint="opcional">
          <Input
            value={rfc}
            onChange={(e) => onRfcChange(e.target.value)}
            placeholder="RFC (opcional)"
            disabled={isPending}
          />
        </FormField>
        <div className="space-y-1.5">
          <Label htmlFor="nueva-org-owner">Administrador inicial *</Label>
          <FormField label="Buscar usuario" className="space-y-1.5">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por correo…"
              disabled={selectorBloqueado}
            />
          </FormField>
          {filtered.length > LIMITE_OPCIONES_ADMIN && (
            <p className="text-body-sm text-muted-foreground" role="status">
              Mostrando {LIMITE_OPCIONES_ADMIN} de {filtered.length} candidatos. Busca por correo para ver más opciones.
            </p>
          )}
          <Select
            value={ownerUserId || undefined}
            onValueChange={onOwnerUserIdChange}
            disabled={selectorBloqueado}
          >
            <SelectTrigger id="nueva-org-owner">
              <SelectValue placeholder={isLoading ? "Cargando usuarios…" : "Selecciona un usuario"} />
            </SelectTrigger>
            <SelectContent>
              {filtered.slice(0, LIMITE_OPCIONES_ADMIN).map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.email}</SelectItem>
              ))}
              {filtered.length === 0 && !isLoading && (
                <EmptyStateInline
                  icon={Building2}
                  message="Sin resultados."
                  density="compact"
                />
              )}
            </SelectContent>
          </Select>
          {isError && <ErrorStateInline title="No se pudieron consultar los administradores disponibles"
            message="Reintenta para recuperar el selector y continuar con el alta." onRetry={() => void refetch()} retrying={isFetching} />}
          <p className="text-body-sm text-muted-foreground">
            Se le asignará el rol <b>admin</b> en la nueva organización.
          </p>
        </div>
      </FormDialogSection>
    </FormDialogShell>
  );
}
