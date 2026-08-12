"use client";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw, Settings2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  resetFounderWorkspaceAction,
  saveFounderWorkspaceAction,
} from "./actions";
import {
  DEFAULT_WORKSPACE,
  QUICK_ACTIONS,
  WIDGETS,
  type FounderWorkspacePreferences,
} from "./catalog";
import { navigationItems } from "@/components/layout/navigation";
import { ModuleWorkspaceSettings } from "./module-workspace-settings";
export function FounderWorkspaceSettings({
  initialPreferences,
}: {
  initialPreferences: FounderWorkspacePreferences;
}) {
  const [prefs, setPrefs] = useState(initialPreferences);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const save = (next: FounderWorkspacePreferences) => {
    setPrefs(next);
    start(async () => {
      const result = await saveFounderWorkspaceAction(next);
      setMessage(
        result.ok ? "Cambio guardado para esta cuenta." : result.error,
      );
    });
  };
  const reset = () =>
    start(async () => {
      const result = await resetFounderWorkspaceAction();
      if (result.ok) {
        setPrefs(structuredClone(DEFAULT_WORKSPACE));
        setMessage("Escritorio predeterminado restaurado.");
      } else setMessage(result.error);
    });
  return (
    <section
      className="scroll-mt-24 space-y-6 rounded-3xl border bg-card p-5 sm:p-7"
      id="founder-workspace"
    >
      <header className="flex items-start gap-4">
        <span className="rounded-2xl border bg-background p-3 text-brand">
          <Settings2 className="size-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
            Settings
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Founder Workspace</h2>
          <p className="mt-2 text-sm text-muted">
            Visibilidad personal e independiente del Module Manager. Ningún
            módulo ni dato se elimina.
          </p>
        </div>
      </header>
      <Group title="Menú visible">
        {prefs.navigationOrder.filter((key)=>!prefs.hiddenNavigation.includes(key)).map((key)=>{
          const item=navigationItems.find(candidate=>candidate.key===key);
          if(!item)return null;
          const move=(offset:number)=>{const next=[...prefs.navigationOrder];const index=next.indexOf(key);const target=index+offset;if(target<0||target>=next.length)return;[next[index],next[target]]=[next[target],next[index]];save({...prefs,navigationOrder:next});};
          return <Item key={key} label={item.label} onMoveDown={()=>move(1)} onMoveUp={()=>move(-1)} onToggle={()=>save({...prefs,hiddenNavigation:[...prefs.hiddenNavigation,key]})}/>;
        })}
      </Group>
      <Group title="Menú oculto">
        {prefs.navigationOrder.filter((key)=>prefs.hiddenNavigation.includes(key)).map((key)=>{const item=navigationItems.find(candidate=>candidate.key===key);return item?<Item hidden key={key} label={item.label} onToggle={()=>save({...prefs,hiddenNavigation:prefs.hiddenNavigation.filter(candidate=>candidate!==key)})}/>:null})}
      </Group>
      <Group title="Acciones visibles">
        {QUICK_ACTIONS.filter(
          (x) => !prefs.hiddenQuickActions.includes(x.key),
        ).map((x) => (
          <Item
            favorite={prefs.favoriteQuickActions.includes(x.key)}
            key={x.key}
            label={x.label}
            onFavorite={() =>
              save({
                ...prefs,
                favoriteQuickActions: prefs.favoriteQuickActions.includes(x.key)
                  ? prefs.favoriteQuickActions.filter((k) => k !== x.key)
                  : [...prefs.favoriteQuickActions, x.key],
              })
            }
            onToggle={() =>
              save({
                ...prefs,
                hiddenQuickActions: [...prefs.hiddenQuickActions, x.key],
              })
            }
          />
        ))}
      </Group>
      <Group title="Acciones ocultas">
        {QUICK_ACTIONS.filter((x) =>
          prefs.hiddenQuickActions.includes(x.key),
        ).map((x) => (
          <Item
            hidden
            key={x.key}
            label={x.label}
            onToggle={() =>
              save({
                ...prefs,
                hiddenQuickActions: prefs.hiddenQuickActions.filter(
                  (k) => k !== x.key,
                ),
              })
            }
          />
        ))}
      </Group>
      <Group title="Widgets visibles">
        {WIDGETS.filter((x) => !prefs.hiddenWidgets.includes(x.key)).map(
          (x) => (
            <Item
              key={x.key}
              label={x.label}
              onToggle={() =>
                save({
                  ...prefs,
                  hiddenWidgets: [...prefs.hiddenWidgets, x.key],
                })
              }
            />
          ),
        )}
      </Group>
      <Group title="Widgets ocultos">
        {WIDGETS.filter((x) => prefs.hiddenWidgets.includes(x.key)).map((x) => (
          <Item
            hidden
            key={x.key}
            label={x.label}
            onToggle={() =>
              save({
                ...prefs,
                hiddenWidgets: prefs.hiddenWidgets.filter((k) => k !== x.key),
              })
            }
          />
        ))}
      </Group>
      <ModuleWorkspaceSettings onChange={save} preferences={prefs} />
      <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          {pending
            ? "Guardando…"
            : message || "Los cambios se aplican inmediatamente."}
        </p>
        <Button disabled={pending} onClick={reset} variant="outline">
          <RotateCcw className="mr-2 size-4" />
          Restaurar escritorio predeterminado
        </Button>
      </div>
    </section>
  );
}
function Group({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-[.14em] text-muted">
        {title}
      </h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}
function Item({
  favorite = false,
  hidden = false,
  label,
  onFavorite,
  onToggle,
  onMoveUp,
  onMoveDown,
}: {
  favorite?: boolean;
  hidden?: boolean;
  label: string;
  onFavorite?: () => void;
  onToggle: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <article className="flex items-center gap-2 rounded-xl border bg-background/30 p-3">
      <span className="flex-1 text-sm font-medium">{label}</span>
      {onFavorite && (
        <button
          aria-label={`${favorite ? "Quitar" : "Agregar"} favorito ${label}`}
          className={favorite ? "text-brand" : "text-muted"}
          onClick={onFavorite}
        >
          <Star className="size-4" />
        </button>
      )}
      {onMoveUp&&<button aria-label={`Mover arriba ${label}`} className="text-muted hover:text-foreground" onClick={onMoveUp}><ArrowUp className="size-4"/></button>}
      {onMoveDown&&<button aria-label={`Mover abajo ${label}`} className="text-muted hover:text-foreground" onClick={onMoveDown}><ArrowDown className="size-4"/></button>}
      <button
        aria-label={`${hidden ? "Mostrar" : "Ocultar"} ${label}`}
        className="text-muted hover:text-foreground"
        onClick={onToggle}
      >
        {hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </button>
    </article>
  );
}
