
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

test("users cannot access another user's project", async () => {
  const uniqueId = randomUUID();
  const password = randomBytes(24).toString("base64url");

  const user1 = {
    name: "Ownership Test User 1",
    email: `keyflux.owner1.${uniqueId}@example.com`,
    password
  };

  const user2 = {
    name: "Ownership Test User 2",
    email: `keyflux.owner2.${uniqueId}@example.com`,
    password
  };

  let projectId;

  try {
    // Register both users.
    const register1 = await request(app)
      .post(`${authUrl}/register`)
      .send(user1);

    assert.equal(register1.status, 201, "User 1 registration should succeed");

    const register2 = await request(app)
      .post(`${authUrl}/register`)
      .send(user2);

    assert.equal(register2.status, 201, "User 2 registration should succeed");

    // Log in as both users.
    const login1 = await request(app)
      .post(`${authUrl}/login`)
      .send({ email: user1.email, password });

    assert.equal(login1.status, 200, "User 1 login should succeed");
    assert.ok(login1.body.data.token, "User 1 should receive a token");

    const login2 = await request(app)
      .post(`${authUrl}/login`)
      .send({ email: user2.email, password });

    assert.equal(login2.status, 200, "User 2 login should succeed");
    assert.ok(login2.body.data.token, "User 2 should receive a token");

    const token1 = login1.body.data.token;
    const token2 = login2.body.data.token;

    // Create a project owned by User 1.
    const createResponse = await request(app)
      .post(projectsUrl)
      .set("Authorization", `Bearer ${token1}`)
      .send({
        name: `Ownership Test ${uniqueId}`,
        description: "Automated ownership isolation test"
      });

    assert.equal(createResponse.status, 201, "Project creation should succeed");

    projectId = createResponse.body.data.project.id;

    assert.ok(projectId, "Created project should have an ID");

    // User 2 must not be able to read the project.
    const getResponse = await request(app)
      .get(`${projectsUrl}/${projectId}`)
      .set("Authorization", `Bearer ${token2}`);

    assert.equal(getResponse.status, 404, "Cross-user GET should return 404");

    // User 2 must not be able to update the project.
    const patchResponse = await request(app)
      .patch(`${projectsUrl}/${projectId}`)
      .set("Authorization", `Bearer ${token2}`)
      .send({ name: "Unauthorized Update" });

    assert.equal(patchResponse.status, 404, "Cross-user PATCH should return 404");

    // User 2 must not be able to delete the project.
    const deleteResponse = await request(app)
      .delete(`${projectsUrl}/${projectId}`)
      .set("Authorization", `Bearer ${token2}`);

    assert.equal(deleteResponse.status, 404, "Cross-user DELETE should return 404");

    // User 1 should still be able to read the project.
    const ownerResponse = await request(app)
      .get(`${projectsUrl}/${projectId}`)
      .set("Authorization", `Bearer ${token1}`);

    assert.equal(ownerResponse.status, 200, "Owner should still access the project");
    assert.equal(
      String(ownerResponse.body.data.project.id),
      String(projectId),
      "Owner should receive the correct project"
    );

    console.log("PASS: Registration and login for both users");
    console.log("PASS: Cross-user GET, PATCH, and DELETE rejected");
    console.log("PASS: Project owner retains access");
  } finally {
    // Remove only the project created by this test.
    // If an assertion fails, this still attempts cleanup.
    if (projectId !== undefined) {
      await pool.query(
        "DELETE FROM projects WHERE id = $1",
        [projectId]
      );
    }
  }
});
