export type CollectionEmailCommunication = {
  id: string;
  status: string | null;
  occurredAt?: string | null;
  sentAt?: string | null;
  toRecipient?: string | null;
  createdBy?: string | null;
  sentBy?: string | null;
  failureReason?: string | null;
  externalMessageId?: string | null;
};

export type CollectionEmailState = "NOT_SENT" | "PENDING" | "SENT" | "FAILED";

export type CollectionEmailStatus = {
  state: CollectionEmailState;
  label: "CORREO DE COBRO NO ENVIADO" | "CORREO DE COBRO PENDIENTE" | "CORREO DE COBRO ENVIADO" | "ERROR DE ENVÍO";
  sentAt: string | null;
  recipient: string | null;
  actorId: string | null;
  failureReason: string | null;
};

function timestamp(item: CollectionEmailCommunication) {
  return item.sentAt ?? item.occurredAt ?? "";
}

/** Derives the visible state from the latest real delivery outcome, without losing history. */
export function resolveCollectionEmailStatus(
  communications: readonly CollectionEmailCommunication[],
): CollectionEmailStatus {
  const attempts = communications
    .filter((item) => item.status === "SENT" || item.status === "FAILED" || item.status === "PENDING")
    .slice()
    .sort((left, right) => timestamp(right).localeCompare(timestamp(left)));
  const latest = attempts[0];
  if (!latest) {
    return {
      state: "NOT_SENT",
      label: "CORREO DE COBRO NO ENVIADO",
      sentAt: null,
      recipient: null,
      actorId: null,
      failureReason: null,
    };
  }
  if (latest.status === "PENDING" || (latest.status === "SENT" && (!latest.sentAt || !latest.externalMessageId))) {
    return {
      state: "PENDING",
      label: "CORREO DE COBRO PENDIENTE",
      sentAt: null,
      recipient: latest.toRecipient ?? null,
      actorId: latest.sentBy ?? latest.createdBy ?? null,
      failureReason: latest.failureReason ?? null,
    };
  }
  if (latest.status === "FAILED") {
    return {
      state: "FAILED",
      label: "ERROR DE ENVÍO",
      sentAt: null,
      recipient: latest.toRecipient ?? null,
      actorId: latest.sentBy ?? latest.createdBy ?? null,
      failureReason: latest.failureReason ?? null,
    };
  }
  return {
    state: "SENT",
    label: "CORREO DE COBRO ENVIADO",
    sentAt: latest.sentAt ?? latest.occurredAt ?? null,
    recipient: latest.toRecipient ?? null,
    actorId: latest.sentBy ?? latest.createdBy ?? null,
    failureReason: null,
  };
}

export function collectionDeliveryLabel(item: {
  status: string | null;
  sentAt: string | null;
  externalMessageId: string | null;
}): "ENVIADO" | "PENDIENTE" | "FALLIDO" {
  if (item.status === "FAILED") return "FALLIDO";
  if (item.status === "SENT" && item.sentAt && item.externalMessageId) return "ENVIADO";
  return "PENDIENTE";
}
