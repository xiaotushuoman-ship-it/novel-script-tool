import { forwardAistarsLabRequest } from "./aistarslab/[...path].js";

export default async function handler(request, response) {
  await forwardAistarsLabRequest(request, response);
}
