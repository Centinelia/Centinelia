namespace BillingContpaqiReader.Db.Models;

public record ContpaqiClient(
    string Rfc,
    string AdapterClientId,
    string RazonSocial,
    string UsoCfdi,
    string RegimenFiscal,
    string CodigoPostal,
    string Email,
    string Telefono);
