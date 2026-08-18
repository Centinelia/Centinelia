using System.IO;
using System.Text.Json;

namespace BillingContpaqiReader.Config;

public class AppConfig
{
    public string DbProvider { get; set; } = "";
    public string DbConnectionString { get; set; } = "";
    public string DropboxAccessToken { get; set; } = "";
    public string DropboxBasePath { get; set; } = "";
    public string AgentVersion { get; set; } = "0.1.0";
    public int SyncIntervalMinutes { get; set; } = 15;

    public static AppConfig Load(string path)
    {
        var json = File.ReadAllText(path);
        var config = JsonSerializer.Deserialize<AppConfig>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new System.Exception("Failed to parse config file");

        if (config.DbProvider is not ("firebird" or "sqlserver"))
            throw new System.ArgumentException($"DbProvider must be 'firebird' or 'sqlserver', got '{config.DbProvider}'");
        if (string.IsNullOrWhiteSpace(config.DbConnectionString))
            throw new System.ArgumentException("DbConnectionString is required");
        if (string.IsNullOrWhiteSpace(config.DropboxAccessToken))
            throw new System.ArgumentException("DropboxAccessToken is required");
        if (string.IsNullOrWhiteSpace(config.DropboxBasePath))
            throw new System.ArgumentException("DropboxBasePath is required");

        return config;
    }
}
