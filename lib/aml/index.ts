import "server-only";
import { env } from "@/lib/env";
import type { AmlProvider } from "@/lib/aml/provider";
import { MockAmlProvider } from "@/lib/aml/mock";
import { DiditAmlProvider } from "@/lib/aml/didit";

export function getAmlProvider(): AmlProvider {
  return env.amlProvider() === "didit"
    ? new DiditAmlProvider()
    : new MockAmlProvider();
}

export * from "@/lib/aml/provider";
