import "@payloadcms/next/css";
import { RootLayout, metadata } from "@payloadcms/next/layouts";
import configPromise from "@/payload.config";
import { importMap } from "./admin/importMap";
import { serverFunction } from "./admin/[[...segments]]/server-function";

export { metadata };

export default async function PayloadRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return RootLayout({
    children,
    config: configPromise,
    importMap,
    serverFunction,
  });
}
