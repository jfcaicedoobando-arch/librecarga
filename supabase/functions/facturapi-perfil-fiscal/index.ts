import { crearHandler } from "./handler.ts";
import { wrapEdgeHandler } from "../_shared/sentry.ts";

Deno.serve(wrapEdgeHandler("facturapi-perfil-fiscal", crearHandler()));
