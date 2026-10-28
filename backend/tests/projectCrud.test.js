
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import request from "supertest";

import app from "../src/app.js";
import pool from "../src/config/database.js";

const projectsUrl = "/api/v1/projects";
const authUrl = "/api/v1/auth";

after(async () => {
  await pool.end();
});

test("project CRUD works for an authenticated owner", async () => {
  const uniqueId = randomUUID();
  const password = randomBytes(24).toString("base64url");

  const user = {
    name: "CRUD Test User",
    email: `keyflux.crud.${uniqueId}@example.com`,
    password
  };

  let projectId;

  try {
    // Register a dedicated test user.
    const registration = await request(app)
      .post(`${authUrl}/register`)
      .send(user);

    assert.equal(registration.status, 201);

    // Log in and obtain a JWT.
    const login = await request(app)
      .post(`${authUrl}/login`)
      .send({ email: user.email, password });

    assert.equal(login.status, 200);

    const token = login.body.data.token;
    assert.ok(token);

    const auth = { Authorization: `Bearer ${token}` };

    // Protected routes must reject requests without authentication.
    const unauthenticatedList = await request(app)
      .get(projectsUrl);

    assert.equal(unauthenticatedList.status, 401);

    const unauthenticatedCreate = await request(app)
      .post(projectsUrl)
      .send({ name: `Unauthenticated ${uniqueId}` });

    assert.equal(unauthenticatedCreate.status, 401);

    // Create a project.
    const created = await request(app)
      .post(projectsUrl)
      .set(auth)
      .send({
        name: `CRUD Test ${uniqueId}`,
        description: "Testing project CRUD operations"
      });

    assert.equal(created.status, 201);
    projectId = created.body.data.project.id;

    assert.ok(projectId);
    assert.equal(
      created.body.data.project.name,
      `CRUD Test ${uniqueId}`
    );

    // List projects and confirm the new project is present.
    const listed = await request(app)
      .get(projectsUrl)
      .set(auth);

    assert.equal(listed.status, 200);
    assert.ok(
      listed.body.data.projects.some(
        (project) => String(project.id) === String(projectId)
      )
    );

    // Read the project by ID.
    const fetched = await request(app)
      .get(`${projectsUrl}/${projectId}`)
      .set(auth);

    assert.equal(fetched.status, 200);
    assert.equal(
      String(fetched.body.data.project.id),
      String(projectId)
    );

    // Update the project.
    const updatedName = `Updated CRUD ${uniqueId}`;

    const updated = await request(app)
      .patch(`${projectsUrl}/${projectId}`)
      .set(auth)
      .send({ name: updatedName });

    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.project.name, updatedName);

    // Delete the project.
    const deleted = await request(app)
      .delete(`${projectsUrl}/${projectId}`)
      .set(auth);

    assert.equal(deleted.status, 200);

    // Verify the deleted project is no longer accessible.
    const afterDelete = await request(app)
      .get(`${projectsUrl}/${projectId}`)
      .set(auth);

    assert.equal(afterDelete.status, 404);

    // It has already been deleted successfully.
    projectId = undefined;

    console.log("PASS: Unauthenticated requests rejected");
    console.log("PASS: Project create, list, read, update, delete");
    console.log("PASS: Deleted project returns 404");
  } finally {
    // Only clean up the project created by this test.
    if (projectId !== undefined) {
      await pool.query(
        "DELETE FROM projects WHERE id = $1",
        [projectId]
      );
    }
  }
});
