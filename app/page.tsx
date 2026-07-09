import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Servicio KYB</h1>
      <p className="text-gray-500">
        Servicio externo de validación de empresas (KYB). Los formularios se
        acceden por invitación; los analistas revisan desde el panel.
      </p>
      <div className="flex gap-4 text-sm">
        <Link href="/admin" className="text-blue-600 hover:underline">
          Panel de revisión →
        </Link>
      </div>
    </main>
  );
}
