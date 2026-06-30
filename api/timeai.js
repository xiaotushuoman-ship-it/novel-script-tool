import { forwardTimeAiRequest } from "./timeai/[...path].js";

export const config = {
  maxDuration: 300,
};

export default async function handler(request, response) {
  const rawPath = request.query.path || "";
  await forwardTimeAiRequest(request, response, rawPath);
}
