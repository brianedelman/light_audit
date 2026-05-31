import { useState } from "react";
import api from "../lib/api";

interface Props {
  versionId: string;
}

async function downloadBlob(
  url: string,
  method: "get" | "post",
  filename: string
) {
  const res = await api.request<Blob>({ url, method, responseType: "blob" });
  const blobUrl = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(blobUrl);
}

export default function ExportButtons({ versionId }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(format: "csv" | "xlsx" | "docx") {
    setLoading(format);
    setError(null);
    try {
      const url = `/audit-versions/${versionId}/export/${format}/`;
      const filename = `audit-${versionId}.${format}`;
      await downloadBlob(url, "get", filename);
    } catch {
      setError(`Export ${format.toUpperCase()} failed.`);
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
          className="rounded border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-50 disabled:bg-grey-50"
        >
          {loading === fmt ? "Exporting…" : `Export ${fmt.toUpperCase()}`}
        </button>
      ))}
      {error && (
        <span className="text-sm text-red-600" data-testid="export-error">
          {error}
        </span>
      )}
    </div>
  );
}
