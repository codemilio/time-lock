import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { getAppState, setupMasterPassword, unlock } from "./lib/api";
import type { AppState } from "./lib/types";

vi.mock("./lib/api");
vi.mock("./lib/notifications");

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

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

const STRONG_PASSWORD = "frase longa com palavras incomuns 42";

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, "", "/");
  });

  it("redireciona para /setup quando o setup não foi concluído", async () => {
    // TEST-UI-06 / UI-AC-01
    vi.mocked(getAppState).mockResolvedValue(makeState({ setupCompleted: false, unlocked: false }));

    renderAt("/reveladas");

    expect(
      await screen.findByRole("heading", { name: /crie sua senha mestra/i }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/setup");
  });

  it("redireciona rota protegida para /login quando a sessão está bloqueada", async () => {
    // TEST-UI-07 / UI-AC-02
    vi.mocked(getAppState).mockResolvedValue(makeState({ unlocked: false }));

    renderAt("/reveladas");

    expect(await screen.findByRole("heading", { name: /bem-vindo de volta/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/login");
  });

  it("redireciona /setup para a home quando já está destravado", async () => {
    // UI-08
    vi.mocked(getAppState).mockResolvedValue(makeState());

    renderAt("/setup");

    expect(await screen.findByRole("heading", { name: /^seladas$/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  it("mantém o usuário em /login quando ainda bloqueado", async () => {
    vi.mocked(getAppState).mockResolvedValue(makeState({ unlocked: false }));

    renderAt("/login");

    expect(await screen.findByRole("heading", { name: /bem-vindo de volta/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/login");
  });

  it("setup exige confirmação de senha e o checkbox de irreversibilidade", async () => {
    // TEST-UI-08
    vi.mocked(getAppState).mockResolvedValue(makeState({ setupCompleted: false, unlocked: false }));

    const user = userEvent.setup();
    renderAt("/setup");

    await screen.findByRole("heading", { name: /crie sua senha mestra/i });

    await user.type(screen.getByLabelText(/^senha mestra$/i), STRONG_PASSWORD);
    await user.type(screen.getByLabelText(/confirme a senha/i), "outra frase qualquer 99");
    await user.click(screen.getByRole("button", { name: /criar senha mestra/i }));

    expect(await screen.findByText("As senhas não coincidem.")).toBeInTheDocument();
    expect(
      await screen.findByText("Marque a caixa para confirmar que entende o aviso."),
    ).toBeInTheDocument();
    expect(setupMasterPassword).not.toHaveBeenCalled();
  });

  it("rejeita senha fraca no setup com sugestão", async () => {
    // AUTH-AC-03
    vi.mocked(getAppState).mockResolvedValue(makeState({ setupCompleted: false, unlocked: false }));

    const user = userEvent.setup();
    renderAt("/setup");

    await screen.findByRole("heading", { name: /crie sua senha mestra/i });

    const weak = "123456789012";
    await user.type(screen.getByLabelText(/^senha mestra$/i), weak);
    await user.type(screen.getByLabelText(/confirme a senha/i), weak);
    await user.click(screen.getByLabelText(/entendo que não há recuperação/i));
    await user.click(screen.getByRole("button", { name: /criar senha mestra/i }));

    expect(await screen.findByText(/senha muito previsível/i)).toBeInTheDocument();
    expect(setupMasterPassword).not.toHaveBeenCalled();
  });

  it("conclui o setup e entra na home", async () => {
    vi.mocked(getAppState)
      .mockResolvedValueOnce(makeState({ setupCompleted: false, unlocked: false }))
      .mockResolvedValue(makeState());
    vi.mocked(setupMasterPassword).mockResolvedValue({ unlocked: true, pendingReveals: 0 });

    const user = userEvent.setup();
    renderAt("/setup");

    await screen.findByRole("heading", { name: /crie sua senha mestra/i });

    await user.type(screen.getByLabelText(/^senha mestra$/i), STRONG_PASSWORD);
    await user.type(screen.getByLabelText(/confirme a senha/i), STRONG_PASSWORD);
    await user.click(screen.getByLabelText(/entendo que não há recuperação/i));
    await user.click(screen.getByRole("button", { name: /criar senha mestra/i }));

    expect(await screen.findByRole("heading", { name: /^seladas$/i })).toBeInTheDocument();
    expect(setupMasterPassword).toHaveBeenCalledWith(STRONG_PASSWORD);
    expect(window.location.pathname).toBe("/");
  });

  it("mostra a contagem regressiva quando o login é limitado", async () => {
    // AUTH-AC-04
    vi.mocked(getAppState).mockResolvedValue(makeState({ unlocked: false }));
    vi.mocked(unlock).mockRejectedValue({
      code: "RATE_LIMITED",
      message: "Muitas tentativas.",
      details: { retryAfterMs: 5_000 },
    });

    const user = userEvent.setup();
    renderAt("/login");

    await screen.findByRole("heading", { name: /bem-vindo de volta/i });

    await user.type(screen.getByLabelText(/^senha mestra$/i), "qualquer senha");
    await user.click(screen.getByRole("button", { name: /desbloquear/i }));

    expect(
      await screen.findByText(/muitas tentativas\. aguarde 5s para tentar novamente\./i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /desbloquear/i })).toBeDisabled();
  });

  it("limpa o campo e exibe erro de senha incorreta", async () => {
    vi.mocked(getAppState).mockResolvedValue(makeState({ unlocked: false }));
    vi.mocked(unlock).mockRejectedValue({
      code: "INVALID_PASSWORD",
      message: "Senha incorreta.",
    });

    const user = userEvent.setup();
    renderAt("/login");

    await screen.findByRole("heading", { name: /bem-vindo de volta/i });

    const input = screen.getByLabelText(/^senha mestra$/i);
    await user.type(input, "senha-errada-123");
    await user.click(screen.getByRole("button", { name: /desbloquear/i }));

    expect(await screen.findByText(/senha incorreta\. tente novamente\./i)).toBeInTheDocument();
    expect(input).toHaveValue("");
  });
});
