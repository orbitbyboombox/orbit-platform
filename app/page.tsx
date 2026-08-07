import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BadgeDollarSign,
  BriefcaseBusiness,
  CalendarDays,
  ChartNoAxesCombined,
  CheckSquare2,
  CreditCard,
  FileSignature,
  Files,
  Images,
  ListChecks,
  Palette,
  UsersRound,
  Workflow,
} from "lucide-react";

const accessCards = [
  {
    label: "CLIENT",
    title: "CLIENT PORTAL",
    description: "Manage your complete BOOMBOX experience.",
    href: "/login?access=customer",
    image: "/images/orbit-home/elegant-wedding.png",
    imageAlt: "Elegant wedding reception prepared for a BOOMBOX experience",
    features: [
      { label: "Agreement", icon: FileSignature },
      { label: "Event Status", icon: Activity },
      { label: "Payments", icon: CreditCard },
      { label: "Gallery", icon: Images },
      { label: "Documents", icon: Files },
      { label: "Designs", icon: Palette },
    ],
  },
  {
    label: "STAFF",
    title: "STAFF PORTAL",
    description: "Manage your operational workspace.",
    href: "/login?access=staff",
    image: "/images/orbit-home/event-operator.png",
    imageAlt: "Professional event operator preparing BOOMBOX production equipment",
    features: [
      { label: "Events", icon: CalendarDays },
      { label: "Tasks", icon: CheckSquare2 },
      { label: "Checklist", icon: ListChecks },
      { label: "Payroll", icon: BadgeDollarSign },
      { label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    label: "ADMIN",
    title: "ADMINISTRATION",
    description: "Manage your entire BOOMBOX operation.",
    href: "/login?access=admin",
    image: "/images/orbit-home/orbit-dashboard.png",
    imageAlt: "Real ORBIT executive dashboard interface",
    sensitive: true,
    features: [
      { label: "CRM", icon: UsersRound },
      { label: "Operations", icon: Workflow },
      { label: "Business", icon: BriefcaseBusiness },
      { label: "Reports", icon: ChartNoAxesCombined },
    ],
  },
] as const;

function FeatureList({ features }: { features: ReadonlyArray<{ label: string; icon: typeof Activity }> }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-3" aria-label="Available features">
      {features.map(({ label, icon: Icon }) => (
        <li className="flex min-w-0 items-center gap-2 text-xs text-white/48" key={label}>
          <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-white/8 bg-white/[.025] text-white/58">
            <Icon aria-hidden="true" className="size-3.5" strokeWidth={1.65} />
          </span>
          <span className="truncate">{label}</span>
        </li>
      ))}
    </ul>
  );
}

export default function OrbitHomePage() {
  return (
    <main className="dark min-h-screen overflow-hidden bg-[#09090a] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_-12%,rgba(255,255,255,.055),transparent_36%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1540px] flex-col px-5 py-8 sm:px-8 sm:py-10 lg:px-12 xl:px-16">
        <header className="mx-auto text-center">
          <p className="text-[19px] font-medium tracking-[.36em] text-white sm:text-xl">ORBIT</p>
          <p className="mt-1.5 text-[9px] uppercase tracking-[.28em] text-white/32">by BOOMBOX</p>
          <h1 className="mt-10 text-4xl font-medium tracking-[-.045em] sm:text-5xl">Welcome.</h1>
          <p className="mt-3 text-sm leading-6 text-white/44 sm:text-base">Choose how you would like to continue.</p>
        </header>

        <section className="mx-auto mt-10 w-full max-w-[1320px] sm:mt-12 lg:mt-14" aria-label="ORBIT access portals">
          <div className="grid items-stretch gap-6 xl:grid-cols-3">
            {accessCards.map((card) => (
              <article
                className="group flex h-full min-h-[620px] flex-col overflow-hidden rounded-[2rem] border border-white/[.085] bg-[#121214] shadow-[0_24px_64px_rgba(0,0,0,.34)] transition-[transform,border-color,box-shadow] duration-[250ms] ease-out hover:-translate-y-1.5 hover:border-brand/55 hover:shadow-[0_34px_90px_rgba(0,0,0,.55)] motion-reduce:transform-none"
                key={card.title}
                style={{ minHeight: "620px" }}
              >
                <div className="relative aspect-[16/10] min-h-0 overflow-hidden bg-[#0d0d0f]">
                  <Image
                    alt={card.imageAlt}
                    className={`object-cover transition-transform duration-[500ms] ease-out group-hover:scale-[1.018] motion-reduce:transform-none ${"sensitive" in card && card.sensitive ? "scale-[1.025] blur-[1.5px]" : "grayscale-[12%]"}`}
                    fill
                    priority={card.label === "CLIENT"}
                    sizes="(max-width: 1279px) 100vw, 33vw"
                    src={card.image}
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#121214] via-transparent to-black/10" />
                  <span className="absolute left-6 top-6 rounded-full border border-white/12 bg-black/35 px-3 py-1.5 text-[9px] font-semibold tracking-[.22em] text-white/72 backdrop-blur-md">
                    {card.label}
                  </span>
                </div>

                <div className="relative -mt-7 flex flex-1 flex-col p-6 pt-0 sm:p-8 sm:pt-0">
                  <div className="rounded-t-[1.35rem] bg-[#121214] pt-7">
                    <h2 className="text-[22px] font-medium tracking-[-.025em] text-white">{card.title}</h2>
                    <p className="mt-3 min-h-12 text-sm leading-6 text-white/48">{card.description}</p>
                  </div>
                  <div className="mt-6 border-t border-white/[.07] pt-6"><FeatureList features={card.features} /></div>
                  <Link
                    className="mt-auto flex min-h-12 items-center justify-between rounded-full border border-brand/85 bg-transparent px-5 text-xs font-semibold tracking-[.14em] text-brand transition-[background-color,color,box-shadow] duration-[250ms] hover:bg-brand hover:text-black hover:shadow-[0_12px_34px_rgba(255,149,0,.18)] focus-visible:bg-brand focus-visible:text-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
                    href={card.href}
                  >
                    ENTER <ArrowUpRight aria-hidden="true" className="size-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="mx-auto mt-12 w-full max-w-[1320px] border-t border-white/[.065] pt-7 text-center sm:mt-14" aria-label="Help and support">
          <p className="text-xs text-white/38">Need help?</p>
          <nav className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-white/52" aria-label="Support options">
            <a className="transition-colors duration-[250ms] hover:text-brand" href="https://wa.me/56963040989">WhatsApp</a>
            <a className="transition-colors duration-[250ms] hover:text-brand" href="mailto:admin@orbit.boom-box.cl">Email</a>
            <a className="transition-colors duration-[250ms] hover:text-brand" href="mailto:admin@orbit.boom-box.cl?subject=ORBIT%20Support">Support</a>
          </nav>
        </aside>

        <footer className="mt-12 pb-1 text-center text-[8px] uppercase tracking-[.2em] text-white/20 sm:mt-14">
          Powered by <span className="text-white/28">NOVA CORE</span>
        </footer>
      </div>
    </main>
  );
}
