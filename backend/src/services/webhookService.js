
import { randomBytes } from "node:crypto";
import { isIP } from "node:net";

import pool from "../config/database.js";
import { encryptWebhookSecret } from "./webhookCrypto.js";

const ALLOWED_EVENTS = [
    "RATE_LIMIT_WARNING",
    "RATE_LIMIT_EXCEEDED"
];

function validateProjectId(projectId) {
    if (
        !Number.isSafeInteger(Number(projectId)) ||
        Number(projectId) < 1
    ) {
        throw new TypeError("Invalid project ID.");
    }

    return Number(projectId);
}

function validateWebhookId(webhookId) {
    if (
        !Number.isSafeInteger(Number(webhookId)) ||
        Number(webhookId) < 1
    ) {
        throw new TypeError("Invalid webhook ID.");
    }

    return Number(webhookId);
}

function validateName(name) {
    if (
        typeof name !== "string" ||
        name.trim().length < 1 ||
        name.trim().length > 100
    ) {
        throw new TypeError(
            "Webhook name must contain between 1 and 100 characters."
        );
    }

    return name.trim();
}

function validateWebhookUrl(value) {
    if (typeof value !== "string" || value.length > 2048) {
        throw new TypeError("Invalid webhook URL.");
    }

    let parsedUrl;

    try {
        parsedUrl = new URL(value);
    } catch {
        throw new TypeError("Invalid webhook URL.");
    }

    const hostname = parsedUrl.hostname
        .toLowerCase()
        .replace(/^\[|\]$/g, "");

    if (
        parsedUrl.protocol !== "https:" ||
        !hostname ||
        parsedUrl.username ||
        parsedUrl.password ||
        parsedUrl.hash ||
        (parsedUrl.port && parsedUrl.port !== "443") ||
        isIP(hostname) !== 0 ||
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".local") ||
        hostname.endsWith(".internal") ||
        hostname.endsWith(".test") ||
        hostname.endsWith(".invalid")
    ) {
        throw new TypeError(
            "Webhook URL must use HTTPS and a public hostname."
        );
    }

    return parsedUrl.toString();
}

function validateEvents(events) {
    if (
        !Array.isArray(events) ||
        events.length === 0 ||
        events.some((event) => !ALLOWED_EVENTS.includes(event)) ||
        new Set(events).size !== events.length
    ) {
        throw new TypeError(
            "Select one or more valid, unique webhook events."
        );
    }

    return events;
}

function validateActiveStatus(isActive) {
    if (typeof isActive !== "boolean") {
        throw new TypeError("isActive must be a boolean.");
    }

    return isActive;
}

const WEBHOOK_SELECT = `
    SELECT
        id,
        project_id,
        name,
        url,
        events,
        is_active,
        created_at,
        updated_at
    FROM webhooks
`;

export async function createWebhook({
    projectId,
    name,
    url,
    events
}) {
    const validProjectId = validateProjectId(projectId);
    const validName = validateName(name);
    const validUrl = validateWebhookUrl(url);
    const validEvents = validateEvents(events);

    // The plaintext secret is returned only once.
    const secret = randomBytes(32).toString("hex");
    const encryptedSecret = encryptWebhookSecret(secret);

    const result = await pool.query(
        `INSERT INTO webhooks (
            project_id,
            name,
            url,
            secret_encrypted,
            events
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
            id,
            project_id,
            name,
            url,
            events,
            is_active,
            created_at,
            updated_at`,
        [
            validProjectId,
            validName,
            validUrl,
            encryptedSecret,
            validEvents
        ]
    );

    return {
        webhook: result.rows[0],
        secret
    };
}

export async function listProjectWebhooks(projectId) {
    const validProjectId = validateProjectId(projectId);

    const result = await pool.query(
        `${WEBHOOK_SELECT}
         WHERE project_id = $1
         ORDER BY created_at DESC, id DESC`,
        [validProjectId]
    );

    return result.rows;
}

export async function getProjectWebhookById(
    projectId,
    webhookId
) {
    const validProjectId = validateProjectId(projectId);
    const validWebhookId = validateWebhookId(webhookId);

    const result = await pool.query(
        `${WEBHOOK_SELECT}
         WHERE project_id = $1
           AND id = $2
         LIMIT 1`,
        [validProjectId, validWebhookId]
    );

    return result.rows[0] ?? null;
}

export async function updateProjectWebhook(
    projectId,
    webhookId,
    updates
) {
    const validProjectId = validateProjectId(projectId);
    const validWebhookId = validateWebhookId(webhookId);

    if (
        !updates ||
        typeof updates !== "object" ||
        Array.isArray(updates)
    ) {
        throw new TypeError("Invalid webhook updates.");
    }

    const allowedFields = ["name", "url", "events", "isActive"];

    const suppliedFields = Object.keys(updates);

    if (
        suppliedFields.length === 0 ||
        suppliedFields.some(
            (field) => !allowedFields.includes(field)
        )
    ) {
        throw new TypeError("Invalid webhook update fields.");
    }

    const values = [validProjectId, validWebhookId];
    const assignments = [];

    if (Object.hasOwn(updates, "name")) {
        values.push(validateName(updates.name));
        assignments.push(`name = $${values.length}`);
    }

    if (Object.hasOwn(updates, "url")) {
        values.push(validateWebhookUrl(updates.url));
        assignments.push(`url = $${values.length}`);
    }

    if (Object.hasOwn(updates, "events")) {
        values.push(validateEvents(updates.events));
        assignments.push(`events = $${values.length}`);
    }

    if (Object.hasOwn(updates, "isActive")) {
        values.push(validateActiveStatus(updates.isActive));
        assignments.push(`is_active = $${values.length}`);
    }

    assignments.push("updated_at = NOW()");

    const result = await pool.query(
        `UPDATE webhooks
         SET ${assignments.join(", ")}
         WHERE project_id = $1
           AND id = $2
         RETURNING
            id,
            project_id,
            name,
            url,
            events,
            is_active,
            created_at,
            updated_at`,
        values
    );

    return result.rows[0] ?? null;
}

export async function deleteProjectWebhook(
    projectId,
    webhookId
) {
    const validProjectId = validateProjectId(projectId);
    const validWebhookId = validateWebhookId(webhookId);

    const result = await pool.query(
        `DELETE FROM webhooks
         WHERE project_id = $1
           AND id = $2
         RETURNING id`,
        [validProjectId, validWebhookId]
    );

    return result.rowCount > 0;
}
