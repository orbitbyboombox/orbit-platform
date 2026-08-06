"use client";

import { Check, Link2, PlugZap, ShieldCheck } from "lucide-react";
import { SmartCard } from "@/components/cards/smart-card";
import { BrandLogo } from "@/components/brand-logo";
import { SectionTitle } from "@/components/layout/section-title";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { CONNECTION_PROVIDERS } from "../data/connections";
import type { ConnectionStatus } from "../types";
import {
  createDisconnectedGoogleWorkspaceConnection,
  type GoogleWorkspaceConnection,
  type GoogleWorkspaceConnectionHealth,
  type GoogleWorkspaceTokenStatus,
} from "@/features/connectors";

const STATUS_PRESENTATION: Record<
  ConnectionStatus,
  {
    label: string;
    variant: "neutral" | "info" | "success" | "danger";
  }
> = {
  NOT_CONNECTED: { label: "No conectado", variant: "neutral" },
  CONFIGURED: { label: "Configurado", variant: "info" },
  CONNECTED: { label: "Conectado", variant: "success" },
  ERROR: { label: "Error", variant: "danger" },
};

type ProviderStatuses = Record<string, ConnectionStatus>;

const initialStatuses = Object.fromEntries(CONNECTION_PROVIDERS.map((provider) => [provider.id, "NOT_CONNECTED"])) as ProviderStatuses;

const GOOGLE_HEALTH_PRESENTATION: Record<GoogleWorkspaceConnectionHealth, { label: string; variant: "success" | "warning" | "danger" | "neutral" }> = {
  HEALTHY: { label: "Saludable", variant: "success" },
  ATTENTION_REQUIRED: { label: "Requiere atención", variant: "warning" },
  DISCONNECTED: { label: "Desconectado", variant: "neutral" },
  AUTHENTICATION_ERROR: { label: "Error de autenticación", variant: "danger" },
  TOKEN_EXPIRED: { label: "Token vencido", variant: "danger" },
};

const TOKEN_PRESENTATION: Record<GoogleWorkspaceTokenStatus, string> = {
  HEALTHY: "Vigente · renovación preparada",
  REFRESH_REQUIRED: "Renovación requerida",
  EXPIRED: "Vencido",
  AUTHENTICATION_ERROR: "Error de autenticación",
  UNAVAILABLE: "No disponible",
};

interface GoogleWorkspaceCardProps {
  connection: GoogleWorkspaceConnection;
  configured: boolean;
}

function GoogleWorkspaceCard({ connection, configured }: GoogleWorkspaceCardProps) {
  const health = GOOGLE_HEALTH_PRESENTATION[connection.health];
  const connected = connection.connectionStatus === "CONNECTED";

  return (
    <SmartCard
      className="min-w-0 md:col-span-2"
      description="Una sola conexión segura para Calendar, Drive y Gmail. ORBIT nunca expone tokens al navegador."
      icon={<ShieldCheck aria-hidden="true" className="size-5" />}
      status={<StatusBadge label={health.label} variant={health.variant} />}
      title="Google Workspace"
    >
      <BrandLogo className="mb-4 h-16 w-44" surface="dark" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
        <dl className="grid gap-4 rounded-xl border border-border/70 bg-accent/30 p-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">Cuenta Workspace</dt><dd className="mt-1 font-semibold">{connection.workspaceAccount ?? "Sin cuenta conectada"}</dd></div>
          <div><dt className="text-muted">Dominio Workspace</dt><dd className="mt-1 font-semibold">{connection.workspaceDomain ?? "Sin dominio"}</dd></div>
          <div><dt className="text-muted">Estado de conexión</dt><dd className="mt-1 font-semibold">{connected ? "Conectado" : "Desconectado"}</dd></div>
          <div><dt className="text-muted">Conectado desde</dt><dd className="mt-1 font-semibold">{connection.connectedSince ?? "—"}</dd></div>
          <div><dt className="text-muted">Estado del token</dt><dd className="mt-1 font-semibold">{TOKEN_PRESENTATION[connection.tokenStatus]}</dd></div>
          <div><dt className="text-muted">Última verificación</dt><dd className="mt-1 font-semibold">{connection.lastVerifiedAt ?? "Sin verificar"}</dd></div>
        </dl>

        <div>
          <p className="text-sm font-semibold">Servicios concedidos</p>
          <ul className="mt-3 space-y-2">
            {connection.grantedServices.map((service) => (
              <li className="flex items-center gap-3 rounded-xl border border-border/70 bg-accent/45 px-3 py-2.5 text-sm" key={service.id}>
                <span className="flex size-6 items-center justify-center rounded-full bg-card text-brand"><Check aria-hidden="true" className="size-3.5" /></span>
                <span className="font-medium">{service.label}</span>
                <StatusBadge className="ml-auto" label={service.granted ? "Concedido" : "Sin acceso"} variant={service.granted ? "success" : "neutral"} />
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 border-t pt-5 sm:flex-row sm:flex-wrap">
        {connected ? (
          <>
            <form action="/api/integrations/google/connect" method="get"><ActionButton icon={Link2} label="Reconectar Google" type="submit" /></form>
            <form action="/api/integrations/google/disconnect" method="post"><ActionButton icon={PlugZap} label="Desconectar" type="submit" variant="outline" /></form>
          </>
        ) : (
          <form action="/api/integrations/google/connect" method="get"><ActionButton disabled={!configured} icon={Link2} label={configured ? "Conectar Google" : "Conexión pendiente"} type="submit" /></form>
        )}
      </div>
    </SmartCard>
  );
}

interface ConnectionCenterProps {
  googleConnection?: GoogleWorkspaceConnection;
  googleConfigured?: boolean;
}

export function ConnectionCenter({ googleConnection = createDisconnectedGoogleWorkspaceConnection(), googleConfigured = false }: ConnectionCenterProps) {
  const statuses = initialStatuses;

  return (
    <div className="space-y-8 lg:space-y-10">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
          Configuración · Conexiones
        </p></div>
        <SectionTitle
          description="Google Workspace y los demás servicios permanecerán desconectados hasta completar su autorización."
          title="Centro de Conexiones"
        />
      </div>

      <div
        className="grid gap-4 md:grid-cols-2 xl:gap-5"
        data-testid="connections-grid"
      >
        {CONNECTION_PROVIDERS.map((provider) => {
          if (provider.id === "google-workspace") {
            return (
              <GoogleWorkspaceCard
                connection={googleConnection}
                configured={googleConfigured}
                key={provider.id}
              />
            );
          }
          const status = statuses[provider.id] ?? provider.initialStatus;
          const presentation = STATUS_PRESENTATION[status];
          const ProviderIcon = provider.icon;

          return (
            <SmartCard
              className="min-w-0 flex min-h-[320px] flex-col"
              description={provider.description}
              icon={<ProviderIcon aria-hidden="true" className="size-5" />}
              key={provider.id}
              status={<StatusBadge label={presentation.label} variant={presentation.variant} />}
              title={provider.name}
            >
              <div className="flex flex-1 flex-col">
                {provider.services.length > 0 ? (
                  <ul aria-label={`Servicios de ${provider.name}`} className="space-y-2">
                    {provider.services.map((service) => (
                      <li
                        className="flex items-center gap-3 rounded-xl border border-border/70 bg-accent/45 px-3 py-2.5 text-sm"
                        key={service.id}
                      >
                        <span className="flex size-6 items-center justify-center rounded-full bg-card text-brand">
                          <Check aria-hidden="true" className="size-3.5" />
                        </span>
                        <span className="font-medium">{service.name}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm leading-6 text-muted">
                    La conexión estará disponible cuando se habilite su integración.
                  </div>
                )}

                <div className="mt-auto flex flex-col gap-2 border-t pt-5 sm:flex-row sm:flex-wrap">
                  <ActionButton className="w-full sm:w-auto" disabled icon={Link2} label="Conexión pendiente" type="button" />
                  <ActionButton
                    className="w-full sm:w-auto"
                    disabled
                    icon={PlugZap}
                    label="Probar conexión"
                    type="button"
                    variant="outline"
                  />
                </div>
              </div>
            </SmartCard>
          );
        })}
      </div>

    </div>
  );
}
