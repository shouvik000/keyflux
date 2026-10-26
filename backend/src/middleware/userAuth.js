
import jwt from "jsonwebtoken";

const JWT_ISSUER = "keyflux-api";
const JWT_AUDIENCE = "keyflux-client";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 40) {
    throw new Error("JWT_SECRET is missing or too short.");
  }

  return secret;
}

export function userAuth(req, res, next) {
  const authorization = req.get("authorization");

  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
    return res.status(401).json({
      success: false,
      error: {
        code: "AUTH_TOKEN_MISSING",
        message: "A valid Bearer token is required."
      }
    });
  }

  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  try {
    const payload = jwt.verify(token, getJwtSecret(), {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    });

    const userId = Number(payload.sub);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        error: {
          code: "AUTH_TOKEN_INVALID",
          message: "The authentication token is invalid."
        }
      });
    }

    req.user = { id: userId };
    return next();
  } catch (error) {
    if (
      error instanceof jwt.JsonWebTokenError ||
      error instanceof jwt.TokenExpiredError ||
      error instanceof jwt.NotBeforeError
    ) {
      return res.status(401).json({
        success: false,
        error: {
          code: "AUTH_TOKEN_INVALID",
          message: "The authentication token is invalid or expired."
        }
      });
    }

    return next(error);
  }
}
