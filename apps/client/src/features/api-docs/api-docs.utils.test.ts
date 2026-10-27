import { describe, expect, it } from "vitest";
import {
  curlExample,
  describeType,
  operationsFromSpec,
} from "@/features/api-docs/api-docs.utils";

const spec = {
  openapi: "3.0.3",
  info: { title: "Docmost API", version: "1.0" },
  servers: [{ url: "https://docs.example.com" }],
  paths: {
    "/api/pages/import": {
      post: {
        tags: ["Import"],
        summary: "Import page",
        operationId: "Import_importPage",
        description: "Creates a page.",
        "x-docmost-scope": "write",
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  file: { type: "string", format: "binary" },
                  spaceId: { type: "string", format: "uuid" },
                },
                required: ["file", "spaceId"],
              },
            },
          },
        },
      },
    },
  },
};

describe("multipart operations", () => {
  const [op] = operationsFromSpec(spec);

  it("reads the multipart body and description", () => {
    expect(op.multipart).toBe(true);
    expect(op.description).toBe("Creates a page.");
    expect(describeType(op.body!.properties!.file)).toBe("file");
  });

  it("builds a curl -F example with fields before the file", () => {
    expect(curlExample("https://docs.example.com", op, null)).toBe(
      [
        'curl -X POST "https://docs.example.com/api/pages/import"',
        '  -H "Authorization: Bearer $DOCMOST_API_KEY"',
        '  -F "spaceId=<spaceId>"',
        '  -F "file=@path/to/file"',
      ].join(" \\\n"),
    );
  });
});
