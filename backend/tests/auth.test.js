import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";

import app from "../src/app.js";
import pool from "../src/config/database.js";

describe("Authentication API Tests", () => {
    const email = `auth-test-${randomUUID()}@keyflux.test`;
    const password = "KeyFlux_Test_Password_2026!";
    const name = "KeyFlux Test User";

    let registrationResponse;
    let loginResponse;
    let token;
    let user;

    before(async () => {
        registrationResponse = await request(app)
            .post("/api/v1/auth/register")
            .send({ name, email, password });

        assert.equal(
            registrationResponse.status,
            201,
            "Test user registration should succeed"
        );

        user = registrationResponse.body.data.user;

        loginResponse = await request(app)
            .post("/api/v1/auth/login")
            .send({ email, password });

        assert.equal(
            loginResponse.status,
            200,
            "Test user login should succeed"
        );

        token = loginResponse.body.data.token;
    });

    after(async () => {
        await pool.query(
            "DELETE FROM users WHERE email = $1",
            [email]
        );

        console.log("Temporary authentication test user cleaned up.");
    });

    it("should register a new user successfully", () => {
        assert.equal(registrationResponse.status, 201);
        assert.equal(registrationResponse.body.success, true);
        assert.equal(user.name, name);
        assert.equal(user.email, email);

        assert.equal(
            Object.hasOwn(user, "password_hash"),
            false
        );

        console.log("Registration: PASS");
    });

    it("should reject duplicate email registration", async () => {
        const response = await request(app)
            .post("/api/v1/auth/register")
            .send({ name, email, password });

        assert.equal(response.status, 409);
        assert.equal(response.body.success, false);
        assert.equal(
            response.body.error.code,
            "EMAIL_ALREADY_EXISTS"
        );

        console.log("Duplicate email rejection: PASS");
    });

    it("should login successfully and return a JWT", () => {
        assert.equal(loginResponse.status, 200);
        assert.equal(loginResponse.body.success, true);
        assert.equal(loginResponse.body.data.user.email, email);
        assert.equal(typeof token, "string");
        assert.ok(token.length > 0);

        console.log("Successful login and JWT generation: PASS");
    });

    it("should reject an incorrect password", async () => {
        const response = await request(app)
            .post("/api/v1/auth/login")
            .send({
                email,
                password: "Wrong_Password_2026!"
            });

        assert.equal(response.status, 401);
        assert.equal(response.body.success, false);
        assert.equal(
            response.body.error.code,
            "INVALID_CREDENTIALS"
        );

        console.log("Invalid password rejection: PASS");
    });

    it("should reject requests without an authentication token", async () => {
        const response = await request(app)
            .get("/api/v1/auth/me");

        assert.equal(response.status, 401);
        assert.equal(response.body.success, false);
        assert.equal(
            response.body.error.code,
            "AUTH_TOKEN_MISSING"
        );

        console.log("Missing JWT rejection: PASS");
    });

    it("should reject an invalid JWT", async () => {
        const response = await request(app)
            .get("/api/v1/auth/me")
            .set("Authorization", "Bearer invalid.jwt.token");

        assert.equal(response.status, 401);
        assert.equal(response.body.success, false);
        assert.equal(
            response.body.error.code,
            "AUTH_TOKEN_INVALID"
        );

        console.log("Invalid JWT rejection: PASS");
    });

    it("should return the authenticated user's profile", async () => {
        const response = await request(app)
            .get("/api/v1/auth/me")
            .set("Authorization", `Bearer ${token}`);

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);
        assert.equal(response.body.data.user.id, user.id);
        assert.equal(response.body.data.user.name, name);
        assert.equal(response.body.data.user.email, email);

        assert.equal(
            Object.hasOwn(response.body.data.user, "password_hash"),
            false
        );

        console.log("Authenticated user profile: PASS");
    });
});
