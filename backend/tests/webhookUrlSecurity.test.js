
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
    isPublicIp,
    resolvePublicWebhookHost
} from "../src/services/webhookUrlSecurity.js";

describe("Webhook URL Security", () => {
    describe("Public IP classification", () => {
        it("should allow public IPv4 addresses", () => {
            assert.equal(isPublicIp("8.8.8.8"), true);
            assert.equal(isPublicIp("1.1.1.1"), true);
        });

        it("should block private and loopback IPv4 addresses", () => {
            assert.equal(isPublicIp("127.0.0.1"), false);
            assert.equal(isPublicIp("10.0.0.1"), false);
            assert.equal(isPublicIp("172.16.0.1"), false);
            assert.equal(isPublicIp("192.168.1.1"), false);
        });

        it("should block link-local IPv4 addresses", () => {
            assert.equal(isPublicIp("169.254.1.1"), false);
        });

        it("should allow public IPv6 addresses", () => {
            assert.equal(
                isPublicIp("2606:4700:4700::1111"),
                true
            );
        });

        it("should block private and loopback IPv6 addresses", () => {
            assert.equal(isPublicIp("::1"), false);
            assert.equal(isPublicIp("fc00::1"), false);
            assert.equal(isPublicIp("fe80::1"), false);
        });         it("should block reserved and documentation IPv4 addresses", () => {
            assert.equal(isPublicIp("192.0.2.1"), false);
            assert.equal(isPublicIp("198.51.100.1"), false);
            assert.equal(isPublicIp("203.0.113.1"), false);
            assert.equal(isPublicIp("100.64.0.1"), false);
            assert.equal(isPublicIp("224.0.0.1"), false);
            assert.equal(isPublicIp("255.255.255.255"), false);
        });

        it("should block reserved and multicast IPv6 addresses", () => {
            assert.equal(isPublicIp("2001:db8::1"), false);
            assert.equal(isPublicIp("ff02::1"), false);
        });


        it("should reject invalid IP addresses", () => {
            assert.equal(isPublicIp("not-an-ip"), false);
            assert.equal(isPublicIp("999.999.999.999"), false);
        });
    });

    describe("DNS resolution", () => {
        it("should return resolved public addresses", async () => {
            const mockResolver = async () => [
                {
                    address: "8.8.8.8",
                    family: 4
                },
                {
                    address: "2606:4700:4700::1111",
                    family: 6
                }
            ];

            const result = await resolvePublicWebhookHost(
                "example.com",
                mockResolver
            );

            assert.equal(result.length, 2);
            assert.equal(result[0].address, "8.8.8.8");
            assert.equal(result[1].family, 6);
        });

        it("should reject a hostname resolving to a private IP", async () => {
            const mockResolver = async () => [
                {
                    address: "8.8.8.8",
                    family: 4
                },
                {
                    address: "192.168.1.10",
                    family: 4
                }
            ];

            await assert.rejects(
                resolvePublicWebhookHost(
                    "example.com",
                    mockResolver
                ),
                /non-public IP/
            );
        });

        it("should reject loopback DNS results", async () => {
            const mockResolver = async () => [
                {
                    address: "127.0.0.1",
                    family: 4
                }
            ];

            await assert.rejects(
                resolvePublicWebhookHost(
                    "example.com",
                    mockResolver
                ),
                /non-public IP/
            );
        });

        it("should reject empty DNS results", async () => {
            const mockResolver = async () => [];

            await assert.rejects(
                resolvePublicWebhookHost(
                    "example.com",
                    mockResolver
                ),
                /no valid IP addresses/
            );
        });

        it("should reject DNS resolution failures", async () => {
            const mockResolver = async () => {
                throw new Error("DNS failure");
            };

            await assert.rejects(
                resolvePublicWebhookHost(
                    "example.com",
                    mockResolver
                ),
                /could not be resolved/
            );
        });

        it("should reject IP literal hostnames", async () => {
            await assert.rejects(
                resolvePublicWebhookHost("127.0.0.1"),
                /public hostname/
            );
        });

        it("should reject invalid hostnames", async () => {
            await assert.rejects(
                resolvePublicWebhookHost(""),
                /Invalid webhook hostname/
            );
        });

        it("should reject invalid DNS resolver arguments", async () => {
            await assert.rejects(
                resolvePublicWebhookHost("example.com", null),
                /Invalid DNS resolver/
            );
        });
    });
});
