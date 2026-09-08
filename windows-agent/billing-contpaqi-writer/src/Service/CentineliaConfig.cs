using System.Text.Json;

namespace Centinelia.BillingContpaqi.Writer.Service;

/// <summary>
/// Config que el portal Centinelia inyecta en el zip del writer al momento de
/// descarga (endpoint <c>/api/portal/[token]/writer-download</c>). Vive en
/// <c>centinelia-config.json</c> junto al EXE.
///
/// Contiene la parte que identifica a la organización contra Centinelia
/// (endpoint + api_token + portal_email) y el path base de Dropbox donde
/// leer/escribir. NO contiene credenciales de CONTPAQi ni SQL — esas las
/// captura el wizard local en el primer arranque.
///
/// Cargar con <see cref="TryLoad"/>. Retorna null si el archivo no existe o
/// no parsea (arranque sin zip pre-configurado, ej. instalación manual).
/// </summary>
public sealed record CentineliaConfig(
    string Endpoint,
    string ApiToken,
    string PortalEmail,
    string DropboxBasePath,
    string? Version)
{
    public const string FileName = "centinelia-config.json";

    /// <summary>
    /// Sentinel usado cuando el zip no venía pre-configurado. Endpoint vacío
    /// indica al BackgroundService que no debe intentar fetch de token
    /// Dropbox via API — el token debe venir en appsettings.
    /// </summary>
    public static readonly CentineliaConfig Empty = new(
        Endpoint:        string.Empty,
        ApiToken:        string.Empty,
        PortalEmail:     string.Empty,
        DropboxBasePath: string.Empty,
        Version:         null);

    /// <summary>True si esta instancia es el sentinel Empty (no vino zip).</summary>
    public bool IsEmpty => string.IsNullOrEmpty(Endpoint);

    public static CentineliaConfig? TryLoad(string baseDir)
    {
        var path = Path.Combine(baseDir, FileName);
        if (!File.Exists(path)) return null;

        try
        {
            using var stream = File.OpenRead(path);
            using var doc    = JsonDocument.Parse(stream);
            var root         = doc.RootElement;

            string GetStr(string key, string fallback = "") =>
                root.TryGetProperty(key, out var el) && el.ValueKind == JsonValueKind.String
                    ? el.GetString() ?? fallback : fallback;

            var endpoint = GetStr("endpoint");
            var apiToken = GetStr("api_token");
            var portal   = GetStr("portal_email");
            var basePath = GetStr("dropbox_base_path", "/Facturacion");
            var version  = GetStr("version");

            if (string.IsNullOrWhiteSpace(endpoint) ||
                string.IsNullOrWhiteSpace(apiToken) ||
                string.IsNullOrWhiteSpace(portal))
                return null;

            return new CentineliaConfig(
                Endpoint:        endpoint.TrimEnd('/'),
                ApiToken:        apiToken,
                PortalEmail:     portal,
                DropboxBasePath: basePath,
                Version:         string.IsNullOrWhiteSpace(version) ? null : version);
        }
        catch (JsonException)
        {
            return null;
        }
        catch (IOException)
        {
            return null;
        }
    }
}
