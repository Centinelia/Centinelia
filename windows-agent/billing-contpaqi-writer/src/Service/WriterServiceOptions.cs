namespace Centinelia.BillingContpaqi.Writer.Service;

/// <summary>
/// Configuración del writer cuando corre en <c>--mode service</c> (Windows
/// Service). Se puebla desde <c>appsettings.json</c> + variables de entorno
/// con prefijo <c>CENTINELIA_</c> (ej. <c>CENTINELIA_Storage__DropboxToken</c>).
///
/// Precedencia (de mayor a menor):
///   1. Variables de entorno CENTINELIA_*
///   2. appsettings.{Environment}.json (si existe)
///   3. appsettings.json
///
/// El CLI legacy (<c>--mode watch</c> con flags) sigue disponible para dev
/// y smoke tests; sólo <c>--mode service</c> lee desde configuración.
/// </summary>
public sealed class WriterServiceOptions
{
    public const string SectionName = "Writer";

    /// <summary>Ruta absoluta al folder que contiene MGWServicios.dll.</summary>
    public string SdkPath { get; set; } = @"C:\Program Files (x86)\Compac\COMERCIAL";

    /// <summary>Ruta absoluta al folder de la empresa CONTPAQi abierta.</summary>
    public string EmpresaPath { get; set; } = "";

    public string Usuario  { get; set; } = "SUPERVISOR";
    public string Password { get; set; } = "";

    /// <summary>Código interno del concepto CONTPAQi (ej. "440").</summary>
    public string Concepto    { get; set; } = "";
    /// <summary>Password del CSD cargado en CONTPAQi.</summary>
    public string CsdPassword { get; set; } = "";

    /// <summary>Connection string a la BD CONTPAQi (SQL Server).</summary>
    public string SqlConnectionString { get; set; } = "";

    /// <summary>Intervalo del bucle de polling en segundos.</summary>
    public int PollSeconds { get; set; } = 10;

    public StorageOptions Storage { get; set; } = new();

    public sealed class StorageOptions
    {
        /// <summary>"local" o "dropbox".</summary>
        public string Backend { get; set; } = "local";

        // Backend local
        public string InboxPath  { get; set; } = "";
        public string OutboxPath { get; set; } = "";

        // Backend dropbox
        public string DropboxToken { get; set; } = "";
        public string DropboxRoot  { get; set; } = "";
    }

    /// <summary>Valida la config crítica al arranque; falla ruidosa si falta algo.</summary>
    public void Validate()
    {
        if (string.IsNullOrWhiteSpace(EmpresaPath))
            throw new InvalidOperationException("Writer:EmpresaPath es requerido");
        if (string.IsNullOrWhiteSpace(Concepto))
            throw new InvalidOperationException("Writer:Concepto es requerido (código interno CONTPAQi, ej. '440')");
        if (string.IsNullOrWhiteSpace(SqlConnectionString))
            throw new InvalidOperationException("Writer:SqlConnectionString es requerido");
        if (PollSeconds < 1)
            throw new InvalidOperationException("Writer:PollSeconds debe ser >= 1");

        switch (Storage.Backend.ToLowerInvariant())
        {
            case "local":
                if (string.IsNullOrWhiteSpace(Storage.InboxPath))
                    throw new InvalidOperationException("Writer:Storage:InboxPath es requerido con Backend=local");
                if (string.IsNullOrWhiteSpace(Storage.OutboxPath))
                    throw new InvalidOperationException("Writer:Storage:OutboxPath es requerido con Backend=local");
                break;

            case "dropbox":
                if (string.IsNullOrWhiteSpace(Storage.DropboxToken))
                    throw new InvalidOperationException("Writer:Storage:DropboxToken es requerido con Backend=dropbox");
                if (string.IsNullOrWhiteSpace(Storage.DropboxRoot))
                    throw new InvalidOperationException("Writer:Storage:DropboxRoot es requerido con Backend=dropbox");
                break;

            default:
                throw new InvalidOperationException(
                    $"Writer:Storage:Backend '{Storage.Backend}' inválido. Valores: local | dropbox");
        }
    }
}
