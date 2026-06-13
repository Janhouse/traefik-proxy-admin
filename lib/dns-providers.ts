/* Curated catalog of common Traefik/lego DNS-challenge providers and the
 * environment variables each one needs, so the UI can show the right fields
 * once a provider is picked instead of making users memorise var names.
 * Not exhaustive — lego supports ~150 providers; anything missing is handled
 * by the "Other (custom)" path + the advanced credential editor. Env var
 * names follow go-acme/lego (https://go-acme.github.io/lego/dns/). */

export interface DnsProviderField {
  env: string; // exact lego environment variable name
  label: string;
  required: boolean;
}

export interface DnsProvider {
  code: string; // lego provider code → dnsChallenge.provider
  name: string; // display name
  fields: DnsProviderField[];
}

export const DNS_PROVIDERS: DnsProvider[] = [
  {
    code: "route53",
    name: "AWS Route 53",
    fields: [
      { env: "AWS_ACCESS_KEY_ID", label: "Access key ID", required: true },
      { env: "AWS_SECRET_ACCESS_KEY", label: "Secret access key", required: true },
      { env: "AWS_REGION", label: "Region", required: false },
      { env: "AWS_HOSTED_ZONE_ID", label: "Hosted zone ID", required: false },
    ],
  },
  {
    code: "azuredns",
    name: "Azure DNS",
    fields: [
      { env: "AZURE_CLIENT_ID", label: "Client ID", required: true },
      { env: "AZURE_CLIENT_SECRET", label: "Client secret", required: true },
      { env: "AZURE_TENANT_ID", label: "Tenant ID", required: true },
      { env: "AZURE_SUBSCRIPTION_ID", label: "Subscription ID", required: false },
      { env: "AZURE_RESOURCE_GROUP", label: "Resource group", required: false },
    ],
  },
  {
    code: "cloudflare",
    name: "Cloudflare",
    fields: [
      { env: "CF_DNS_API_TOKEN", label: "API token", required: true },
      { env: "CF_ZONE_API_TOKEN", label: "Zone API token (if scoped separately)", required: false },
    ],
  },
  {
    code: "cloudns",
    name: "ClouDNS",
    fields: [
      { env: "CLOUDNS_AUTH_ID", label: "Auth ID", required: true },
      { env: "CLOUDNS_AUTH_PASSWORD", label: "Auth password", required: true },
    ],
  },
  {
    code: "desec",
    name: "deSEC",
    fields: [{ env: "DESEC_TOKEN", label: "API token", required: true }],
  },
  {
    code: "digitalocean",
    name: "DigitalOcean",
    fields: [{ env: "DO_AUTH_TOKEN", label: "API token", required: true }],
  },
  {
    code: "dnsimple",
    name: "DNSimple",
    fields: [{ env: "DNSIMPLE_OAUTH_TOKEN", label: "OAuth token", required: true }],
  },
  {
    code: "duckdns",
    name: "DuckDNS",
    fields: [{ env: "DUCKDNS_TOKEN", label: "Token", required: true }],
  },
  {
    code: "gandiv5",
    name: "Gandi Live DNS (v5)",
    fields: [
      { env: "GANDIV5_PERSONAL_ACCESS_TOKEN", label: "Personal access token", required: true },
    ],
  },
  {
    code: "gcloud",
    name: "Google Cloud DNS",
    fields: [
      { env: "GCE_PROJECT", label: "GCP project ID", required: true },
      { env: "GCE_SERVICE_ACCOUNT_FILE", label: "Service-account JSON path", required: true },
    ],
  },
  {
    code: "godaddy",
    name: "GoDaddy",
    fields: [
      { env: "GODADDY_API_KEY", label: "API key", required: true },
      { env: "GODADDY_API_SECRET", label: "API secret", required: true },
    ],
  },
  {
    code: "hetzner",
    name: "Hetzner",
    fields: [{ env: "HETZNER_API_KEY", label: "API key", required: true }],
  },
  {
    code: "ionos",
    name: "IONOS",
    fields: [{ env: "IONOS_API_KEY", label: "API key", required: true }],
  },
  {
    code: "linode",
    name: "Linode (v4)",
    fields: [{ env: "LINODE_TOKEN", label: "API token", required: true }],
  },
  {
    code: "namecheap",
    name: "Namecheap",
    fields: [
      { env: "NAMECHEAP_API_USER", label: "API user", required: true },
      { env: "NAMECHEAP_API_KEY", label: "API key", required: true },
    ],
  },
  {
    code: "njalla",
    name: "Njalla",
    fields: [{ env: "NJALLA_TOKEN", label: "API token", required: true }],
  },
  {
    code: "ovh",
    name: "OVH",
    fields: [
      { env: "OVH_ENDPOINT", label: "Endpoint (e.g. ovh-eu)", required: true },
      { env: "OVH_APPLICATION_KEY", label: "Application key", required: true },
      { env: "OVH_APPLICATION_SECRET", label: "Application secret", required: true },
      { env: "OVH_CONSUMER_KEY", label: "Consumer key", required: true },
    ],
  },
  {
    code: "porkbun",
    name: "Porkbun",
    fields: [
      { env: "PORKBUN_API_KEY", label: "API key", required: true },
      { env: "PORKBUN_SECRET_API_KEY", label: "Secret API key", required: true },
    ],
  },
  {
    code: "powerdns",
    name: "PowerDNS",
    fields: [
      { env: "PDNS_API_KEY", label: "API key", required: true },
      { env: "PDNS_API_URL", label: "API URL", required: true },
    ],
  },
  {
    code: "vultr",
    name: "Vultr",
    fields: [{ env: "VULTR_API_KEY", label: "API key", required: true }],
  },
];

export function findDnsProvider(code: string | undefined): DnsProvider | undefined {
  if (!code) return undefined;
  return DNS_PROVIDERS.find((p) => p.code === code);
}
