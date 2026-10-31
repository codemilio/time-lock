import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { deleteCapsule, getAppState, listCapsules } from "../lib/api";
import type { CapsuleSummary } from "../lib/types";

vi.mock("../lib/api");
vi.mock("../lib/notifications");

const CAPSULE: CapsuleSummary = {
  id: "capsule-1",
  title: "Para o futuro",
  revealDate: new Date(Date.now() + 86_400_000).toISOString(),
  status: "sealed",
  createdAt: new Date().toISOString(),
  revealedAt: null,
  archivedAt: null,
};

describe("SealedHome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, "", "/");
    vi.mocked(getAppState).mockResolvedValue({
      setupCompleted: true,
      unlocked: true,
      pendingReveals: 0,
      appVersion: "0.1.0",
      cryptoFormatVersion: 1,
    });
  });

  it("exibe a mensagem de lista vazia", async () => {
    // TEST-UI-10 / UI-AC-03
    vi.mocked(listCapsules).mockResolvedValue([]);

    render(<App />);

    expect(
      await screen.findByText(
        "Nenhuma cápsula selada. Escreva a primeira mensagem para o seu eu do futuro.",
      ),
    ).toBeInTheDocument();
  });

  it("prende o foco no diálogo, fecha com Esc e restaura o foco", async () => {
    // UI-AC-04
    vi.mocked(listCapsules).mockResolvedValue([CAPSULE]);
    const user = userEvent.setup();

    render(<App />);

    const trigger = await screen.findByRole("button", { name: "Excluir" });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog");
    const cancel = within(dialog).getByRole("button", { name: "Cancelar" });

    expect(cancel).toHaveFocus();

    await user.tab({ shift: true });
    expect(within(dialog).getByRole("button", { name: "Excluir" })).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(deleteCapsule).not.toHaveBeenCalled();
  });

  it("exclui somente após a confirmação", async () => {
    vi.mocked(listCapsules).mockResolvedValueOnce([CAPSULE]).mockResolvedValue([]);
    vi.mocked(deleteCapsule).mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Excluir" }));

    const dialog = await screen.findByRole("dialog");
    expect(deleteCapsule).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Excluir" }));

    expect(deleteCapsule).toHaveBeenCalledWith("capsule-1");
    expect(
      await screen.findByText(
        "Nenhuma cápsula selada. Escreva a primeira mensagem para o seu eu do futuro.",
      ),
    ).toBeInTheDocument();
  });
});
