
import {
    describe,
    it,
    before,
    after
} from "node:test";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import {
    encryptWebhookSecret,
    decryptWebhookSecret,
    signWebhookPayload
} from "../src/services/webhookCrypto.js";

const originalKey = process.env.WEBHOOK_ENCRYPTION_KEY;

before(() => {
    process.env.WEBHOOK_ENCRYPTION_KEY =
        randomBytes(32).toString("hex");
});

after(() => {
    if (originalKey === undefined) {
        delete process.env.WEBHOOK_ENCRYPTION_KEY;
    } else {
        process.env.WEBHOOK_ENCRYPTION_KEY = originalKey;
    }
});

describe("Webhook Crypto", () => {
    it("encrypts and decrypts a webhook secret", () => {
        const secret = randomBytes(32).toString("hex");

        const encrypted = encryptWebhookSecret(secret);
        const decrypted = decryptWebhookSecret(encrypted);

        assert.notEqual(encrypted, secret);
        assert.equal(decrypted, secret);
    });

    it("generates different ciphertext for the same secret", () => {
        const secret = randomBytes(32).toString("hex");

        const first = encryptWebhookSecret(secret);
        const second = encryptWebhookSecret(secret);

        assert.notEqual(first, second);

        assert.equal(decryptWebhookSecret(first), secret);
        assert.equal(decryptWebhookSecret(second), secret);
    });

    it("rejects a modified encrypted secret", () => {
        const secret = randomBytes(32).toString("hex");
        const encrypted = encryptWebhookSecret(secret);

        const parts = encrypted.split(":");

        parts[2] = parts[2].replace(
            /^./,
            parts[2][0] === "a" ? "b" : "a"
        );

        assert.throws(
            () => decryptWebhookSecret(parts.join(":"))
        );
    });

    it("rejects an invalid encrypted secret format", () => {
        assert.throws(
            () => decryptWebhookSecret("invalid")
        );
    });

    it("generates a consistent HMAC-SHA256 signature", () => {
        const secret = randomBytes(32).toString("hex");

        const payload = JSON.stringify({
            event: "RATE_LIMIT_WARNING",
            usageCount: 80
        });

        const first = signWebhookPayload(secret, payload);
        const second = signWebhookPayload(secret, payload);

        assert.equal(first, second);
        assert.match(first, /^[a-f0-9]{64}$/);
    });

    it("generates different signatures for different payloads", () => {
        const secret = randomBytes(32).toString("hex");

        const first = signWebhookPayload(
            secret,
            '{"event":"RATE_LIMIT_WARNING"}'
        );

        const second = signWebhookPayload(
            secret,
            '{"event":"RATE_LIMIT_EXCEEDED"}'
        );

        assert.notEqual(first, second);
    });

    it("rejects webhook secrets shorter than 32 characters", () => {
        assert.throws(
            () => encryptWebhookSecret("short-secret"),
            /at least 32 characters/
        );
    });
});
