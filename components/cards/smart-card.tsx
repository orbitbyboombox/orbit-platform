import { ChevronDown } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SmartCardProps extends React.HTMLAttributes<HTMLElement> {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  interactive?: boolean;
  status?: React.ReactNode;
  primaryValue?: string;
  secondaryValue?: string;
  actionLabel?: string;
  onAction?: () => void;
  expandable?: boolean;
  loading?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

export function SmartCard({
  title,
  description,
  icon,
  footer,
  interactive,
  status,
  primaryValue,
  secondaryValue,
  actionLabel,
  onAction,
  expandable,
  loading,
  disabled,
  expanded = false,
  onExpandedChange,
  children,
  className,
  ...props
}: SmartCardProps) {
  const usesStructuredLayout = Boolean(
    status ||
    primaryValue ||
    secondaryValue ||
    actionLabel ||
    expandable ||
    loading ||
    disabled ||
    expanded ||
    onExpandedChange,
  );

  return (
    <article
      aria-busy={loading || undefined}
      data-disabled={disabled || undefined}
      className={cn(
        "orbit-enter rounded-2xl border border-border/80 bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.025)] sm:p-6",
        (interactive || usesStructuredLayout) &&
          !disabled &&
          "transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-foreground/10 hover:shadow-[0_12px_30px_rgba(0,0,0,0.08)]",
        disabled && "opacity-60",
        className,
      )}
      {...props}
    >
      {usesStructuredLayout ? (
        <>
          <header className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              {icon && (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  {icon}
                </span>
              )}
              <div className="min-w-0">
                {loading ? (
                  <div aria-hidden="true" className="h-5 w-28 animate-pulse rounded bg-accent" />
                ) : (
                  title && <h3 className="truncate text-sm font-semibold tracking-tight">{title}</h3>
                )}
                {description && !loading && <p className="mt-1 text-sm text-muted">{description}</p>}
              </div>
            </div>
            {!loading && status}
          </header>

          <div className="mt-6">
            {loading ? (
              <div aria-hidden="true" className="space-y-3">
                <div className="h-8 w-3/5 animate-pulse rounded bg-accent" />
                <div className="h-4 w-2/5 animate-pulse rounded bg-accent" />
              </div>
            ) : (
              <>
                {primaryValue && <p className="text-2xl font-semibold tracking-tight sm:text-3xl">{primaryValue}</p>}
                {secondaryValue && <p className="mt-2 text-sm text-muted">{secondaryValue}</p>}
              </>
            )}
          </div>

          {!loading && children && (!expandable || expanded) && (
            <div className="mt-5 border-t pt-5">{children}</div>
          )}

          {(actionLabel || expandable) && (
            <footer className="mt-6 flex items-center gap-2 border-t pt-4">
              {loading ? (
                <div aria-hidden="true" className="h-9 w-full animate-pulse rounded-md bg-accent" />
              ) : (
                <>
                  {actionLabel && (
                    <ActionButton
                      className="min-w-0 flex-1 sm:flex-none"
                      disabled={disabled}
                      label={actionLabel}
                      onClick={onAction}
                      type="button"
                    />
                  )}
                  {expandable && (
                    <Button
                      aria-expanded={expanded}
                      aria-label={expanded ? "Contraer tarjeta" : "Expandir tarjeta"}
                      className="ml-auto"
                      disabled={disabled || !onExpandedChange}
                      onClick={() => onExpandedChange?.(!expanded)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <ChevronDown
                        aria-hidden="true"
                        className={cn("size-4 transition-transform", expanded && "rotate-180")}
                      />
                    </Button>
                  )}
                </>
              )}
            </footer>
          )}
          {footer && <footer className="mt-4 border-t pt-4">{footer}</footer>}
        </>
      ) : (
        <>
          {(title || description || icon) && (
            <header className="flex items-start gap-3">
              {icon && (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  {icon}
                </span>
              )}
              <div>
                {title && <h3 className="text-sm font-semibold tracking-tight">{title}</h3>}
                {description && <p className="mt-1 text-sm text-muted">{description}</p>}
              </div>
            </header>
          )}
          {children && <div className={cn((title || description || icon) && "mt-4")}>{children}</div>}
          {footer && <footer className="mt-4 border-t pt-4">{footer}</footer>}
        </>
      )}
    </article>
  );
}
