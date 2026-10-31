/**
 * Schemas zod dos formulários.
 *
 * Ficam fora dos componentes para serem testáveis de forma unitária
 * (`TEST-UI-01`, `TEST-UI-02`, `TEST-UI-04`).
 */

import { z } from "zod";

import { datetimeLocalToUtc, isPastDate } from "./dates";
import { textByteLength, textCharLength } from "./text";

/** Limite do título em caracteres Unicode (`CAP-03`). */
export const MAX_CAPSULE_TITLE_CHARS = 80;

/** Limite do corpo em bytes UTF-8 (`CAP-02`). */
export const MAX_CAPSULE_CONTENT_BYTES = 1_048_576;

export const newCapsuleSchema = z.object({
  title: z.string().superRefine((value, ctx) => {
    if (textCharLength(value.trim()) > MAX_CAPSULE_TITLE_CHARS) {
      ctx.addIssue({
        code: "custom",
        message: `O título não pode exceder ${MAX_CAPSULE_TITLE_CHARS} caracteres.`,
      });
    }
  }),

  content: z.string().superRefine((value, ctx) => {
    if (value.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Escreva a mensagem que você quer guardar.",
      });
      return;
    }

    if (textByteLength(value) > MAX_CAPSULE_CONTENT_BYTES) {
      ctx.addIssue({
        code: "custom",
        message: "O conteúdo não pode exceder 1 MB (1.048.576 bytes).",
      });
    }
  }),

  revealDate: z.string().superRefine((value, ctx) => {
    if (!value) {
      ctx.addIssue({ code: "custom", message: "Informe a data de revelação." });
      return;
    }

    const iso = datetimeLocalToUtc(value);

    if (!iso) {
      ctx.addIssue({ code: "custom", message: "Informe uma data de revelação válida." });
      return;
    }

    if (isPastDate(iso)) {
      ctx.addIssue({ code: "custom", message: "A data de revelação deve estar no futuro." });
    }
  }),
});

export type NewCapsuleFormValues = z.infer<typeof newCapsuleSchema>;
