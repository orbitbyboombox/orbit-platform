export { NoopCommunicationChannelDispatcher, type CommunicationChannelDispatcher } from "./application/channel-dispatcher";
export { normalizeChannelCommunication, toNovaChannel } from "./application/channel-normalizer";
export { CommunicationHub } from "./components/communication-hub";
export { CommunicationHubEngine } from "./engine/communication-hub.engine";
export { calculateCommunicationIndicators, newestFirst, type CommunicationTimelineRepository } from "./timeline/unified-communication.timeline";
export { loadCommunicationHubProjection, SupabaseCommunicationTimelineRepository, type CommunicationHubProjection } from "./timeline/supabase-communication.timeline";
export type * from "./types/communication-hub.types";
