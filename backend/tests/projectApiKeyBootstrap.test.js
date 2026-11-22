import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import request from "supertest";

import app from "../src/app.js";
import pool from "../src/config/database.js";

const authUrl = "/api/v1/auth";
const projectsUrl = "/api/v1/projects";

after(async () => {
  await pool.end();
});

test("project owner can create an API key using JWT authentication", async () => {
  const uniqueId = randomUUID();
  const password = randomBytes(24).toString("base64url");

  const user = {
    name: "Bootstrap Test User",
    email: `keyflux.bootstrap.${uniqueId}@example.com`,
    password
  };

  let projectId;

  try {
    const registration = await request(app)
      .post(`${authUrl}/register`)
      .send(user);

    assert.equal(registration.status, 201);

    const login = await request(app)
      .post(`${authUrl}/login`)
      .send({ email: user.email, password });

    assert.equal(login.status, 200);

    const token = login.body.data.token;
    assert.ok(token);

    const auth = {
      Authorization: `Bearer ${token}`
    };

    // Create a project.
    const projectResponse = await request(app)
      .post(projectsUrl)
      .set(auth)
      .send({
        name: `Bootstrap Project ${uniqueId}`,
        description: "Testing initial API key creation"
      });

    assert.equal(projectResponse.status, 201);

    projectId = projectResponse.body.data.project.id;
    assert.ok(projectId);

    // Create the first API key using the project owner's JWT.
    const keyResponse = await request(app)
      .post(`${projectsUrl}/${projectId}/keys`)
      .set(auth)
      .send({
        name: "Initial Bootstrap Key"
      });

    assert.equal(keyResponse.status, 201);
    assert.equal(keyResponse.body.success, true);

    assert.ok(keyResponse.body.data.key);
    assert.ok(keyResponse.body.data.apiKey.id);

    // The plaintext key must not be stored in the returned database record.
    assert.equal(
      keyResponse.body.data.apiKey.key_hash,
      undefined
    );

    // The endpoint must return the key only once.
    assert.match(
      keyResponse.body.data.key,
      /^kf_live_/
    );

    console.log("PASS: Project owner created initial API key using JWT");
    console.log("PASS: Plaintext API key returned with expected prefix");
    console.log("PASS: API key hash is not exposed");
  } finally {
    if (projectId !== undefined) {
      await pool.query(
        "DELETE FROM projects WHERE id = $1",
        [projectId]
      );
    }
  }
});

test("initial API key creation rejects requests without JWT authentication", async () => {
  const response = await request(app)
    .post(`${projectsUrl}/1/keys`)
    .send({
      name: "Unauthenticated Key"
    });

  assert.equal(response.status, 401);

  console.log("PASS: Initial API key creation requires JWT authentication");
});

test("users cannot create API keys for another user's project", async () => {
  const uniqueId = randomUUID();
  const password = randomBytes(24).toString("base64url");

  const user1 = {
    name: "Bootstrap Owner",
    email: `keyflux.bootstrap.owner.${uniqueId}@example.com`,
    password
  };

  const user2 = {
    name: "Bootstrap Other User",
    email: `keyflux.bootstrap.other.${uniqueId}@example.com`,
    password
  };

  let projectId;

  try {
    const register1 = await request(app)
      .post(`${authUrl}/register`)
      .send(user1);

    assert.equal(register1.status, 201);

    const register2 = await request(app)
      .post(`${authUrl}/register`)
      .send(user2);

    assert.equal(register2.status, 201);

    const login1 = await request(app)
      .post(`${authUrl}/login`)
      .send({ email: user1.email, password });

    assert.equal(login1.status, 200);

    const login2 = await request(app)
      .post(`${authUrl}/login`)
      .send({ email: user2.email, password });

    assert.equal(login2.status, 200);

    const token1 = login1.body.data.token;
    const token2 = login2.body.data.token;

    // User 1 creates a project.
    const projectResponse = await request(app)
      .post(projectsUrl)
      .set("Authorization", `Bearer ${token1}`)
      .send({
        name: `Bootstrap Ownership ${uniqueId}`,
        description: "Testing API key ownership"
      });

    assert.equal(projectResponse.status, 201);

    projectId = projectResponse.body.data.project.id;

    // User 2 attempts to create an API key for User 1's project.
    const keyResponse = await request(app)
      .post(`${projectsUrl}/${projectId}/keys`)
      .set("Authorization", `Bearer ${token2}`)
      .send({
        name: "Unauthorized Key"
      });

    assert.equal(keyResponse.status, 404);
    assert.equal(
      keyResponse.body.error.code,
      "PROJECT_NOT_FOUND"
    );

    console.log("PASS: Cross-user API key creation rejected");
  } finally {
    if (projectId !== undefined) {
      await pool.query(
        "DELETE FROM projects WHERE id = $1",
        [projectId]
      );
    }
  }
});

test("initial API key creation rejects invalid input", async () => {
  const uniqueId = randomUUID();
  const password = randomBytes(24).toString("base64url");

  const user = {
    name: "Bootstrap Validation User",
    email: `keyflux.bootstrap.validation.${uniqueId}@example.com`,
    password
  };

  let projectId;

  try {
    const registration = await request(app)
      .post(`${authUrl}/register`)
      .send(user);

    assert.equal(registration.status, 201);

    const login = await request(app)
      .post(`${authUrl}/login`)
      .send({ email: user.email, password });

    assert.equal(login.status, 200);

    const auth = {
      Authorization: `Bearer ${login.body.data.token}`
    };

    const projectResponse = await request(app)
      .post(projectsUrl)
      .set(auth)
      .send({
        name: `Bootstrap Validation ${uniqueId}`
      });

    assert.equal(projectResponse.status, 201);

    projectId = projectResponse.body.data.project.id;

    // An empty API key name must be rejected.
    const invalidResponse = await request(app)
      .post(`${projectsUrl}/${projectId}/keys`)
      .set(auth)
      .send({
        name: ""
      });

    assert.equal(invalidResponse.status, 400);
    assert.equal(
      invalidResponse.body.error.code,
      "INVALID_API_KEY_INPUT"
    );

    console.log("PASS: Invalid API key input rejected");
  } finally {
    if (projectId !== undefined) {
      await pool.query(
        "DELETE FROM projects WHERE id = $1",
        [projectId]
      );
    }
  }
});
