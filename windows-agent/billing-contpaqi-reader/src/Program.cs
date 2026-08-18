using BillingContpaqiReader.Config;
using BillingContpaqiReader.Db;
using BillingContpaqiReader.Logging;
using BillingContpaqiReader.Scheduling;
using BillingContpaqiReader.Storage;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
var configPath = args.Length > 0 ? args[0] : "appsettings.json";
AppConfig config;
try
{
    config = AppConfig.Load(configPath);
}
catch (Exception ex)
{
    Console.Error.WriteLine($"[FATAL] Failed to load config from '{configPath}': {ex.Message}");
    return 1;
}

// ---------------------------------------------------------------------------
// Logger  (sits next to the config file)
// ---------------------------------------------------------------------------
var logPath = Path.Combine(Path.GetDirectoryName(configPath) ?? ".", "agent.log");
var logger = new FileLogger(logPath);
logger.Log("INFO", $"Billing CONTPAQi Reader v{config.AgentVersion} starting. Provider={config.DbProvider}");

Console.WriteLine($"Billing CONTPAQi Reader v{config.AgentVersion} started. Provider: {config.DbProvider}");
Console.WriteLine($"Log: {logPath}");
Console.WriteLine("Press Ctrl+C to stop.");

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------
var repo = DbFactory.Create(config);
var uploader = new DropboxUploader(config.DropboxAccessToken);
var runner = new PeriodicRunner(config, repo, uploader, logger);

// ---------------------------------------------------------------------------
// Cancellation via Ctrl+C
// ---------------------------------------------------------------------------
using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true; // prevent immediate process kill
    Console.WriteLine("Shutdown requested...");
    logger.Log("INFO", "Shutdown requested via Ctrl+C");
    cts.Cancel();
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
try
{
    await runner.RunForeverAsync(cts.Token);
}
catch (Exception ex)
{
    logger.Log("ERROR", $"Fatal error in RunForeverAsync: {ex}");
    Console.Error.WriteLine($"[FATAL] {ex.Message}");
    return 2;
}

logger.Log("INFO", "Agent exiting normally.");
return 0;
