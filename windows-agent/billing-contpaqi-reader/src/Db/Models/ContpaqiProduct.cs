namespace BillingContpaqiReader.Db.Models;

public record ContpaqiProduct(
    string Sku,
    string Nombre,
    string Unidad,
    decimal Precio,
    string ClaveSat,
    decimal IvaTasa);
