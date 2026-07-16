const ML_API = 'https://api.mercadolibre.com';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MLItem {
  id:          string;
  title:       string;
  price:       number;
  currency_id: string;
  available_quantity: number;
  sold_quantity: number;
  status:      'active' | 'paused' | 'closed' | 'under_review';
  permalink:   string;
  thumbnail:   string;
  category_id: string;
}

export interface MLCreateItemInput {
  title:              string;
  category_id:        string;
  price:              number;
  currency_id?:       string;
  available_quantity: number;
  buying_mode?:       string;
  condition?:         'new' | 'used';
  listing_type_id?:   string;
  description?:       string;
  pictures?:          { source: string }[];
  attributes?:        { id: string; value_name: string }[];
}

export interface MLQuestion {
  id:         number;
  text:       string;
  status:     'unanswered' | 'answered' | 'closed_unanswered' | 'under_review';
  date_created: string;
  item_id:    string;
  from:       { id: number };
  answer:     { text: string; date_created: string } | null;
}

export interface MLOrder {
  id:          number;
  status:      string;
  date_created: string;
  buyer:       { id: number; nickname: string };
  total_amount: number;
  currency_id:  string;
  order_items:  { item: { id: string; title: string }; quantity: number; unit_price: number }[];
  shipping?:   { id: number; status: string };
}

// ── Connector ─────────────────────────────────────────────────────────────────

export class MercadoLibreConnector {
  constructor(
    private tok:    string,
    private userId: string,
  ) {}

  private h(): Record<string, string> {
    return { Authorization: `Bearer ${this.tok}`, 'Content-Type': 'application/json' };
  }

  // ── Items ──────────────────────────────────────────────────────────────────

  readonly items = {
    list: async (limit = 50): Promise<MLItem[]> => {
      const searchRes = await fetch(
        `${ML_API}/users/${this.userId}/items/search?limit=${limit}`,
        { headers: this.h() },
      );
      if (!searchRes.ok) return [];
      const { results: ids } = await searchRes.json() as { results: string[] };
      if (!ids?.length) return [];

      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 20) chunks.push(ids.slice(i, i + 20));

      const items: MLItem[] = [];
      for (const chunk of chunks) {
        const res = await fetch(`${ML_API}/items?ids=${chunk.join(',')}`, { headers: this.h() });
        if (!res.ok) continue;
        const data = await res.json() as { code: number; body: MLItem }[];
        items.push(...data.filter(d => d.code === 200).map(d => d.body));
      }
      return items;
    },

    get: async (itemId: string): Promise<MLItem | null> => {
      const res = await fetch(`${ML_API}/items/${itemId}`, { headers: this.h() });
      return res.ok ? await res.json() : null;
    },

    create: async (input: MLCreateItemInput): Promise<MLItem | null> => {
      const body: Record<string, unknown> = {
        title:              input.title,
        category_id:        input.category_id,
        price:              input.price,
        currency_id:        input.currency_id ?? 'MXN',
        available_quantity: input.available_quantity,
        buying_mode:        input.buying_mode ?? 'buy_it_now',
        condition:          input.condition ?? 'new',
        listing_type_id:    input.listing_type_id ?? 'gold_special',
      };
      if (input.pictures?.length)  body.pictures   = input.pictures;
      if (input.attributes?.length) body.attributes = input.attributes;

      const res = await fetch(`${ML_API}/items`, {
        method: 'POST', headers: this.h(), body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const item: MLItem = await res.json();

      if (input.description) {
        await fetch(`${ML_API}/items/${item.id}/description`, {
          method:  'PUT',
          headers: this.h(),
          body:    JSON.stringify({ plain_text: input.description }),
        });
      }
      return item;
    },

    update: async (itemId: string, changes: Partial<Pick<MLItem, 'price' | 'available_quantity' | 'title'>>): Promise<boolean> => {
      const res = await fetch(`${ML_API}/items/${itemId}`, {
        method: 'PUT', headers: this.h(), body: JSON.stringify(changes),
      });
      return res.ok;
    },

    pause: async (itemId: string): Promise<boolean> => {
      const res = await fetch(`${ML_API}/items/${itemId}`, {
        method: 'PUT', headers: this.h(), body: JSON.stringify({ status: 'paused' }),
      });
      return res.ok;
    },

    activate: async (itemId: string): Promise<boolean> => {
      const res = await fetch(`${ML_API}/items/${itemId}`, {
        method: 'PUT', headers: this.h(), body: JSON.stringify({ status: 'active' }),
      });
      return res.ok;
    },
  };

  // ── Pictures ───────────────────────────────────────────────────────────────

  readonly pictures = {
    // Uploads an image from a public URL and returns the ML picture_id
    uploadFromUrl: async (imageUrl: string): Promise<string | null> => {
      const res = await fetch(`${ML_API}/pictures/items/upload`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${this.tok}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ source: imageUrl }),
      });
      if (!res.ok) return null;
      const data = await res.json() as { id: string };
      return data.id;
    },

    // Uploads raw image buffer
    uploadBuffer: async (buffer: Buffer, mimeType: string): Promise<string | null> => {
      const res = await fetch(`${ML_API}/pictures/items/upload`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${this.tok}`, 'Content-Type': mimeType },
        body:    buffer as unknown as BodyInit,
      });
      if (!res.ok) return null;
      const data = await res.json() as { id: string };
      return data.id;
    },
  };

  // ── Questions ──────────────────────────────────────────────────────────────

  readonly questions = {
    listUnanswered: async (limit = 50): Promise<MLQuestion[]> => {
      const res = await fetch(
        `${ML_API}/my/received_questions/search?status=unanswered&limit=${limit}`,
        { headers: this.h() },
      );
      if (!res.ok) return [];
      const data = await res.json() as { questions: MLQuestion[] };
      return data.questions ?? [];
    },

    answer: async (questionId: number, text: string): Promise<boolean> => {
      const res = await fetch(`${ML_API}/answers`, {
        method:  'POST',
        headers: this.h(),
        body:    JSON.stringify({ question_id: questionId, text }),
      });
      return res.ok;
    },
  };

  // ── Orders ─────────────────────────────────────────────────────────────────

  readonly orders = {
    list: async (limit = 30): Promise<MLOrder[]> => {
      const res = await fetch(
        `${ML_API}/orders/search?seller=${this.userId}&limit=${limit}&sort=date_desc`,
        { headers: this.h() },
      );
      if (!res.ok) return [];
      const data = await res.json() as { results: MLOrder[] };
      return data.results ?? [];
    },

    get: async (orderId: string): Promise<MLOrder | null> => {
      const res = await fetch(`${ML_API}/orders/${orderId}`, { headers: this.h() });
      return res.ok ? await res.json() : null;
    },
  };

  // ── Categories ─────────────────────────────────────────────────────────────

  readonly categories = {
    predict: async (title: string): Promise<string | null> => {
      const res = await fetch(
        `${ML_API}/sites/MLM/domain_discovery/search?limit=1&q=${encodeURIComponent(title)}`,
        { headers: this.h() },
      );
      if (!res.ok) return null;
      const data = await res.json() as { category_id?: string }[];
      return data[0]?.category_id ?? null;
    },
  };
}

export function createMercadoLibreConnector(accessToken: string, userId: string): MercadoLibreConnector {
  return new MercadoLibreConnector(accessToken, userId);
}
