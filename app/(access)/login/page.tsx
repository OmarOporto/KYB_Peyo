import { LoginScreen } from "@/components/auth/LoginScreen";

export const dynamic = "force-dynamic";

/** Login de usuarios (clientes). El admin entra por /admin/login. */
export default async function UserLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const { error, reset } = await searchParams;
  return <LoginScreen portal="user" error={error} reset={reset} />;
}
