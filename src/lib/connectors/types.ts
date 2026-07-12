export interface Attachment {
  filename: string;
  content:  Buffer;
  mimeType: string;
}

export interface EmailMessage {
  id:        string;
  threadId?: string;
  from:      string;
  subject:   string;
  body:      string;
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
}

export interface EmailConnector {
  fetchUnread(since: Date): Promise<EmailMessage[]>;
  send(to: string, subject: string, body: string, attachment?: Attachment): Promise<void>;
  sendReply(params: ReplyParams): Promise<void>;
  markRead(messageId: string): Promise<void>;
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

export interface Connector {
  provider: 'google' | 'microsoft';
  email:    EmailConnector;
  files:    FilesConnector;
  contacts?: ContactsConnector;
}
