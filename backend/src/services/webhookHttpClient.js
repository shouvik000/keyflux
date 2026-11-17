
import https from "node:https";

import {
    resolvePublicWebhookHost
} from "./webhookUrlSecurity.js";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 16 * 1024;

export async function sendWebhookRequest({
    url,
    payload,
    signature,
    resolver,
    requestImpl = https.request
}) {
    if (typeof url !== "string") {
        throw new TypeError("Invalid webhook URL.");
    }

    if (typeof payload !== "string") {
        throw new TypeError("Webhook payload must be a string.");
    }

    if (typeof signature !== "string" || signature.length !== 64) {
        throw new TypeError("Invalid webhook signature.");
    }

    if (typeof requestImpl !== "function") {
        throw new TypeError("Invalid HTTPS request implementation.");
    }

    const parsedUrl = new URL(url);

    if (
        parsedUrl.protocol !== "https:" ||
        !parsedUrl.hostname ||
        parsedUrl.username ||
        parsedUrl.password ||
        parsedUrl.hash ||
        (parsedUrl.port && parsedUrl.port !== "443")
    ) {
        throw new TypeError("Invalid webhook destination.");
    }

    const hostname = parsedUrl.hostname
        .toLowerCase()
        .replace(/^\[|\]$/g, "");

    const addresses = await resolvePublicWebhookHost(
        hostname,
        resolver
    );

    const selectedAddress = addresses[0];

    return new Promise((resolve, reject) => {
        let settled = false;
        let responseBytes = 0;
        let responseBody = "";

        const finish = (callback, value) => {
            if (settled) {
                return;
            }

            settled = true;
            callback(value);
        };

        const request = requestImpl(
            {
                protocol: "https:",
                hostname,
                port: 443,
                method: "POST",
                path: `${parsedUrl.pathname}${parsedUrl.search}`,

                agent: false,

                servername: hostname,
                rejectUnauthorized: true,

                lookup: (_hostname, options, callback) => {
                    if (options.all) {
                        callback(null, addresses);
                        return;
                    }

                    callback(
                        null,
                        selectedAddress.address,
                        selectedAddress.family
                    );
                },

                headers: {
                    Host: hostname,
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(payload),
                    "X-KeyFlux-Signature": `sha256=${signature}`,
                    "User-Agent": "KeyFlux-Webhook/1.0"
                },

                maxHeaderSize: 8 * 1024
            },
            (response) => {
                response.on("data", (chunk) => {
                    responseBytes += chunk.length;

                    if (responseBytes > MAX_RESPONSE_BYTES) {
                        request.destroy(
                            new Error("Webhook response exceeded size limit.")
                        );
                        return;
                    }

                    responseBody += chunk.toString("utf8");
                });

                response.on("end", () => {
                    finish(resolve, {
                        statusCode: response.statusCode ?? 0,
                        body: responseBody
                    });
                });

                response.on("error", (error) => {
                    finish(reject, error);
                });
            }
        );

        request.setTimeout(REQUEST_TIMEOUT_MS, () => {
            request.destroy(
                new Error("Webhook request timed out.")
            );
        });

        request.on("error", (error) => {
            finish(reject, error);
        });

        request.end(payload);
    });
}
