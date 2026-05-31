import { useState } from "react";
import { isAxiosError } from "axios";
import api from "../lib/api";
import { useToast } from "./Toast";

interface Props {
  versionId: string;
}

async function downloadBlob(
  url: string,
  method: "get" | "post",
  filename: string,
) {
  const res = await api.request<Blob>({ url, method, responseType: "blob" });
  const blobUrl = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(blobUrl);
}

async function extractErrorMessage(err: unknown, fallback: string) {
  if (!isAxiosError(err)) return fallback;
  const data = err.response?.data;
  // Blob response: parse JSON body
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      const parsed = JSON.parse(text) as { detail?: string; message?: string };
      return parsed.detail ?? parsed.message ?? fallback;
    } catch {
      return fallback;
    }
  }
  if (data && typeof data === "object") {
    const d = data as { detail?: string; message?: string };
    return d.detail ?? d.message ?? fallback;
  }
  return fallback;
}

export default function ExportButtons({ versionId }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const toast = useToast();

  async function handleExport(format: "csv" | "xlsx" | "docx") {
    setLoading(format);
    try {
      const url = `/audit-versions/${versionId}/export/${format}/`;
      const filename = `audit-${versionId}.${format}`;
      await downloadBlob(url, "get", filename);
      toast.success(`Exported ${format.toUpperCase()} for version ${versionId}.`);
    } catch (err) {
      const message = await extractErrorMessage(
        err,
        `Export ${format.toUpperCase()} failed.`,
      );
      toast.error(message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex items-center gap-2" data-testid="export-buttons">
      {(["csv", "xlsx", "docx"] as const).map((fmt) => (
        <button
          key={fmt}
          onClick={() => handleExport(fmt)}
          disabled={loading !== null}
          data-testid={`export-${fmt}`}
          className="det-btn det-btn-ghost !px-3 !py-1.5 !text-xs uppercase tracking-[0.1em] disabled:opacity-50"
        >
          {loading === fmt ? "Exporting…" : `Export ${fmt.toUpperCase()}`}
        </button>
      ))}
    </div>
  );
}
