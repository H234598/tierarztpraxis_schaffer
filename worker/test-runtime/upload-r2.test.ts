import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { validatedUploadStream } from "../src/transfers/uploads";

function uploadBody(...chunks: number[][]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk));
      controller.close();
    },
  });
}

describe("Workerd R2-Upload", () => {
  it("speichert validierten Mehrchunk-Stream mit echter FixedLengthStream", async () => {
    const key = "runtime/jpeg";
    const bucket = env.TRANSFER_FILES!;
    const object = await bucket.put(
      key,
      uploadBody([0xff], [0xd8, 0xff])
        .pipeThrough(validatedUploadStream({ size: 3, mediaType: "image/jpeg" }))
        .pipeThrough(new FixedLengthStream(3)),
      { onlyIf: { etagDoesNotMatch: "*" } },
    );
    expect(object).not.toBeNull();
    expect(object?.size).toBe(3);
    expect(await (await bucket.get(key))?.arrayBuffer()).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff]).buffer,
    );
  });
});
