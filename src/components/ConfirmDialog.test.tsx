import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import ConfirmDialog from "./ConfirmDialog";

function renderDialog(overrides: Partial<ComponentProps<typeof ConfirmDialog>> = {}) {
  const props: ComponentProps<typeof ConfirmDialog> = {
    title: "Excluir cápsula?",
    description: "Esta ação não pode ser desfeita.",
    confirmLabel: "Excluir",
    pending: false,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };

  return { ...render(<ConfirmDialog {...props} />), props };
}

describe("ConfirmDialog", () => {
  it("fecha com Esc e restaura o foco quando não está pendente", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Abrir";
    document.body.append(trigger);
    trigger.focus();

    const onCancel = vi.fn();
    const user = userEvent.setup();

    const { rerender } = renderDialog({ onCancel });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(<div />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    trigger.remove();
  });

  it("ignora Esc e Tab externo enquanto a exclusão está em andamento", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();

    renderDialog({ pending: true, onCancel });

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-busy", "true");

    await user.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();

    document.body.focus();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
