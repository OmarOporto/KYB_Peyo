<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Commits

Every commit message in this repo starts with the `[KYB]` tag, before the
conventional-commits type:

```
[KYB] feat(admin): la fila entera navega al detalle
[KYB] fix(admin): oculta el sidebar en la impresión del informe
[KYB] chore(ci): lee los logs de Vercel por API
```

Commit subjects are written in Spanish, in the imperative. `commitlint.config.mjs`
enforces the tag (its parser expects it), so a message without `[KYB]` is rejected
by the `commit-msg` hook.
