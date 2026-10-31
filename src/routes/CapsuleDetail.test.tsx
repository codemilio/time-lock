import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import CapsuleDetail from "./CapsuleDetail";
import { archiveCapsule, deleteCapsule, getAppState, listCapsules, readCapsule } from "../lib/api";
import { createQueryClient, queryKeys } from "../lib/query";
import { DELETE_CONFIRMATION_TEXT } from "../lib/messages";
import type { CapsuleContent } from "../lib/types";

vi.mock("../lib/api");
vi.mock("../lib/notifications");

const EMPTY_REVEALED =
  "Nenhuma cápsula revelada ainda. Sua próxima mensagem aguarda a data escolhida.";

function makeCapsule(overrides: Partial<CapsuleContent> = {}): CapsuleContent {
  const now = new Date().toISOString();

  return {
    id: "capsule-1",
    title: "Para o futuro",
    content: "Conteúdo original",
    status: "revealed",
    revealDate: now,
    createdAt: now,
    revealedAt: now,
    archivedAt: null,
    ...overrides,
  };
}

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

describe("CapsuleDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAppState).mockResolvedValue({
      setupCompleted: true,
      unlocked: true,
      pendingReveals: 0,
      appVersion: "0.1.0",
      cryptoFormatVersion: 1,
    });
    vi.mocked(listCapsules).mockResolvedValue([]);
  });

  it("exibe o conteúdo como texto puro e preserva quebras de linha", async () => {
    // UI-AC-05 / REV-AC-06
    const content = "Primeira linha\n<script>alert(1)</script>\n**não é markdown**";
    vi.mocked(readCapsule).mockResolvedValue(makeCapsule({ content }));

    const { container } = renderAt("/capsula/capsule-1");

    const node = await screen.findByTestId("capsule-content");

    expect(node.textContent).toBe(content);
    expect(container.querySelector("script")).toBeNull();
  });

  it("remove o conteúdo do cache ao desmontar", async () => {
    // UI-03
    vi.mocked(readCapsule).mockResolvedValue(makeCapsule());
    const queryClient = createQueryClient();

    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/capsula/capsule-1"]}>
          <Routes>
            <Route path="/capsula/:id" element={<CapsuleDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId("capsule-content")).toBeInTheDocument();
    expect(queryClient.getQueryData(queryKeys.capsule("capsule-1"))).toBeDefined();

    unmount();

    expect(queryClient.getQueryData(queryKeys.capsule("capsule-1"))).toBeUndefined();
  });

  it("arquiva a cápsula sem perder o conteúdo", async () => {
    // ARC-AC-01 / ARC-AC-04
    const capsule = makeCapsule();
    vi.mocked(readCapsule).mockResolvedValue(capsule);
    vi.mocked(archiveCapsule).mockResolvedValue({
      ...capsule,
      status: "archived",
      archivedAt: new Date().toISOString(),
    });

    const user = userEvent.setup();
    renderAt("/capsula/capsule-1");

    expect(await screen.findByText("Para o futuro")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Arquivar" }));

    expect(archiveCapsule).toHaveBeenCalledWith("capsule-1");
    expect(await screen.findByText("Cápsula arquivada.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Arquivar" })).not.toBeInTheDocument();
    expect(screen.getByText("Arquivada")).toBeInTheDocument();
    expect(screen.getByTestId("capsule-content")).toHaveTextContent("Conteúdo original");
  });

  it("exclui a cápsula e volta para a lista", async () => {
    // UI-AC-04
    vi.mocked(readCapsule).mockResolvedValue(makeCapsule());
    vi.mocked(deleteCapsule).mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderAt("/capsula/capsule-1");

    await screen.findByText("Para o futuro");
    await user.click(screen.getByRole("button", { name: "Excluir" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(DELETE_CONFIRMATION_TEXT)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Excluir" }));

    expect(deleteCapsule).toHaveBeenCalledWith("capsule-1");
    expect(await screen.findByText(EMPTY_REVEALED)).toBeInTheDocument();
    expect(window.location.pathname).toBe("/reveladas");
  });

  it("explica quando a cápsula ainda não pode ser aberta", async () => {
    // REV-AC-04 / REV-AC-05
    vi.mocked(readCapsule).mockRejectedValue({
      code: "CAPSULE_NOT_DUE",
      message: "Ainda não.",
    });

    renderAt("/capsula/capsule-1");

    expect(await screen.findByText("Esta cápsula ainda não pode ser aberta.")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Não foi possível abrir a cápsula" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });
});
