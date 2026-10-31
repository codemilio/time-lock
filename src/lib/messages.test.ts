import { describe, expect, it } from "vitest";

import { DELETE_CONFIRMATION_TEXT, revealedNotificationText } from "./messages";

describe("messages", () => {
  it("mantém o texto normativo de exclusão", () => {
    expect(DELETE_CONFIRMATION_TEXT).toBe(
      "Excluir esta cápsula permanentemente? Esta ação não pode ser desfeita.",
    );
  });

  it("flexiona a notificação em singular e plural", () => {
    // TEST-UI-11
    expect(revealedNotificationText(1)).toBe("Você tem 1 cápsula pronta para abrir!");
    expect(revealedNotificationText(2)).toBe("Você tem 2 cápsulas prontas para abrir!");
    expect(revealedNotificationText(10)).toBe("Você tem 10 cápsulas prontas para abrir!");
  });
});
