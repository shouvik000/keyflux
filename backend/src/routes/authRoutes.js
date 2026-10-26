import { userAuth } from "../middleware/userAuth.js";
import { getUserById } from "../services/authService.js";
import { Router } from "express";
import {
  registerUser,
  loginUser
} from "../services/authService.js";

const router = Router();

// POST /api/v1/auth/register
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

// POST /api/v1/auth/login
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



// GET /api/v1/auth/me
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
