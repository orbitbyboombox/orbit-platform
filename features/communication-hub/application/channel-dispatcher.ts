import type { ChannelDispatchRequest } from "../types/communication-hub.types";

export interface CommunicationChannelDispatcher {
  dispatch(request: ChannelDispatchRequest): Promise<void>;
}

export class NoopCommunicationChannelDispatcher implements CommunicationChannelDispatcher {
  async dispatch(request: ChannelDispatchRequest) {
    // Architecture-only dispatcher. Future channel adapters implement transport.
    void request;
  }
}
