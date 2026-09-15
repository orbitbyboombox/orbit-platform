import {PageSkeleton} from "@/components/ui/page-skeleton";
export default function Loading(){return <div aria-busy="true" className="space-y-6"><div aria-hidden="true" className="h-24 animate-pulse rounded-2xl border bg-card"/><PageSkeleton/></div>}
