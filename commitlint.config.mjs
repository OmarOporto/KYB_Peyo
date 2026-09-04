// Convención de mensajes de commit. La corre el hook .husky/commit-msg en cada
// `git commit`; no corre en CI, así que es un guard local, no un gate de deploy.
//
// Base: Conventional Commits (@commitlint/config-conventional). Abajo sólo están
// las desviaciones respecto de ese default, cada una con su motivo. Si algo no
// aparece acá, vale el default del preset.
//
// Va en .mjs y no en .js porque package.json no declara "type": "module": un .js
// con `export default` se parsearía como CommonJS y el config no cargaría.
//
// Escape hatch: `git commit --no-verify` saltea el hook. Existe a propósito para
// commits de emergencia; no es la vía normal.
// Asignado a una constante en vez de exportarse anónimo: el ESLint del repo
// avisa con import/no-anonymous-default-export si se exporta el objeto literal.
const config = {
  extends: ["@commitlint/config-conventional"],

  // Todos los commits del repo arrancan con el tag `[KYB]` (ver AGENTS.md). El
  // parser de Conventional Commits espera `type(scope): subject` al principio
  // de la línea, así que sin este override el tag se come el type y commitlint
  // rebota con type-empty/subject-empty. Sólo se le antepone el prefijo al
  // patrón por defecto; el resto (scope opcional, `!` de breaking change) queda
  // igual.
  parserPreset: {
    parserOpts: {
      headerPattern: /^\[KYB\] (\w*)(?:\((.*)\))?!?: (.*)$/,
      headerCorrespondence: ["type", "scope", "subject"],
    },
  },

  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",     // funcionalidad nueva visible para algún usuario
        "fix",      // corrección de un comportamiento roto
        "perf",     // misma conducta, menos costo (egress, queries, bundle)
        "refactor", // misma conducta, otra forma
        "docs",     // documentación y comentarios
        "test",     // tests que se agregan o arreglan
        "build",    // build, bundling, dependencias
        "ci",       // workflows de GitHub Actions, deploy
        "chore",    // tareas sin impacto en el producto
        "revert",   // revierte un commit anterior
      ],
    ],

    // Alcances del proyecto. En warning (1) a propósito: un alcance nuevo y
    // legítimo no debe bloquear un commit, sólo avisar para que lo agreguemos
    // acá si se vuelve recurrente.
    "scope-enum": [
      1,
      "always",
      [
        "admin",    // app/admin — panel interno
        "forms",    // lib/forms, components/forms, app/f — formularios KYB
        "didit",    // lib/didit — proveedor KYC
        "aml",      // lib/aml
        "auth",     // lib/auth, lib/tokens — sesiones y tokens de acceso
        "api",      // app/api — endpoints públicos
        "db",       // supabase/migrations, seed
        "webhooks", // cola durable de entregas
        "i18n",     // messages/, lib/i18n-ai, scripts/form-i18n
        "mail",     // lib/mail
        "ui",       // components/ui, theming
        "ci",       // .github/workflows, scripts/vercel-deploy.mjs
        "deps",     // dependencias
      ],
    ],

    // 78 = los 72 de antes + los 6 que ocupa `[KYB] `, para que el tag no le
    // recorte presupuesto al subject. El detalle va al cuerpo, que no tiene
    // ese límite.
    "header-max-length": [2, "always", 78],

    // Apagada. El default prohíbe subject en sentence-case, pero el vocabulario
    // de dominio suele estar lleno de nombres propios y siglas (DIDIT, AML, KYB)
    // que darían falso positivo. La convención de arrancar en minúscula salvo
    // nombre propio queda como acuerdo humano.
    "subject-case": [0],
  },
};

export default config;
