import { Config, Context } from "@netlify/functions";

async function handler(request: Request, context: Context): Promise<Response> {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

export default async (
  request: Request,
  context: Context
): Promise<Response> => {
  return await handler(request, context);
};

export const config: Config = {
  path: "/bot",
  // method: "POST",
};
