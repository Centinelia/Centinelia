namespace Centinelia.BillingContpaqi.Writer.Watch.Storage;

/// <summary>
/// Abstracción del backend de storage donde Nala deposita los XMLs de
/// importación (inbox) y el writer publica los CFDIs timbrados + reportes
/// de error (outbox). Existen 2 implementaciones concretas:
///
///   - <see cref="LocalInboxStorage"/>: filesystem local. Útil para dev/testing.
///   - <see cref="DropboxInboxStorage"/>: Dropbox App via <c>Dropbox.Api</c>.
///     Es el modo de producción cuando el cliente tiene su App autorizada.
///
/// La interfaz oculta la diferencia entre `Path.Combine` (local) y
/// las rutas estilo Unix con leading slash (Dropbox). Los subdirectorios
/// bajo el outbox (<c>timbrados/</c>, <c>procesados/</c>, <c>errores/</c>)
/// se manejan como strings simples, no rutas.
/// </summary>
public interface IInboxStorage
{
    /// <summary>Nombres de los archivos .xml pendientes en el inbox, ordenados por creación asc.</summary>
    Task<IReadOnlyList<string>> ListInboxAsync(CancellationToken ct);

    /// <summary>Lee el contenido de un archivo del inbox como texto UTF-8.</summary>
    Task<string> ReadInboxTextAsync(string filename, CancellationToken ct);

    /// <summary>Escribe un archivo nuevo bajo <paramref name="outboxSubdir"/> del outbox (crea el subdir si no existe).</summary>
    Task WriteOutboxTextAsync(string outboxSubdir, string filename, string content, CancellationToken ct);

    /// <summary>
    /// Mueve un archivo del inbox al subdir indicado del outbox. Sobrescribe
    /// silenciosamente si ya existía uno con el mismo nombre en el destino
    /// (idempotencia por content-hash está del lado de Nala).
    /// </summary>
    Task MoveToOutboxAsync(string outboxSubdir, string filename, CancellationToken ct);
}
