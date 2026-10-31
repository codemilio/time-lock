import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { createCapsule, getAppState, listCapsules } from "../lib/api";
import { utcToDatetimeLocal } from "../lib/dates";

vi.mock("../lib/api");
vi.mock("../lib/notifications");

function futureLocal(hours = 48): string {
  return utcToDatetimeLocal(new Date(Date.now() + hours * 3_600_000).toISOString());
}

describe("NewCapsule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, "", "/nova");
    vi.mocked(getAppState).mockResolvedValue({
      setupCompleted: true,
      unlocked: true,
      pendingReveals: 0,
      appVersion: "0.1.0",
      cryptoFormatVersion: 1,
    });
    vi.mocked(listCapsules).mockResolvedValue([]);
  });

  it("envia a data em UTC, títulos sem espaços e mostra o toast", async () => {
    // UI-15
    vi.mocked(createCapsule).mockResolvedValue({
      id: "nova",
      title: "Meu título",
      revealDate: new Date(Date.now() + 172_800_000).toISOString(),
      status: "sealed",
      createdAt: new Date().toISOString(),
      revealedAt: null,
      archivedAt: null,
    });

    const user = userEvent.setup();
    const localDate = futureLocal();

    render(<App />);

    await screen.findByRole("heading", { name: "Nova Cápsula" });

    await user.type(screen.getByLabelText(/título/i), "  Meu título  ");
    await user.type(screen.getByLabelText(/sua mensagem/i), "Mensagem secreta");
    fireEvent.change(screen.getByLabelText(/data de revelação/i), {
      target: { value: localDate },
    });

    expect(screen.getByText(/em utc:/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /selar cápsula/i }));

    await waitFor(() => {
      expect(createCapsule).toHaveBeenCalledTimes(1);
    });

    const input = vi.mocked(createCapsule).mock.calls[0][0];

    expect(input.title).toBe("Meu título");
    expect(input.content).toBe("Mensagem secreta");
    expect(input.revealDate.endsWith("Z")).toBe(true);
    expect(new Date(input.revealDate).getTime()).toBe(new Date(localDate).getTime());

    expect(await screen.findByText(/cápsula selada com sucesso/i)).toBeInTheDocument();
  });

  it("impede o envio com data no passado", async () => {
    const user = userEvent.setup();
    const past = utcToDatetimeLocal(new Date(Date.now() - 3_600_000).toISOString());

    render(<App />);

    await screen.findByRole("heading", { name: "Nova Cápsula" });

    await user.type(screen.getByLabelText(/sua mensagem/i), "Mensagem secreta");
    fireEvent.change(screen.getByLabelText(/data de revelação/i), {
      target: { value: past },
    });

    await user.click(screen.getByRole("button", { name: /selar cápsula/i }));

    expect(await screen.findByText(/data de revelação deve estar no futuro/i)).toBeInTheDocument();
    expect(createCapsule).not.toHaveBeenCalled();
  });
});
