export interface Attachment {
  filename: string;
  content:  Buffer;
  mimeType: string;
}

export interface EmailAttachmentMeta {
  id:       string;
  name:     string;
  mimeType: string;
  size:     number;
}

export interface EmailMessage {
  id:        string;
  threadId?: string;
  from:      string;
  subject:   string;
  body:      string;
  attachments?: EmailAttachmentMeta[];
}

export interface FileItem {
  id:       string;
  name:     string;
  mimeType: string;
  isFolder: boolean;
}

export interface UploadResult {
  id:   string;
  name: string;
  link: string;
}

export interface FolderResult {
  id:   string;
  name: string;
}

export interface ReplyParams {
  messageId: string;
  threadId?: string;
  to?:       string;
  subject?:  string;
  body:      string;
  /**
   * Display name para el header From, e.g. "Noah - Pneuma Studio". La dirección
   * real siempre es la cuenta autenticada por OAuth. Gmail/Outlook aceptan
   * cambios de display name pero ignoran/rechazan direcciones no verificadas.
   */
  fromDisplay?: string;
}

export interface EmailConnector {
  fetchUnread(since: Date, folder?: 'inbox' | 'spam'): Promise<EmailMessage[]>;
  send(to: string, subject: string, body: string, attachment?: Attachment, fromEmail?: string): Promise<void>;
  sendReply(params: ReplyParams): Promise<void>;
  markRead(messageId: string): Promise<void>;
  unmarkSpam?(messageId: string): Promise<void>;
  /** Descarga el binario de un attachment del mensaje. Opcional — no todos los providers lo soportan aún. */
  fetchAttachment?(messageId: string, attachmentId: string): Promise<Buffer | null>;
}

export interface FilesConnector {
  search(query: string): Promise<FileItem[]>;
  read(fileId: string, mimeType: string): Promise<string>;
  download(fileId: string, mimeType: string): Promise<{ buffer: Buffer; contentType: string } | null>;
  upload(filename: string, content: Buffer, mimeType: string, folder?: string): Promise<UploadResult | null>;
  list(folderId?: string): Promise<FileItem[]>;
  move(fileId: string, destination: string): Promise<boolean>;
  rename(fileId: string, newName: string): Promise<boolean>;
  createFolder(name: string): Promise<FolderResult | null>;
}

export interface ContactResult {
  name:  string;
  email: string | null;
  phone: string | null;
}

export interface ContactsConnector {
  search(query: string): Promise<ContactResult[]>;
  getByPhone(phone: string): Promise<ContactResult | null>;
}

export interface CalendarEvent {
  id:           string;
  title:        string;
  start:        string;
  end:          string;
  location?:    string;
  description?: string;
  attendees:    string[];
  meet_link?:   string;
}

export interface CreateEventInput {
  title:               string;
  start:               string;
  end:                 string;
  description?:        string;
  location?:           string;
  attendees?:          string[];
  generate_meet_link?: boolean;
}

export interface CalendarConnector {
  listEvents(from: Date, to: Date): Promise<CalendarEvent[]>;
  createEvent(input: CreateEventInput): Promise<CalendarEvent | null>;
  deleteEvent(eventId: string): Promise<boolean>;
}

export interface Connector {
  provider:  'google' | 'microsoft';
  email:     EmailConnector;
  files:     FilesConnector;
  contacts?: ContactsConnector;
  calendar?: CalendarConnector;
}
