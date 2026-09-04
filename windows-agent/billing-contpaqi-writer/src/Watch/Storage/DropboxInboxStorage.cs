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
/// tokens OAuth queda fuera de scope — asumimos que el orquestador (Nazre en
/// dev, script de deploy en prod) provee un token vigente al arranque.
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
            var list = await _client.Files.ListFolderAsync(_pendientesPath);
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
        using var response = await _client.Files.DownloadAsync(path);
        return await response.GetContentAsStringAsync();
    }

    public async Task WriteOutboxTextAsync(string outboxSubdir, string filename, string content, CancellationToken ct)
    {
        var path  = $"{_rootPath}/{outboxSubdir}/{filename}";
        using var body = new MemoryStream(Encoding.UTF8.GetBytes(content));
        await _client.Files.UploadAsync(path, WriteMode.Overwrite.Instance, body: body);
    }

    public async Task MoveToOutboxAsync(string outboxSubdir, string filename, CancellationToken ct)
    {
        var from = $"{_pendientesPath}/{filename}";
        var to   = $"{_rootPath}/{outboxSubdir}/{filename}";
        try
        {
            await _client.Files.MoveV2Async(from, to, allowOwnershipTransfer: false, autorename: false);
        }
        catch (ApiException<RelocationError> ex) when (ex.ErrorResponse.IsTo && ex.ErrorResponse.AsTo.Value.IsConflict)
        {
            // Ya existe en destino: borrar destino y reintentar el move para
            // preservar el semantic "sobrescribe silenciosamente".
            await _client.Files.DeleteV2Async(to);
            await _client.Files.MoveV2Async(from, to, allowOwnershipTransfer: false, autorename: false);
        }
    }

    public void Dispose() => _client.Dispose();

    /// <summary>Normaliza el root: agrega leading slash si falta, quita trailing.</summary>
    private static string NormalizeRoot(string root)
    {
        var r = root.TrimEnd('/');
        return r.StartsWith('/') ? r : "/" + r;
    }
}
