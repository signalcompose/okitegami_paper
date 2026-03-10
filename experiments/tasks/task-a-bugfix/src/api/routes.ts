export interface RouteDefinition {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  handler: string;
  requiresAuth: boolean;
}

export const routes: RouteDefinition[] = [
  {
    path: "/api/health",
    method: "GET",
    handler: "healthCheck",
    requiresAuth: false,
  },
  {
    path: "/api/profile",
    method: "GET",
    handler: "getProfile",
    requiresAuth: true,
  },
  {
    path: "/api/data",
    method: "GET",
    handler: "getData",
    requiresAuth: true,
  },
  {
    path: "/api/data",
    method: "POST",
    handler: "createData",
    requiresAuth: true,
  },
];
