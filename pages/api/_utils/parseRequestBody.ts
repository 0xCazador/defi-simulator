import type { NextApiRequest } from "next";

export const parseRequestBody = <T>(body: NextApiRequest["body"]): T => {
  if (body === undefined || body === null || body === "") {
    return {} as T;
  }

  if (typeof body === "string") {
    return JSON.parse(body) as T;
  }

  if (Buffer.isBuffer(body)) {
    return JSON.parse(body.toString("utf8")) as T;
  }

  return body as T;
};
