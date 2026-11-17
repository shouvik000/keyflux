
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

const ALLOWED_IP_RANGES = new Set(["unicast"]);

export function isPublicIp(address) {
    try {
        const parsed = ipaddr.process(address);
        return ALLOWED_IP_RANGES.has(parsed.range());
    } catch {
        return false;
    }
}

export async function resolvePublicWebhookHost(
    hostname,
    resolver = lookup
) {
    if (
        typeof hostname !== "string" ||
        hostname.trim() === ""
    ) {
        throw new TypeError("Invalid webhook hostname.");
    }

    if (typeof resolver !== "function") {
        throw new TypeError("Invalid DNS resolver.");
    }

    const normalizedHostname = hostname
        .toLowerCase()
        .replace(/\.$/, "");

    if (isIP(normalizedHostname) !== 0) {
        throw new TypeError(
            "Webhook destinations must use a public hostname."
        );
    }

    let addresses;

    try {
        addresses = await resolver(normalizedHostname, {
            all: true,
            verbatim: true
        });
    } catch {
        throw new TypeError(
            "Webhook hostname could not be resolved."
        );
    }

    if (
        !Array.isArray(addresses) ||
        addresses.length === 0
    ) {
        throw new TypeError(
            "Webhook hostname has no valid IP addresses."
        );
    }

    for (const record of addresses) {
        if (
            !record ||
            typeof record.address !== "string" ||
            !isPublicIp(record.address)
        ) {
            throw new TypeError(
                "Webhook hostname resolves to a non-public IP address."
            );
        }
    }

    return addresses.map((record) => ({
        address: record.address,
        family: record.family
    }));
}
