import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { archiveCapsule, deleteCapsule, getAppState, listCapsules } from "../lib/api";
import { DELETE_CONFIRMATION_TEXT } from "../lib/messages";
import type { CapsuleStatus, CapsuleSummary } from "../lib/types";

vi.mock("../lib/api");
vi.mock("../lib/notifications");

const EMPTY_REVEALED =
  "Nenhuma cápsula revelada ainda. Sua próxima mensagem aguarda a data escolhida.";
const EMPTY_ARCHIVED = "Nenhuma cápsula arquivada.";

function makeCapsule(
  id: string,
  title: string,
  status: CapsuleStatus,
  overrides: Partial<CapsuleSummary> = {},
): CapsuleSummary {
  const now = new Date().toISOString();

  return {
    id,
    title,
    status,
    revealDate: now,
    createdAt: now,
    revealedAt: status === "sealed" ? null : now,
    archivedAt: status === "archived" ? now : null,
    ...overrides,
  };
}

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

describe("listas de reveladas e arquivadas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAppState).mockResolvedValue({
      setupCompleted: true,
      unlocked: true,
      pendingReveals: 0,
      appVersion: "0.1.0",
      cryptoFormatVersion: 1,
    });
  });

  it("exibe o estado vazio de reveladas", async () => {
    // UI-AC-03
    vi.mocked(listCapsules).mockResolvedValue([]);

    renderAt("/reveladas");

    expect(await screen.findByText(EMPTY_REVEALED)).toBeInTheDocument();
    expect(listCapsules).toHaveBeenCalledWith({ status: "revealed" });
  });

  it("exibe o estado vazio de arquivadas", async () => {
    // UI-AC-03
    vi.mocked(listCapsules).mockResolvedValue([]);

    renderAt("/arquivadas");

    expect(await screen.findByText(EMPTY_ARCHIVED)).toBeInTheDocument();
    expect(listCapsules).toHaveBeenCalledWith({ status: "archived" });
  });

  it("arquiva uma cápsula revelada e atualiza a lista", async () => {
    // ARC-AC-01
    const revealed = makeCapsule("revealed-1", "Para o futuro", "revealed");
    let revealedList: CapsuleSummary[] = [revealed];

    vi.mocked(listCapsules).mockImplementation(async ({ status }) =>
      status === "revealed" ? revealedList : [],
    );
    vi.mocked(archiveCapsule).mockImplementation(async () => {
      revealedList = [];
      return { ...revealed, status: "archived", archivedAt: new Date().toISOString() };
    });

    const user = userEvent.setup();
    renderAt("/reveladas");

    expect(await screen.findByText("Para o futuro")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Arquivar" }));

    expect(archiveCapsule).toHaveBeenCalledWith("revealed-1");
    expect(await screen.findByText(EMPTY_REVEALED)).toBeInTheDocument();
  });

  it("não oferece arquivar na lista de arquivadas", async () => {
    vi.mocked(listCapsules).mockResolvedValue([
      makeCapsule("archived-1", "Para lembrar", "archived"),
    ]);

    renderAt("/arquivadas");

    expect(await screen.findByText("Para lembrar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Arquivar" })).not.toBeInTheDocument();
  });

  it("exclui uma cápsula arquivada somente após a confirmação", async () => {
    // ARC-AC-05 / UI-AC-04
    let archivedList: CapsuleSummary[] = [makeCapsule("archived-1", "Para lembrar", "archived")];

    vi.mocked(listCapsules).mockImplementation(async ({ status }) =>
      status === "archived" ? archivedList : [],
    );
    vi.mocked(deleteCapsule).mockImplementation(async () => {
      archivedList = [];
    });

    const user = userEvent.setup();
    renderAt("/arquivadas");

    await screen.findByText("Para lembrar");
    await user.click(screen.getByRole("button", { name: "Excluir" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(DELETE_CONFIRMATION_TEXT)).toBeInTheDocument();
    expect(deleteCapsule).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Excluir" }));

    expect(deleteCapsule).toHaveBeenCalledWith("archived-1");
    expect(await screen.findByText(EMPTY_ARCHIVED)).toBeInTheDocument();
  });

  it("mostra erro e tenta novamente", async () => {
    vi.mocked(listCapsules).mockRejectedValue({ code: "DB_ERROR", message: "Falha." });

    const user = userEvent.setup();
    renderAt("/reveladas");

    expect(await screen.findByRole("alert", {}, { timeout: 3_000 })).toHaveTextContent(
      "Não foi possível acessar seus dados. Tente novamente.",
    );

    vi.mocked(listCapsules).mockResolvedValue([]);
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByText(EMPTY_REVEALED)).toBeInTheDocument();
  });
});
