using System.IO;

namespace BillingContpaqiReader.Logging;

/// <summary>
/// Simple append-only file logger. Thread-safe via lock on _logPath.
/// Each line format: "2026-08-18T21:15:00.000Z [LEVEL] message"
/// </summary>
public class FileLogger
{
    private readonly string _logPath;
    private readonly object _lock = new();

    public FileLogger(string logPath)
    {
        _logPath = logPath;
        // Ensure parent directory exists
        var dir = Path.GetDirectoryName(logPath);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);
    }

    public void Log(string level, string message)
    {
        var timestamp = DateTimeOffset.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
        var line = $"{timestamp} [{level.ToUpperInvariant()}] {message}";

        lock (_lock)
        {
            File.AppendAllText(_logPath, line + Environment.NewLine);
        }
    }
}
