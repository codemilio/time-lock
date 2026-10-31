import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import NotificationBanner from "./NotificationBanner";

function renderBanner(count: number, onDismiss?: () => void) {
  return render(
    <MemoryRouter>
      <NotificationBanner count={count} onDismiss={onDismiss} />
    </MemoryRouter>,
  );
}

describe("NotificationBanner", () => {
  it("usa o singular para exatamente uma cápsula", () => {
    // TEST-UI-11
    renderBanner(1);

    expect(screen.getByRole("status")).toHaveTextContent("Você tem 1 cápsula pronta para abrir!");
    expect(screen.getByRole("button", { name: "Ver reveladas" })).toBeInTheDocument();
  });

  it("usa o plural para mais de uma cápsula", () => {
    // TEST-UI-11
    renderBanner(4);

    expect(screen.getByRole("status")).toHaveTextContent("Você tem 4 cápsulas prontas para abrir!");
  });

  it("não renderiza nada sem cápsulas", () => {
    const { container } = renderBanner(0);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("fecha o banner pelo botão", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();

    renderBanner(2, onDismiss);

    await user.click(screen.getByRole("button", { name: "Fechar" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("descarta o banner ao navegar para as reveladas", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();

    renderBanner(3, onDismiss);

    await user.click(screen.getByRole("button", { name: "Ver reveladas" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
