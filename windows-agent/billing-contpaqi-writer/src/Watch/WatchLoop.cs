namespace Centinelia.BillingContpaqi.Writer.Watch;

/// <summary>
/// Bucle de polling: cada N segundos revisa <c>{inbox}</c> por archivos .xml
/// y los procesa con <see cref="BatchProcessor"/>. Al final de cada archivo:
///   - Todo OK  → mueve el original a <c>{outbox}/procesados/</c>.
///   - Algo falló → deja detalle JSON en <c>{outbox}/errores/</c>, y ADEMÁS
///     mueve el original a <c>{outbox}/errores/</c> para que Nala no lo
///     re-procese en el siguiente barrido.
///
/// Los XMLs timbrados individuales quedan en <c>{outbox}/timbrados/</c>
/// (los deposita <see cref="BatchProcessor"/>).
///
/// Cancelación: escuchar Ctrl+C. El loop termina el archivo en curso y sale
/// limpio (el caller cierra la sesión CONTPAQi con Dispose).
/// </summary>
public sealed class WatchLoop
{
    private readonly BatchProcessor _processor;
    private readonly string _inbox;
    private readonly string _outbox;
    private readonly TimeSpan _pollInterval;

    public WatchLoop(BatchProcessor processor, string inbox, string outbox, TimeSpan pollInterval)
    {
        _processor    = processor;
        _inbox        = inbox;
        _outbox       = outbox;
        _pollInterval = pollInterval;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        Directory.CreateDirectory(_inbox);
        Directory.CreateDirectory(Path.Combine(_outbox, "procesados"));
        Directory.CreateDirectory(Path.Combine(_outbox, "errores"));
        Directory.CreateDirectory(Path.Combine(_outbox, "timbrados"));

        Console.WriteLine($"[watch] inbox: {_inbox}");
        Console.WriteLine($"[watch] outbox: {_outbox}");
        Console.WriteLine($"[watch] poll: {_pollInterval.TotalSeconds}s. Ctrl+C para detener.");

        while (!ct.IsCancellationRequested)
        {
            var pending = Directory.GetFiles(_inbox, "*.xml")
                .OrderBy(f => File.GetCreationTimeUtc(f))
                .ToList();

            foreach (var file in pending)
            {
                if (ct.IsCancellationRequested) break;
                ProcessOne(file);
            }

            try { await Task.Delay(_pollInterval, ct); }
            catch (TaskCanceledException) { break; }
        }
        Console.WriteLine("[watch] deteniendo loop por cancelación");
    }

    private void ProcessOne(string filePath)
    {
        var filename = Path.GetFileName(filePath);
        Console.WriteLine($"[watch] procesando {filename}");
        BatchReport report;
        try
        {
            report = _processor.Process(filePath);
        }
        catch (Exception ex)
        {
            // Falla previa al procesamiento por factura (ej: XML mal formado).
            // Movemos a errores/ con un JSON explicando por qué.
            var errPath = Path.Combine(_outbox, "errores", filename);
            SafeMove(filePath, errPath);
            var reportPath = Path.Combine(_outbox, "errores", Path.ChangeExtension(filename, ".json"));
            File.WriteAllText(reportPath, System.Text.Json.JsonSerializer.Serialize(new
            {
                sourceFile = filename,
                processedAt = DateTime.UtcNow,
                fatalError = $"{ex.GetType().Name}: {ex.Message}",
            }, new System.Text.Json.JsonSerializerOptions
            {
                WriteIndented = true,
                PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase,
            }));
            Console.WriteLine($"[watch] {filename} FALLÓ pre-parseo: {ex.Message}");
            return;
        }

        var okCount   = report.Results.Count(r => r.Ok);
        var failCount = report.Results.Count - okCount;
        Console.WriteLine($"[watch] {filename} → {okCount} timbradas, {failCount} fallidas");

        if (report.AllOk)
        {
            var destPath = Path.Combine(_outbox, "procesados", filename);
            SafeMove(filePath, destPath);
        }
        else
        {
            var destPath = Path.Combine(_outbox, "errores", filename);
            SafeMove(filePath, destPath);
            var reportPath = Path.Combine(_outbox, "errores", Path.ChangeExtension(filename, ".json"));
            File.WriteAllText(reportPath, report.ToJson());
        }
    }

    private static void SafeMove(string src, string dest)
    {
        if (File.Exists(dest)) File.Delete(dest);
        File.Move(src, dest);
    }
}
