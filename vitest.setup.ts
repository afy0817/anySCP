import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import i18n from "./src/i18n";

// Tests assert on the English UI regardless of the machine's language.
void i18n.changeLanguage("en");

// Unmount React trees between tests so the DOM/listeners don't leak across specs.
afterEach(() => {
  cleanup();
});
