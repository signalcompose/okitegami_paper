export interface AppConfig {
  jwtSecret: string;
  tokenTtlSeconds: number;
  port: number;
  environment: string;
}

export const config: AppConfig = {
  jwtSecret: "super-secret-key-for-jwt-signing",
  tokenTtlSeconds: 3600,
  port: 3000,
  environment: process.env.NODE_ENV ?? "development",
};
