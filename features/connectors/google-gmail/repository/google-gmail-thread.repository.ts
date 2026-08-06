import type { GmailCommunicationRecord, GmailThreadReference } from "../types/google-gmail-live.types";

export interface GoogleGmailThreadRepository {
  findByCustomerId(customerId: string): Promise<GmailThreadReference | null>;
  saveThread(thread: GmailThreadReference): Promise<void>;
  saveCommunication(communication: GmailCommunicationRecord): Promise<void>;
}

export class InMemoryGoogleGmailThreadRepository implements GoogleGmailThreadRepository {
  private readonly threads = new Map<string, GmailThreadReference>();
  private readonly communications = new Map<string, GmailCommunicationRecord>();
  async findByCustomerId(customerId: string) { return this.threads.get(customerId) ?? null; }
  async saveThread(thread: GmailThreadReference) { this.threads.set(thread.customerId, thread); }
  async saveCommunication(communication: GmailCommunicationRecord) { this.communications.set(communication.id, communication); }
}
