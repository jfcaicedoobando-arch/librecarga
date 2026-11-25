import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUBMODALIDADES_TERRESTRE, TIPOS_UNIDAD, type TarifaMultimodoForm } from "@/features/costeo/domain/tarifaMultimodo";

interface Props { f: TarifaMultimodoForm; set: (p: Partial<TarifaMultimodoForm>) => void }

export function CamposRutaMultimodo({ f, set }: Props) {
  const aereo = f.modo === "Aéreo";
  const ph = aereo ? "Código IATA, ej. MEX" : "CP (5 dígitos) o ciudad";
  const norm = (v: string) => (aereo ? v.toUpperCase().slice(0, 3) : v);
  return (
    <>
      <div><Label htmlFor="mm-origen">{aereo ? "Aeropuerto de origen *" : "Origen *"}</Label>
        <Input id="mm-origen" value={f.origen} placeholder={ph} onChange={(e) => set({ origen: norm(e.target.value) })} /></div>
      <div><Label htmlFor="mm-destino">{aereo ? "Aeropuerto de destino *" : "Destino *"}</Label>
        <Input id="mm-destino" value={f.destino} placeholder={ph} onChange={(e) => set({ destino: norm(e.target.value) })} /></div>
      {aereo ? (
        <div><Label htmlFor="mm-aerolinea">Aerolínea</Label>
          <Input id="mm-aerolinea" value={f.aerolinea} onChange={(e) => set({ aerolinea: e.target.value })} /></div>
      ) : null}
      {aereo ? (
        <div><Label htmlFor="mm-aeronave">Tipo de avión</Label>
          <Select value={f.tipo_aeronave ?? "sin_especificar"} onValueChange={(v) => {
            if (v === "PAX" || v === "CAO") set({ tipo_aeronave: v });
            else set({ tipo_aeronave: null });
          }}>
            <SelectTrigger id="mm-aeronave"><SelectValue placeholder="Selecciona" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sin_especificar">Sin especificar</SelectItem>
              <SelectItem value="PAX">PAX — avión de pasajeros</SelectItem>
              <SelectItem value="CAO">CAO — sólo carguero</SelectItem>
            </SelectContent>
          </Select></div>
      ) : null}
      {aereo ? (
        <div><Label htmlFor="mm-escalas">Escalas (vacío = vuelo directo)</Label>
          <Input id="mm-escalas" value={f.escalas ?? ""} placeholder="Ej. LAX o LAX, ANC"
            onChange={(e) => set({ escalas: e.target.value.toUpperCase() })} /></div>
      ) : (
        <>
          <div><Label htmlFor="mm-sub">Submodalidad *</Label>
            <Select value={f.submodalidad || undefined} onValueChange={(v) => set({ submodalidad: v, tramos: v === "LTL" ? f.tramos : [] })}>
              <SelectTrigger id="mm-sub"><SelectValue placeholder="FTL, LTL o Arrastre" /></SelectTrigger>
              <SelectContent>{SUBMODALIDADES_TERRESTRE.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label htmlFor="mm-unidad">Tipo de unidad</Label>
            <Select value={f.tipo_unidad || undefined} onValueChange={(v) => set({ tipo_unidad: v })}>
              <SelectTrigger id="mm-unidad"><SelectValue placeholder="Selecciona" /></SelectTrigger>
              <SelectContent>{TIPOS_UNIDAD.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select></div>
        </>
      )}
    </>
  );
}
