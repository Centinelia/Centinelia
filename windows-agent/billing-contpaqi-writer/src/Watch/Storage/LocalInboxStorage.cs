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
        // Sync bajo Task para cumplir el contrato async sin overhead innecesario;
        // el filesystem local no tiene nada asíncrono real que aprovechar aquí.
        IReadOnlyList<string> files = Directory.GetFiles(_inbox, "*.xml")
            .OrderBy(f => File.GetCreationTimeUtc(f))
            .Select(Path.GetFileName)
            .Where(name => name is not null)
            .Select(name => name!)
            .ToList();
        return Task.FromResult(files);
    }

    public async Task<string> ReadInboxTextAsync(string filename, CancellationToken ct)
    {
        var full = Path.Combine(_inbox, filename);
        return await File.ReadAllTextAsync(full, ct);
    }

    public async Task WriteOutboxTextAsync(string outboxSubdir, string filename, string content, CancellationToken ct)
    {
        var dir = Path.Combine(_outbox, outboxSubdir);
        Directory.CreateDirectory(dir);
        var full = Path.Combine(dir, filename);
        await File.WriteAllTextAsync(full, content, ct);
    }

    public Task MoveToOutboxAsync(string outboxSubdir, string filename, CancellationToken ct)
    {
        var src  = Path.Combine(_inbox, filename);
        var dir  = Path.Combine(_outbox, outboxSubdir);
        Directory.CreateDirectory(dir);
        var dest = Path.Combine(dir, filename);
        if (File.Exists(dest)) File.Delete(dest);
        File.Move(src, dest);
        return Task.CompletedTask;
    }
}
