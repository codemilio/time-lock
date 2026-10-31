/**
 * Textos normativos da interface (Seção 9.6 do SPEC).
 *
 * Centralizados para evitar divergência entre telas e testes.
 */

/** Texto obrigatório do diálogo de exclusão. */
export const DELETE_CONFIRMATION_TEXT =
  "Excluir esta cápsula permanentemente? Esta ação não pode ser desfeita.";

/**
 * Mensagem do banner de revelação, com plural correto (`UI-26`).
 *
 * O singular é usado apenas para exatamente uma cápsula.
 */
export function revealedNotificationText(count: number): string {
  if (count === 1) {
    return "Você tem 1 cápsula pronta para abrir!";
  }

  return `Você tem ${count} cápsulas prontas para abrir!`;
}
