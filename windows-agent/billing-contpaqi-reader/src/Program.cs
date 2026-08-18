using BillingContpaqiReader.Config;

var configPath = args.Length > 0 ? args[0] : "appsettings.json";
var config = AppConfig.Load(configPath);
System.Console.WriteLine($"Billing CONTPAQi Reader v{config.AgentVersion} started. Provider: {config.DbProvider}");
