import { GRAPHQL_PLAYGROUND_GET, GRAPHQL_POST } from "@payloadcms/next/routes";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";
import { InputValidationError, parseJsonBody, v } from "@/lib/request-validation";
import configPromise from "@/payload.config";

const playgroundGet = GRAPHQL_PLAYGROUND_GET(configPromise);
const graphqlPost = GRAPHQL_POST(configPromise);

const graphqlBodySchema = v.object({
  query: v.string({ trim: true, minLength: 1, maxLength: 50_000 }),
  operationName: v.string({ trim: true, maxLength: 120, optional: true, nullable: true }),
  variables: v.object({}, { optional: true, nullable: true, allowUnknown: true }),
  extensions: v.object({}, { optional: true, nullable: true, allowUnknown: true }),
});

export async function GET(request: Request) {
  const rateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "graphql-playground-get",
    scope: "read",
  });
  if (rateLimitResponse) return rateLimitResponse;
  return playgroundGet(request);
}

export async function POST(request: Request) {
  const rateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "graphql-post",
    scope: "expensive",
  });
  if (rateLimitResponse) return rateLimitResponse;
  try {
    await parseJsonBody(request.clone(), graphqlBodySchema);
  } catch (error) {
    if (error instanceof InputValidationError) {
      return Response.json({ message: error.message }, { status: 400 });
    }
    throw error;
  }
  return graphqlPost(request);
}
