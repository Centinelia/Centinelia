using Centinelia.BillingContpaqi.Writer.Sdk;
using Centinelia.BillingContpaqi.Writer.Watch;
using Centinelia.BillingContpaqi.Writer.Watch.Storage;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Centinelia.BillingContpaqi.Writer.Service;

/// <summary>
/// Envuelve el <see cref="WatchLoop"/> como <c>BackgroundService</c> para
/// correr bajo el Windows Service Control Manager (SCM) o como consola.
///
/// Ciclo de vida:
///   1. <see cref="ExecuteAsync"/> abre <see cref="ContpaqiSession"/> + storage.
///   2. Corre el WatchLoop hasta que <see cref="IHostApplicationLifetime"/> señala parada.
///   3. Dispose ordenado: cierra empresa CONTPAQi, cierra Dropbox client.
///
/// El SCM le da hasta 30s para parar limpio (configurable en el registry
/// como <c>ServicesPipeTimeout</c>). Nuestro WatchLoop respeta el token y
/// termina el archivo en curso, así que cabe cómodo.
/// </summary>
public sealed class WriterBackgroundService : BackgroundService
{
    private readonly WriterServiceOptions _opts;
    private readonly ILoggerFactory _loggerFactory;
    private readonly ILogger<WriterBackgroundService> _logger;

    public WriterBackgroundService(
        IOptions<WriterServiceOptions> opts,
        ILoggerFactory loggerFactory,
        ILogger<WriterBackgroundService> logger)
    {
        _opts          = opts.Value;
        _loggerFactory = loggerFactory;
        _logger        = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _opts.Validate();
        _logger.LogInformation("[service] arrancando writer contra empresa {empresa} concepto={concepto} storage={backend}",
            _opts.EmpresaPath, _opts.Concepto, _opts.Storage.Backend);

        // Sesión CONTPAQi vive durante toda la vida del servicio. Reiniciar
        // el servicio (via SCM) es la forma canónica de recrear la sesión
        // si el SDK entra en estado degradado.
        using var session = ContpaqiSession.Open(
            _opts.SdkPath, _opts.Usuario, _opts.Password, _opts.EmpresaPath);
        _logger.LogInformation("[service] sesión CONTPAQi + empresa abiertas OK");

        IInboxStorage storage = BuildStorage(_opts.Storage);
        try
        {
            var catalog   = new CatalogLookup(_opts.SqlConnectionString);
            var procLog   = _loggerFactory.CreateLogger("BatchProcessor");
            var watchLog  = _loggerFactory.CreateLogger("WatchLoop");

            var processor = new BatchProcessor(
                session, catalog, storage,
                _opts.Concepto, _opts.CsdPassword, procLog);
            var loop = new WatchLoop(processor, storage,
                TimeSpan.FromSeconds(_opts.PollSeconds), watchLog);

            await loop.RunAsync(stoppingToken);
        }
        finally
        {
            (storage as IDisposable)?.Dispose();
            _logger.LogInformation("[service] writer detenido, sesión cerrada");
        }
    }

    private static IInboxStorage BuildStorage(WriterServiceOptions.StorageOptions cfg) =>
        cfg.Backend.ToLowerInvariant() switch
        {
            "local"   => new LocalInboxStorage(cfg.InboxPath, cfg.OutboxPath),
            "dropbox" => new DropboxInboxStorage(cfg.DropboxToken, cfg.DropboxRoot),
            _         => throw new InvalidOperationException($"Backend inválido: {cfg.Backend}"),
        };
}
