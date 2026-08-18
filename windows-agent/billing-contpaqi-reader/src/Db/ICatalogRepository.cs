using BillingContpaqiReader.Db.Models;

namespace BillingContpaqiReader.Db;

public interface ICatalogRepository
{
    Task<IEnumerable<ContpaqiClient>> GetClientsAsync();
    Task<IEnumerable<ContpaqiProduct>> GetProductsAsync();
}
