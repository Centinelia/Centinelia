using BillingContpaqiReader.Config;

namespace BillingContpaqiReader.Db;

public static class DbFactory
{
    public static ICatalogRepository Create(AppConfig config) =>
        config.DbProvider switch
        {
            "firebird"  => new FirebirdCatalogRepository(config.DbConnectionString),
            "sqlserver" => new SqlServerCatalogRepository(config.DbConnectionString),
            var unknown => throw new ArgumentException(
                $"Unknown DbProvider '{unknown}'. Valid values: firebird, sqlserver.")
        };
}
