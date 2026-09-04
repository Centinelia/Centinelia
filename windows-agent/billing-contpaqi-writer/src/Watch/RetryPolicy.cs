using Centinelia.BillingContpaqi.Writer.Sdk;
using Microsoft.Extensions.Logging;

namespace Centinelia.BillingContpaqi.Writer.Watch;

/// <summary>
/// Retry helper para llamadas al PAC (fEmitirDocumento). El PAC puede fallar
/// por causas transient (timeout de red, contención) o permanentes (documento
/// ya timbrado, CSD inválido, RFC receptor rechazado por SAT).
///
/// Heurística conservadora: reintentamos solo <see cref="ContpaqiSdkException"/>
/// que provenga de <c>fEmitirDocumento</c>, hasta N intentos con backoff
/// exponencial. Cualquier otra excepción (InvalidData, InvalidOperation, IO)
/// se re-lanza sin intentar de nuevo — son bugs de datos, no del PAC.
///
/// Nota: sin un catálogo confiable de códigos de error transient vs permanentes
/// del PAC de CONTPAQi, retriamos todo lo que venga de <c>fEmitirDocumento</c>.
/// Es un trade-off: prevenimos falsos negativos por red inestable a costa de
/// pagar más tiempo cuando la causa es realmente permanente (max ~14s extra
/// con la config default).
/// </summary>
public static class RetryPolicy
{
    /// <summary>
    /// Reintenta <paramref name="action"/> hasta <paramref name="maxAttempts"/>
    /// veces, esperando 2^n segundos entre intentos (2s, 4s, 8s por default).
    /// Solo reintenta si la excepción es una <see cref="ContpaqiSdkException"/>
    /// del PAC.
    /// </summary>
    public static void Stamp(
        Action action,
        ILogger logger,
        string label,
        int maxAttempts = 3,
        int baseDelaySeconds = 2)
    {
        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            try
            {
                action();
                if (attempt > 1)
                {
                    logger.LogInformation("[retry] {label} tuvo éxito en intento {attempt}/{max}",
                        label, attempt, maxAttempts);
                }
                return;
            }
            catch (ContpaqiSdkException ex) when (IsTransient(ex) && attempt < maxAttempts)
            {
                var delay = TimeSpan.FromSeconds(Math.Pow(baseDelaySeconds, attempt));
                logger.LogWarning(
                    "[retry] {label} falló intento {attempt}/{max}: {func} código {code}: {msg}. Reintentando en {delay}s",
                    label, attempt, maxAttempts, ex.FunctionName, ex.ErrorCode, ex.Message, delay.TotalSeconds);
                Thread.Sleep(delay);
            }
        }
    }

    /// <summary>
    /// Considera "transient" cualquier error del SDK proveniente del timbrado.
    /// En el futuro podríamos afinar filtrando códigos específicos (ej: 402
    /// "documento ya timbrado" NO es transient), pero por ahora la política es
    /// conservadora: mejor pagar unos segundos que perder un timbre por red.
    /// </summary>
    private static bool IsTransient(ContpaqiSdkException ex) =>
        ex.FunctionName is "fEmitirDocumento";
}
