using System.Text.Json;

namespace Centinelia.BillingContpaqi.Writer.Service;

/// <summary>
/// Fields Windows-locales que el portal captura al momento de setup CONTPAQi
/// (0.11.0). Antes eran preguntas del FirstRunWizard CLI; ahora vienen listos
/// en el zip. Passwords vienen en plaintext (descifradas en el endpoint de
/// descarga single-shot), luego el writer las persiste a
/// <c>appsettings.local.json</c> local con ACLs restringidas.
/// </summary>
public sealed record CentineliaWindowsConfig(
    string SdkPath,
    string EmpresaPath,
    string Usuario,
    string Concepto,
    string SqlConnection,
    string Password,
    string CsdPassword)
{
    public static readonly CentineliaWindowsConfig Empty = new(
        SdkPath:       string.Empty,
        EmpresaPath:   string.Empty,
        Usuario:       string.Empty,
        Concepto:      string.Empty,
        SqlConnection: string.Empty,
        Password:      string.Empty,
        CsdPassword:   string.Empty);

    /// <summary>
    /// True si hay al menos empresa cargada (mínimo para arrancar sin wizard).
    /// SQL puede venir vacío — el auto-detect en Program.cs lo llena antes de
    /// entrar al bloque de auto-apply. Password + CSD pueden venir vacíos
    /// también en instalaciones default de CONTPAQi (SUPERVISOR sin password
    /// es común).
    /// </summary>
    public bool IsMinimalComplete =>
        !string.IsNullOrWhiteSpace(EmpresaPath);
}

/// <summary>
/// Config que el portal Centinelia inyecta en el zip del writer al momento de
/// descarga (endpoint <c>/api/portal/[token]/writer-download</c>). Vive en
/// <c>centinelia-config.json</c> junto al EXE.
///
/// Desde 0.11.0 incluye <see cref="Windows"/> con los datos que antes preguntaba
/// el FirstRunWizard CLI (empresa, SQL, SUPERVISOR, CSD, etc.). Si vienen todos,
/// el writer se auto-configura sin preguntar nada al usuario.
///
/// Cargar con <see cref="TryLoad"/>. Retorna null si el archivo no existe o
/// no parsea (arranque sin zip pre-configurado, ej. instalación manual).
/// </summary>
public sealed record CentineliaConfig(
    string Endpoint,
    string ApiToken,
    string PortalEmail,
    string DropboxBasePath,
    string? Version,
    CentineliaWindowsConfig Windows)
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
        Version:         null,
        Windows:         CentineliaWindowsConfig.Empty);

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

            string GetStr(JsonElement el, string key, string fallback = "") =>
                el.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String
                    ? v.GetString() ?? fallback : fallback;

            var endpoint = GetStr(root, "endpoint");
            var apiToken = GetStr(root, "api_token");
            var portal   = GetStr(root, "portal_email");
            var basePath = GetStr(root, "dropbox_base_path", "/Facturacion");
            var version  = GetStr(root, "version");

            if (string.IsNullOrWhiteSpace(endpoint) ||
                string.IsNullOrWhiteSpace(apiToken) ||
                string.IsNullOrWhiteSpace(portal))
                return null;

            var windows = CentineliaWindowsConfig.Empty;
            if (root.TryGetProperty("windows", out var w) && w.ValueKind == JsonValueKind.Object)
            {
                windows = new CentineliaWindowsConfig(
                    SdkPath:       GetStr(w, "sdk_path"),
                    EmpresaPath:   GetStr(w, "empresa_path"),
                    Usuario:       GetStr(w, "usuario"),
                    Concepto:      GetStr(w, "concepto"),
                    SqlConnection: GetStr(w, "sql_connection"),
                    Password:      GetStr(w, "password"),
                    CsdPassword:   GetStr(w, "csd_password"));
            }

            return new CentineliaConfig(
                Endpoint:        endpoint.TrimEnd('/'),
                ApiToken:        apiToken,
                PortalEmail:     portal,
                DropboxBasePath: basePath,
                Version:         string.IsNullOrWhiteSpace(version) ? null : version,
                Windows:         windows);
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
