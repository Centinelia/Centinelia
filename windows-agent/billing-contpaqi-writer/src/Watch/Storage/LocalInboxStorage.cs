namespace Centinelia.BillingContpaqi.Writer.Watch.Storage;

/// <summary>
/// Implementación de <see cref="IInboxStorage"/> sobre el filesystem local.
/// Layout: <c>{inbox}/</c> (raíz) para pendientes, <c>{outbox}/{subdir}/</c>
/// para procesados/errores/timbrados.
/// </summary>
public sealed class LocalInboxStorage : IInboxStorage
{
    private readonly string _inbox;
    private readonly string _outbox;

    public LocalInboxStorage(string inbox, string outbox)
    {
        _inbox  = inbox;
        _outbox = outbox;
        Directory.CreateDirectory(inbox);
        Directory.CreateDirectory(outbox);
    }

    public Task<IReadOnlyList<string>> ListInboxAsync(CancellationToken ct)
    {
        // SearchOption.AllDirectories para soportar layouts YYYY/MM (paridad con
        // DropboxInboxStorage). Retorna paths relativos al inbox, con '/' como
        // separador para simetría con Dropbox (WatchLoop no distingue OS-slash).
        var basePath = Path.GetFullPath(_inbox);
        IReadOnlyList<string> files = Directory.GetFiles(_inbox, "*.xml", SearchOption.AllDirectories)
            .OrderBy(f => File.GetCreationTimeUtc(f))
            .Select(full => Path.GetRelativePath(basePath, full).Replace(Path.DirectorySeparatorChar, '/'))
            .ToList();
        return Task.FromResult(files);
    }

    public async Task<string> ReadInboxTextAsync(string relativePath, CancellationToken ct)
    {
        var full = Path.Combine(_inbox, relativePath.Replace('/', Path.DirectorySeparatorChar));
        return await File.ReadAllTextAsync(full, ct);
    }

    public async Task WriteOutboxTextAsync(string outboxSubdir, string filename, string content, CancellationToken ct)
    {
        var dir = Path.Combine(_outbox, outboxSubdir);
        var full = Path.Combine(dir, filename.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        await File.WriteAllTextAsync(full, content, ct);
    }

    public Task MoveToOutboxAsync(string outboxSubdir, string relativePath, CancellationToken ct)
    {
        // Preserva subestructura YYYY/MM.
        var normalized = relativePath.Replace('/', Path.DirectorySeparatorChar);
        var src  = Path.Combine(_inbox, normalized);
        var dest = Path.Combine(_outbox, outboxSubdir, normalized);
        Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
        if (File.Exists(dest)) File.Delete(dest);
        File.Move(src, dest);
        return Task.CompletedTask;
    }
}
