
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

/**
 * @swagger
 * /api/v1/projects:
 *   post:
 *     summary: Create a project
 *     description: Creates a new project for the authenticated user.
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 120
 *                 example: My SaaS Project
 *               description:
 *                 type: string
 *                 nullable: true
 *                 maxLength: 10000
 *                 example: Backend API management project.
 *     responses:
 *       201:
 *         description: Project created successfully.
 *       400:
 *         description: Invalid project input.
 *       401:
 *         description: Missing or invalid JWT.
 *       409:
 *         description: Project name already exists.
 */
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

/**
 * @swagger
 * /api/v1/projects:
 *   get:
 *     summary: List projects
 *     description: Returns all projects belonging to the authenticated user.
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Projects retrieved successfully.
 *       401:
 *         description: Missing or invalid JWT.
 */
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

/**
 * @swagger
 * /api/v1/projects/{id}:
 *   get:
 *     summary: Get project by ID
 *     description: Returns a project owned by the authenticated user.
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Project ID.
 *     responses:
 *       200:
 *         description: Project retrieved successfully.
 *       400:
 *         description: Invalid project ID.
 *       401:
 *         description: Missing or invalid JWT.
 *       404:
 *         description: Project not found.
 */
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

/**
 * @swagger
 * /api/v1/projects/{id}:
 *   patch:
 *     summary: Update project
 *     description: Updates the name and/or description of an existing project.
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Project ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             additionalProperties: false
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 120
 *                 example: Updated SaaS Project
 *               description:
 *                 type: string
 *                 nullable: true
 *                 maxLength: 10000
 *                 example: Updated project description.
 *     responses:
 *       200:
 *         description: Project updated successfully.
 *       400:
 *         description: Invalid input or project ID.
 *       401:
 *         description: Missing or invalid JWT.
 *       404:
 *         description: Project not found.
 *       409:
 *         description: Project name already exists.
 */
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

/**
 * @swagger
 * /api/v1/projects/{id}:
 *   delete:
 *     summary: Delete project
 *     description: Deletes a project owned by the authenticated user.
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Project ID.
 *     responses:
 *       200:
 *         description: Project deleted successfully.
 *       400:
 *         description: Invalid project ID.
 *       401:
 *         description: Missing or invalid JWT.
 *       404:
 *         description: Project not found.
 */
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
