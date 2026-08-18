using System.IO;
using System.Text;
using System.Text.Json;
using BillingContpaqiReader.Export;

public class FreshnessWriterTests
{
    // ---- helpers ----

    private static JsonDocument WriteAndParse(
        string status, int clients, int products, long durationMs, string version, string? error = null)
    {
        using var ms = new MemoryStream();
        FreshnessWriter.Write(status, clients, products, durationMs, version, ms, error);
        ms.Seek(0, SeekOrigin.Begin);
        return JsonDocument.Parse(ms);
    }

    // ---- tests ----

    [Fact]
    public void Write_ok_status_produces_correct_shape()
    {
        using var doc = WriteAndParse("ok", 42, 17, 350, "0.1.0");
        var root = doc.RootElement;

        Assert.Equal("ok", root.GetProperty("status").GetString());
        Assert.Equal(42, root.GetProperty("records").GetProperty("clients").GetInt32());
        Assert.Equal(17, root.GetProperty("records").GetProperty("products").GetInt32());
        Assert.Equal(350, root.GetProperty("duration_ms").GetInt64());
        Assert.Equal("0.1.0", root.GetProperty("agent_version").GetString());

        // last_sync_at must be present and parseable as a UTC datetime
        var syncAt = root.GetProperty("last_sync_at").GetString()!;
        Assert.True(DateTime.TryParse(syncAt, null,
            System.Globalization.DateTimeStyles.RoundtripKind, out var dt));
        Assert.Equal(DateTimeKind.Utc, dt.Kind);
    }

    [Fact]
    public void Write_ok_status_has_no_error_message_field()
    {
        using var doc = WriteAndParse("ok", 0, 0, 100, "0.1.0");
        var root = doc.RootElement;

        Assert.False(root.TryGetProperty("error_message", out _),
            "error_message should be absent when error is null");
    }

    [Fact]
    public void Write_error_status_includes_error_message()
    {
        using var doc = WriteAndParse("error", 0, 0, 5, "0.1.0", "Connection refused");
        var root = doc.RootElement;

        Assert.Equal("error", root.GetProperty("status").GetString());
        Assert.Equal("Connection refused", root.GetProperty("error_message").GetString());
    }

    [Fact]
    public void Write_json_is_pretty_printed()
    {
        using var ms = new MemoryStream();
        FreshnessWriter.Write("ok", 1, 1, 100, "0.1.0", ms);
        var text = Encoding.UTF8.GetString(ms.ToArray());

        // Pretty-printed JSON has newlines
        Assert.Contains('\n', text);
    }

    [Fact]
    public void Write_last_sync_at_format_matches_spec()
    {
        // Spec example: "2026-08-18T21:15:00.000Z"
        // Must be ISO 8601 UTC with milliseconds: yyyy-MM-ddTHH:mm:ss.fffZ
        using var doc = WriteAndParse("ok", 0, 0, 0, "0.1.0");
        var syncAt = doc.RootElement.GetProperty("last_sync_at").GetString()!;

        // Should end with Z (UTC marker)
        Assert.EndsWith("Z", syncAt);
        // Should parse as UTC
        var dt = DateTime.Parse(syncAt, null, System.Globalization.DateTimeStyles.RoundtripKind);
        Assert.Equal(DateTimeKind.Utc, dt.Kind);
    }
}
