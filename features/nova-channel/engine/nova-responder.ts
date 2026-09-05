import type { NovaChannelInput, NovaChannelOutput } from "../types/nova-channel.types";

export interface NovaResponder {
  respond(input: NovaChannelInput): NovaChannelOutput | Promise<NovaChannelOutput>;
}
