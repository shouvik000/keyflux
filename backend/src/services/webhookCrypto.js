
import {
    createCipheriv,
    createDecipheriv,
    createHmac,
    randomBytes
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey() {
    const key = process.env.WEBHOOK_ENCRYPTION_KEY;

    if (!/^[a-f0-9]{64}$/i.test(key ?? "")) {
        throw new Error(
            "WEBHOOK_ENCRYPTION_KEY must be a 64-character hexadecimal key."
        );
    }

    return Buffer.from(key, "hex");
}

export function encryptWebhookSecret(secret) {
    if (typeof secret !== "string" || secret.length < 32) {
        throw new TypeError(
            "Webhook secret must contain at least 32 characters."
        );
    }

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(
        ALGORITHM,
        getEncryptionKey(),
        iv
    );

    const encrypted = Buffer.concat([
        cipher.update(secret, "utf8"),
        cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    return [
        iv.toString("hex"),
        authTag.toString("hex"),
        encrypted.toString("hex")
    ].join(":");
}

export function decryptWebhookSecret(encryptedSecret) {
    if (typeof encryptedSecret !== "string") {
        throw new TypeError("Invalid encrypted webhook secret.");
    }

    const parts = encryptedSecret.split(":");

    if (parts.length !== 3) {
        throw new TypeError("Invalid encrypted webhook secret format.");
    }

    const [ivHex, authTagHex, encryptedHex] = parts;

    if (
        !/^[a-f0-9]{24}$/i.test(ivHex) ||
        !/^[a-f0-9]{32}$/i.test(authTagHex) ||
        !/^(?:[a-f0-9]{2})+$/i.test(encryptedHex)
    ) {
        throw new TypeError("Invalid encrypted webhook secret format.");
    }

    const decipher = createDecipheriv(
        ALGORITHM,
        getEncryptionKey(),
        Buffer.from(ivHex, "hex")
    );

    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

    return Buffer.concat([
        decipher.update(Buffer.from(encryptedHex, "hex")),
        decipher.final()
    ]).toString("utf8");
}

export function signWebhookPayload(secret, payload) {
    if (typeof secret !== "string" || secret.length === 0) {
        throw new TypeError("Invalid webhook signing secret.");
    }

    if (typeof payload !== "string") {
        throw new TypeError("Webhook payload must be a string.");
    }

    return createHmac("sha256", secret)
        .update(payload, "utf8")
        .digest("hex");
}
