import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import type { AyudaModulo } from "./ayudaTypes";
import { normalizarBusqueda } from "./ayudaBusqueda";

function fragmentoRespuesta(texto: string, termino: string) {
  const oracion = texto.split(/(?<=[.!?])\s+/u).find(parte => normalizarBusqueda(parte).includes(termino));
  return oracion ?? texto;
}

export function AyudaPreguntas({ modulo, termino }: { modulo: AyudaModulo; termino: string }) {
  return (
    <Card id={modulo.id} className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span>{modulo.titulo}</span>
            {modulo.audiencia && modulo.audiencia.length > 0 && (
              <span className="text-label font-normal text-muted-foreground">
                Para {modulo.audiencia.join(" · ")}
              </span>
            )}
          </div>
          <Badge variant="secondary" className="shrink-0">{modulo.faqs.length}</Badge>
        </CardTitle>
        <p className="text-body text-muted-foreground">{modulo.resumen}</p>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          {modulo.faqs.map((faq, idx) => {
            const coincideRespuesta = termino && !normalizarBusqueda(faq.pregunta).includes(termino)
              && normalizarBusqueda(faq.respuesta).includes(termino);
            return (
              <AccordionItem key={idx} value={`${modulo.id}-${idx}`}>
                <AccordionTrigger className="text-left text-body font-medium">
                  <span>
                    {faq.pregunta}
                    {coincideRespuesta && (
                      <span className="mt-1 block line-clamp-2 text-body-sm font-normal text-muted-foreground">
                        {fragmentoRespuesta(faq.respuesta, termino)}
                      </span>
                    )}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-body text-muted-foreground">
                  {faq.respuesta}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}
