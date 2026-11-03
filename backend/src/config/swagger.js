
import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.3",

    info: {
      title: "KeyFlux API",
      version: "1.0.0",
      description:
        "KeyFlux API Management SaaS - REST API documentation for authentication, projects, API keys, and analytics."
    },

    servers: [
      {
        url: "http://localhost:5000",
        description: "Local development server"
      }
    ],

    tags: [
      {
        name: "Health",
        description: "Backend health and integration status"
      },
      {
        name: "Authentication",
        description: "User registration, login, and profile"
      },
      {
        name: "Projects",
        description: "Project management operations"
      },
      {
        name: "API Keys",
        description: "API key creation, listing, and revocation"
      },
      {
        name: "Analytics",
        description: "API usage analytics and logs"
      },
      {
        name: "Protected",
        description: "API key protected endpoints"
      }
    ],

    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter your JWT token."
        },

        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
          description: "Enter your KeyFlux API key (kf_live_...)."
        }
      }
    }
  },

  apis: ["./src/routes/*.js", "./src/app.js"]
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
