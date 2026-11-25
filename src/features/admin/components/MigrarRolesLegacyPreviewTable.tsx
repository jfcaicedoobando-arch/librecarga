/**
 * Tabla de vista previa (dry-run) de la migración de roles legacy.
 * Extraída de MigrarRolesLegacyCard para respetar el límite de 200 líneas.
 */
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/features/admin/domain/roles/roleCatalog";
import type { AppRole } from "@/types/appRole";
import type { MigrarRolesLegacyDryRun, MigrarRolesLegacyItem } from "@/features/admin/services/migrarRolesLegacy";

import { DataTable, defineColumns } from "@/components/shared/DataTable";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";

type PreviewRow = MigrarRolesLegacyItem & { fuente: "organization_members" | "user_roles" };

const columns = defineColumns<PreviewRow>([
  { accessorKey: "fuente", header: "Fuente", enableSorting: false, meta: { className: "text-muted-foreground" } },
  { id: "usuario", header: "Usuario", meta: { className: "font-mono text-label" }, cell: ({ row }) => `${row.original.user_id.slice(0, 8)}…` },
  { id: "org", header: "Organización", meta: { className: "text-muted-foreground" }, cell: ({ row }) => row.original.organizacion ?? "—" },
  { id: "actual", header: "Rol actual", cell: ({ row }) => <Badge variant="outline" className="text-label">{row.original.rol_actual}</Badge> },
  { id: "propuesto", header: "Rol propuesto", cell: ({ row }) => (
    <Badge className="text-label">{ROLE_LABELS[row.original.rol_propuesto as AppRole] ?? row.original.rol_propuesto}</Badge>
  ) },
]);
interface Props {
  data: MigrarRolesLegacyDryRun;
}

export function MigrarRolesLegacyPreviewTable({ data }: Props) {
  const items = [
    ...data.organization_members.map((r) => ({ ...r, fuente: "organization_members" as const })),
    ...data.user_roles.map((r) => ({ ...r, fuente: "user_roles" as const })),
  ];
  if (items.length === 0) return null;
  return (
    <DataTable
      columns={columns}
      data={items}
      rowKey={(row) => `${row.fuente}-${row.id}`}
      density={TABLE_DENSITY.embebida}
      stickyHeader
      striped={false}
      hoverable={false}
      className="rounded-md border"
      scrollClassName="max-h-52"
    />
  );
}
