import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Sem `globals: true` no Vitest, o cleanup automático do Testing Library não
// é registrado; sem isso, renders de testes anteriores continuam no DOM.
afterEach(() => {
  cleanup();
});
