
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../config/database.js";

const BCRYPT_ROUNDS = 12;
const TOKEN_EXPIRY = "1h";
const JWT_ISSUER = "keyflux-api";
const JWT_AUDIENCE = "keyflux-client";

// Validate and normalize an email address.
function validateEmail(email) {
  if (typeof email !== "string") {
    throw new TypeError("A valid email address is required.");
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (
    normalizedEmail.length > 255 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  ) {
    throw new TypeError("A valid email address is required.");
  }

  return normalizedEmail;
}

// Validate a user's display name.
function validateName(name) {
  if (typeof name !== "string" || !name.trim()) {
    throw new TypeError("Name is required.");
  }

  const normalizedName = name.trim();

  if (normalizedName.length > 100) {
    throw new TypeError("Name cannot exceed 100 characters.");
  }

  return normalizedName;
}

// bcrypt supports passwords up to 72 bytes.
function validatePassword(password) {
  if (
    typeof password !== "string" ||
    Buffer.byteLength(password, "utf8") < 12 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    throw new TypeError(
      "Password must be between 12 and 72 bytes."
    );
  }

  return password;
}

// Never issue tokens without a sufficiently long secret.
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (
    typeof secret !== "string" ||
    Buffer.byteLength(secret, "utf8") < 40
  ) {
    throw new Error("JWT_SECRET is missing or too short.");
  }

  return secret;
}

// Register a user and store only the password hash.
export async function registerUser({ name, email, password }) {
  const validName = validateName(name);
  const validEmail = validateEmail(email);
  const validPassword = validatePassword(password);

  const passwordHash = await bcrypt.hash(
    validPassword,
    BCRYPT_ROUNDS
  );

  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [validName, validEmail, passwordHash]
    );

    return result.rows[0];
  } catch (error) {
    // PostgreSQL unique-constraint violation.
    if (error.code === "23505") {
      const duplicateError = new Error(
        "An account with this email already exists."
      );

      duplicateError.code = "EMAIL_ALREADY_EXISTS";
      throw duplicateError;
    }

    throw error;
  }
}

// Verify credentials and issue a signed JWT.
export async function loginUser({ email, password }) {
  const validEmail = validateEmail(email);

  if (typeof password !== "string" || password.length === 0) {
    throw new TypeError("Email and password are required.");
  }

  const result = await pool.query(
    `SELECT id, name, email, password_hash
     FROM users
     WHERE email = $1`,
    [validEmail]
  );

  const user = result.rows[0];

  // Use a real dummy bcrypt hash for unknown email addresses.
  // This hash is generated from a fixed, non-user password.
  const dummyHash =
    "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6H6W4Q9Q3Q8YqQ7K5JQ5JQ5JQ5JQK";

  const hashToCompare = user?.password_hash ?? dummyHash;

  const passwordMatches = await bcrypt.compare(
    password,
    hashToCompare
  );

  if (!user || !passwordMatches) {
    const error = new Error("Invalid email or password.");
    error.code = "INVALID_CREDENTIALS";
    throw error;
  }

  const token = jwt.sign(
    { sub: String(user.id) },
    getJwtSecret(),
    {
      expiresIn: TOKEN_EXPIRY,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithm: "HS256"
    }
  );

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email
    },
    token,
    expiresIn: TOKEN_EXPIRY
  };
}

export async function getUserById(userId) {
  const result = await pool.query(
    `SELECT id, name, email, created_at
     FROM users
     WHERE id = $1`,
    [userId]
  );

  return result.rows[0] ?? null;
}