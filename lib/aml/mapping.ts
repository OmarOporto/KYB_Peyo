/**
 * Mapea los datos del formulario al subconjunto que se envía a DIDIT para AML.
 * AISLADO a propósito: los campos exactos están por definir; ajustar aquí
 * no afecta el resto del flujo.
 */
export function buildAmlSubject(
  formData: Record<string, unknown>,
): Record<string, unknown> {
  return {
    companyName: formData.legalName ?? formData.companyName ?? null,
    registrationNumber: formData.registrationNumber ?? null,
    country: formData.country ?? null,
    // TODO(DIDIT): beneficiarios finales, representantes, etc. cuando se definan.
    beneficialOwners: formData.beneficialOwners ?? [],
  };
}
