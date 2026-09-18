import { test } from "node:test";
import assert from "node:assert/strict";
import {
  safeSegment,
  safeFilename,
  isOwnedPath,
  documentPath,
  mimeAllowed,
} from "./storagePaths.ts";

const REQ = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

test("safeSegment no deja formar `..` ni salir de la carpeta", () => {
  assert.equal(safeSegment("../../otro"), "otro");
  assert.equal(safeSegment(".."), "general");
  assert.equal(safeSegment("a/b"), "a_b");
  assert.equal(safeSegment(""), "general");
  assert.equal(safeSegment("dni_frente"), "dni_frente");
  // Las claves de campo generadas por el builder pasan intactas.
  assert.equal(safeSegment("f_a1b2c3d4"), "f_a1b2c3d4");
});

test("safeFilename conserva la extensión pero no los puntos iniciales", () => {
  assert.equal(safeFilename("escritura.pdf"), "escritura.pdf");
  // La barra pasa a `_` y recién después se quitan los puntos iniciales.
  assert.equal(safeFilename("../../etc/passwd"), "_.._etc_passwd");
  assert.equal(safeFilename(".."), "archivo");
  assert.equal(safeFilename(""), "archivo");
  assert.ok(!safeFilename("../x.pdf").startsWith("."));
});

test("isOwnedPath rechaza el traversal que startsWith dejaba pasar", () => {
  assert.equal(isOwnedPath(`${REQ}/dni/abc-x.pdf`, REQ), true);

  // El caso exacto que motivó el cambio.
  assert.equal(isOwnedPath(`${REQ}/../${OTHER}/x.pdf`, REQ), false);
  assert.equal(isOwnedPath(`${REQ}/./x.pdf`, REQ), false);
  assert.equal(isOwnedPath(`${REQ}//x.pdf`, REQ), false);

  // Prefijo que coincide por texto pero es otra solicitud.
  assert.equal(isOwnedPath(`${REQ}-bis/dni/x.pdf`, REQ), false);
  assert.equal(isOwnedPath(`${OTHER}/dni/x.pdf`, REQ), false);

  assert.equal(isOwnedPath(REQ, REQ), false, "hace falta al menos un segmento más");
  assert.equal(isOwnedPath("", REQ), false);
  assert.equal(isOwnedPath(`${REQ}/x.pdf`, ""), false);
});

test("documentPath arma una clave siempre dentro de la solicitud", () => {
  const path = documentPath(REQ, "../../escape", "../x.pdf", "uuid");
  assert.equal(isOwnedPath(path, REQ), true);
  assert.equal(path, `${REQ}/escape/uuid-_x.pdf`);
});

test("mimeAllowed entiende MIME, comodín y extensión", () => {
  assert.equal(mimeAllowed([], "application/x-msdownload", "a.exe"), true, "lista vacía = sin límite");
  assert.equal(mimeAllowed(undefined, "anything", "a.bin"), true);

  assert.equal(mimeAllowed(["application/pdf"], "application/pdf", "a.pdf"), true);
  assert.equal(mimeAllowed(["application/pdf"], "image/png", "a.png"), false);

  assert.equal(mimeAllowed(["image/*"], "image/png", "a.png"), true);
  assert.equal(mimeAllowed(["image/*"], "application/pdf", "a.pdf"), false);

  assert.equal(mimeAllowed([".pdf"], "application/octet-stream", "a.pdf"), true);
  assert.equal(mimeAllowed([".pdf"], "application/octet-stream", "a.exe"), false);

  // El preset real de los formularios de documentos.
  assert.equal(mimeAllowed(["application/pdf", "image/*"], "image/jpeg", "dni.jpg"), true);
  assert.equal(mimeAllowed(["application/pdf", "image/*"], "text/html", "x.html"), false);
});

test("un tipo genérico se resuelve por extensión y no rechaza archivos válidos", () => {
  const preset = ["application/pdf", "image/*"];

  // El caso que motivó el fallback: el navegador no detectó el tipo.
  assert.equal(mimeAllowed(preset, "application/octet-stream", "acta.pdf"), true);
  assert.equal(mimeAllowed(preset, "", "dni.JPG"), true);
  assert.equal(mimeAllowed(preset, "application/octet-stream", "foto.heic"), true);

  // Genérico con extensión que NO está permitida: se sigue rechazando.
  assert.equal(mimeAllowed(preset, "application/octet-stream", "malware.exe"), false);
  assert.equal(mimeAllowed(preset, "application/octet-stream", "sin-extension"), false);

  // Un tipo declarado y concreto manda: no se reinterpreta por la extensión.
  assert.equal(mimeAllowed(preset, "text/html", "trampa.pdf"), false);

  // Con accept por extensión el comportamiento no cambia.
  assert.equal(mimeAllowed([".pdf"], "application/octet-stream", "acta.pdf"), true);
});
