import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import test from "node:test";

import { JulesApiClient, JulesApiError } from "./jules-api.js";

function json(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, {
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(body));
}

async function withServer<T>(
  handler: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => void,
  callback: (url: string) => Promise<T>,
): Promise<T> {
  const server = createServer(handler);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert(address && typeof address === "object");

  try {
    return await callback(
      `http://127.0.0.1:${address.port}`,
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}

test("JulesApiClient parses sessions and paginates ListSessions", async () => {
  const seen: string[] = [];

  await withServer(
    (request, response) => {
      seen.push(request.url ?? "");
      assert.equal(
        request.headers["x-goog-api-key"],
        "test-key",
      );

      if (request.url === "/sessions/s-1") {
        json(response, 200, {
          name: "sessions/s-1",
          state: "IN_PROGRESS",
          extraAlphaField: true,
        });
        return;
      }

      if (request.url === "/sessions?pageSize=100") {
        json(response, 200, {
          sessions: [
            {
              name: "sessions/s-1",
              title: "[TASK-001] Test",
              state: "QUEUED",
            },
          ],
          nextPageToken: "next",
        });
        return;
      }

      if (request.url === "/sessions?pageSize=100&pageToken=next") {
        json(response, 200, {
          sessions: [
            {
              id: "s-2",
              title: "[TASK-002] Test",
              state: "COMPLETED",
              outputs: [
                {
                  pullRequest: {
                    url: "https://github.com/o/r/pull/1",
                  },
                },
              ],
            },
          ],
        });
        return;
      }

      json(response, 404, {});
    },
    async (baseUrl) => {
      const client = new JulesApiClient({
        apiKey: "test-key",
        baseUrl,
      });

      const session = await client.getSession("s-1");
      assert.equal(session.id, "s-1");
      assert.equal(session.state, "IN_PROGRESS");

      const listed = await client.listSessions();
      assert.equal(listed.pages, 2);
      assert.equal(listed.sessions.length, 2);
      assert.equal(
        listed.sessions[1].outputs[0].pullRequest?.url,
        "https://github.com/o/r/pull/1",
      );
      assert.deepEqual(seen, [
        "/sessions/s-1",
        "/sessions?pageSize=100",
        "/sessions?pageSize=100&pageToken=next",
      ]);
    },
  );
});

test("JulesApiClient classifies API failures without exposing credentials", async () => {
  await withServer(
    (_request, response) => {
      json(response, 429, {
        error: {
          message: "quota exceeded",
        },
      });
    },
    async (baseUrl) => {
      const client = new JulesApiClient({
        apiKey: "secret-value",
        baseUrl,
      });

      await assert.rejects(
        () => client.getSession("s-1"),
        (error) => {
          assert(error instanceof JulesApiError);
          assert.equal(error.kind, "rate_limited");
          assert.equal(error.status, 429);
          assert(!error.message.includes("secret-value"));
          return true;
        },
      );
    },
  );
});
