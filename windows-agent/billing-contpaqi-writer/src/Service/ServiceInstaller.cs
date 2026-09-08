using System.Diagnostics;

namespace Centinelia.BillingContpaqi.Writer.Service;

/// <summary>
/// Registra el writer como Windows Service después de que el FirstRunWizard
/// termina, sin que Beatriz tenga que abrir PowerShell ni teclear comandos.
///
/// Flow:
///   1. Wizard corriendo unelevated pregunta "¿arrancar con Windows?".
///   2. Si sí, <see cref="RelaunchElevated"/> hace Process.Start con Verb=runas.
///      Windows muestra prompt UAC; Beatriz da OK.
///   3. El proceso elevado entra por <see cref="InstallAndStart"/> (main
///      dispatch detecta el flag <c>--install-service</c>).
///   4. Elevated: sc stop / delete / create / start + config de recovery.
///   5. Elevated exit 0 → unelevated informa "listo" y cierra ventana.
/// </summary>
public static class ServiceInstaller
{
    public const string ServiceName        = "Centinelia.BillingWriter";
    public const string ServiceDisplayName = "Centinelia Billing Writer";
    public const string ServiceDescription =
        "Procesa XMLs de importación depositados por Nala y timbra CFDIs contra CONTPAQi Comercial vía el SDK nativo.";

    /// <summary>
    /// Se relanza a sí mismo elevado (UAC) pasando <c>--install-service</c>.
    /// Devuelve true si el proceso elevado terminó con exit code 0.
    /// </summary>
    public static bool RelaunchElevated(string exePath)
    {
        var psi = new ProcessStartInfo
        {
            FileName        = exePath,
            Arguments       = "--install-service",
            UseShellExecute = true,   // requerido para Verb=runas
            Verb            = "runas",
        };
        try
        {
            using var proc = Process.Start(psi);
            if (proc is null) return false;
            proc.WaitForExit();
            return proc.ExitCode == 0;
        }
        catch (System.ComponentModel.Win32Exception)
        {
            // UAC denegado por el usuario, o Windows sin UAC configurable.
            return false;
        }
    }

    /// <summary>
    /// Corre en el proceso elevado. Idempotente: si el servicio ya existe,
    /// lo re-crea (útil para upgrades donde cambió binPath).
    /// </summary>
    public static int InstallAndStart()
    {
        var exePath = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(exePath) || !File.Exists(exePath))
        {
            Console.Error.WriteLine("[install-service] No se pudo determinar la ruta del EXE.");
            return 10;
        }

        Console.WriteLine($"[install-service] EXE: {exePath}");
        Console.WriteLine($"[install-service] Servicio: {ServiceName}");
        Console.WriteLine();

        // Best-effort stop + delete de instalación previa (upgrades).
        RunSc(new[] { "stop",   ServiceName }, allowFailure: true);
        RunSc(new[] { "delete", ServiceName }, allowFailure: true);

        // sc.exe usa sintaxis rara: `binPath=` es UN token, el valor es el
        // siguiente token. ArgumentList maneja el quoting automático para
        // paths con espacios (Program Files, etc.).
        //
        // Sin `--mode service`: el default del EXE ya es "service" desde
        // 0.10.6, así que sc puede lanzarlo desnudo.
        var create = RunSc(new[]
        {
            "create", ServiceName,
            "binPath=",     exePath,
            "start=",       "auto",
            "DisplayName=", ServiceDisplayName,
        });
        if (!create)
        {
            Console.Error.WriteLine("[install-service] sc create falló.");
            return 11;
        }

        RunSc(new[] { "description", ServiceName, ServiceDescription }, allowFailure: true);

        // Recovery: 3 retries con backoff. Después del 4to fallo, escribe al
        // EventLog para que un monitor externo detecte el fatal.
        RunSc(new[]
        {
            "failure", ServiceName,
            "reset=",   "3600",
            "actions=", "restart/10000/restart/30000/restart/60000/run/60000",
        }, allowFailure: true);
        RunSc(new[] { "failureflag", ServiceName, "1" }, allowFailure: true);

        Console.WriteLine("[install-service] Arrancando servicio...");
        if (!RunSc(new[] { "start", ServiceName }))
        {
            Console.Error.WriteLine("[install-service] sc start falló. El servicio quedó registrado pero no arrancó.");
            Console.Error.WriteLine("[install-service] Revisa el EventLog o corre `sc start Centinelia.BillingWriter` manualmente.");
            return 12;
        }

        Console.WriteLine();
        Console.WriteLine("[install-service] OK — servicio registrado y arrancado.");
        return 0;
    }

    private static bool RunSc(string[] args, bool allowFailure = false)
    {
        var psi = new ProcessStartInfo("sc.exe")
        {
            UseShellExecute        = false,
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
            CreateNoWindow         = true,
        };
        foreach (var a in args) psi.ArgumentList.Add(a);

        try
        {
            using var proc = Process.Start(psi);
            if (proc is null) return false;
            var stdout = proc.StandardOutput.ReadToEnd();
            var stderr = proc.StandardError.ReadToEnd();
            proc.WaitForExit();
            var ok = proc.ExitCode == 0;
            if (!ok && !allowFailure)
            {
                Console.Error.WriteLine($"[install-service] sc {string.Join(' ', args)} → exit {proc.ExitCode}");
                if (!string.IsNullOrWhiteSpace(stdout)) Console.Error.WriteLine(stdout.Trim());
                if (!string.IsNullOrWhiteSpace(stderr)) Console.Error.WriteLine(stderr.Trim());
            }
            return ok;
        }
        catch (Exception ex) when (allowFailure)
        {
            Console.Error.WriteLine($"[install-service] sc falló (ignorando): {ex.Message}");
            return false;
        }
    }
}
