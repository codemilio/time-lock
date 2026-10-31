import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { listen } from "@tauri-apps/api/event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { getAppState, listCapsules, markFrontendReady, readCapsule, revealDue } from "./lib/api";
import type { AppState, CapsuleContent } from "./lib/types";

vi.mock("./lib/api");
vi.mock("./lib/notifications");
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

type EventHandler = (event: { payload: unknown }) => void;

const handlers: Record<string, EventHandler> = {};

function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    setupCompleted: true,
    unlocked: true,
    pendingReveals: 0,
    appVersion: "0.1.0",
    cryptoFormatVersion: 1,
    ...overrides,
  };
}

function makeCapsule(content: string): CapsuleContent {
  const now = new Date().toISOString();

  return {
    id: "capsule-1",
    title: "Para o futuro",
    content,
    status: "revealed",
    revealDate: now,
    createdAt: now,
    revealedAt: now,
    archivedAt: null,
  };
}

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

describe("eventos do backend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(handlers).forEach((key) => delete handlers[key]);

    vi.mocked(listen).mockImplementation((event, handler) => {
      handlers[event] = handler as unknown as EventHandler;
      return Promise.resolve(() => undefined);
    });
  });

  it("exibe o banner ao receber capsules://revealed e navega para reveladas", async () => {
    // UI-26 / TEST-UI-11
    vi.mocked(getAppState).mockResolvedValue(makeState());
    vi.mocked(listCapsules).mockResolvedValue([]);

    const user = userEvent.setup();
    renderAt("/");

    await screen.findByRole("heading", { name: "Seladas" });
    await waitFor(() => expect(handlers["capsules://revealed"]).toBeDefined());

    act(() => {
      handlers["capsules://revealed"]({
        payload: { count: 2, ids: ["a", "b"] },
      });
    });

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Você tem 2 cápsulas prontas para abrir!",
    );

    await user.click(screen.getByRole("button", { name: "Ver reveladas" }));

    expect(await screen.findByRole("heading", { name: "Reveladas" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("sinaliza prontidão e verifica vencidas ao ganhar foco", async () => {
    // REV-21 / REV-22
    vi.mocked(getAppState).mockResolvedValue(makeState());
    vi.mocked(listCapsules).mockResolvedValue([]);

    renderAt("/");

    await screen.findByRole("heading", { name: "Seladas" });
    await waitFor(() => expect(markFrontendReady).toHaveBeenCalled());

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => expect(revealDue).toHaveBeenCalledTimes(1));
  });

  it("limpa o cache e tira o conteúdo da tela ao receber auth://locked", async () => {
    // UI-AC-06 / UI-11
    const content = "Segredo que não pode permanecer na tela";

    vi.mocked(getAppState)
      .mockResolvedValueOnce(makeState())
      .mockResolvedValue(makeState({ unlocked: false }));
    vi.mocked(readCapsule).mockResolvedValue(makeCapsule(content));

    renderAt("/capsula/capsule-1");

    expect(await screen.findByText(content)).toBeInTheDocument();
    await waitFor(() => expect(handlers["auth://locked"]).toBeDefined());

    act(() => {
      handlers["auth://locked"]({ payload: null });
    });

    expect(await screen.findByRole("heading", { name: /bem-vindo de volta/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(content)).not.toBeInTheDocument());
    expect(window.location.pathname).toBe("/login");
  });
});
