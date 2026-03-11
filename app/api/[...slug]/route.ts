import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from "@payloadcms/next/routes";
import { enforcePublicApiRateLimit } from "@/lib/public-rate-limit";
import { InputValidationError, parseRouteParams, v } from "@/lib/request-validation";
import configPromise from "@/payload.config";

const restGet = REST_GET(configPromise);
const restPost = REST_POST(configPromise);
const restDelete = REST_DELETE(configPromise);
const restPatch = REST_PATCH(configPromise);
const restPut = REST_PUT(configPromise);
const restOptions = REST_OPTIONS(configPromise);

type RouteContext = {
  params: Promise<{
    slug?: string[];
  }>;
};

const paramsSchema = v.object({
  slug: v.array(v.string({ trim: true, minLength: 1, maxLength: 120 }), { maxItems: 16, optional: true }),
});

export async function GET(request: Request, context: RouteContext) {
  const rateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "payload-rest-get",
    scope: "read",
  });
  if (rateLimitResponse) return rateLimitResponse;
  try {
    parseRouteParams(await context.params, paramsSchema);
  } catch (error) {
    if (error instanceof InputValidationError) {
      return Response.json({ message: error.message }, { status: 400 });
    }
    throw error;
  }
  return restGet(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  const rateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "payload-rest-post",
    scope: "write",
  });
  if (rateLimitResponse) return rateLimitResponse;
  try {
    parseRouteParams(await context.params, paramsSchema);
  } catch (error) {
    if (error instanceof InputValidationError) {
      return Response.json({ message: error.message }, { status: 400 });
    }
    throw error;
  }
  return restPost(request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
  const rateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "payload-rest-delete",
    scope: "write",
  });
  if (rateLimitResponse) return rateLimitResponse;
  try {
    parseRouteParams(await context.params, paramsSchema);
  } catch (error) {
    if (error instanceof InputValidationError) {
      return Response.json({ message: error.message }, { status: 400 });
    }
    throw error;
  }
  return restDelete(request, context);
}

export async function PATCH(request: Request, context: RouteContext) {
  const rateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "payload-rest-patch",
    scope: "write",
  });
  if (rateLimitResponse) return rateLimitResponse;
  try {
    parseRouteParams(await context.params, paramsSchema);
  } catch (error) {
    if (error instanceof InputValidationError) {
      return Response.json({ message: error.message }, { status: 400 });
    }
    throw error;
  }
  return restPatch(request, context);
}

export async function PUT(request: Request, context: RouteContext) {
  const rateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "payload-rest-put",
    scope: "write",
  });
  if (rateLimitResponse) return rateLimitResponse;
  try {
    parseRouteParams(await context.params, paramsSchema);
  } catch (error) {
    if (error instanceof InputValidationError) {
      return Response.json({ message: error.message }, { status: 400 });
    }
    throw error;
  }
  return restPut(request, context);
}

export async function OPTIONS(request: Request, context: RouteContext) {
  const rateLimitResponse = enforcePublicApiRateLimit(request, {
    feature: "payload-rest-options",
    scope: "read",
    ipPerMinute: 300,
  });
  if (rateLimitResponse) return rateLimitResponse;
  try {
    parseRouteParams(await context.params, paramsSchema);
  } catch (error) {
    if (error instanceof InputValidationError) {
      return Response.json({ message: error.message }, { status: 400 });
    }
    throw error;
  }
  return restOptions(request, context);
}
