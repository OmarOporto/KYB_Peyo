import { test } from "node:test";
import assert from "node:assert/strict";
import type { Field, FieldReview, FormDefinition, LocalizedText } from "../forms/definition.ts";
import { isBackSide, planDiditTasks, textAnswer, type DiditTask } from "./plan.ts";

// Recorte del "FORMULARIO DE REGISTRO PARA EMPRESAS" real (importado de Google
// Forms): keys `q_…`, anverso/reverso distinguibles solo por la etiqueta y
// ramas por tipo de empresa. Mismo orden de secciones que el original.
const ID: FieldReview = { provider: "didit", feature: "id_verification" };
const POA: FieldReview = { provider: "didit", feature: "proof_of_address" };

const file = (key: string, label: LocalizedText, review?: FieldReview): Field => ({
  id: key,
  key,
  type: "file",
  label,
  required: false,
  file: { accept: [], multiple: false, maxSizeMB: 15 },
  ...(review ? { review } : {}),
});
const choice = (key: string, values: string[]): Field => ({
  id: key,
  key,
  type: "single_choice",
  label: key,
  required: true,
  options: values.map((v) => ({ value: v, label: v })),
});
const text = (key: string, review?: FieldReview): Field => ({
  id: key,
  key,
  type: "short_text",
  label: key,
  required: false,
  ...(review ? { review } : {}),
});
const front = (key: string) => file(key, "DOCUMENTO DE IDENTIDAD (ANVERSO)", ID);
const back = (key: string) => file(key, "DOCUMENTO DE IDENTIDAD (REVERSO)", ID);

const FORM: FormDefinition = {
  version: 1,
  title: "FORMULARIO DE REGISTRO PARA EMPRESAS",
  locales: ["es", "en"],
  defaultLocale: "es",
  sections: [
    {
      id: "section_inicio",
      title: "Inicio",
      fields: [text("q_2029245471")],
      defaultGoTo: "section_docs",
    },
    {
      id: "section_docs",
      title: "DOCUMENTACIÓN BÁSICA",
      fields: [
        choice("q_1834360375", ["Unipersonal", "Sociedad de responsabilidad limitada (S.R.L.)"]),
        file("q_871306237", "Comprobante de domicilio", POA),
      ],
      next: [
        { when: { field: "q_1834360375", op: "eq", value: "Unipersonal" }, goTo: "section_uni" },
      ],
      defaultGoTo: "section_socios",
    },
    {
      id: "section_uni",
      title: "EMPRESA UNIPERSONAL",
      fields: [front("q_1139987339"), back("q_303089462")],
      // En el original apunta a una sección que no existe: termina el formulario.
      defaultGoTo: "section_1327859224",
    },
    {
      id: "section_socios",
      title: "EMPRESA CON DOS SOCIOS",
      fields: [
        front("q_1453350424"),
        back("q_1124275386"),
        front("q_957664702"),
        back("q_1019901945"),
        choice("q_508440594", ["Si", "No"]),
      ],
      next: [
        { when: { field: "q_508440594", op: "eq", value: "Si" }, goTo: "section_complementaria" },
      ],
      defaultGoTo: "section_rep",
    },
    {
      id: "section_rep",
      title: "INFORMACIÓN DEL REPRESENTANTE LEGAL",
      fields: [front("q_1683166302"), back("q_1704898099")],
      defaultGoTo: "section_complementaria",
    },
    {
      id: "section_complementaria",
      title: "DOCUMENTACIÓN COMPLEMENTARIA",
      fields: [file("q_1837356140", "TESTIMONIO DE CONSTITUCIÓN")],
      defaultGoTo: "SUBMIT",
    },
  ],
};

const up = (name: string) => [{ path: `req-1/${name}`, filename: name }];
const idTasks = (tasks: DiditTask[]) =>
  tasks
    .filter((t) => t.feature === "id_verification")
    .map((t) => ({
      fieldKey: t.fieldKey,
      front: t.front.filename,
      back: t.back?.filename ?? null,
    }));

test("unipersonal (caso public:bc310017): solo su documento y el comprobante, nada de socios ni representante", () => {
  const { tasks, skipped } = planDiditTasks(FORM, {
    q_2029245471: "Pythas Holdings LLC",
    q_1834360375: "Unipersonal",
    q_871306237: up("poa.pdf"),
    q_1139987339: up("front.pdf"),
    q_303089462: up("back.pdf"),
  });

  assert.deepEqual(idTasks(tasks), [
    { fieldKey: "q_1139987339", front: "front.pdf", back: "back.pdf" },
  ]);
  assert.deepEqual(
    tasks.filter((t) => t.feature === "proof_of_address").map((t) => t.fieldKey),
    ["q_871306237"],
  );
  assert.equal(tasks.length, 2);
  assert.deepEqual(
    skipped.map((s) => [s.fieldKey, s.reason]),
    [
      ["q_1453350424", "not_reached"],
      ["q_1124275386", "not_reached"],
      ["q_957664702", "not_reached"],
      ["q_1019901945", "not_reached"],
      ["q_1683166302", "not_reached"],
      ["q_1704898099", "not_reached"],
    ],
  );
});

test("dos socios: un documento por persona, cada uno con su reverso", () => {
  const { tasks } = planDiditTasks(FORM, {
    q_1834360375: "Sociedad de responsabilidad limitada (S.R.L.)",
    q_871306237: up("poa.pdf"),
    q_1453350424: up("s1-front.pdf"),
    q_1124275386: up("s1-back.pdf"),
    q_957664702: up("s2-front.pdf"),
    q_1019901945: up("s2-back.pdf"),
    q_508440594: "Si",
  });

  assert.deepEqual(idTasks(tasks), [
    { fieldKey: "q_1453350424", front: "s1-front.pdf", back: "s1-back.pdf" },
    { fieldKey: "q_957664702", front: "s2-front.pdf", back: "s2-back.pdf" },
  ]);
});

test("documento opcional sin subir en una sección recorrida: sin tarea (no_input)", () => {
  const { tasks, skipped } = planDiditTasks(FORM, {
    q_1834360375: "Sociedad de responsabilidad limitada (S.R.L.)",
    q_871306237: up("poa.pdf"),
    q_1453350424: up("s1-front.pdf"),
    q_508440594: "No", // → sección del representante, que no sube documento
  });

  assert.deepEqual(idTasks(tasks), [
    { fieldKey: "q_1453350424", front: "s1-front.pdf", back: null },
  ]);
  const noInput = skipped.filter((s) => s.reason === "no_input").map((s) => s.fieldKey);
  assert.deepEqual(noInput, ["q_957664702", "q_1683166302"]);
});

test("respuestas sin podar (rama abandonada en un autosave): sus archivos nunca van a DIDIT", () => {
  // Llenó socios y representante, luego cambió a Unipersonal. El autosave
  // conserva esos archivos; una re-ejecución forzada no debe mandarlos.
  const { tasks } = planDiditTasks(FORM, {
    q_1834360375: "Unipersonal",
    q_871306237: up("poa.pdf"),
    q_1139987339: up("front.pdf"),
    q_1453350424: up("s1-front.pdf"),
    q_1124275386: up("s1-back.pdf"),
    q_957664702: up("s2-front.pdf"),
    q_508440594: "No",
    q_1683166302: up("rep-front.pdf"),
  });

  assert.deepEqual(idTasks(tasks), [
    { fieldKey: "q_1139987339", front: "front.pdf", back: null },
  ]);
});

test("sin respuestas a DIDIT no sale ninguna tarea", () => {
  const { tasks } = planDiditTasks(FORM, { q_1834360375: "Unipersonal" });
  assert.deepEqual(tasks, []);
});

test("database_validation sin número personal: sin tarea", () => {
  const def: FormDefinition = {
    version: 1,
    title: "t",
    locales: ["es"],
    defaultLocale: "es",
    sections: [
      {
        id: "s",
        title: "s",
        fields: [
          text("didit_db_first_name", { provider: "didit", feature: "database_validation" }),
          text("didit_db_personal_number"),
          text("didit_db_issuing_state"),
        ],
      },
    ],
  };

  const empty = planDiditTasks(def, { didit_db_first_name: "Boris" });
  assert.deepEqual(empty.tasks, []);
  assert.deepEqual(empty.skipped, [
    { feature: "database_validation", fieldKey: "didit_db_first_name", reason: "no_input" },
  ]);

  const full = planDiditTasks(def, {
    didit_db_first_name: "Boris",
    didit_db_personal_number: "1234567",
    didit_db_issuing_state: "BO",
  });
  assert.deepEqual(full.tasks, [
    {
      feature: "database_validation",
      fieldKey: "didit_db_first_name",
      body: { first_name: "Boris", personal_number: "1234567", issuing_state: "BO" },
    },
  ]);
});

test("reverso sin anverso previo en su sección: se omite (orphan_back)", () => {
  const def: FormDefinition = {
    ...FORM,
    sections: [{ id: "s", title: "s", fields: [back("q_b"), front("q_f")] }],
  };
  const { tasks, skipped } = planDiditTasks(def, { q_b: up("b.pdf"), q_f: up("f.pdf") });
  assert.deepEqual(idTasks(tasks), [{ fieldKey: "q_f", front: "f.pdf", back: null }]);
  assert.deepEqual(skipped, [
    { feature: "id_verification", fieldKey: "q_b", reason: "orphan_back" },
  ]);
});

test("isBackSide: key histórica o etiqueta; la mención al anverso gana", () => {
  assert.equal(isBackSide(back("q_303089462")), true);
  assert.equal(isBackSide(front("q_1139987339")), false);
  assert.equal(isBackSide(file("id_back", "Documento", ID)), true);
  assert.equal(isBackSide(file("q_1", "Parte posterior del documento", ID)), true);
  assert.equal(isBackSide(file("q_2", { es: "Reverso", en: "Back side" }, ID)), true);
  assert.equal(isBackSide(file("q_3", "Anverso (el reverso va en la siguiente pregunta)", ID)), false);
  assert.equal(isBackSide(file("q_4", "Feedback del cliente", ID)), false);
});

test("textAnswer lee números (campo `number` coaccionado por Zod)", () => {
  assert.equal(textAnswer({ m: 24000000439 }, "m"), "24000000439");
  assert.equal(textAnswer({ m: "  ABC-1 " }, "m"), "ABC-1");
  assert.equal(textAnswer({ m: Number.NaN }, "m"), "");
  assert.equal(textAnswer({}, "m"), "");
});
