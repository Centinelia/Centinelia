using System.IO;
using System.Text;
using System.Text.Json;
using BillingContpaqiReader.Config;
using BillingContpaqiReader.Db;
using BillingContpaqiReader.Db.Models;
using BillingContpaqiReader.Logging;
using BillingContpaqiReader.Scheduling;
using BillingContpaqiReader.Storage;

namespace BillingContpaqiReader.Tests;

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

file class FakeRepo : ICatalogRepository
{
    private readonly IEnumerable<ContpaqiClient> _clients;
    private readonly IEnumerable<ContpaqiProduct> _products;
    private readonly bool _throwOnClients;
    private readonly bool _throwOnProducts;

    public FakeRepo(
        IEnumerable<ContpaqiClient>? clients = null,
        IEnumerable<ContpaqiProduct>? products = null,
        bool throwOnClients = false,
        bool throwOnProducts = false)
    {
        _clients = clients ?? [];
        _products = products ?? [];
        _throwOnClients = throwOnClients;
        _throwOnProducts = throwOnProducts;
    }

    public Task<IEnumerable<ContpaqiClient>> GetClientsAsync()
    {
        if (_throwOnClients) throw new InvalidOperationException("DB connection failed");
        return Task.FromResult(_clients);
    }

    public Task<IEnumerable<ContpaqiProduct>> GetProductsAsync()
    {
        if (_throwOnProducts) throw new InvalidOperationException("DB connection failed");
        return Task.FromResult(_products);
    }
}

file class CapturingUploader : IDropboxUploader
{
    public Dictionary<string, byte[]> Uploads { get; } = new();

    public async Task UploadAsync(string dropboxPath, Stream content)
    {
        using var ms = new MemoryStream();
        await content.CopyToAsync(ms);
        Uploads[dropboxPath] = ms.ToArray();
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

public class PeriodicRunnerTests
{
    private static AppConfig MakeConfig(string basePath = "/centinelia") => new()
    {
        DbProvider = "firebird",
        DbConnectionString = "fake",
        DropboxAccessToken = "fake-token",
        DropboxBasePath = basePath,
        AgentVersion = "0.1.0",
        SyncIntervalMinutes = 15
    };

    private static FileLogger MakeLogger()
    {
        var path = Path.Combine(Path.GetTempPath(), $"test-agent-{Guid.NewGuid()}.log");
        return new FileLogger(path);
    }

    // -----------------------------------------------------------------------
    // Happy path
    // -----------------------------------------------------------------------

    [Fact]
    public async Task RunOnce_HappyPath_UploadsThreeFiles()
    {
        // Arrange
        var clients = new[]
        {
            new ContpaqiClient("XAXX010101000", "C001", "Empresa SA de CV",
                "G03", "601", "64000", "empresa@test.com", "8181234567")
        };
        var products = new[]
        {
            new ContpaqiProduct("SKU-001", "Producto A", "PZA", 100.0m, "01010101", 0.16m)
        };

        var repo = new FakeRepo(clients, products);
        var uploader = new CapturingUploader();
        var config = MakeConfig("/billing");
        var logger = MakeLogger();

        var runner = new PeriodicRunner(config, repo, uploader, logger);

        // Act
        await runner.RunOnceAsync();

        // Assert: 3 files uploaded
        Assert.Equal(3, uploader.Uploads.Count);
        Assert.Contains("/billing/Config/contpaqi_clientes.csv", uploader.Uploads);
        Assert.Contains("/billing/Config/contpaqi_productos.csv", uploader.Uploads);
        Assert.Contains("/billing/Config/last_sync.json", uploader.Uploads);
    }

    [Fact]
    public async Task RunOnce_HappyPath_ClientsCsvHasExpectedContent()
    {
        var clients = new[]
        {
            new ContpaqiClient("XAXX010101000", "C001", "Empresa SA de CV",
                "G03", "601", "64000", "empresa@test.com", "8181234567")
        };

        var repo = new FakeRepo(clients, []);
        var uploader = new CapturingUploader();
        var runner = new PeriodicRunner(MakeConfig(), repo, uploader, MakeLogger());

        await runner.RunOnceAsync();

        var csv = Encoding.UTF8.GetString(uploader.Uploads["/centinelia/Config/contpaqi_clientes.csv"]);
        // Has header
        Assert.Contains("rfc,adapter_client_id,razon_social", csv);
        // Has the one client
        Assert.Contains("XAXX010101000", csv);
        Assert.Contains("C001", csv);
    }

    [Fact]
    public async Task RunOnce_HappyPath_FreshnessStatusIsOk()
    {
        var clients = new[]
        {
            new ContpaqiClient("XAXX010101000", "C001", "Acme", "G03", "601", "64000", "a@a.com", "")
        };
        var products = new[]
        {
            new ContpaqiProduct("P1", "Prod", "PZA", 10m, "01010101", 0.16m)
        };

        var repo = new FakeRepo(clients, products);
        var uploader = new CapturingUploader();
        var runner = new PeriodicRunner(MakeConfig("/b"), repo, uploader, MakeLogger());

        await runner.RunOnceAsync();

        var json = Encoding.UTF8.GetString(uploader.Uploads["/b/Config/last_sync.json"]);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.Equal("ok", root.GetProperty("status").GetString());
        Assert.Equal(1, root.GetProperty("records").GetProperty("clients").GetInt32());
        Assert.Equal(1, root.GetProperty("records").GetProperty("products").GetInt32());
        Assert.False(root.TryGetProperty("error_message", out _));
    }

    // -----------------------------------------------------------------------
    // Error path: GetClients throws
    // -----------------------------------------------------------------------

    [Fact]
    public async Task RunOnce_BothThrow_FreshnessStatusIsError()
    {
        // Both clients AND products throw → status = "error"
        var repo = new FakeRepo(throwOnClients: true, throwOnProducts: true);
        var uploader = new CapturingUploader();
        var runner = new PeriodicRunner(MakeConfig("/b"), repo, uploader, MakeLogger());

        await runner.RunOnceAsync(); // must NOT throw

        Assert.Contains("/b/Config/last_sync.json", uploader.Uploads);

        var json = Encoding.UTF8.GetString(uploader.Uploads["/b/Config/last_sync.json"]);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.Equal("error", root.GetProperty("status").GetString());
        Assert.True(root.TryGetProperty("error_message", out var errProp));
        Assert.False(string.IsNullOrEmpty(errProp.GetString()));
    }

    [Fact]
    public async Task RunOnce_ClientsThrow_ProductsOk_FreshnessStatusIsPartial()
    {
        // Only clients throw → partial (products still uploaded)
        var repo = new FakeRepo(throwOnClients: true, throwOnProducts: false);
        var uploader = new CapturingUploader();
        var runner = new PeriodicRunner(MakeConfig("/b"), repo, uploader, MakeLogger());

        await runner.RunOnceAsync(); // must NOT throw

        var json = Encoding.UTF8.GetString(uploader.Uploads["/b/Config/last_sync.json"]);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.Equal("partial", root.GetProperty("status").GetString());
        Assert.True(root.TryGetProperty("error_message", out var errProp));
        Assert.False(string.IsNullOrEmpty(errProp.GetString()));
    }

    [Fact]
    public async Task RunOnce_ProductsThrow_FreshnessStatusIsPartial()
    {
        var clients = new[]
        {
            new ContpaqiClient("XAXX010101000", "C001", "Acme", "G03", "601", "64000", "a@a.com", "")
        };
        var repo = new FakeRepo(clients, throwOnProducts: true);
        var uploader = new CapturingUploader();
        var runner = new PeriodicRunner(MakeConfig("/b"), repo, uploader, MakeLogger());

        await runner.RunOnceAsync(); // must NOT throw

        var json = Encoding.UTF8.GetString(uploader.Uploads["/b/Config/last_sync.json"]);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.Equal("partial", root.GetProperty("status").GetString());
        Assert.True(root.TryGetProperty("error_message", out var errProp));
        Assert.False(string.IsNullOrEmpty(errProp.GetString()));
    }

    // -----------------------------------------------------------------------
    // Timestamp: last_sync_at must reflect cycle START, not END
    // -----------------------------------------------------------------------

    [Fact]
    public async Task RunOnce_FreshnessTimestamp_ReflectsStartNotEnd()
    {
        // Slow repo: introduces delay between start and write
        var slowRepo = new SlowFakeRepo(delayMs: 200);
        var uploader = new CapturingUploader();
        var runner = new PeriodicRunner(MakeConfig("/b"), slowRepo, uploader, MakeLogger());

        var before = DateTimeOffset.UtcNow;
        await runner.RunOnceAsync();
        var after = DateTimeOffset.UtcNow;

        var json = Encoding.UTF8.GetString(uploader.Uploads["/b/Config/last_sync.json"]);
        using var doc = JsonDocument.Parse(json);
        var syncAtStr = doc.RootElement.GetProperty("last_sync_at").GetString()!;
        var syncAt = DateTimeOffset.Parse(syncAtStr);

        // The timestamp must be BEFORE "after" — it was captured at cycle start.
        // If it reflected the END, it would be very close to or after "after".
        // We give 50 ms of tolerance for clock precision.
        Assert.True(syncAt >= before.AddMilliseconds(-50),
            $"last_sync_at {syncAt:O} should be >= cycle start {before:O}");
        Assert.True(syncAt < after,
            $"last_sync_at {syncAt:O} should be < cycle end {after:O} (delay of 200ms was added)");
    }
}

// Slow repo used only for timestamp test
file class SlowFakeRepo : ICatalogRepository
{
    private readonly int _delayMs;

    public SlowFakeRepo(int delayMs) => _delayMs = delayMs;

    public async Task<IEnumerable<ContpaqiClient>> GetClientsAsync()
    {
        await Task.Delay(_delayMs);
        return [];
    }

    public async Task<IEnumerable<ContpaqiProduct>> GetProductsAsync()
    {
        await Task.Delay(_delayMs);
        return [];
    }
}
