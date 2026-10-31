/** Utilitários de texto compartilhados por senha e cápsulas. */

/** Conta caracteres Unicode, não unidades UTF-16. */
export function textCharLength(value: string): number {
  return Array.from(value).length;
}

/** Conta bytes UTF-8. */
export function textByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
