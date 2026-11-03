
import { userAuth } from "../middleware/userAuth.js";
import { getUserById } from "../services/authService.js";
import { Router } from "express";
import {
  registerUser,
  loginUser
} from "../services/authService.js";

const router = Router();

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Creates a new KeyFlux user account.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: SecurePassword123
 *     responses:
 *       201:
 *         description: Account created successfully.
 *       400:
 *         description: Invalid input.
 *       409:
 *         description: Email already exists.
 */
router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body ?? {};

    const user = await registerUser({
      name,
      email,
      password
    });

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      data: { user }
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_INPUT",
          message: error.message
        }
      });
    }

    if (error.code === "EMAIL_ALREADY_EXISTS") {
      return res.status(409).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }

    return next(error);
  }
});

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Login user
 *     description: Authenticates a user and returns authentication details.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: SecurePassword123
 *     responses:
 *       200:
 *         description: Login successful.
 *       400:
 *         description: Invalid input.
 *       401:
 *         description: Invalid credentials.
 */
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};

    const result = await loginUser({ email, password });

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      data: result
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_INPUT",
          message: error.message
        }
      });
    }

    if (error.code === "INVALID_CREDENTIALS") {
      return res.status(401).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }

    return next(error);
  }
});

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: Get current user
 *     description: Returns the profile of the authenticated user.
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully.
 *       401:
 *         description: Missing or invalid authentication token.
 *       404:
 *         description: User account not found.
 */
router.get("/me", userAuth, async (req, res, next) => {
  try {
    const user = await getUserById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: "USER_NOT_FOUND",
          message: "User account not found."
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: { user }
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
