using System.IO;
using System.Text.Json;

namespace BillingContpaqiReader.Export;

public static class FreshnessWriter
{
    /// <summary>
    /// Writes a freshness/last-sync JSON payload to the given stream.
    /// Format:
    /// {
    ///   "last_sync_at": "2026-08-18T21:15:00.000Z",
    ///   "status": "ok",
    ///   "records": { "clients": N, "products": N },
    ///   "duration_ms": N,
    ///   "agent_version": "0.1.0"
    /// }
    /// If error is not null, an "error_message" field is added.
    /// </summary>
    public static void Write(
        string status,
        int clients,
        int products,
        long durationMs,
        string version,
        Stream output,
        string? error = null)
    {
        var options = new JsonWriterOptions { Indented = true };

        using var writer = new Utf8JsonWriter(output, options);

        writer.WriteStartObject();

        // last_sync_at: ISO 8601 UTC with milliseconds, e.g. "2026-08-18T21:15:00.000Z"
        var nowUtc = DateTime.UtcNow;
        writer.WriteString("last_sync_at", nowUtc.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"));

        writer.WriteString("status", status);

        writer.WriteStartObject("records");
        writer.WriteNumber("clients", clients);
        writer.WriteNumber("products", products);
        writer.WriteEndObject();

        writer.WriteNumber("duration_ms", durationMs);
        writer.WriteString("agent_version", version);

        if (error is not null)
        {
            writer.WriteString("error_message", error);
        }

        writer.WriteEndObject();
        writer.Flush();
    }
}
