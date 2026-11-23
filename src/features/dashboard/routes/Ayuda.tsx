import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Search, HelpCircle, BookOpen } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { GLOSARIO, MODULOS } from "./ayudaContent";
import { PageContainer } from "@/components/shared/PageContainer";
import { GuiaPrimerosPasos } from "@/features/dashboard/components/primeros-pasos/GuiaPrimerosPasos";

import { normalizarBusqueda } from "./ayudaBusqueda";
import { AyudaPreguntas } from "./AyudaPreguntas";

/**
 * Página /ayuda — onboarding y referencia rápida para el usuario final.
 * Contenido en src/features/dashboard/routes/ayudaContent.ts.
 * v13.118.1 — Glosario expandido y 12 módulos por rol con índice clickeable.
 */
export default function Ayuda() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("faq");
  const inputRef = useRef<HTMLInputElement>(null);
  const termino = normalizarBusqueda(search);
  const limpiarBusqueda = () => {
    setSearch("");
    inputRef.current?.focus();
  };

  const glosarioFiltrado = useMemo(() => {
    const termino = normalizarBusqueda(search);
    if (!termino) return GLOSARIO;
    return GLOSARIO.filter(
      (g) => normalizarBusqueda(g.termino).includes(termino) || normalizarBusqueda(g.definicion).includes(termino),
    );
  }, [search]);

  const modulosFiltrados = useMemo(() => {
    const termino = normalizarBusqueda(search);
    if (!termino) return MODULOS;
    return MODULOS
      .map((m) => {
        if (normalizarBusqueda(`${m.titulo} ${m.resumen}`).includes(termino)) return m;
        return {
          ...m,
          faqs: m.faqs.filter(
            (f) => normalizarBusqueda(f.pregunta).includes(termino) || normalizarBusqueda(f.respuesta).includes(termino),
          ),
        };
      })
      .filter((m) => m.faqs.length > 0);
  }, [search]);

  const preguntas = modulosFiltrados.reduce((suma, modulo) => suma + modulo.faqs.length, 0);

  return (
    <PageContainer><div className="max-w-5xl mx-auto space-y-4 sm:space-y-6">
      <PageHeader
        title="Centro de ayuda"
        description="Glosario, preguntas frecuentes y guías rápidas para usar el ERP en operación diaria."
      />
      <GuiaPrimerosPasos ubicacion="ayuda" />

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              aria-label="Buscar término, pregunta o concepto"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar término, pregunta o concepto…"
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="faq">
            <HelpCircle className="h-4 w-4 mr-2" /> Preguntas frecuentes{termino && ` (${preguntas})`}
          </TabsTrigger>
          <TabsTrigger value="glosario">
            <BookOpen className="h-4 w-4 mr-2" /> Glosario{termino && ` (${glosarioFiltrado.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="faq" className="space-y-4">
          {!search.trim() && (
            <Card>
              <CardContent className="p-4">
                <p className="text-overline font-semibold mb-2">
                  Ir a una sección
                </p>
                <div className="flex flex-wrap gap-2">
                  {MODULOS.map((m) => (
                    <a
                      key={m.id}
                      href={`#${m.id}`}
                      className="inline-flex items-center px-3 py-1 text-body-sm rounded-md border border-border bg-muted/50 hover:bg-muted text-foreground transition-colors"
                    >
                      {m.titulo}
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {modulosFiltrados.length === 0 ? (
            <Card>
              <CardContent className="p-6">
                <EmptyStateInline icon={HelpCircle} message={`No hay preguntas que coincidan con "${search}".`}
                  action={{ label: "Limpiar búsqueda", onClick: limpiarBusqueda }}>
                  {glosarioFiltrado.length > 0 && (
                    <Button type="button" variant="link" onClick={() => setTab("glosario")}>Ver coincidencias en Glosario</Button>
                  )}
                </EmptyStateInline>
              </CardContent>
            </Card>
          ) : (
            modulosFiltrados.map((modulo) => <AyudaPreguntas key={modulo.id} modulo={modulo} termino={termino} />)
          )}
        </TabsContent>

        <TabsContent value="glosario">
          <Card>
            <CardHeader>
              <CardTitle>Glosario de términos del forwarder</CardTitle>
              <p className="text-body text-muted-foreground">
                {glosarioFiltrado.length} término{glosarioFiltrado.length === 1 ? "" : "s"}
              </p>
            </CardHeader>
            <CardContent>
              {glosarioFiltrado.length === 0 ? (
                <EmptyStateInline icon={BookOpen} message={`No hay términos que coincidan con "${search}".`}
                  action={{ label: "Limpiar búsqueda", onClick: limpiarBusqueda }}>
                  {preguntas > 0 && <Button type="button" variant="link" onClick={() => setTab("faq")}>Ver preguntas con coincidencias</Button>}
                </EmptyStateInline>
              ) : (
                <dl className="space-y-4">
                  {glosarioFiltrado.map((g) => (
                    <div key={g.termino} className="border-b border-border last:border-0 pb-3 last:pb-0">
                      <dt className="font-semibold text-body text-foreground">{g.termino}</dt>
                      <dd className="text-body text-muted-foreground mt-1">{g.definicion}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>¿No encuentras lo que buscas?</CardTitle>
        </CardHeader>
        <CardContent className="text-body text-muted-foreground space-y-2">
          <p>
            Dentro del ERP, usa <strong>Reportar bug o mejora</strong> en la barra superior.
            Describe los pasos y adjunta el diagnóstico con <strong>Copiar JSON</strong> si el aviso lo ofrece.
          </p>
          <p>
            <Link to="/inicio" className="text-primary underline underline-offset-4">Entrar al ERP</Link>
            {" "}para reportarlo. Si no tienes una sesión activa, se te pedirá iniciar sesión.
          </p>
        </CardContent>
      </Card>
    </div></PageContainer>
  );
}
