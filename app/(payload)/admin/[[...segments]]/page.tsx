import { generatePageMetadata, RootPage } from "@payloadcms/next/views";
import configPromise from "@/payload.config";
import { importMap } from "../importMap";

type PageArgs = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<Record<string, string | string[]>>;
};

export const generateMetadata = async ({ params, searchParams }: PageArgs) =>
  generatePageMetadata({
    config: configPromise,
    params,
    searchParams,
  });

export default async function Page({ params, searchParams }: PageArgs) {
  return RootPage({
    config: configPromise,
    importMap,
    params,
    searchParams,
  });
}
