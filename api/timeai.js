import { forwardTimeAiRequest } from "./timeai/[...path].js";

export default async function handler(request, response) {
  const rawPath = request.query.path || "";
  await forwardTimeAiRequest(request, response, rawPath);
}
