import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAnalyst } from "@/lib/auth/admin";
import { signOutAction } from "@/app/admin/actions";
import { AuthAlert, AuthHeading } from "@/components/auth/authUi";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function AdminLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  // Con sesión y acceso ya no hay nada que hacer acá. Se pregunta por el
  // ANALISTA y no solo por el usuario: alguien autenticado sin fila en
  // `analysts` rebotaba entre /admin y /admin/login sin ver ningún mensaje.
  if (await getAnalyst()) redirect("/admin");

  const t = await getTranslations("auth");
  const { error, reset } = await searchParams;

  return (
    <>
      <AuthHeading title={t("loginTitle")} subtitle={t("loginSubtitle")} />

      {error === "forbidden" && (
        <AuthAlert tone="danger">
          <p>{t("forbidden")}</p>
          <form action={signOutAction} className="mt-2">
            <button className="cursor-pointer font-medium text-brand hover:underline">
              {t("useOtherAccount")}
            </button>
          </form>
        </AuthAlert>
      )}
      {reset === "1" && <AuthAlert tone="success">{t("passwordUpdated")}</AuthAlert>}

      <LoginForm />
    </>
  );
}
