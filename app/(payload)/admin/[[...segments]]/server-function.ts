import { handleServerFunctions } from "@payloadcms/next/layouts";
import configPromise from "@/payload.config";
import { importMap } from "../importMap";

export async function serverFunction(args: {
  name: string;
  args: Record<string, unknown>;
}) {
  "use server";

  return handleServerFunctions({
    ...args,
    config: configPromise,
    importMap,
  });
}
