import "server-only";

type ReadSecretOptions = {
  /**
   * Optional fallback to keep legacy behavior while migrating env names.
   */
  fallbackName?: string;
  /**
   * Optional default value for non-sensitive settings (for example model IDs).
   */
  defaultValue?: string;
  /**
   * Whether missing values should throw. Defaults to true.
   */
  required?: boolean;
};

const isPublicEnvName = (name: string) => name.startsWith("NEXT_PUBLIC_");

const readRaw = (name: string): string => process.env[name]?.trim() ?? "";

export const readServerSecret = (name: string, options: ReadSecretOptions = {}): string => {
  if (isPublicEnvName(name)) {
    throw new Error(`Refusing to read secret from public env var: ${name}.`);
  }

  const direct = readRaw(name);
  if (direct) return direct;

  const fallbackName = options.fallbackName?.trim();
  if (fallbackName) {
    if (isPublicEnvName(fallbackName)) {
      // Keep compatibility but make the risk explicit at runtime.
      console.warn(`Security warning: using public fallback env "${fallbackName}" for server secret "${name}".`);
    }
    const fallbackValue = readRaw(fallbackName);
    if (fallbackValue) return fallbackValue;
  }

  if (options.defaultValue !== undefined) return options.defaultValue;
  if (options.required === false) return "";

  const fallbackHint = fallbackName ? ` or ${fallbackName}` : "";
  throw new Error(`Missing required server environment variable: ${name}${fallbackHint}.`);
};
