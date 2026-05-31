import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

// jsdom does not implement scrollIntoView
window.HTMLElement.prototype.scrollIntoView = () => {};

beforeEach(() => {
  window.sessionStorage.clear();
});
