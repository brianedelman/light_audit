import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../context/AuthContext";
import { ToastProvider } from "../components/Toast";
import ExportButtons from "../components/ExportButtons";

vi.mock("../lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    request: vi.fn(),
  },
}));

import api from "../lib/api";
const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
};

// jsdom doesn't implement URL.createObjectURL / revokeObjectURL
const mockCreateObjectURL = vi.fn(() => "blob:fake-url");
const mockRevokeObjectURL = vi.fn();
window.URL.createObjectURL = mockCreateObjectURL as typeof URL.createObjectURL;
window.URL.revokeObjectURL = mockRevokeObjectURL as typeof URL.revokeObjectURL;

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  };
}

describe("ExportButtons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockImplementation((url: string) => {
      if (url === "/auth/me/")
        return Promise.resolve({
          data: { email: "u@e.com", name: "U", url: "/api/users/1/" },
        });
      return Promise.reject(new Error(`unmocked GET ${url}`));
    });
  });

  it("renders three export buttons", () => {
    render(<ExportButtons versionId="5" />, { wrapper: makeWrapper() });
    expect(screen.getByTestId("export-csv")).toBeInTheDocument();
    expect(screen.getByTestId("export-xlsx")).toBeInTheDocument();
    expect(screen.getByTestId("export-docx")).toBeInTheDocument();
  });

  it("clicking Export CSV calls GET export/csv/ with blob responseType", async () => {
    mockApi.request.mockResolvedValue({ data: new Blob(["a,b"]) });
    render(<ExportButtons versionId="5" />, { wrapper: makeWrapper() });

    fireEvent.click(screen.getByTestId("export-csv"));

    await waitFor(() => {
      expect(mockApi.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "/audit-versions/5/export/csv/",
          method: "get",
          responseType: "blob",
        })
      );
    });
  });

  it("clicking Export XLSX calls GET export/xlsx/ with blob responseType", async () => {
    mockApi.request.mockResolvedValue({ data: new Blob(["xlsx"]) });
    render(<ExportButtons versionId="5" />, { wrapper: makeWrapper() });

    fireEvent.click(screen.getByTestId("export-xlsx"));

    await waitFor(() => {
      expect(mockApi.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "/audit-versions/5/export/xlsx/",
          method: "get",
          responseType: "blob",
        })
      );
    });
  });

  it("clicking Export DOCX calls POST export/docx/ with blob responseType", async () => {
    mockApi.request.mockResolvedValue({ data: new Blob(["docx"]) });
    render(<ExportButtons versionId="5" />, { wrapper: makeWrapper() });

    fireEvent.click(screen.getByTestId("export-docx"));

    await waitFor(() => {
      expect(mockApi.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "/audit-versions/5/export/docx/",
          method: "get",
          responseType: "blob",
        })
      );
    });
  });

  it("creates and revokes blob URL after download", async () => {
    mockApi.request.mockResolvedValue({ data: new Blob(["csv"]) });
    render(<ExportButtons versionId="5" />, { wrapper: makeWrapper() });

    fireEvent.click(screen.getByTestId("export-csv"));

    await waitFor(() =>
      expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:fake-url")
    );
    expect(mockCreateObjectURL).toHaveBeenCalled();
  });

  it("shows error toast on failure", async () => {
    mockApi.request.mockRejectedValue(new Error("Network error"));
    render(<ExportButtons versionId="5" />, { wrapper: makeWrapper() });

    fireEvent.click(screen.getByTestId("export-csv"));

    const toast = await screen.findByTestId("toast-error");
    expect(toast).toBeInTheDocument();
    expect(toast.textContent).toContain("CSV");
  });
});
