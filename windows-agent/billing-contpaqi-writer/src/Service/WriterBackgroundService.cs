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
///
/// Auto-recovery (auditoría 2026-09-04): si el WatchLoop tira una excepción
/// no clasificable como error de UNA factura (ej. sesión CONTPAQi zombi
/// porque SQL Server reinició, o excepciones del SDK que no cuadran con
/// ninguna categoría del ErrorClassifier), el servicio se sale con exit
/// code 1. SCM lo restart (recovery config: retry 3× con backoff 10s/30s/60s)
/// y la nueva instancia abre sesión limpia contra CONTPAQi + SQL.
///
/// También hace smoke check al arranque: llama fSetNombrePAQ + fAbreEmpresa
/// dentro de un try/catch tolerante para detectar login fallido de SUPERVISOR
/// vs empresa no accesible vs SDK no licenciado, y loguear mensajes claros.
/// </summary>
public sealed class WriterBackgroundService : BackgroundService
{
    private readonly WriterServiceOptions _opts;
    private readonly ILoggerFactory _loggerFactory;
    private readonly ILogger<WriterBackgroundService> _logger;
    private readonly IHostApplicationLifetime _lifetime;
    private readonly CentineliaConfig _centineliaConfig;

    public WriterBackgroundService(
        IOptions<WriterServiceOptions> opts,
        ILoggerFactory loggerFactory,
        ILogger<WriterBackgroundService> logger,
        IHostApplicationLifetime lifetime,
        CentineliaConfig centineliaConfig)
    {
        _opts             = opts.Value;
        _loggerFactory    = loggerFactory;
        _logger           = logger;
        _lifetime         = lifetime;
        _centineliaConfig = centineliaConfig;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Fetch de token Dropbox via API Centinelia ANTES de Validate para que
        // Storage.DropboxToken quede poblado y no truene la validación. Si
        // falta el centinelia-config.json, se asume que el token viene en
        // appsettings (backwards compat con instalaciones manuales).
        if (_opts.Storage.Backend.Equals("dropbox", StringComparison.OrdinalIgnoreCase)
            && string.IsNullOrWhiteSpace(_opts.Storage.DropboxToken)
            && !_centineliaConfig.IsEmpty)
        {
            try
            {
                using var fetcher = new DropboxTokenFetcher(
                    _centineliaConfig.Endpoint,
                    _centineliaConfig.ApiToken,
                    _loggerFactory.CreateLogger<DropboxTokenFetcher>());
                var tok = await fetcher.FetchAsync(stoppingToken);
                _opts.Storage.DropboxToken = tok.access_token;
                if (string.IsNullOrWhiteSpace(_opts.Storage.DropboxRoot))
                    _opts.Storage.DropboxRoot = tok.dropbox_base_path;
                _logger.LogInformation("[service] token Dropbox obtenido via API, expira {expires}", tok.expires_at);
            }
            catch (Exception ex)
            {
                // Antes: Environment.ExitCode=1 + StopApplication → SCM restart
                // inmediato → mismo fallo → restart loop infinito, sin trace
                // visible fuera de Event Viewer del SCM.
                // Ahora: log CRITICAL con detalle + intentar continuar con
                // token vacío. Si el token DE VERDAD es requerido, el primer
                // write a Dropbox arrojará 401 legible en Event Log; si no
                // se necesita hasta más tarde (ej. no hay pendings), el
                // servicio sigue vivo y el próximo restart programado
                // reintenta el fetch cuando la red vuelva.
                _logger.LogCritical(ex,
                    "[service] no se pudo obtener token Dropbox al arranque: {msg}. " +
                    "Continuo sin token; el primer write a Dropbox va a fallar hasta " +
                    "que se resuelva conectividad o api_token. Revisa /portal/oficina/integraciones.",
                    ex.Message);
                // No StopApplication — dejamos que el servicio quede vivo con
                // token vacío. La sesión CONTPAQi sí abre; el WatchLoop hace
                // idle-loops hasta que el token esté disponible.
            }
        }

        _opts.Validate();
        _logger.LogInformation("[service] arrancando writer contra empresa {empresa} concepto={concepto} storage={backend}",
            _opts.EmpresaPath, _opts.Concepto, _opts.Storage.Backend);

        // Sesión CONTPAQi vive durante toda la vida del servicio. Si falla,
        // Environment.Exit(1) al final del catch abajo → SCM restart limpio.
        ContpaqiSession? session = null;
        try
        {
            session = ContpaqiSession.Open(
                _opts.SdkPath, _opts.Usuario, _opts.Password, _opts.EmpresaPath);
            _logger.LogInformation("[service] sesión CONTPAQi + empresa abiertas OK");
        }
        catch (ContpaqiSdkException sdkEx)
        {
            _logger.LogCritical(
                "[service] fallo al abrir sesión CONTPAQi ({func}, código {code}): {msg}. " +
                "Verifica: (a) usuario/password SUPERVISOR, (b) NOMBRESERVIDOR en registro apunta al SQL correcto, " +
                "(c) empresa en la ruta configurada existe y tiene CSD cargado, (d) SDK licenciado en esta máquina. " +
                "Saliendo con exit 1 para que SCM reintente.",
                sdkEx.FunctionName, sdkEx.ErrorCode, sdkEx.Message);
            Environment.ExitCode = 1;
            _lifetime.StopApplication();
            return;
        }
        catch (Exception ex)
        {
            _logger.LogCritical(ex, "[service] excepción inesperada abriendo sesión, saliendo con exit 1");
            Environment.ExitCode = 1;
            _lifetime.StopApplication();
            return;
        }

        IInboxStorage? storage = null;
        try
        {
            storage = BuildStorage(_opts.Storage);
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
        catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
        {
            // Excepción inesperada del loop (SQL Server reinició, empresa
            // se cerró desde otra sesión, etc). Salir con exit 1 → SCM
            // restart. Auditoría 2026-09-04.
            _logger.LogCritical(ex, "[service] WatchLoop lanzó excepción no recuperable, saliendo con exit 1 para SCM restart");
            Environment.ExitCode = 1;
            _lifetime.StopApplication();
        }
        finally
        {
            (storage as IDisposable)?.Dispose();
            session?.Dispose();
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
