export type CampoTipo =
  | 'string' | 'curp' | 'cp' | 'email' | 'telefono_mx' | 'fecha'
  | 'catalogo_pick' | 'catalogo_search' | 'consentimiento';

export interface Campo {
  key:               string;
  tipo:              CampoTipo;
  required:          boolean;
  orden:             number;
  catalogo?:         string;
  autocompleta_desde?: string;
  source?:           string;
  depende_de?:       string;
  prompt_captura?:   string;
}

export interface CatalogoItemFields {
  id:    string;
  label: string;
  extra?: string[];
}

export interface Catalogo {
  key:                  string;
  endpoint:             string;
  method:               'GET' | 'POST';
  query_param?:         string;
  min_query_length?:    number;
  response_items_path?: string;
  item_fields:          CatalogoItemFields;
}

export interface Lookup {
  key:               string;
  endpoint:          string;
  method:            'GET' | 'POST';
  query_param:       string;
  response_fields:   Record<string, string>;
  not_found_action:  'reject' | 'continue_manual';
}

export interface SubmitConfig {
  endpoint:                string;
  method:                  'POST' | 'PUT';
  response_folio_path:     string;
  response_success_status: number[];
}

export interface AuthConfig {
  type:        'bearer' | 'api_key_header' | 'oauth_client_credentials' | 'none';
  secret_key?: string;
  header_name?: string;
  token_endpoint?: string;
}

export interface ReglasNegocio {
  allow_manual_capture_on_padron_miss?: boolean;
  max_registros_por_sesion?:            number;
  ventana_atencion?:                    { desde: string; hasta: string; tz: string };
  idempotency_fields?:                  string[];
}

export interface Tramite {
  id:                     string;
  portal_email:           string;
  slug:                   string;
  nombre_publico:         string;
  descripcion_agente:     string;
  activo:                 boolean;
  schema_version:         number;
  endpoint_base:          string;
  auth_config:            AuthConfig;
  campos:                 Campo[];
  catalogos:              Catalogo[];
  lookups:                Lookup[];
  submit:                 SubmitConfig;
  reglas_negocio:         ReglasNegocio;
  aviso_privacidad_texto: string | null;
  aviso_privacidad_url:   string | null;
  created_at:             string;
  updated_at:             string;
}
