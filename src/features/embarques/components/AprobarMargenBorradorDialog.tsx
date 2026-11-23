import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { FormDialogShell } from '@/components/shared/FormDialogShell';
import { FormDialogSection } from '@/components/shared/FormDialogSection';
import { MargenBorradorResumen } from './MargenBorradorResumen';
import type { AprobacionMargen } from '../services/aprobacionMargen';

interface Props {
  data: AprobacionMargen; busy: boolean; onClose: () => void;
  onApprove: (motivo: string) => void;
}
export function AprobarMargenBorradorDialog({ data, busy, onClose, onApprove }: Props) {
  const [motivo, setMotivo] = useState('');
  const valido = motivo.trim().length >= 10 && motivo.trim().length <= 500;
  return <FormDialogShell open onOpenChange={(open) => { if (!open) onClose(); }} icon={ShieldCheck}
    title="Aprobar margen del borrador" size="md" busy={busy} isDirty={motivo.length > 0}
    formId="aprobar-margen-borrador" onSubmit={(e) => { e.preventDefault(); if (valido && !busy) onApprove(motivo); }}
    footer={<>
      <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
      <Button type="submit" form="aprobar-margen-borrador" disabled={!valido || !data.snapshot.calculable} loading={busy}>
        <ShieldCheck className="mr-2 h-4 w-4" /> Aprobar margen
      </Button>
    </>}>
    <FormDialogSection title="Importes por aprobar" flat><MargenBorradorResumen snapshot={data.snapshot} /></FormDialogSection>
    <FormDialogSection title="Autorización" flat>
      <Label htmlFor="motivo-margen-borrador">Motivo de aprobación</Label>
      <Textarea id="motivo-margen-borrador" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} disabled={busy} />
    </FormDialogSection>
  </FormDialogShell>;
}
