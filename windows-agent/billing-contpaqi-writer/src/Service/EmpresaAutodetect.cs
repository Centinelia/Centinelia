namespace Centinelia.BillingContpaqi.Writer.Service;

/// <summary>
/// Descubre la ruta de la empresa CONTPAQi sin que la clienta tenga que abrir
/// CONTPAQi UI a copiar el path. Escanea las rutas convencionales donde el
/// instalador de CONTPAQi Comercial pone los folders de empresa (empiezan con
/// "ad" en convención estándar).
///
/// Regla de ambigüedad:
///   - 1 empresa encontrada → usar esa.
///   - N empresas encontradas → devolver la lista, el caller decide (listar
///     opciones y pedirle a la clienta que edite en el portal).
///   - 0 empresas → devolver lista vacía.
/// </summary>
public static class EmpresaAutodetect
{
    /// <summary>Ubicaciones estándar donde CONTPAQi crea empresas.</summary>
    private static readonly string[] CandidateRoots = new[]
    {
        @"C:\Compac\Empresas",
        @"D:\Compac\Empresas",
        @"E:\Compac\Empresas",
    };

    public static IReadOnlyList<string> Detect()
    {
        var results = new List<string>();
        foreach (var root in CandidateRoots)
        {
            if (!Directory.Exists(root)) continue;
            try
            {
                foreach (var dir in Directory.GetDirectories(root))
                {
                    var name = Path.GetFileName(dir);
                    if (name.StartsWith("ad", StringComparison.OrdinalIgnoreCase))
                    {
                        results.Add(dir);
                    }
                }
            }
            catch (UnauthorizedAccessException) { /* skip drive */ }
            catch (IOException) { /* skip drive */ }
        }
        return results;
    }
}
