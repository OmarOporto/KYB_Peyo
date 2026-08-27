"use client";

import { useEffect } from "react";

function isNumberInput(el: EventTarget | null): el is HTMLInputElement {
  return el instanceof HTMLInputElement && el.type === "number";
}

/**
 * Evita ediciones accidentales en los `input[type=number]`: la rueda del mouse
 * quita el foco (y la página sigue scrolleando) y las flechas ↑/↓ no incrementan.
 * Se instala una sola vez a nivel de documento porque no hay un componente
 * <Input> compartido; los spinners se ocultan por CSS en app/globals.css.
 */
export function NumberInputGuard() {
  useEffect(() => {
    // El navegador solo cambia el valor si el campo está enfocado Y bajo el cursor.
    const onWheel = (e: WheelEvent) => {
      if (isNumberInput(e.target) && e.target === document.activeElement) {
        e.target.blur();
      }
    };

    // keydown no es passive, así que preventDefault sí surte efecto
    // (a diferencia de onWheel de React, que React registra como passive).
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      if (isNumberInput(e.target)) e.preventDefault();
    };

    document.addEventListener("wheel", onWheel, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("wheel", onWheel);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return null;
}
