using System.IO;
using BillingContpaqiReader.Config;
using BillingContpaqiReader.Db;
using BillingContpaqiReader.Export;
using BillingContpaqiReader.Logging;
using BillingContpaqiReader.Storage;

namespace BillingContpaqiReader.Scheduling;

/// <summary>
/// Orchestrates a single sync cycle (RunOnceAsync) and runs it on a fixed interval (RunForeverAsync).
/// </summary>
public class PeriodicRunner
{
    private readonly AppConfig _config;
    private readonly ICatalogRepository _repo;
    private readonly IDropboxUploader _uploader;
    private readonly FileLogger _logger;

    public PeriodicRunner(
        AppConfig config,
        ICatalogRepository repo,
        IDropboxUploader uploader,
        FileLogger logger)
    {
        _config = config;
        _repo = repo;
        _uploader = uploader;
        _logger = logger;
    }

    /// <summary>
    /// Executes one full sync cycle:
    /// 1. Captures start timestamp.
    /// 2. Fetches clients → serializes to CSV → uploads.
    /// 3. Fetches products → serializes to CSV → uploads.
    /// 4. Computes status ("ok" / "partial" / "error").
    /// 5. Writes last_sync.json with start timestamp.
    /// Never throws; all exceptions are caught and reflected in the freshness payload.
    /// </summary>
    public async Task RunOnceAsync()
    {
        // 1. Capture start time — this is what goes into last_sync_at
        var startTime = DateTimeOffset.UtcNow;
        _logger.Log("INFO", "Sync cycle started");

        string? errorMessage = null;
        bool clientsOk = false;
        bool productsOk = false;
        int clientCount = 0;
        int productCount = 0;

        // 2. Fetch and upload clients CSV
        try
        {
            var clients = (await _repo.GetClientsAsync()).ToList();
            clientCount = clients.Count;

            using var ms = new MemoryStream();
            CsvWriter.WriteClients(clients, ms);
            ms.Seek(0, SeekOrigin.Begin);

            var clientsPath = $"{_config.DropboxBasePath}/Config/contpaqi_clientes.csv";
            await _uploader.UploadAsync(clientsPath, ms);
            clientsOk = true;
            _logger.Log("INFO", $"Uploaded clients CSV ({clientCount} records) → {clientsPath}");
        }
        catch (Exception ex)
        {
            errorMessage = ex.Message;
            _logger.Log("ERROR", $"Failed to upload clients CSV: {ex.Message}");
        }

        // 3. Fetch and upload products CSV
        try
        {
            var products = (await _repo.GetProductsAsync()).ToList();
            productCount = products.Count;

            using var ms = new MemoryStream();
            CsvWriter.WriteProducts(products, ms);
            ms.Seek(0, SeekOrigin.Begin);

            var productsPath = $"{_config.DropboxBasePath}/Config/contpaqi_productos.csv";
            await _uploader.UploadAsync(productsPath, ms);
            productsOk = true;
            _logger.Log("INFO", $"Uploaded products CSV ({productCount} records) → {productsPath}");
        }
        catch (Exception ex)
        {
            // Only overwrite errorMessage if clients succeeded (otherwise keep the first error)
            errorMessage ??= ex.Message;
            _logger.Log("ERROR", $"Failed to upload products CSV: {ex.Message}");
        }

        // 4. Compute status
        string status = (clientsOk, productsOk) switch
        {
            (true, true) => "ok",
            (false, false) => "error",
            _ => "partial"
        };

        // 5. Compute duration and write freshness JSON with START timestamp
        var durationMs = (long)(DateTimeOffset.UtcNow - startTime).TotalMilliseconds;

        try
        {
            using var ms = new MemoryStream();
            FreshnessWriter.Write(
                status,
                clientCount,
                productCount,
                durationMs,
                _config.AgentVersion,
                ms,
                errorMessage,
                startTime);       // <-- pass cycle start so last_sync_at = START, not END

            ms.Seek(0, SeekOrigin.Begin);
            var freshnessPath = $"{_config.DropboxBasePath}/Config/last_sync.json";
            await _uploader.UploadAsync(freshnessPath, ms);
            _logger.Log("INFO", $"Uploaded freshness JSON (status={status}, duration={durationMs}ms) → {freshnessPath}");
        }
        catch (Exception ex)
        {
            _logger.Log("ERROR", $"Failed to upload freshness JSON: {ex.Message}");
        }

        _logger.Log("INFO", $"Sync cycle complete. status={status} clients={clientCount} products={productCount} duration={durationMs}ms");
    }

    /// <summary>
    /// Runs sync cycles forever, sleeping <see cref="AppConfig.SyncIntervalMinutes"/> between each cycle.
    /// Exits gracefully when <paramref name="ct"/> is cancelled.
    /// </summary>
    public async Task RunForeverAsync(CancellationToken ct)
    {
        _logger.Log("INFO", $"PeriodicRunner starting. Interval={_config.SyncIntervalMinutes}m");

        while (!ct.IsCancellationRequested)
        {
            try
            {
                await RunOnceAsync();
            }
            catch (Exception ex)
            {
                // RunOnceAsync should never throw, but be defensive
                _logger.Log("ERROR", $"Unexpected exception in RunOnceAsync: {ex}");
            }

            try
            {
                await Task.Delay(TimeSpan.FromMinutes(_config.SyncIntervalMinutes), ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        _logger.Log("INFO", "PeriodicRunner stopped.");
    }
}
