"use client";

import { useState, type InputHTMLAttributes } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { inputCls } from "@/components/ui/Field";
import { authInputCls } from "./authUi";

/**
 * Contraseña con botón de mostrar/ocultar. `lg` para las pantallas de acceso,
 * `md` para formularios dentro del panel (Seguridad).
 */
export function PasswordInput({
  size = "lg",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "className"> & {
  size?: "lg" | "md";
}) {
  const t = useTranslations("auth");
  const [show, setShow] = useState(false);
  const lg = size === "lg";
  return (
    <div className="relative">
      <input
        {...props}
        type={show ? "text" : "password"}
        className={lg ? `${authInputCls} pr-12` : `${inputCls} pr-10`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? t("hidePassword") : t("showPassword")}
        title={show ? t("hidePassword") : t("showPassword")}
        className={`absolute inset-y-0 right-0 flex cursor-pointer items-center justify-center text-muted transition-colors hover:text-foreground ${
          lg ? "w-12 rounded-r-xl" : "w-10 rounded-r-lg"
        }`}
      >
        {show ? <EyeOff size={lg ? 18 : 16} aria-hidden /> : <Eye size={lg ? 18 : 16} aria-hidden />}
      </button>
    </div>
  );
}
