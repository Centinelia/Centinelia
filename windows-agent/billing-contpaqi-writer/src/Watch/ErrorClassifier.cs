using Centinelia.BillingContpaqi.Writer.Sdk;
using Microsoft.Data.SqlClient;

namespace Centinelia.BillingContpaqi.Writer.Watch;

/// <summary>
/// Categorización de errores que puede sufrir el procesamiento de una factura.
/// Nala (Vercel) consume este <see cref="ErrorKind"/> en el reporte JSON para
/// decidir qué acción tomar:
///   - <see cref="RfcNotFound"/> / <see cref="SkuNotFound"/>: responder al cliente
///     pidiendo aclaración vía <c>reply_email</c>.
///   - <see cref="InvalidData"/>: bug de Nala, escalar a Nazre.
///   - <see cref="PacError"/>: reintentar depositando el mismo XML en pendientes/
///     tras unos minutos (el content-hash lo hace idempotente).
///   - <see cref="CatalogAccess"/>: alertar al operador Centinelia — SQL/CONTPAQi
///     está inaccesible.
///   - <see cref="Other"/>: revisar log del writer.
/// </summary>
public enum ErrorKind
{
    Other = 0,
    RfcNotFound,
    SkuNotFound,
    InvalidData,
    PacError,
    CatalogAccess,
}

/// <summary>
/// Traduce excepciones a un <see cref="ErrorKind"/> + mensaje en español
/// dirigido al operador Centinelia (Nala lo traduce a lenguaje de cliente
/// según contexto).
/// </summary>
public static class ErrorClassifier
{
    public static (ErrorKind Kind, string HumanMessage) Classify(Exception ex)
    {
        // Mensajes de Nala/writer sobre RFC o SKU inexistentes vienen como
        // InvalidOperationException con texto conocido.
        if (ex is InvalidOperationException)
        {
            var msg = ex.Message;
            if (msg.Contains("no existe en admClientes", StringComparison.OrdinalIgnoreCase))
            {
                return (ErrorKind.RfcNotFound,
                    "El RFC del cliente no está en el catálogo de CONTPAQi. Dálo de alta con los datos fiscales completos y reintenta la factura.");
            }
        }

        // FindProducto / FindCliente del SDK devuelve error cuando el código
        // no existe (fBuscaProducto/fBuscaCteProv).
        if (ex is ContpaqiSdkException sdk)
        {
            if (sdk.FunctionName is "fBuscaProducto")
            {
                return (ErrorKind.SkuNotFound,
                    "El código de producto no existe en el catálogo de CONTPAQi. Verifica el SKU o da de alta el producto y reintenta.");
            }
            if (sdk.FunctionName is "fBuscaCteProv")
            {
                // Rara vez llega aquí porque hacemos FindClientCodeByRfc primero,
                // pero podría darse si el catálogo cambió entre SQL lookup y SDK call.
                return (ErrorKind.RfcNotFound,
                    "El cliente localizado por RFC ya no está accesible en CONTPAQi (posible eliminación concurrente). Reintenta.");
            }
            if (sdk.FunctionName is "fEmitirDocumento")
            {
                return (ErrorKind.PacError,
                    $"El PAC no pudo timbrar tras {3} intentos (código {sdk.ErrorCode}). Puede ser red, PAC caído o CSD vencido. Reintenta más tarde o revisa el CSD en CONTPAQi.");
            }
            // Cualquier otra falla del SDK — bucket "other" con detalle técnico.
            return (ErrorKind.Other,
                $"Error del SDK CONTPAQi en {sdk.FunctionName} (código {sdk.ErrorCode}): {sdk.Message}");
        }

        if (ex is InvalidDataException)
        {
            return (ErrorKind.InvalidData,
                "El XML de importación no cumple el schema esperado. Reporta a Nazre, probablemente hay un bug en el generador de Nala.");
        }

        if (ex is SqlException sqlEx)
        {
            return (ErrorKind.CatalogAccess,
                $"No puedo consultar la BD CONTPAQi (SQL error {sqlEx.Number}): {sqlEx.Message}. Verifica que SQL Server esté corriendo y accesible.");
        }

        if (ex is FormatException)
        {
            return (ErrorKind.InvalidData,
                $"Formato de dato inválido en la factura: {ex.Message}. Revisa la fecha o los números.");
        }

        return (ErrorKind.Other, $"{ex.GetType().Name}: {ex.Message}");
    }
}
