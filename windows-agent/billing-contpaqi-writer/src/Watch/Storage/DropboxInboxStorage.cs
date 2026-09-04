using System.Text;
using Dropbox.Api;
using Dropbox.Api.Files;

namespace Centinelia.BillingContpaqi.Writer.Watch.Storage;

/// <summary>
/// Implementación de <see cref="IInboxStorage"/> sobre Dropbox API v2 usando
/// el SDK oficial <c>Dropbox.Api</c>. Este es el modo de producción cuando el
/// cliente ha autorizado la App de Centinelia.
///
/// Rutas: Dropbox usa formato Unix con leading slash y sin drive letter.
/// El caller pasa <c>--dropbox-root</c> como base (ej. <c>/Apps/Centinelia/piloto-estrella</c>),
/// y este helper arma <c>{root}/pendientes</c>, <c>{root}/procesados</c>, etc.
///
/// Autenticación: token de acceso (short-lived o long-lived). Refresco de
/// tokens OAuth queda fuera de scope.
///
/// Robustez (Day 11 post-audit 2026-09-04):
///   - Cada llamada a Dropbox se envuelve en <see cref="WithRetry"/> con backoff
///     exponencial hasta 4 intentos frente a <see cref="RateLimitException"/>
///     (HTTP 429) y <see cref="HttpException"/> transitorios.
///   - Sin este manejo, un 429 en <c>WriteOutboxTextAsync</c> post-timbrado
///     dejaba el CFDI timbrado en CONTPAQi pero no publicado a Dropbox
///     → cliente pide reintento → doble timbre (bug fiscal).
/// </summary>
public sealed class DropboxInboxStorage : IInboxStorage, IDisposable
{
    private readonly DropboxClient _client;
    private readonly string _pendientesPath;
    private readonly string _rootPath;

    public DropboxInboxStorage(string accessToken, string dropboxRoot)
    {
        _client         = new DropboxClient(accessToken);
        _rootPath       = NormalizeRoot(dropboxRoot);
        _pendientesPath = $"{_rootPath}/pendientes";
    }

    public async Task<IReadOnlyList<string>> ListInboxAsync(CancellationToken ct)
    {
        try
        {
            var list = await WithRetry(() => _client.Files.ListFolderAsync(_pendientesPath), ct);
            return list.Entries
                .Where(e => e.IsFile && e.Name.EndsWith(".xml", StringComparison.OrdinalIgnoreCase))
                .OrderBy(e => e.AsFile.ServerModified)
                .Select(e => e.Name)
                .ToList();
        }
        catch (ApiException<ListFolderError> ex) when (ex.ErrorResponse.IsPath && ex.ErrorResponse.AsPath.Value.IsNotFound)
        {
            // Carpeta pendientes/ no existe todavía → tratar como vacío.
            return Array.Empty<string>();
        }
    }

    public async Task<string> ReadInboxTextAsync(string filename, CancellationToken ct)
    {
        var path = $"{_pendientesPath}/{filename}";
        using var response = await WithRetry(() => _client.Files.DownloadAsync(path), ct);
        return await response.GetContentAsStringAsync();
    }

    public async Task WriteOutboxTextAsync(string outboxSubdir, string filename, string content, CancellationToken ct)
    {
        var path  = $"{_rootPath}/{outboxSubdir}/{filename}";
        var bytes = Encoding.UTF8.GetBytes(content);
        // MemoryStream se recrea por intento porque Dropbox SDK consume el stream.
        await WithRetry(async () =>
        {
            using var body = new MemoryStream(bytes);
            return await _client.Files.UploadAsync(path, WriteMode.Overwrite.Instance, body: body);
        }, ct);
    }

    public async Task MoveToOutboxAsync(string outboxSubdir, string filename, CancellationToken ct)
    {
        var from = $"{_pendientesPath}/{filename}";
        var to   = $"{_rootPath}/{outboxSubdir}/{filename}";
        try
        {
            await WithRetry(() => _client.Files.MoveV2Async(from, to, allowOwnershipTransfer: false, autorename: false), ct);
        }
        catch (ApiException<RelocationError> ex) when (ex.ErrorResponse.IsTo && ex.ErrorResponse.AsTo.Value.IsConflict)
        {
            // Ya existe en destino: borrar destino y reintentar el move para
            // preservar el semantic "sobrescribe silenciosamente".
            await WithRetry(() => _client.Files.DeleteV2Async(to), ct);
            await WithRetry(() => _client.Files.MoveV2Async(from, to, allowOwnershipTransfer: false, autorename: false), ct);
        }
    }

    public void Dispose() => _client.Dispose();

    // ---- Retry helper -----------------------------------------------------

    /// <summary>
    /// Envuelve una llamada al SDK Dropbox con retry exponencial ante 429 y
    /// errores HTTP transientes. Respeta el <c>Retry-After</c> del rate limit
    /// cuando Dropbox lo provee.
    /// </summary>
    private static async Task<T> WithRetry<T>(
        Func<Task<T>> op,
        CancellationToken ct,
        int maxAttempts = 4,
        int baseDelayMs = 500)
    {
        for (var attempt = 1; ; attempt++)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                return await op();
            }
            catch (RateLimitException ex) when (attempt < maxAttempts)
            {
                // Dropbox nos dice cuánto esperar en RetryAfter.
                var wait = ex.RetryAfter > 0 ? TimeSpan.FromSeconds(ex.RetryAfter) : NextBackoff(attempt, baseDelayMs);
                await Task.Delay(wait, ct);
            }
            catch (HttpException) when (attempt < maxAttempts)
            {
                // 5xx transient — backoff exponencial.
                await Task.Delay(NextBackoff(attempt, baseDelayMs), ct);
            }
        }
    }

    private static TimeSpan NextBackoff(int attempt, int baseMs) =>
        TimeSpan.FromMilliseconds(baseMs * Math.Pow(2, attempt - 1));

    /// <summary>Normaliza el root: agrega leading slash si falta, quita trailing.</summary>
    private static string NormalizeRoot(string root)
    {
        var r = root.TrimEnd('/');
        return r.StartsWith('/') ? r : "/" + r;
    }
}
