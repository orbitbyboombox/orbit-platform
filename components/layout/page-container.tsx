import { cn } from "@/lib/utils";

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function PageContainer({ children, className, ...props }: PageContainerProps) {
  return <div className={cn("mx-auto w-full max-w-[1640px] p-4 sm:p-6 md:p-7 lg:p-9 xl:px-10 xl:py-9", className)} {...props}>{children}</div>;
}
