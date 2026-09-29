import { getTranslations } from "next-intl/server";
import { Building2, FileCheck2, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/Brand";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Marco de las pantallas de acceso (login, recuperar contraseña, 2FA…).
 *
 * Escritorio: panel de marca a la izquierda con el degradé del informe
 * (globals.css) y el formulario amplio a la derecha. Móvil: el panel se
 * esconde y el logo va arriba del formulario.
 */
export async function AuthShell({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("auth");
  const year = new Date().getFullYear();

  const points = [
    { icon: <FileCheck2 size={20} aria-hidden />, title: t("point1Title"), body: t("point1Body") },
    { icon: <ShieldCheck size={20} aria-hidden />, title: t("point2Title"), body: t("point2Body") },
    { icon: <Building2 size={20} aria-hidden />, title: t("point3Title"), body: t("point3Body") },
  ];

  return (
    <div className="flex min-h-screen w-full flex-1">
      <aside
        className="relative hidden w-[46%] max-w-3xl shrink-0 flex-col justify-between overflow-hidden p-12 text-white lg:flex xl:p-16"
        style={{ background: "linear-gradient(160deg, #081736 0%, #0f2f7a 55%, #2463eb 100%)" }}
      >
        {/* Luces de fondo: solo decoración. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-24 h-96 w-96 rounded-full bg-accent/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-24 h-[28rem] w-[28rem] rounded-full bg-brand/40 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px]"
        />

        <Brand size="lg" className="relative self-start bg-white/95 shadow-lg shadow-black/20" />

        <div className="relative max-w-lg">
          <span className="inline-block rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium tracking-wide text-white/90">
            {t("badge")}
          </span>
          <h2 className="mt-5 font-display text-4xl leading-tight font-extrabold xl:text-5xl">
            {t("heroLine1")}
            <br />
            <span className="bg-linear-to-r from-accent to-white bg-clip-text text-transparent">
              {t("heroLine2")}
            </span>
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/75">{t("heroBody")}</p>

          <ul className="mt-10 space-y-5">
            {points.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-accent ring-1 ring-white/15">
                  {p.icon}
                </span>
                <span>
                  <span className="block font-semibold">{p.title}</span>
                  <span className="block text-sm text-white/70">{p.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">© {year} Peyo</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 p-4 sm:p-6">
          <Brand size="md" className="lg:invisible" />
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
        <main className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-8">
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
    </div>
  );
}
