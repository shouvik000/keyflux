
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import {
    sendWebhookRequest
} from "../src/services/webhookHttpClient.js";

const TEST_SIGNATURE = "a".repeat(64);
const TEST_PAYLOAD = JSON.stringify({ event: "RATE_LIMIT_WARNING" });

function createMockRequest({
    statusCode = 200,
    responseBody = '{"received":true}'
} = {}) {
    let requestOptions;
    let requestCallback;
    let sentPayload;
    let timeout;
    let destroyedError;

    const request = new EventEmitter();

    request.setTimeout = (milliseconds, callback) => {
        timeout = milliseconds;
        request.timeoutCallback = callback;
    };

    request.destroy = (error) => {
        destroyedError = error;
        request.emit("error", error);
    };

    request.end = (payload) => {
        sentPayload = payload;

        const response = new EventEmitter();
        response.statusCode = statusCode;

        requestCallback(response);

        queueMicrotask(() => {
            if (!destroyedError) {
                response.emit("data", Buffer.from(responseBody));
                response.emit("end");
            }
        });
    };

    return {
        implementation(options, callback) {
            requestOptions = options;
            requestCallback = callback;
            return request;
        },
        get options() {
            return requestOptions;
        },
        get payload() {
            return sentPayload;
        },
        get timeout() {
            return timeout;
        },
        get destroyedError() {
            return destroyedError;
        },
        request
    };
}

describe("Webhook HTTPS Client", () => {
    it("should send a signed POST request to a validated public IP", async () => {
        const mock = createMockRequest();

        const result = await sendWebhookRequest({
            url: "https://example.com/webhooks/keyflux",
            payload: TEST_PAYLOAD,
            signature: TEST_SIGNATURE,
            resolver: async () => [
                { address: "8.8.8.8", family: 4 }
            ],
            requestImpl: mock.implementation
        });

        assert.equal(result.statusCode, 200);
        assert.equal(result.body, '{"received":true}');
        assert.equal(mock.payload, TEST_PAYLOAD);

        assert.equal(mock.options.hostname, "example.com");
        assert.equal(mock.options.servername, "example.com");
        assert.equal(mock.options.port, 443);
        assert.equal(mock.options.method, "POST");
        assert.equal(mock.options.agent, false);
        assert.equal(mock.options.rejectUnauthorized, true);

        assert.equal(
            mock.options.headers["X-KeyFlux-Signature"],
            `sha256=${TEST_SIGNATURE}`
        );

        assert.equal(mock.options.headers.Host, "example.com");
        assert.equal(mock.timeout, 10_000);

        let lookupResult;

        mock.options.lookup(
            "example.com",
            {},
            (...args) => {
                lookupResult = args;
            }
        );

        assert.deepEqual(
            lookupResult,
            [null, "8.8.8.8", 4]
        );
    });

    it("should reject a hostname resolving to a private IP", async () => {
        await assert.rejects(
            sendWebhookRequest({
                url: "https://example.com/webhook",
                payload: TEST_PAYLOAD,
                signature: TEST_SIGNATURE,
                resolver: async () => [
                    { address: "192.168.1.10", family: 4 }
                ],
                requestImpl: () => {
                    assert.fail("HTTPS request must not be created.");
                }
            }),
            /non-public IP/
        );
    });

    it("should reject a hostname with mixed public and private addresses", async () => {
        await assert.rejects(
            sendWebhookRequest({
                url: "https://example.com/webhook",
                payload: TEST_PAYLOAD,
                signature: TEST_SIGNATURE,
                resolver: async () => [
                    { address: "8.8.8.8", family: 4 },
                    { address: "127.0.0.1", family: 4 }
                ],
                requestImpl: () => {
                    assert.fail("HTTPS request must not be created.");
                }
            }),
            /non-public IP/
        );
    });

    it("should reject non-HTTPS URLs", async () => {
        await assert.rejects(
            sendWebhookRequest({
                url: "http://example.com/webhook",
                payload: TEST_PAYLOAD,
                signature: TEST_SIGNATURE,
                requestImpl: () => {
                    assert.fail("HTTPS request must not be created.");
                }
            }),
            /Invalid webhook destination/
        );
    });

    it("should reject invalid signatures", async () => {
        await assert.rejects(
            sendWebhookRequest({
                url: "https://example.com/webhook",
                payload: TEST_PAYLOAD,
                signature: "invalid",
                requestImpl: () => {
                    assert.fail("HTTPS request must not be created.");
                }
            }),
            /Invalid webhook signature/
        );
    });

    it("should reject URLs containing credentials", async () => {
        await assert.rejects(
            sendWebhookRequest({
                url: "https://user:password@example.com/webhook",
                payload: TEST_PAYLOAD,
                signature: TEST_SIGNATURE,
                requestImpl: () => {
                    assert.fail("HTTPS request must not be created.");
                }
            }),
            /Invalid webhook destination/
        );
    });

    it("should reject URLs using a non-standard port", async () => {
        await assert.rejects(
            sendWebhookRequest({
                url: "https://example.com:8443/webhook",
                payload: TEST_PAYLOAD,
                signature: TEST_SIGNATURE,
                requestImpl: () => {
                    assert.fail("HTTPS request must not be created.");
                }
            }),
            /Invalid webhook destination/
        );
    });

    it("should reject invalid request implementations", async () => {
        await assert.rejects(
            sendWebhookRequest({
                url: "https://example.com/webhook",
                payload: TEST_PAYLOAD,
                signature: TEST_SIGNATURE,
                requestImpl: null
            }),
            /Invalid HTTPS request implementation/
        );
    });

    it("should preserve the query string in the request path", async () => {
        const mock = createMockRequest();

        await sendWebhookRequest({
            url: "https://example.com/webhook?source=keyflux",
            payload: TEST_PAYLOAD,
            signature: TEST_SIGNATURE,
            resolver: async () => [
                { address: "8.8.8.8", family: 4 }
            ],
            requestImpl: mock.implementation
        });

        assert.equal(
            mock.options.path,
            "/webhook?source=keyflux"
        );
    });

    it("should provide all validated addresses when lookup requests all records", async () => {
        const mock = createMockRequest();

        await sendWebhookRequest({
            url: "https://example.com/webhook",
            payload: TEST_PAYLOAD,
            signature: TEST_SIGNATURE,
            resolver: async () => [
                { address: "8.8.8.8", family: 4 },
                { address: "2606:4700:4700::1111", family: 6 }
            ],
            requestImpl: mock.implementation
        });

        let lookupResult;

        mock.options.lookup(
            "example.com",
            { all: true },
            (...args) => {
                lookupResult = args;
            }
        );

        assert.equal(lookupResult[0], null);
        assert.equal(lookupResult[1].length, 2);
    });
});
