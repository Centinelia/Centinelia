using Centinelia.BillingContpaqi.Writer.Watch.Storage;
using Microsoft.Extensions.Logging;

namespace Centinelia.BillingContpaqi.Writer.Watch;

/// <summary>
/// Bucle de polling: cada N segundos revisa el inbox del <see cref="IInboxStorage"/>
/// y por cada archivo pendiente invoca <see cref="BatchProcessor"/>. Al terminar
/// cada archivo:
///   - Todo OK  → mueve el original a subdir <c>procesados/</c>.
///   - Algo falló → deja detalle JSON en <c>errores/</c>, y ADEMÁS mueve el
///     original ahí para que no se re-procese en el siguiente barrido.
///
/// Los XMLs timbrados individuales quedan en <c>timbrados/</c> (los deposita
/// <see cref="BatchProcessor"/> directamente al storage).
///
/// Cancelación: escucha Ctrl+C. El loop termina el archivo en curso y sale
/// limpio (el caller cierra la sesión CONTPAQi con Dispose).
/// </summary>
public sealed class WatchLoop
{
    private readonly BatchProcessor _processor;
    private readonly IInboxStorage _storage;
    private readonly TimeSpan _pollInterval;
    private readonly ILogger _logger;

    public WatchLoop(BatchProcessor processor, IInboxStorage storage, TimeSpan pollInterval, ILogger logger)
    {
        _processor    = processor;
        _storage      = storage;
        _pollInterval = pollInterval;
        _logger       = logger;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        _logger.LogInformation("[watch] iniciando loop, poll={poll}s (Ctrl+C detiene)",
            _pollInterval.TotalSeconds);

        while (!ct.IsCancellationRequested)
        {
            IReadOnlyList<string> pending;
            try
            {
                pending = await _storage.ListInboxAsync(ct);
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                // Falla del backend (Dropbox 429, red, credencial expirada). No abortar
                // el loop; loguear y volver a intentar en el siguiente tick.
                _logger.LogError(ex, "[watch] ListInboxAsync falló, reintentando en el siguiente tick");
                pending = Array.Empty<string>();
            }

            foreach (var filename in pending)
            {
                if (ct.IsCancellationRequested) break;
                await ProcessOneAsync(filename, ct);
            }

            try { await Task.Delay(_pollInterval, ct); }
            catch (TaskCanceledException) { break; }
        }
        _logger.LogInformation("[watch] loop detenido por cancelación");
    }

    private async Task ProcessOneAsync(string filename, CancellationToken ct)
    {
        _logger.LogInformation("[watch] procesando {filename}", filename);
        BatchReport report;
        try
        {
            report = await _processor.ProcessAsync(filename, ct);
        }
        catch (Exception ex)
        {
            // Falla previa al procesamiento por factura (ej: XML mal formado,
            // storage fail al leer). Movemos a errores/ con un JSON explicando.
            await SafeMoveToErrorAsync(filename, ex, ct);
            _logger.LogError(ex, "[watch] {filename} falló pre-parseo: {msg}", filename, ex.Message);
            return;
        }

        var okCount   = report.Results.Count(r => r.Ok);
        var failCount = report.Results.Count - okCount;
        _logger.LogInformation("[watch] {filename} → {ok} timbradas, {fail} fallidas",
            filename, okCount, failCount);

        if (report.AllOk)
        {
            await _storage.MoveToOutboxAsync("procesados", filename, ct);
        }
        else
        {
            await _storage.MoveToOutboxAsync("errores", filename, ct);
            var reportName = Path.ChangeExtension(filename, ".json");
            await _storage.WriteOutboxTextAsync("errores", reportName, report.ToJson(), ct);
        }
    }

    private async Task SafeMoveToErrorAsync(string filename, Exception ex, CancellationToken ct)
    {
        try
        {
            await _storage.MoveToOutboxAsync("errores", filename, ct);
            var (kind, humanMsg) = ErrorClassifier.Classify(ex);
            var reportName = Path.ChangeExtension(filename, ".json");
            var payload = System.Text.Json.JsonSerializer.Serialize(new
            {
                sourceFile   = filename,
                processedAt  = DateTime.UtcNow,
                fatalKind    = kind,
                fatalMessage = humanMsg,
                fatalError   = $"{ex.GetType().Name}: {ex.Message}",
            }, new System.Text.Json.JsonSerializerOptions
            {
                WriteIndented = true,
                PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase,
                Converters =
                {
                    new System.Text.Json.Serialization.JsonStringEnumConverter(
                        System.Text.Json.JsonNamingPolicy.CamelCase),
                },
            });
            await _storage.WriteOutboxTextAsync("errores", reportName, payload, ct);
        }
        catch (Exception moveEx)
        {
            _logger.LogCritical(moveEx,
                "[watch] no se pudo mover {filename} a errores/. El siguiente tick lo intentará de nuevo.",
                filename);
        }
    }
}
