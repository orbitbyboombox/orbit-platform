import { cn } from "@/lib/utils";

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function PageContainer({ children, className, ...props }: PageContainerProps) {
  return <div className={cn("mx-auto w-full max-w-[1600px] p-4 sm:p-5 md:p-6 lg:p-8 xl:p-9", className)} {...props}>{children}</div>;
}
