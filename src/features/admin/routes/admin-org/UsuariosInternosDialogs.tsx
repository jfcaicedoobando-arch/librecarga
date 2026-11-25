import DoubleConfirmDeleteDialog from "@/components/shared/DoubleConfirmDeleteDialog";
import { ConfirmActionDialog } from "@/components/shared/dialogs/ConfirmActionDialog";
import type { UserRow } from "@/features/admin/services/usuario";
import { RoleChangeAlertDialog, type PendingRoleChange } from "./RoleChangeAlertDialog";

interface Props {
  deleteTarget: UserRow | null;
  onDeleteTargetChange: (u: UserRow | null) => void;
  onDelete: () => void;
  deletePending: boolean;
  quitarTarget: UserRow | null;
  onQuitarTargetChange: (u: UserRow | null) => void;
  onQuitar: () => void;
  quitarPending: boolean;
  pendingRole: PendingRoleChange | null;
  onConfirmRole: () => void;
  onCancelRole: () => void;
  rolePending: boolean;
}

/**
 * Diálogos del tab de usuarios internos (borrado duro, quitar de organización
 * y cambio de rol). Extraído de `UsuariosInternosTab.tsx` (Power of 10 ≤200).
 */
export function UsuariosInternosDialogs({
  deleteTarget,
  onDeleteTargetChange,
  onDelete,
  deletePending,
  quitarTarget,
  onQuitarTargetChange,
  onQuitar,
  quitarPending,
  pendingRole,
  onConfirmRole,
  onCancelRole,
  rolePending,
}: Props) {
  return (
    <>
      <DoubleConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) onDeleteTargetChange(null);
        }}
        entityName={deleteTarget?.email ?? "este usuario"}
        description={`El usuario ${deleteTarget?.email ?? "seleccionado"} será eliminado permanentemente del sistema y de la organización.`}
        finalDescription="Esta acción eliminará al usuario completamente. No se puede deshacer."
        confirmLabel="Eliminar cuenta"
        onConfirm={onDelete}
        isPending={deletePending}
      />

      <ConfirmActionDialog
        open={!!quitarTarget}
        onOpenChange={(open) => {
          if (!open && !quitarPending) onQuitarTargetChange(null);
        }}
        size="md"
        title="Quitar de la organización"
        description={`${quitarTarget?.email} perderá el acceso a ${quitarTarget?.organizacion_nombre ?? "la organización"}, pero su cuenta y su historial se conservan. Puedes volver a agregarlo después.`}
        confirmLabel="Quitar acceso"
        onConfirm={onQuitar}
        isPending={quitarPending}
      />

      <RoleChangeAlertDialog
        pendingRole={pendingRole}
        isPending={rolePending}
        onConfirm={onConfirmRole}
        onCancel={onCancelRole}
      />
    </>
  );
}
