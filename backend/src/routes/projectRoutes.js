
import { Router } from "express";
import { userAuth } from "../middleware/userAuth.js";
import {
  createProject,
  listProjects,
  getProjectById,
  updateProject,
  deleteProject
} from "../services/projectService.js";

const router = Router();

// All project endpoints require a valid user JWT.
router.use(userAuth);

function handleError(error, res, next) {
  if (error.code === "INVALID_INPUT") {
    return res.status(400).json({
      success: false,
      error: { code: error.code, message: error.message }
    });
  }

  if (error.code === "PROJECT_NAME_EXISTS") {
    return res.status(409).json({
      success: false,
      error: { code: error.code, message: error.message }
    });
  }

  return next(error);
}

// POST /api/v1/projects
router.post("/", async (req, res, next) => {
  try {
    const project = await createProject(req.user.id, req.body ?? {});

    return res.status(201).json({
      success: true,
      message: "Project created successfully.",
      data: { project }
    });
  } catch (error) {
    return handleError(error, res, next);
  }
});

// GET /api/v1/projects
router.get("/", async (req, res, next) => {
  try {
    const projects = await listProjects(req.user.id);

    return res.status(200).json({
      success: true,
      data: { projects }
    });
  } catch (error) {
    return next(error);
  }
});

// GET /api/v1/projects/:id
router.get("/:id", async (req, res, next) => {
  try {
    const project = await getProjectById(req.user.id, req.params.id);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: "PROJECT_NOT_FOUND",
          message: "Project not found."
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: { project }
    });
  } catch (error) {
    return handleError(error, res, next);
  }
});

// PATCH /api/v1/projects/:id
router.patch("/:id", async (req, res, next) => {
  try {
    const project = await updateProject(
      req.user.id,
      req.params.id,
      req.body
    );

    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: "PROJECT_NOT_FOUND",
          message: "Project not found."
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: "Project updated successfully.",
      data: { project }
    });
  } catch (error) {
    return handleError(error, res, next);
  }
});

// DELETE /api/v1/projects/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const deleted = await deleteProject(req.user.id, req.params.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: {
          code: "PROJECT_NOT_FOUND",
          message: "Project not found."
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: "Project deleted successfully."
    });
  } catch (error) {
    return handleError(error, res, next);
  }
});

export default router;
