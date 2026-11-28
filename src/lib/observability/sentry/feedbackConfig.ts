/**
 * Configuración (etiquetas en español) del widget de feedback de Sentry.
 * Extraído de `core.ts` para mantener el archivo principal ≤200 líneas.
 *
 * Se dispara manualmente desde `FeedbackButton.tsx` con
 * `Sentry.getFeedback()?.createForm()` — `autoInject: false` evita el botón
 * flotante por defecto.
 */
import type { EventProcessor } from "@sentry/core";
import { scrubTelemetryText } from "../scrubTelemetryData";
import { scrubEventPii } from "./helpers";

export const scrubFeedbackEvent: EventProcessor = (event, hint) => {
  if (event.type !== "feedback") return event;

  const feedback = event.contexts?.feedback;
  if (feedback) {
    delete feedback.name;
    delete feedback.contact_email;
    if (typeof feedback.message === "string") feedback.message = scrubTelemetryText(feedback.message);
  }
  if (hint) hint.attachments = [];
  return scrubEventPii(event);
};

export const FEEDBACK_INTEGRATION_OPTIONS = {
  autoInject: false,
  colorScheme: "light" as const,
  showBranding: false,
  showName: false,
  showEmail: false,
  enableScreenshot: false,
  triggerLabel: "Reportar bug o sugerencia",
  formTitle: "Reportar bug o sugerencia",
  submitButtonLabel: "Enviar reporte",
  cancelButtonLabel: "Cancelar",
  addScreenshotButtonLabel: "Agregar captura",
  removeScreenshotButtonLabel: "Quitar captura",
  nameLabel: "Nombre",
  namePlaceholder: "Tu nombre",
  emailLabel: "Correo",
  emailPlaceholder: "tu@correo.com",
  messageLabel: "Descripción",
  messagePlaceholder: "Cuéntanos qué pasó. Incluye pasos para reproducirlo.",
  successMessageText: "¡Gracias! Recibimos tu reporte.",
  isRequiredLabel: "(obligatorio)",
};
